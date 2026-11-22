"""Baseline extractor: deterministic regular expressions, no AI.

It exists to (1) give the eval a floor every model has to beat, (2) let the demo and CI run
without any model, and (3) sanity-check the scoring. It was written against the synthetic layouts,
so its score there is a template-matching upper bound. Its score on unseen layouts (the external
corpus) shows how brittle templates are.
"""

from __future__ import annotations

import re

from .models import InvoiceExtraction
from .normalise import amount, date

_DATE = r"(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})"
_MONEY = r"(?:EUR\s?)?(-?[\d.,]+\d)(?:\s?€)?"


def _leaf(value: object, source: str | None) -> dict[str, object]:
    return {"value": value, "source": source}


def _empty() -> dict[str, object]:
    return _leaf(None, None)


def _find(pattern: str, text: str, flags: int = re.IGNORECASE | re.MULTILINE) -> re.Match[str] | None:
    return re.search(pattern, text, flags)


def _text_field(pattern: str, text: str) -> dict[str, object]:
    m = _find(pattern, text)
    return _leaf(m.group(1).strip(), m.group(0).strip()) if m else _empty()


def _date_field(label: str, text: str) -> dict[str, object]:
    m = _find(rf"(?:{label})\s*:?\s*{_DATE}", text)
    return _leaf(date(m.group(1)), m.group(0).strip()) if m else _empty()


def _amount_field(label: str, text: str) -> dict[str, object]:
    m = _find(rf"^(?:{label})\s*:?\s*{_MONEY}\s*$", text)
    if not m:
        return _empty()
    value = amount(m.group(1))
    return _leaf(float(value) if value is not None else None, m.group(0).strip())


def _party(lines: list[str], email: str | None = None, phone: str | None = None, contact: str | None = None):
    empty = {k: _empty() for k in ("vatId", "taxNumber", "email", "phone", "contactName")}
    if not lines:
        return {k: _empty() for k in ("name", "street", "postcode", "city", "country")} | empty
    name = lines[0]
    street = postcode = city = None
    rest = " , ".join(lines[1:])
    m = re.search(r"([^,·•]+?)\s*[,·•]\s*(\d{5})\s+([^,·•]+)$", rest) or re.search(
        r"^(.+?)\s*,\s*(\d{5})\s+(.+)$", rest
    )
    if m:
        street, postcode, city = m.group(1).strip(" ,"), m.group(2), m.group(3).strip()
    return {
        "name": _leaf(name, name),
        "street": _leaf(street, street),
        "postcode": _leaf(postcode, postcode),
        "city": _leaf(city, city),
        "country": _leaf("DE", None) if postcode else _empty(),
        "vatId": _empty(),
        "taxNumber": _empty(),
        "email": _leaf(email, email) if email else _empty(),
        "phone": _leaf(phone, phone) if phone else _empty(),
        "contactName": _leaf(contact, contact) if contact else _empty(),
    }


_LINE = re.compile(
    r"^(\d+)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\S+\.?)\s+(?:EUR\s?)?([\d.,]+\d)(?:\s?€)?\s+(\d+(?:[.,]\d+)?)\s?%\s+"
    r"(?:EUR\s?)?([\d.,]+\d)(?:\s?€)?$"
)


def extract(text: str) -> InvoiceExtraction:
    rows = [r.strip() for r in text.splitlines() if r.strip()]

    # Parties: seller header, then the buyer address block.
    seller_lines: list[str] = []
    buyer_lines: list[str] = []
    if rows and rows[0].upper() == "INVOICE":
        seller_lines = [p.strip() for p in re.split(r"\s[·•]\s", rows[1])] if len(rows) > 1 else []
        seller_lines = [seller_lines[0], " , ".join(seller_lines[1:])] if seller_lines else []
        if "Bill to:" in rows:
            i = rows.index("Bill to:")
            buyer_lines = rows[i + 1 : i + 4]
    elif len(rows) >= 5:
        seller_lines = rows[0:2]
        buyer_lines = rows[2:5]

    contact = _find(
        r"(?:Ansprechpartner\w*(?:/Ansprechpartner)?|Contact)\s*:\s*(.+?)\s*[·•]\s*Tel\.\s*(.+?)\s*[·•]\s*(\S+@\S+)",
        text,
    )
    buyer_mail = _find(r"(?:E-Mail Rechnungsempfang|Customer e-mail)\s*:\s*(\S+@\S+)", text)
    seller = _party(
        seller_lines,
        email=contact.group(3) if contact else None,
        phone=contact.group(2) if contact else None,
        contact=contact.group(1) if contact else None,
    )
    seller["vatId"] = _text_field(r"(?:USt-?IdNr\.?|VAT ID)\s*:?\s*([A-Z]{2}\s?[\d ]{8,12}\d)", text)
    seller["taxNumber"] = _text_field(r"Steuernummer\s*:?\s*(\d{2,3}/\d{3}/\d{4,5})", text)
    buyer = _party(buyer_lines, email=buyer_mail.group(1) if buyer_mail else None)

    lines = []
    for r in rows:
        m = _LINE.match(r)
        if not m:
            continue
        q, p, net, rate = (amount(m.group(g)) for g in (3, 5, 7, 6))
        lines.append(
            {
                "description": _leaf(m.group(2), m.group(2)),
                "quantity": _leaf(float(q) if q is not None else None, m.group(3)),
                "unit": _leaf(m.group(4), m.group(4)),
                "unitPrice": _leaf(float(p) if p is not None else None, m.group(5)),
                "netAmount": _leaf(float(net) if net is not None else None, m.group(7)),
                "vatRate": _leaf(float(rate) if rate is not None else None, f"{m.group(6)} %"),
            }
        )

    iban = _find(r"IBAN\s*:?\s*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)", text)
    data = {
        "invoiceNumber": _text_field(
            r"(?:Rechnungsnummer|Rechnung Nr\.?|Rechnungs-Nr\.?|Invoice no\.?)\s*:?\s*([A-Z0-9][\w\-/]*\d)",
            text,
        ),
        "issueDate": _date_field(r"Rechnungsdatum|Invoice date|^Datum", text),
        "deliveryDate": _date_field(r"Leistungsdatum|Lieferdatum|Lieferung/Leistung am|Delivery date", text),
        "dueDate": _date_field(r"Fällig am|Due date|zahlbar bis", text),
        "currency": _leaf("EUR", "€" if "€" in text else "EUR")
        if ("€" in text or "EUR" in text)
        else _empty(),
        "buyerReference": _text_field(
            r"(?:Ihre Referenz|Leitweg-ID / Bestellnummer|Your reference|Leitweg-ID)\s*:\s*(.+)$", text
        ),
        "seller": seller,
        "buyer": buyer,
        "iban": _leaf(iban.group(1).strip(), iban.group(0).strip()) if iban else _empty(),
        "bic": _text_field(r"BIC\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)", text),
        "paymentTerms": _text_field(r"(?:Zahlungsbedingungen|Payment terms)\s*:\s*(.+)$", text),
        "lines": lines,
        "totals": {
            "netTotal": _amount_field(r"Summe netto|Net total|Nettobetrag", text),
            "vatTotal": _amount_field(r"Umsatzsteuer gesamt|Total VAT", text),
            "grossTotal": _amount_field(r"Rechnungsbetrag brutto|Total|Gesamtbetrag", text),
            "amountDue": _amount_field(r"Zahlbetrag|Amount due", text),
        },
    }
    return InvoiceExtraction.model_validate(data)
