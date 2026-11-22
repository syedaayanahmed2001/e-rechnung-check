import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeRejection, sniffSpecificationId } from "../../src/lib/check/check-file.ts";
import { MUTATIONS, SUITE, bytes, getValidator } from "../helpers.ts";

describe("[CHECK-06] specific rejection reasons", () => {
  it("[CHECK-06] broken XML names the line", async () => {
    const r = await (await getValidator()).validate(bytes(join(MUTATIONS, "01.01a-INVOICE_ubl__truncated.xml")));
    const why = describeRejection(r);
    expect(why.reason).toBe("not-wellformed");
    if (why.reason === "not-wellformed") expect(why.line).toBeGreaterThan(0);
  });

  it("[CHECK-06] an unknown specification identifier is named", async () => {
    const input = bytes(join(MUTATIONS, "01.01a-INVOICE_ubl__unknown-specification.xml"));
    const r = await (await getValidator()).validate(input);
    expect(describeRejection(r, sniffSpecificationId(input))).toEqual({
      reason: "no-scenario",
      specificationId: "urn:example:not-a-known-specification",
    });
  });

  it("[CHECK-06] schema and rule failures are told apart", async () => {
    const v = await getValidator();
    expect(describeRejection(await v.validate(bytes(join(MUTATIONS, "01.01a-INVOICE_ubl__unknown-element.xml")))).reason).toBe("xsd");
    const rules = describeRejection(await v.validate(bytes(join(MUTATIONS, "01.01a-INVOICE_ubl__wrong-payable-amount.xml"))));
    expect(rules.reason).toBe("rules");
    if (rules.reason === "rules") expect(rules.errors).toBeGreaterThan(0);
  });

  it("[CHECK-06] a valid invoice is not a rejection", async () => {
    const r = await (await getValidator()).validate(bytes(join(SUITE, "standard/01.01a-INVOICE_ubl.xml")));
    expect(describeRejection(r)).toEqual({ reason: "accepted" });
  });

  it("[CHECK-06] sniffs BT-24 from CII too", () => {
    expect(sniffSpecificationId(bytes(join(SUITE, "standard/01.01a-INVOICE_uncefact.xml")))).toBe(
      "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    );
  });
});
