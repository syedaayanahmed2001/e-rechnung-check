/**
 * Source of truth for what Convert extracts from a free-form invoice.
 *
 * Every leaf is { value, source }: the value as read, and the exact snippet of the document it
 * was read from, so the reviewer can check it. Every property is required and nullable, which keeps
 * the schema valid for strict structured output (Groq strict json_schema, Ollama `format`).
 *
 * The JSON Schema in schema/invoice-extraction.schema.json is generated from this file
 * (scripts/schema/export-schema.ts), and the Python eval validates its Pydantic model against it.
 */
import { z } from "zod";

const source = z.string().nullable().describe("Exact text copied from the document that this value was read from, or null.");

const text = (description: string) =>
  z.strictObject({ value: z.string().nullable().describe(description), source }).describe(description);
const amount = (description: string) =>
  z
    .strictObject({
      value: z.number().nullable().describe(`${description}. Decimal number, dot as separator, no currency sign.`),
      source,
    })
    .describe(description);
const date = (description: string) =>
  z
    .strictObject({
      value: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .describe(`${description}. ISO date YYYY-MM-DD.`),
      source,
    })
    .describe(description);

export const PartySchema = z.strictObject({
  name: text("Legal or trading name"),
  street: text("Street and house number"),
  postcode: text("Post code"),
  city: text("City"),
  country: text("Country as ISO 3166-1 alpha-2 code, e.g. DE"),
  vatId: text("VAT identification number (USt-IdNr.), e.g. DE123456789"),
  taxNumber: text("German tax number (Steuernummer), e.g. 12/345/67890"),
  email: text("E-mail address"),
  phone: text("Telephone number"),
  contactName: text("Name of the contact person"),
});

export const LineSchema = z.strictObject({
  description: text("Item name or description"),
  quantity: amount("Quantity"),
  unit: text("Unit as written, e.g. Stück, Std., kg"),
  unitPrice: amount("Net unit price"),
  netAmount: amount("Line net amount (quantity x unit price, after line discounts)"),
  vatRate: amount("VAT rate in percent, e.g. 19"),
});

export const InvoiceExtractionSchema = z.strictObject({
  invoiceNumber: text("Invoice number (Rechnungsnummer)"),
  issueDate: date("Invoice date (Rechnungsdatum)"),
  deliveryDate: date("Delivery or service date (Liefer-/Leistungsdatum)"),
  dueDate: date("Payment due date"),
  currency: text("Currency as ISO 4217 code, e.g. EUR"),
  buyerReference: text("Buyer reference / Leitweg-ID / order reference given by the buyer"),
  seller: PartySchema,
  buyer: PartySchema,
  iban: text("Seller IBAN for payment"),
  bic: text("Seller BIC"),
  paymentTerms: text("Payment terms as written"),
  lines: z.array(LineSchema).describe("Invoice lines in document order"),
  totals: z.strictObject({
    netTotal: amount("Total without VAT (Nettobetrag)"),
    vatTotal: amount("Total VAT amount (Umsatzsteuer)"),
    grossTotal: amount("Total with VAT (Bruttobetrag)"),
    amountDue: amount("Amount due for payment (Zahlbetrag)"),
  }),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
export type Party = z.infer<typeof PartySchema>;
export type Line = z.infer<typeof LineSchema>;
export type Leaf<T> = { value: T | null; source: string | null };

/** JSON Schema for model structured output (draft 2020-12). */
export function extractionJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(InvoiceExtractionSchema, { target: "draft-2020-12" }) as Record<string, unknown>;
}

/** Every leaf path in an extraction, e.g. "seller.name", "lines.0.netAmount", "totals.grossTotal". */
export function leafPaths(x: InvoiceExtraction): string[] {
  const out: string[] = [];
  const walk = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && "value" in o && "source" in o) {
      out.push(prefix);
      return;
    }
    if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${prefix}.${i}`));
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(x, "");
  return out;
}

export function getLeaf(x: InvoiceExtraction, path: string): Leaf<string | number> {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], x) as Leaf<string | number>;
}
