/**
 * Counts which rule codes fire in the official Java reports of the last parity run
 * (.cache/parity/java). Used to decide which rules get a hand-written explanation first.
 *
 *   node scripts/parity/message-stats.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKositReport } from "../../src/lib/check/kosit-report.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, ".cache", "parity", "java");

const counts = new Map<string, { files: number; messages: number; levels: Set<string> }>();
let total = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith("-report.xml"))) {
  const report = parseKositReport(readFileSync(join(DIR, f), "utf8"));
  const seen = new Set<string>();
  for (const m of report.steps.filter((s) => s.kind === "schematron").flatMap((s) => s.messages)) {
    total++;
    const c = counts.get(m.code) ?? { files: 0, messages: 0, levels: new Set<string>() };
    c.messages++;
    c.levels.add(m.level);
    if (!seen.has(m.code)) c.files++;
    seen.add(m.code);
    counts.set(m.code, c);
  }
}
console.log(`schematron messages: ${total}, distinct codes: ${counts.size}`);
for (const [code, c] of [...counts].sort((a, b) => b[1].files - a[1].files)) {
  console.log(`${code}\tfiles=${c.files}\tmessages=${c.messages}\t${[...c.levels].join(",")}`);
}
