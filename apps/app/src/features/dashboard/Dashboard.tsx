import { useMemo } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { useSession } from "@/state/session";
import { buildAgenda, casesNeedingAttention, quickStats, type AgendaItem } from "@/rules/agenda";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { loadSampleData } from "@/state/seed";
import { todayISO } from "@/rules/dates";
import { caseLabel, relativeDays } from "@/lib/format";
import { Section, AgendaRow, Dot } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { TopBar, btn } from "@/features/components/TopBar";
import { DemoBanner } from "@/features/onboarding/DemoBanner";
import { useOnboarding } from "@/state/onboarding";

interface PrioritySummary {
  id: string;
  label: string;
  overdue: number;
  next: AgendaItem | null;
}

export function Dashboard() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const lock = useSession((s) => s.lock);
  const demoActive = useOnboarding((s) => s.demoActive);
  const today = todayISO();

  const { agenda, attention, stats, superior, priorityCases, loudOverdue, silentOverdue } = useMemo(() => {
    const ag = buildAgenda(aggregates, DEFAULT_SETTINGS, today);
    const allItems = [...ag.overdue, ...ag.today, ...ag.upcoming];
    const itemsByCase = new Map<string, AgendaItem[]>();
    for (const it of allItems) {
      const arr = itemsByCase.get(it.caseId) ?? [];
      arr.push(it);
      itemsByCase.set(it.caseId, arr);
    }
    const priorityCases: PrioritySummary[] = aggregates
      .filter((a) => a.case.priority && a.case.status !== "closed")
      .map((a) => {
        const items = (itemsByCase.get(a.case.id) ?? []).slice().sort((x, y) => (x.daysUntil ?? 9999) - (y.daysUntil ?? 9999));
        return {
          id: a.case.id,
          label: caseLabel(a.case),
          overdue: items.filter((i) => i.bucket === "overdue").length,
          next: items.find((i) => i.bucket !== "overdue") ?? items[0] ?? null,
        };
      });
    return {
      agenda: ag,
      attention: casesNeedingAttention(aggregates, DEFAULT_SETTINGS, today),
      stats: quickStats(aggregates, today),
      superior: allItems.filter((i) => i.deadline.track === "superior"),
      priorityCases,
      // §1 — priority cases shout (RED); lighter cases are monitored silently.
      loudOverdue: ag.overdue.filter((i) => !i.silent),
      silentOverdue: ag.overdue.filter((i) => i.silent),
    };
  }, [aggregates, today]);

  const open = (id: string) => go({ kind: "case", id });

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-16 pt-5">
      <TopBar
        title="CaseClock"
        subtitle="Local-first case & deadline cockpit"
        actions={
          <>
            <button onClick={() => go({ kind: "search" })} title="Search cases" className={btn("ghost")}>
              🔍 Search
            </button>
            <button onClick={() => go({ kind: "review" })} className={btn("ghost")}>
              Review
            </button>
            <button onClick={() => go({ kind: "settings" })} title="Settings & backup" aria-label="Settings and backup" className={btn("icon")}>
              ⚙
            </button>
            <button onClick={() => go({ kind: "new" })} className={btn("primary")}>
              + New Case
            </button>
            <button onClick={() => void lock()} title="Lock vault" aria-label="Lock vault" className={btn("icon")}>
              🔒
            </button>
          </>
        }
      />

      {demoActive && <DemoBanner onClear={() => void useOnboarding.getState().clearAndReset()} />}

      {aggregates.length === 0 ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-line bg-surface-2 px-6 py-16 text-center">
          <p className="text-ink">No cases yet.</p>
          <p className="mt-1 max-w-sm text-sm text-ink-dim">
            Add your first supervised case. CaseClock will compute its statutory clocks and remind
            you before each one.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button onClick={() => go({ kind: "new" })} className={btn("primary")}>
              + New Case
            </button>
            <button onClick={() => void loadSampleData()} className={btn("ghost")} title="Load the two demo cases from the sample files">
              Load sample cases
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Priority cases — pinned to the top with full detail (§1) */}
          {priorityCases.length > 0 && (
            <div className="mt-5 rounded-xl border-2 border-statutory/50 bg-statutory/5 p-2">
              <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-semibold text-statutory">
                ★ PRIORITY CASES ({priorityCases.length})
              </div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {priorityCases.map((p) => (
                  <button
                    key={`prio:${p.id}`}
                    onClick={() => open(p.id)}
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-3/50 px-3 py-2.5 text-left hover:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink"><Highlighted text={p.label} /></span>
                    {p.overdue > 0 && (
                      <span className="shrink-0 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                        {p.overdue} overdue
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-ink-dim">
                      {p.next?.deadline.dueAt ? relativeDays(p.next.deadline.dueAt, today) : "—"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Superior Court Zone — top priority, distinct highlight (§2) */}
          {superior.length > 0 && (
            <div className="mt-5 rounded-xl border-2 border-critical/60 bg-critical/10 p-2">
              <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-semibold text-critical">
                ⚖ SUPERIOR COURT ZONE · SC / HC ({superior.length})
              </div>
              <div className="mt-1 space-y-1">
                {superior.map((it) => (
                  <AgendaRow
                    key={`sup:${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}`}
                    item={it}
                    today={today}
                    onOpen={open}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Overdue (persistent) — priority cases only; lighter cases monitor silently (§1) */}
          <div className="mt-3 rounded-xl border border-critical/40 bg-critical/10 p-2">
            <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-medium text-critical">
              <Dot tone="critical" /> {loudOverdue.length} overdue
            </div>
            {loudOverdue.length > 0 && (
              <div className="mt-1 space-y-1">
                {loudOverdue.map((it) => (
                  <AgendaRow
                    key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}`}
                    item={it}
                    today={today}
                    onOpen={open}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Silently monitored — non-priority overdue, kept out of the loud RED tier (§1) */}
          {silentOverdue.length > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-surface-2 p-2">
              <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-medium text-ink-dim">
                <Dot tone="soft" /> {silentOverdue.length} overdue · monitored (non-priority — alerting silently)
              </div>
              <div className="mt-1 space-y-1 opacity-70">
                {silentOverdue.map((it) => (
                  <AgendaRow
                    key={`silent:${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}`}
                    item={it}
                    today={today}
                    onOpen={open}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Section title="Today" hint="due / alerting today">
              {agenda.today.length === 0 ? (
                <p className="py-6 text-center text-sm text-soft">Nothing due today</p>
              ) : (
                <div className="space-y-1">
                  {agenda.today.map((it) => (
                    <AgendaRow
                      key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}`}
                      item={it}
                      today={today}
                      onOpen={open}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Cases needing attention" hint="stale · review · heavy clock">
              {attention.length === 0 ? (
                <p className="py-6 text-center text-sm text-soft">All clear</p>
              ) : (
                <div className="space-y-1">
                  {attention.map((f) => (
                    <button
                      key={f.caseId}
                      onClick={() => open(f.caseId)}
                      className="flex w-full items-center justify-between rounded-xl bg-surface-3/50 px-3 py-2.5 text-left hover:bg-surface-3"
                    >
                      <span className="truncate text-sm text-ink"><Highlighted text={f.caseLabel} /></span>
                      <span className="shrink-0 text-xs text-statutory">{f.reasons.join(" · ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Upcoming" hint="next 30 days">
              {agenda.upcoming.length === 0 ? (
                <p className="py-6 text-center text-sm text-soft">Nothing scheduled</p>
              ) : (
                <div className="space-y-1">
                  {agenda.upcoming.slice(0, 12).map((it) => (
                    <AgendaRow
                      key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}`}
                      item={it}
                      today={today}
                      onOpen={open}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Caseload">
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Live", stats.live],
                  ["UAPA", stats.uapa],
                  ["In custody", stats.inCustody],
                  [">3m", stats.m3],
                  [">6m", stats.m6],
                  [">1yr", stats.m12],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-3/60 py-2">
                    <dd className="text-lg font-semibold text-ink">{v}</dd>
                    <dt className="text-xs text-ink-dim">{k}</dt>
                  </div>
                ))}
              </dl>
            </Section>
          </div>
        </>
      )}

      <footer className="mt-6 border-t border-line pt-3 text-center text-[11px] leading-relaxed text-soft">
        Not legal advice · not the official record (CCTNS remains that) · verify statutory citations
        against the bare Act before relying in court.
      </footer>
    </div>
  );
}
