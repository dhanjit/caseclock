/**
 * Lazy, OFFLINE document-text extraction for the §7 import pipeline. Builds a
 * TextExtractor (file → text) that the DocumentsPanel injects into importFiles.
 *
 * Heavy deps are dynamic-imported INSIDE the call, so pdf.js / mammoth / tesseract
 * never enter the app shell — they load only when an import actually runs. All
 * assets are self-hosted (Vite bundles them same-origin), so the CSP
 * `connect-src 'self'` / no-egress posture holds. Every result is a DRAFT.
 */

import type { TextExtractor } from "@/domain/import";
import type { DocumentSource } from "@/domain/document";

export interface ExtractorOptions {
  /** OCR scanned/image PDFs + image files (tesseract.js, lazy). */
  ocr?: boolean;
  /** Opt-in local LLM refinement of extracted text (web-llm, WebGPU, lazy). */
  llm?: boolean;
  /** Progress callback for long OCR/LLM work. */
  onProgress?: (msg: string) => void;
}

/** Run the optional LLM pass over extracted text (no-op when disabled). */
async function maybeLlm(text: string, opts: ExtractorOptions) {
  if (!opts.llm || !text || text.trim().length < 15) return undefined;
  const { extractWithLLM } = await import("./llm");
  return (await extractWithLLM(text, opts.onProgress)) ?? undefined;
}

const PDF_RE = /\.pdf$/i;
const DOCX_RE = /\.docx$/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const MIN_TEXT = 24; // below this a PDF is treated as scanned → OCR candidate

let workerConfigured = false;
async function pdfjsModule() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    // MUST be set in the same module as getDocument (Vite resolves this to a
    // bundled, same-origin worker asset — no CDN, CSP-safe).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
    workerConfigured = true;
  }
  return pdfjs;
}

/** Extract the embedded text layer of a PDF (first ~12 pages). */
async function pdfText(file: File): Promise<string> {
  const pdfjs = await pdfjsModule();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, 12);
  let text = "";
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await task.destroy();
  return text;
}

/** Render the first PDF page to a canvas (for OCR of scanned PDFs). */
export async function pdfFirstPageCanvas(file: File, maxDim = 1600): Promise<HTMLCanvasElement> {
  const pdfjs = await pdfjsModule();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDim / base.width, maxDim / base.height, 2);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  await task.destroy();
  return canvas;
}

async function docxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

export function buildTextExtractor(opts: ExtractorOptions = {}): TextExtractor {
  return async (file: File) => {
    const name = file.name;
    try {
      if (PDF_RE.test(name) || file.type === "application/pdf") {
        const text = await pdfText(file);
        if (text.trim().length >= MIN_TEXT) {
          return { text, source: "pdftext" as DocumentSource, fields: await maybeLlm(text, opts) };
        }
        // Scanned PDF (no text layer) → OCR the first page if enabled.
        if (opts.ocr) {
          const { ocrCanvas } = await import("./ocr");
          const canvas = await pdfFirstPageCanvas(file);
          const ocr = await ocrCanvas(canvas, opts.onProgress);
          return { text: ocr.trim() || null, source: "ocr" as DocumentSource, fields: await maybeLlm(ocr, opts) };
        }
        return { text: text.trim() || null, source: "pdftext" as DocumentSource };
      }
      if (DOCX_RE.test(name)) {
        const text = await docxText(file);
        return { text: text.trim() || null, source: "pdftext" as DocumentSource, fields: await maybeLlm(text, opts) };
      }
      if (opts.ocr && (IMAGE_RE.test(name) || file.type.startsWith("image/"))) {
        const { ocrBlob } = await import("./ocr");
        const ocr = await ocrBlob(file, opts.onProgress);
        return { text: ocr.trim() || null, source: "ocr" as DocumentSource, fields: await maybeLlm(ocr, opts) };
      }
    } catch (err) {
      opts.onProgress?.(`Extraction failed for ${name}: ${err instanceof Error ? err.message : String(err)}`);
      return null; // fall back to filename heuristics
    }
    return null;
  };
}
