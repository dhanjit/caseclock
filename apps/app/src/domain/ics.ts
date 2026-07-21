/**
 * .ics calendar export (REQUIREMENTS §12) — a pure, dependency-free RFC-5545
 * generator. Turns the computed statutory/court deadlines + court hearings of a
 * case (or every live case) into all-day VEVENTs the officer can subscribe to in
 * any calendar app, fully offline.
 *
 * Design notes / RFC-5545 correctness invariants (each golden-tested in ics.test.ts):
 *   - One all-day VEVENT per computed `DeadlineEvent` (anchored on its `dueAt`) and
 *     one per `HearingRecord`. Each VEVENT carries two VALARMs (-P15D, -P1D by
 *     default, `ACTION:DISPLAY`).
 *   - DTSTART;VALUE=DATE is the all-day local calendar date; DTEND;VALUE=DATE is the
 *     NEXT day (RFC-5545 all-day end is exclusive). DTSTAMP is a UTC instant,
 *     injectable via opts.dtstamp so tests are deterministic.
 *   - UID = `caseId`-`ruleId|hearingId`-`key`@caseclock → stable + deterministic, so
 *     a re-export UPDATES the existing event rather than creating a duplicate.
 *   - Text escaping: backslash FIRST, then `,` `;` and newline; ':' / '@' are left
 *     untouched (legal in property values).
 *   - 75-OCTET line folding, UTF-8-safe (never splits a multibyte codepoint), CRLF +
 *     a single leading space on each continuation line.
 *   - Skips `dueAt === null` and the inert states done/na/extinguished/latent (mirrors
 *     rules/agenda.bucketFor). `buildAllCasesIcs` excludes closed cases unless
 *     opts.includeClosed.
 *
 * MUST thread `agg.evidence ?? []` and `agg.processRequests ?? []` into
 * `computeDeadlines` — the engine defaults them to `[]`, so the expert-report 2-day
 * and process-request events would silently drop otherwise.
 */

import { computeDeadlines } from "@/rules/engine";
import { addDays, type ISODate } from "@/rules/dates";
import type { CaseAggregate } from "@/domain/repository";
import type { DeadlineEvent, HearingRecord, Settings } from "@/domain/types";

export interface IcsOptions {
  /** UTC DTSTAMP instant (YYYYMMDDTHHMMSSZ). Injectable for deterministic tests. */
  dtstamp?: string;
  /** Override the PRODID (default '-//CaseClock//EN'). */
  prodId?: string;
  /** Include closed cases in the all-cases export (default: exclude, matches dashboard). */
  includeClosed?: boolean;
  /** Days-before alarm offsets (default [15, 1] → VALARM -P15D and -P1D). */
  alarmOffsets?: number[];
}

const DEFAULT_PRODID = "-//CaseClock//EN";
const DEFAULT_ALARMS = [15, 1];
const CRLF = "\r\n";
const UID_SUFFIX = "@caseclock";

/** Inert deadline states that never become calendar events (mirrors agenda.bucketFor). */
const SKIP_STATES = new Set(["done", "na", "extinguished", "latent"]);

/**
 * Does this computed deadline belong on a subscribed calendar? Mirrors
 * agenda.bucketFor exactly: drop inert states, drop null due dates, and drop
 * "soft" supervisory items (review-overdue / untouched) — those live in the
 * in-app "needs attention" lane, NOT the statutory deadline tiers, so they must
 * stay out of the officer's calendar too (kept in lock-step to avoid drift).
 */
function isCalendarable(d: DeadlineEvent): d is DeadlineEvent & { dueAt: ISODate } {
  if (d.dueAt === null) return false;
  if (SKIP_STATES.has(d.state)) return false;
  if (d.severity === "soft") return false;
  return true;
}

/**
 * Escape a value for an RFC-5545 TEXT property. Backslash MUST be escaped first so
 * the escapes we add for `,` `;` `\n` aren't themselves re-escaped. ':' and '@' are
 * legal in property values and are deliberately left as-is.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** YYYY-MM-DD → YYYYMMDD (RFC-5545 DATE value). */
export function toIcsDate(iso: ISODate): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/**
 * Fold a content line to <=75 OCTETS per RFC-5545 §3.1, UTF-8-safe: a multibyte
 * codepoint is never split across the fold boundary. Continuation lines are
 * prefixed with CRLF + a single space. Lines already <=75 octets are returned
 * unchanged.
 */
