import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKositConfig } from "../../src/lib/check/kosit-config.ts";
import { ROOT, SUITE, bytes, getValidator } from "../helpers.ts";

describe("[CHECK-01] scenario selection from the official scenarios.xml", () => {
  it("[CHECK-01] parses every scenario with its XSD, Schematron steps and custom levels", () => {
    const config = parseKositConfig(readFileSync(join(ROOT, "public", "rules", "scenarios.xml"), "utf8"));
    expect(config.name).toBe("Validator Configuration XRechnung 3.0.2");
    expect(config.scenarios.length).toBe(11);
    const ubl = config.scenarios.find((s) => s.name === "EN16931 XRechnung (UBL Invoice)")!;
    expect(ubl.xmlSchema.location).toBe("resources/ubl/2.1/xsd/maindoc/UBL-Invoice-2.1.xsd");
    expect(ubl.schematron.map((r) => r.location)).toEqual([
      "resources/ubl/2.1/xsl/EN16931-UBL-validation.xsl",
      "resources/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl",
    ]);
    expect(ubl.customLevels["BR-CL-23"]).toBe("warning");
  });

  it.each([
    ["standard/01.01a-INVOICE_ubl.xml", "EN16931 XRechnung (UBL Invoice)"],
    ["standard/01.01a-INVOICE_uncefact.xml", "EN16931 XRechnung (CII)"],
    ["extension/04.01a-INVOICE_ubl.xml", "EN16931 XRechnung Extension (UBL Invoice)"],
    ["extension/04.05a-INVOICE_uncefact.xml", "EN16931 XRechnung Extension (CII)"],
    ["technical-cases/cvd/02.01a-cvd_INVOICE_ubl.xml", "EN16931 XRechnung CVD (UBL Invoice)"],
  ])("[CHECK-01] %s selects %s and is accepted", async (file, scenario) => {
    const report = await (await getValidator()).validate(bytes(join(SUITE, file)));
    expect(report.scenario).toBe(scenario);
    expect(report.accepted).toBe(true);
    expect(report.steps.map((s) => s.kind)).toEqual(["xsd", "schematron", "schematron", "xml"]);
  });

  it("[CHECK-01] a UBL CreditNote selects the CreditNote scenario", async () => {
    const xml = readFileSync(join(SUITE, "standard/01.01a-INVOICE_ubl.xml"), "utf8");
    // Minimal CreditNote derived from the test suite invoice root: only the scenario match is asserted.
    const credit = xml
      .replace(/urn:oasis:names:specification:ubl:schema:xsd:Invoice-2/, "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2")
      .replace(/<(\/?)ubl:Invoice\b/g, "<$1ubl:CreditNote")
      .replace(/<(\/?)Invoice\b/g, "<$1CreditNote");
    const report = await (await getValidator()).validate(new TextEncoder().encode(credit));
    expect(report.scenario).toBe("EN16931 XRechnung (UBL CreditNote)");
  });
});
