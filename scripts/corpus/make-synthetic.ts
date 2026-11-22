/**
 * Synthetic invoice corpus (author's own, MIT): fictional companies, deterministic.
 *
 * For each invoice:
 *   corpus/synthetic/xml/<id>.xml        XRechnung 3.0 CII (from src/lib/convert/cii.ts)
 *   corpus/synthetic/hybrid/<id>.pdf     visible invoice + embedded factur-x.xml (ZUGFeRD-style
 *                                        hybrid for testing; not a certified PDF/A-3)
 *   corpus/synthetic/plain/<id>.pdf      the same visible invoice without XML (input for Convert)
 *
 * The XML is the ground truth for the eval. Three layouts vary labels, order and number format,
 * so an extractor cannot overfit to one template.
 *
 *   node scripts/corpus/make-synthetic.ts
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AFRelationship, PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { toXRechnungCii } from "../../src/lib/convert/cii.ts";
import { computeTotals, formatCents, lineNetCents, type ApprovedInvoice, type ApprovedLine } from "../../src/lib/convert/invoice.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "corpus", "synthetic");
export const SYNTHETIC_COUNT = 12;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** German IBAN with correct ISO 7064 mod-97 check digits. */
export function germanIban(blz: string, account: string): string {
  const bban = blz + account.padStart(10, "0");
  const numeric = BigInt(bban + "131400"); // "DE" = 13 14, then "00"
  const check = (98n - (numeric % 97n)).toString().padStart(2, "0");
  return `DE${check}${bban}`;
}

const SELLERS = [
  { name: "Holzwerkstatt Brandl GmbH", street: "Lindenweg 12", postcode: "86150", city: "Augsburg", contactName: "Petra Brandl", phone: "+49 821 5550101", email: "rechnung@holzwerkstatt-brandl.example" },
  { name: "Kanzlei für Datenschutz Weber", street: "Am Markt 3", postcode: "85049", city: "Ingolstadt", contactName: "Jonas Weber", phone: "0841 555 0202", email: "buero@kanzlei-weber.example" },
  { name: "Grünflächenpflege Ostermann KG", street: "Feldstraße 88", postcode: "80331", city: "München", contactName: "Lena Ostermann", phone: "089 555 0303", email: "office@ostermann-gruen.example" },
  { name: "IT-Service Yilmaz e.K.", street: "Bahnhofstraße 7a", postcode: "90402", city: "Nürnberg", contactName: "Emre Yilmaz", phone: "+49 911 5550404", email: "billing@yilmaz-it.example" },
];
const BUYERS = [
  { name: "Stadtwerke Musterstadt GmbH", street: "Werkstraße 1", postcode: "86899", city: "Landsberg", email: "eingangsrechnungen@stadtwerke-musterstadt.example" },
  { name: "Bäckerei Huber OHG", street: "Hauptstraße 21", postcode: "86316", city: "Friedberg", email: "buchhaltung@baeckerei-huber.example" },
  { name: "Praxis Dr. Schneider", street: "Ringstraße 5", postcode: "85051", city: "Ingolstadt", email: "verwaltung@praxis-schneider.example" },
];
const ITEMS: { d: string; unit: string; code: string; price: [number, number]; rate: number }[] = [
  { d: "Beratung Datenschutz", unit: "Std.", code: "HUR", price: [85, 140], rate: 19 },
  { d: "Montage Einbauschrank", unit: "Std.", code: "HUR", price: [48, 72], rate: 19 },
  { d: "Eichenholz Leimholzplatte 2000x600", unit: "Stück", code: "H87", price: [60, 180], rate: 19 },
  { d: "Rasenpflege Gewerbefläche", unit: "pauschal", code: "LS", price: [180, 640], rate: 19 },
  { d: "Fachbuch Datenschutzrecht", unit: "Stück", code: "H87", price: [29, 79], rate: 7 },
  { d: "Netzwerkkabel Cat 7, 20 m", unit: "Stück", code: "H87", price: [12, 34], rate: 19 },
  { d: "Wartungsvertrag Server (Monat)", unit: "Monat", code: "MON", price: [90, 260], rate: 19 },
  { d: "Blumenzwiebeln Mischung", unit: "kg", code: "KGM", price: [8, 19], rate: 7 },
  { d: "Anfahrt", unit: "pauschal", code: "LS", price: [25, 60], rate: 19 },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function syntheticInvoice(i: number): ApprovedInvoice {
  const r = rng(1000 + i);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const s = SELLERS[i % SELLERS.length];
  const b = BUYERS[i % BUYERS.length];
  const day = 1 + Math.floor(r() * 27);
  const month = 1 + (i % 11);
  const issueDate = `2026-${pad(month)}-${pad(day)}`;
  const nLines = 1 + Math.floor(r() * 5);
  const lines: ApprovedLine[] = Array.from({ length: nLines }, () => {
    const it = pick(ITEMS);
    const qty = it.code === "HUR" ? Math.round((1 + r() * 12) * 2) / 2 : it.code === "KGM" ? Math.round((1 + r() * 20) * 10) / 10 : 1 + Math.floor(r() * 6);
    const price = Math.round((it.price[0] + r() * (it.price[1] - it.price[0])) * 100) / 100;
    return { description: it.d, quantity: qty, unitCode: it.code, unitPrice: price, vatRate: it.rate, vatCategory: "S" };
  });
  return {
    invoiceNumber: `RE-2026-${String(100 + i * 7).padStart(4, "0")}`,
    issueDate,
    deliveryDate: i % 3 === 2 ? undefined : `2026-${pad(month)}-${pad(Math.max(1, day - 2))}`,
    dueDate: `2026-${pad(month + 1)}-${pad(Math.min(28, day))}`,
    currency: "EUR",
    buyerReference: i % 2 === 0 ? `04011000-${10000 + i}-${pad(i)}` : `Bestellung ${4500 + i * 3}`,
    seller: { ...s, country: "DE", vatId: `DE${String(123456780 + i).slice(0, 9)}`, taxNumber: i % 4 === 1 ? `102/345/${String(6780 + i)}` : undefined },
    buyer: { ...b, country: "DE" },
    iban: germanIban(String(76050000 + (i % 9) * 101), String(1000000 + i * 4711)),
    bic: i % 2 === 0 ? "SSKNDE77XXX" : undefined,
    paymentTerms: "Zahlbar innerhalb von 30 Tagen ohne Abzug.",
    lines,
  };
}

// ---- rendering -----------------------------------------------------------------------------

type Fmt = (cents: bigint) => string;
const deMoney: Fmt = (c) => {
  const [int, frac] = formatCents(c).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac} €`;
};
const enMoney: Fmt = (c) => {
  const [int, frac] = formatCents(c).split(".");
  return `EUR ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
};
const deNum = (n: number) => String(n).replace(".", ",");
const deDate = (iso: string) => iso.split("-").reverse().join(".");

