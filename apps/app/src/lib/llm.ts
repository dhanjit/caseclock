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
 * DEPLOYMENT (CSP connect-src 'self'): the model weights must be self-hosted
 * same-origin and supplied via a custom appConfig (VITE_LLM_BASE) — the default
 * (prebuilt HuggingFace) config only works where the CSP is relaxed (local dev).
 * Output is always a DRAFT for the officer to confirm (§7), never verified truth.
 */

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import type { ExtractedFields } from "@/domain/extract";

/** Is on-device WebGPU LLM inference possible here at all? */
export function llmAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

const MODEL = (import.meta.env.VITE_LLM_MODEL as string | undefined) || "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let enginePromise: Promise<MLCEngineInterface> | null = null;

async function getEngine(onProgress?: (m: string) => void): Promise<MLCEngineInterface> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const webllm = await import("@mlc-ai/web-llm");
      onProgress?.("Loading local AI model (one-time download)…");
      return webllm.CreateMLCEngine(MODEL, {
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
  'letterNo, dateOnDoc (ISO yyyy-mm-dd), type, subject, sections, firNo.',
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
      sections: str(obj.sections),
      firNo: str(obj.firNo),
      confidence: 0.65,
    };
  } catch (e) {
    onProgress?.(`Local AI unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
