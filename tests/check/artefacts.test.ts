import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractZip, sha256Hex, verifySha256, type Artefact } from "../../scripts/rules/fetch-artefacts.ts";
import { SHIMS, wrapperFor } from "../../scripts/rules/shims.ts";
import { ROOT } from "../helpers.ts";

describe("[CHECK-08] pinned, hash-verified official artefacts", () => {
  const { artefacts } = JSON.parse(readFileSync(join(ROOT, "scripts", "rules", "artefacts.json"), "utf8")) as {
    artefacts: Artefact[];
  };

  it("[CHECK-08] every artefact has an https URL, a SHA-256 and a licence", () => {
    for (const a of artefacts) {
      expect(a.url).toMatch(/^https:\/\//);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.licence.length).toBeGreaterThan(5);
    }
  });

  it("[CHECK-08] a tampered download is refused", () => {
    const data = new TextEncoder().encode("official bytes");
    expect(() => verifySha256(data, sha256Hex(data), "x")).not.toThrow();
    const tampered = new TextEncoder().encode("official bytez");
    expect(() => verifySha256(tampered, sha256Hex(data), "x")).toThrow(/mismatch/);
    expect(() => verifySha256(data, "", "x")).toThrow(/no valid pinned/);
  });

  it("[CHECK-08] archive extraction refuses path traversal", () => {
    const zip = zipSync({ "../evil.txt": new TextEncoder().encode("x") });
    expect(() => extractZip(zip, join(ROOT, ".cache", "zip-test"))).toThrow(/unsafe path/);
  });

  it("[CHECK-08] the IBAN shim imports the official file unchanged and refuses drift", () => {
    const official = readFileSync(
      join(ROOT, "vendor", "kosit", "validator-configuration", "resources", "xrechnung", "3.0.2", "xsl", "XRechnung-UBL-validation.xsl"),
      "utf8",
    );
    const wrapper = wrapperFor("resources/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl", official, "file:///x.xsl")!;
    expect(wrapper).toContain('<xsl:import href="file:///x.xsl"/>');
    expect(wrapper).toContain("xs:decimal(string-join(");
    expect(() =>
      wrapperFor("resources/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl", official.replace(SHIMS[0].original, ""), "f"),
    ).toThrow(/review the shim/);
    expect(wrapperFor("resources/ubl/2.1/xsl/EN16931-UBL-validation.xsl", "", "f")).toBeNull();
  });
});
