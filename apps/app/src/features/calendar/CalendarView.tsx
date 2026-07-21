/**
 * Calendar (T3 / V6 preview) — every live deadline and court date on an offline
 * month grid + a 50-row agenda, with the existing all-cases .ics export.
 * ★ = superior court / statutory-critical. Data comes straight from the rules
 * engine per aggregate — nothing is entered here.
 */
import { useMemo, useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { computeDeadlines } from "@/rules/engine";
import { DEFAULT_SETTINGS, type DeadlineEvent } from "@/domain/types";
import { buildAllCasesIcs } from "@/domain/ics";
import { diffDays, todayISO, type ISODate } from "@/rules/dates";
import { fmtDate, relativeDays, severityTone, toneText } from "@/lib/format";
import { TopBar, btn } from "@/features/components/TopBar";

interface CalEvent {
  caseId: string;
  firNumber: string;
  deadline: DeadlineEvent;
}

const TRACK_DOT: Record<string, string> = {
  investigation: "bg-statutory",
  trial: "bg-court",
  court: "bg-court",
  superior: "bg-critical",
  process: "bg-soft",
  supervisory: "bg-soft",
};

export function CalendarView() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const today = todayISO();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    for (const agg of aggregates) {
      if (agg.case.status === "closed") continue;
      const ds = computeDeadlines(
        agg.case, agg.persons, agg.hearings, DEFAULT_SETTINGS, today,
        agg.evidence ?? [], agg.processRequests ?? [], agg.commsRequests ?? [],
        agg.towerDumps ?? [], agg.chargesheets ?? [],
      );
      for (const d of ds) {
        if (!d.dueAt || d.severity === "soft") continue;
        if (d.state !== "active" && d.state !== "overdue" && d.state !== "window-open") continue;
        out.push({ caseId: agg.case.id, firNumber: agg.case.firNumber, deadline: d });
      }
    }
    return out;
  }, [aggregates, today]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const arr = m.get(e.deadline.dueAt!) ?? [];
      arr.push(e);
      m.set(e.deadline.dueAt!, arr);
    }
    return m;
  }, [events]);

  const monthName = new Date(ym.y, ym.m, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const agenda = useMemo(
    () =>
      [...events]
        .filter((e) => diffDays(today, e.deadline.dueAt!) <= 0)
        .sort((a, b) => a.deadline.dueAt!.localeCompare(b.deadline.dueAt!))
        .slice(0, 50),
    [events, today],
  );

  const exportIcs = () => {
    const ics = buildAllCasesIcs(aggregates, DEFAULT_SETTINGS, today);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caseclock-calendar-${today.replace(/-/g, "")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const prev = () => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }));
  const next = () => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }));
  const short = (fir: string) => fir.split("·")[0].trim();
  const isStar = (d: DeadlineEvent) => d.track === "superior" || d.severity === "statutory-critical";

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-16 pt-5">
      <TopBar
        title="Calendar"
        subtitle="Every live deadline & court date · offline"
        actions={
          <button onClick={exportIcs} className={btn("primary")} title="Export an offline calendar file importable into any phone or desktop calendar">
            ⇲ Export .ics
          </button>
        }
      />

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-3">
          <button onClick={prev} className={btn("ghost")} aria-label="Previous month">‹ Prev</button>
          <p className="flex-1 text-center text-base font-semibold">{monthName}</p>
          <button onClick={next} className={btn("ghost")} aria-label="Next month">Next ›</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {["S", "M", "T", "W", "T2", "F", "S2"].map((d) => (
            <p key={d} className="eyebrow py-1 text-center">{d[0]}</p>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const iso = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}` as ISODate;
            const evs = byDay.get(iso) ?? [];
            const isToday = iso === today;
            return (
              <div
                key={iso}
                className={`min-h-16 overflow-hidden rounded border p-1 ${isToday ? "border-statutory bg-brass-bg/60" : "border-line bg-surface-2"}`}
              >
                <p className={`font-mono text-[10px] ${isToday ? "font-bold text-statutory" : "text-ink-dim"}`}>{d}</p>
                {evs.slice(0, 2).map((e, j) => (
                  <button
                    key={j}
                    onClick={() => go({ kind: "case", id: e.caseId })}
                    title={`${e.firNumber}: ${e.deadline.type}`}
                    className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left font-mono text-[8.5px] leading-tight text-white ${TRACK_DOT[e.deadline.track] ?? "bg-ink"}`}
                  >
                    {isStar(e.deadline) ? "★ " : ""}{short(e.firNumber)}
                  </button>
                ))}
                {evs.length > 2 && <p className="mt-0.5 text-[8px] text-ink-dim">+{evs.length - 2} more</p>}
              </div>
            );
          })}
        </div>
      </div>

      <p className="eyebrow mt-5 mb-1 border-l-2 border-statutory pl-2">Upcoming — agenda (next 50)</p>
      <div className="rounded-xl border border-line bg-surface-2">
        {agenda.length === 0 && <p className="px-3 py-4 text-center text-sm italic text-ink-dim">No upcoming dates.</p>}
        {agenda.map((e, i) => {
          const tone = severityTone(e.deadline.severity);
          return (
            <button
              key={`${e.caseId}:${e.deadline.ruleId}:${e.deadline.occurrenceDate ?? ""}:${e.deadline.instanceId ?? ""}`}
              onClick={() => go({ kind: "case", id: e.caseId })}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-3 ${i > 0 ? "border-t border-surface-3" : ""}`}
            >
              <span className="w-20 shrink-0 font-mono text-[11px]">{fmtDate(e.deadline.dueAt!)}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${TRACK_DOT[e.deadline.track] ?? "bg-ink"}`} />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {isStar(e.deadline) && <span className="text-critical">★ </span>}
                <b className="font-mono text-[12px]">{short(e.firNumber)}</b> — {e.deadline.type}
              </span>
              <span className={`shrink-0 text-[11px] ${toneText[tone]}`}>{relativeDays(e.deadline.dueAt!, today)}</span>
            </button>
          );
        })}
      </div>
      <p className="eyebrow mt-2">★ = superior court / hard statutory deadline. The .ics export stays on this device — importable into any calendar.</p>
    </div>
  );
}
