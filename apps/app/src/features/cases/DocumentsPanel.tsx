/**
 * Connected document repository + on-demand import (REQUIREMENTS §7). Lists a
 * case's documents; imports picked files OFFLINE (index file / filename / text)
 * into DRAFTS the officer reviews + edits before saving (never verified truth);
 * supports manual entry. Originals are stashed in the encrypted sidecar.
 *
 * `extractText` is injected (Layer 3/4) so the heavy PDF/Word/OCR/LLM deps
 * lazy-load only when an import actually runs.
 */

import { useEffect, useMemo, useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  DOCUMENT_SOURCE_LABEL,
  type DocumentDraft,
  type DocumentRecord,
  type DocumentSource,
} from "@/domain/document";
import { importFiles } from "@/domain/import";
import { buildTextExtractor } from "@/lib/text-extract";
import { ocrConfigured } from "@/lib/ocr";
import { llmAvailable } from "@/lib/llm";
import { useDocuments } from "@/state/documents";
import { fmtDate } from "@/lib/format";
import { Section, Field } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";
const sInput = "w-full rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-court";

const SOURCE_BADGE: Record<DocumentSource, string> = {
  manual: "border-line bg-surface-3 text-ink-dim",
  index: "border-ok/40 bg-ok/15 text-ok",
  filename: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  pdftext: "border-court/40 bg-court/15 text-court",
  ocr: "border-statutory/40 bg-statutory/15 text-statutory",
  llm: "border-violet-500/40 bg-violet-500/15 text-violet-300",
};

function emptyManual(): DocumentDraft {
  return { source: "manual", letterNo: "", dateOnDoc: "", type: "", subject: "", direction: null };
}

