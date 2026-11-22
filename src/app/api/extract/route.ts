import { handleExtract } from "@/lib/convert/service.ts";
import type { Recording } from "@/lib/convert/providers.ts";
import recordings from "../../../../fixtures/recordings/index.json";
import { EXTRACTION_PROMPT } from "@/lib/convert/prompt.ts";

/**
 * POST /api/extract: the only server call in the app. It receives the extracted page text (or
 * the page image) for Convert. Check never calls the server: it runs in the browser.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const { status, json } = await handleExtract(body, {
    env: { ERC_PROVIDER: process.env.ERC_PROVIDER, GROQ_API_KEY: process.env.GROQ_API_KEY, OLLAMA_URL: process.env.OLLAMA_URL },
    recordings: recordings as Recording[],
    system: EXTRACTION_PROMPT,
  });
  return Response.json(json, { status, headers: { "cache-control": "no-store" } });
}
