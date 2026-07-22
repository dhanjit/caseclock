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
  accusedStatusCounts,
  CASE_CATEGORIES,
  CASE_CATEGORY_META,
  uapaSectionWithoutFlag,
  type CaseRecord,
  type ChargesheetRecord,
} from "@/domain/types";
import { accusedStatusMeta } from "@/domain/accused";
import { custodySummary, accusedNotices } from "@/domain/case-rollups";
import { newId } from "@/lib/id";
import { todayISO } from "@/rules/dates";
import { fmtDate } from "@/lib/format";
import { Section, Field } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";
import { useCio } from "@/state/cio";
import { ProgressLogPanel, PlanLogPanel } from "./LogPanels";
import type { HearingRecord, PlanEntry, ProgressEntry } from "@/domain/types";
import { expertReportOverdue } from "./EvidencePanel";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

function Heading({ n, title, children }: { n: number | string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/50 py-2 last:border-b-0">
      <p className="flex items-baseline gap-2">
        <span className="heading-chip">{n}</span>
        <span className="text-xs font-medium tracking-wide text-soft uppercase">{title}</span>
      </p>
      <div className="mt-0.5 pl-8 text-sm text-ink">{children}</div>
    </div>
  );
}

/** H7 (V7-7) — the standard supervisor breakdown, computed from heading 12. */
function AccusedCountTable({ agg }: { agg: CaseAggregate }) {
  const rows = accusedStatusCounts(agg.persons);
  if (rows[0].count === 0) return <span className="text-soft">— no accused entered (heading 12) —</span>;
  return (
    <table className="w-full max-w-xs border-collapse text-[13px]">
      <tbody>
        {rows.map((r, i) => (
            <tr key={r.label} className={i === 0 ? "bg-surface-3 font-semibold" : "border-t border-surface-3"}>
              <td className="px-2 py-1">{r.label}</td>
              <td className="px-2 py-1 text-right font-mono font-semibold">{r.count}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

/** Chargesheet register (V4-DELTA N1) — main + supplementaries; edit-only, no delete. */
function ChargesheetRegister({
  agg,
  onSave,
}: {
  agg: CaseAggregate;
  onSave?: (rows: ChargesheetRecord[] | ((prev: ChargesheetRecord[]) => ChargesheetRecord[])) => Promise<void>;
}) {
  const rows = agg.chargesheets ?? [];
  const accused = agg.persons.filter((p) => p.role === "accused");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"main" | "supplementary">(rows.length ? "supplementary" : "main");
  const [date, setDate] = useState("");
  const [court, setCourt] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  // Row edit (edit-only register: rows are corrected, never deleted — a mistyped
  // date was otherwise unrepairable and drove every filing-date consumer).
  const [editId, setEditId] = useState<string | null>(null);
  const name = (id: string) => accused.find((p) => p.id === id)?.name ?? id;

  function startRowEdit(cs: ChargesheetRecord) {
    setEditId(cs.id);
    setKind(cs.kind);
    setDate(cs.date);
    setCourt(cs.court ?? "");
    setIds(cs.accusedIds);
    setAdding(false);
  }
  async function saveRowEdit() {
    if (!date || !onSave || !editId) return;
    const id = editId;
    const patch = { kind, date, court: court.trim() || undefined, accusedIds: ids };
    await onSave((prev) => prev.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)));
    setEditId(null);
    setCourt("");
    setIds([]);
    setDate("");
  }

  async function add() {
    if (!date || !onSave) return;
    await onSave((prev) => [
      ...prev,
      { id: newId("cs"), caseId: agg.case.id, kind, date, court: court.trim() || undefined, accusedIds: ids },
    ]);
    setAdding(false);
    setCourt("");
    setIds([]);
    setDate("");
    setKind("supplementary");
  }

  return (
    <div className="mb-2 rounded-lg border border-line bg-surface-2">
      <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
        <span className="eyebrow">Chargesheet register — {rows.length} filed</span>
        {onSave && !adding && (
          <button onClick={() => setAdding(true)} className="ml-auto rounded border border-line px-2 py-1 font-mono text-[11px] text-court">
            + Record chargesheet
          </button>
        )}
      </div>
      {rows.length === 0 && !adding && (
        <p className="px-3 py-2 text-sm italic text-ink-dim">No chargesheet filed yet — pre-chargesheet stage; FR &amp; custody clocks govern.</p>
      )}
      {rows.length > 0 && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-ink text-left font-mono text-[10px] uppercase tracking-wider text-surface">
              <th className="px-3 py-1.5">Chargesheet</th>
              <th className="px-3 py-1.5">Date filed</th>
              <th className="px-3 py-1.5">Court / CC no.</th>
              <th className="px-3 py-1.5">Accused covered</th>
              <th className="w-14 px-3 py-1.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((cs, i) => (
                <tr key={cs.id} className="border-t border-surface-3 align-top">
                  <td className="px-3 py-1.5 font-semibold">{cs.kind === "main" ? `Main (CS-${i + 1})` : `Supplementary (CS-${i + 1})`}</td>
                  <td className="px-3 py-1.5 font-mono">{fmtDate(cs.date)}</td>
                  <td className="px-3 py-1.5">{cs.court || "—"}</td>
                  <td className="px-3 py-1.5">{cs.accusedIds.length ? cs.accusedIds.map(name).join("; ") : "— case-wide —"}</td>
                  <td className="px-3 py-1.5 text-right">
                    {onSave && editId !== cs.id && (
                      <button onClick={() => startRowEdit(cs)} className="rounded border border-line px-2 py-1 font-mono text-[10px] text-court" aria-label={`Edit chargesheet of ${fmtDate(cs.date)}`}>
                        edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {(adding || editId) && (
        <div className="space-y-2 border-t border-line/60 bg-surface-3 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as "main" | "supplementary")} className="rounded border border-line bg-surface-2 px-2 py-1.5 text-sm">
              <option value="main">Main</option>
              <option value="supplementary">Supplementary</option>
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-line bg-surface-2 px-2 py-1.5 text-sm" aria-label="Date filed" />
            <input value={court} onChange={(e) => setCourt(e.target.value)} placeholder="Court / CC no." className="min-w-40 flex-1 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm" />
          </div>
          {accused.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {accused.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={ids.includes(p.id)}
                    onChange={(e) => setIds((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setEditId(null); }} className={btn("ghost")}>Cancel</button>
            <button onClick={() => void (editId ? saveRowEdit() : add())} disabled={!date} className={`${btn("primary")} disabled:opacity-40`}>
              {editId ? "Save correction" : "Record"}
            </button>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <p className="border-t border-line/60 px-3 py-1.5 text-[11px] text-ink-dim">
          Edit-only register — the record is preserved; the FR pipeline closes on the first filing.
        </p>
      )}
    </div>
  );
}

const dash = <span className="text-soft">—</span>;
function text(v: string | null | undefined) {
  return v ? <span className="whitespace-pre-wrap"><Highlighted text={v} /></span> : dash;
}

type ArrUpd<T> = (v: T[] | ((prev: T[]) => T[])) => Promise<void>;

export function CaseFile({
  agg,
  onSaveCase,
  onSaveChargesheets,
  onSaveProgress,
  onSavePlan,
  onSaveHearings,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
  onSaveChargesheets?: ArrUpd<ChargesheetRecord>;
  onSaveProgress?: ArrUpd<ProgressEntry>;
  onSavePlan?: ArrUpd<PlanEntry>;
  onSaveHearings?: ArrUpd<HearingRecord>;
}) {
  const c = agg.case;
  const accused = agg.persons.filter((p) => p.role === "accused");
  const cioById = useCio((s) => s.getById);
  const officers = useCio((s) => s.officers);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // edit buffer
  const [identity, setIdentity] = useState(c.identity ?? "");
  const [sections, setSections] = useState(c.sectionsOfLaw ?? "");
  const [occurrence, setOccurrence] = useState(c.occurrenceDate ?? "");
  const [brief, setBrief] = useState(c.brief ?? "");
  const [trialStatus, setTrialStatus] = useState(c.trialStatus ?? "");
  // V7 docket-of-record fields (H1.1 / H5.1–5.3) + Cat I–V
  const [originalFir, setOriginalFir] = useState(c.originalFir ?? "");
  const [cioId, setCioId] = useState(c.cioId ?? "");
  const [complainant, setComplainant] = useState(c.complainant ?? "");
  const [trialCourt, setTrialCourt] = useState(c.trialCourtName ?? "");
  const [category, setCategory] = useState(c.category ?? "I");

  function startEdit() {
    setIdentity(c.identity ?? "");
    setSections(c.sectionsOfLaw ?? "");
    setOccurrence(c.occurrenceDate ?? "");
    setBrief(c.brief ?? "");
    setTrialStatus(c.trialStatus ?? "");
    setOriginalFir(c.originalFir ?? "");
    setCioId(c.cioId ?? "");
    setComplainant(c.complainant ?? "");
    setTrialCourt(c.trialCourtName ?? "");
    setCategory(c.category ?? "I");
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
        trialStatus: trialStatus.trim() || undefined,
        originalFir: originalFir.trim() || undefined,
        cioId: cioId || null,
        complainant: complainant.trim() || undefined,
        trialCourtName: trialCourt.trim() || undefined,
        category,
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="1.1 Original FIR (if re-registered / transferred)">
              <input className={input} value={originalFir} onChange={(e) => setOriginalFir(e.target.value)} placeholder="e.g. FIR 112/2024, PS Latasil" />
            </Field>
            <Field label="Category (supervision)">
              <select className={input} value={category} onChange={(e) => setCategory(e.target.value as CaseRecord["category"] & string)}>
                {CASE_CATEGORIES.map((k) => (
                  <option key={k} value={k}>{CASE_CATEGORY_META[k].label}</option>
                ))}
              </select>
            </Field>
          </div>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="5.1 Name of CIO">
              <select className={input} value={cioId} onChange={(e) => setCioId(e.target.value)}>
                <option value="">— select from the CIO list —</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.rank ? ` (${o.rank})` : ""}</option>
                ))}
              </select>
              {officers.length === 0 && <p className="mt-1 text-[11px] text-ink-dim">Add officers in the CIO tab first.</p>}
            </Field>
            <Field label="5.3 Name of the trial court">
              <input className={input} value={trialCourt} onChange={(e) => setTrialCourt(e.target.value)} />
            </Field>
          </div>
          <Field label="5.2 Name & address of complainant">
            <textarea className={`${input} min-h-[48px] resize-y`} value={complainant} onChange={(e) => setComplainant(e.target.value)} />
          </Field>
          <Field label="6. Brief of the case">
            <textarea className={`${input} min-h-[72px] resize-y`} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </Field>
          <Field label="10. Status of trial">
            <textarea className={`${input} min-h-[56px] resize-y`} value={trialStatus} onChange={(e) => setTrialStatus(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-dim">Headings 8 and 13 are dated logs now — add entries directly on the case file.</p>
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
      <ChargesheetRegister agg={agg} onSave={onSaveChargesheets} />
      <div className="-mt-1">
        <Heading n={1} title="Case number">
          <span className="flex flex-wrap items-center gap-2">
            {text(c.firNumber)}
            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim" title={CASE_CATEGORY_META[c.category ?? "I"].label}>
              {CASE_CATEGORY_META[c.category ?? "I"].short}
            </span>
          </span>
        </Heading>
        <Heading n="1.1" title="Original FIR">{text(c.originalFir)}</Heading>
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
        <Heading n="5.1" title="Name of CIO">
          {c.cioId ? (
            (() => {
              const o = cioById(c.cioId);
              return o ? <span>{o.name}{o.rank ? <span className="text-ink-dim"> · {o.rank}</span> : null}</span> : dash;
            })()
          ) : dash}
        </Heading>
        <Heading n="5.2" title="Name & address of complainant">{text(c.complainant)}</Heading>
        <Heading n="5.3" title="Name of the trial court">{text(c.trialCourtName)}</Heading>
        <Heading n={6} title="Brief of the case">{text(c.brief)}</Heading>
        <Heading n={7} title="Number of accused (computed from heading 12)">
          <AccusedCountTable agg={agg} />
        </Heading>
        <Heading n={8} title="Progress of investigation — dated log">
          {onSaveProgress ? (
            <ProgressLogPanel agg={agg} onSaveProgress={onSaveProgress} onSaveCase={onSaveCase} onSaveHearings={onSaveHearings} />
          ) : (
            dash
          )}
        </Heading>
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
        <Heading n={13} title="Plan of action — dated log">
          {onSavePlan ? <PlanLogPanel agg={agg} onSavePlan={onSavePlan} /> : dash}
        </Heading>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={startEdit} className={btn("ghost")}>Edit case file</button>
      </div>
    </Section>
  );
}
