/**
 * Server-side Convert service: picks the provider from the environment and runs the extraction.
 * Server only: this module reads secrets from process.env and must never be imported by a
 * client component (CONV-09).
 *
 *   ERC_PROVIDER=ollama  -> private mode, local Ollama at OLLAMA_URL (default http://127.0.0.1:11434)
 *   GROQ_API_KEY=...     -> demo mode on Groq's free tier
 *   neither              -> recorded outputs only (demo without a key, CI)
 */
import { ExtractionError, extractInvoice, type ExtractionResult } from "./extract.ts";
import { GroqProvider, NoRecordingError, OllamaProvider, RecordedProvider, type ModelInput, type ModelProvider, type Recording } from "./providers.ts";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type Env = Partial<Record<"ERC_PROVIDER" | "GROQ_API_KEY" | "OLLAMA_URL", string>>;

export function resolveProvider(env: Env, recordings: Recording[], fetchImpl?: typeof fetch): ModelProvider {
  if (env.ERC_PROVIDER === "ollama") return new OllamaProvider({ baseUrl: env.OLLAMA_URL, fetchImpl });
  if (env.GROQ_API_KEY) return new GroqProvider({ apiKey: env.GROQ_API_KEY, fetchImpl });
  return new RecordedProvider(recordings);
}

export type ExtractRequest = { documentSha256: string; input: ModelInput };

export type ExtractResponse =
  | ({ ok: true } & ExtractionResult)
  | { ok: false; error: string; kind: "too-large" | "bad-request" | "no-recording" | "schema" | "provider"; attempts?: ExtractionResult["attempts"] };

function isRequest(x: unknown): x is ExtractRequest {
  const r = x as ExtractRequest;
  if (!r || typeof r.documentSha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.documentSha256) || !r.input) return false;
  if (r.input.kind === "text") return typeof r.input.text === "string" && r.input.text.length > 0;
  if (r.input.kind === "image") return /^image\/(png|jpeg|webp)$/.test(r.input.mimeType) && typeof r.input.base64 === "string";
  return false;
}

/** Handles one extraction request body. Never includes secrets in its output. */
export async function handleExtract(
  body: string,
  deps: { env: Env; recordings: Recording[]; system: string; fetchImpl?: typeof fetch },
): Promise<{ status: number; json: ExtractResponse }> {
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return { status: 413, json: { ok: false, kind: "too-large", error: `Request larger than ${MAX_BODY_BYTES / 1024 / 1024} MB` } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { ok: false, kind: "bad-request", error: "Body is not JSON" } };
  }
  if (!isRequest(parsed)) return { status: 400, json: { ok: false, kind: "bad-request", error: "Invalid request" } };

  const provider = resolveProvider(deps.env, deps.recordings, deps.fetchImpl);
  try {
    const result = await extractInvoice({ provider, input: parsed.input, documentSha256: parsed.documentSha256, system: deps.system });
    return { status: 200, json: { ok: true, ...result } };
  } catch (e) {
    if (e instanceof NoRecordingError) return { status: 404, json: { ok: false, kind: "no-recording", error: e.message } };
    if (e instanceof ExtractionError) return { status: 422, json: { ok: false, kind: "schema", error: e.message, attempts: e.attempts } };
    const msg = String((e as Error).message ?? e);
    const secret = deps.env.GROQ_API_KEY;
    return { status: 502, json: { ok: false, kind: "provider", error: secret ? msg.replaceAll(secret, "[redacted]") : msg } };
  }
}
