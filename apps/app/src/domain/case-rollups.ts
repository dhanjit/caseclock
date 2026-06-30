/**
 * Pure heading-12 rollups (REQUIREMENTS §3 / §6). Lifted out of CaseFile.tsx so the
 * briefing builder and the screen share one source of truth and never drift.
 */

import { fmtDate } from "@/lib/format";
import { processRequestLabel, type PersonRecord, type ProcessRequestRecord } from "./types";

const CUSTODY_KIND_LABEL: Record<string, string> = { police: "PC", judicial: "JC", other: "custody" };

/** Heading 12 (§3) — compact previous-custody summary from PersonRecord.custodyHistory. */
export function custodySummary(p: PersonRecord): string {
  return (p.custodyHistory ?? [])
    .map((h) => {
      const kind = CUSTODY_KIND_LABEL[h.kind ?? "other"] ?? "custody";
      if (h.from && h.to) return `${kind} ${fmtDate(h.from)}–${fmtDate(h.to)}`;
      if (h.from) return `${kind} since ${fmtDate(h.from)}`;
      return kind;
    })
    .join(" · ");
}

/** Heading 12 — the per-accused LOC/Interpol view, merged from BOTH sources so nothing
 * is orphaned: the §6 Process & Requests tracker (Decision #1: authoritative) AND the
 * per-accused LocNotice field still editable in AccusedPanel. */
export function accusedNotices(p: PersonRecord, requests: ProcessRequestRecord[]): string {
  const fromTracker = requests
    .filter((r) => r.accusedIds.includes(p.id) && (r.type === "LOC" || r.type === "interpol_red" || r.type === "interpol_blue"))
    .map((r) => `${processRequestLabel(r)}${r.refNo ? ` (${r.refNo})` : ""}`);
  const fromLoc = (p.loc ?? []).map((l) => `${l.type}${l.ref ? ` (${l.ref})` : ""}`);
  return [...fromTracker, ...fromLoc].join(" · ");
}
