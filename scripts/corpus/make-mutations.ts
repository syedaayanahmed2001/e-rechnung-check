/**
 * Generates the "mutations" corpus: copies of official KoSIT test-suite invoices with one
 * deliberate fault each. The official test suite only contains valid invoices; parity
 * between our in-browser validator and the official Java validator only means something
 * if both are also compared on invoices that fail, and fail in many different ways.
 *
 * Deterministic: the same inputs always produce byte-identical outputs.
 *
 *   node scripts/corpus/make-mutations.ts
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SUITE = join(ROOT, "corpus", "kosit-testsuite", "instances");
const OUT = join(ROOT, "corpus", "mutations");

const NS: Record<string, string> = {
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

const BASES = [
  "standard/01.01a-INVOICE_ubl.xml",
  "standard/01.01a-INVOICE_uncefact.xml",
  "standard/02.01a-INVOICE_ubl.xml",
  "standard/02.01a-INVOICE_uncefact.xml",
  "technical-cases/cius/01.05_minimal_test_ubl.xml",
  "technical-cases/cius/01.05_minimal_test_uncefact.xml",
];

type Syntax = "ubl" | "cii";

/** Walks a slash-separated "prefix:local" path below `from`; "//" prefix searches all descendants. */
function all(from: Document | Element, path: string): Element[] {
  const deep = path.startsWith("//");
  const steps = path.replace(/^\/\//, "").split("/");
  let current: (Document | Element)[] = [from];
  steps.forEach((step, i) => {
    const [prefix, local] = step.split(":");
    const next: Element[] = [];
    for (const node of current) {
      const candidates =
        deep && i === 0
          ? Array.from(node.getElementsByTagNameNS(NS[prefix], local))
          : Array.from(node.childNodes).filter(
              (c): c is Element =>
                c.nodeType === 1 &&
                (c as Element).namespaceURI === NS[prefix] &&
                (c as Element).localName === local,
            );
      next.push(...candidates);
    }
    current = next;
  });
  return current as Element[];
}

function first(from: Document | Element, path: string): Element | undefined {
  return all(from, path)[0];
}

function root(doc: Document): Element {
  return doc.documentElement as Element;
}

function remove(el: Element | undefined): boolean {
  if (!el || !el.parentNode) return false;
  el.parentNode.removeChild(el);
  return true;
}

function setText(el: Element | undefined, value: string): boolean {
  if (!el) return false;
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(el.ownerDocument!.createTextNode(value));
  return true;
}

function bump(el: Element | undefined, delta: number): boolean {
  if (!el) return false;
  const v = Number((el.textContent ?? "").trim());
  return setText(el, (v + delta).toFixed(2));
}

type Mutation = {
  id: string;
  /** What the fault is, in plain words (kept in the manifest). */
  what: string;
  apply: (doc: Document, syntax: Syntax) => boolean;
};

const MUTATIONS: Mutation[] = [
  {
    id: "drop-invoice-number",
    what: "Invoice number (BT-1) removed",
    apply: (d, s) =>
      remove(s === "ubl" ? first(root(d), "cbc:ID") : first(root(d), "rsm:ExchangedDocument/ram:ID")),
  },
  {
    id: "drop-buyer-reference",
    what: "Buyer reference / Leitweg-ID (BT-10) removed",
    apply: (d, s) =>
      remove(s === "ubl" ? first(root(d), "cbc:BuyerReference") : first(d, "//ram:BuyerReference")),
  },
  {
    id: "bad-currency",
    what: "Invoice currency code (BT-5) set to a non-ISO-4217 value",
    apply: (d, s) =>
      setText(
        s === "ubl" ? first(root(d), "cbc:DocumentCurrencyCode") : first(d, "//ram:InvoiceCurrencyCode"),
        "EUX",
      ),
  },
  {
    id: "wrong-payable-amount",
    what: "Amount due for payment (BT-115) off by 1.00",
    apply: (d, s) =>
      bump(
        s === "ubl" ? first(root(d), "cac:LegalMonetaryTotal/cbc:PayableAmount") : first(d, "//ram:DuePayableAmount"),
        1,
      ),
  },
  {
    id: "wrong-line-net",
    what: "First invoice line net amount (BT-131) off by 5.00",
    apply: (d, s) =>
      bump(
        s === "ubl"
          ? first(root(d), "cac:InvoiceLine/cbc:LineExtensionAmount")
          : first(d, "//ram:IncludedSupplyChainTradeLineItem")
              ?.getElementsByTagNameNS(NS.ram, "LineTotalAmount")[0] as Element | undefined,
        5,
      ),
  },
  {
    id: "drop-seller-contact",
    what: "Seller contact group (BG-6) removed",
    apply: (d, s) =>
      remove(
        s === "ubl"
          ? first(root(d), "cac:AccountingSupplierParty/cac:Party/cac:Contact")
          : first(d, "//ram:SellerTradeParty/ram:DefinedTradeContact"),
      ),
  },
  {
    id: "drop-seller-email",
    what: "Seller contact e-mail (BT-43) removed",
    apply: (d, s) =>
      remove(
        s === "ubl"
          ? first(root(d), "cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail")
          : first(d, "//ram:SellerTradeParty/ram:DefinedTradeContact/ram:EmailURIUniversalCommunication"),
      ),
  },
  {
    id: "drop-seller-endpoint",
    what: "Seller electronic address (BT-34) removed",
    apply: (d, s) =>
      remove(
        s === "ubl"
          ? first(root(d), "cac:AccountingSupplierParty/cac:Party/cbc:EndpointID")
          : first(d, "//ram:SellerTradeParty/ram:URIUniversalCommunication"),
      ),
  },
  {
    id: "drop-seller-tax-ids",
    what: "All seller tax registrations (BT-31/BT-32) removed",
    apply: (d, s) => {
      const els =
        s === "ubl"
          ? all(root(d), "cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme")
          : all(d, "//ram:SellerTradeParty/ram:SpecifiedTaxRegistration");
      els.forEach(remove);
      return els.length > 0;
    },
  },
  {
    id: "bad-payment-means",
    what: "Payment means type code (BT-81) set to an unknown code",
    apply: (d, s) =>
      setText(
        s === "ubl"
          ? first(root(d), "cac:PaymentMeans/cbc:PaymentMeansCode")
          : first(d, "//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode"),
        "999",
      ),
  },
  {
    id: "bad-line-vat-category",
    what: "First line VAT category code (BT-151) set to an unknown code",
    apply: (d, s) =>
      setText(
        s === "ubl"
          ? first(root(d), "cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:ID")
          : (first(d, "//ram:IncludedSupplyChainTradeLineItem")
              ?.getElementsByTagNameNS(NS.ram, "CategoryCode")[0] as Element | undefined),
        "Q",
      ),
  },
  {
    id: "bad-issue-date",
    what: "Issue date (BT-2) set to an impossible date",
    apply: (d, s) =>
      setText(
        s === "ubl" ? first(root(d), "cbc:IssueDate") : first(d, "//ram:IssueDateTime/udt:DateTimeString"),
        s === "ubl" ? "2024-13-45" : "20241345",
      ),
  },
  {
    id: "drop-tax-total",
    what: "Document VAT total (BT-110) removed",
    apply: (d, s) =>
      remove(
        s === "ubl"
          ? first(root(d), "cac:TaxTotal/cbc:TaxAmount")
          : first(d, "//ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount"),
      ),
  },
  {
    id: "bad-iban",
    what: "Payee IBAN (BT-84) replaced with a malformed value",
    apply: (d, s) =>
      setText(
        s === "ubl"
          ? first(root(d), "cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID")
          : first(d, "//ram:PayeePartyCreditorFinancialAccount/ram:IBANID"),
        "DE00 ABC",
      ),
  },
  {
    id: "unknown-element",
    what: "An element that does not exist in the schema inserted (XSD error)",
    apply: (d, s) => {
      const anchor = s === "ubl" ? first(root(d), "cbc:ID") : first(root(d), "rsm:ExchangedDocument/ram:ID");
      if (!anchor) return false;
      const ns = s === "ubl" ? NS.cbc : NS.ram;
      const extra = d.createElementNS(ns, s === "ubl" ? "cbc:Frobnicate" : "ram:Frobnicate");
      extra.appendChild(d.createTextNode("x"));
      anchor.parentNode!.insertBefore(extra, anchor.nextSibling);
      return true;
    },
  },
  {
    id: "wrong-element-order",
    what: "Issue date moved before the invoice number (XSD sequence error)",
    apply: (d, s) => {
      if (s === "ubl") {
        const id = first(root(d), "cbc:ID");
        const date = first(root(d), "cbc:IssueDate");
        if (!id || !date) return false;
        root(d).insertBefore(date, id);
        return true;
      }
      const ed = first(root(d), "rsm:ExchangedDocument");
      const id = ed && first(ed, "ram:ID");
      const type = ed && first(ed, "ram:TypeCode");
      if (!ed || !id || !type) return false;
      ed.insertBefore(type, id);
      return true;
    },
  },
  {
    id: "plain-en16931",
    what: "Specification identifier (BT-24) set to plain EN 16931 (no XRechnung CIUS)",
    apply: (d, s) =>
      setText(
        s === "ubl"
          ? first(root(d), "cbc:CustomizationID")
          : first(d, "//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID"),
        "urn:cen.eu:en16931:2017",
      ),
  },
  {
    id: "unknown-specification",
    what: "Specification identifier (BT-24) set to a value no scenario knows",
    apply: (d, s) =>
      setText(
        s === "ubl"
          ? first(root(d), "cbc:CustomizationID")
          : first(d, "//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID"),
        "urn:example:not-a-known-specification",
      ),
  },
];

function listSuite(dir = SUITE, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? listSuite(dir, `${prefix}${e.name}/`) : e.name.endsWith(".xml") ? [`${prefix}${e.name}`] : [],
    )
    .sort();
}

