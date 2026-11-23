import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_LINUX, checkLock } from "../../scripts/ci/check-lockfile.ts";
import { ROOT } from "../helpers.ts";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("[OPS-01] CI workflow", () => {
  const ci = read(".github/workflows/ci.yml");
  it.each(["npm run typecheck", "npm run lint", "npm test", "npm run build", "ruff check", "pytest", "npm run parity", "setup-java"])(
    "[OPS-01] runs %s",
    (step) => expect(ci).toContain(step),
  );
});

describe("[OPS-02] lockfile is complete for Linux CI", () => {
  it("[OPS-02] committed package-lock.json passes the completeness check", () => {
    expect(checkLock(JSON.parse(read("package-lock.json")), REQUIRED_LINUX)).toEqual([]);
  });
  it("[OPS-02] the check catches a dropped peer and a dropped platform binary", () => {
    const lock = {
      packages: {
        "": {},
        "node_modules/@napi-rs/wasm-runtime": { peerDependencies: { "@emnapi/runtime": "^1" } },
        "node_modules/next": { optionalDependencies: { "@next/swc-linux-x64-gnu": "1" } },
      },
    };
    expect(checkLock(lock, [])).toEqual([
      "node_modules/@napi-rs/wasm-runtime: peer dependency @emnapi/runtime has no lock entry",
      "node_modules/next: optional dependency @next/swc-linux-x64-gnu has no lock entry",
    ]);
  });
});

describe("[OPS-03] README has the required sections", () => {
  const readme = read("README.md");
  it.each([
    "<!-- demo gif / live link goes here -->",
    "```mermaid",
    "## AI only where it is needed",
    "### Private mode",
    "## Eval",
    "## Sources",
    "bundesfinanzministerium.de",
    "KoSIT",
    "EN 16931",
    "## Limitations",
    "Not tax advice",
    "MIT © Syed Aayan Ahmed",
    "https://github.com/syedaayanahmed2001/e-rechnung-check/actions/workflows/ci.yml/badge.svg",
    "## How this was built: spec first",
    "docs/SPEC.md",
  ])("[OPS-03] contains %s", (needle) => expect(readme).toContain(needle));
});

describe("[OPS-04] third-party notices", () => {
  const notices = read("THIRD_PARTY_NOTICES.md");
  it("[OPS-04] reproduces the SaxonJS licence and states it is not open source", () => {
    expect(notices).toContain("The copyright in the Software belongs to Saxonica Ltd");
    expect(notices).toMatch(/not open source/);
  });
  it.each(["EUPL-1.2", "Apache-2.0", "OASIS", "UN/CEFACT", "libxml2", "pdf.js"])("[OPS-04] lists %s", (x) =>
    expect(notices).toContain(x),
  );
  it("[OPS-04] MIT licence names the author", () => expect(read("LICENSE")).toContain("Syed Aayan Ahmed"));
});

describe("[OPS-05] public spec and private planning", () => {
  it("[OPS-05] docs/SPEC.md exists with requirement IDs and the spike result", () => {
    const spec = read("docs/SPEC.md");
    for (const id of ["CHECK-01", "EXPL-01", "CONV-01", "EVAL-01", "UI-01", "OPS-01"]) expect(spec).toContain(id);
    expect(spec).toMatch(/Feasibility spike/i);
  });
  it("[OPS-05] .planning/ and fetched third-party artefacts are git-ignored", () => {
    const gi = read(".gitignore");
    for (const p of ["/.planning/", "/.cache/", "/vendor/", "/corpus/kosit-testsuite/", "/public/rules/", "/public/vendor/", ".env*"]) {
      expect(gi).toContain(p);
    }
    expect(existsSync(join(ROOT, ".gitignore"))).toBe(true);
  });
});