export function DocumentsPanel({ agg }: { agg: CaseAggregate }) {
  const caseId = agg.case.id;
  const list = useDocuments((s) => s.byCase[caseId]) ?? [];
  const loadCase = useDocuments((s) => s.loadCase);
  const saveConfirmed = useDocuments((s) => s.saveConfirmed);
  const addManual = useDocuments((s) => s.addManual);
  const remove = useDocuments((s) => s.remove);
  const getOriginal = useDocuments((s) => s.getOriginal);

  const [drafts, setDrafts] = useState<DocumentDraft[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<DocumentDraft>(emptyManual());
  const [ocr, setOcr] = useState(false);
  const [llm, setLlm] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const aiAvailable = useMemo(() => llmAvailable(), []);
  const ocrAvailable = useMemo(() => ocrConfigured(), []);

  // Lazy text extractor — pdf.js / mammoth (+ tesseract OCR / web-llm when enabled)
  // load only when an import actually runs, never in the app shell.
  const extractText = useMemo(() => buildTextExtractor({ ocr, llm, onProgress: setProgress }), [ocr, llm]);

  useEffect(() => {
    void loadCase(caseId);
  }, [caseId, loadCase]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const result = await importFiles(files, extractText);
      setDrafts(result.drafts);
      setNotes(result.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function patchDraft(i: number, patch: Partial<DocumentDraft>) {
    setDrafts((ds) => (ds ? ds.map((d, j) => (j === i ? { ...d, ...patch } : d)) : ds));
  }
  function dropDraft(i: number) {
    setDrafts((ds) => (ds ? ds.filter((_, j) => j !== i) : ds));
  }

  async function saveDrafts() {
    if (!drafts || drafts.length === 0) return;
    setBusy(true);
    try {
      await saveConfirmed(caseId, drafts);
      setDrafts(null);
      setNotes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    if (!manual.letterNo && !manual.subject && !manual.dateOnDoc) return;
    setBusy(true);
    try {
      await addManual(caseId, manual);
      setManual(emptyManual());
      setShowManual(false);
    } finally {
      setBusy(false);
    }
  }

  async function openOriginal(d: DocumentRecord) {
    if (!d.blobRef) return;
    const bytes = await getOriginal(d.blobRef);
    if (!bytes) {
      setError("Original not on this device (sidecar files aren't in the backup).");
      return;
    }
    // Force a non-executable type for html/svg/xml so an imported case file can't
    // run script in the app origin (same-origin OPFS/vault access); open with
    // noopener to prevent tab-nabbing.
    const raw = d.mime ?? "application/octet-stream";
    const safeMime = /^(text\/html|image\/svg|application\/(xhtml|xml)|text\/xml)/i.test(raw)
      ? "application/octet-stream"
      : raw;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: safeMime }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <Section title="Documents & import" hint={`${list.length} document${list.length === 1 ? "" : "s"}`} className="mt-3">
      <div className="flex flex-wrap gap-2">
        <label className={`${btn("primary")} cursor-pointer ${busy ? "opacity-40" : ""}`}>
          {busy ? "Working…" : "Import files"}
          <input type="file" multiple className="hidden" onChange={onPick} disabled={busy} />
        </label>
        <button onClick={() => setShowManual((v) => !v)} className={btn("ghost")}>{showManual ? "Cancel" : "Add manually"}</button>
        {ocrAvailable && (
          <label className="flex items-center gap-1.5 text-xs text-ink-dim">
            <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} />
            OCR scanned pages
          </label>
        )}
        {aiAvailable && (
          <label className="flex items-center gap-1.5 text-xs text-ink-dim" title="Reads documents with an on-device model (one-time download, ~1GB). Fully offline. Drafts only.">
            <input type="checkbox" checked={llm} onChange={(e) => setLlm(e.target.checked)} />
            Local AI (downloads model)
          </label>
        )}
      </div>
      <p className="mt-1 text-[11px] text-soft">
        Offline import — point at case files (an <code>index.csv/json</code>, named <code>date_type_ref.pdf</code>, PDFs
        or Word docs). Reads the text layer (and OCRs scans when enabled). Extracted fields are
        <strong> drafts to confirm</strong>, never saved as verified truth.
      </p>
      {progress && <p className="mt-1 text-[11px] text-court">{progress}</p>}
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      {/* Manual entry */}
      {showManual && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Letter / ref no."><input className={input} value={manual.letterNo ?? ""} onChange={(e) => setManual({ ...manual, letterNo: e.target.value })} /></Field>
            <Field label="Date on doc"><input type="date" className={input} value={manual.dateOnDoc ?? ""} onChange={(e) => setManual({ ...manual, dateOnDoc: e.target.value })} /></Field>
            <Field label="Type"><input className={input} value={manual.type ?? ""} onChange={(e) => setManual({ ...manual, type: e.target.value })} placeholder="FSL report, LOC, order…" /></Field>
            <Field label="Direction">
              <select className={input} value={manual.direction ?? ""} onChange={(e) => setManual({ ...manual, direction: (e.target.value || null) as DocumentDraft["direction"] })}>
                <option value="">—</option>
                <option value="in">Inward</option>
                <option value="out">Outward</option>
              </select>
            </Field>
          </div>
          <Field label="Subject"><input className={input} value={manual.subject ?? ""} onChange={(e) => setManual({ ...manual, subject: e.target.value })} /></Field>
          <div className="flex justify-end">
            <button onClick={saveManual} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>Add document</button>
          </div>
        </div>
      )}

      {/* Import draft review */}
      {drafts && (
        <div className="mt-3 rounded-xl border border-statutory/40 bg-statutory/5 p-3">
          <p className="mb-2 text-xs font-semibold text-statutory">
            Review {drafts.length} draft{drafts.length === 1 ? "" : "s"} — edit, then save. {notes.length > 0 && <span className="font-normal text-ink-dim">({notes.join("; ")})</span>}
          </p>
          <div className="space-y-2">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${SOURCE_BADGE[d.source]}`}>
                    {DOCUMENT_SOURCE_LABEL[d.source]}{typeof d.confidence === "number" ? ` · ${Math.round(d.confidence * 100)}%` : ""}
                  </span>
                  <button onClick={() => dropDraft(i)} className="text-[11px] text-soft hover:text-critical">drop ✕</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <input className={sInput} value={d.letterNo ?? ""} placeholder="letter no" onChange={(e) => patchDraft(i, { letterNo: e.target.value })} />
                  <input type="date" className={sInput} value={d.dateOnDoc ?? ""} onChange={(e) => patchDraft(i, { dateOnDoc: e.target.value })} />
                  <input className={sInput} value={d.type ?? ""} placeholder="type" onChange={(e) => patchDraft(i, { type: e.target.value })} />
                  <input className={sInput} value={d.subject ?? ""} placeholder="subject" onChange={(e) => patchDraft(i, { subject: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setDrafts(null); setNotes([]); }} className={btn("ghost")}>Discard</button>
            <button onClick={saveDrafts} disabled={busy || drafts.length === 0} className={`${btn("primary")} disabled:opacity-40`}>
              Save {drafts.length} document{drafts.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-soft">No documents yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {list.map((d) => (
            <li key={d.id} className="flex items-start gap-2 rounded-xl border border-line/60 bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.letterNo && <span className="text-sm font-medium text-ink">{d.letterNo}</span>}
                  {d.type && <span className="text-xs text-ink-dim">· {d.type}</span>}
                  {d.dateOnDoc && <span className="text-xs text-soft">· {fmtDate(d.dateOnDoc)}</span>}
                  {d.direction && <span className="text-[10px] text-soft">· {d.direction === "in" ? "inward" : "outward"}</span>}
                  <span className={`rounded border px-1 py-0.5 text-[9px] ${SOURCE_BADGE[d.source]}`}>{DOCUMENT_SOURCE_LABEL[d.source]}</span>
                </div>
                {d.subject && <p className="truncate text-xs text-ink-dim">{d.subject}</p>}
              </div>
              {d.blobRef && <button onClick={() => void openOriginal(d)} title="Open original" className="shrink-0 text-xs text-court hover:underline">open</button>}
              <button onClick={() => void remove(caseId, d.id)} title="Delete" className="shrink-0 text-xs text-soft hover:text-critical">✕</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
