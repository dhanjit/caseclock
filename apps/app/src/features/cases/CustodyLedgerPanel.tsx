/**
 * Chain of custody — movement ledger (V4-DELTA N2 / V6 preview). One row per leg
 * (Malkhana → FSL → Malkhana → Court …). An open leg = the exhibit is OUT (red
 * pill); a broken seal is flagged RED and stays on the record. Edit-only — legs
 * are logged and returned, never deleted.
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import { openExhibits, type CustodyMovementRecord } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function CustodyLedgerPanel({
  agg,
  onSaveMovements,
}: {
  agg: CaseAggregate;
  onSaveMovements: (rows: CustodyMovementRecord[]) => Promise<void>;
}) {
  const rows = agg.custodyMovements ?? [];
  const today = todayISO();
  const out = openExhibits(rows).length;
  const broken = rows.filter((m) => !m.sealIntact).length;

  const [exhibit, setExhibit] = useState("");
  const [nature, setNature] = useState("");
  const [outDate, setOutDate] = useState(today);
  const [from, setFrom] = useState("Malkhana");
  const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState("FSL");
  // inline "returned" flow (no window.confirm): backDate + seal state per row
  const [returning, setReturning] = useState<string | null>(null);
  const [backDate, setBackDate] = useState(today);
  const [sealOnReturn, setSealOnReturn] = useState<"yes" | "no">("yes");

  async function logMove() {
    if (!exhibit.trim() || !to.trim()) return;
    const linked = (agg.evidence ?? []).find((e) => e.exhibitNo?.toLowerCase() === exhibit.trim().toLowerCase());
    await onSaveMovements([
      ...rows,
      {
        id: newId("cm"),
        caseId: agg.case.id,
        exhibitNo: exhibit.trim(),
        evidenceId: linked?.id ?? null,
        nature: nature.trim() || linked?.description || undefined,
        outDate,
        backDate: null,
        from: from.trim() || "Malkhana",
        to: to.trim(),
        purpose,
        sealIntact: true,
      },
    ]);
    setExhibit("");
    setNature("");
    setTo("");
  }

  async function markReturned(id: string) {
    await onSaveMovements(
      rows.map((m) => (m.id === id ? { ...m, backDate, sealIntact: sealOnReturn === "yes" ? m.sealIntact : false } : m)),
    );
    setReturning(null);
    setSealOnReturn("yes");
    setBackDate(today);
  }

  return (
    <Section
      title="Chain of custody — movement ledger"
      hint={`${rows.length} leg(s) · ${out} OUT of Malkhana${broken ? ` · ${broken} seal broken` : ""}`}
      className="mt-3"
    >
      {broken > 0 && (
        <p className="mb-2 rounded-lg border-l-4 border-critical bg-red-bg/60 px-2.5 py-1.5 text-xs font-semibold text-critical">
          ⚠ {broken} leg(s) with a broken tamper seal — record the rectification in the progress log; the flag stays on the ledger.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-ink text-left font-mono text-[9.5px] uppercase tracking-wider text-surface">
              <th className="w-8 px-2.5 py-1.5">Sl.</th>
              <th className="px-2.5 py-1.5">Exhibit</th>
              <th className="px-2.5 py-1.5">Nature</th>
              <th className="px-2.5 py-1.5">Out</th>
              <th className="px-2.5 py-1.5">Back</th>
              <th className="px-2.5 py-1.5">From → To</th>
              <th className="px-2.5 py-1.5">Seal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-2.5 py-2 italic text-ink-dim">No movements logged — the Malkhana is a waypoint; log every leg.</td></tr>
            )}
            {rows.map((m, i) => (
              <tr key={m.id} className="border-t border-surface-3 align-top">
                <td className="px-2.5 py-1.5 text-center font-mono">{i + 1}</td>
                <td className="px-2.5 py-1.5 font-mono font-bold">{m.exhibitNo}</td>
                <td className="px-2.5 py-1.5">{m.nature || "—"}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmtDate(m.outDate)}</td>
                <td className="px-2.5 py-1.5">
                  {m.backDate ? (
                    <span className="font-mono">{fmtDate(m.backDate)}</span>
                  ) : returning === m.id ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <input type="date" value={backDate} onChange={(e) => setBackDate(e.target.value)} className={`${input} px-1.5 py-0.5 text-[11px]`} aria-label="Date returned" />
                      <select value={sealOnReturn} onChange={(e) => setSealOnReturn(e.target.value as "yes" | "no")} className={`${input} px-1.5 py-0.5 text-[11px]`} aria-label="Seal intact on return?">
                        <option value="yes">seal intact</option>
                        <option value="no">seal broken</option>
                      </select>
                      <button onClick={() => void markReturned(m.id)} className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-surface">✓</button>
                      <button onClick={() => setReturning(null)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px]">✕</button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded bg-critical px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">OUT</span>
                      <button onClick={() => { setReturning(m.id); setBackDate(today); }} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-court">
                        returned
                      </button>
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-[11.5px]">
                  {m.from} → {m.to}
                  {m.purpose ? <span className="text-ink-dim"> · {m.purpose}</span> : null}
                </td>
                <td className="px-2.5 py-1.5">
                  {m.sealIntact ? (
                    <span className="rounded bg-green-bg px-1.5 py-0.5 text-[10.5px] font-semibold text-ok">Yes</span>
                  ) : (
                    <span className="rounded bg-critical px-1.5 py-0.5 text-[10.5px] font-bold text-white">NO</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input className={`${input} w-24 py-1.5 text-xs`} value={exhibit} onChange={(e) => setExhibit(e.target.value)} placeholder="Exhibit no." />
        <input className={`${input} min-w-32 flex-1 py-1.5 text-xs`} value={nature} onChange={(e) => setNature(e.target.value)} placeholder="Nature of exhibit" />
        <input type="date" className={`${input} py-1.5 text-xs`} value={outDate} onChange={(e) => setOutDate(e.target.value)} aria-label="Out date" />
        <input className={`${input} w-24 py-1.5 text-xs`} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <input className={`${input} w-32 py-1.5 text-xs`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="To — where?" />
        <select className={`${input} py-1.5 text-xs`} value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose">
          <option>FSL</option>
          <option>Court exhibit</option>
          <option>Expert examination</option>
          <option>Other</option>
        </select>
        <button onClick={() => void logMove()} disabled={!exhibit.trim() || !to.trim()} className={`${btn("primary")} disabled:opacity-40`}>+ Log movement</button>
      </div>
      <p className="eyebrow mt-2">As many legs as needed per exhibit — Malkhana → FSL → Malkhana → Court… Open leg = RED OUT. Edit-only; a broken seal is never un-rung.</p>
    </Section>
  );
}
