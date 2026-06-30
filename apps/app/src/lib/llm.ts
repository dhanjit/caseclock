/**
 * Opt-in LOCAL LLM (REQUIREMENTS §7) via @mlc-ai/web-llm — WebGPU inference, no
 * network at run time. The richest DRAFT-extraction layer, on top of heuristics +
 * OCR. Strictly gated + lazy + graceful:
 *   - only offered when navigator.gpu exists (WebGPU). On iPad Pro it's Safari 26+;
 *     in WKWebView / older devices it's absent → this layer is simply skipped.
 *   - the engine (and its multi-hundred-MB weights) load only on explicit opt-in.
 *   - any failure returns null → the import falls back to heuristics/OCR. Never
 *     blocks an import.
 *
 * NO-EGRESS: web-llm's prebuilt config fetches weights from HuggingFace — which
 * would violate the no-cloud invariant anywhere without the CSP (native WebView,
 * dev server). So the LLM is ENABLED ONLY when the weights are self-hosted
 * same-origin and VITE_LLM_BASE points at them; we then build an explicit appConfig
 * from that base and NEVER fall back to the HuggingFace prebuilt config. When unset,
 * llmAvailable() is false (the UI hides the toggle). Output is always a DRAFT (§7).
 */

import type { MLCEngineInterface, AppConfig } from "@mlc-ai/web-llm";
import type { ExtractedFields } from "@/domain/extract";

const MODEL = (import.meta.env.VITE_LLM_MODEL as string | undefined) || "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const LLM_BASE = (import.meta.env.VITE_LLM_BASE as string | undefined)?.replace(/\/$/, "");

/** On-device LLM is usable only with WebGPU AND self-hosted weights configured. */
export function llmAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!LLM_BASE;
}

let enginePromise: Promise<MLCEngineInterface> | null = null;

async function getEngine(onProgress?: (m: string) => void): Promise<MLCEngineInterface> {
  if (!LLM_BASE) {
    // Hard refusal — do NOT let web-llm reach HuggingFace.
    throw new Error("Local AI weights are not self-hosted (set VITE_LLM_BASE); refusing to fetch from a CDN.");
  }
  if (!enginePromise) {
    enginePromise = (async () => {
      const webllm = await import("@mlc-ai/web-llm");
      onProgress?.("Loading local AI model (one-time download)…");
      // Same-origin model + lib URLs derived from the self-host base.
      const appConfig: AppConfig = {
        model_list: [
          {
            model: `${LLM_BASE}/${MODEL}`,
            model_id: MODEL,
            model_lib: `${LLM_BASE}/${MODEL}/${MODEL}-webgpu.wasm`,
          },
        ],
      };
      return webllm.CreateMLCEngine(MODEL, {
        appConfig,
        initProgressCallback: (p: { text: string }) => onProgress?.(p.text),
      });
    })().catch((e) => {
      enginePromise = null; // allow a retry after a transient failure
      throw e;
    });
  }
  return enginePromise;
}

const SYSTEM_PROMPT = [
  "You extract metadata from a single Indian police case document.",
  "Reply with ONLY a compact JSON object, no prose, with these keys:",
  "letterNo, dateOnDoc (ISO yyyy-mm-dd), type, subject.",
  "Use null for anything not clearly present. Never invent or guess values.",
].join(" ");

/** Propose structured fields for a document's text. Returns null if the LLM is
 *  unavailable, declined, or errors — the caller then uses the heuristics. */
export async function extractWithLLM(
  text: string,
  onProgress?: (m: string) => void,
): Promise<Partial<ExtractedFields> | null> {
  if (!llmAvailable()) return null;
  try {
    const engine = await getEngine(onProgress);
    onProgress?.("Reading with local AI…");
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 4000) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const content = reply.choices?.[0]?.message?.content;
    if (!content) return null;
    const obj = JSON.parse(content) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      letterNo: str(obj.letterNo),
      dateOnDoc: str(obj.dateOnDoc),
      type: str(obj.type),
      subject: str(obj.subject),
      confidence: 0.65,
    };
  } catch (e) {
    onProgress?.(`Local AI unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