function main(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const manifest: { file: string; base: string; mutation: string; what: string }[] = [];

  // Full mutation matrix on a few bases; every other test-suite invoice gets ROTATING mutations
  // (4 each, rotating through the list) so that many different invoice shapes are covered.
  const others = listSuite().filter((b) => !BASES.includes(b));
  const plan: { base: string; mutations: Mutation[]; truncate: boolean }[] = [
    ...BASES.map((base) => ({ base, mutations: MUTATIONS, truncate: true })),
    ...others.map((base, i) => ({
      base,
      mutations: [0, 1, 2, 3].map((k) => MUTATIONS[(i * 4 + k) % MUTATIONS.length]),
      truncate: false,
    })),
  ];

  for (const { base, mutations, truncate } of plan) {
    const xml = readFileSync(join(SUITE, base), "utf8");
    const syntax: Syntax = base.endsWith("_ubl.xml") ? "ubl" : "cii";
    const stem = base.split("/").pop()!.replace(/\.xml$/, "");

    for (const m of mutations) {
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      if (!m.apply(doc, syntax)) continue;
      const file = `${stem}__${m.id}.xml`;
      writeFileSync(join(OUT, file), new XMLSerializer().serializeToString(doc));
      manifest.push({ file, base, mutation: m.id, what: m.what });
    }

    if (!truncate) continue;
    // Not well-formed: cut the document in half. Done on the text, not the DOM.
    const file = `${stem}__truncated.xml`;
    writeFileSync(join(OUT, file), xml.slice(0, Math.floor(xml.length / 2)));
    manifest.push({ file, base, mutation: "truncated", what: "File cut in half (not well-formed XML)" });
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${manifest.length} mutated invoices to ${OUT}`);
}

main();
