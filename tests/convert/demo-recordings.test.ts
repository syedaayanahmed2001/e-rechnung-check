/**
 * End to end without any model: the bundled recordings (fixtures/recordings/index.json, produced
 * by `python -m erc_eval record`) drive the same pipeline the web demo uses when no key is set.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertAndCheck } from "../../src/lib/convert/convert.ts";
import type { Recording } from "../../src/lib/convert/providers.ts";
import { approveAll, buildReview, toApproved } from "../../src/lib/convert/review.ts";
import { handleExtract } from "../../src/lib/convert/service.ts";
import { EXTRACTION_PROMPT } from "../../src/lib/convert/prompt.ts";
import { ROOT, getValidator, sha256Hex } from "../helpers.ts";

const recordings = JSON.parse(readFileSync(join(ROOT, "fixtures", "recordings", "index.json"), "utf8")) as Recording[];
const PLAIN = join(ROOT, "corpus", "synthetic", "plain");

describe("[CONV-03] recorded demo mode (no key, no model)", () => {
  it("[CONV-03] every plain sample PDF has a recording, labelled with its real provider", () => {
    const shas = new Set(recordings.map((r) => r.documentSha256));
    for (const f of readdirSync(PLAIN)) expect(shas.has(sha256Hex(new Uint8Array(readFileSync(join(PLAIN, f))))), f).toBe(true);
    for (const r of recordings) expect(["baseline", "groq", "ollama"]).toContain(r.provider);
  });

  it.each(readdirSync(PLAIN).slice(0, 4))("[CONV-08] %s: recorded extraction -> approved -> XRechnung accepted", async (f) => {
    const sha = sha256Hex(new Uint8Array(readFileSync(join(PLAIN, f))));
    const res = await handleExtract(JSON.stringify({ documentSha256: sha, input: { kind: "text", text: "(text not used in recorded mode)" } }), {
      env: {},
      recordings,
      system: EXTRACTION_PROMPT,
    });
    expect(res.status).toBe(200);
    if (!res.json.ok) throw new Error(res.json.error);
    const review = buildReview(res.json.data, null);
    const approved = approveAll(review, review.fields.map((x) => x.path));
    const { report } = await convertAndCheck(toApproved(approved), await getValidator());
    expect(report.accepted).toBe(true);
  });
});
