/**
 * Extraction pipeline: model call, then schema validation, then at most ONE repair retry with
 * the validation errors, then a visible failure. Nothing is silently patched.
 */
import { InvoiceExtractionSchema, extractionJsonSchema, type InvoiceExtraction } from "./schema.ts";
import type { Completion, ModelInput, ModelProvider } from "./providers.ts";

export type Attempt = { raw: string; ok: boolean; errors?: string; latencyMs: number };

export type ExtractionResult = {
  data: InvoiceExtraction;
  provider: Completion["provider"];
  model: string;
  attempts: Attempt[];
  latencyMs: number;
};

export class ExtractionError extends Error {
  readonly attempts: Attempt[];
  constructor(attempts: Attempt[]) {
    super(`The model output did not match the schema after ${attempts.length} attempt(s).`);
    this.attempts = attempts;
  }
}

/** Parses and validates a raw model answer. Returns the data or a readable error list. */
export function parseExtraction(raw: string): { ok: true; data: InvoiceExtraction } | { ok: false; errors: string } {
  let json: unknown;
  try {
    // Some models wrap JSON in a code fence despite structured output; strip only that.
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch (e) {
    return { ok: false, errors: `Not valid JSON: ${(e as Error).message}` };
  }
  const r = InvoiceExtractionSchema.safeParse(json);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    errors: r.error.issues
      .slice(0, 30)
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n"),
  };
}

export async function extractInvoice(opts: {
  provider: ModelProvider;
  input: ModelInput;
  documentSha256: string;
  system: string;
}): Promise<ExtractionResult> {
  const schema = extractionJsonSchema();
  const attempts: Attempt[] = [];
  let last: Completion | undefined;
  for (let i = 0; i < 2; i++) {
    const previous = attempts.at(-1);
    last = await opts.provider.complete({
      documentSha256: opts.documentSha256,
      system: opts.system,
      input: opts.input,
      schema,
      repair: previous ? { previous: previous.raw, errors: previous.errors ?? "" } : undefined,
    });
    const parsed = parseExtraction(last.raw);
    attempts.push({ raw: last.raw, ok: parsed.ok, errors: parsed.ok ? undefined : parsed.errors, latencyMs: last.latencyMs });
    if (parsed.ok) {
      return {
        data: parsed.data,
        provider: last.provider,
        model: last.model,
        attempts,
        latencyMs: attempts.reduce((s, a) => s + a.latencyMs, 0),
      };
    }
  }
  throw new ExtractionError(attempts);
}
