import { describe, expect, it } from "vitest";
import { STRINGS, fieldLabel } from "../../src/lib/i18n/strings.ts";
import { headerSpecs, lineSpecs } from "../../src/lib/convert/review.ts";

function keys(o: unknown, prefix = ""): string[] {
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe("[UI-03] every UI string exists in German and English", () => {
  it("[UI-03] same keys in both languages", () => {
    expect(keys(STRINGS.en).sort()).toEqual(keys(STRINGS.de).sort());
  });
  it("[UI-03] no empty strings, and the languages differ where they should", () => {
    for (const lang of ["de", "en"] as const) for (const k of keys(STRINGS[lang])) expect(k.length).toBeGreaterThan(0);
    expect(STRINGS.de.verdictAccepted).not.toBe(STRINGS.en.verdictAccepted);
  });
  it("[UI-03] every review field has a label in both languages", () => {
    for (const spec of [...headerSpecs(), ...lineSpecs(0)]) {
      for (const lang of ["de", "en"] as const) expect(fieldLabel(STRINGS[lang], spec.path), spec.path).not.toBe(spec.path);
    }
  });
});
