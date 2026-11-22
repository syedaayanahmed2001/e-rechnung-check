/**
 * Model providers for Convert. Open-weight models only, no paid APIs.
 *
 *  - groq:     Groq free tier, OpenAI-compatible chat API with strict json_schema output
 *  - ollama:   local Ollama (private mode, nothing leaves the machine), `format` = JSON Schema
 *  - recorded: replays stored real outputs, keyed by SHA-256 of the input (demo without a key, CI)
 *
 * Model choices (all Apache-2.0 open weights, checked 2026-11-22):
 *   groq   text  openai/gpt-oss-120b      vision qwen/qwen3.8-27b (Groq preview model)
 *   ollama text  qwen3:4b                 vision granite3.2-vision:2b
 */

export type ProviderId = "groq" | "ollama" | "recorded";

export type ModelInput = { kind: "text"; text: string } | { kind: "image"; mimeType: string; base64: string };

export type CompletionRequest = {
  /** SHA-256 of the original file (PDF or image) the input was taken from; the recording key. */
  documentSha256: string;
  system: string;
  input: ModelInput;
  schema: Record<string, unknown>;
  /** Present on the repair retry: what was wrong with the previous answer. */
  repair?: { previous: string; errors: string };
};

export type Completion = { raw: string; model: string; provider: ProviderId | "baseline"; latencyMs: number };

export interface ModelProvider {
  readonly id: ProviderId;
  modelFor(input: ModelInput): string;
  complete(req: CompletionRequest): Promise<Completion>;
}

export const MODELS = {
  groq: { text: "openai/gpt-oss-120b", vision: "qwen/qwen3.8-27b" },
  ollama: { text: "qwen3:4b", vision: "granite3.2-vision:2b" },
} as const;

type Fetch = typeof fetch;

function userContent(req: CompletionRequest): string {
  const base =
    req.input.kind === "text"
      ? `Invoice text:\n<<<\n${req.input.text}\n>>>`
      : "The invoice is the attached image. Copy each value and its source text from the image.";
  if (!req.repair) return base;
  return `${base}\n\nYour previous answer was not valid against the schema:\n${req.repair.errors}\n\nPrevious answer:\n${req.repair.previous}\n\nReturn a corrected JSON object.`;
}

export class GroqProvider implements ModelProvider {
  readonly id = "groq" as const;
  private readonly apiKey: string;
  private readonly fetchImpl: Fetch;
  private readonly baseUrl: string;
  constructor(opts: { apiKey: string; fetchImpl?: Fetch; baseUrl?: string }) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? "https://api.groq.com/openai/v1";
  }
  modelFor(input: ModelInput): string {
    return input.kind === "text" ? MODELS.groq.text : MODELS.groq.vision;
  }
  buildBody(req: CompletionRequest): Record<string, unknown> {
    const content =
      req.input.kind === "text"
        ? userContent(req)
        : [
            { type: "text", text: userContent(req) },
            { type: "image_url", image_url: { url: `data:${req.input.mimeType};base64,${req.input.base64}` } },
          ];
    return {
      model: this.modelFor(req.input),
      temperature: 0,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: { name: "invoice_extraction", strict: true, schema: req.schema } },
    };
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    const t0 = performance.now();
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(this.buildBody(req)),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[]; model?: string };
    return {
      raw: json.choices[0]?.message?.content ?? "",
      model: json.model ?? this.modelFor(req.input),
      provider: "groq",
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: Fetch;
  constructor(opts: { baseUrl?: string; fetchImpl?: Fetch } = {}) {
    this.baseUrl = opts.baseUrl ?? "http://127.0.0.1:11434";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  modelFor(input: ModelInput): string {
    return input.kind === "text" ? MODELS.ollama.text : MODELS.ollama.vision;
  }
  buildBody(req: CompletionRequest): Record<string, unknown> {
    const user: Record<string, unknown> = { role: "user", content: userContent(req) };
    if (req.input.kind === "image") user.images = [req.input.base64];
    return {
      model: this.modelFor(req.input),
      stream: false,
      format: req.schema,
      options: { temperature: 0 },
      messages: [{ role: "system", content: req.system }, user],
    };
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    const t0 = performance.now();
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.buildBody(req)),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { message: { content: string }; model?: string };
    return {
      raw: json.message?.content ?? "",
      model: json.model ?? this.modelFor(req.input),
      provider: "ollama",
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

export type Recording = {
  /** SHA-256 of the original file bytes. */
  documentSha256: string;
  provider: ProviderId | "baseline";
  model: string;
  recordedAt: string;
  latencyMs: number;
  raw: string;
};

/** Replays recordings. Throws for an input that has none (it never fabricates an answer). */
export class RecordedProvider implements ModelProvider {
  readonly id = "recorded" as const;
  private readonly byHash: Map<string, Recording>;
  constructor(recordings: Recording[]) {
    this.byHash = new Map(recordings.map((r) => [r.documentSha256, r]));
  }
  modelFor(): string {
    return "recorded";
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    const r = this.byHash.get(req.documentSha256);
    if (!r) throw new NoRecordingError(req.documentSha256);
    // A repair retry replays the same recording: recordings hold the final answer of a run.
    return { raw: r.raw, model: r.model, provider: r.provider, latencyMs: r.latencyMs };
  }
}

export class NoRecordingError extends Error {
  readonly inputSha256: string;
  constructor(hash: string) {
    super(`No recorded model output for this input (${hash.slice(0, 12)}…). Set GROQ_API_KEY or use private mode (Ollama).`);
    this.inputSha256 = hash;
  }
}

/** SHA-256 hex of bytes, identical in Node and the browser (Web Crypto). */
export async function sha256HexAsync(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
