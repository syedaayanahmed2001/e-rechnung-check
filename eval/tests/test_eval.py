"""Tests for the eval package. Each test name carries the requirement it proves."""

from __future__ import annotations

import json
import socket
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from erc_eval import baseline, normalise
from erc_eval.cli import main
from erc_eval.models import InvoiceExtraction
from erc_eval.netguard import NetworkBlockedError, no_network
from erc_eval.paths import SCHEMA_FILE, SYNTHETIC_HYBRID, SYNTHETIC_PLAIN
from erc_eval.pdf import embedded_invoice_xml, page_text, sha256_file
from erc_eval.providers import MODELS, Recording, groq_body, groq_completer, load_contract, ollama_body
from erc_eval.run import evaluate, parse_raw, record_one, summarise
from erc_eval.score import HEADER_FIELDS, score
from erc_eval.truth import parse_cii

HYBRIDS = sorted(SYNTHETIC_HYBRID.glob("*.pdf"))


# ---- CONV-01 (Python half): the Pydantic model matches the shared JSON Schema ---------------


def _shape(schema: dict) -> object:
    """Structure of a JSON Schema: property names, nesting, and nullability of leaves."""
    if schema.get("type") == "object" or "properties" in schema:
        return {k: _shape(v) for k, v in schema["properties"].items()}
    if schema.get("type") == "array":
        return [_shape(schema["items"])]
    variants = schema.get("anyOf") or [
        {"type": t}
        for t in (schema["type"] if isinstance(schema.get("type"), list) else [schema.get("type")])
    ]
    types = sorted({v.get("type") for v in variants})
    return "|".join(t for t in types if t)


def _pydantic_shape(schema: dict, defs: dict) -> object:
    if "$ref" in schema:
        return _pydantic_shape(defs[schema["$ref"].split("/")[-1]], defs)
    if schema.get("type") == "object":
        return {k: _pydantic_shape(v, defs) for k, v in schema["properties"].items()}
    if schema.get("type") == "array":
        return [_pydantic_shape(schema["items"], defs)]
    variants = schema.get("anyOf") or [schema]
    types = sorted({"number" if v.get("type") in {"number", "integer"} else v.get("type") for v in variants})
    return "|".join(t for t in types if t)


def test_conv01_pydantic_model_matches_shared_json_schema():
    contract = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    generated = InvoiceExtraction.model_json_schema()
    assert _pydantic_shape(generated, generated.get("$defs", {})) == _shape(contract)


def test_conv01_pydantic_rejects_extra_fields_like_the_strict_schema():
    data = json.loads(baseline.extract("").model_dump_json())
    data["unexpected"] = 1
    with pytest.raises(ValueError, match="unexpected"):
        InvoiceExtraction.model_validate(data)


# ---- EVAL-01: ground truth from the embedded XML ---------------------------------------------


def test_eval01_corpus_has_hybrid_pdfs_with_embedded_xml():
    assert len(HYBRIDS) == 12
    for pdf in HYBRIDS:
        assert embedded_invoice_xml(pdf) is not None, pdf.name


def test_eval01_plain_twins_have_no_xml_but_the_same_text():
    for pdf in HYBRIDS:
        plain = SYNTHETIC_PLAIN / pdf.name
        assert embedded_invoice_xml(plain) is None
        assert page_text(plain) == page_text(pdf)


def test_eval01_truth_matches_the_visible_invoice():
    truth = parse_cii(embedded_invoice_xml(HYBRIDS[0]))
    text = page_text(HYBRIDS[0])
    assert truth.fields["invoiceNumber"] in text
    assert truth.fields["seller.name"] in text
    assert truth.fields["currency"] == "EUR"
    assert len(truth.lines) >= 1
    assert all(line.net_amount for line in truth.lines)


def test_eval01_rejects_non_cii_xml():
    with pytest.raises(ValueError, match="not a CII"):
        parse_cii(b"<Invoice xmlns='urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'/>")


# ---- EVAL-02: field-type normalisation --------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "cents"),
    [
        ("1.234,56", "1234.56"),
        ("1234.56", "1234.56"),
        ("EUR 1,234.56", "1234.56"),
        (12.345, "12.35"),
        ("12,5 €", "12.50"),
    ],
)
def test_eval02_amounts_to_the_cent(raw, cents):
    assert normalise.amount(raw) == Decimal(cents)


def test_eval02_dates_iso_german_and_format_102():
    assert normalise.date("03.11.2026") == "2026-11-03"
    assert normalise.date("3.1.2026") == "2026-01-03"
    assert normalise.date("20261103") == "2026-11-03"
    assert normalise.date("2026-11-03") == "2026-11-03"


def test_eval02_vat_ids_ignore_spaces_and_case():
    assert normalise.vat_id("de 123 456 789") == "DE123456789"


