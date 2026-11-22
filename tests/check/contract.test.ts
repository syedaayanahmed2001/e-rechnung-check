/**
 * One contract for every Validator implementation (CHECK-05). The Java-report implementation
 * replays recorded KoSIT VARL reports, which is how a Java-backed validator (option A) would plug in.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKositReport } from "../../src/lib/check/kosit-report.ts";
import type { ValidationReport, Validator } from "../../src/lib/check/types.ts";
import { FIXTURES, MUTATIONS, SUITE, bytes, getValidator, sha256Hex } from "../helpers.ts";

const REPORTS = join(FIXTURES, "java-reports");
const index = JSON.parse(readFileSync(join(REPORTS, "index.json"), "utf8")) as Record<string, string>;
const inputPath = (rel: string) =>
  rel.startsWith("mutations/") ? join(MUTATIONS, rel.slice("mutations/".length)) : join(SUITE, rel);

/** A Validator backed by recorded official reports, keyed by input hash. */
class RecordedJavaValidator implements Validator {
  readonly engine = "KoSIT Validator 1.6.3 (recorded)";
  private readonly byHash = new Map<string, ValidationReport>();
  constructor() {
    for (const [report, input] of Object.entries(index)) {
      this.byHash.set(sha256Hex(bytes(inputPath(input))), parseKositReport(readFileSync(join(REPORTS, report), "utf8")));
    }
  }
  async validate(input: Uint8Array): Promise<ValidationReport> {
    const r = this.byHash.get(sha256Hex(input));
    if (!r) throw new Error("no recorded report for this input");
    return r;
  }
}

const CASES = {
  valid: "standard/01.01a-INVOICE_ubl.xml",
  rulesError: "mutations/01.01a-INVOICE_ubl__wrong-payable-amount.xml",
  xsdError: "mutations/01.01a-INVOICE_ubl__unknown-element.xml",
  broken: "mutations/01.01a-INVOICE_ubl__truncated.xml",
  noScenario: "mutations/01.01a-INVOICE_ubl__unknown-specification.xml",
};

function contract(name: string, make: () => Promise<Validator>) {
  describe(`[CHECK-05] Validator contract: ${name}`, () => {
    it("[CHECK-05] accepts a valid XRechnung", async () => {
      const r = await (await make()).validate(bytes(inputPath(CASES.valid)));
      expect(r.accepted).toBe(true);
      expect(r.scenario).toBe("EN16931 XRechnung (UBL Invoice)");
      expect(r.steps.at(-1)?.id).toBe("val-xml");
    });
    it("[CHECK-05] rejects a rule error and reports BR-CO-16 with its XPath", async () => {
      const r = await (await make()).validate(bytes(inputPath(CASES.rulesError)));
      expect(r.accepted).toBe(false);
      const m = r.steps.flatMap((s) => s.messages).find((x) => x.code === "BR-CO-16");
      expect(m?.customLevel).toBe("error");
      expect(m?.xpathLocation).toMatch(/LegalMonetaryTotal/);
    });
    it("[CHECK-05] stops after a schema error (no Schematron step)", async () => {
      const r = await (await make()).validate(bytes(inputPath(CASES.xsdError)));
      expect(r.accepted).toBe(false);
      expect(r.steps.map((s) => s.id)).toEqual(["val-xsd", "val-xml"]);
      expect(r.steps[0].valid).toBe(false);
    });
    it("[CHECK-05] rejects broken XML without a scenario", async () => {
      const r = await (await make()).validate(bytes(inputPath(CASES.broken)));
      expect(r.accepted).toBe(false);
      expect(r.scenario).toBeNull();
      expect(r.steps.find((s) => s.id === "val-xml")?.valid).toBe(false);
    });
    it("[CHECK-05] rejects an unknown specification identifier without a scenario", async () => {
      const r = await (await make()).validate(bytes(inputPath(CASES.noScenario)));
      expect(r.accepted).toBe(false);
      expect(r.scenario).toBeNull();
    });
  });
}

contract("JS (SaxonJS + libxml2-wasm)", getValidator);
contract("recorded official Java reports", async () => new RecordedJavaValidator());
