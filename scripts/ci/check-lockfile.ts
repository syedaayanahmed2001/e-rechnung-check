/**
 * Guards against a lockfile that works on Windows but breaks `npm ci` on Linux CI (OPS-02).
 * npm on Windows has been seen to drop entries for packages that only Linux needs, such as the
 * platform binaries and the @emnapi/* peers of WebAssembly fallbacks. Checks:
 *   1. every optionalDependency of every locked package has a lock entry
 *   2. every non-optional peerDependency of a locked package has a lock entry
 *   3. the Linux x64 binaries of the native build tools are present
 *
 *   node scripts/ci/check-lockfile.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type Entry = {
  version?: string;
  optional?: boolean;
  dev?: boolean;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export function checkLock(lock: { packages: Record<string, Entry> }, requiredLinux: string[]): string[] {
  const pkgs = lock.packages;
  const has = (from: string, name: string): boolean => {
    // Node resolution: walk up the nested node_modules chain.
    let base = from;
    for (;;) {
      if (pkgs[`${base ? `${base}/` : ""}node_modules/${name}`]) return true;
      const i = base.lastIndexOf("node_modules/");
      if (i < 0) return !!pkgs[`node_modules/${name}`];
      base = base.slice(0, i).replace(/\/$/, "");
    }
  };
  const problems: string[] = [];
  for (const [path, e] of Object.entries(pkgs)) {
    if (path === "") continue;
    for (const dep of Object.keys(e.optionalDependencies ?? {})) {
      if (!has(path, dep)) problems.push(`${path}: optional dependency ${dep} has no lock entry`);
    }
    for (const dep of Object.keys(e.peerDependencies ?? {})) {
      if (e.peerDependenciesMeta?.[dep]?.optional) continue;
      if (!has(path, dep)) problems.push(`${path}: peer dependency ${dep} has no lock entry`);
    }
  }
  for (const name of requiredLinux) {
    if (!pkgs[`node_modules/${name}`]) problems.push(`missing Linux binary entry: ${name}`);
  }
  return problems;
}

export const REQUIRED_LINUX = [
  "@next/swc-linux-x64-gnu",
  "@tailwindcss/oxide-linux-x64-gnu",
  "lightningcss-linux-x64-gnu",
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const problems = checkLock(lock, REQUIRED_LINUX);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`package-lock.json ok (${Object.keys(lock.packages).length} entries)`);
}
