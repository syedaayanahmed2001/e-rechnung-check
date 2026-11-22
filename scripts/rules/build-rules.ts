/**
 * Prepares the official KoSIT rule files for the JavaScript validator.
 *
 *  - compiles every Schematron XSLT referenced by scenarios.xml to SEF with the SaxonJS
 *    compiler (xslt3 -export). The official files are never edited; where a known SaxonJS
 *    limitation needs it, a wrapper imports the official file and overrides one function
 *    (see shims.ts)
 *  - copies scenarios.xml and all XML Schema files
 *
 * Output: public/rules/ (generated, git-ignored), served to the browser as static files and
 * read from disk by the Node validator. Re-compiles only what changed.
 *
 *   node scripts/rules/build-rules.ts
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseKositConfig, schematronLocations } from "../../src/lib/check/kosit-config.ts";
import { wrapperFor } from "./shims.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_DIR = join(ROOT, "vendor", "kosit", "validator-configuration");
const OUT = join(ROOT, "public", "rules");
const XSLT3 = join(ROOT, "node_modules", "xslt3", "xslt3.js");

type Compiled = { sha256: string; sef: string; compileMs: number; shimmed: boolean };

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function main(): void {
  if (!existsSync(join(CONFIG_DIR, "scenarios.xml"))) {
    throw new Error("vendor/kosit/validator-configuration missing: run `node scripts/rules/fetch-artefacts.ts` first");
  }
  mkdirSync(OUT, { recursive: true });
  const scenariosXml = readFileSync(join(CONFIG_DIR, "scenarios.xml"), "utf8");
  const config = parseKositConfig(scenariosXml);
  writeFileSync(join(OUT, "scenarios.xml"), scenariosXml);

  // XML Schemas, byte for byte.
  const xsdFiles = listFiles(join(CONFIG_DIR, "resources")).filter((p) => p.endsWith(".xsd"));
  for (const p of xsdFiles) {
    const target = join(OUT, relative(CONFIG_DIR, p));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(p, target);
  }

  const manifestPath = join(OUT, "manifest.json");
  const previous: { stylesheets?: Record<string, Compiled> } = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const stylesheets: Record<string, Compiled> = {};
  const shimSource = readFileSync(join(ROOT, "scripts", "rules", "shims.ts"));

  for (const location of schematronLocations(config)) {
    const source = join(CONFIG_DIR, location);
    const target = join(OUT, `${location}.sef.json`);
    // The cache key covers the official file and the shim code.
    const hash = createHash("sha256").update(readFileSync(source)).update(shimSource).digest("hex");
    const prev = previous.stylesheets?.[location];
    if (prev?.sha256 === hash && existsSync(target)) {
      stylesheets[location] = prev;
      console.log(`unchanged  ${location}`);
      continue;
    }
    // Compile the official file, or a wrapper that imports it unchanged (see shims.ts).
    const wrapper = wrapperFor(location, readFileSync(source, "utf8"), pathToFileURL(source).href);
    let compileFrom = source;
    if (wrapper) {
      compileFrom = join(ROOT, ".cache", "rules-wrappers", `${location}.wrapper.xsl`);
      mkdirSync(dirname(compileFrom), { recursive: true });
      writeFileSync(compileFrom, wrapper);
    }
    mkdirSync(dirname(target), { recursive: true });
    const t0 = Date.now();
    execFileSync(process.execPath, [XSLT3, `-xsl:${compileFrom}`, `-export:${target}`, "-nogo", "-relocate:on"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    stylesheets[location] = { sha256: hash, sef: `${location}.sef.json`, compileMs: Date.now() - t0, shimmed: !!wrapper };
    console.log(`compiled   ${location}${wrapper ? " (with shim)" : ""} (${Date.now() - t0} ms)`);
  }

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        configuration: `${config.name} (${config.date})`,
        compiler: "SaxonJS 2.7 (xslt3 -export -relocate:on)",
        stylesheets,
        schemas: xsdFiles.map((p) => relative(CONFIG_DIR, p).replaceAll("\\", "/")),
      },
      null,
      2,
    ) + "\n",
  );
}

main();
