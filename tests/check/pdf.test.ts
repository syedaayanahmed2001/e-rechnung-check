import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AFRelationship, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { checkFile } from "../../src/lib/check/check-file.ts";
import { extractEmbeddedInvoice } from "../../src/lib/check/pdf.ts";
import { ROOT, SUITE, getValidator } from "../helpers.ts";

async function pdfWith(attachments: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Rechnung 1234567", { x: 50, y: 700 });
  for (const a of attachments) {
    await doc.attach(a.data, a.name, { mimeType: "text/xml", afRelationship: AFRelationship.Alternative });
  }
  return doc.save();
}

describe("[CHECK-04] ZUGFeRD / Factur-X: embedded XML is extracted and checked", () => {
  const xml = new Uint8Array(readFileSync(join(SUITE, "standard/01.01a-INVOICE_uncefact.xml")));

  it("[CHECK-04] extracts factur-x.xml byte for byte", async () => {
    const pdf = await pdfWith([
      { name: "notes.txt", data: new TextEncoder().encode("hello") },
      { name: "factur-x.xml", data: xml },
    ]);
    const found = await extractEmbeddedInvoice(pdf);
    expect(found?.fileName).toBe("factur-x.xml");
    expect(Buffer.from(found!.xml).equals(Buffer.from(xml))).toBe(true);
  });

  it("[CHECK-04] accepts the other official file names (xrechnung.xml, zugferd-invoice.xml)", async () => {
    for (const name of ["xrechnung.xml", "zugferd-invoice.xml", "ZUGFeRD-invoice.xml"]) {
      const found = await extractEmbeddedInvoice(await pdfWith([{ name, data: xml }]));
      expect(found?.fileName).toBe(name);
    }
  });

  it("[CHECK-04] a PDF without invoice XML is 'not an e-invoice'", async () => {
    const outcome = await checkFile(await pdfWith([]), await getValidator());
    expect(outcome).toEqual({ kind: "not-an-e-invoice", reason: "pdf-without-xml" });
  });

  it("[CHECK-04] the embedded XML is validated like a plain XML file", async () => {
    const outcome = await checkFile(await pdfWith([{ name: "factur-x.xml", data: xml }]), await getValidator());
    expect(outcome.kind).toBe("report");
    if (outcome.kind === "report") {
      expect(outcome.source).toBe("pdf-embedded");
      expect(outcome.report.scenario).toBe("EN16931 XRechnung (CII)");
      expect(outcome.report.accepted).toBe(true);
    }
  });

  const fx = join(ROOT, ".cache", "external", "zugferd-corpus", "XML-Rechnung", "FX");
  it.runIf(existsSync(fx))("[CHECK-04] finds embedded XML in every external Factur-X sample", async () => {
    const pdfs = readdirSync(fx).filter((f) => f.toLowerCase().endsWith(".pdf"));
    for (const f of pdfs) {
      const found = await extractEmbeddedInvoice(new Uint8Array(readFileSync(join(fx, f))));
      expect(found, f).not.toBeNull();
    }
  });
});
