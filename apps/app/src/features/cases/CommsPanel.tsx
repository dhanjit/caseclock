/**
 * Comms data — CDR · IPDR · IMEI · Tower dump (V4-DELTA N3 / V6 preview).
 * Four registers of REQUESTS, never content: identifiers + received counts +
 * expected dates. Rows auto-feed the cross-case Links map; pendency alerts run
 * off the expected date (engine: comms-pending / tower-pending).
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import { COMMS_KIND_LABEL, type CommsRequestRecord, type TowerDumpRecord } from "@/domain/types";
import { addDays, diffDays, todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";
const KINDS: CommsRequestRecord["kind"][] = ["cdr", "ipdr", "imei"];

/** Comma/space/semicolon-tolerant identifier splitter (paste straight from the letter). */
function splitNumbers(raw: string): string[] {
  return raw.split(/[\s,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

export function CommsPanel({
  agg,
  onSaveComms,
  onSaveTowers,
}: {
  agg: CaseAggregate;
  onSaveComms: (rows: CommsRequestRecord[]) => Promise<void>;
  onSaveTowers: (rows: TowerDumpRecord[]) => Promise<void>;
}) {
  const rows = agg.commsRequests ?? [];
  const towers = agg.towerDumps ?? [];
  const today = todayISO();
  const totalNumbers = rows.reduce((n, r) => n + r.numbers.length, 0);
  const totalRecd = rows.reduce((n, r) => n + r.receivedCount, 0);
  const towerPending = towers.filter((t) => t.status !== "received").length;

  return (
    <Section
      title="Comms data — CDR · IPDR · IMEI · Tower"
      hint={`${totalRecd}/${totalNumbers} identifiers · ${towerPending} dump(s) pending`}
      className="mt-3"
    >
      <p className="mb-2 rounded-lg border border-court/30 bg-blue-bg/60 px-2.5 py-1.5 text-xs leading-snug">
        Requests only — phone numbers / IMEIs entered here <b>auto-feed the Links map</b>: a lead is
        drawn when the same identifier surfaces in two or more cases. No raw CDR is ingested.
      </p>
      {KINDS.map((kind) => (
        <CommsRegister
          key={kind}
          kind={kind}
          rows={rows.filter((r) => r.kind === kind)}
          today={today}
          onChange={(next) => onSaveComms([...rows.filter((r) => r.kind !== kind), ...next])}
          caseId={agg.case.id}
        />
      ))}
      <TowerRegister towers={towers} today={today} caseId={agg.case.id} onChange={onSaveTowers} />
    </Section>
  );
}

function CommsRegister({
  kind,
  rows,
  today,
  caseId,
  onChange,
}: {
  kind: CommsRequestRecord["kind"];
  rows: CommsRequestRecord[];
  today: string;
  caseId: string;
  onChange: (rows: CommsRequestRecord[]) => Promise<void>;
}) {
  const [ref, setRef] = useState("");
  const [nums, setNums] = useState("");
  const [expected, setExpected] = useState("");
  const [editRecd, setEditRecd] = useState<string | null>(null);
  const [recdVal, setRecdVal] = useState("");

  async function add() {
    if (!ref.trim()) return;
    await onChange([
      ...rows,
      {
        id: newId(kind),
        caseId,
        kind,
        ref: ref.trim(),
        numbers: splitNumbers(nums),
        receivedCount: 0,
        expectedDate: expected || addDays(today, 15),
      },
    ]);
    setRef("");
    setNums("");
    setExpected("");
  }
  const update = (id: string, patch: Partial<CommsRequestRecord>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mb-3">
      <p className="eyebrow mb-1 border-l-2 border-statutory pl-2">{COMMS_KIND_LABEL[kind]}</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-ink text-left font-mono text-[9.5px] uppercase tracking-wider text-surface">
              <th className="px-2.5 py-1.5">Request ref / date</th>
              <th className="px-2.5 py-1.5">Identifiers</th>
              <th className="px-2.5 py-1.5 text-center">Recd</th>
              <th className="px-2.5 py-1.5 text-center">Pend.</th>
              <th className="px-2.5 py-1.5">Expected</th>
              <th className="w-16 px-2.5 py-1.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-2.5 py-2 italic text-ink-dim">None recorded.</td></tr>
            )}
            {rows.map((r) => {
              const pend = Math.max(0, r.numbers.length - r.receivedCount);
              const over = pend > 0 && r.expectedDate && diffDays(today, r.expectedDate) > 0;
              return (
                <tr key={r.id} className="border-t border-surface-3 align-top">
                  <td className="px-2.5 py-1.5 font-mono">{r.ref}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">{r.numbers.join(", ") || "—"}</td>
                  <td className="px-2.5 py-1.5 text-center font-mono text-ok">{r.receivedCount}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    {pend > 0 ? (
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${over ? "bg-critical text-white" : "bg-brass-bg text-statutory"}`}>{pend}</span>
                    ) : (
                      <span className="font-mono text-ok">0</span>
                    )}
                  </td>
                  <td className={`px-2.5 py-1.5 font-mono ${over ? "text-critical" : ""}`}>
                    {r.expectedDate ? fmtDate(r.expectedDate) : "—"}
                    {over ? " · overdue" : ""}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    {editRecd === r.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          value={recdVal}
                          onChange={(e) => setRecdVal(e.target.value)}
                          inputMode="numeric"
                          className={`${input} w-14 px-1.5 py-0.5 text-[11px]`}
                          aria-label="Total received so far"
                        />
                        <button
                          onClick={() => {
                            void update(r.id, { receivedCount: Math.min(Math.max(0, Number(recdVal) || 0), r.numbers.length) });
                            setEditRecd(null);
                          }}
                          className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-surface"
                        >
                          ✓
                        </button>
                      </span>
                    ) : (
                      pend > 0 && (
                        <button
                          onClick={() => { setEditRecd(r.id); setRecdVal(String(r.receivedCount)); }}
                          className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-court"
                        >
                          recd
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input className={`${input} min-w-32 py-1.5 text-xs`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Letter no. / date" />
        <input className={`${input} min-w-44 flex-1 py-1.5 text-xs`} value={nums} onChange={(e) => setNums(e.target.value)} placeholder="Identifiers (comma / space separated)" />
        <input type="date" className={`${input} py-1.5 text-xs`} value={expected} onChange={(e) => setExpected(e.target.value)} title="Expected by (default +15d)" />
        <button onClick={() => void add()} disabled={!ref.trim()} className={`${btn("ghost")} disabled:opacity-40`}>+ Add</button>
      </div>
    </div>
  );
}

function TowerRegister({
  towers,
  today,
  caseId,
  onChange,
}: {
  towers: TowerDumpRecord[];
  today: string;
  caseId: string;
  onChange: (rows: TowerDumpRecord[]) => Promise<void>;
}) {
  const [ref, setRef] = useState("");
  const [site, setSite] = useState("");
  const [win, setWin] = useState("");
  const [expected, setExpected] = useState("");

  async function add() {
    if (!ref.trim()) return;
    await onChange([
      ...towers,
      { id: newId("tw"), caseId, ref: ref.trim(), site: site.trim() || undefined, timeWindow: win.trim() || undefined, status: "pending", expectedDate: expected || addDays(today, 15) },
    ]);
    setRef(""); setSite(""); setWin(""); setExpected("");
  }
  const toggle = (id: string) =>
    onChange(towers.map((t) => (t.id === id ? { ...t, status: t.status === "received" ? "pending" : "received" } : t)));

  return (
    <div>
      <p className="eyebrow mb-1 border-l-2 border-critical pl-2">Tower dump — site / time-window based</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-ink text-left font-mono text-[9.5px] uppercase tracking-wider text-surface">
              <th className="px-2.5 py-1.5">Request ref</th>
              <th className="px-2.5 py-1.5">Site / BTS</th>
              <th className="px-2.5 py-1.5">Time window</th>
              <th className="px-2.5 py-1.5">Status</th>
              <th className="w-14 px-2.5 py-1.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {towers.length === 0 && (
              <tr><td colSpan={5} className="px-2.5 py-2 italic text-ink-dim">None recorded.</td></tr>
            )}
            {towers.map((t) => {
              const over = t.status !== "received" && t.expectedDate && diffDays(today, t.expectedDate) > 0;
              return (
                <tr key={t.id} className="border-t border-surface-3">
                  <td className="px-2.5 py-1.5 font-mono">{t.ref}</td>
                  <td className="px-2.5 py-1.5">{t.site || "—"}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">{t.timeWindow || "—"}</td>
                  <td className="px-2.5 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${t.status === "received" ? "bg-green-bg text-ok" : over ? "bg-red-bg text-critical" : "bg-brass-bg text-statutory"}`}>
                      {t.status}{over ? " · overdue" : ""}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button onClick={() => void toggle(t.id)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-court">
                      {t.status === "received" ? "undo" : "recd"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input className={`${input} min-w-28 py-1.5 text-xs`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Letter no. / date" />
        <input className={`${input} min-w-32 flex-1 py-1.5 text-xs`} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site / BTS cluster" />
        <input className={`${input} min-w-28 py-1.5 text-xs`} value={win} onChange={(e) => setWin(e.target.value)} placeholder="Time window" />
        <input type="date" className={`${input} py-1.5 text-xs`} value={expected} onChange={(e) => setExpected(e.target.value)} title="Expected by (default +15d)" />
        <button onClick={() => void add()} disabled={!ref.trim()} className={`${btn("ghost")} disabled:opacity-40`}>+ Add</button>
      </div>
    </div>
  );
}
