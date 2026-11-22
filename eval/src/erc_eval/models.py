"""Pydantic mirror of schema/invoice-extraction.schema.json (generated from the app's Zod schema).

The JSON Schema is the contract. ``tests/test_models.py`` fails if these models drift from it.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextLeaf(_Closed):
    value: str | None
    source: str | None


class AmountLeaf(_Closed):
    value: float | None
    source: str | None


class DateLeaf(_Closed):
    value: str | None = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    source: str | None


class Party(_Closed):
    name: TextLeaf
    street: TextLeaf
    postcode: TextLeaf
    city: TextLeaf
    country: TextLeaf
    vatId: TextLeaf
    taxNumber: TextLeaf
    email: TextLeaf
    phone: TextLeaf
    contactName: TextLeaf


class Line(_Closed):
    description: TextLeaf
    quantity: AmountLeaf
    unit: TextLeaf
    unitPrice: AmountLeaf
    netAmount: AmountLeaf
    vatRate: AmountLeaf


class Totals(_Closed):
    netTotal: AmountLeaf
    vatTotal: AmountLeaf
    grossTotal: AmountLeaf
    amountDue: AmountLeaf


class InvoiceExtraction(_Closed):
    invoiceNumber: TextLeaf
    issueDate: DateLeaf
    deliveryDate: DateLeaf
    dueDate: DateLeaf
    currency: TextLeaf
    buyerReference: TextLeaf
    seller: Party
    buyer: Party
    iban: TextLeaf
    bic: TextLeaf
    paymentTerms: TextLeaf
    lines: list[Line]
    totals: Totals
