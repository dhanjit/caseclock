import { useMemo } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { buildAgenda, casesNeedingAttention, quickStats, type AgendaItem } from "@/rules/agenda";
import { CASE_CATEGORIES, CASE_CATEGORY_META } from "@/domain/types";
import { useAppSettings } from "@/state/app-settings";
import { integrityGaps, type IntegrityGap } from "@/domain/integrity";
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
  priority: boolean;
  superior: boolean;
  identity?: string;
  firNumber: string;
}

/** V6 case-heat: worst state across the case's live deadlines → tile top border. */
function heatOf(t: PrioritySummary): string {
  if (t.overdue > 0) return "border-t-critical";
  const days = t.next?.daysUntil;
  if (days != null && days <= 15) return "border-t-statutory";
  if (t.next) return "border-t-court";
  return "border-t-line";
}

function HeatTile({ t, today, onOpen }: { t: PrioritySummary; today: string; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(t.id)}
      className={`rounded-lg border border-line border-t-4 bg-surface-2 p-2.5 text-left hover:bg-surface-3 ${heatOf(t)}`}
    >
      <p className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold">{t.firNumber.split("·")[0].trim()}</span>
        {t.priority && <span className="shrink-0 text-[13px] text-statutory">★</span>}
        {t.superior && <span className="shrink-0 text-[12px] text-critical" title="SC/HC matter live">⚖</span>}
      </p>
      <p className="mt-1 h-9 overflow-hidden text-[11.5px] leading-tight text-ink-dim">
        <Highlighted text={t.identity ?? t.label} />
      </p>
      <p className="mt-1.5 flex items-center gap-1.5">
        {t.overdue > 0 && (
          <span className="rounded bg-red-bg px-1.5 py-0.5 font-mono text-[10px] font-bold text-critical">! {t.overdue}</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-dim">
          {t.next?.deadline.dueAt ? relativeDays(t.next.deadline.dueAt, today) : "—"}
        </span>
      </p>
    </button>
  );
}

export function Dashboard() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const demoActive = useOnboarding((s) => s.demoActive);
  const settings = useAppSettings((s) => s.settings);
  const today = todayISO();

  const { agenda, attention, stats, superior, priorityCases, monitoredCases, loudOverdue, silentOverdue, catCounts, gaps } = useMemo(() => {
    const ag = buildAgenda(aggregates, settings, today);
    const allItems = [...ag.overdue, ...ag.today, ...ag.upcoming];
    const itemsByCase = new Map<string, AgendaItem[]>();
    for (const it of allItems) {
      const arr = itemsByCase.get(it.caseId) ?? [];
      arr.push(it);
      itemsByCase.set(it.caseId, arr);
    }
    const tileOf = (a: (typeof aggregates)[number]): PrioritySummary => {
      const items = (itemsByCase.get(a.case.id) ?? []).slice().sort((x, y) => (x.daysUntil ?? 9999) - (y.daysUntil ?? 9999));
      return {
        id: a.case.id,
        label: caseLabel(a.case),
        firNumber: a.case.firNumber,
        identity: a.case.identity,
        priority: !!a.case.priority,
        superior: items.some((i) => i.deadline.track === "superior"),
        overdue: items.filter((i) => i.bucket === "overdue").length,
        next: items.find((i) => i.bucket !== "overdue") ?? items[0] ?? null,
      };
    };
    const live = aggregates.filter((a) => a.case.status !== "closed");
    const priorityCases: PrioritySummary[] = live.filter((a) => a.case.priority).map(tileOf);
    const monitoredCases: PrioritySummary[] = live.filter((a) => !a.case.priority).map(tileOf);
    // Cat I–V strip (V4-DELTA Q8) + integrity checks (V6: "silence is not safety").
    const catCounts = CASE_CATEGORIES.map((k) => ({
      key: k,
      ...CASE_CATEGORY_META[k],
      count: aggregates.filter((a) => (a.case.category ?? "I") === k).length,
    }));
    const gaps: (IntegrityGap & { caseLabel: string })[] = live.flatMap((a) =>
      integrityGaps(a, today).map((g) => ({ ...g, caseLabel: caseLabel(a.case) })),
    );
    return {
      agenda: ag,
      attention: casesNeedingAttention(aggregates, settings, today),
      stats: quickStats(aggregates, today),
      superior: allItems.filter((i) => i.deadline.track === "superior"),
      priorityCases,
      monitoredCases,
      // §1 — priority cases shout (RED); lighter cases are monitored silently.
      loudOverdue: ag.overdue.filter((i) => !i.silent),
      silentOverdue: ag.overdue.filter((i) => i.silent),
      catCounts,
      gaps,
    };
  }, [aggregates, settings, today]);

  const open = (id: string) => go({ kind: "case", id });

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-16 pt-5">
      <TopBar title="Dashboard" subtitle="Local-first case & deadline cockpit" />

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
          {/* Cases by category — Cat I–V supervision strip (V4-DELTA Q8 / V6) */}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {catCounts.map((cat) => (
              <div key={cat.key} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2" title={cat.label}>
                <p className="truncate font-mono text-[9.5px] uppercase tracking-wider text-ink-dim">{cat.short}</p>
                <p className="mt-0.5 font-mono text-xl font-bold">{cat.count}</p>
              </div>
            ))}
            <div className="rounded-lg border border-ink/60 bg-surface-3 px-2.5 py-2">
              <p className="font-mono text-[9.5px] uppercase tracking-wider text-ink-dim">Total</p>
              <p className="mt-0.5 font-mono text-xl font-bold">{aggregates.length}</p>
            </div>
          </div>

          {/* Integrity checks — "silence is not safety" (V4-DELTA §2 / V6) */}
          {(gaps.length > 0 || attention.some((f) => f.reasons.some((r) => /untouched/i.test(r)))) && (
            <div className="mt-3 rounded-xl border-l-4 border-critical bg-red-bg/50 p-3">
              <p className="eyebrow mb-2 !text-critical">⚠ Integrity checks — silence is not safety</p>
              <div className="space-y-1.5">
                {gaps.slice(0, 8).map((g, i) => (
                  <button
                    key={`${g.caseId}:${i}`}
                    onClick={() => open(g.caseId)}
                    className="flex w-full items-start gap-2 text-left text-[13px] leading-snug hover:underline"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white ${g.kind === "next-date" ? "bg-critical" : "bg-statutory"}`}
                    >
                      {g.kind === "next-date" ? "Next date?" : "Clock not running"}
                    </span>
                    <span>
                      <b className="font-mono text-[12px]">{g.caseLabel}</b> — {g.text}
                    </span>
                  </button>
                ))}
                {gaps.length > 8 && <p className="text-[11px] text-ink-dim">+{gaps.length - 8} more — open the cases to resolve.</p>}
                {/* DORMANT — untouched cases surface in the same card (V6). */}
                {attention
                  .filter((f) => f.reasons.some((r) => /untouched/i.test(r)))
                  .map((f) => (
                    <button
                      key={`dormant:${f.caseId}`}
                      onClick={() => open(f.caseId)}
                      className="flex w-full items-start gap-2 text-left text-[13px] leading-snug hover:underline"
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white">
                        Dormant
                      </span>
                      <span>
                        <b className="font-mono text-[12px]">{f.caseLabel}</b> — {f.reasons.join(" · ")}. Verify.
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Case-heat tile grid (V6): ★ priority pinned first, then Monitored.
              Top border = worst live severity; ! n = overdue count; footer = next date. */}
          {priorityCases.length > 0 && (
            <div className="mt-5 rounded-xl border-2 border-statutory/50 bg-statutory/5 p-2.5">
              <p className="eyebrow mb-2 !text-statutory">★ Priority ({priorityCases.length}/10)</p>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {priorityCases.map((t) => (
                  <HeatTile key={`prio:${t.id}`} t={t} today={today} onOpen={open} />
                ))}
              </div>
            </div>
          )}
          {monitoredCases.length > 0 && (
            <div className="mt-3">
              <p className="eyebrow mb-2 !text-court">Monitored — one tile per case, tap to open</p>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {monitoredCases.map((t) => (
                  <HeatTile key={`mon:${t.id}`} t={t} today={today} onOpen={open} />
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
                    key={`sup:${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}:${it.deadline.instanceId ?? ""}`}
                    item={it}
                    today={today}
                    onOpen={open}
                  />
                ))}
              </div>
            </div>
          )}

          {/* At-a-glance overview — kept above the (long) overdue queue so the caseload
              summary is visible without scrolling past every overdue item. */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Section title="Today" hint="due / alerting today">
              {agenda.today.length === 0 ? (
                <p className="py-3 text-center text-sm text-soft">Nothing due today</p>
              ) : (
                <div className="space-y-1">
                  {agenda.today.map((it) => (
                    <AgendaRow
                      key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}:${it.deadline.instanceId ?? ""}`}
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
                <p className="py-3 text-center text-sm text-soft">All clear</p>
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
                <p className="py-3 text-center text-sm text-soft">Nothing scheduled</p>
              ) : (
                <div className="space-y-1">
                  {agenda.upcoming.slice(0, 12).map((it) => (
                    <AgendaRow
                      key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}:${it.deadline.instanceId ?? ""}`}
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

          {/* Overdue (persistent) — priority cases only; lighter cases monitor silently (§1) */}
          <div className="mt-3 rounded-xl border border-critical/40 bg-critical/10 p-2">
            <div className="flex items-center gap-2.5 px-2 py-1 text-sm font-medium text-critical">
              <Dot tone="critical" /> {loudOverdue.length} overdue
            </div>
            {loudOverdue.length > 0 && (
              <div className="mt-1 space-y-1">
                {loudOverdue.map((it) => (
                  <AgendaRow
                    key={`${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}:${it.deadline.instanceId ?? ""}`}
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
                    key={`silent:${it.caseId}:${it.deadline.ruleId}:${it.deadline.occurrenceDate ?? ""}:${it.deadline.instanceId ?? ""}`}
                    item={it}
                    today={today}
                    onOpen={open}
                  />
                ))}
              </div>
            </div>
          )}

        </>
      )}

      <footer className="mt-6 border-t border-line pt-3 text-center text-[11px] leading-relaxed text-soft">
        Not legal advice · not the official record (CCTNS remains that) · verify statutory citations
        against the bare Act before relying in court.
      </footer>
    </div>
  );
}
