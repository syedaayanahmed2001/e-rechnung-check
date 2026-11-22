/**
 * Human review (CONV-06): every extracted value becomes a review field that the person approves
 * or edits. XRechnung can only be generated once every required field is approved.
 */
import type { InvoiceExtraction } from "./schema.ts";
import { snippetStatus, type SnippetStatus } from "./snippets.ts";
import { unitCodeFor, type ApprovedInvoice, type ApprovedParty, type VatCategory } from "./invoice.ts";

export type FieldKind = "text" | "date" | "amount" | "country" | "currency" | "unit" | "category";

export type ReviewField = {
  path: string;
  kind: FieldKind;
  required: boolean;
  value: string;
  source: string | null;
  snippet: SnippetStatus;
  approved: boolean;
  /** True when the value was changed by the reviewer. */
  edited: boolean;
};

export type Review = { fields: ReviewField[]; lineCount: number };

type Spec = { path: string; kind: FieldKind; required: boolean };

const PARTY_FIELDS: [keyof ApprovedParty, FieldKind][] = [
  ["name", "text"],
  ["street", "text"],
  ["postcode", "text"],
  ["city", "text"],
  ["country", "country"],
  ["vatId", "text"],
  ["taxNumber", "text"],
  ["email", "text"],
  ["phone", "text"],
  ["contactName", "text"],
];

// Seller contact details, buyer e-mail and the Leitweg-ID/buyer reference are mandatory in XRechnung
// (BR-DE-2/5/6/7, PEPPOL-EN16931-R010/R020, BR-DE-15).
const SELLER_REQUIRED = new Set(["name", "street", "postcode", "city", "country", "email", "phone", "contactName"]);
const BUYER_REQUIRED = new Set(["name", "postcode", "city", "country", "email"]);

export function headerSpecs(): Spec[] {
  return [
    { path: "invoiceNumber", kind: "text", required: true },
    { path: "issueDate", kind: "date", required: true },
    { path: "deliveryDate", kind: "date", required: false },
    { path: "dueDate", kind: "date", required: false },
    { path: "currency", kind: "currency", required: true },
    { path: "buyerReference", kind: "text", required: true },
    ...PARTY_FIELDS.map(([k, kind]) => ({ path: `seller.${k}`, kind, required: SELLER_REQUIRED.has(k) })),
    ...PARTY_FIELDS.map(([k, kind]) => ({ path: `buyer.${k}`, kind, required: BUYER_REQUIRED.has(k) })),
    { path: "iban", kind: "text", required: true },
    { path: "bic", kind: "text", required: false },
    { path: "paymentTerms", kind: "text", required: false },
  ];
}

export function lineSpecs(i: number): Spec[] {
  return [
    { path: `lines.${i}.description`, kind: "text", required: true },
    { path: `lines.${i}.quantity`, kind: "amount", required: true },
    { path: `lines.${i}.unitCode`, kind: "unit", required: true },
    { path: `lines.${i}.unitPrice`, kind: "amount", required: true },
    { path: `lines.${i}.vatRate`, kind: "amount", required: true },
    { path: `lines.${i}.vatCategory`, kind: "category", required: true },
  ];
}

function leafOf(x: InvoiceExtraction, path: string): { value: string | number | null; source: string | null } | undefined {
  const parts = path.split(".");
  // Derived line fields come from other leaves.
  if (parts[0] === "lines" && parts[2] === "unitCode") {
    const l = x.lines[Number(parts[1])];
    return { value: unitCodeFor(l?.unit.value), source: l?.unit.source ?? null };
  }
  if (parts[0] === "lines" && parts[2] === "vatCategory") {
    const l = x.lines[Number(parts[1])];
    const rate = l?.vatRate.value;
    return { value: rate === null || rate === undefined ? null : rate > 0 ? "S" : "E", source: l?.vatRate.source ?? null };
  }
  let o: unknown = x;
  for (const p of parts) o = (o as Record<string, unknown> | undefined)?.[p];
  return o as { value: string | number | null; source: string | null } | undefined;
}

export function buildReview(x: InvoiceExtraction, documentText: string | null): Review {
  const specs = [...headerSpecs(), ...x.lines.flatMap((_, i) => lineSpecs(i))];
  const fields = specs.map((s): ReviewField => {
    const leaf = leafOf(x, s.path);
    const value = leaf?.value === null || leaf?.value === undefined ? "" : String(leaf.value);
    return {
      ...s,
      value,
      source: leaf?.source ?? null,
      snippet: s.path.endsWith("unitCode") || s.path.endsWith("vatCategory") ? "no-snippet" : snippetStatus(documentText, leaf?.value ?? null, leaf?.source ?? null),
      approved: false,
      edited: false,
    };
  });
  return { fields, lineCount: x.lines.length };
}