def test_eval02_iban_normalised_and_mod97_checked():
    assert normalise.iban("de89 3704 0044 0532 0130 00") == "DE89370400440532013000"
    assert normalise.iban_valid("DE89370400440532013000")
    assert not normalise.iban_valid("DE00370400440532013000")


def test_eval02_text_nfkc_casefold_whitespace():
    assert normalise.text("  Bäckerei   HUBER\tOHG ") == normalise.text("bäckerei huber ohg")
    assert normalise.text("Straße") == normalise.text("STRASSE")  # casefold maps ß to ss


def test_eval02_truth_empty_and_prediction_present_counts_as_hallucination():
    truth = parse_cii(embedded_invoice_xml(HYBRIDS[2]))  # syn-03 has no delivery date
    assert truth.fields["deliveryDate"] is None
    pred = baseline.extract(page_text(HYBRIDS[2]))
    pred.deliveryDate.value = "2026-01-01"
    r = next(f for f in score(pred, truth) if f.field == "deliveryDate")
    assert r.hallucinated
    assert not r.correct


# ---- EVAL-03/04: metrics and report -----------------------------------------------------------


def test_eval03_baseline_scores_every_header_field_on_the_synthetic_corpus():
    results = evaluate(HYBRIDS, [record_one(p, "baseline", None) for p in HYBRIDS])
    assert len(results) == 12
    assert all(len([f for f in d.fields if f.field in HEADER_FIELDS]) == len(HEADER_FIELDS) for d in results)
    row = summarise(results, "synthetic")[0]
    assert row["provider"] == "baseline"
    assert row["schema_valid_final_pct"] == 100.0
    assert set(row) >= {
        "field_accuracy_pct",
        "present_field_accuracy_pct",
        "latency_p50_ms",
        "latency_p95_ms",
        "per_field_accuracy_pct",
    }


def test_eval04_run_writes_markdown_and_json(tmp_path: Path):
    assert main(["run", "--corpus", "synthetic", "--out", str(tmp_path)]) == 0
    md = (tmp_path / "latest.md").read_text(encoding="utf-8")
    data = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
    assert "| synthetic | baseline |" in md
    assert "not recorded" in md  # groq/ollama rows are explicit, never estimated
    assert data["summary"][0]["documents"] == 12


# ---- EVAL-05: recorded mode never touches the network -----------------------------------------


def test_eval05_network_is_blocked_in_recorded_mode():
    with no_network(), pytest.raises(NetworkBlockedError):
        socket.create_connection(("example.com", 443), timeout=1)


def test_eval05_run_command_executes_under_the_guard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    calls = []
    from erc_eval import cli

    real = cli.no_network

    def spy():
        calls.append("guard")
        return real()

    monkeypatch.setattr(cli, "no_network", spy)
    main(["run", "--corpus", "synthetic", "--out", str(tmp_path)])
    assert calls == ["guard"]


# ---- EVAL-06: live recording builds the same requests as the web app ---------------------------


def test_eval06_groq_and_ollama_request_shapes():
    schema, system = load_contract()
    g = groq_body("TEXT", schema, system)
    assert g["model"] == MODELS["groq"]["text"] == "openai/gpt-oss-120b"
    assert g["response_format"]["json_schema"]["strict"] is True
    assert g["messages"][1]["content"].startswith("Invoice text:\n<<<\nTEXT")
    o = ollama_body("TEXT", schema, system)
    assert o["model"] == "qwen3:4b"
    assert o["format"] == schema


def test_eval06_record_with_repair_retry_against_a_mock_transport():
    answers = iter(["{}", baseline.extract(page_text(HYBRIDS[0])).model_dump_json()])
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(
            200, json={"model": "openai/gpt-oss-120b", "choices": [{"message": {"content": next(answers)}}]}
        )

    complete = groq_completer("test-key", httpx.Client(transport=httpx.MockTransport(handler)))
    rec = record_one(HYBRIDS[0], "groq", complete)
    assert [a.ok for a in rec.attempts] == [False, True]
    assert "previous answer was not valid" in seen[1]["messages"][1]["content"]
    assert rec.documentSha256 == sha256_file(HYBRIDS[0])
    assert isinstance(rec, Recording)


def test_eval06_parse_raw_reports_schema_errors():
    data, errors = parse_raw('{"invoiceNumber": 1}')
    assert data is None
    assert errors
    assert "invoiceNumber" in errors


# ---- EVAL-07: corpus -------------------------------------------------------------------------


def test_eval07_committed_recordings_cover_the_synthetic_corpus_only():
    from erc_eval.providers import load_recordings

    recs = load_recordings()
    files = {r.file for r in recs}
    assert files <= {p.name for p in HYBRIDS} | {p.name for p in SYNTHETIC_PLAIN.glob("*.pdf")}
    assert {r.provider for r in recs} <= {"baseline", "groq", "ollama"}
