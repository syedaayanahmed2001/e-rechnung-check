/**
 * Node.js wiring for the JS validator: rule files from disk, SaxonJS from npm "saxon-js".
 * Used by tests, the parity job and scripts. Never imported by browser code.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { KositJsValidator } from "./kosit-js.ts";
import { parseKositConfig } from "./kosit-config.ts";
import type { SaxonApi } from "./saxon-types.ts";

const require = createRequire(import.meta.url);

export async function createNodeValidator(root = process.cwd()): Promise<KositJsValidator> {
  const rulesDir = join(root, "public", "rules");
  const saxon = require("saxon-js") as SaxonApi;
  const libxml = await import("libxml2-wasm");
  const config = parseKositConfig(await readFile(join(rulesDir, "scenarios.xml"), "utf8"));
  const sefCache = new Map<string, Promise<unknown>>();
  return new KositJsValidator({
    saxon,
    libxml,
    config,
    loader: {
      sef(location) {
        let p = sefCache.get(location);
        if (!p) {
          p = readFile(join(rulesDir, `${location}.sef.json`), "utf8").then((t) => JSON.parse(t));
          sefCache.set(location, p);
        }
        return p;
      },
      async bytes(location) {
        return new Uint8Array(await readFile(join(rulesDir, location)));
      },
    },
  });
}
