import { useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { newId } from "@/lib/id";
import { addDays, todayISO } from "@/rules/dates";
import { fmtDate } from "@/lib/format";
import { trackDays, type CaseRecord, type PunishmentBand, type CustodyStatus } from "@/domain/types";
import { Section, Field } from "@/features/components/bits";
import { TopBar, btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const BANDS: { value: PunishmentBand; label: string }[] = [
  { value: "lt3", label: "Under 3 years" },
  { value: "3to7", label: "3 to under 7 years" },
  { value: "7to10", label: "7 to under 10 years" },
  { value: "10plus", label: "10 years+ / life / death" },
];

export function CaseWizard() {
  const save = useCases((s) => s.save);
  const go = useNav((s) => s.go);

  const [firNumber, setFir] = useState("");
  const [identity, setIdentity] = useState("");
  const [firDate, setFirDate] = useState(todayISO());
  const [occurrenceDate, setOccurrence] = useState("");
  const [sectionsOfLaw, setSections] = useState("");
  const [brief, setBrief] = useState("");
  const [policeStation, setPs] = useState("");
  const [district, setDistrict] = useState("");
  const [band, setBand] = useState<PunishmentBand>("3to7");
  const [uapa, setUapa] = useState(false);
  const [sexual, setSexual] = useState(false);
  const [eFir, setEFir] = useState(false);
  const [trackOverride, setTrackOverride] = useState<"" | "60" | "90">("");
  const [maxYears, setMaxYears] = useState("");
  const [accused, setAccused] = useState("");
  const [firstTimer, setFirstTimer] = useState(false);
  const [otherCases, setOtherCases] = useState(false);
  const [arrestDate, setArrest] = useState("");
  const [firstRemand, setRemand] = useState("");
  const [custody, setCustody] = useState<CustodyStatus>("not_arrested");
  const [noteText, setNoteText] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const needsRemand = custody === "in_custody";
  const today = todayISO();
  const maxYearsNum = maxYears.trim() ? Number(maxYears) : null;
  const validationErrors: string[] = [];
  if (arrestDate && arrestDate > today) validationErrors.push("Arrest date can't be in the future.");
  if (firstRemand && firstRemand > today) validationErrors.push("First remand date can't be in the future.");
  if (arrestDate && firstRemand && firstRemand < arrestDate)
    validationErrors.push("First remand can't be before the arrest date.");
  if (maxYears.trim() && (maxYearsNum === null || Number.isNaN(maxYearsNum) || maxYearsNum <= 0))
    validationErrors.push("Max sentence must be a positive number of years.");
  const canSave = !!(firNumber.trim() && firDate && (!needsRemand || firstRemand)) && validationErrors.length === 0 && !busy;

  // Live preview of the default-bail-risk date.
  const previewCase = { punishmentBand: band, trackOverride: trackOverride ? (Number(trackOverride) as 60 | 90) : null } as CaseRecord;
  const preview = firstRemand ? addDays(firstRemand, uapa ? 90 : trackDays(previewCase)) : null;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setSaveError(null);
    const id = newId("case");
    const c: CaseRecord = {
      id,
      firNumber: firNumber.trim(),
      identity: identity.trim() || undefined,
      firDate,
      occurrenceDate: occurrenceDate || null,
      sectionsOfLaw: sectionsOfLaw.trim() || undefined,
      brief: brief.trim() || undefined,
      policeStation: policeStation.trim() || undefined,
      district: district.trim() || undefined,
      punishmentBand: band,
      trackOverride: trackOverride ? (Number(trackOverride) as 60 | 90) : null,
      uapaFlag: uapa,
      sevenYearPlus: band === "7to10" || band === "10plus",
      sexualOffenceInScope: sexual,
      maxSentenceYears: maxYearsNum && maxYearsNum > 0 ? maxYearsNum : null,
      eFirFlag: eFir,
      arrestDate: arrestDate || null,
      firstRemandDate: firstRemand || null,
      custodyStatus: custody,
      status: custody === "in_custody" ? "custody" : "investigation",
      lastTouchedAt: today,
      nextReviewDate: nextReview || null,
      outcome: "pending",
    };
    const persons = accused.trim()
      ? [
          {
            id: newId("p"),
            caseId: id,
            role: "accused" as const,
            name: accused.trim(),
            firstTimeOffender: firstTimer,
            otherPendingCases: otherCases,
            custodyStatus: custody === "in_custody" ? ("in_custody" as const) : ("released" as const),
          },
        ]
      : [];
    const entries = noteText.trim()
      ? [
          {
            id: newId("e"),
            caseId: id,
            createdAt: new Date().toISOString(),
            entryType: "supervisory-note" as const,
            lastActionText: "Case registered in CaseClock",
            noteText: noteText.trim(),
            nextActionText: nextAction.trim() || undefined,
            nextReviewDate: nextReview || null,
          },
        ]
      : [];

    try {
      await save({ case: c, persons, hearings: [], supervisionEntries: entries, tasks: [] });
      go({ kind: "case", id });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-24 pt-5">
      <TopBar
        title="New case"
        subtitle="Minimum: FIR no., date, band, custody. The rest is progressive."
        actions={
          <button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>
            Cancel
          </button>
        }
      />

      <div className="mt-5 space-y-3">
        <Section title="Identity">
          <Field label="Identity of the case (one line)">
            <input className={input} value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="e.g. Arms recovery linked to ULFA-I cadre, Tinsukia" />
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="FIR / Case number *">
              <input className={input} value={firNumber} onChange={(e) => setFir(e.target.value)} placeholder="112/2025" />
            </Field>
            <Field label="Sections of law">
              <input className={input} value={sectionsOfLaw} onChange={(e) => setSections(e.target.value)} placeholder="UAPA 16,18,20 / BNS 61,103" />
            </Field>
            <Field label="Date of occurrence">
              <input type="date" className={input} value={occurrenceDate} onChange={(e) => setOccurrence(e.target.value)} />
            </Field>
            <Field label="Date of registration *">
              <input type="date" className={input} value={firDate} onChange={(e) => setFirDate(e.target.value)} />
            </Field>
            <Field label="Police station">
              <input className={input} value={policeStation} onChange={(e) => setPs(e.target.value)} placeholder="Civil Lines" />
            </Field>
            <Field label="District">
              <input className={input} value={district} onChange={(e) => setDistrict(e.target.value)} />
            </Field>
          </div>
          <Field label="Brief of the case">
            <textarea
              className={`${input} mt-3 min-h-[72px] resize-y`}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What happened, key facts, important pointers…"
            />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-dim">
            <input type="checkbox" checked={eFir} onChange={(e) => setEFir(e.target.checked)} /> e-FIR (3-day signature clock)
          </label>
        </Section>

        <Section title="Offence">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Punishment band *">
              <select className={input} value={band} onChange={(e) => setBand(e.target.value as PunishmentBand)}>
                {BANDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Track override (10-year edge)">
              <select className={input} value={trackOverride} onChange={(e) => setTrackOverride(e.target.value as "" | "60" | "90")}>
                <option value="">Auto ({band === "10plus" ? "90" : "60"}-day)</option>
                <option value="60">Force 60-day</option>
                <option value="90">Force 90-day</option>
              </select>
            </Field>
            <Field label="Max sentence (years, for s.479)">
              <input className={input} value={maxYears} onChange={(e) => setMaxYears(e.target.value)} inputMode="numeric" placeholder="e.g. 10" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-dim">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={uapa} onChange={(e) => setUapa(e.target.checked)} /> UAPA / terror (90→180 + sanction)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sexual} onChange={(e) => setSexual(e.target.checked)} /> Sexual offence in scope
            </label>
          </div>
        </Section>

        <Section title="Accused (primary)">
          <Field label="Name">
            <input className={input} value={accused} onChange={(e) => setAccused(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-dim">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={firstTimer} onChange={(e) => setFirstTimer(e.target.checked)} /> First-time offender
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={otherCases} onChange={(e) => setOtherCases(e.target.checked)} /> Other pending cases
            </label>
          </div>
        </Section>

        <Section title="Custody anchors">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Custody status *">
              <select className={input} value={custody} onChange={(e) => setCustody(e.target.value as CustodyStatus)}>
                <option value="not_arrested">Not arrested</option>
                <option value="in_custody">In custody</option>
                <option value="on_bail">On bail</option>
              </select>
            </Field>
            <Field label="Arrest date">
              <input type="date" className={input} value={arrestDate} onChange={(e) => setArrest(e.target.value)} />
            </Field>
            <Field label={`First remand date ${needsRemand ? "*" : ""}`}>
              <input type="date" className={input} value={firstRemand} onChange={(e) => setRemand(e.target.value)} />
            </Field>
          </div>
          {preview && (
            <p className="mt-2 rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical">
              Default-bail risk date: <span className="font-semibold">{fmtDate(preview)}</span> (
              {uapa ? "UAPA 90-day" : `${trackDays(previewCase)}-day`} track, from first remand)
            </p>
          )}
        </Section>

        <Section title="First supervisory note">
          <Field label="Current status / what was done">
            <input className={input} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. FIR registered; IO assigned" />
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Next action">
              <input className={input} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. obtain CDR + FSL report" />
            </Field>
            <Field label="Review by">
              <input type="date" className={input} value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
            </Field>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-0 mt-4 border-t border-line bg-surface/80 py-3 backdrop-blur">
        {(validationErrors.length > 0 || saveError) && (
          <ul className="mb-2 space-y-0.5 text-right text-xs text-critical">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {saveError && <li>Save failed: {saveError}</li>}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>
            Cancel
          </button>
          <button onClick={submit} disabled={!canSave} className={`${btn("primary")} disabled:opacity-40`}>
            {busy ? "Saving…" : "Save case"}
          </button>
        </div>
      </div>
    </div>
  );
}
