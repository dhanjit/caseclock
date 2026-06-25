import { useMemo } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { useSession } from "@/state/session";
import { buildAgenda, casesNeedingAttention, quickStats } from "@/rules/agenda";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { Section, AgendaRow, Dot } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { TopBar, btn } from "@/features/components/TopBar";

export function Dashboard() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const lock = useSession((s) => s.lock);
  const today = todayISO();

  const { agenda, attention, stats, superior } = useMemo(() => {
    const ag = buildAgenda(aggregates, DEFAULT_SETTINGS, today);
    return {
      agenda: ag,
      attention: casesNeedingAttention(aggregates, DEFAULT_SETTINGS, today),
      stats: quickStats(aggregates, today),
      superior: [...ag.overdue, ...ag.today, ...ag.upcoming].filter((i) => i.deadline.track === "superior"),
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

      {aggregates.length === 0 ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-line bg-surface-2 px-6 py-16 text-center">
          <p className="text-ink">No cases yet.</p>
          <p className="mt-1 max-w-sm text-sm text-ink-dim">
            Add your first supervised case. CaseClock will compute its statutory clocks and remind
            you before each one.
          </p>
          <button onClick={() => go({ kind: "new" })} className={`${btn("primary")} mt-4`}>
            + New Case
          </button>
        </div>
      ) : (
        <>
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

          {/* Overdue (persistent) */}
          <div className="mt-3 rounded-xl border border-critical/40 bg-critical/10 p-2">
            <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-medium text-critical">
              <Dot tone="critical" /> {agenda.overdue.length} overdue
            </div>
            {agenda.overdue.length > 0 && (
              <div className="mt-1 space-y-1">
                {agenda.overdue.map((it) => (
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
