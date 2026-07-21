/**
 * Heading-8 progress log + heading-13 plan log (T3 / V6 preview). Dated,
 * edit-only entries; the progress log is tagged, a Court-tagged entry
 * auto-creates a court-matter row, and an entry can route a dated append onto
 * Sections (H3) / Brief (H6) / Trial status (H10).
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  PROGRESS_TAGS,
  type CaseRecord,
  type HearingRecord,
  type PlanEntry,
  type ProgressEntry,
  type ProgressTag,
} from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";
type Updater<T> = (v: T[] | ((prev: T[]) => T[])) => Promise<void>;

const ROUTES = [
  { key: "", label: "↳ route to… (optional)" },
  { key: "sections", label: "Sections of law (H3)" },
  { key: "brief", label: "Brief (H6)" },
  { key: "trial", label: "Status of trial (H10)" },
] as const;

export function ProgressLogPanel({
  agg,
  onSaveProgress,
  onSaveCase,
  onSaveHearings,
}: {
  agg: CaseAggregate;
  onSaveProgress: Updater<ProgressEntry>;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
  onSaveHearings?: Updater<HearingRecord>;
}) {
  const entries = [...(agg.progressLog ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [tag, setTag] = useState<ProgressTag>("General");
  const [route, setRoute] = useState<string>("");
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function add() {
    const text = note.trim();
    if (!text) return;
    await onSaveProgress((prev) => [{ id: newId("h8"), date, tag, note: text }, ...prev]);
    // Optional routing — a dated append onto the target heading (V6).
    const stamp = `  [Update ${fmtDate(date)}: ${text}]`;
    if (route === "sections") await onSaveCase({ sectionsOfLaw: (agg.case.sectionsOfLaw ?? "") + stamp });
    if (route === "brief") await onSaveCase({ brief: (agg.case.brief ?? "") + stamp });
    if (route === "trial") await onSaveCase({ trialStatus: (agg.case.trialStatus ?? "") + stamp });
    // Court-tagged entries reflect into Court matters (H11) as a hearing row.
    if (tag === "Court" && onSaveHearings) {
      const h: HearingRecord = {
        id: newId("h"),
        caseId: agg.case.id,
        hearingDate: date,
        purpose: "other",
        court: "↳ from Progress log (H8)",
      };
      await onSaveHearings((prev) => [...prev, h]);
    }
    setNote("");
    setTag("General");
    setRoute("");
  }
  const saveEdit = (id: string) => {
    const text = editText.trim();
    if (text) void onSaveProgress((prev) => prev.map((e) => (e.id === id ? { ...e, note: text } : e)));
    setEditId(null);
  };

  const shown = showAll ? entries : entries.slice(0, 3);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <input type="date" className={`${input} py-1.5 text-xs`} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Entry date" />
        <select className={`${input} py-1.5 text-xs`} value={tag} onChange={(e) => setTag(e.target.value as ProgressTag)} aria-label="Entry tag">
          {PROGRESS_TAGS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className={`${input} py-1.5 text-xs`} value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route entry to a heading">
          {ROUTES.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        <textarea
          className={`${input} min-h-12 flex-1 resize-y text-[13px]`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="New progress entry — paste from Word, or type…"
        />
        <button onClick={() => void add()} disabled={!note.trim()} className={`${btn("primary")} self-end disabled:opacity-40`}>
          + Save
        </button>
      </div>
      {tag === "Court" && (
        <p className="mt-1 text-[11px] text-court">Court-tagged — this entry will also appear under Court matters (H11).</p>
      )}
      <div className="mt-2 space-y-2">
        {entries.length === 0 && <p className="text-sm italic text-ink-dim">No entries yet.</p>}
        {shown.map((e) => (
          <div key={e.id} className="border-l-2 border-statutory pl-2.5">
            <p className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold">{fmtDate(e.date)}</span>
              {e.tag !== "General" && (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-dim">{e.tag}</span>
              )}
              {editId !== e.id && (
                <button
                  onClick={() => { setEditId(e.id); setEditText(e.note); }}
                  className="ml-auto px-1.5 py-0.5 font-mono text-[10px] text-court"
                  aria-label={`Edit entry of ${fmtDate(e.date)}`}
                >
                  edit
                </button>
              )}
            </p>
            {editId === e.id ? (
              <div className="mt-1">
                <textarea className={`${input} w-full resize-y text-[13px]`} value={editText} onChange={(ev) => setEditText(ev.target.value)} rows={3} />
                <div className="mt-1 flex gap-1.5">
                  <button onClick={() => saveEdit(e.id)} className={btn("primary")}>Save</button>
                  <button onClick={() => setEditId(null)} className={btn("ghost")}>Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-snug"><Highlighted text={e.note} /></p>
            )}
          </div>
        ))}
        {entries.length > 3 && (
          <button onClick={() => setShowAll((s) => !s)} className="font-mono text-[11px] text-court">
            {showAll ? "show latest 3" : `show all ${entries.length}`}
          </button>
        )}
      </div>
      <p className="eyebrow mt-2">Edit-only — the investigative log is preserved as an audit trail.</p>
    </div>
  );
}

export function PlanLogPanel({
  agg,
  onSavePlan,
}: {
  agg: CaseAggregate;
  onSavePlan: Updater<PlanEntry>;
}) {
  const entries = [...(agg.planLog ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function add() {
    const text = note.trim();
    if (!text) return;
    await onSavePlan((prev) => [{ id: newId("h13"), date, note: text }, ...prev]);
    setNote("");
  }
  const saveEdit = (id: string) => {
    const text = editText.trim();
    if (text) void onSavePlan((prev) => prev.map((e) => (e.id === id ? { ...e, note: text } : e)));
    setEditId(null);
  };

  const shown = showAll ? entries : entries.slice(0, 4);
  return (
    <div>
      <div className="flex flex-wrap items-end gap-1.5">
        <input type="date" className={`${input} py-1.5 text-xs`} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Action-point date" />
        <input
          className={`${input} min-w-52 flex-1 text-[13px]`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="New action point…"
        />
        <button onClick={() => void add()} disabled={!note.trim()} className={`${btn("primary")} disabled:opacity-40`}>
          + Add
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {entries.length === 0 && <p className="text-sm italic text-ink-dim">No action points yet.</p>}
        {shown.map((e) => (
          <div key={e.id} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 font-mono text-[11px] text-statutory">{fmtDate(e.date)}</span>
            {editId === e.id ? (
              <span className="flex min-w-0 flex-1 gap-1.5">
                <input className={`${input} min-w-0 flex-1 py-1 text-[13px]`} value={editText} onChange={(ev) => setEditText(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && saveEdit(e.id)} />
                <button onClick={() => saveEdit(e.id)} className={btn("primary")}>Save</button>
                <button onClick={() => setEditId(null)} className={btn("ghost")}>✕</button>
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-[13px] leading-snug"><Highlighted text={e.note} /></span>
                <button
                  onClick={() => { setEditId(e.id); setEditText(e.note); }}
                  className="shrink-0 px-1.5 py-0.5 font-mono text-[10px] text-court"
                  aria-label={`Edit action point of ${fmtDate(e.date)}`}
                >
                  edit
                </button>
              </>
            )}
          </div>
        ))}
        {entries.length > 4 && (
          <button onClick={() => setShowAll((s) => !s)} className="font-mono text-[11px] text-court">
            {showAll ? "show latest 4" : `show all ${entries.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
