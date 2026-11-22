/**
 * Unit-level parity: committed reports of the official Java validator (tests/fixtures/java-reports)
 * compared with the JS validator on the same inputs. The full corpus is compared by the CI parity
 * job (scripts/parity/run-parity.ts), which runs Java live.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKositReport } from "../../src/lib/check/kosit-report.ts";
import { compareReports } from "../../src/lib/check/parity.ts";
import { FIXTURES, MUTATIONS, SUITE, bytes, getValidator } from "../helpers.ts";

const REPORTS = join(FIXTURES, "java-reports");
const index = JSON.parse(readFileSync(join(REPORTS, "index.json"), "utf8")) as Record<string, string>;

function inputPath(rel: string): string {
  return rel.startsWith("mutations/") ? join(MUTATIONS, rel.slice("mutations/".length)) : join(SUITE, rel);
}

describe("[CHECK-02] JS report equals the official Java report", () => {
  it("fixture index covers every committed report", () => {
    const files = readdirSync(REPORTS).filter((f) => f.endsWith("-report.xml"));
    expect(Object.keys(index).sort()).toEqual(files.sort());
  });

  it.each(Object.entries(index))("[CHECK-02] %s", async (report, input) => {
    const java = parseKositReport(readFileSync(join(REPORTS, report), "utf8"));
    const js = await (await getValidator()).validate(bytes(inputPath(input)));
    expect(compareReports(java, js)).toEqual([]);
  });

  it("[CHECK-02] the comparison detects a changed message (no vacuous pass)", async () => {
    const [report, input] = Object.entries(index).find(([r]) => r.includes("wrong-payable-amount"))!;
    const java = parseKositReport(readFileSync(join(REPORTS, report), "utf8"));
    const js = await (await getValidator()).validate(bytes(inputPath(input)));
    const sch = js.steps.find((s) => s.kind === "schematron" && s.messages.length > 0)!;
    sch.messages[0] = { ...sch.messages[0], code: "BR-FAKE" };
    expect(compareReports(java, js).length).toBeGreaterThan(0);
  });
});
