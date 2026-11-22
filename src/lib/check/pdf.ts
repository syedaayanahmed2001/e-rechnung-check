/**
 * Finds the invoice XML embedded in a ZUGFeRD / Factur-X / XRechnung-in-PDF file.
 *
 * Hybrid invoices are PDF/A-3 files with the XML as an embedded file, listed in the document's
 * EmbeddedFiles name tree and in the catalog's /AF (associated files) array. We read both
 * and pick the first file with a known invoice name. Pure JS (pdf-lib, MIT), so it runs in the
 * browser too.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";

/** File names used by ZUGFeRD 1/2, Factur-X and XRechnung-in-PDF, in priority order (case-insensitive). */
export const INVOICE_FILE_NAMES = ["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml", "zugferd_invoice.xml"];

export type EmbeddedInvoice = { fileName: string; xml: Uint8Array };

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" within the first 1 KiB (some generators prepend junk).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

function str(o: PDFObject | undefined): string | undefined {
  if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText();
  return undefined;
}

function fileSpecName(spec: PDFDict): string | undefined {
  return str(spec.lookup(PDFName.of("UF"))) ?? str(spec.lookup(PDFName.of("F")));
}

function fileSpecBytes(spec: PDFDict): Uint8Array | undefined {
  const ef = spec.lookup(PDFName.of("EF"));
  if (!(ef instanceof PDFDict)) return undefined;
  const stream = ef.lookup(PDFName.of("UF")) ?? ef.lookup(PDFName.of("F"));
  if (!(stream instanceof PDFRawStream)) return undefined;
  return decodePDFRawStream(stream).decode();
}

/** Collects file specifications from a name tree node (/Names pairs and /Kids). */
function walkNameTree(node: PDFDict, out: PDFDict[], depth = 0): void {
  if (depth > 32) return;
  const names = node.lookup(PDFName.of("Names"));
  if (names instanceof PDFArray) {
    for (let i = 1; i < names.size(); i += 2) {
      const spec = names.lookup(i);
      if (spec instanceof PDFDict) out.push(spec);
    }
  }
  const kids = node.lookup(PDFName.of("Kids"));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) walkNameTree(kid, out, depth + 1);
    }
  }
}

/** All embedded files of a PDF (name + bytes). */
export async function listEmbeddedFiles(pdf: Uint8Array): Promise<EmbeddedInvoice[]> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const catalog = doc.catalog;
  const specs: PDFDict[] = [];
  const namesDict = catalog.lookup(PDFName.of("Names"));
  if (namesDict instanceof PDFDict) {
    const ef = namesDict.lookup(PDFName.of("EmbeddedFiles"));
    if (ef instanceof PDFDict) walkNameTree(ef, specs);
  }
  const af = catalog.lookup(PDFName.of("AF"));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookup(i);
      if (spec instanceof PDFDict && !specs.includes(spec)) specs.push(spec);
    }
  }
  const files: EmbeddedInvoice[] = [];
  for (const spec of specs) {
    const fileName = fileSpecName(spec);
    const xml = fileSpecBytes(spec);
    if (fileName && xml && !files.some((f) => f.fileName === fileName)) files.push({ fileName, xml });
  }
  return files;
}

/** The embedded invoice XML, or null if the PDF carries none (then it is not an e-invoice). */
export async function extractEmbeddedInvoice(pdf: Uint8Array): Promise<EmbeddedInvoice | null> {
  const files = await listEmbeddedFiles(pdf);
  for (const wanted of INVOICE_FILE_NAMES) {
    const hit = files.find((f) => f.fileName.toLowerCase() === wanted);
    if (hit) return hit;
  }
  return null;
}
