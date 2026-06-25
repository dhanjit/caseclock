/**
 * Trial & court timeline (REQUIREMENTS §4.2) — the anchors the court-trial
 * engine reads: committal, charge-framing, arguments, judgment, victim update,
 * trial-court level, outcome, death sentence, appeal. Without these the committal,
 * discharge, judgment-30, victim-90 and appeal-limitation clocks can never fire.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { CaseRecord, Outcome, TrialCourtLevel } from "@/domain/types";
import { fmtDate } from "@/lib/format";
import { Section, Field } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function TrialPanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [level, setLevel] = useState<TrialCourtLevel | "">(c.trialCourtLevel ?? "");
  const [cognizance, setCognizance] = useState(c.cognizanceDate ?? "");
  const [firstAppearance, setFirstAppearance] = useState(c.accusedFirstAppearanceDate ?? "");
  const [committal, setCommittal] = useState(c.committalOrderDate ?? "");
  const [framing, setFraming] = useState(c.chargeFramingDate ?? "");
  const [args, setArgs] = useState(c.argumentsConcludedDate ?? "");
  const [judgment, setJudgment] = useState(c.judgmentDate ?? "");
  const [victim, setVictim] = useState(c.victimUpdatedDate ?? "");
  const [outcome, setOutcome] = useState<Outcome>(c.outcome ?? "pending");
  const [death, setDeath] = useState(!!c.deathSentence);
  const [appealDecided, setAppealDecided] = useState(!!c.appealDecided);

  async function save() {
    setBusy(true);
    try {
      await onSaveCase({
        trialCourtLevel: (level || null) as TrialCourtLevel | null,
        cognizanceDate: cognizance || null,
        accusedFirstAppearanceDate: firstAppearance || null,
        committalOrderDate: committal || null,
        chargeFramingDate: framing || null,
        argumentsConcludedDate: args || null,
        judgmentDate: judgment || null,
        victimUpdatedDate: victim || null,
        outcome,
        deathSentence: death,
        appealDecided,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Section title="Trial & court timeline — edit" className="mt-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trial court level">
              <select className={input} value={level} onChange={(e) => setLevel(e.target.value as TrialCourtLevel | "")}>
                <option value="">—</option>
                <option value="magistrate">Magistrate</option>
                <option value="sessions">Sessions</option>
                <option value="high_court">High Court</option>
              </select>
            </Field>
            <Field label="Outcome">
              <select className={input} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
                <option value="pending">Pending</option>
                <option value="convicted">Convicted</option>
                <option value="acquitted">Acquitted</option>
              </select>
            </Field>
            <Field label="Cognizance"><input type="date" className={input} value={cognizance} onChange={(e) => setCognizance(e.target.value)} /></Field>
            <Field label="Accused first appearance"><input type="date" className={input} value={firstAppearance} onChange={(e) => setFirstAppearance(e.target.value)} /></Field>
            <Field label="Committal order (sessions)"><input type="date" className={input} value={committal} onChange={(e) => setCommittal(e.target.value)} /></Field>
            <Field label="Charge framing"><input type="date" className={input} value={framing} onChange={(e) => setFraming(e.target.value)} /></Field>
            <Field label="Arguments concluded"><input type="date" className={input} value={args} onChange={(e) => setArgs(e.target.value)} /></Field>
            <Field label="Judgment"><input type="date" className={input} value={judgment} onChange={(e) => setJudgment(e.target.value)} /></Field>
            <Field label="Victim last updated"><input type="date" className={input} value={victim} onChange={(e) => setVictim(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-sm text-ink-dim">
              <input type="checkbox" checked={death} onChange={(e) => setDeath(e.target.checked)} /> Death sentence
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-dim">
              <input type="checkbox" checked={appealDecided} onChange={(e) => setAppealDecided(e.target.checked)} /> Appeal filed / decided
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className={btn("ghost")}>Cancel</button>
            <button onClick={save} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Trial & court timeline" hint={c.trialCourtLevel ?? "set court level"} className="mt-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <Row k="Court level" v={c.trialCourtLevel ?? "—"} />
        <Row k="Outcome" v={c.outcome ?? "pending"} />
        <Row k="Cognizance" v={fmtDate(c.cognizanceDate)} />
        <Row k="Committal" v={fmtDate(c.committalOrderDate)} />
        <Row k="Charge framing" v={fmtDate(c.chargeFramingDate)} />
        <Row k="Arguments concluded" v={fmtDate(c.argumentsConcludedDate)} />
        <Row k="Judgment" v={fmtDate(c.judgmentDate)} />
        <Row k="Victim updated" v={fmtDate(c.victimUpdatedDate)} />
      </dl>
      <div className="mt-3 flex justify-end">
        <button onClick={() => setEditing(true)} className={btn("ghost")}>Edit timeline</button>
      </div>
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-line/40 py-1">
      <dt className="text-ink-dim">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
