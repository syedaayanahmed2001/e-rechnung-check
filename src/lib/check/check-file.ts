/**
 * Entry point for "check this file": XML goes straight to the validator. A PDF has its
 * embedded invoice XML validated, and a PDF without one is reported as "not an e-invoice".
 */
import { extractEmbeddedInvoice, isPdf } from "./pdf.ts";
import { decodeXml } from "./kosit-js.ts";
import type { ValidationReport, Validator } from "./types.ts";

export type CheckOutcome =
  | { kind: "report"; source: "xml" | "pdf-embedded"; embeddedFileName?: string; report: ValidationReport }
  | { kind: "not-an-e-invoice"; reason: "pdf-without-xml" | "image" | "unknown-format" };

const IMAGE_MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "jpeg"],
  [[0x89, 0x50, 0x4e, 0x47], "png"],
  [[0x52, 0x49, 0x46, 0x46], "webp"],
];

export function isImage(bytes: Uint8Array): boolean {
  return IMAGE_MAGIC.some(([magic]) => magic.every((b, i) => bytes[i] === b));
}

export function looksLikeXml(bytes: Uint8Array): boolean {
  const head = decodeXml(bytes.subarray(0, 512)).trimStart();
  return head.startsWith("<");
}

export async function checkFile(bytes: Uint8Array, validator: Validator): Promise<CheckOutcome> {
  if (isPdf(bytes)) {
    const embedded = await extractEmbeddedInvoice(bytes);
    if (!embedded) return { kind: "not-an-e-invoice", reason: "pdf-without-xml" };
    return {
      kind: "report",
      source: "pdf-embedded",
      embeddedFileName: embedded.fileName,
      report: await validator.validate(embedded.xml),
    };
  }
  if (isImage(bytes)) return { kind: "not-an-e-invoice", reason: "image" };
  if (looksLikeXml(bytes)) return { kind: "report", source: "xml", report: await validator.validate(bytes) };
  return { kind: "not-an-e-invoice", reason: "unknown-format" };
}

export type Rejection =
  | { reason: "accepted" }
  | { reason: "not-wellformed"; line?: number; detail: string }
  | { reason: "no-scenario"; specificationId?: string }
  | { reason: "xsd"; count: number }
  | { reason: "rules"; errors: number };

/** Why a report was rejected, in terms a person can act on (CHECK-06). */
export function describeRejection(report: ValidationReport, specificationId?: string): Rejection {
  if (report.accepted) return { reason: "accepted" };
  const xml = report.steps.find((s) => s.kind === "xml");
  if (xml && !xml.valid) {
    const m = xml.messages[0];
    return { reason: "not-wellformed", line: m?.line, detail: m?.text ?? "" };
  }
  if (report.scenario === null) return { reason: "no-scenario", specificationId };
  const xsd = report.steps.find((s) => s.kind === "xsd");
  if (xsd && !xsd.valid) return { reason: "xsd", count: xsd.messages.length };
  return {
    reason: "rules",
    errors: report.steps.flatMap((s) => s.messages).filter((m) => m.customLevel === "error").length,
  };
}

/** Reads BT-24 (specification identifier) without a full parse, for the no-scenario message. */
export function sniffSpecificationId(bytes: Uint8Array): string | undefined {
  const text = decodeXml(bytes);
  const ubl = /<(?:\w+:)?CustomizationID[^>]*>([^<]+)</.exec(text)?.[1];
  if (ubl) return ubl.trim();
  const cii = /<(?:\w+:)?GuidelineSpecifiedDocumentContextParameter>\s*<(?:\w+:)?ID[^>]*>([^<]+)</.exec(text)?.[1];
  return cii?.trim();
}