type Writer = { line: (text: string, size?: number, bold?: boolean) => void; gap: (h?: number) => void };

function writer(page: PDFPage, font: PDFFont, bold: PDFFont): Writer {
  let y = 800;
  return {
    line(text, size = 10, isBold = false) {
      page.drawText(text, { x: 50, y, size, font: isBold ? bold : font });
      y -= size + 5;
    },
    gap(h = 8) {
      y -= h;
    },
  };
}

export function invoiceText(inv: ApprovedInvoice, layout: number): string[] {
  const t = computeTotals(inv);
  const money = layout === 2 ? enMoney : deMoney;
  const out: string[] = [];
  const s = inv.seller;
  const b = inv.buyer;
  if (layout === 2) {
    out.push(`INVOICE`, `${s.name} · ${s.street} · ${s.postcode} ${s.city}`, ``);
    out.push(`Bill to:`, b.name, b.street, `${b.postcode} ${b.city}`, ``);
    out.push(`Invoice no.: ${inv.invoiceNumber}`, `Invoice date: ${inv.issueDate}`);
    if (inv.deliveryDate) out.push(`Delivery date: ${inv.deliveryDate}`);
    out.push(`Your reference: ${inv.buyerReference}`, ``);
  } else {
    out.push(`${s.name}`, `${s.street}, ${s.postcode} ${s.city}`, ``);
    out.push(b.name, b.street, `${b.postcode} ${b.city}`, ``);
    out.push(`RECHNUNG`, ``);
    if (layout === 0) {
      out.push(`Rechnungsnummer: ${inv.invoiceNumber}`, `Rechnungsdatum: ${deDate(inv.issueDate)}`);
      if (inv.deliveryDate) out.push(`Leistungsdatum: ${deDate(inv.deliveryDate)}`);
      out.push(`Ihre Referenz: ${inv.buyerReference}`);
    } else {
      out.push(`Datum: ${deDate(inv.issueDate)}    Rechnung Nr. ${inv.invoiceNumber}`);
      if (inv.deliveryDate) out.push(`Lieferung/Leistung am ${deDate(inv.deliveryDate)}`);
      out.push(`Leitweg-ID / Bestellnummer: ${inv.buyerReference}`);
    }
    out.push(``);
  }
  out.push(layout === 2 ? `Pos  Description  Qty  Unit  Unit price  VAT  Amount` : `Pos.  Bezeichnung  Menge  Einheit  Einzelpreis  USt.  Gesamt`);
  inv.lines.forEach((l, i) => {
    const unit = ITEMS.find((it) => it.d === l.description)?.unit ?? "Stück";
    const net = lineNetCents(l);
    const price = layout === 2 ? `EUR ${l.unitPrice.toFixed(2)}` : `${deNum(l.unitPrice)} €`;
    out.push(`${i + 1}  ${l.description}  ${layout === 2 ? l.quantity : deNum(l.quantity)}  ${unit}  ${price}  ${l.vatRate} %  ${money(net)}`);
  });
  out.push(``);
  if (layout === 2) {
    out.push(`Net total: ${money(t.taxBasisCents)}`);
    for (const g of t.groups) out.push(`VAT ${g.rate} % on ${money(g.baseCents)}: ${money(g.taxCents)}`);
    out.push(`Total VAT: ${money(t.taxTotalCents)}`, `Total: ${money(t.grandTotalCents)}`, `Amount due: ${money(t.duePayableCents)}`);
  } else {
    out.push(`Summe netto: ${money(t.taxBasisCents)}`);
    for (const g of t.groups) out.push(`zzgl. ${g.rate} % USt. auf ${money(g.baseCents)}: ${money(g.taxCents)}`);
    out.push(`Umsatzsteuer gesamt: ${money(t.taxTotalCents)}`, `Rechnungsbetrag brutto: ${money(t.grandTotalCents)}`, `Zahlbetrag: ${money(t.duePayableCents)}`);
  }
  out.push(``);
  out.push(layout === 2 ? `Payment terms: ${inv.paymentTerms}` : `Zahlungsbedingungen: ${inv.paymentTerms}`);
  if (inv.dueDate) out.push(layout === 2 ? `Due date: ${inv.dueDate}` : `Fällig am: ${deDate(inv.dueDate)}`);
  out.push(`IBAN: ${inv.iban!.replace(/(.{4})/g, "$1 ").trim()}${inv.bic ? `   BIC: ${inv.bic}` : ""}`);
  out.push(``);
  out.push(layout === 2 ? `VAT ID: ${s.vatId}` : `USt-IdNr.: ${s.vatId}`);
  if (s.taxNumber) out.push(`Steuernummer: ${s.taxNumber}`);
  out.push(`${layout === 2 ? "Contact" : "Ansprechpartnerin/Ansprechpartner"}: ${s.contactName} · Tel. ${s.phone} · ${s.email}`);
  out.push(`${layout === 2 ? "Customer e-mail" : "E-Mail Rechnungsempfang"}: ${b.email}`);
  return out;
}

