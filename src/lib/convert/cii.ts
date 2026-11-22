/**
 * Writes an approved invoice as XRechnung 3.0 in UN/CEFACT CII syntax (CONV-07).
 *
 * Why CII and not UBL: ZUGFeRD / Factur-X embed CII, so the same mapping serves conversion,
 * the eval's ground truth and a later PDF/A-3 hybrid. Element order follows the CII D16B schema.
 */
import { computeTotals, formatCents, type ApprovedInvoice, type ApprovedParty, type VatGroup } from "./invoice.ts";

export const XRECHNUNG_30 = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
export const PEPPOL_BILLING = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function el(name: string, content: string | undefined, attrs = ""): string {
  if (content === undefined || content === "") return "";
  return `<${name}${attrs}>${content}</${name}>`;
}

function t(name: string, value: string | undefined, attrs = ""): string {
  return value === undefined || value.trim() === "" ? "" : el(name, esc(value.trim()), attrs);
}

function date102(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`date must be YYYY-MM-DD: ${iso}`);
  return `<udt:DateTimeString format="102">${iso.replaceAll("-", "")}</udt:DateTimeString>`;
}

function num(n: number, maxDecimals = 4): string {
  return n.toFixed(maxDecimals).replace(/\.?0+$/, "") || "0";
}

function address(p: ApprovedParty): string {
  return el(
    "ram:PostalTradeAddress",
    t("ram:PostcodeCode", p.postcode) + t("ram:LineOne", p.street) + t("ram:CityName", p.city) + t("ram:CountryID", p.country.toUpperCase()),
  );
}

function taxRegistrations(p: ApprovedParty): string {
  return (
    (p.vatId ? el("ram:SpecifiedTaxRegistration", t("ram:ID", p.vatId.replace(/\s+/g, "").toUpperCase(), ' schemeID="VA"')) : "") +
    (p.taxNumber ? el("ram:SpecifiedTaxRegistration", t("ram:ID", p.taxNumber, ' schemeID="FC"')) : "")
  );
}

function seller(p: ApprovedParty): string {
  const contact = el(
    "ram:DefinedTradeContact",
    t("ram:PersonName", p.contactName) +
      el("ram:TelephoneUniversalCommunication", t("ram:CompleteNumber", p.phone)) +
      el("ram:EmailURIUniversalCommunication", t("ram:URIID", p.email)),
  );
  return el(
    "ram:SellerTradeParty",
    t("ram:Name", p.name) +
      contact +
      address(p) +
      el("ram:URIUniversalCommunication", t("ram:URIID", p.email, ' schemeID="EM"')) +
      taxRegistrations(p),
  );
}

function buyer(p: ApprovedParty): string {
  return el(
    "ram:BuyerTradeParty",
    t("ram:Name", p.name) + address(p) + el("ram:URIUniversalCommunication", t("ram:URIID", p.email, ' schemeID="EM"')) + taxRegistrations(p),
  );
}

function headerTax(g: VatGroup, inv: ApprovedInvoice): string {
  const reason =
    g.category === "E"
      ? t("ram:ExemptionReason", inv.exemptionReason ?? "Steuerfreie Leistung")
      : g.category === "AE"
        ? t("ram:ExemptionReason", "Steuerschuldnerschaft des Leistungsempfängers")
        : "";
  return el(
    "ram:ApplicableTradeTax",
    el("ram:CalculatedAmount", formatCents(g.taxCents)) +
      "<ram:TypeCode>VAT</ram:TypeCode>" +
      reason +
      el("ram:BasisAmount", formatCents(g.baseCents)) +
      el("ram:CategoryCode", g.category) +
      (g.category === "AE" ? "<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>" : "") +
      el("ram:RateApplicablePercent", num(g.category === "S" ? g.rate : 0, 2)),
  );
}

