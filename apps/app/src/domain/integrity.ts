/**
 * Integrity checks — "silence is not safety" (V4-DELTA §2 / the officer's V6
 * preview). The rules engine can only warn about dates it HAS; these checks make
 * MISSING data loud:
 *
 *   NEXT DATE?        a hearing date passed with no disposal and no next date
 *   CLOCK NOT RUNNING an anchor gap — a clock that should be ticking, can't
 *   DORMANT           handled by the engine's `untouched` rule (surfaced together)
 *
 * Pure functions over the aggregate; the dashboard + case file render the output.
 */

import type { CaseAggregate } from "./repository";
import { chargesheetFiled } from "./repository";
import type { HearingRecord } from "./types";
import { uapaSectionWithoutFlag } from "./types";
import { diffDays, type ISODate } from "@/rules/dates";

export interface IntegrityGap {
  kind: "next-date" | "clock-not-running";
  caseId: string;
  text: string;
  /** For next-date gaps: the lapsed hearing (UI offers "enter next date"). */
  hearingId?: string;
}

/** Past, undisposed hearings — each one is a "NEXT DATE?" prompt (V6 rollover). */
export function lapsedHearings(hearings: HearingRecord[], today: ISODate): HearingRecord[] {
  return hearings.filter((h) => !h.disposed && diffDays(today, h.hearingDate) > 0);
}

const IN_CUSTODY_STATUSES = new Set(["police_custody", "judicial_custody", "charge_sheeted"]);
const TRIAL_PHASE = new Set(["committal", "charge_framed", "trial", "judgment", "appeal"]);

/** Anchor gaps — data whose absence silently stops a statutory clock (V6 anchorGaps). */
export function anchorGaps(agg: CaseAggregate, today: ISODate): IntegrityGap[] {
  const { case: c, persons, hearings } = agg;
  const gaps: IntegrityGap[] = [];
  const gap = (text: string) => gaps.push({ kind: "clock-not-running", caseId: c.id, text });

  if (!c.firDate) gap("No date of registration — the PR clock cannot start.");

  for (const p of persons) {
    if (p.role !== "accused") continue;
    if (p.accusedStatus && IN_CUSTODY_STATUSES.has(p.accusedStatus) && !p.arrestDate) {
      gap(`${p.name}: in custody / charge-sheeted but no arrest date — FR & custody clocks not running.`);
    }
    if (p.accusedStatus === "convicted" && !p.sentenceDate && !p.appealBy) {
      gap(`${p.name}: convicted but no sentence date — the appeal window cannot be computed.`);
    }
  }

  if (TRIAL_PHASE.has(c.status)) {
    const hasFuture = hearings.some((h) => !h.disposed && diffDays(today, h.hearingDate) <= 0);
    if (!hasFuture) gap("Case is at trial/appeal stage but no future hearing date is entered.");
  }

  if (uapaSectionWithoutFlag(c)) {
    gap("Sections cite UA(P)A but the UAPA flag is off — the case is on the 60/45 track, under-warning on default bail.");
  }

  if (chargesheetFiled(agg) && c.uapaFlag && (c.sanctions ?? []).length === 0 && !c.mhaSanctionDate && !c.rule4SanctionDate) {
    gap("Chargesheet on file in a UAPA case with no sanction recorded — verify prosecution sanction (s.45).");
  }

  return gaps;
}

/** All integrity gaps for one case: NEXT DATE? rows first, then anchor gaps. */
export function integrityGaps(agg: CaseAggregate, today: ISODate): IntegrityGap[] {
  const lapsed = lapsedHearings(agg.hearings, today).map<IntegrityGap>((h) => ({
    kind: "next-date",
    caseId: agg.case.id,
    hearingId: h.id,
    text: `${h.court ?? "Court"} — ${h.purpose} on ${h.hearingDate} has passed. Enter the next date or dispose it.`,
  }));
  return [...lapsed, ...anchorGaps(agg, today)];
}
