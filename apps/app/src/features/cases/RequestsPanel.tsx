/**
 * Process & Requests tracker (REQUIREMENTS §6) — formal requests raised during
 * arrest / investigation (LOC, MLA / Letters Rogatory, Interpol, NBW, FRRO/MEA,
 * sanctions…), linked to the accused. The expected-response date drives the §6
 * overdue alert. Mirrors EvidencePanel / AccusedPanel CRUD conventions.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  PROCESS_REQUEST_LABEL,
  processRequestLabel,
  type ProcessRequestRecord,
  type ProcessRequestStatus,
  type ProcessRequestType,
} from "@/domain/types";
import { diffDays, todayISO, type ISODate } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const TYPES = Object.keys(PROCESS_REQUEST_LABEL) as ProcessRequestType[];
const STATUSES: ProcessRequestStatus[] = ["requested", "pending", "granted", "executed", "rejected"];

/** §6: a still-open request is overdue once its expected-response date passes. */
export function requestOverdue(r: ProcessRequestRecord, today: ISODate): boolean {
  if (!r.expectedResponseDate) return false;
  if (r.status !== "requested" && r.status !== "pending") return false;
  return diffDays(today, r.expectedResponseDate) > 0;
}

export function RequestsPanel({
  agg,
  onSaveRequests,
}: {
  agg: CaseAggregate;
  onSaveRequests: (requests: ProcessRequestRecord[]) => Promise<void>;
}) {
  const requests = agg.processRequests ?? [];
  const accused = agg.persons.filter((p) => p.role === "accused");
  const today = todayISO();
  const [type, setType] = useState<ProcessRequestType>("LOC");
  const [refNo, setRefNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function add() {
    if (busy) return;
    setBusy(true);
    const r: ProcessRequestRecord = {
      id: newId("req"),
      caseId: agg.case.id,
      type,
      accusedIds: [],
      refNo: refNo.trim() || undefined,
      status: "requested",
    };
    try {
      await onSaveRequests([...requests, r]);
      setRefNo("");
      setExpanded(r.id);
    } finally {
      setBusy(false);
    }
  }
  const update = (id: string, patch: Partial<ProcessRequestRecord>) =>
    onSaveRequests(requests.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onSaveRequests(requests.filter((r) => r.id !== id));
  const toggleAccused = (r: ProcessRequestRecord, pid: string) =>
    update(r.id, {
      accusedIds: r.accusedIds.includes(pid) ? r.accusedIds.filter((x) => x !== pid) : [...r.accusedIds, pid],
    });

  const overdueCount = requests.filter((r) => requestOverdue(r, today)).length;
  const nameOf = (pid: string) => accused.find((p) => p.id === pid)?.name ?? "?";

  return (
    <Section
      title="Process & Requests"
      hint={`${requests.length}${overdueCount ? ` · ${overdueCount} overdue` : ""}`}
      className="mt-3"
    >
      <div className="space-y-2">
        {requests.map((r) => {
          const overdue = requestOverdue(r, today);
          return (
            <div key={r.id} className={`rounded-xl p-2.5 ${overdue ? "bg-critical/10 ring-1 ring-critical/40" : "bg-surface-3/40"}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 rounded-md border border-violet-500/30 bg-violet-100 px-1.5 py-0.5 text-[11px] text-violet-900">
                  {processRequestLabel(r)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-dim">
                  {r.refNo ? <Highlighted text={r.refNo} /> : <span className="text-soft">no ref</span>}
                  {r.accusedIds.length > 0 && <span className="text-soft"> · {r.accusedIds.map(nameOf).join(", ")}</span>}
                </span>
                {overdue && (
                  <span className="shrink-0 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                    OVERDUE
                  </span>
                )}
                <span className="shrink-0 text-[11px] text-ink-dim">{r.status}</span>
                <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-xs text-court">
                  {expanded === r.id ? "▾" : "▸"}
                </button>
                <button onClick={() => remove(r.id)} className="text-xs text-soft hover:text-critical">✕</button>
              </div>
              {r.expectedResponseDate && (
                <p className="mt-1 text-[11px] text-ink-dim">
                  expected response {fmtDate(r.expectedResponseDate)}
                  {overdue && <span className="font-medium text-critical"> · response overdue</span>}
                </p>
              )}

              {expanded === r.id && (
                <div className="mt-2 space-y-2 border-t border-line/50 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <select className={`${input} py-1`} value={r.type} onChange={(e) => update(r.id, { type: e.target.value as ProcessRequestType })}>
                      {TYPES.map((t) => (
                        <option key={t} value={t}>{PROCESS_REQUEST_LABEL[t]}</option>
                      ))}
                    </select>
                    <select className={`${input} py-1`} value={r.status} onChange={(e) => update(r.id, { status: e.target.value as ProcessRequestStatus })}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {r.type === "custom" && (
                    <input className={`${input} w-full py-1`} value={r.customLabel ?? ""} onChange={(e) => update(r.id, { customLabel: e.target.value || undefined })} placeholder="Custom request label (e.g. FRRO / MEA verification)" />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <input className={`${input} flex-1 py-1`} value={r.refNo ?? ""} onChange={(e) => update(r.id, { refNo: e.target.value || undefined })} placeholder="reference / letter no." />
                    <input className={`${input} flex-1 py-1`} value={r.authority ?? ""} onChange={(e) => update(r.id, { authority: e.target.value || undefined })} placeholder="authority addressed" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
                    <label className="flex items-center gap-1">raised<input type="date" className={`${input} py-1`} value={r.dateRaised ?? ""} onChange={(e) => update(r.id, { dateRaised: e.target.value || null })} /></label>
                    <label className="flex items-center gap-1">expected response<input type="date" className={`${input} py-1`} value={r.expectedResponseDate ?? ""} onChange={(e) => update(r.id, { expectedResponseDate: e.target.value || null })} /></label>
                  </div>
                  {accused.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-soft">Linked accused</p>
                      <div className="flex flex-wrap gap-2">
                        {accused.map((p) => (
                          <label key={p.id} className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-dim">
                            <input type="checkbox" checked={r.accusedIds.includes(p.id)} onChange={() => toggleAccused(r, p.id)} />
                            <Highlighted text={p.name} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <input className={`${input} w-full py-1`} value={r.note ?? ""} onChange={(e) => update(r.id, { note: e.target.value || undefined })} placeholder="note (optional)" />
                </div>
              )}
            </div>
          );
        })}
        {requests.length === 0 && <p className="py-2 text-center text-sm text-soft">No requests logged</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <select className={input} value={type} onChange={(e) => setType(e.target.value as ProcessRequestType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{PROCESS_REQUEST_LABEL[t]}</option>
          ))}
        </select>
        <input className={`${input} flex-1`} value={refNo} onChange={(e) => setRefNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="reference / letter no. (optional)" />
        <button onClick={add} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>Add request</button>
      </div>
    </Section>
  );
}
