/**
 * On-demand import orchestrator (REQUIREMENTS §7). Turns picked files into DRAFT
 * documents using the offline heuristics in extract.ts. NOT a watched folder — the
 * officer triggers each import. Layered extraction (every layer is a draft):
 *   1. index file (CSV/JSON named *index*)  → dependable structured rows
 *   2. plain text files                      → text-layer field extraction
 *   3. `extractText` hook (PDF/Word/OCR/LLM) → text-layer field extraction
 *   4. filename convention                   → last-resort fields
 *
 * The `extractText` hook is injected by the UI so the heavy text/OCR/LLM deps
 * (pdfjs-dist, mammoth, tesseract.js, web-llm) lazy-load only when an import runs.
 */

import { parseIndexFile, parseFilename, extractFields, type ExtractedFields } from "./extract";
import type { DocumentDraft, DocumentSource } from "./document";

const INDEX_NAME = /index.*\.(csv|json|tsv|txt)$/i;
const PLAIN_TEXT = /\.(txt|csv|tsv|md|json)$/i;

/** Text extractor for a non-plain-text file (PDF/Word/image). Returns null if it
 *  can't extract any usable text (→ the caller falls back to the filename). */
export type TextExtractor = (file: File) => Promise<{ text: string | null; source: DocumentSource } | null>;

export interface ImportResult {
  drafts: DocumentDraft[];
  notes: string[];
}

function fieldsToDraft(
  f: ExtractedFields,
  source: DocumentSource,
  fileName: string | null,
  original: Uint8Array | null,
  mime: string | null,
): DocumentDraft {
  return {
    letterNo: f.letterNo ?? null,
    dateOnDoc: f.dateOnDoc ?? null,
    type: f.type ?? null,
    subject: f.subject ?? null,
    direction: f.direction ?? null,
    source,
    confidence: f.confidence,
    fileName,
    mime,
    original,
  };
}

/** Prefer text-extracted fields, fall back per-field to filename heuristics. */
function merge(primary: ExtractedFields, fallback: ExtractedFields): ExtractedFields {
  return {
    letterNo: primary.letterNo ?? fallback.letterNo,
    dateOnDoc: primary.dateOnDoc ?? fallback.dateOnDoc,
    type: primary.type ?? fallback.type,
    subject: primary.subject ?? fallback.subject,
    sections: primary.sections ?? fallback.sections,
    firNo: primary.firNo ?? fallback.firNo,
    direction: primary.direction ?? fallback.direction,
    confidence: Math.max(primary.confidence, fallback.confidence),
  };
}

export async function importFiles(files: File[], extractText?: TextExtractor): Promise<ImportResult> {
  const drafts: DocumentDraft[] = [];
  const notes: string[] = [];

  for (const file of files) {
    // 1. Index file → one draft per row (no original bytes).
    if (INDEX_NAME.test(file.name)) {
      const rows = parseIndexFile(await file.text());
      rows.forEach((r) => drafts.push(fieldsToDraft(r, "index", file.name, null, null)));
      notes.push(`${file.name} → ${rows.length} index row(s)`);
      continue;
    }

    const original = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || null;
    const fnameFields = parseFilename(file.name);

    // 2/3. Text extraction (plain text inline, else via the injected hook).
    let text: string | null = null;
    let source: DocumentSource = "filename";
    if (PLAIN_TEXT.test(file.name)) {
      text = await file.text();
      source = "pdftext";
    } else if (extractText) {
      const res = await extractText(file);
      if (res && res.text) {
        text = res.text;
        source = res.source;
      }
    }

    if (text && text.trim().length > 15) {
      const fields = merge(extractFields(text), fnameFields);
      drafts.push(fieldsToDraft(fields, source, file.name, original, mime));
      notes.push(`${file.name} → ${source === "filename" ? "filename" : "text"} extracted`);
    } else {
      // 4. Filename only.
      drafts.push(fieldsToDraft(fnameFields, "filename", file.name, original, mime));
      notes.push(`${file.name} → filename only`);
    }
  }

  return { drafts, notes };
}
