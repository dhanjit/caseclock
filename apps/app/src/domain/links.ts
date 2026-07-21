/**
 * Interconnectivity map (V4-DELTA N4 / V6 preview) — the cross-case identifier
 * matcher. Auto-fed from every case's CDR/IPDR/IMEI registers: the moment the
 * same phone number or IMEI surfaces in two or more cases, that shared handset /
 * SIM is a lead. Matching is punctuation-tolerant (normNum). Pure derivation
 * over the in-memory aggregates — no schema, no raw CDR content.
 */

import type { CaseAggregate } from "./repository";
import { normNum } from "./search";

export interface LinkedCaseRef {
  caseId: string;
  firNumber: string;
  note: string; // which register carried it, e.g. "CDR L-0771/26"
}

export interface IdentifierLink {
  kind: "phone" | "imei";
  value: string; // display form (first occurrence wins)
  cases: LinkedCaseRef[];
}

interface CaseIdentifier {
  kind: "phone" | "imei";
  value: string;
  note: string;
}

/** Every identifier a case's comms registers carry (CDR/IPDR → phone; IMEI → imei). */
export function caseIdentifiers(agg: CaseAggregate): CaseIdentifier[] {
  const out: CaseIdentifier[] = [];
  for (const r of agg.commsRequests ?? []) {
    const kind = r.kind === "imei" ? "imei" : "phone";
    const tag = `${r.kind.toUpperCase()} ${r.ref.split("·")[0].trim()}`;
    for (const v of r.numbers ?? []) {
      const value = v.trim();
      if (value) out.push({ kind, value, note: tag });
    }
  }
  return out;
}

/**
 * All identifiers across the caseload, grouped by (kind, normNum value), each with
 * the distinct cases it appears in. Sorted: most-connected first, then by value.
 */
export function allIdentifierLinks(aggregates: CaseAggregate[]): IdentifierLink[] {
  const map = new Map<string, IdentifierLink>();
  for (const agg of aggregates) {
    for (const ident of caseIdentifiers(agg)) {
      const key = `${ident.kind}|${normNum(ident.value)}`;
      let link = map.get(key);
      if (!link) {
        link = { kind: ident.kind, value: ident.value, cases: [] };
        map.set(key, link);
      }
      if (!link.cases.some((c) => c.caseId === agg.case.id)) {
        link.cases.push({ caseId: agg.case.id, firNumber: agg.case.firNumber, note: ident.note });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.cases.length - a.cases.length || a.value.localeCompare(b.value),
  );
}

/** Only the identifiers appearing in TWO OR MORE cases — the leads (V6 crossCaseLinks). */
export function crossCaseLinks(aggregates: CaseAggregate[]): IdentifierLink[] {
  return allIdentifierLinks(aggregates).filter((l) => l.cases.length > 1);
}
