"""Field-level scoring of one extraction against the ground truth."""

from __future__ import annotations

from dataclasses import dataclass

from .models import InvoiceExtraction
from .normalise import FieldType, iban_valid, normalise
from .truth import GroundTruth

#: Scored header fields and their comparison type. Fixed list: results stay comparable over time.
HEADER_FIELDS: dict[str, FieldType] = {
    "invoiceNumber": FieldType.TEXT,
    "issueDate": FieldType.DATE,
    "deliveryDate": FieldType.DATE,
    "dueDate": FieldType.DATE,
    "currency": FieldType.CODE,
    "buyerReference": FieldType.TEXT,
    "seller.name": FieldType.TEXT,
    "seller.street": FieldType.TEXT,
    "seller.postcode": FieldType.TEXT,
    "seller.city": FieldType.TEXT,
    "seller.vatId": FieldType.VATID,
    "seller.email": FieldType.TEXT,
    "buyer.name": FieldType.TEXT,
    "buyer.postcode": FieldType.TEXT,
    "buyer.city": FieldType.TEXT,
    "iban": FieldType.IBAN,
    "totals.netTotal": FieldType.AMOUNT,
    "totals.vatTotal": FieldType.AMOUNT,
    "totals.grossTotal": FieldType.AMOUNT,
    "totals.amountDue": FieldType.AMOUNT,
}


@dataclass(frozen=True)
class FieldResult:
    field: str
    kind: FieldType
    expected: object
    predicted: object
    correct: bool
    #: Truth empty but a value was predicted.
    hallucinated: bool


def _get(x: InvoiceExtraction, path: str) -> object:
    obj: object = x
    for part in path.split("."):
        obj = getattr(obj, part)
    return obj.value  # type: ignore[attr-defined]


def _compare(field: str, kind: FieldType, expected_raw: object, predicted_raw: object) -> FieldResult:
    expected = normalise(kind, expected_raw)
    predicted = normalise(kind, predicted_raw)
    return FieldResult(
        field=field,
        kind=kind,
        expected=expected,
        predicted=predicted,
        correct=expected == predicted,
        hallucinated=expected is None and predicted is not None,
    )


def score(prediction: InvoiceExtraction, truth: GroundTruth) -> list[FieldResult]:
    results = [
        _compare(f, kind, truth.fields.get(f), _get(prediction, f)) for f, kind in HEADER_FIELDS.items()
    ]
    results.append(
        FieldResult(
            field="lines.count",
            kind=FieldType.CODE,
            expected=len(truth.lines),
            predicted=len(prediction.lines),
            correct=len(truth.lines) == len(prediction.lines),
            hallucinated=False,
        )
    )
    for i, t in enumerate(truth.lines):
        p = prediction.lines[i] if i < len(prediction.lines) else None
        results.append(
            _compare("lines.netAmount", FieldType.AMOUNT, t.net_amount, p.netAmount.value if p else None)
        )
        results.append(
            _compare("lines.description", FieldType.TEXT, t.description, p.description.value if p else None)
        )
    return results


def iban_is_valid(prediction: InvoiceExtraction) -> bool | None:
    value = normalise(FieldType.IBAN, prediction.iban.value)
    return None if value is None else iban_valid(str(value))
