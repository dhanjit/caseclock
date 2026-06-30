/**
 * Case file — the officer's 13 fixed headings, in their exact order (REQUIREMENTS §3).
 * Free-text headings are editable in place; derived ones (no. of accused, court
 * matters, accused list, evidence) are pulled from the aggregate. Watchlist names
 * auto-highlight RED throughout (§5). The detailed Evidence editor (#9) is the
 * panel below the file.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  uapaSectionWithoutFlag,
  type CaseRecord,
} from "@/domain/types";
import { accusedStatusMeta } from "@/domain/accused";
import { custodySummary, accusedNotices } from "@/domain/case-rollups";
import { todayISO } from "@/rules/dates";
import { fmtDate } from "@/lib/format";
import { Section, Field } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";
import { expertReportOverdue } from "./EvidencePanel";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

function Heading({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/50 py-2 last:border-b-0">
      <p className="text-xs font-medium tracking-wide text-soft uppercase">
        {n}. {title}
      </p>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

const dash = <span className="text-soft">—</span>;
function text(v: string | null | undefined) {
  return v ? <span className="whitespace-pre-wrap"><Highlighted text={v} /></span> : dash;
}

export function CaseFile({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const accused = agg.persons.filter((p) => p.role === "accused");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // edit buffer
  const [identity, setIdentity] = useState(c.identity ?? "");
  const [sections, setSections] = useState(c.sectionsOfLaw ?? "");
  const [occurrence, setOccurrence] = useState(c.occurrenceDate ?? "");
  const [brief, setBrief] = useState(c.brief ?? "");
  const [progress, setProgress] = useState(c.investigationProgress ?? "");
  const [trialStatus, setTrialStatus] = useState(c.trialStatus ?? "");
  const [plan, setPlan] = useState(c.planOfAction ?? "");

  function startEdit() {
    setIdentity(c.identity ?? "");
    setSections(c.sectionsOfLaw ?? "");
    setOccurrence(c.occurrenceDate ?? "");
    setBrief(c.brief ?? "");
    setProgress(c.investigationProgress ?? "");
    setTrialStatus(c.trialStatus ?? "");
    setPlan(c.planOfAction ?? "");
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    try {
      await onSaveCase({
        identity: identity.trim() || undefined,
        sectionsOfLaw: sections.trim() || undefined,
        occurrenceDate: occurrence || null,
        brief: brief.trim() || undefined,
        investigationProgress: progress.trim() || undefined,
        trialStatus: trialStatus.trim() || undefined,
        planOfAction: plan.trim() || undefined,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Section title="Case file — edit" className="mt-3">
        <div className="space-y-3">
          <Field label="2. Identity of the case (one line)">
            <input className={input} value={identity} onChange={(e) => setIdentity(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="3. Sections of law">
              <input className={input} value={sections} onChange={(e) => setSections(e.target.value)} />
            </Field>
            <Field label="4. Date of occurrence">
              <input type="date" className={input} value={occurrence} onChange={(e) => setOccurrence(e.target.value)} />
            </Field>
          </div>
          <Field label="6. Brief of the case">
            <textarea className={`${input} min-h-[72px] resize-y`} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </Field>
          <Field label="8. Progress of investigation">
            <textarea className={`${input} min-h-[72px] resize-y`} value={progress} onChange={(e) => setProgress(e.target.value)} />
          </Field>
          <Field label="10. Status of trial">
            <textarea className={`${input} min-h-[56px] resize-y`} value={trialStatus} onChange={(e) => setTrialStatus(e.target.value)} />
          </Field>
          <Field label="13. Plan of action">
            <textarea className={`${input} min-h-[72px] resize-y`} value={plan} onChange={(e) => setPlan(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className={btn("ghost")}>Cancel</button>
            <button onClick={save} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>
              {busy ? "Saving…" : "Save case file"}
            </button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Case file — 13 headings"
      hint="tap Edit to update"
      className="mt-3"
    >
      <div className="-mt-1">
        <Heading n={1} title="Case number">{text(c.firNumber)}</Heading>
        <Heading n={2} title="Identity of the case">{text(c.identity)}</Heading>
        <Heading n={3} title="Sections of law">
          {text(c.sectionsOfLaw)}
          {uapaSectionWithoutFlag(c) && (
            <p className="mt-1 rounded-lg border border-statutory/40 bg-statutory/10 px-2 py-1 text-[11px] text-statutory">
              ⚠ A UAPA provision is cited but the UAPA flag is off — custody is computing on the
              scheduled 60/45 track, not UAPA 150/90. Confirm the UAPA flag if this is a UAPA case.
            </p>
          )}
        </Heading>
        <Heading n={4} title="Date of occurrence">{c.occurrenceDate ? fmtDate(c.occurrenceDate) : dash}</Heading>
        <Heading n={5} title="Date of registration">{fmtDate(c.firDate)}</Heading>
        <Heading n={6} title="Brief of the case">{text(c.brief)}</Heading>
        <Heading n={7} title="Number of accused">{accused.length}</Heading>
        <Heading n={8} title="Progress of investigation">{text(c.investigationProgress)}</Heading>
        <Heading n={9} title="Evidences collected">
          {(() => {
            const ev = agg.evidence ?? [];
            if (ev.length === 0) return <span className="text-soft">— see Evidences panel below</span>;
            const witnesses = ev.reduce((n, e) => n + (e.witnesses ?? 0), 0);
            const received = ev.filter((e) => e.status === "received").length;
            const overdue = ev.filter((e) => expertReportOverdue(e, todayISO())).length;
            return (
              <span>
                {ev.length} item(s) · {received} received · {witnesses} witness(es)
                {overdue > 0 && (
                  <span className="ml-1.5 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                    {overdue} expert report(s) overdue
                  </span>
                )}
              </span>
            );
          })()}
        </Heading>
        <Heading n={10} title="Status of trial">{text(c.trialStatus)}</Heading>
        <Heading n={11} title="Court matters">
          {agg.hearings.length === 0 ? dash : (
            <ul className="space-y-0.5">
              {agg.hearings.map((h) => (
                <li key={h.id}>{fmtDate(h.hearingDate)} — {h.purpose}{h.court ? <> · <Highlighted text={h.court} /></> : ""}</li>
              ))}
            </ul>
          )}
        </Heading>
        <Heading n={12} title="List of accused with status (incl. LOC / Interpol + custody history)">
          {accused.length === 0 ? dash : (
            <ul className="space-y-1.5">
              {accused.map((p) => {
                const custody = custodySummary(p);
                const notices = accusedNotices(p, agg.processRequests ?? []);
                return (
                  <li key={p.id} className="rounded-md border border-line/60 px-2 py-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Highlighted text={p.name} />
                      {p.accusedStatus && (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${accusedStatusMeta(p.accusedStatus).badge}`}>
                          {accusedStatusMeta(p.accusedStatus).label}
                        </span>
                      )}
                    </div>
                    {custody && <p className="mt-0.5 text-[11px] text-ink-dim">Custody: {custody}</p>}
                    {notices && <p className="text-[11px] text-ink-dim">LOC / Interpol: <Highlighted text={notices} /></p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Heading>
        <Heading n={13} title="Plan of action">{text(c.planOfAction)}</Heading>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={startEdit} className={btn("ghost")}>Edit case file</button>
      </div>
    </Section>
  );
}
