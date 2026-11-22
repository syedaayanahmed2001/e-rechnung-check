import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_LABEL, explain } from "../../src/lib/explain/explain.ts";
import { RULES } from "../../src/lib/explain/rules.ts";
import { TERMS } from "../../src/lib/explain/terms.ts";
import { buildCatalogue } from "../../scripts/rules/rule-catalogue.ts";
import { FIXTURES, ROOT } from "../helpers.ts";

const LANGS = ["de", "en"] as const;
const FIELDS = ["meaning", "cause", "fix"] as const;

describe("[EXPL-01] explanation table is complete in both languages", () => {
  it.each(Object.keys(RULES))("[EXPL-01] %s has meaning, cause and fix in de and en", (id) => {
    const e = RULES[id];
    for (const lang of LANGS) for (const f of FIELDS) expect(e[lang][f].trim().length, `${id}.${lang}.${f}`).toBeGreaterThan(10);
    for (const t of e.terms) expect(TERMS[t], `${id} references unknown term ${t}`).toBeDefined();
    expect(e.de.meaning).not.toBe(e.en.meaning);
  });

  it("[EXPL-01] every term has a name in de and en and both syntax locations", () => {
    for (const [id, t] of Object.entries(TERMS)) {
      expect(t.de && t.en && t.ubl && t.cii, id).toBeTruthy();
    }
  });
});

describe("[EXPL-02] every rule that fires in the parity corpus is explained", () => {
  const firing = JSON.parse(readFileSync(join(FIXTURES, "firing-rules.json"), "utf8")) as { code: string }[];
  it("[EXPL-02] fixture lists the firing rules", () => expect(firing.length).toBeGreaterThanOrEqual(40));
  it.each(firing.map((f) => f.code))("[EXPL-02] %s", (code) => {
    expect(RULES[code], `no explanation for firing rule ${code}`).toBeDefined();
  });
});

describe("[EXPL-03] fallback to the official message", () => {
  it("[EXPL-03] unknown rule shows the official text with the label", () => {
    for (const lang of LANGS) {
      const r = explain({ code: "UBL-CR-001", text: "[UBL-CR-001]-A UBL invoice should not include extensions" }, lang);
      expect(r).toEqual({
        kind: "official-only",
        code: "UBL-CR-001",
        label: FALLBACK_LABEL[lang],
        officialText: "[UBL-CR-001]-A UBL invoice should not include extensions",
      });
    }
  });
  it("[EXPL-03] known rule returns explanation and keeps the official text", () => {
    const r = explain({ code: "BR-CO-15", text: "official" }, "de");
    expect(r.kind).toBe("explained");
    if (r.kind === "explained") {
      expect(r.officialText).toBe("official");
      expect(r.terms.map((t) => t.id)).toEqual(["BT-112", "BT-109", "BT-110"]);
      expect(r.terms[0].cii).toMatch(/GrandTotalAmount/);
    }
  });
  it("[EXPL-03] XSD and parser findings get the step explanation", () => {
    expect(explain({ code: "generic-error", text: "x" }, "en", "xsd").kind).toBe("explained");
  });
});

describe("[EXPL-04] no invented rules: every ID exists in the official rule files", () => {
  const catalogue = existsSync(join(ROOT, "vendor", "kosit")) ? buildCatalogue() : null;
  it.runIf(catalogue)("[EXPL-04] catalogue has the official rule IDs", () => {
    expect(Object.keys(catalogue!).length).toBeGreaterThan(1000);
  });
  it.each(Object.keys(RULES))("[EXPL-04] %s exists in the pinned XSLT", (id) => {
    expect(catalogue, "run npm run rules first").not.toBeNull();
    expect(catalogue![id], `${id} is not an official rule`).toBeDefined();
  });
});

describe("[EXPL-05] Explain makes no model or network calls", () => {
  const dir = join(ROOT, "src", "lib", "explain");
  it.each(readdirSync(dir))("[EXPL-05] %s has no fetch, model client or network import", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from\s+["'](?:groq|ollama|openai|node:http|node:https|axios)/);
    expect(src).not.toMatch(/import\(.*(?:groq|ollama|openai)/);
  });
});