export function foldLine(line: string): string {
  const bytes = utf8Bytes(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  // First line gets a full 75-octet budget; continuation lines budget 74 (the
  // leading space they carry occupies one of the 75 octets).
  let chunk = "";
  let chunkBytes = 0;
  let first = true;

  for (const ch of line) {
    const w = utf8Bytes(ch).length;
    const limit = first ? 75 : 74;
    if (chunkBytes + w > limit) {
      out.push(chunk);
      chunk = ch;
      chunkBytes = w;
      first = false;
    } else {
      chunk += ch;
      chunkBytes += w;
    }
  }
  out.push(chunk);

  return out[0] + out.slice(1).map((c) => `${CRLF} ${c}`).join("");
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Deterministic, stable UID for a calendar event. */
export function eventUid(caseId: string, kind: string, key: string): string {
  // Collapse whitespace AND every RFC-5545 TEXT delimiter / escape char (, ; : \ @)
  // to a single dash so the UID stays one bare, escape-free token that round-trips
  // byte-identically across strict clients (Apple/Google) — the stable-UID dedup the
  // re-export design depends on. The suffix namespaces UIDs to CaseClock.
  const clean = (s: string) => s.replace(/[\s@,;:\\]+/g, "-");
  return `${clean(caseId)}-${clean(kind)}-${clean(key)}${UID_SUFFIX}`;
}

interface IcsEvent {
  uid: string;
  date: ISODate; // all-day DTSTART
  summary: string;
  description?: string;
}

function eventLines(ev: IcsEvent, dtstamp: string, alarms: number[]): string[] {
  const start = toIcsDate(ev.date);
  const end = toIcsDate(addDays(ev.date, 1)); // all-day DTEND is next-day exclusive
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeText(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  for (const off of alarms) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(ev.summary)}`,
      `TRIGGER:-P${off}D`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

/** The deadline events of a case that become calendar entries (skip rules applied). */
function deadlineEvents(agg: CaseAggregate, settings: Settings, today: ISODate): IcsEvent[] {
  const deadlines: DeadlineEvent[] = computeDeadlines(
    agg.case,
    agg.persons,
    agg.hearings,
    settings,
    today,
    agg.evidence ?? [],
    agg.processRequests ?? [],
    agg.commsRequests ?? [],
    agg.towerDumps ?? [],
    agg.chargesheets ?? [],
  );
  const out: IcsEvent[] = [];
  for (const d of deadlines) {
    if (!isCalendarable(d)) continue;
    out.push({
      // ruleId alone is not unique: a single rule can emit several events on the same
      // dueAt (e.g. two expert reports forwarded the same day, or per-accused s.479
      // rows). Fold the human `type` into the key so each event gets a stable, distinct
      // UID while a re-export of the SAME event still reuses it (idempotent update).
      uid: eventUid(d.caseId, d.ruleId, `${d.dueAt}-${d.type}`),
      date: d.dueAt,
      summary: `${agg.case.firNumber} — ${d.type}`,
      description: [d.lawRef, d.note].filter(Boolean).join(" — ") || undefined,
    });
  }
  return out;
}

/** The court hearings of a case as calendar entries. */
function hearingEvents(agg: CaseAggregate): IcsEvent[] {
  return agg.hearings.map((h: HearingRecord) => ({
    uid: eventUid(agg.case.id, h.id, "hearing"),
    date: h.hearingDate,
    summary: `${agg.case.firNumber} — Hearing (${h.purpose})${h.court ? ` · ${h.court}` : ""}`,
    description: h.forum ? `Forum: ${h.forum}` : undefined,
  }));
}

function caseEvents(agg: CaseAggregate, settings: Settings, today: ISODate): IcsEvent[] {
  return [...deadlineEvents(agg, settings, today), ...hearingEvents(agg)];
}

function wrap(events: IcsEvent[], dtstamp: string, prodId: string, alarms: number[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) lines.push(...eventLines(ev, dtstamp, alarms));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

function resolve(opts?: IcsOptions): { dtstamp: string; prodId: string; alarms: number[] } {
  return {
    dtstamp: opts?.dtstamp ?? defaultDtstamp(),
    prodId: opts?.prodId ?? DEFAULT_PRODID,
    alarms: opts?.alarmOffsets ?? DEFAULT_ALARMS,
  };
}

function defaultDtstamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

/** Build a single-case .ics (all deadlines + hearings for the case). */
export function buildCaseIcs(
  agg: CaseAggregate,
  settings: Settings,
  today: ISODate,
  opts?: IcsOptions,
): string {
  const { dtstamp, prodId, alarms } = resolve(opts);
  return wrap(caseEvents(agg, settings, today), dtstamp, prodId, alarms);
}

/** Build an all-cases .ics. Excludes closed cases unless opts.includeClosed. */
export function buildAllCasesIcs(
  aggregates: CaseAggregate[],
  settings: Settings,
  today: ISODate,
  opts?: IcsOptions,
): string {
  const { dtstamp, prodId, alarms } = resolve(opts);
  const events: IcsEvent[] = [];
  for (const agg of aggregates) {
    if (agg.case.status === "closed" && !opts?.includeClosed) continue;
    events.push(...caseEvents(agg, settings, today));
  }
  return wrap(events, dtstamp, prodId, alarms);
}
