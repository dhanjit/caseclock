/**
 * Accused panel (REQUIREMENTS §11 / heading 12 + V4-DELTA N6/N7, V7-8) — the
 * officer's 12-value status roster with per-accused clocks: arrest date (the FR
 * anchor), custody-end (production reminder), live bail matter, LOC/Interpol
 * notices, custody history, and the conviction sub-record (sentence + appeal
 * window). Rows are edit-only — the roster is a record, not a scratchpad.
 * Names auto-highlight against the watchlist.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  custodyLimits,
  uncoveredArrestedAccused,
  type AccusedStatus,
  type CustodyHistoryEntry,
  type LocNotice,
  type PersonRecord,
} from "@/domain/types";
import { ACCUSED_STATUS_META, ACCUSED_STATUS_ORDER, accusedStatusMeta } from "@/domain/accused";
import { addDays, diffDays, todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { Section } from "@/features/components/bits";
import { DeferredInput } from "@/features/components/DeferredInput";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";
import { useWatchlist } from "@/state/watchlist";

const LOC_TYPES: LocNotice["type"][] = ["LOC", "RCN", "Blue", "Yellow", "other"];

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function AccusedPanel({
  agg,
  onSavePersons,
}: {
  agg: CaseAggregate;
  onSavePersons: (persons: PersonRecord[] | ((prev: PersonRecord[]) => PersonRecord[])) => Promise<void>;
}) {
  const accused = agg.persons.filter((p) => p.role === "accused");
  const watchAdd = useWatchlist((s) => s.add);
  const watchNames = useWatchlist((s) => s.names);
  const onWatch = (name: string) => watchNames.some((x) => x.toLowerCase() === name.toLowerCase());
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<AccusedStatus>("not_arrested");
  const [newArrest, setNewArrest] = useState(""); // V7-8: arrest date entered up front
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const needsArrestDate = (s: AccusedStatus | undefined) =>
    s === "police_custody" || s === "judicial_custody" || s === "charge_sheeted";

  // Per-accused FR countdown (V6 preview): shown while THIS accused's chargesheet
  // is outstanding — coverage-aware, matching the engine's fr1 clock.
  const today = todayISO();
  const chargesheets = agg.chargesheets ?? [];
  const uncoveredIds = new Set(uncoveredArrestedAccused(agg.persons, chargesheets).map((p) => p.id));
  const frOpenFor = (p: PersonRecord) =>
    !!p.arrestDate && (chargesheets.length > 0 ? uncoveredIds.has(p.id) : !agg.case.chargesheetFiledDate);
  const frPill = (p: PersonRecord) => {
    if (!frOpenFor(p)) return null;
    const due = addDays(p.arrestDate!, custodyLimits(agg.case).buffered);
    const past = diffDays(today, due);
    return (
      <span
        title={`Chargesheet / FR target for ${p.name}: ${due}`}
        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${past > 0 ? "bg-critical text-white" : past > -16 ? "bg-brass-bg text-statutory" : "bg-blue-bg text-court"}`}
      >
        {past > 0 ? `FR overdue ${past}d` : `FR ${-past}d left`}
      </span>
    );
  };

  // Read-modify-write against the LATEST persons array (updater form) — building
  // the next array from this render's props loses a prior quick edit
  // (review finding, live-reproduced with two checkbox taps).
  async function commit(fn: (accused: PersonRecord[]) => PersonRecord[]) {
    setBusy(true);
    try {
      await onSavePersons((prev) => {
        const rest = prev.filter((p) => p.role !== "accused");
        return [...rest, ...fn(prev.filter((p) => p.role === "accused"))];
      });
    } finally {
      setBusy(false);
    }
  }
  async function add() {
    if (!newName.trim() || busy) return;
    const p: PersonRecord = {
      id: newId("p"),
      caseId: agg.case.id,
      role: "accused",
      name: newName.trim(),
      accusedStatus: newStatus,
      arrestDate: newArrest || null,
    };
    await commit((acc) => [...acc, p]);
    setNewName("");
    setNewStatus("not_arrested");
    setNewArrest("");
  }
  const update = (id: string, patch: Partial<PersonRecord>) =>
    commit((acc) => acc.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Sub-array edits compute from the LATEST row inside the updater, not render props.
  const patchRow = (pid: string, fn: (x: PersonRecord) => Partial<PersonRecord>) =>
    commit((acc) => acc.map((x) => (x.id === pid ? { ...x, ...fn(x) } : x)));
  const addLoc = (p: PersonRecord) => patchRow(p.id, (x) => ({ loc: [...(x.loc ?? []), { id: newId("loc"), type: "LOC" }] }));
  const updLoc = (p: PersonRecord, id: string, patch: Partial<LocNotice>) =>
    patchRow(p.id, (x) => ({ loc: (x.loc ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const delLoc = (p: PersonRecord, id: string) => patchRow(p.id, (x) => ({ loc: (x.loc ?? []).filter((l) => l.id !== id) }));
  const addCustody = (p: PersonRecord) =>
    patchRow(p.id, (x) => ({ custodyHistory: [...(x.custodyHistory ?? []), { id: newId("ch"), kind: "judicial" }] }));
  const updCustody = (p: PersonRecord, id: string, patch: Partial<CustodyHistoryEntry>) =>
    patchRow(p.id, (x) => ({ custodyHistory: (x.custodyHistory ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  const delCustody = (p: PersonRecord, id: string) =>
    patchRow(p.id, (x) => ({ custodyHistory: (x.custodyHistory ?? []).filter((h) => h.id !== id) }));

  return (
    <Section title="Accused" hint={`${accused.length} · 12-status · edit-only`} className="mt-3">
      <div className="space-y-2">
        {accused.map((p) => (
          <div key={p.id} className="rounded-xl bg-surface-3/40 p-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${p.accusedStatus ? accusedStatusMeta(p.accusedStatus).badge : "border-line text-soft"}`}
              >
                {p.accusedStatus ? accusedStatusMeta(p.accusedStatus).label : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                <Highlighted text={p.name} />
              </span>
              {frPill(p)}
              {((p.loc?.length ?? 0) > 0 || (p.custodyHistory?.length ?? 0) > 0) && (
                <span className="shrink-0 text-[11px] text-soft">
                  {(p.loc?.length ?? 0) > 0 && `${p.loc!.length} LOC`}
                  {(p.custodyHistory?.length ?? 0) > 0 && ` ${p.custodyHistory!.length} cust`}
                </span>
              )}
              {!onWatch(p.name) ? (
                <button onClick={() => watchAdd(p.name)} className="px-1.5 py-1 text-xs text-soft hover:text-critical" title="Flag on watchlist (auto-RED everywhere)" aria-label={`Flag ${p.name} on the watchlist`}>
                  ⚑
                </button>
              ) : (
                <span className="text-xs text-critical" title="On watchlist">⚑</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className={`${input} py-1`}
                value={p.accusedStatus ?? "not_arrested"}
                onChange={(e) => update(p.id, { accusedStatus: e.target.value as AccusedStatus })}
              >
                {ACCUSED_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {ACCUSED_STATUS_META[s].label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                <input type="checkbox" checked={!!p.firstTimeOffender} onChange={(e) => update(p.id, { firstTimeOffender: e.target.checked })} />
                First-timer
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                <input type="checkbox" checked={!!p.otherPendingCases} onChange={(e) => update(p.id, { otherPendingCases: e.target.checked })} />
                Other cases
              </label>
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="ml-auto text-xs text-court">
                LOC / custody {expanded === p.id ? "▾" : "▸"}
              </button>
            </div>
            {/* Per-accused clocks (V4-DELTA N6 / V7-8): arrest anchors FR; custody end
                fires the 1-day-prior production reminder; bail date raises a BAIL row. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                Arrested
                <input
                  type="date"
                  className={`${input} py-1`}
                  value={p.arrestDate ?? ""}
                  onChange={(e) => update(p.id, { arrestDate: e.target.value || null })}
                  aria-label={`${p.name} arrest date`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                Custody ends
                <input
                  type="date"
                  className={`${input} py-1`}
                  value={p.custodyEndDate ?? ""}
                  onChange={(e) => update(p.id, { custodyEndDate: e.target.value || null })}
                  aria-label={`${p.name} custody end date`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                <input
                  type="checkbox"
                  checked={!!p.bailPending}
                  onChange={(e) => update(p.id, { bailPending: e.target.checked })}
                />
                Bail pending
              </label>
              {p.bailPending && (
                <input
                  type="date"
                  className={`${input} py-1`}
                  value={p.bailDate ?? ""}
                  onChange={(e) => update(p.id, { bailDate: e.target.value || null })}
                  aria-label={`${p.name} bail hearing date`}
                  title="Bail hearing date — raises a BAIL deadline"
                />
              )}
              <DeferredInput
                className={`${input} min-w-36 flex-1 py-1`}
                value={p.othersNote ?? ""}
                onCommit={(v) => update(p.id, { othersNote: v || undefined })}
                placeholder="Others — LOC / MLA / Interpol note"
                aria-label={`${p.name} other notes`}
              />
            </div>
            {needsArrestDate(p.accusedStatus) && !p.arrestDate && (
              <p className="mt-1.5 rounded border border-statutory/40 bg-brass-bg px-2 py-1 text-[11px] text-statutory">
                ⚠ CLOCK NOT RUNNING — in custody / charge-sheeted but no arrest date; the FR &amp; custody clocks can't start.
              </p>
            )}
            {p.accusedStatus === "convicted" && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded border-l-4 border-critical/60 bg-red-bg/60 px-2 py-1.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-critical">Convicted</span>
                <DeferredInput
                  className={`${input} min-w-40 flex-1 py-1`}
                  value={p.sentence ?? ""}
                  onCommit={(v) => update(p.id, { sentence: v || undefined })}
                  placeholder="Sentence / quantum (e.g. life u/s 16 UAPA)"
                  aria-label={`${p.name} sentence`}
                />
                <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                  Sentenced
                  <input
                    type="date"
                    className={`${input} py-1`}
                    value={p.sentenceDate ?? ""}
                    onChange={(e) => update(p.id, { sentenceDate: e.target.value || null })}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                  Appeal by
                  <input
                    type="date"
                    className={`${input} py-1`}
                    value={p.appealBy ?? ""}
                    onChange={(e) => update(p.id, { appealBy: e.target.value || null })}
                    title="Blank = forum-accurate default window from the sentence date"
                  />
                </label>
              </div>
            )}

            {expanded === p.id && (
              <div className="mt-2 space-y-2 border-t border-line/50 pt-2">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-soft">LOC / Interpol notices</p>
                  <div className="space-y-1">
                    {(p.loc ?? []).map((l) => (
                      <div key={l.id} className="flex items-center gap-2">
                        <select className={`${input} py-1`} value={l.type} onChange={(e) => updLoc(p, l.id, { type: e.target.value as LocNotice["type"] })}>
                          {LOC_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <DeferredInput className={`${input} flex-1 py-1`} value={l.ref ?? ""} onCommit={(v) => updLoc(p, l.id, { ref: v || undefined })} placeholder="ref / notice no." aria-label="Notice reference" />
                        <DeferredInput className={`${input} w-28 py-1`} value={l.status ?? ""} onCommit={(v) => updLoc(p, l.id, { status: v || undefined })} placeholder="status" aria-label="Notice status" />
                        <button onClick={() => delLoc(p, l.id)} className="px-1.5 py-1 text-xs text-soft hover:text-critical" aria-label="Remove notice" title="Remove notice">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addLoc(p)} className="mt-1 rounded border border-line px-2.5 py-1.5 text-xs text-court">+ notice</button>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-soft">Custody history</p>
                  <div className="space-y-1">
                    {(p.custodyHistory ?? []).map((h) => (
                      <div key={h.id} className="flex items-center gap-2">
                        <select className={`${input} py-1`} value={h.kind ?? "judicial"} onChange={(e) => updCustody(p, h.id, { kind: e.target.value as CustodyHistoryEntry["kind"] })}>
                          <option value="police">PC</option>
                          <option value="judicial">JC</option>
                          <option value="other">other</option>
                        </select>
                        <input type="date" className={`${input} py-1`} value={h.from ?? ""} onChange={(e) => updCustody(p, h.id, { from: e.target.value || null })} />
                        <span className="text-xs text-soft">→</span>
                        <input type="date" className={`${input} py-1`} value={h.to ?? ""} onChange={(e) => updCustody(p, h.id, { to: e.target.value || null })} />
                        <button onClick={() => delCustody(p, h.id)} className="px-1.5 py-1 text-xs text-soft hover:text-critical" aria-label="Remove custody spell" title="Remove custody spell">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addCustody(p)} className="mt-1 rounded border border-line px-2.5 py-1.5 text-xs text-court">+ custody spell</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <input
          className={`${input} flex-1`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add accused — name"
        />
        <select className={input} value={newStatus} onChange={(e) => setNewStatus(e.target.value as AccusedStatus)}>
          {ACCUSED_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {ACCUSED_STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={input}
          value={newArrest}
          onChange={(e) => setNewArrest(e.target.value)}
          aria-label="Date of arrest"
          title="Date of arrest — starts the FR & custody clocks (enter first)"
        />
        <button onClick={add} disabled={!newName.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>
          Add
        </button>
      </div>
      {needsArrestDate(newStatus) && !newArrest && (
        <p className="mt-1.5 text-[11px] text-statutory">The chosen status implies arrest — enter the arrest date so the FR clock starts.</p>
      )}
    </Section>
  );
}