async function renderPdf(inv: ApprovedInvoice, layout: number, xml?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Deterministic output: fixed metadata dates and IDs.
  const fixed = new Date("2026-11-22T00:00:00Z");
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  doc.setProducer("e-rechnung-check synthetic corpus");
  doc.setCreator("e-rechnung-check");
  doc.setTitle(`Rechnung ${inv.invoiceNumber}`);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = writer(page, font, bold);
  for (const line of invoiceText(inv, layout)) {
    if (line === "") w.gap();
    else w.line(line, line === "RECHNUNG" || line === "INVOICE" ? 16 : 10, line === "RECHNUNG" || line === "INVOICE");
  }
  if (xml) {
    await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", {
      mimeType: "text/xml",
      description: "Factur-X/ZUGFeRD invoice (XRechnung 3.0 CII)",
      creationDate: fixed,
      modificationDate: fixed,
      afRelationship: AFRelationship.Alternative,
    });
  }
  return doc.save({ useObjectStreams: false });
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  for (const d of ["xml", "hybrid", "plain"]) mkdirSync(join(OUT, d), { recursive: true });
  const index: { id: string; layout: number; lines: number }[] = [];
  for (let i = 0; i < SYNTHETIC_COUNT; i++) {
    const inv = syntheticInvoice(i);
    const id = `syn-${String(i + 1).padStart(2, "0")}`;
    const layout = i % 3;
    const xml = toXRechnungCii(inv);
    writeFileSync(join(OUT, "xml", `${id}.xml`), xml);
    writeFileSync(join(OUT, "hybrid", `${id}.pdf`), await renderPdf(inv, layout, xml));
    writeFileSync(join(OUT, "plain", `${id}.pdf`), await renderPdf(inv, layout));
    index.push({ id, layout, lines: inv.lines.length });
  }
  writeFileSync(
    join(OUT, "README.md"),
    "# Synthetic invoices\n\nGenerated by `scripts/corpus/make-synthetic.ts` (deterministic). Fictional companies and people; " +
      "the `.example` domains and IBANs are not real accounts. Licence: MIT, same as the repository.\n\n" +
      "- `xml/`: XRechnung 3.0 CII (ground truth)\n- `hybrid/`: visible invoice plus embedded `factur-x.xml` " +
      "(ZUGFeRD-style hybrid for testing, not a certified PDF/A-3)\n- `plain/`: the same visible invoice without XML (Convert input)\n",
  );
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`wrote ${SYNTHETIC_COUNT} synthetic invoices to ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
