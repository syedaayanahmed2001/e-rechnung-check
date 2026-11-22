/**
 * EN 16931 business terms (BT) and groups (BG) used by the explanations, with their location in
 * the two XRechnung syntaxes. Paths are relative to the document root (UBL: /Invoice or
 * /CreditNote, CII: /rsm:CrossIndustryInvoice). CII paths abbreviate the three header blocks
 * of rsm:SupplyChainTradeTransaction as Agreement, Delivery and Settlement.
 *
 * Written once here, so every explanation that mentions a term points to the same place.
 */
export type Term = { de: string; en: string; ubl: string; cii: string };

const A = "ram:ApplicableHeaderTradeAgreement";
const D = "ram:ApplicableHeaderTradeDelivery";
const S = "ram:ApplicableHeaderTradeSettlement";
const SELLER_UBL = "cac:AccountingSupplierParty/cac:Party";
const BUYER_UBL = "cac:AccountingCustomerParty/cac:Party";
const SUM = `${S}/ram:SpecifiedTradeSettlementHeaderMonetarySummation`;
const LINE_CII = "ram:IncludedSupplyChainTradeLineItem";

export const TERMS: Record<string, Term> = {
  "BT-1": { de: "Rechnungsnummer", en: "Invoice number", ubl: "cbc:ID", cii: "rsm:ExchangedDocument/ram:ID" },
  "BT-2": {
    de: "Rechnungsdatum",
    en: "Invoice issue date",
    ubl: "cbc:IssueDate",
    cii: "rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString",
  },
  "BT-3": {
    de: "Rechnungsart (Code)",
    en: "Invoice type code",
    ubl: "cbc:InvoiceTypeCode (CreditNote: cbc:CreditNoteTypeCode)",
    cii: "rsm:ExchangedDocument/ram:TypeCode",
  },
  "BT-5": { de: "Rechnungswährung", en: "Invoice currency code", ubl: "cbc:DocumentCurrencyCode", cii: `${S}/ram:InvoiceCurrencyCode` },
  "BT-6": { de: "Steuerwährung", en: "VAT accounting currency code", ubl: "cbc:TaxCurrencyCode", cii: `${S}/ram:TaxCurrencyCode` },
  "BT-10": { de: "Käuferreferenz (Leitweg-ID)", en: "Buyer reference (Leitweg-ID)", ubl: "cbc:BuyerReference", cii: `${A}/ram:BuyerReference` },
  "BT-20": { de: "Zahlungsbedingungen", en: "Payment terms", ubl: "cac:PaymentTerms/cbc:Note", cii: `${S}/ram:SpecifiedTradePaymentTerms/ram:Description` },
  "BT-23": {
    de: "Geschäftsprozess",
    en: "Business process type",
    ubl: "cbc:ProfileID",
    cii: "rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID",
  },
  "BT-24": {
    de: "Spezifikationskennung",
    en: "Specification identifier",
    ubl: "cbc:CustomizationID",
    cii: "rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID",
  },
  "BT-27": {
    de: "Name des Verkäufers",
    en: "Seller name",
    ubl: `${SELLER_UBL}/cac:PartyLegalEntity/cbc:RegistrationName`,
    cii: `${A}/ram:SellerTradeParty/ram:Name`,
  },
  "BT-29": {
    de: "Kennung des Verkäufers",
    en: "Seller identifier",
    ubl: `${SELLER_UBL}/cac:PartyIdentification/cbc:ID`,
    cii: `${A}/ram:SellerTradeParty/ram:ID (or ram:GlobalID)`,
  },
  "BT-30": {
    de: "Registernummer des Verkäufers (z. B. Handelsregister)",
    en: "Seller legal registration identifier",
    ubl: `${SELLER_UBL}/cac:PartyLegalEntity/cbc:CompanyID`,
    cii: `${A}/ram:SellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID`,
  },
  "BT-31": {
    de: "Umsatzsteuer-Identifikationsnummer des Verkäufers",
    en: "Seller VAT identifier",
    ubl: `${SELLER_UBL}/cac:PartyTaxScheme[cac:TaxScheme/cbc:ID='VAT']/cbc:CompanyID`,
    cii: `${A}/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']`,
  },
  "BT-32": {
    de: "Steuernummer des Verkäufers",
    en: "Seller tax registration identifier",
    ubl: `${SELLER_UBL}/cac:PartyTaxScheme[cac:TaxScheme/cbc:ID!='VAT']/cbc:CompanyID`,
    cii: `${A}/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID='FC']`,
  },
  "BT-34": {
    de: "Elektronische Adresse des Verkäufers",
    en: "Seller electronic address",
    ubl: `${SELLER_UBL}/cbc:EndpointID (with @schemeID)`,
    cii: `${A}/ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID (with @schemeID)`,
  },
  "BT-37": {
    de: "Ort des Verkäufers",
    en: "Seller city",
    ubl: `${SELLER_UBL}/cac:PostalAddress/cbc:CityName`,
    cii: `${A}/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CityName`,
  },
  "BT-38": {
    de: "Postleitzahl des Verkäufers",
    en: "Seller post code",
    ubl: `${SELLER_UBL}/cac:PostalAddress/cbc:PostalZone`,
    cii: `${A}/ram:SellerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode`,
  },
  "BT-40": {
    de: "Ländercode des Verkäufers",
    en: "Seller country code",
    ubl: `${SELLER_UBL}/cac:PostalAddress/cac:Country/cbc:IdentificationCode`,
    cii: `${A}/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID`,
  },
  "BT-41": {
    de: "Ansprechpartner des Verkäufers",
    en: "Seller contact point",
    ubl: `${SELLER_UBL}/cac:Contact/cbc:Name`,
    cii: `${A}/ram:SellerTradeParty/ram:DefinedTradeContact/ram:PersonName (or ram:DepartmentName)`,
  },
  "BT-42": {
    de: "Telefonnummer des Ansprechpartners",
    en: "Seller contact telephone number",
    ubl: `${SELLER_UBL}/cac:Contact/cbc:Telephone`,
    cii: `${A}/ram:SellerTradeParty/ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber`,
  },
  "BT-43": {
    de: "E-Mail-Adresse des Ansprechpartners",
    en: "Seller contact email address",
    ubl: `${SELLER_UBL}/cac:Contact/cbc:ElectronicMail`,
    cii: `${A}/ram:SellerTradeParty/ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID`,
  },
  "BT-44": {
    de: "Name des Käufers",
    en: "Buyer name",
    ubl: `${BUYER_UBL}/cac:PartyLegalEntity/cbc:RegistrationName`,
    cii: `${A}/ram:BuyerTradeParty/ram:Name`,
  },
  "BT-47": {
    de: "Registernummer des Käufers",
    en: "Buyer legal registration identifier",
    ubl: `${BUYER_UBL}/cac:PartyLegalEntity/cbc:CompanyID`,
    cii: `${A}/ram:BuyerTradeParty/ram:SpecifiedLegalOrganization/ram:ID`,
  },
  "BT-48": {
    de: "Umsatzsteuer-Identifikationsnummer des Käufers",
    en: "Buyer VAT identifier",
    ubl: `${BUYER_UBL}/cac:PartyTaxScheme/cbc:CompanyID`,
    cii: `${A}/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']`,
  },
  "BT-49": {
    de: "Elektronische Adresse des Käufers",
    en: "Buyer electronic address",
    ubl: `${BUYER_UBL}/cbc:EndpointID (with @schemeID)`,
    cii: `${A}/ram:BuyerTradeParty/ram:URIUniversalCommunication/ram:URIID (with @schemeID)`,
  },
  "BT-52": {
    de: "Ort des Käufers",
    en: "Buyer city",
    ubl: `${BUYER_UBL}/cac:PostalAddress/cbc:CityName`,
    cii: `${A}/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CityName`,
  },
  "BT-53": {
    de: "Postleitzahl des Käufers",
    en: "Buyer post code",
    ubl: `${BUYER_UBL}/cac:PostalAddress/cbc:PostalZone`,
    cii: `${A}/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode`,
  },
  "BT-55": {
    de: "Ländercode des Käufers",
    en: "Buyer country code",
    ubl: `${BUYER_UBL}/cac:PostalAddress/cac:Country/cbc:IdentificationCode`,
    cii: `${A}/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID`,
  },
  "BT-63": {
    de: "USt-IdNr. des Steuervertreters",
    en: "Seller tax representative VAT identifier",
    ubl: "cac:TaxRepresentativeParty/cac:PartyTaxScheme/cbc:CompanyID",
    cii: `${A}/ram:SellerTaxRepresentativeTradeParty/ram:SpecifiedTaxRegistration/ram:ID`,
  },
  "BT-71": {
    de: "Kennung des Lieferorts",
    en: "Deliver to location identifier",
    ubl: "cac:Delivery/cac:DeliveryLocation/cbc:ID (with @schemeID)",
    cii: `${D}/ram:ShipToTradeParty/ram:GlobalID (with @schemeID)`,
  },
  "BT-72": {
    de: "Tatsächliches Liefer- bzw. Leistungsdatum",
    en: "Actual delivery date",
    ubl: "cac:Delivery/cbc:ActualDeliveryDate",
    cii: `${D}/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString`,
  },
  "BT-77": {
    de: "Ort der Lieferanschrift",
    en: "Deliver to city",
    ubl: "cac:Delivery/cac:DeliveryLocation/cac:Address/cbc:CityName",
    cii: `${D}/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:CityName`,
  },
  "BT-78": {
    de: "Postleitzahl der Lieferanschrift",
    en: "Deliver to post code",
    ubl: "cac:Delivery/cac:DeliveryLocation/cac:Address/cbc:PostalZone",
    cii: `${D}/ram:ShipToTradeParty/ram:PostalTradeAddress/ram:PostcodeCode`,
  },
  "BT-81": {
    de: "Zahlungsart (Code)",
    en: "Payment means type code",
    ubl: "cac:PaymentMeans/cbc:PaymentMeansCode",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode`,
  },
  "BT-84": {
    de: "IBAN des Zahlungsempfängers",
    en: "Payment account identifier (IBAN)",
    ubl: "cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID`,
  },
  "BT-89": {
    de: "Mandatsreferenz (Lastschrift)",
    en: "Mandate reference identifier",
    ubl: "cac:PaymentMeans/cac:PaymentMandate/cbc:ID",
    cii: `${S}/ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID`,
  },
  "BT-91": {
    de: "IBAN des belasteten Kontos (Lastschrift)",
    en: "Debited account identifier",
    ubl: "cac:PaymentMeans/cac:PaymentMandate/cac:PayerFinancialAccount/cbc:ID",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:IBANID`,
  },
  "BT-92": {
    de: "Betrag des Nachlasses auf Dokumentebene",
    en: "Document level allowance amount",
    ubl: "cac:AllowanceCharge[cbc:ChargeIndicator='false']/cbc:Amount",
    cii: `${S}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:ActualAmount`,
  },
  "BT-99": {
    de: "Betrag des Zuschlags auf Dokumentebene",
    en: "Document level charge amount",
    ubl: "cac:AllowanceCharge[cbc:ChargeIndicator='true']/cbc:Amount",
    cii: `${S}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:ActualAmount`,
  },
  "BT-106": {
    de: "Summe der Nettobeträge aller Positionen",
    en: "Sum of invoice line net amount",
    ubl: "cac:LegalMonetaryTotal/cbc:LineExtensionAmount",
    cii: `${SUM}/ram:LineTotalAmount`,
  },
  "BT-107": {
    de: "Summe der Nachlässe auf Dokumentebene",
    en: "Sum of allowances on document level",
    ubl: "cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount",
    cii: `${SUM}/ram:AllowanceTotalAmount`,
  },
  "BT-108": {
    de: "Summe der Zuschläge auf Dokumentebene",
    en: "Sum of charges on document level",
    ubl: "cac:LegalMonetaryTotal/cbc:ChargeTotalAmount",
    cii: `${SUM}/ram:ChargeTotalAmount`,
  },
  "BT-109": {
    de: "Rechnungsgesamtbetrag ohne Umsatzsteuer",
    en: "Invoice total amount without VAT",
    ubl: "cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount",
    cii: `${SUM}/ram:TaxBasisTotalAmount`,
  },
  "BT-110": {
    de: "Gesamtbetrag der Umsatzsteuer",
    en: "Invoice total VAT amount",
    ubl: "cac:TaxTotal/cbc:TaxAmount",
    cii: `${SUM}/ram:TaxTotalAmount`,
  },
  "BT-111": {
    de: "Umsatzsteuer-Gesamtbetrag in Steuerwährung",
    en: "Invoice total VAT amount in accounting currency",
    ubl: "cac:TaxTotal/cbc:TaxAmount[@currencyID = TaxCurrencyCode]",
    cii: `${SUM}/ram:TaxTotalAmount[@currencyID = TaxCurrencyCode]`,
  },
  "BT-112": {
    de: "Rechnungsgesamtbetrag einschließlich Umsatzsteuer",
    en: "Invoice total amount with VAT",
    ubl: "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount",
    cii: `${SUM}/ram:GrandTotalAmount`,
  },
  "BT-113": {
    de: "Bereits gezahlter Betrag",
    en: "Paid amount",
    ubl: "cac:LegalMonetaryTotal/cbc:PrepaidAmount",
    cii: `${SUM}/ram:TotalPrepaidAmount`,
  },
  "BT-114": {
    de: "Rundungsbetrag",
    en: "Rounding amount",
    ubl: "cac:LegalMonetaryTotal/cbc:PayableRoundingAmount",
    cii: `${SUM}/ram:RoundingAmount`,
  },
  "BT-115": {
    de: "Fälliger Zahlungsbetrag",
    en: "Amount due for payment",
    ubl: "cac:LegalMonetaryTotal/cbc:PayableAmount",
    cii: `${SUM}/ram:DuePayableAmount`,
  },
  "BT-116": {
    de: "Steuerbemessungsgrundlage je Steuerkategorie",
    en: "VAT category taxable amount",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount",
    cii: `${S}/ram:ApplicableTradeTax/ram:BasisAmount`,
  },
  "BT-117": {
    de: "Steuerbetrag je Steuerkategorie",
    en: "VAT category tax amount",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount",
    cii: `${S}/ram:ApplicableTradeTax/ram:CalculatedAmount`,
  },
  "BT-118": {
    de: "Steuerkategorie (Code) in der Aufschlüsselung",
    en: "VAT category code (breakdown)",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID",
    cii: `${S}/ram:ApplicableTradeTax/ram:CategoryCode`,
  },
  "BT-119": {
    de: "Steuersatz in der Aufschlüsselung",
    en: "VAT category rate",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent",
    cii: `${S}/ram:ApplicableTradeTax/ram:RateApplicablePercent`,
  },
  "BT-120": {
    de: "Befreiungsgrund (Text)",
    en: "VAT exemption reason text",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason",
    cii: `${S}/ram:ApplicableTradeTax/ram:ExemptionReason`,
  },
  "BT-121": {
    de: "Befreiungsgrund (Code)",
    en: "VAT exemption reason code",
    ubl: "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode",
    cii: `${S}/ram:ApplicableTradeTax/ram:ExemptionReasonCode`,
  },
  "BT-123": {
    de: "Beschreibung eines rechnungsbegründenden Dokuments",
    en: "Supporting document description",
    ubl: "cac:AdditionalDocumentReference/cbc:DocumentDescription",
    cii: `${A}/ram:AdditionalReferencedDocument[ram:TypeCode='916']/ram:Name`,
  },
  "BT-125": {
    de: "Angehängtes Dokument",
    en: "Attached document",
    ubl: "cac:AdditionalDocumentReference/cac:Attachment/cbc:EmbeddedDocumentBinaryObject",
    cii: `${A}/ram:AdditionalReferencedDocument[ram:TypeCode='916']/ram:AttachmentBinaryObject`,
  },
  "BT-126": {
    de: "Positionsnummer",
    en: "Invoice line identifier",
    ubl: "cac:InvoiceLine/cbc:ID",
    cii: `${LINE_CII}/ram:AssociatedDocumentLineDocument/ram:LineID`,
  },
  "BT-129": {
    de: "Menge",
    en: "Invoiced quantity",
    ubl: "cac:InvoiceLine/cbc:InvoicedQuantity",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeDelivery/ram:BilledQuantity`,
  },
  "BT-130": {
    de: "Mengeneinheit (Code)",
    en: "Invoiced quantity unit of measure code",
    ubl: "cac:InvoiceLine/cbc:InvoicedQuantity/@unitCode",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeDelivery/ram:BilledQuantity/@unitCode`,
  },
  "BT-131": {
    de: "Nettobetrag der Position",
    en: "Invoice line net amount",
    ubl: "cac:InvoiceLine/cbc:LineExtensionAmount",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount`,
  },
  "BT-146": {
    de: "Nettopreis des Artikels",
    en: "Item net price",
    ubl: "cac:InvoiceLine/cac:Price/cbc:PriceAmount",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount`,
  },
  "BT-149": {
    de: "Preisbasismenge",
    en: "Item price base quantity",
    ubl: "cac:InvoiceLine/cac:Price/cbc:BaseQuantity",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:BasisQuantity`,
  },
  "BT-151": {
    de: "Steuerkategorie der Position (Code)",
    en: "Invoiced item VAT category code",
    ubl: "cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:ID",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode`,
  },
  "BT-152": {
    de: "Steuersatz der Position",
    en: "Invoiced item VAT rate",
    ubl: "cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:RateApplicablePercent`,
  },
  "BT-153": {
    de: "Artikelname",
    en: "Item name",
    ubl: "cac:InvoiceLine/cac:Item/cbc:Name",
    cii: `${LINE_CII}/ram:SpecifiedTradeProduct/ram:Name`,
  },
  "BT-157": {
    de: "Standardkennung des Artikels (z. B. GTIN)",
    en: "Item standard identifier",
    ubl: "cac:InvoiceLine/cac:Item/cac:StandardItemIdentification/cbc:ID/@schemeID",
    cii: `${LINE_CII}/ram:SpecifiedTradeProduct/ram:GlobalID/@schemeID`,
  },
  "BT-158": {
    de: "Klassifizierung des Artikels",
    en: "Item classification identifier",
    ubl: "cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode/@listID",
    cii: `${LINE_CII}/ram:SpecifiedTradeProduct/ram:DesignatedProductClassification/ram:ClassCode/@listID`,
  },
  "BG-3": {
    de: "Verweis auf eine vorausgegangene Rechnung",
    en: "Preceding invoice reference",
    ubl: "cac:BillingReference/cac:InvoiceDocumentReference",
    cii: `${S}/ram:InvoiceReferencedDocument`,
  },
  "BG-5": {
    de: "Anschrift des Verkäufers",
    en: "Seller postal address",
    ubl: `${SELLER_UBL}/cac:PostalAddress`,
    cii: `${A}/ram:SellerTradeParty/ram:PostalTradeAddress`,
  },
  "BG-6": {
    de: "Kontaktdaten des Verkäufers",
    en: "Seller contact",
    ubl: `${SELLER_UBL}/cac:Contact`,
    cii: `${A}/ram:SellerTradeParty/ram:DefinedTradeContact`,
  },
  "BG-8": {
    de: "Anschrift des Käufers",
    en: "Buyer postal address",
    ubl: `${BUYER_UBL}/cac:PostalAddress`,
    cii: `${A}/ram:BuyerTradeParty/ram:PostalTradeAddress`,
  },
  "BG-11": {
    de: "Steuervertreter des Verkäufers",
    en: "Seller tax representative party",
    ubl: "cac:TaxRepresentativeParty",
    cii: `${A}/ram:SellerTaxRepresentativeTradeParty`,
  },
  "BG-14": {
    de: "Abrechnungszeitraum",
    en: "Invoicing period",
    ubl: "cac:InvoicePeriod",
    cii: `${S}/ram:BillingSpecifiedPeriod`,
  },
  "BG-15": {
    de: "Lieferanschrift",
    en: "Deliver to address",
    ubl: "cac:Delivery/cac:DeliveryLocation/cac:Address",
    cii: `${D}/ram:ShipToTradeParty/ram:PostalTradeAddress`,
  },
  "BG-16": {
    de: "Zahlungsanweisungen",
    en: "Payment instructions",
    ubl: "cac:PaymentMeans",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans`,
  },
  "BG-17": {
    de: "Überweisung",
    en: "Credit transfer",
    ubl: "cac:PaymentMeans/cac:PayeeFinancialAccount",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount`,
  },
  "BG-18": {
    de: "Zahlungskarte",
    en: "Payment card information",
    ubl: "cac:PaymentMeans/cac:CardAccount",
    cii: `${S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:ApplicableTradeSettlementFinancialCard`,
  },
  "BG-19": {
    de: "Lastschrift",
    en: "Direct debit",
    ubl: "cac:PaymentMeans/cac:PaymentMandate",
    cii: `${S}/ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID, ram:CreditorReferenceID, ram:PayerPartyDebtorFinancialAccount`,
  },
  "BG-23": {
    de: "Aufschlüsselung der Umsatzsteuer",
    en: "VAT breakdown",
    ubl: "cac:TaxTotal/cac:TaxSubtotal",
    cii: `${S}/ram:ApplicableTradeTax`,
  },
  "BG-25": { de: "Rechnungsposition", en: "Invoice line", ubl: "cac:InvoiceLine", cii: LINE_CII },
  "BG-26": {
    de: "Abrechnungszeitraum der Position",
    en: "Invoice line period",
    ubl: "cac:InvoiceLine/cac:InvoicePeriod",
    cii: `${LINE_CII}/ram:SpecifiedLineTradeSettlement/ram:BillingSpecifiedPeriod`,
  },
  "BG-DEX-01": {
    de: "Unterposition (XRechnung-Extension)",
    en: "Sub invoice line (XRechnung Extension)",
    ubl: "cac:InvoiceLine/cac:SubInvoiceLine",
    cii: `${LINE_CII} with ram:AssociatedDocumentLineDocument/ram:ParentLineID`,
  },
  "BG-DEX-09": {
    de: "Zahlung durch Dritte (XRechnung-Extension)",
    en: "Third party payment (XRechnung Extension)",
    ubl: "cac:PrepaidPayment",
    cii: "see XRechnung Extension specification, BG-DEX-09",
  },
};
