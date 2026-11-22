import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createNodeValidator } from "../src/lib/check/node.ts";
import type { KositJsValidator } from "../src/lib/check/kosit-js.ts";

export const ROOT = join(import.meta.dirname, "..");
export const SUITE = join(ROOT, "corpus", "kosit-testsuite", "instances");
export const MUTATIONS = join(ROOT, "corpus", "mutations");
export const FIXTURES = join(ROOT, "tests", "fixtures");

let validator: Promise<KositJsValidator> | undefined;

/** One shared validator per test process (rule files load once). Requires `npm run rules`. */
export function getValidator(): Promise<KositJsValidator> {
  if (!existsSync(join(ROOT, "public", "rules", "scenarios.xml"))) {
    throw new Error("public/rules missing: run `npm run rules` before the tests");
  }
  validator ??= createNodeValidator(ROOT);
  return validator;
}

export function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
