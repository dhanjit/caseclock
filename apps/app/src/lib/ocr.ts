/**
 * Lazy offline OCR (REQUIREMENTS §7) via tesseract.js — a locally-run LSTM model
 * (the "local model" option), single-thread WASM (no COOP/COEP needed). Loaded
 * only when the officer enables OCR for an import. Output is always a DRAFT.
 *
 * DEPLOYMENT (CSP connect-src 'self'): self-host the worker / core wasm /
 * eng.traineddata under a path and set VITE_TESSERACT_PATH (e.g. "/tesseract") so
 * nothing is fetched from a CDN. Without it, tesseract.js's default asset
 * resolution is used (fine for local dev). Callers wrap this in try/catch, so a
 * blocked/failed load degrades gracefully to the filename heuristics.
 */

type OcrInput = Blob | HTMLCanvasElement | HTMLImageElement;

function assetOptions() {
  const base = (import.meta.env.VITE_TESSERACT_PATH as string | undefined)?.replace(/\/$/, "");
  if (!base) return {};
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/`,
    langPath: base,
  };
}

async function run(image: OcrInput, onProgress?: (m: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.("Loading OCR engine…");
  const worker = await createWorker("eng", 1, {
    ...assetOptions(),
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
