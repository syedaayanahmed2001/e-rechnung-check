/**
 * Writes the shared contract files used by the Python eval from their TypeScript source of truth:
 *   schema/invoice-extraction.schema.json   <- src/lib/convert/schema.ts (Zod)
 *   schema/extraction-prompt.md             <- src/lib/convert/prompt.ts
 *
 *   node scripts/schema/export-schema.ts          # write
 *   node scripts/schema/export-schema.ts --check  # exit 1 if a committed file is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRACTION_PROMPT } from "../../src/lib/convert/prompt.ts";
import { extractionJsonSchema } from "../../src/lib/convert/schema.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function contractFiles(): Record<string, string> {
  return {
    [join(ROOT, "schema", "invoice-extraction.schema.json")]: JSON.stringify(extractionJsonSchema(), null, 2) + "\n",
    [join(ROOT, "schema", "extraction-prompt.md")]: EXTRACTION_PROMPT,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [file, content] of Object.entries(contractFiles())) {
    if (check) {
      if (readFileSync(file, "utf8") !== content) {
        console.error(`stale: ${file} (run node scripts/schema/export-schema.ts)`);
        stale = true;
      }
    } else {
      writeFileSync(file, content);
      console.log(`wrote ${file}`);
    }
  }
  if (stale) process.exit(1);
}