export function setField(r: Review, path: string, value: string): Review {
  return { ...r, fields: r.fields.map((f) => (f.path === path ? { ...f, value, edited: true, approved: true } : f)) };
}

export function approve(r: Review, path: string, approved = true): Review {
  return { ...r, fields: r.fields.map((f) => (f.path === path ? { ...f, approved } : f)) };
}

export function approveAll(r: Review, paths: string[]): Review {
  const set = new Set(paths);
  return { ...r, fields: r.fields.map((f) => (set.has(f.path) ? { ...f, approved: true } : f)) };
}

/** Problems that block generation: required but empty, not approved, or not parseable. */
export function blockers(r: Review): { path: string; reason: "empty" | "not-approved" | "invalid" }[] {
  const out: { path: string; reason: "empty" | "not-approved" | "invalid" }[] = [];
  for (const f of r.fields) {
    if (f.required && f.value.trim() === "") out.push({ path: f.path, reason: "empty" });
    else if (f.value.trim() !== "" && !isValid(f)) out.push({ path: f.path, reason: "invalid" });
    else if (!f.approved && (f.required || f.value.trim() !== "")) out.push({ path: f.path, reason: "not-approved" });
  }
  const sellerVat = r.fields.find((f) => f.path === "seller.vatId")?.value.trim();
  const sellerTax = r.fields.find((f) => f.path === "seller.taxNumber")?.value.trim();
  if (!sellerVat && !sellerTax) out.push({ path: "seller.vatId", reason: "empty" });
  if (r.lineCount === 0) out.push({ path: "lines", reason: "empty" });
  return out;
}

export function canGenerate(r: Review): boolean {
  return blockers(r).length === 0;
}

function isValid(f: ReviewField): boolean {
  const v = f.value.trim();
  switch (f.kind) {
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    case "amount":
      return parseAmount(v) !== null;
    case "country":
      return /^[A-Za-z]{2}$/.test(v);
    case "currency":
      return /^[A-Za-z]{3}$/.test(v);
    case "category":
      return ["S", "Z", "E", "AE"].includes(v);
    case "unit":
      return /^[A-Z0-9]{2,3}$/.test(v);
    default:
      return true;
  }
}

/** Accepts "1234.56", "1.234,56" and "1234,56". */
export function parseAmount(v: string): number | null {
  const s = v.trim().replace(/\s/g, "");
  if (s === "") return null;
  const normalised = /,\d{1,4}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

export function toApproved(r: Review): ApprovedInvoice {
  if (!canGenerate(r)) throw new Error("not all required fields are approved");
  const get = (p: string) => r.fields.find((f) => f.path === p)?.value.trim() || undefined;
  const party = (prefix: "seller" | "buyer"): ApprovedParty => ({
    name: get(`${prefix}.name`) ?? "",
    street: get(`${prefix}.street`) ?? "",
    postcode: get(`${prefix}.postcode`) ?? "",
    city: get(`${prefix}.city`) ?? "",
    country: (get(`${prefix}.country`) ?? "DE").toUpperCase(),
    vatId: get(`${prefix}.vatId`),
    taxNumber: get(`${prefix}.taxNumber`),
    email: get(`${prefix}.email`),
    phone: get(`${prefix}.phone`),
    contactName: get(`${prefix}.contactName`),
  });
  return {
    invoiceNumber: get("invoiceNumber")!,
    issueDate: get("issueDate")!,
    deliveryDate: get("deliveryDate"),
    dueDate: get("dueDate"),
    currency: get("currency")!.toUpperCase(),
    buyerReference: get("buyerReference")!,
    seller: party("seller"),
    buyer: party("buyer"),
    iban: get("iban"),
    bic: get("bic"),
    paymentTerms: get("paymentTerms"),
    lines: Array.from({ length: r.lineCount }, (_, i) => ({
      description: get(`lines.${i}.description`)!,
      quantity: parseAmount(get(`lines.${i}.quantity`)!)!,
      unitCode: get(`lines.${i}.unitCode`)!,
      unitPrice: parseAmount(get(`lines.${i}.unitPrice`)!)!,
      vatRate: parseAmount(get(`lines.${i}.vatRate`)!)!,
      vatCategory: get(`lines.${i}.vatCategory`) as VatCategory,
    })),
  };
}
