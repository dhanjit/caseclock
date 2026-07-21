import { useMemo, useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { useSession } from "@/state/session";
import { computeDeadlines } from "@/rules/engine";
import { diffDays, todayISO } from "@/rules/dates";
import {
  DEFAULT_SETTINGS,
  type CaseRecord,
  type ChargesheetRecord,
  type DeadlineEvent,
  type EvidenceRecord,
  type HearingRecord,
  type PersonRecord,
  type ProcessRequestRecord,
  type SupervisionEntryRecord,
} from "@/domain/types";
import { newId } from "@/lib/id";
import { fmtDate, relativeDays, severityTone, toneText } from "@/lib/format";
import { Section, Field, Dot } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { TopBar, btn } from "@/features/components/TopBar";
import { CaseFile } from "./CaseFile";
import { AccusedPanel } from "./AccusedPanel";
import { InvestigationPanel } from "./InvestigationPanel";
import { TrialPanel } from "./TrialPanel";
import { HearingsPanel } from "./HearingsPanel";
import { EvidencePanel } from "./EvidencePanel";
import { RequestsPanel } from "./RequestsPanel";
import { SanctionsPanel } from "./SanctionsPanel";
import { PlacePanel } from "./PlacePanel";
import { ReferenceLawsPanel } from "./ReferenceLawsPanel";
import { GalleryPanel } from "./GalleryPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { BriefingNote } from "./BriefingNote";
import { buildCaseIcs } from "@/domain/ics";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

/** Trigger a client-side file download (reused for the per-case .ics export). */
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke so it can't race the download start on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function CaseDetail({ id }: { id: string }) {
  const agg = useCases((s) => s.getById(id));
  const patch = useCases((s) => s.patch);
  const setPriority = useCases((s) => s.setPriority);
  const go = useNav((s) => s.go);
  const lock = useSession((s) => s.lock);
  const today = todayISO();

  const [noteText, setNoteText] = useState("");
  const [lastAction, setLastAction] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [priorityWarn, setPriorityWarn] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const deadlines = useMemo(
    () =>
      agg
        ? computeDeadlines(
            agg.case,
            agg.persons,
            agg.hearings,
            DEFAULT_SETTINGS,
            today,
            agg.evidence ?? [],
            agg.processRequests ?? [],
          )
        : [],
    [agg, today],
  );

  if (!agg) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-5">
        <TopBar title="Case not found" actions={<button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>Back</button>} />
      </div>
    );
  }

  const c = agg.case;
  const entries = [...agg.supervisionEntries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const latest = entries[0];
  const gapDays = c.lastTouchedAt ? diffDays(today, c.lastTouchedAt) : 0;

  const live = deadlines.filter((d) => ["active", "overdue", "window-open"].includes(d.state));
  const overdue = deadlines.filter((d) => d.state === "overdue" || d.state === "window-open");
  const clocks = live
    .filter((d) => d.severity !== "soft")
    .sort((a, b) => (a.dueAt ?? "9") < (b.dueAt ?? "9") ? -1 : 1);
  const reviewOverdue = latest?.nextReviewDate ? diffDays(today, latest.nextReviewDate) > 0 : false;

  async function logNote() {
    if (!noteText.trim() || busy || !agg) return;
    setBusy(true);
    const entry: SupervisionEntryRecord = {
      id: newId("e"),
      caseId: agg.case.id,
      createdAt: new Date().toISOString(),
      entryType: "supervisory-note",
      lastActionText: lastAction.trim() || undefined,
      noteText: noteText.trim(),
      nextActionText: nextAction.trim() || undefined,
      nextReviewDate: nextReview || null,
    };
    setNoteError(null);
    try {
      await patch(id, (a) => ({
        ...a,
        case: { ...a.case, lastTouchedAt: today, nextReviewDate: nextReview || a.case.nextReviewDate || null },
        supervisionEntries: [...a.supervisionEntries, entry],
      }));
      setNoteText("");
      setLastAction("");
      setNextAction("");
      setNextReview("");
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Overlap-safe: patch reads the LATEST committed aggregate, so two panels saving
  // near-simultaneously compose instead of clobbering each other.
  async function saveCase(patchObj: Partial<CaseRecord>) {
    await patch(id, (a) => ({ ...a, case: { ...a.case, ...patchObj, lastTouchedAt: today } }));
  }
  async function savePersons(persons: PersonRecord[]) {
    await patch(id, (a) => ({ ...a, persons, case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveHearings(hearings: HearingRecord[]) {
    await patch(id, (a) => ({ ...a, hearings, case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveEvidence(evidence: EvidenceRecord[]) {
    await patch(id, (a) => ({ ...a, evidence, case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveRequests(processRequests: ProcessRequestRecord[]) {
    await patch(id, (a) => ({ ...a, processRequests, case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveChargesheets(chargesheets: ChargesheetRecord[]) {
    // chargesheetFiledDate re-derives from the register on save (hydrateAggregate).
    await patch(id, (a) => ({ ...a, chargesheets, case: { ...a.case, lastTouchedAt: today } }));
  }
  async function togglePriority() {
    if (!agg) return;
    const { blocked } = await setPriority(id, !agg.case.priority);
    // V6 hard cap: "Priority capped at 10 cases. Demote one first."
    setPriorityWarn(blocked ? "Priority is capped at 10 cases. Demote one first." : null);
  }
  function exportCaseIcs() {
    if (!agg) return;
    const ics = buildCaseIcs(agg, DEFAULT_SETTINGS, today);
    const safe = c.firNumber.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
    downloadFile(`caseclock-${safe}.ics`, ics, "text/calendar;charset=utf-8");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pb-24 pt-5">
      <TopBar
        title={`FIR ${c.firNumber}`}
        subtitle={[c.policeStation, c.uapaFlag ? "UAPA" : null, c.district].filter(Boolean).join(" · ")}
        actions={
          <>
            <button
              onClick={() => void togglePriority()}
              title={c.priority ? "Priority case — pinned to dashboard top" : "Flag as priority (pin to top)"}
              aria-pressed={!!c.priority}
              className={c.priority ? `${btn("ghost")} border-critical/50 text-critical` : btn("ghost")}
            >
              {c.priority ? "★ Priority" : "☆ Priority"}
            </button>
            <button onClick={() => setPrinting(true)} title="Printable A4 briefing note" className={btn("ghost")}>
              Briefing note
            </button>
            <button onClick={exportCaseIcs} title="Export this case's deadlines as .ics" className={btn("ghost")}>
              Export .ics
            </button>
            <button onClick={() => go({ kind: "mindmap", id })} title="Per-case mind map" className={btn("ghost")}>
              Mind map
            </button>
            <button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>
              Back
            </button>
            <button onClick={() => void lock()} title="Lock vault" aria-label="Lock vault" className={btn("icon")}>
              🔒
            </button>
          </>
        }
      />
      {priorityWarn && (
        <p className="mt-2 rounded-lg border border-statutory/40 bg-statutory/10 px-3 py-2 text-xs text-statutory">⚠ {priorityWarn}</p>
      )}
      {printing && <BriefingNote agg={agg} onDone={() => setPrinting(false)} />}

      {/* Context-restore header */}
      {(gapDays >= 3 || latest) && (
        <div className="mt-4 rounded-2xl border border-court/30 bg-court/5 p-4">
          {gapDays >= 3 && (
            <p className="mb-2 text-xs font-semibold tracking-wide text-court uppercase">
              Since you were last here · {gapDays} days ago
            </p>
          )}
          <dl className="space-y-2 text-sm">
            {latest?.lastActionText && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-xs text-ink-dim">Last action</dt>
                <dd className="text-ink">
                  <Highlighted text={latest.lastActionText} /> <span className="text-soft">· {relativeDays(latest.createdAt.slice(0, 10), today)}</span>
                </dd>
              </div>
            )}
            {latest?.nextActionText && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-xs text-ink-dim">Next action</dt>
                <dd className="text-ink">
                  <Highlighted text={latest.nextActionText} />
                  {latest.nextActionOwes ? <span className="text-soft"> · owes: {latest.nextActionOwes}</span> : null}
                  {reviewOverdue ? <span className="font-medium text-critical"> · review overdue</span> : null}
                </dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-xs text-ink-dim">What's next</dt>
              <dd className="text-ink">
                {clocks.length ? (
                  clocks.slice(0, 3).map((d, i) => (
                    <span key={`${d.ruleId}:${d.occurrenceDate ?? ""}:${d.instanceId ?? ""}`}>
                      {i > 0 ? " · " : ""}
                      {d.type} {d.dueAt ? relativeDays(d.dueAt, today) : ""}
                    </span>
                  ))
                ) : (
                  <span className="text-soft">no live clocks</span>
                )}
              </dd>
            </div>
            {overdue.length > 0 && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-xs text-ink-dim">Overdue</dt>
                <dd className="font-medium text-critical">
                  {overdue.map((d) => d.type).join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Clocks strip */}
      <Section title="Statutory & court clocks" className="mt-3">
        {clocks.length === 0 ? (
          <p className="py-4 text-center text-sm text-soft">No live clocks (set custody anchors to start them)</p>
        ) : (
          <div className="space-y-1.5">
            {clocks.map((d) => (
              <ClockRow key={`${d.ruleId}:${d.occurrenceDate ?? ""}:${d.instanceId ?? ""}`} d={d} today={today} />
            ))}
          </div>
        )}
      </Section>

      {/* The officer's 13-heading case file + the 11-status accused list */}
      <CaseFile agg={agg} onSaveCase={saveCase} onSaveChargesheets={saveChargesheets} />
      <AccusedPanel agg={agg} onSavePersons={savePersons} />

      {/* The two engines: investigation (FR/PR/custody) + court-trial (timeline + hearings) */}
      <InvestigationPanel agg={agg} onSaveCase={saveCase} />
      <TrialPanel agg={agg} onSaveCase={saveCase} />
      <HearingsPanel agg={agg} onSaveHearings={saveHearings} />

      {/* Phase 3 panels: evidence·sanctions·place·reference laws */}
      <EvidencePanel agg={agg} onSaveEvidence={saveEvidence} />
      <RequestsPanel agg={agg} onSaveRequests={saveRequests} />
      <SanctionsPanel agg={agg} onSaveCase={saveCase} />
      <PlacePanel agg={agg} onSaveCase={saveCase} />
      <GalleryPanel agg={agg} />
      <DocumentsPanel agg={agg} />
      <ReferenceLawsPanel />

      {/* Timeline */}
      <Section title="Supervision timeline" className="mt-3">
        {entries.length === 0 ? (
          <p className="py-3 text-center text-sm text-soft">No notes yet</p>
        ) : (
          <ol className="space-y-2.5">
            {entries.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-xs text-soft">{relativeDays(e.createdAt.slice(0, 10), today)}</p>
                {e.lastActionText && <p className="text-sm text-ink"><Highlighted text={e.lastActionText} /></p>}
                {e.noteText && e.noteText !== e.lastActionText && (
                  <p className="text-sm text-ink-dim"><Highlighted text={e.noteText} /></p>
                )}
                {e.nextActionText && (
                  <p className="mt-0.5 text-xs text-court">→ <Highlighted text={e.nextActionText} />{e.nextReviewDate ? ` (review ${fmtDate(e.nextReviewDate)})` : ""}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Log note */}
      <Section title="Log supervisory note" className="mt-3">
        <div className="space-y-3">
          <Field label="What was done / current status *">
            <input className={input} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Reviewed CD; directed IO to obtain CDR of accused-2" />
          </Field>
          <Field label="Last action (optional headline)">
            <input className={input} value={lastAction} onChange={(e) => setLastAction(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next action">
              <input className={input} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
            </Field>
            <Field label="Review by">
              <input type="date" className={input} value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
            </Field>
          </div>
          {noteError && <p className="text-xs text-critical">Save failed: {noteError}</p>}
          <div className="flex justify-end">
            <button onClick={logNote} disabled={!noteText.trim() || busy} className={`${btn("primary")} disabled:opacity-40`}>
              {busy ? "Saving…" : "Log note"}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function ClockRow({ d, today }: { d: DeadlineEvent; today: string }) {
  const tone = severityTone(d.severity);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-3/50 px-3 py-2">
      <Dot tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{d.type}</p>
        {(() => {
          const ref = d.lawRef && d.lawRef !== "—" ? d.lawRef : "";
          const sub = d.note ? `${ref ? `${ref} — ` : ""}${d.note}` : ref;
          return sub ? <p className="truncate text-xs text-ink-dim">{sub}</p> : null;
        })()}
      </div>
      <span className={`shrink-0 text-right text-xs font-medium ${toneText[tone]}`}>
        {d.state === "window-open" ? "CLAIMABLE" : d.dueAt ? relativeDays(d.dueAt, today) : d.state}
        {d.approximate ? "*" : ""}
      </span>
    </div>
  );
}
