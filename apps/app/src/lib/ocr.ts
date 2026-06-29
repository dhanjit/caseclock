/**
 * Lazy offline OCR (REQUIREMENTS §7) via tesseract.js — a locally-run LSTM model
 * (the "local model" option), single-thread WASM (no COOP/COEP needed). Loaded
 * only when the officer enables OCR for an import. Output is always a DRAFT.
 *
 * NO-EGRESS: tesseract.js's defaults fetch the worker / core wasm / eng.traineddata
 * from a CDN (jsdelivr) — which would violate the no-cloud invariant in any context
 * without the CSP (native WebView, dev server). So OCR is ENABLED ONLY when the
 * assets are self-hosted same-origin and VITE_TESSERACT_PATH points at them (e.g.
 * "/tesseract"). When unset, ocrConfigured() is false (the UI hides the toggle) and
 * run() throws rather than hitting a CDN. Callers wrap this in try/catch → graceful
 * degradation to the filename heuristics.
 */

type OcrInput = Blob | HTMLCanvasElement | HTMLImageElement;

/** Are self-hosted OCR assets configured? (Gates the toggle — no CDN fallback.) */
export function ocrConfigured(): boolean {
  return !!(import.meta.env.VITE_TESSERACT_PATH as string | undefined);
}

function assetOptions() {
  const base = (import.meta.env.VITE_TESSERACT_PATH as string | undefined)?.replace(/\/$/, "");
  if (!base) {
    // Never fall through to tesseract's CDN defaults — that would egress.
    throw new Error("OCR assets are not self-hosted (set VITE_TESSERACT_PATH); refusing to fetch from a CDN.");
  }
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/`,
    langPath: base,
  };
}

async function run(image: OcrInput, onProgress?: (m: string) => void): Promise<string> {
  const options = assetOptions(); // throws (caught upstream) if not self-hosted
  const { createWorker } = await import("tesseract.js");
  onProgress?.("Loading OCR engine…");
  const worker = await createWorker("eng", 1, {
    ...options,
    logger: (m: { status: string; progress: number }) =>
      onProgress?.(`OCR: ${m.status} ${Math.round((m.progress ?? 0) * 100)}%`),
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function ocrBlob(blob: Blob, onProgress?: (m: string) => void): Promise<string> {
  return run(blob, onProgress);
}

export async function ocrCanvas(canvas: HTMLCanvasElement, onProgress?: (m: string) => void): Promise<string> {
  return run(canvas, onProgress);
}
