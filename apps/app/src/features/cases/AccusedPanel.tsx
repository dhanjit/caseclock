/**
 * Accused panel (REQUIREMENTS §6 / heading 12) — manage the accused list with
 * the officer's 11-value status, plus per-accused LOC/Interpol notices and custody
 * history (§5 / §4.1). Names auto-highlight against the watchlist.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { AccusedStatus, CustodyHistoryEntry, LocNotice, PersonRecord } from "@/domain/types";
import { ACCUSED_STATUS_META, ACCUSED_STATUS_ORDER, accusedStatusMeta } from "@/domain/accused";
import { newId } from "@/lib/id";
import { Section } from "@/features/components/bits";
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
  onSavePersons: (persons: PersonRecord[]) => Promise<void>;
}) {
  const accused = agg.persons.filter((p) => p.role === "accused");
  const others = agg.persons.filter((p) => p.role !== "accused");
  const watchAdd = useWatchlist((s) => s.add);
  const watchNames = useWatchlist((s) => s.names);
  const onWatch = (name: string) => watchNames.some((x) => x.toLowerCase() === name.toLowerCase());
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<AccusedStatus>("not_arrested");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function commit(next: PersonRecord[]) {
    setBusy(true);
    try {
      await onSavePersons([...others, ...next]);
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
    };
    await commit([...accused, p]);
    setNewName("");
    setNewStatus("not_arrested");
  }
  const update = (id: string, patch: Partial<PersonRecord>) =>
    commit(accused.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => commit(accused.filter((p) => p.id !== id));

  const addLoc = (p: PersonRecord) => update(p.id, { loc: [...(p.loc ?? []), { id: newId("loc"), type: "LOC" }] });
  const updLoc = (p: PersonRecord, id: string, patch: Partial<LocNotice>) =>
    update(p.id, { loc: (p.loc ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const delLoc = (p: PersonRecord, id: string) => update(p.id, { loc: (p.loc ?? []).filter((l) => l.id !== id) });
  const addCustody = (p: PersonRecord) =>
    update(p.id, { custodyHistory: [...(p.custodyHistory ?? []), { id: newId("ch"), kind: "judicial" }] });
  const updCustody = (p: PersonRecord, id: string, patch: Partial<CustodyHistoryEntry>) =>
    update(p.id, { custodyHistory: (p.custodyHistory ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  const delCustody = (p: PersonRecord, id: string) =>
    update(p.id, { custodyHistory: (p.custodyHistory ?? []).filter((h) => h.id !== id) });

  return (
    <Section title="Accused" hint={`${accused.length} · 11-status`} className="mt-3">
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
              {((p.loc?.length ?? 0) > 0 || (p.custodyHistory?.length ?? 0) > 0) && (
                <span className="shrink-0 text-[11px] text-soft">
                  {(p.loc?.length ?? 0) > 0 && `${p.loc!.length} LOC`}
                  {(p.custodyHistory?.length ?? 0) > 0 && ` ${p.custodyHistory!.length} cust`}
                </span>
              )}
              {!onWatch(p.name) ? (
                <button onClick={() => watchAdd(p.name)} className="text-xs text-soft hover:text-critical" title="Flag on watchlist (auto-RED everywhere)">
                  ⚑
                </button>
              ) : (
                <span className="text-xs text-critical" title="On watchlist">⚑</span>
              )}
              <button onClick={() => remove(p.id)} className="text-xs text-soft hover:text-critical" title="Remove">
                ✕
              </button>
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
                        <input className={`${input} flex-1 py-1`} value={l.ref ?? ""} onChange={(e) => updLoc(p, l.id, { ref: e.target.value || undefined })} placeholder="ref / notice no." />
                        <input className={`${input} w-28 py-1`} value={l.status ?? ""} onChange={(e) => updLoc(p, l.id, { status: e.target.value || undefined })} placeholder="status" />
                        <button onClick={() => delLoc(p, l.id)} className="text-xs text-soft hover:text-critical">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addLoc(p)} className="mt-1 text-xs text-court">+ notice</button>
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
                        <button onClick={() => delCustody(p, h.id)} className="text-xs text-soft hover:text-critical">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addCustody(p)} className="mt-1 text-xs text-court">+ custody spell</button>
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
        <button onClick={add} disabled={!newName.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>
          Add
        </button>
      </div>
    </Section>
  );
}
