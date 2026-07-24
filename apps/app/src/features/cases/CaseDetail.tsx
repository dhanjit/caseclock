import { useMemo, useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { useSession } from "@/state/session";
import { computeDeadlines } from "@/rules/engine";
import { diffDays, todayISO } from "@/rules/dates";
import {
  type CaseRecord,
  type ChargesheetRecord,
  type CommsRequestRecord,
  type CustodyMovementRecord,
  type DeadlineEvent,
  type EvidenceRecord,
  type HearingRecord,
  type PersonRecord,
  type PlanEntry,
  type ProcessRequestRecord,
  type ProgressEntry,
  type SupervisionEntryRecord,
  type TowerDumpRecord,
} from "@/domain/types";
import { buildBriefing } from "@/domain/briefing";
import { useCio } from "@/state/cio";
import { useWatchlist } from "@/state/watchlist";
import { useAppSettings } from "@/state/app-settings";
import { newId } from "@/lib/id";
import { fmtDate, relativeDays, severityTone, toneText } from "@/lib/format";
import { Section, Field, Dot } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { TopBar, btn } from "@/features/components/TopBar";
import { MoreMenu } from "@/features/components/Menu";
import { CaseToc, TOC_SCROLL_MARGIN, type TocItem } from "./CaseToc";
import { CaseFile } from "./CaseFile";
import { AccusedPanel } from "./AccusedPanel";
import { WitnessPanel } from "./WitnessPanel";
import { IntegrityCard } from "./IntegrityCard";
import { InvestigationPanel } from "./InvestigationPanel";
import { PipelinePanel } from "./PipelinePanel";
import { CommsPanel } from "./CommsPanel";
import { CustodyLedgerPanel } from "./CustodyLedgerPanel";
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

/** Jump targets for the sticky section rail — one per panel, in page order. */
const TOC_ITEMS: TocItem[] = [
  { id: "sec-clocks", label: "Clocks" },
  { id: "sec-file", label: "Case file" },
  { id: "sec-accused", label: "Accused" },
  { id: "sec-witnesses", label: "PW" },
  { id: "sec-investigation", label: "Investigation" },
  { id: "sec-pipeline", label: "FR·MHA" },
  { id: "sec-trial", label: "Trial" },
  { id: "sec-hearings", label: "Hearings" },
  { id: "sec-evidence", label: "Evidence" },
  { id: "sec-custody", label: "Custody" },
  { id: "sec-comms", label: "Comms" },
  { id: "sec-requests", label: "Requests" },
  { id: "sec-sanctions", label: "Sanctions" },
  { id: "sec-place", label: "Place" },
  { id: "sec-gallery", label: "Gallery" },
  { id: "sec-documents", label: "Documents" },
  { id: "sec-reference", label: "Reference" },
  { id: "sec-timeline", label: "Timeline" },
  { id: "sec-note", label: "Log note" },
];

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
  const settings = useAppSettings((s) => s.settings);
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
            settings,
            today,
            agg.evidence ?? [],
            agg.processRequests ?? [],
            agg.commsRequests ?? [],
            agg.towerDumps ?? [],
            agg.chargesheets ?? [],
          )
        : [],
    [agg, settings, today],
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

  // Overlap-safe: patch reads the LATEST committed aggregate. Array saves accept an
  // UPDATER FUNCTION resolved against that latest state — a panel passing a plain
  // array is a render-time snapshot, and two quick edits from the same render were
  // clobbering each other (review finding, live-reproduced).
  type ArrOrFn<T> = T[] | ((prev: T[]) => T[]);
  function resolveArr<T>(v: ArrOrFn<T>, prev: T[]): T[] {
    return typeof v === "function" ? (v as (p: T[]) => T[])(prev) : v;
  }
  async function saveCase(patchObj: Partial<CaseRecord>) {
    await patch(id, (a) => ({ ...a, case: { ...a.case, ...patchObj, lastTouchedAt: today } }));
  }
  async function savePersons(persons: ArrOrFn<PersonRecord>) {
    await patch(id, (a) => ({ ...a, persons: resolveArr(persons, a.persons), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveHearings(hearings: ArrOrFn<HearingRecord>) {
    await patch(id, (a) => ({ ...a, hearings: resolveArr(hearings, a.hearings), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveEvidence(evidence: ArrOrFn<EvidenceRecord>) {
    await patch(id, (a) => ({ ...a, evidence: resolveArr(evidence, a.evidence ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveRequests(processRequests: ArrOrFn<ProcessRequestRecord>) {
    await patch(id, (a) => ({ ...a, processRequests: resolveArr(processRequests, a.processRequests ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveChargesheets(chargesheets: ArrOrFn<ChargesheetRecord>) {
    // chargesheetFiledDate re-derives from the register on save (hydrateAggregate).
    await patch(id, (a) => ({ ...a, chargesheets: resolveArr(chargesheets, a.chargesheets ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveComms(commsRequests: ArrOrFn<CommsRequestRecord>) {
    await patch(id, (a) => ({ ...a, commsRequests: resolveArr(commsRequests, a.commsRequests ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveTowers(towerDumps: ArrOrFn<TowerDumpRecord>) {
    await patch(id, (a) => ({ ...a, towerDumps: resolveArr(towerDumps, a.towerDumps ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveMovements(custodyMovements: ArrOrFn<CustodyMovementRecord>) {
    await patch(id, (a) => ({ ...a, custodyMovements: resolveArr(custodyMovements, a.custodyMovements ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function saveProgress(progressLog: ArrOrFn<ProgressEntry>) {
    await patch(id, (a) => ({ ...a, progressLog: resolveArr(progressLog, a.progressLog ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function savePlan(planLog: ArrOrFn<PlanEntry>) {
    await patch(id, (a) => ({ ...a, planLog: resolveArr(planLog, a.planLog ?? []), case: { ...a.case, lastTouchedAt: today } }));
  }
  async function togglePriority() {
    if (!agg) return;
    const { blocked } = await setPriority(id, !agg.case.priority);
    // V6 hard cap: "Priority capped at 10 cases. Demote one first."
    setPriorityWarn(blocked ? "Priority is capped at 10 cases. Demote one first." : null);
  }
  function exportCaseIcs() {
    if (!agg) return;
    const ics = buildCaseIcs(agg, settings, today);
    const safe = c.firNumber.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
    downloadFile(`caseclock-${safe}.ics`, ics, "text/calendar;charset=utf-8");
  }
  // T3 / V6: Word-openable .doc of the briefing note (the officer drafts in Word).
  function exportDoc() {
    if (!agg) return;
    const note = buildBriefing(agg, today, useCio.getState().officers, useWatchlist.getState().names);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = [
      `<h1 style="font-size:16pt;margin:0 0 2pt;">CASE BRIEFING NOTE</h1>`,
      `<p style="font-weight:bold;margin:0 0 2pt;">${esc(note.header.caseLabel)}</p>`,
      `<p style="font-size:9pt;color:#444;margin:0 0 10pt;">Generated ${fmtDate(today)} · CONFIDENTIAL${note.header.uapa ? " · UAPA" : ""}<br/>${esc(note.header.defaultBailLine)}</p>`,
      ...note.headings.map(
        (h) =>
          `<h2 style="font-size:11pt;border-bottom:0.5pt solid #999;margin:9pt 0 3pt;">${h.n}. ${esc(h.title)}</h2>` +
          h.lines.map((l) => `<p style="margin:0 0 2pt;white-space:pre-wrap;">${esc(l)}</p>`).join(""),
      ),
    ].join("");
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>${esc(c.firNumber)}</title></head><body style="font-family:Calibri,serif;font-size:11pt;">${body}</body></html>`;
    const safe = c.firNumber.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
    downloadFile(`caseclock-${safe}-briefing.doc`, html, "application/msword");
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
            <MoreMenu
              items={[
                { label: "Mind map", title: "Per-case mind map", onClick: () => go({ kind: "mindmap", id }) },
                { label: "Export .ics", title: "Export this case's deadlines as .ics", onClick: exportCaseIcs },
                { label: "Download .doc", title: "Download the briefing note as a Word-openable .doc", onClick: exportDoc },
              ]}
            />
            <button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>
              Back
            </button>
            <button onClick={() => void lock()} title="Lock vault" aria-label="Lock vault" className={btn("icon")}>
              🔒
            </button>
          </>
        }
        below={<CaseToc items={TOC_ITEMS} />}
      />
      {priorityWarn && (
        <p className="mt-2 rounded-lg border border-statutory/40 bg-statutory/10 px-3 py-2 text-xs text-statutory">⚠ {priorityWarn}</p>
      )}
      {printing && <BriefingNote agg={agg} onDone={() => setPrinting(false)} />}
      <IntegrityCard agg={agg} onSaveHearings={saveHearings} />

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

      {/* Clocks strip. Each panel below sits in an id-anchored wrapper so the
          sticky TOC rail can jump to it (scroll-mt clears the sticky header). */}
      <div id="sec-clocks" className={TOC_SCROLL_MARGIN}>
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
      </div>

      {/* The officer's 13-heading case file + the 11-status accused list */}
      <div id="sec-file" className={TOC_SCROLL_MARGIN}>
        <CaseFile
          agg={agg}
          onSaveCase={saveCase}
          onSaveChargesheets={saveChargesheets}
          onSaveProgress={saveProgress}
          onSavePlan={savePlan}
          onSaveHearings={saveHearings}
        />
      </div>
      <div id="sec-accused" className={TOC_SCROLL_MARGIN}>
        <AccusedPanel agg={agg} onSavePersons={savePersons} />
      </div>
      <div id="sec-witnesses" className={TOC_SCROLL_MARGIN}>
        <WitnessPanel agg={agg} onSavePersons={savePersons} />
      </div>

      {/* The two engines: investigation (FR/PR/custody) + court-trial (timeline + hearings) */}
      <div id="sec-investigation" className={TOC_SCROLL_MARGIN}>
        <InvestigationPanel agg={agg} onSaveCase={saveCase} />
      </div>
      <div id="sec-pipeline" className={TOC_SCROLL_MARGIN}>
        <PipelinePanel agg={agg} onSaveCase={saveCase} />
      </div>
      <div id="sec-trial" className={TOC_SCROLL_MARGIN}>
        <TrialPanel agg={agg} onSaveCase={saveCase} />
      </div>
      <div id="sec-hearings" className={TOC_SCROLL_MARGIN}>
        <HearingsPanel agg={agg} onSaveHearings={saveHearings} />
      </div>

      {/* Phase 3 + T2 panels: evidence·custody ledger·comms·sanctions·place·reference */}
      <div id="sec-evidence" className={TOC_SCROLL_MARGIN}>
        <EvidencePanel agg={agg} onSaveEvidence={saveEvidence} />
      </div>
      <div id="sec-custody" className={TOC_SCROLL_MARGIN}>
        <CustodyLedgerPanel agg={agg} onSaveMovements={saveMovements} />
      </div>
      <div id="sec-comms" className={TOC_SCROLL_MARGIN}>
        <CommsPanel agg={agg} onSaveComms={saveComms} onSaveTowers={saveTowers} />
      </div>
      <div id="sec-requests" className={TOC_SCROLL_MARGIN}>
        <RequestsPanel agg={agg} onSaveRequests={saveRequests} />
      </div>
      <div id="sec-sanctions" className={TOC_SCROLL_MARGIN}>
        <SanctionsPanel agg={agg} onSaveCase={saveCase} />
      </div>
      <div id="sec-place" className={TOC_SCROLL_MARGIN}>
        <PlacePanel agg={agg} onSaveCase={saveCase} />
      </div>
      <div id="sec-gallery" className={TOC_SCROLL_MARGIN}>
        <GalleryPanel agg={agg} />
      </div>
      <div id="sec-documents" className={TOC_SCROLL_MARGIN}>
        <DocumentsPanel agg={agg} />
      </div>
      <div id="sec-reference" className={TOC_SCROLL_MARGIN}>
        <ReferenceLawsPanel />
      </div>

      {/* Timeline */}
      <div id="sec-timeline" className={TOC_SCROLL_MARGIN}>
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
      </div>

      {/* Log note */}
      <div id="sec-note" className={TOC_SCROLL_MARGIN}>
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
