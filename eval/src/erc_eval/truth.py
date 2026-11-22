"""Ground truth: read the CII XML embedded in a ZUGFeRD / Factur-X PDF into scored fields.

Only CII is needed: ZUGFeRD, Factur-X and XRechnung-in-PDF all embed CII. Parsing uses defusedxml
(no entity expansion, no external resources).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree.ElementTree import Element

from defusedxml.ElementTree import fromstring

NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

A = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement"
D = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery"
S = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement"
SUM = f"{S}/ram:SpecifiedTradeSettlementHeaderMonetarySummation"


@dataclass
class GroundTruthLine:
    description: str | None
    quantity: str | None
    unit_price: str | None
    net_amount: str | None
    vat_rate: str | None


@dataclass
class GroundTruth:
    """Field path (same paths as the extraction schema) -> raw value as written in the XML."""

    fields: dict[str, str | None]
    lines: list[GroundTruthLine] = field(default_factory=list)


def _text(root: Element, path: str) -> str | None:
    el = root.find(path, NS)
    if el is None or el.text is None:
        return None
    value = el.text.strip()
    return value or None


def _date(root: Element, path: str) -> str | None:
    raw = _text(root, path)
    if raw and len(raw) == 8 and raw.isdigit():  # format 102: YYYYMMDD
        return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw


def _tax_id(party: Element | None, scheme: str) -> str | None:
    if party is None:
        return None
    for reg in party.findall("ram:SpecifiedTaxRegistration/ram:ID", NS):
        if reg.get("schemeID") == scheme and reg.text:
            return reg.text.strip()
    return None


def _party(root: Element, path: str, prefix: str) -> dict[str, str | None]:
    p = root.find(path, NS)
    get = (lambda sub: _text(p, sub)) if p is not None else (lambda _sub: None)
    return {
        f"{prefix}.name": get("ram:Name"),
        f"{prefix}.street": get("ram:PostalTradeAddress/ram:LineOne"),
        f"{prefix}.postcode": get("ram:PostalTradeAddress/ram:PostcodeCode"),
        f"{prefix}.city": get("ram:PostalTradeAddress/ram:CityName"),
        f"{prefix}.country": get("ram:PostalTradeAddress/ram:CountryID"),
        f"{prefix}.vatId": _tax_id(p, "VA"),
        f"{prefix}.taxNumber": _tax_id(p, "FC"),
        f"{prefix}.email": get("ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID")
        or get("ram:URIUniversalCommunication/ram:URIID[@schemeID='EM']"),
        f"{prefix}.phone": get(
            "ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber"
        ),
        f"{prefix}.contactName": get("ram:DefinedTradeContact/ram:PersonName"),
    }


def parse_cii(xml: bytes) -> GroundTruth:
    root = fromstring(xml)
    if root.tag != f"{{{NS['rsm']}}}CrossIndustryInvoice":
        raise ValueError("not a CII invoice")
    fields: dict[str, str | None] = {
        "invoiceNumber": _text(root, "rsm:ExchangedDocument/ram:ID"),
        "issueDate": _date(root, "rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString"),
        "deliveryDate": _date(
            root, f"{D}/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString"
        ),
        "dueDate": _date(root, f"{S}/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString"),
        "currency": _text(root, f"{S}/ram:InvoiceCurrencyCode"),
        "buyerReference": _text(root, f"{A}/ram:BuyerReference"),
        "iban": _text(
            root,
            f"{S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID",
        ),
        "bic": _text(
            root,
            f"{S}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID",
        ),
        "totals.netTotal": _text(root, f"{SUM}/ram:TaxBasisTotalAmount"),
        "totals.vatTotal": _text(root, f"{SUM}/ram:TaxTotalAmount"),
        "totals.grossTotal": _text(root, f"{SUM}/ram:GrandTotalAmount"),
        "totals.amountDue": _text(root, f"{SUM}/ram:DuePayableAmount"),
        **_party(root, f"{A}/ram:SellerTradeParty", "seller"),
        **_party(root, f"{A}/ram:BuyerTradeParty", "buyer"),
    }
    lines = [
        GroundTruthLine(
            description=_text(li, "ram:SpecifiedTradeProduct/ram:Name"),
            quantity=_text(li, "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity"),
            unit_price=_text(
                li, "ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount"
            ),
            net_amount=_text(
                li,
                "ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount",
            ),
            vat_rate=_text(
                li, "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:RateApplicablePercent"
            ),
        )
        for li in root.findall("rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem", NS)
    ]
    return GroundTruth(fields=fields, lines=lines)
