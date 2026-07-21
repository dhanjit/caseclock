/**
 * Per-case integrity checks (T3 / V6 "silence is not safety"): NEXT DATE? rows
 * carry a one-tap rollover — pick the next date and the lapsed hearing is
 * disposed while a fresh row (same forum/purpose/tier) is created, preserving
 * history (V4-DELTA §5.4). CLOCK NOT RUNNING rows point at the missing anchors.
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import { integrityGaps } from "@/domain/integrity";
import type { HearingRecord } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";

const input = "rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-court";

export function IntegrityCard({
  agg,
  onSaveHearings,
}: {
  agg: CaseAggregate;
  onSaveHearings: (hearings: HearingRecord[] | ((prev: HearingRecord[]) => HearingRecord[])) => Promise<void>;
}) {
  const today = todayISO();
  const gaps = integrityGaps(agg, today);
  const [rollFor, setRollFor] = useState<string | null>(null);
  const [nextDate, setNextDate] = useState("");

  if (gaps.length === 0) return null;

  async function rollover(hearingId: string) {
    if (!nextDate) return;
    const old = agg.hearings.find((h) => h.id === hearingId);
    if (!old) return;
    const fresh: HearingRecord = {
      ...old,
      id: newId("h"),
      hearingDate: nextDate,
      disposed: false,
    };
    // History preserved (§5.4): dispose the lapsed row, add the new one.
    await onSaveHearings((prev) => [...prev.map((h) => (h.id === hearingId ? { ...h, disposed: true } : h)), fresh]);
    setRollFor(null);
    setNextDate("");
  }

  return (
    <div className="mt-3 rounded-xl border-l-4 border-critical bg-red-bg/50 p-3">
      <p className="eyebrow mb-2 !text-critical">⚠ Integrity checks — silence is not safety</p>
      <div className="space-y-1.5">
        {gaps.map((g, i) => (
          <div key={`${g.kind}:${g.hearingId ?? i}`} className="flex flex-wrap items-start gap-2 text-[13px] leading-snug">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white ${g.kind === "next-date" ? "bg-critical" : "bg-statutory"}`}
            >
              {g.kind === "next-date" ? "Next date?" : "Clock not running"}
            </span>
            <span className="min-w-0 flex-1">{g.text}</span>
            {g.kind === "next-date" && g.hearingId && (
              rollFor === g.hearingId ? (
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    type="date"
                    className={input}
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    aria-label="Next hearing date"
                    autoFocus
                  />
                  <button
                    onClick={() => void rollover(g.hearingId!)}
                    disabled={!nextDate}
                    className="rounded bg-ink px-2.5 py-1 font-mono text-[11px] text-surface disabled:opacity-40"
                  >
                    Set
                  </button>
                  <button onClick={() => setRollFor(null)} className="rounded border border-line px-2 py-1 font-mono text-[11px]" aria-label="Cancel">✕</button>
                </span>
              ) : (
                <button
                  onClick={() => { setRollFor(g.hearingId!); setNextDate(""); }}
                  className="shrink-0 rounded border border-critical/50 px-2.5 py-1 font-mono text-[11px] text-critical"
                >
                  enter next date
                </button>
              )
            )}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] text-ink-dim">
        Rollover disposes the lapsed listing and records a fresh one for {fmtDate(today)} onwards — history is preserved.
      </p>
    </div>
  );
}
