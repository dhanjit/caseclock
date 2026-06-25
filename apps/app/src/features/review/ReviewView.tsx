import { useMemo } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { computeDeadlines } from "@/rules/engine";
import { diffDays, todayISO } from "@/rules/dates";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { CaseAggregate } from "@/domain/repository";
import { relativeDays } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { TopBar, btn } from "@/features/components/TopBar";

function bucket(firDate: string, today: string): string | null {
  const age = diffDays(today, firDate);
  if (age > 365) return ">1yr";
  if (age > 182) return ">6m";
  if (age > 90) return ">3m";
  return null;
}

export function ReviewView() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const today = todayISO();

  const groups = useMemo(() => {
    const score = (agg: CaseAggregate) => {
      const ds = computeDeadlines(agg.case, agg.persons, agg.hearings, DEFAULT_SETTINGS, today);
      let s = 0;
      if (ds.some((d) => d.ruleId === "review-overdue" && d.state === "overdue")) s += 4;
      if (ds.some((d) => d.ruleId === "untouched")) s += 2;
      if (ds.some((d) => d.severity === "statutory-critical" && (d.state === "overdue" || d.state === "window-open"))) s += 8;
      const b = bucket(agg.case.firDate, today);
      if (b === ">1yr") s += 3;
      else if (b === ">6m") s += 2;
      else if (b === ">3m") s += 1;
      return s;
    };
    const byStation = new Map<string, CaseAggregate[]>();
    for (const a of aggregates) {
      const k = a.case.policeStation || "Unassigned station";
      if (!byStation.has(k)) byStation.set(k, []);
      byStation.get(k)!.push(a);
    }
    for (const list of byStation.values()) list.sort((a, b) => score(b) - score(a));
    return [...byStation.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [aggregates, today]);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pb-16 pt-5">
      <TopBar
        title="Case review"
        subtitle="Crime-conference mode — by station, attention first"
        actions={<button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>Back</button>}
      />

      {aggregates.length === 0 ? (
        <p className="mt-10 text-center text-sm text-soft">No cases to review.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {groups.map(([station, list]) => (
            <Section key={station} title={station} hint={`${list.length} case${list.length > 1 ? "s" : ""}`}>
              <div className="space-y-1">
                {list.map((agg) => {
                  const c = agg.case;
                  const b = bucket(c.firDate, today);
                  const latest = [...agg.supervisionEntries].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0];
                  return (
                    <button
                      key={c.id}
                      onClick={() => go({ kind: "case", id: c.id })}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-3/50 px-3 py-2.5 text-left hover:bg-surface-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">
                          FIR {c.firNumber}
                          {c.uapaFlag ? <span className="ml-1.5 text-xs text-critical">UAPA</span> : null}
                        </p>
                        <p className="truncate text-xs text-ink-dim">
                          {latest?.lastActionText || latest?.noteText || c.status}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {b && <span className="rounded bg-statutory/15 px-1.5 py-0.5 text-xs text-statutory">{b}</span>}
                        <p className="mt-0.5 text-xs text-soft">
                          {c.nextReviewDate ? `review ${relativeDays(c.nextReviewDate, today)}` : `touched ${c.lastTouchedAt ? relativeDays(c.lastTouchedAt, today) : "—"}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
