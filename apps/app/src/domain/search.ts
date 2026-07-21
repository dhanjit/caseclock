/**
 * In-app global search (REQUIREMENTS §9). A PURE, read-only matcher over the
 * in-memory CaseAggregates (~30 cases → a linear scan, no index/table/migration).
 *
 * STRUCTURED FIELDS ONLY (the load-bearing §9 guarantee): case/FIR number,
 * identity, sections of law, accused names, dates, court matters, letter/reference
 * numbers (§6 ProcessRequest.refNo + per-accused LocNotice.ref), and banned-org /
 * watchlist names. It NEVER does free-text search of the brief / progress / plan
 * (and never peers inside imported document contents — those are §7's domain).
 *
 * The single exception is the banned-org field: §9 lists "banned-org name" as a
 * search field, and the only place ULFA-I (a watchlisted name) appears in the
 * acceptance fixtures is the brief. So for the CLOSED VOCABULARY of watchlist
 * names — and only those — we detect occurrences across the case's full text
 * (mirroring how <Highlighted> already RED-flags them everywhere, §5). A random
 * token in the brief is still unfindable; a known banned-org name is findable.
 */

import type { CaseAggregate } from "@/domain/repository";
import { caseLabel, fmtDate } from "@/lib/format";

export type SearchField =
  | "firNumber"
  | "identity"
  | "section"
  | "accused"
  | "date"
  | "court"
  | "request"
  | "watchlist";

export interface SearchHit {
  caseId: string;
  caseLabel: string;
  field: SearchField;
  /** The matched value, shown in the result row (wrapped in <Highlighted>). */
  snippet: string;
  /** The user's query (for emphasis in the UI). */
  matchedText: string;
  score: number;
}

/** Field-class weight — exact/important fields rank above incidental ones. */
const FIELD_WEIGHT: Record<SearchField, number> = {
  watchlist: 120, // banned-org / terrorist — always surfaced first (RED)
  firNumber: 100,
  request: 92,
  accused: 88,
  identity: 70,
  section: 64,
  court: 58,
  date: 40,
};

function norm(s: string): string {
  return s.normalize("NFC").toLowerCase().trim();
}

/** Punctuation-tolerant number form (V4-DELTA N18 / V6 `normNum`): lowercase with
 * spaces, dashes and parens stripped — so "98640-11235" matches "9864011235" and
 * "FIR 112/2024" matches "112/2024" typed without spacing. */
export function normNum(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s\-()]/g, "");
}

/** -1 = no match; otherwise a positional bonus: full value (30) > prefix (15) > substring (0). */
function positionalOne(valueNorm: string, qNorm: string): number {
  if (!qNorm || !valueNorm.includes(qNorm)) return -1;
  if (valueNorm === qNorm) return 30;
  if (valueNorm.startsWith(qNorm)) return 15;
  return 0;
}

/** Text match OR (for queries ≥3 chars in number form) punctuation-tolerant match. */
function positional(value: string, qNorm: string, qNum: string): number {
  const text = positionalOne(norm(value), qNorm);
  const num = qNum.length >= 3 ? positionalOne(normNum(value), qNum) : -1;
  return Math.max(text, num);
}

export function searchCases(
  aggregates: CaseAggregate[],
  query: string,
  watchlistNames: string[] = [],
): SearchHit[] {
  const qNorm = norm(query);
  if (!qNorm) return [];
  const qNum = normNum(query);

  const hits: SearchHit[] = [];

  // Newest-first input (repo lists ORDER BY updated_at DESC). Recency is NOT folded
  // into the score (a numeric nudge can cross a field-class gap at large N); instead
  // score = FIELD_WEIGHT + positional, and the final STABLE sort preserves this
  // newest-first push order for equal scores — recency as a pure, gap-proof tiebreak.
  for (const agg of aggregates) {
    const c = agg.case;
    const label = caseLabel(c);
    const accused = agg.persons.filter((p) => p.role === "accused");

    // Best hit per field within this case (avoids flooding one case's row list).
    const best = new Map<SearchField, SearchHit>();
    const consider = (field: SearchField, value: string | null | undefined, snippet?: string) => {
      if (!value) return;
      const pos = positional(value, qNorm, qNum);
      if (pos < 0) return;
      const score = FIELD_WEIGHT[field] + pos;
      const prev = best.get(field);
      if (!prev || score > prev.score) {
        best.set(field, { caseId: c.id, caseLabel: label, field, snippet: snippet ?? value, matchedText: query, score });
      }
    };

    // Case number (incl. the V7 H1.1 original FIR), identity, sections of law.
    consider("firNumber", c.firNumber);
    consider("firNumber", c.originalFir);
    consider("identity", c.identity);
    consider("section", c.sectionsOfLaw);

    // Accused names (role === 'accused').
    for (const p of accused) consider("accused", p.name);

    // Dates — match raw ISO AND the display form; show the display form.
    const dateValues: (string | null | undefined)[] = [
      c.firDate,
      c.occurrenceDate,
      ...agg.hearings.map((h) => h.hearingDate),
    ];
    for (const iso of dateValues) {
      if (!iso) continue;
      const disp = fmtDate(iso);
      const pos = Math.max(positional(iso, qNorm, qNum), positional(disp, qNorm, qNum));
      if (pos < 0) continue;
      const score = FIELD_WEIGHT.date + pos;
      const prev = best.get("date");
      if (!prev || score > prev.score) {
        best.set("date", { caseId: c.id, caseLabel: label, field: "date", snippet: disp, matchedText: query, score });
      }
    }

    // Court matters — court name + hearing purpose.
    for (const h of agg.hearings) {
      consider("court", h.court);
      consider("court", h.purpose, h.court ? `${h.purpose} · ${h.court}` : h.purpose);
    }

    // Letter / reference numbers — §6 ProcessRequest.refNo + per-accused LocNotice.ref.
    for (const r of agg.processRequests ?? []) consider("request", r.refNo);
    for (const p of accused) {
      for (const l of p.loc ?? []) consider("request", l.ref, l.ref ? `${l.type} ${l.ref}` : undefined);
    }

    // Comms identifiers (T3 / V6): phone numbers & IMEIs from the CDR/IPDR/IMEI
    // registers — punctuation-tolerant via normNum, so "7002944810" finds
    // "70029-44810". Letter refs too.
    for (const r of agg.commsRequests ?? []) {
      consider("request", r.ref, `${r.kind.toUpperCase()} ${r.ref}`);
      for (const v of r.numbers ?? []) consider("request", v, `${r.kind.toUpperCase()} ${v} · ${r.ref}`);
    }

    // Banned-org / watchlist — closed vocabulary detected across the case's full text.
    if (watchlistNames.length) {
      const corpus = [
        c.identity,
        c.sectionsOfLaw,
        c.brief,
        c.investigationProgress,
        c.trialStatus,
        c.planOfAction,
        ...accused.map((p) => p.name),
        ...agg.hearings.map((h) => h.court),
      ]
        .filter(Boolean)
        .map((s) => norm(s as string));
      for (const wl of watchlistNames) {
        const wlNorm = norm(wl);
        if (!corpus.some((blob) => blob.includes(wlNorm))) continue; // present in this case?
        const pos = positional(wl, qNorm, qNum); // does the query match the banned-org name?
        if (pos < 0) continue;
        const score = FIELD_WEIGHT.watchlist + pos;
        const prev = best.get("watchlist");
        if (!prev || score > prev.score) {
          best.set("watchlist", { caseId: c.id, caseLabel: label, field: "watchlist", snippet: wl, matchedText: query, score });
        }
      }
    }

    for (const hit of best.values()) hits.push(hit);
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}
