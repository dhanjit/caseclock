/**
 * Agenda projection (PLAN §8.2, M6) — the in-app "system of record".
 *
 * Pure: turns the stored cases into Overdue / Today / Upcoming buckets by
 * running the rules engine and bucketing each deadline against `today` + its
 * lead offsets. Recomputed on every app open; OS notifications (M8) are a
 * separate best-effort projection of the same data.
 */

import { computeDeadlines } from "./engine";
import { diffDays, type ISODate } from "./dates";
import { caseLabel } from "@/lib/format";
import type { CaseAggregate } from "@/domain/repository";
import type { DeadlineEvent, Settings, Severity } from "@/domain/types";

export type AgendaBucket = "overdue" | "today" | "upcoming";

export interface AgendaItem {
  caseId: string;
  caseLabel: string;
  deadline: DeadlineEvent;
  bucket: AgendaBucket;
  daysUntil: number | null;
  priority: boolean; // the case is user-flagged priority (§1)
  // Non-priority cases still compute their deadlines but alert SILENTLY (§1): their
  // overdue items are flagged so the dashboard keeps them out of the loud RED tier.
  silent: boolean;
}

export interface Agenda {
  overdue: AgendaItem[];
  today: AgendaItem[];
  upcoming: AgendaItem[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  "statutory-critical": 0,
  statutory: 1,
  "statutory-condonable": 2,
  court: 3,
  directory: 4,
  soft: 5,
};

function label(agg: CaseAggregate): string {
  return caseLabel(agg.case);
}

function bucketFor(d: DeadlineEvent, today: ISODate, horizon: number): AgendaBucket | null {
  if (d.state === "done" || d.state === "na" || d.state === "extinguished" || d.state === "latent") {
    return null;
  }
  // Soft supervisory items (untouched / review-overdue) belong to "Cases needing
  // attention", NOT the red statutory Overdue tier which must mean legal consequence.
  if (d.severity === "soft") return null;
  if (d.state === "overdue" || d.state === "window-open") return "overdue";
  if (!d.dueAt) return null;
  const daysUntil = diffDays(d.dueAt, today);
  if (daysUntil <= 0) return "today";
  if (d.leadOffsets.includes(daysUntil)) return "today";
  if (daysUntil <= horizon) return "upcoming";
  return null;
}

export function buildAgenda(
  aggregates: CaseAggregate[],
  settings: Settings,
  today: ISODate,
  horizon = 30,
): Agenda {
  const items: AgendaItem[] = [];
  for (const agg of aggregates) {
    if (agg.case.status === "closed") continue; // closed cases don't generate agenda items
    const priority = agg.case.priority === true;
    const deadlines = computeDeadlines(
      agg.case,
      agg.persons,
      agg.hearings,
      settings,
      today,
      agg.evidence ?? [],
      agg.processRequests ?? [],
    );
    for (const d of deadlines) {
      const bucket = bucketFor(d, today, horizon);
      if (!bucket) continue;
      items.push({
        caseId: agg.case.id,
        caseLabel: label(agg),
        deadline: d,
        bucket,
        daysUntil: d.dueAt ? diffDays(d.dueAt, today) : null,
        priority,
        // Lighter cases still surface, but their overdue items alert silently — the
        // dashboard shows them in a muted "monitoring" lane, not the red Overdue tier.
        silent: !priority && bucket === "overdue",
      });
    }
  }

  const bySeverityThenDate = (a: AgendaItem, b: AgendaItem) => {
    const s = SEVERITY_RANK[a.deadline.severity] - SEVERITY_RANK[b.deadline.severity];
    if (s !== 0) return s;
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  };
  const byDate = (a: AgendaItem, b: AgendaItem) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0);

  return {
    overdue: items.filter((i) => i.bucket === "overdue").sort(bySeverityThenDate),
    today: items.filter((i) => i.bucket === "today").sort(bySeverityThenDate),
    upcoming: items.filter((i) => i.bucket === "upcoming").sort(byDate),
  };
}

export interface AttentionFlag {
  caseId: string;
  caseLabel: string;
  reasons: string[];
}

/** "Cases needing attention" — stale / review-passed / heavy-clock-soon (PLAN §10.1). */
export function casesNeedingAttention(
  aggregates: CaseAggregate[],
  settings: Settings,
  today: ISODate,
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  for (const agg of aggregates) {
    if (agg.case.status === "closed") continue;
    const deadlines = computeDeadlines(
      agg.case,
      agg.persons,
      agg.hearings,
      settings,
      today,
      agg.evidence ?? [],
      agg.processRequests ?? [],
    );
    const reasons: string[] = [];
    if (deadlines.some((d) => d.ruleId === "untouched")) reasons.push("untouched");
    if (deadlines.some((d) => d.ruleId === "review-overdue" && d.state === "overdue")) reasons.push("review overdue");
    if (
      deadlines.some(
        (d) =>
          d.severity === "statutory-critical" &&
          (d.state === "overdue" ||
            d.state === "window-open" ||
            (d.dueAt && diffDays(d.dueAt, today) >= 0 && diffDays(d.dueAt, today) <= 7)),
      )
    ) {
      reasons.push("heavy clock <7d");
    }
    if (reasons.length) flags.push({ caseId: agg.case.id, caseLabel: label(agg), reasons });
  }
  return flags;
}

export interface QuickStats {
  live: number;
  uapa: number;
  inCustody: number;
  m3: number;
  m6: number;
  m12: number;
}

export function quickStats(aggregates: CaseAggregate[], today: ISODate): QuickStats {
  let live = 0,
    uapa = 0,
    inCustody = 0,
    m3 = 0,
    m6 = 0,
    m12 = 0;
  for (const { case: c } of aggregates) {
    if (c.status === "closed") continue; // stats reflect LIVE supervised load only
    live++;
    if (c.uapaFlag) uapa++;
    if (c.custodyStatus === "in_custody") inCustody++;
    const ageDays = diffDays(today, c.firDate);
    if (ageDays > 365) m12++;
    else if (ageDays > 182) m6++;
    else if (ageDays > 90) m3++;
  }
  return { live, uapa, inCustody, m3, m6, m12 };
}
