/**
 * Parity job: runs the official KoSIT Java validator and the JS rule runner on the same
 * corpus and fails on any difference (see src/lib/check/parity.ts for what "difference" means).
 *
 *   node scripts/parity/run-parity.ts [corpus-dir ...]
 *
 * Env: KOSIT_VALIDATOR_JAR (default .cache/kosit/validator-1.6.3-standalone.jar)
 * Writes: .cache/parity/parity-report.json
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, closeSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeValidator } from "../../src/lib/check/node.ts";
import { parseKositReport } from "../../src/lib/check/kosit-report.ts";
import { compareReports, type Difference } from "../../src/lib/check/parity.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JAR = resolve(process.env.KOSIT_VALIDATOR_JAR ?? join(ROOT, ".cache", "kosit", "validator-1.6.3-standalone.jar"));
const CONFIG = join(ROOT, "vendor", "kosit", "validator-configuration");
const WORK = join(ROOT, ".cache", "parity");

function xmlFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? xmlFiles(p) : n.endsWith(".xml") ? [p] : [];
    })
    .sort();
}

function runJava(files: string[], outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  // The validator probes stdin to detect piped input; give it an empty regular file.
  const emptyPath = join(WORK, "empty-stdin");
  writeFileSync(emptyPath, "");
  const stdin = openSync(emptyPath, "r");
  // Batch to stay well under command-line length limits.
  for (let i = 0; i < files.length; i += 50) {
    const r = spawnSync(
      "java",
      ["-jar", JAR, "-s", join(CONFIG, "scenarios.xml"), "-r", CONFIG, "-o", outDir, ...files.slice(i, i + 50)],
      { stdio: [stdin, "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (r.error) throw r.error;
    if (!/Acceptable:/.test(r.stdout)) {
      throw new Error(`Java validator did not run:\n${r.stdout}\n${r.stderr}`);
    }
  }
  closeSync(stdin);
}

async function main(): Promise<void> {
  const dirs = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [join(ROOT, "corpus", "kosit-testsuite", "instances"), join(ROOT, "corpus", "mutations"), join(ROOT, "corpus", "synthetic", "xml"), join(ROOT, ".cache", "external", "zugferd-corpus", "XML-Rechnung")];
  const files = dirs.flatMap((d) => {
    try {
      return xmlFiles(resolve(d));
    } catch {
      return [];
    }
  });
  mkdirSync(WORK, { recursive: true });

  const t0 = Date.now();
  runJava(files, join(WORK, "java"));
  const javaMs = Date.now() - t0;

  const validator = await createNodeValidator(ROOT);
  const results: { file: string; scenario: string | null; accepted: boolean; jsMs: number; diffs: Difference[] }[] = [];
  let jsTotal = 0;
  for (const file of files) {
    const java = parseKositReport(readFileSync(join(WORK, "java", basename(file).replace(/\.xml$/, "-report.xml")), "utf8"));
    const js = await validator.validate(new Uint8Array(readFileSync(file)));
    jsTotal += js.durationMs ?? 0;
    results.push({
      file: file.slice(ROOT.length + 1).replaceAll("\\", "/"),
      scenario: java.scenario,
      accepted: java.accepted,
      jsMs: js.durationMs ?? 0,
      diffs: compareReports(java, js),
    });
  }

  const failing = results.filter((r) => r.diffs.length > 0);
  const summary = {
    files: results.length,
    identical: results.length - failing.length,
    different: failing.length,
    acceptedByJava: results.filter((r) => r.accepted).length,
    rejectedByJava: results.filter((r) => !r.accepted).length,
    javaWallMs: javaMs,
    jsTotalMs: jsTotal,
    jsMedianMs: results.map((r) => r.jsMs).sort((a, b) => a - b)[Math.floor(results.length / 2)] ?? 0,
  };
  writeFileSync(join(WORK, "parity-report.json"), JSON.stringify({ summary, results }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  for (const f of failing.slice(0, 20)) console.log(`DIFF ${f.file}\n${JSON.stringify(f.diffs, null, 2)}`);
  if (failing.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
