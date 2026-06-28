/** Evidence ↔ report mapping + No. of witnesses (REQUIREMENTS §5 / heading 9).
 * Expert reports carry a forwarding date that drives the §4.1 2-day auto-alert. */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { EvidenceRecord } from "@/domain/types";
import { addDays, diffDays, todayISO, type ISODate } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

/** §4.1: an expert report pending beyond 2 days from forwarding is overdue (RED). */
export function expertReportOverdue(e: EvidenceRecord, today: ISODate): boolean {
  if (e.reportKind !== "expert" || !e.forwardedDate || e.status === "received") return false;
  return diffDays(today, addDays(e.forwardedDate, 2)) >= 0;
}

export function EvidencePanel({
  agg,
  onSaveEvidence,
}: {
  agg: CaseAggregate;
  onSaveEvidence: (evidence: EvidenceRecord[]) => Promise<void>;
}) {
  const evidence = agg.evidence ?? [];
  const today = todayISO();
  const [desc, setDesc] = useState("");
  const [report, setReport] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [expert, setExpert] = useState(false);
  const [forwarded, setForwarded] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!desc.trim() || busy) return;
    setBusy(true);
    const e: EvidenceRecord = {
      id: newId("ev"),
      caseId: agg.case.id,
      description: desc.trim(),
      reportToObtain: report.trim() || undefined,
      status: "pending",
      witnesses: witnesses ? Number(witnesses) : null,
      reportKind: expert ? "expert" : "other",
      forwardedDate: forwarded || null,
    };
    try {
      await onSaveEvidence([...evidence, e]);
      setDesc("");
      setReport("");
      setWitnesses("");
      setExpert(false);
      setForwarded("");
    } finally {
      setBusy(false);
    }
  }
  const update = (id: string, patch: Partial<EvidenceRecord>) =>
    onSaveEvidence(evidence.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onSaveEvidence(evidence.filter((e) => e.id !== id));
  // Marking received stamps the receipt date and clears the alert (§4.1).
  const toggleStatus = (e: EvidenceRecord) =>
    update(e.id, e.status === "pending" ? { status: "received", receivedDate: today } : { status: "pending", receivedDate: null });
  const totalWitnesses = evidence.reduce((n, e) => n + (e.witnesses ?? 0), 0);
  const overdueCount = evidence.filter((e) => expertReportOverdue(e, today)).length;

  return (
    <Section
      title="Evidences collected"
      hint={`${evidence.length} · ${totalWitnesses} witnesses${overdueCount ? ` · ${overdueCount} report overdue` : ""}`}
      className="mt-3"
    >
      <div className="space-y-1.5">
        {evidence.map((e) => {
          const overdue = expertReportOverdue(e, today);
          return (
            <div key={e.id} className={`rounded-xl p-2.5 text-sm ${overdue ? "bg-critical/10 ring-1 ring-critical/40" : "bg-surface-3/40"}`}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-ink"><Highlighted text={e.description} /></span>
                {overdue && (
                  <span className="shrink-0 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                    REPORT OVERDUE
                  </span>
                )}
                <button onClick={() => remove(e.id)} className="text-xs text-soft hover:text-critical">✕</button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-dim">
                {e.reportToObtain && <span>→ report: <Highlighted text={e.reportToObtain} /></span>}
                {e.witnesses != null && <span>· {e.witnesses} witness(es)</span>}
                <label className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={e.reportKind === "expert"} onChange={(ev) => update(e.id, { reportKind: ev.target.checked ? "expert" : "other" })} />
                  expert
                </label>
                {e.reportKind === "expert" && (
                  <label className="flex items-center gap-1 text-[11px]">
                    forwarded
                    <input type="date" className={`${input} px-1.5 py-0.5 text-[11px]`} value={e.forwardedDate ?? ""} onChange={(ev) => update(e.id, { forwardedDate: ev.target.value || null })} />
                  </label>
                )}
                {e.status === "received" && e.receivedDate && <span className="text-ok">· received {fmtDate(e.receivedDate)}</span>}
                <button
                  onClick={() => toggleStatus(e)}
                  className={`ml-auto rounded border px-1.5 py-0.5 ${e.status === "received" ? "border-ok/40 bg-ok/15 text-ok" : "border-statutory/40 bg-statutory/15 text-statutory"}`}
                >
                  {e.status}
                </button>
              </div>
            </div>
          );
        })}
        {evidence.length === 0 && <p className="py-2 text-center text-sm text-soft">No evidence logged</p>}
      </div>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <input className={`${input} w-full`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Evidence (e.g. seized AK-47 rifles)" />
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Report to obtain (e.g. FSL ballistics)" />
          <input className={`${input} w-24`} value={witnesses} onChange={(e) => setWitnesses(e.target.value)} inputMode="numeric" placeholder="witnesses" />
          <button onClick={add} disabled={!desc.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>Add</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
            Expert report (FSL / ballistic / device imaging — 2-day alert)
          </label>
          {expert && (
            <label className="flex items-center gap-1.5">
              Forwarded on
              <input type="date" className={`${input} py-1`} value={forwarded} onChange={(e) => setForwarded(e.target.value)} />
            </label>
          )}
        </div>
      </div>
    </Section>
  );
}
