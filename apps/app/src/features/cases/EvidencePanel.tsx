/** Evidence ↔ report mapping + No. of witnesses (REQUIREMENTS §5 / heading 9). */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { EvidenceRecord } from "@/domain/types";
import { newId } from "@/lib/id";
import { Section } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function EvidencePanel({
  agg,
  onSaveEvidence,
}: {
  agg: CaseAggregate;
  onSaveEvidence: (evidence: EvidenceRecord[]) => Promise<void>;
}) {
  const evidence = agg.evidence ?? [];
  const [desc, setDesc] = useState("");
  const [report, setReport] = useState("");
  const [witnesses, setWitnesses] = useState("");
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
    };
    try {
      await onSaveEvidence([...evidence, e]);
      setDesc("");
      setReport("");
      setWitnesses("");
    } finally {
      setBusy(false);
    }
  }
  const update = (id: string, patch: Partial<EvidenceRecord>) =>
    onSaveEvidence(evidence.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onSaveEvidence(evidence.filter((e) => e.id !== id));
  const totalWitnesses = evidence.reduce((n, e) => n + (e.witnesses ?? 0), 0);

  return (
    <Section title="Evidences collected" hint={`${evidence.length} · ${totalWitnesses} witnesses`} className="mt-3">
      <div className="space-y-1.5">
        {evidence.map((e) => (
          <div key={e.id} className="rounded-xl bg-surface-3/40 p-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-ink"><Highlighted text={e.description} /></span>
              <button onClick={() => remove(e.id)} className="text-xs text-soft hover:text-critical">✕</button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-dim">
              {e.reportToObtain && <span>→ report: <Highlighted text={e.reportToObtain} /></span>}
              {e.witnesses != null && <span>· {e.witnesses} witness(es)</span>}
              <button
                onClick={() => update(e.id, { status: e.status === "pending" ? "received" : "pending" })}
                className={`ml-auto rounded border px-1.5 py-0.5 ${e.status === "received" ? "border-ok/40 bg-ok/15 text-ok" : "border-statutory/40 bg-statutory/15 text-statutory"}`}
              >
                {e.status}
              </button>
            </div>
          </div>
        ))}
        {evidence.length === 0 && <p className="py-2 text-center text-sm text-soft">No evidence logged</p>}
      </div>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <input className={`${input} w-full`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Evidence (e.g. seized AK-47 rifles)" />
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Report to obtain (e.g. FSL ballistics)" />
          <input className={`${input} w-24`} value={witnesses} onChange={(e) => setWitnesses(e.target.value)} inputMode="numeric" placeholder="witnesses" />
          <button onClick={add} disabled={!desc.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>Add</button>
        </div>
      </div>
    </Section>
  );
}
