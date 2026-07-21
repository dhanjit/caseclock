/** Evidence ↔ report mapping + No. of witnesses (REQUIREMENTS §5 / heading 9).
 * Expert reports carry a forwarding date that drives the 7-day auto-alert
 * (V4-DELTA Q1). Receiving a report offers an observation (V4-DELTA N5):
 * High-flagged remarks rise to the top and enter the briefing note. */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { EvidenceObservation, EvidenceRecord } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";
// Re-exported so existing `import { expertReportOverdue } from "./EvidencePanel"`
// callers (e.g. CaseFile.tsx) keep working after the pure helper moved to domain.
import { expertReportOverdue } from "@/domain/evidence";
export { expertReportOverdue };

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function EvidencePanel({
  agg,
  onSaveEvidence,
}: {
  agg: CaseAggregate;
  onSaveEvidence: (evidence: EvidenceRecord[] | ((prev: EvidenceRecord[]) => EvidenceRecord[])) => Promise<void>;
}) {
  const evidence = agg.evidence ?? [];
  const today = todayISO();
  const [desc, setDesc] = useState("");
  const [report, setReport] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [expert, setExpert] = useState(false);
  const [forwarded, setForwarded] = useState("");
  const [exhibitNo, setExhibitNo] = useState("");
  const [busy, setBusy] = useState(false);
  // Observation composer (V4-DELTA N5) — opened on receipt or via "+ observation".
  const [obsFor, setObsFor] = useState<string | null>(null);
  const [obsText, setObsText] = useState("");
  const [obsFlag, setObsFlag] = useState<EvidenceObservation["flag"]>("normal");
  const [removeArm, setRemoveArm] = useState<string | null>(null);

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
      exhibitNo: exhibitNo.trim() || undefined,
    };
    try {
      await onSaveEvidence((prev) => [...prev, e]);
      setDesc("");
      setReport("");
      setWitnesses("");
      setExpert(false);
      setForwarded("");
      setExhibitNo("");
    } finally {
      setBusy(false);
    }
  }
  // Read-modify-write against the LATEST array (updater form) - render-snapshot
  // arrays clobbered quick successive edits (review finding).
  const update = (id: string, patch: Partial<EvidenceRecord>) =>
    onSaveEvidence((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const patchRow = (id: string, fn: (e: EvidenceRecord) => Partial<EvidenceRecord>) =>
    onSaveEvidence((prev) => prev.map((e) => (e.id === id ? { ...e, ...fn(e) } : e)));
  const remove = (id: string) => onSaveEvidence((prev) => prev.filter((e) => e.id !== id));
  // Marking received stamps the receipt date, clears the alert, and offers the
  // officer's observation on the report (V4-DELTA N5).
  const toggleStatus = (e: EvidenceRecord) => {
    if (e.status === "pending") {
      void update(e.id, { status: "received", receivedDate: today });
      setObsFor(e.id);
      setObsText("");
      setObsFlag("normal");
    } else {
      void update(e.id, { status: "pending", receivedDate: null });
    }
  };
  const saveObservation = (e: EvidenceRecord) => {
    if (obsText.trim()) {
      const text = obsText.trim();
      const flag = obsFlag;
      void patchRow(e.id, (x) => ({
        observations: [...(x.observations ?? []), { id: newId("obs"), date: today, flag, text }],
      }));
    }
    setObsFor(null);
    setObsText("");
    setObsFlag("normal");
  };
  const setObsFlagOn = (e: EvidenceRecord, obsId: string, flag: EvidenceObservation["flag"]) =>
    patchRow(e.id, (x) => ({ observations: (x.observations ?? []).map((o) => (o.id === obsId ? { ...o, flag } : o)) }));
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
          const obs = [...(e.observations ?? [])].sort((a, b) => (a.flag === "high" ? -1 : 1) - (b.flag === "high" ? -1 : 1));
          const hasHigh = obs.some((o) => o.flag === "high");
          return (
            <div key={e.id} className={`rounded-xl p-2.5 text-sm ${overdue ? "bg-critical/10 ring-1 ring-critical/40" : "bg-surface-3/40"}`}>
              <div className="flex items-center gap-2">
                {e.exhibitNo && <span className="shrink-0 font-mono text-xs font-bold">{e.exhibitNo}</span>}
                <span className="min-w-0 flex-1 text-ink"><Highlighted text={e.description} /></span>
                {hasHigh && <span title="High-flagged observation" className="shrink-0 text-xs">⭐</span>}
                {overdue && (
                  <span className="shrink-0 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                    REPORT OVERDUE
                  </span>
                )}
                {removeArm === e.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-[10px] font-semibold text-critical">Delete row?</span>
                    <button onClick={() => { void remove(e.id); setRemoveArm(null); }} className="rounded bg-critical px-2 py-1 text-[11px] font-semibold text-white" aria-label={`Delete ${e.description}`}>Delete</button>
                    <button onClick={() => setRemoveArm(null)} className="rounded border border-line px-2 py-1 text-[11px]" aria-label="Keep row">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setRemoveArm(e.id)} className="px-1.5 py-1 text-xs text-soft hover:text-critical" title="Remove evidence row" aria-label={`Remove ${e.description}`}>✕</button>
                )}
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
              {obs.length > 0 && (
                <ul className="mt-1.5 space-y-1 border-t border-line/40 pt-1.5">
                  {obs.map((o) => (
                    <li key={o.id} className={`flex items-start gap-2 rounded px-2 py-1 text-xs ${o.flag === "high" ? "bg-red-bg/60" : "bg-surface-2"}`}>
                      <button
                        onClick={() => void setObsFlagOn(e, o.id, o.flag === "high" ? "normal" : "high")}
                        title={o.flag === "high" ? "High — tap to set Normal" : "Normal — tap to flag High (enters the briefing note)"}
                        aria-label={o.flag === "high" ? "Set observation to Normal" : "Flag observation High"}
                        className="shrink-0 px-1.5 py-1"
                      >
                        {o.flag === "high" ? "⭐" : "📝"}
                      </button>
                      <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-dim">{fmtDate(o.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {obsFor === e.id ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-line/40 pt-1.5">
                  <input
                    className={`${input} min-w-44 flex-1 py-1 text-xs`}
                    value={obsText}
                    onChange={(ev) => setObsText(ev.target.value)}
                    onKeyDown={(ev) => ev.key === "Enter" && saveObservation(e)}
                    placeholder="Your observation on this report (what it proves / what to do)…"
                    autoFocus
                  />
                  <select value={obsFlag} onChange={(ev) => setObsFlag(ev.target.value as EvidenceObservation["flag"])} className={`${input} py-1 text-xs`} aria-label="Observation importance">
                    <option value="normal">● Normal</option>
                    <option value="high">⭐ High</option>
                  </select>
                  <button onClick={() => saveObservation(e)} className="rounded bg-ink px-3 py-1.5 font-mono text-[11px] text-surface">Save</button>
                  <button onClick={() => setObsFor(null)} className="rounded border border-line px-3 py-1.5 font-mono text-[11px]">Skip</button>
                </div>
              ) : (
                e.status === "received" && (
                  <button onClick={() => { setObsFor(e.id); setObsText(""); setObsFlag("normal"); }} className="mt-1 text-[11px] text-court">
                    + observation
                  </button>
                )
              )}
            </div>
          );
        })}
        {evidence.length === 0 && <p className="py-2 text-center text-sm text-soft">No evidence logged</p>}
      </div>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <div className="flex gap-2">
          <input className={`${input} w-24`} value={exhibitNo} onChange={(e) => setExhibitNo(e.target.value)} placeholder="Exhibit no." />
          <input className={`${input} flex-1`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Evidence (e.g. seized AK-47 rifles)" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Report to obtain (e.g. FSL ballistics)" />
          <input className={`${input} w-24`} value={witnesses} onChange={(e) => setWitnesses(e.target.value)} inputMode="numeric" placeholder="witnesses" />
          <button onClick={add} disabled={!desc.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>Add</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
            Expert report (FSL / ballistic / device imaging — 7-day alert)
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
