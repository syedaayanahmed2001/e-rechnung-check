/**
 * Lists every rule ID in the official Schematron XSLT of the pinned configuration, with its
 * official message text(s), flag and source file. Used to prove that every hand-written
 * explanation refers to a real rule (EXPL-04), and as a writing aid.
 *
 *   node scripts/rules/rule-catalogue.ts [--print ID ...]
 * Output: public/rules/rule-catalogue.json (generated)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKositConfig, schematronLocations } from "../../src/lib/check/kosit-config.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_DIR = join(ROOT, "vendor", "kosit", "validator-configuration");

export type CatalogueEntry = { id: string; flags: string[]; texts: string[]; sources: string[] };

export function buildCatalogue(): Record<string, CatalogueEntry> {
  const config = parseKositConfig(readFileSync(join(CONFIG_DIR, "scenarios.xml"), "utf8"));
  const out: Record<string, CatalogueEntry> = {};
  for (const location of schematronLocations(config)) {
    const xsl = readFileSync(join(CONFIG_DIR, location), "utf8");
    const re = /<svrl:failed-assert\b([^>]*)>[\s\S]*?<svrl:text>([\s\S]*?)<\/svrl:text>/g;
    for (const m of xsl.matchAll(re)) {
      const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
      if (!id) continue;
      const flag = /\bflag="([^"]+)"/.exec(m[1])?.[1] ?? "";
      const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const e = (out[id] ??= { id, flags: [], texts: [], sources: [] });
      if (flag && !e.flags.includes(flag)) e.flags.push(flag);
      if (!e.texts.includes(text)) e.texts.push(text);
      if (!e.sources.includes(location)) e.sources.push(location);
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cat = buildCatalogue();
  writeFileSync(join(ROOT, "public", "rules", "rule-catalogue.json"), JSON.stringify(cat, null, 1) + "\n");
  const i = process.argv.indexOf("--print");
  if (i > 0) {
    for (const id of process.argv.slice(i + 1)) {
      const e = cat[id];
      console.log(`${id} [${e?.flags.join(",")}] ${e ? e.texts.join(" || ") : "NOT FOUND"}`);
    }
  } else {
    console.log(`${Object.keys(cat).length} rule ids`);
  }
}
