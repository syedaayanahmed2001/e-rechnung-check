"""PDF access: visible text and embedded invoice XML (pypdf)."""

from __future__ import annotations

import hashlib
from pathlib import Path

from pypdf import PdfReader

INVOICE_FILE_NAMES = ("factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml", "zugferd_invoice.xml")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def page_text(path: Path) -> str:
    """Text of all pages, joined with blank lines (layout mode off: reading order as stored)."""
    reader = PdfReader(str(path))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()


def embedded_invoice_xml(path: Path) -> bytes | None:
    """The embedded invoice XML (ZUGFeRD / Factur-X / XRechnung file names), or None."""
    reader = PdfReader(str(path))
    attachments = {name.lower(): data for name, data in _attachments(reader)}
    for name in INVOICE_FILE_NAMES:
        if name in attachments:
            return attachments[name]
    return None


def _attachments(reader: PdfReader) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    for name, contents in reader.attachments.items():
        for data in contents:
            out.append((name, data))
    return out
