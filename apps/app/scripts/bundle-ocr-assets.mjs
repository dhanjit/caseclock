/**
 * Bundle the tesseract.js OCR assets into public/tesseract/ so OCR runs FULLY
 * LOCALLY, same-origin, offline — no CDN, no deploy-time hosting step (§7).
 *
 * Copies the worker + every tesseract-core wasm variant out of node_modules (so
 * the worker's feature-detect always finds the file it picks at runtime — only
 * ~2.7MB actually loads), and fetches the compact `fast` English traineddata once.
 * Assets are gitignored (regenerated from deps); idempotent. The traineddata fetch
 * is the ONLY network touch and is best-effort — a build offline still bundles the
 * engine; only the language file would be missing (OCR then degrades gracefully).
 *
 * Run automatically by `pnpm build`/`pnpm dev`; safe to run by hand.
 */

import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "tesseract");
// projectnaptha hosts the same fast traineddata tesseract.js uses by default.
const TRAINEDDATA_URL = "https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz";

mkdirSync(OUT, { recursive: true });

// 1) worker.min.js (the tesseract.js web worker)
const tjPkg = require.resolve("tesseract.js/package.json");
const tjDir = dirname(tjPkg);
copyFileSync(join(tjDir, "dist", "worker.min.js"), join(OUT, "worker.min.js"));

// 2) the LSTM tesseract-core variants + their .js loaders. Modern tesseract is
// LSTM-only; shipping the simd / relaxedsimd / plain LSTM trio covers every
// device the feature-detect can land on (only one ~2.7MB wasm loads at runtime).
// We deliberately skip the legacy non-LSTM cores to keep the bundle lean.
// tesseract.js-core is a transitive dep, so resolve it FROM tesseract.js's scope.
const coreReq = createRequire(tjPkg);
const coreDir = dirname(coreReq.resolve("tesseract.js-core/package.json"));
let coreCount = 0;
for (const f of readdirSync(coreDir)) {
  if (f.startsWith("tesseract-core") && f.includes("-lstm") && (f.endsWith(".wasm") || f.endsWith(".js"))) {
    copyFileSync(join(coreDir, f), join(OUT, f));
    coreCount++;
  }
}

// 3) English `fast` traineddata.gz — fetch once (best-effort, offline-build-safe)
const langPath = join(OUT, "eng.traineddata.gz");
if (existsSync(langPath) && statSync(langPath).size > 0) {
  console.log("[ocr-assets] eng.traineddata.gz already present");
} else {
  try {
    const res = await fetch(TRAINEDDATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(langPath, Buffer.from(await res.arrayBuffer()));
    console.log(`[ocr-assets] downloaded eng.traineddata.gz (${(statSync(langPath).size / 1048576).toFixed(1)}MB)`);
  } catch (e) {
    console.warn(`[ocr-assets] WARN: could not fetch traineddata (${e.message}). OCR will lack the English model until it's placed at public/tesseract/eng.traineddata.gz`);
  }
}

console.log(`[ocr-assets] bundled worker + ${coreCount} core file(s) → public/tesseract/`);
