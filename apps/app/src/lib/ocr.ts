/**
 * Lazy offline OCR (REQUIREMENTS §7) via tesseract.js — a locally-run LSTM model
 * (the "local model" option), single-thread WASM (no COOP/COEP needed). Loaded
 * only when the officer enables OCR for an import. Output is always a DRAFT.
 *
 * NO-EGRESS: tesseract.js's defaults fetch the worker / core wasm / eng.traineddata
 * from a CDN (jsdelivr) — which would violate the no-cloud invariant. So we NEVER
 * use its defaults. The engine + English model are BUNDLED same-origin at
 * /tesseract by scripts/bundle-ocr-assets.mjs (run on build/dev), so OCR works
 * fully locally out of the box, offline, zero setup. VITE_TESSERACT_PATH only
 * OVERRIDES the location (e.g. a CDN-free custom mount). Callers wrap run() in
 * try/catch → graceful degradation to filename heuristics if assets are missing.
 */

type OcrInput = Blob | HTMLCanvasElement | HTMLImageElement;

/** Where the bundled tesseract worker / core / traineddata are served (same-origin). */
const OCR_BASE = ((import.meta.env.VITE_TESSERACT_PATH as string | undefined) || "/tesseract").replace(/\/$/, "");

/** OCR ships with bundled assets, so it's always available (no CDN fallback). */
export function ocrConfigured(): boolean {
  return true;
}

function assetOptions() {
  return {
    workerPath: `${OCR_BASE}/worker.min.js`,
    corePath: `${OCR_BASE}/`, // directory → tesseract loads the LSTM core variant it feature-detects
    langPath: OCR_BASE, // → ${OCR_BASE}/eng.traineddata.gz (gzip default)
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
