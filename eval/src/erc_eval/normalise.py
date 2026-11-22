"""Field-type normalisation for scoring. Two values match when their normal forms are equal."""

from __future__ import annotations

import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from enum import StrEnum


class FieldType(StrEnum):
    TEXT = "text"
    AMOUNT = "amount"
    DATE = "date"
    VATID = "vatid"
    IBAN = "iban"
    CODE = "code"


_DE_DATE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$")
_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def amount(value: object) -> Decimal | None:
    """To the cent. Accepts numbers, '1234.56', '1.234,56', '1234,56'."""
    if value is None or value == "":
        return None
    if isinstance(value, int | float | Decimal):
        d = Decimal(str(value))
    else:
        s = str(value).strip().replace(" ", "").replace("€", "").replace("EUR", "")
        s = s.replace(".", "").replace(",", ".") if re.search(r",\d{1,4}$", s) else s.replace(",", "")
        try:
            d = Decimal(s)
        except InvalidOperation:
            return None
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def date(value: object) -> str | None:
    if value is None or value == "":
        return None
    s = str(value).strip()
    if m := _ISO_DATE.match(s):
        return s
    if m := _DE_DATE.match(s):
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s


def vat_id(value: object) -> str | None:
    if value is None or value == "":
        return None
    return re.sub(r"[\s.\-]", "", str(value)).upper()


def iban(value: object) -> str | None:
    if value is None or value == "":
        return None
    return re.sub(r"\s", "", str(value)).upper()


def iban_valid(value: str | None) -> bool:
    """ISO 13616 / ISO 7064 mod 97-10 check."""
    if not value or not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", value):
        return False
    rearranged = value[4:] + value[:4]
    digits = "".join(str(int(c, 36)) for c in rearranged)
    return int(digits) % 97 == 1


def text(value: object) -> str | None:
    if value is None:
        return None
    s = unicodedata.normalize("NFKC", str(value)).casefold()
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def code(value: object) -> str | None:
    if value is None or value == "":
        return None
    return str(value).strip().upper()


NORMALISERS = {
    FieldType.TEXT: text,
    FieldType.AMOUNT: amount,
    FieldType.DATE: date,
    FieldType.VATID: vat_id,
    FieldType.IBAN: iban,
    FieldType.CODE: code,
}


def normalise(kind: FieldType, value: object) -> object:
    return NORMALISERS[kind](value)