export function toXRechnungCii(inv: ApprovedInvoice): string {
  const totals = computeTotals(inv);
  const cur = esc(inv.currency.toUpperCase());

  const lines = inv.lines
    .map((l, i) =>
      el(
        "ram:IncludedSupplyChainTradeLineItem",
        el("ram:AssociatedDocumentLineDocument", el("ram:LineID", String(i + 1))) +
          el("ram:SpecifiedTradeProduct", t("ram:Name", l.description)) +
          el("ram:SpecifiedLineTradeAgreement", el("ram:NetPriceProductTradePrice", el("ram:ChargeAmount", num(l.unitPrice)))) +
          el("ram:SpecifiedLineTradeDelivery", el("ram:BilledQuantity", num(l.quantity), ` unitCode="${esc(l.unitCode)}"`)) +
          el(
            "ram:SpecifiedLineTradeSettlement",
            el(
              "ram:ApplicableTradeTax",
              "<ram:TypeCode>VAT</ram:TypeCode>" +
                el("ram:CategoryCode", l.vatCategory) +
                el("ram:RateApplicablePercent", num(l.vatCategory === "S" ? l.vatRate : 0, 2)),
            ) + el("ram:SpecifiedTradeSettlementLineMonetarySummation", el("ram:LineTotalAmount", formatCents(totals.lines[i]))),
          ),
      ),
    )
    .join("");

  const agreement = el("ram:ApplicableHeaderTradeAgreement", t("ram:BuyerReference", inv.buyerReference) + seller(inv.seller) + buyer(inv.buyer));

  const delivery = el(
    "ram:ApplicableHeaderTradeDelivery",
    inv.deliveryDate ? el("ram:ActualDeliverySupplyChainEvent", el("ram:OccurrenceDateTime", date102(inv.deliveryDate))) : "",
  );
  // An empty ApplicableHeaderTradeDelivery is required by the schema even without a date.
  const deliveryBlock = delivery || "<ram:ApplicableHeaderTradeDelivery/>";

  const paymentMeans = el(
    "ram:SpecifiedTradeSettlementPaymentMeans",
    "<ram:TypeCode>58</ram:TypeCode>" +
      el("ram:PayeePartyCreditorFinancialAccount", t("ram:IBANID", inv.iban?.replace(/\s+/g, "").toUpperCase())) +
      el("ram:PayeeSpecifiedCreditorFinancialInstitution", t("ram:BICID", inv.bic?.replace(/\s+/g, "").toUpperCase())),
  );

  const terms =
    inv.paymentTerms || inv.dueDate
      ? el(
          "ram:SpecifiedTradePaymentTerms",
          t("ram:Description", inv.paymentTerms) + (inv.dueDate ? el("ram:DueDateDateTime", date102(inv.dueDate)) : ""),
        )
      : "";

  const summation = el(
    "ram:SpecifiedTradeSettlementHeaderMonetarySummation",
    el("ram:LineTotalAmount", formatCents(totals.lineTotalCents)) +
      el("ram:TaxBasisTotalAmount", formatCents(totals.taxBasisCents)) +
      el("ram:TaxTotalAmount", formatCents(totals.taxTotalCents), ` currencyID="${cur}"`) +
      el("ram:GrandTotalAmount", formatCents(totals.grandTotalCents)) +
      (totals.prepaidCents !== 0n ? el("ram:TotalPrepaidAmount", formatCents(totals.prepaidCents)) : "") +
      el("ram:DuePayableAmount", formatCents(totals.duePayableCents)),
  );

  const settlement = el(
    "ram:ApplicableHeaderTradeSettlement",
    el("ram:InvoiceCurrencyCode", cur) + paymentMeans + totals.groups.map((g) => headerTax(g, inv)).join("") + terms + summation,
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" ` +
    `xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" ` +
    `xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" ` +
    `xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">` +
    el(
      "rsm:ExchangedDocumentContext",
      el("ram:BusinessProcessSpecifiedDocumentContextParameter", el("ram:ID", PEPPOL_BILLING)) +
        el("ram:GuidelineSpecifiedDocumentContextParameter", el("ram:ID", XRECHNUNG_30)),
    ) +
    el(
      "rsm:ExchangedDocument",
      t("ram:ID", inv.invoiceNumber) + "<ram:TypeCode>380</ram:TypeCode>" + el("ram:IssueDateTime", date102(inv.issueDate)),
    ) +
    el("rsm:SupplyChainTradeTransaction", lines + agreement + deliveryBlock + settlement) +
    `</rsm:CrossIndustryInvoice>\n`
  );
}
