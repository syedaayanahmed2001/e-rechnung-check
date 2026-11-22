/**
 * Downloads the pinned third-party artefacts listed in artefacts.json, verifies each SHA-256
 * and extracts it. A hash mismatch aborts: rule files that are not exactly the published
 * ones must never be used.
 *
 *   node scripts/rules/fetch-artefacts.ts            # everything except optional
 *   node scripts/rules/fetch-artefacts.ts --all      # also the Java validator (parity job)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(ROOT, ".cache", "artefacts");

export type Artefact = {
  id: string;
  name: string;
  url: string;
  sha256: string;
  licence: string;
  extractTo?: string;
  only?: string;
  files?: string[];
  saveAs?: string;
  optional?: boolean;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Throws unless `bytes` hash to `expected`. */
export function verifySha256(bytes: Uint8Array, expected: string, label: string): void {
  const actual = sha256Hex(bytes);
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`${label}: no valid pinned SHA-256`);
  if (actual !== expected) throw new Error(`${label}: SHA-256 mismatch (expected ${expected}, got ${actual})`);
}

/** Extracts entries below `only` (prefix stripped), optionally limited to `files`. */
export function extractZip(zip: Uint8Array, targetDir: string, only = "", files?: string[]): number {
  const entries = unzipSync(zip);
  let n = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/") || !name.startsWith(only)) continue;
    if (files && !files.includes(name)) continue;
    const rel = name.slice(only.length);
    if (rel.includes("..")) throw new Error(`unsafe path in archive: ${name}`);
    const target = join(targetDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    n++;
  }
  return n;
}

async function download(a: Artefact): Promise<Uint8Array> {
  const file = join(CACHE, a.url.split("/").pop()!);
  if (existsSync(file)) {
    const cached = new Uint8Array(readFileSync(file));
    if (sha256Hex(cached) === a.sha256) return cached;
  }
  const res = await fetch(a.url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${a.id}: HTTP ${res.status} for ${a.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  verifySha256(bytes, a.sha256, a.id);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, bytes);
  return bytes;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const { artefacts } = JSON.parse(readFileSync(join(ROOT, "scripts", "rules", "artefacts.json"), "utf8")) as {
    artefacts: Artefact[];
  };
  for (const a of artefacts) {
    if (a.optional && !all) continue;
    const bytes = await download(a);
    verifySha256(bytes, a.sha256, a.id);
    if (a.saveAs) {
      const target = join(ROOT, a.saveAs);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      console.log(`ok  ${a.id} -> ${a.saveAs}`);
    } else if (a.extractTo) {
      const target = join(ROOT, a.extractTo);
      rmSync(target, { recursive: true, force: true });
      const n = extractZip(bytes, target, a.only ?? "", a.files);
      console.log(`ok  ${a.id} -> ${a.extractTo} (${n} files)`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}
