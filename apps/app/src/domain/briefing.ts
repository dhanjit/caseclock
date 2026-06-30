/**
 * Briefing-note generator (REQUIREMENTS §8). Pure: turns a CaseAggregate into a
 * print-ready briefing — a header block + the officer's 13 fixed headings in their
 * exact CaseFile.tsx order. The screen (CaseFile.tsx) and this printed note reuse the
 * SAME pure rollups (custodySummary / accusedNotices / expertReportOverdue), so the
 * two can never drift. No React, no DOM, no I/O — deterministic given (agg, today).
 */

import type { CaseAggregate } from "./repository";
import {
  custodyLimits,
  custodyCaseTypeOf,
  CUSTODY_CASE_TYPE_LABEL,
  type CaseRecord,
} from "./types";
import { accusedStatusMeta } from "./accused";
import { custodySummary, accusedNotices } from "./case-rollups";
import { expertReportOverdue } from "./evidence";
import { caseLabel, fmtDate } from "@/lib/format";
import { addDays, type ISODate } from "@/rules/dates";

export interface BriefingHeader {
  caseLabel: string;
  firNumber: string;
  identity: string;
  firDate: string; // display form (fmtDate)
  uapa: boolean;
  defaultBailLine: string;
}

export interface BriefingHeading {
  n: number;
  title: string;
  lines: string[];
}

export interface BriefingNote {
  header: BriefingHeader;
  headings: BriefingHeading[];
}

const DASH = "—";

/** The header's default-bail line — derived from custodyLimits + the arrest/first-remand
 * anchors, mirroring the engine's fr1-chargesheet note so the printed brief reads the same
 * as the on-screen clock. Falls back gracefully when no arrest anchor is recorded. */
function defaultBailLine(c: CaseRecord): string {
  const lim = custodyLimits(c);
  const typeLabel = CUSTODY_CASE_TYPE_LABEL[custodyCaseTypeOf(c)];
  if (c.chargesheetFiledDate) {
    return `Chargesheet / FR filed ${fmtDate(c.chargesheetFiledDate)} — default-bail window closed. Track: ${typeLabel}.`;
  }
  if (!c.arrestDate) {
    return `Default bail: no arrest date recorded — clock not started. Track: ${typeLabel} (${lim.statutory}d statutory).`;
  }
  const buffered = addDays(c.arrestDate, lim.buffered);
  const statutoryAnchor = c.firstRemandDate ?? c.arrestDate;
  const statutory = addDays(statutoryAnchor, lim.statutory);
  const anchorLabel = c.firstRemandDate ? "first remand" : "arrest";
  const note = `Default bail: buffered target ${fmtDate(buffered)} (${lim.buffered}d from arrest) · statutory ${fmtDate(statutory)} (${lim.statutory}d from ${anchorLabel}) — miss = default bail. Track: ${typeLabel}.`;
  return lim.statutoryNote ? `${note} ${lim.statutoryNote}` : note;
}

/** Heading 9 (Evidences collected) rollup — mirrors the CaseFile summary line + the
 * expert-report-overdue badge count, plus one line per evidence item for the printout. */
function evidenceLines(agg: CaseAggregate, today: ISODate): string[] {
  const ev = agg.evidence ?? [];
  if (ev.length === 0) return [DASH];
  const witnesses = ev.reduce((n, e) => n + (e.witnesses ?? 0), 0);
  const received = ev.filter((e) => e.status === "received").length;
  const overdue = ev.filter((e) => expertReportOverdue(e, today)).length;
  const summary =
    `${ev.length} item(s) · ${received} received · ${witnesses} witness(es)` +
    (overdue > 0 ? ` · ${overdue} expert report(s) overdue` : "");
  const items = ev.map((e) => {
    const bits: string[] = [e.description];
    if (e.reportToObtain) bits.push(`→ ${e.reportToObtain}`);
    if (e.witnesses != null) bits.push(`${e.witnesses} witness(es)`);
    bits.push(e.status);
    if (expertReportOverdue(e, today)) bits.push("REPORT OVERDUE");
    return bits.join(" · ");
  });
  return [summary, ...items];
}

/** Heading 11 (Court matters) rollup — one line per hearing. */
function courtMatterLines(agg: CaseAggregate): string[] {
  if (agg.hearings.length === 0) return [DASH];
  return agg.hearings.map((h) => `${fmtDate(h.hearingDate)} — ${h.purpose}${h.court ? ` · ${h.court}` : ""}`);
}

/** Heading 12 (accused incl. LOC/Interpol + custody history) rollup. */
function accusedLines(agg: CaseAggregate): string[] {
  const accused = agg.persons.filter((p) => p.role === "accused");
  if (accused.length === 0) return [DASH];
  const requests = agg.processRequests ?? [];
  return accused.map((p) => {
    const bits: string[] = [p.name];
    if (p.accusedStatus) bits.push(accusedStatusMeta(p.accusedStatus).label);
    const custody = custodySummary(p);
    if (custody) bits.push(`Custody: ${custody}`);
    const notices = accusedNotices(p, requests);
    if (notices) bits.push(`LOC / Interpol: ${notices}`);
    return bits.join(" · ");
  });
}

/** A free-text heading → either its (possibly multi-line) value, or a single em-dash. */
function textLines(v: string | null | undefined): string[] {
  return v && v.trim() ? [v] : [DASH];
}

export function buildBriefing(agg: CaseAggregate, today: ISODate): BriefingNote {
  const c = agg.case;
  const accused = agg.persons.filter((p) => p.role === "accused");

  const header: BriefingHeader = {
    caseLabel: caseLabel(c),
    firNumber: c.firNumber,
    identity: c.identity?.trim() || DASH,
    firDate: fmtDate(c.firDate),
    uapa: !!c.uapaFlag,
    defaultBailLine: defaultBailLine(c),
  };

  // EXACTLY the 13 CaseFile.tsx headings, in order, with byte-identical titles.
  const headings: BriefingHeading[] = [
    { n: 1, title: "Case number", lines: textLines(c.firNumber) },
    { n: 2, title: "Identity of the case", lines: textLines(c.identity) },
    { n: 3, title: "Sections of law", lines: textLines(c.sectionsOfLaw) },
    { n: 4, title: "Date of occurrence", lines: [c.occurrenceDate ? fmtDate(c.occurrenceDate) : DASH] },
    { n: 5, title: "Date of registration", lines: [fmtDate(c.firDate)] },
    { n: 6, title: "Brief of the case", lines: textLines(c.brief) },
    { n: 7, title: "Number of accused", lines: [String(accused.length)] },
    { n: 8, title: "Progress of investigation", lines: textLines(c.investigationProgress) },
    { n: 9, title: "Evidences collected", lines: evidenceLines(agg, today) },
    { n: 10, title: "Status of trial", lines: textLines(c.trialStatus) },
    { n: 11, title: "Court matters", lines: courtMatterLines(agg) },
    {
      n: 12,
      title: "List of accused with status (incl. LOC / Interpol + custody history)",
      lines: accusedLines(agg),
    },
    { n: 13, title: "Plan of action", lines: textLines(c.planOfAction) },
  ];

  return { header, headings };
}
