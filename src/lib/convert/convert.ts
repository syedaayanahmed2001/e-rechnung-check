/**
 * Glue for Convert: picking the model input (CONV-02), and generate-then-check (CONV-08).
 */
import type { ValidationReport, Validator } from "../check/types.ts";
import { toXRechnungCii } from "./cii.ts";
import type { ApprovedInvoice } from "./invoice.ts";
import type { ModelInput } from "./providers.ts";

/** Fewer visible characters than this means "no usable text layer" (a scan). */
export const MIN_TEXT_CHARS = 40;

/**
 * A PDF with a text layer goes to the text model. A scan or a photo goes to the vision model
 * (the first page rendered to an image by the caller).
 */
export function pickInput(source: { pdfText: string | null; image?: { mimeType: string; base64: string } }): ModelInput | null {
  const visible = (source.pdfText ?? "").replace(/\s+/g, "");
  if (visible.length >= MIN_TEXT_CHARS) return { kind: "text", text: source.pdfText! };
  if (source.image) return { kind: "image", mimeType: source.image.mimeType, base64: source.image.base64 };
  return null;
}

export async function convertAndCheck(
  invoice: ApprovedInvoice,
  validator: Validator,
): Promise<{ xml: string; report: ValidationReport }> {
  const xml = toXRechnungCii(invoice);
  const report = await validator.validate(new TextEncoder().encode(xml));
  return { xml, report };
}
