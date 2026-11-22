"""Recording (live or baseline) and evaluation (replay only)."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

from pydantic import ValidationError

from . import baseline
from .models import InvoiceExtraction
from .paths import LOCAL_RECORDINGS, RECORDINGS
from .pdf import embedded_invoice_xml, page_text, sha256_file
from .providers import Attempt, Complete, Recording, load_recordings, save_recording
from .score import FieldResult, iban_is_valid, score
from .truth import parse_cii


def parse_raw(raw: str) -> tuple[InvoiceExtraction | None, str | None]:
    text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return InvoiceExtraction.model_validate_json(text), None
    except ValidationError as e:
        return None, "\n".join(
            f"- {'.'.join(map(str, err['loc'])) or '(root)'}: {err['msg']}" for err in e.errors()[:30]
        )


def record_one(pdf: Path, provider: str, complete: Complete | None) -> Recording:
    """Runs one extraction exactly like the web app: one try plus at most one repair retry."""
    text = page_text(pdf)
    attempts: list[Attempt] = []
    model = "regex-baseline-v1"
    if provider == "baseline":
        raw = baseline.extract(text).model_dump_json()
        attempts.append(Attempt(raw=raw, ok=True, errors=None, latency_ms=0))
    else:
        assert complete is not None
        for _ in range(2):
            prev = attempts[-1] if attempts else None
            c = complete(text, (prev.raw, prev.errors or "") if prev else None)
            model = c.model
            parsed, errors = parse_raw(c.raw)
            attempts.append(Attempt(raw=c.raw, ok=parsed is not None, errors=errors, latency_ms=c.latency_ms))
            if parsed is not None:
                break
    return Recording(
        documentSha256=sha256_file(pdf),
        provider=provider,
        model=model,
        recordedAt=Recording.now(),
        latencyMs=sum(a.latency_ms for a in attempts),
        raw=attempts[-1].raw,
        file=pdf.name,
        attempts=attempts,
    )


def record(pdfs: list[Path], provider: str, complete: Complete | None, root: Path = RECORDINGS) -> list[Path]:
    return [save_recording(record_one(p, provider, complete), root) for p in pdfs]


@dataclass
class DocResult:
    file: str
    provider: str
    model: str
    schema_valid_first: bool
    schema_valid_final: bool
    attempts: int
    latency_ms: int
    iban_valid: bool | None
    fields: list[FieldResult]


def evaluate(pdfs: list[Path], recordings: list[Recording] | None = None) -> list[DocResult]:
    """Scores every recording that belongs to one of `pdfs` against the PDF's embedded XML."""
    recs = recordings if recordings is not None else load_recordings() + load_recordings(LOCAL_RECORDINGS)
    by_sha: dict[str, list[Recording]] = defaultdict(list)
    for r in recs:
        by_sha[r.documentSha256].append(r)
    out: list[DocResult] = []
    for pdf in pdfs:
        xml = embedded_invoice_xml(pdf)
        if xml is None:
            continue
        truth = parse_cii(xml)
        for rec in by_sha.get(sha256_file(pdf), []):
            prediction, _ = parse_raw(rec.raw)
            first_ok = rec.attempts[0].ok if rec.attempts else prediction is not None
            out.append(
                DocResult(
                    file=pdf.name,
                    provider=rec.provider,
                    model=rec.model,
                    schema_valid_first=first_ok,
                    schema_valid_final=prediction is not None,
                    attempts=len(rec.attempts) or 1,
                    latency_ms=rec.latencyMs,
                    iban_valid=iban_is_valid(prediction) if prediction else None,
                    fields=score(prediction, truth) if prediction else [],
                )
            )
    return out


def _pct(n: int, d: int) -> float | None:
    return round(100 * n / d, 1) if d else None


def _p(values: list[int], q: float) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return round(statistics.quantiles(values, n=100, method="inclusive")[int(q) - 1])


def summarise(results: list[DocResult], corpus: str) -> list[dict]:
    groups: dict[tuple[str, str], list[DocResult]] = defaultdict(list)
    for r in results:
        groups[(r.provider, r.model)].append(r)
    rows = []
    for (provider, model), docs in sorted(groups.items()):
        fields = [f for d in docs for f in d.fields]
        per_field: dict[str, list[bool]] = defaultdict(list)
        for f in fields:
            per_field[f.field].append(f.correct)
        rows.append(
            {
                "corpus": corpus,
                "provider": provider,
                "model": model,
                "documents": len(docs),
                "field_accuracy_pct": _pct(sum(f.correct for f in fields), len(fields)),
                "fields_scored": len(fields),
                # Only fields the invoice actually has: empty-and-empty agreements excluded.
                "present_field_accuracy_pct": _pct(
                    sum(f.correct for f in fields if f.expected is not None),
                    sum(f.expected is not None for f in fields),
                ),
                "hallucinated_fields": sum(f.hallucinated for f in fields),
                "schema_valid_first_pct": _pct(sum(d.schema_valid_first for d in docs), len(docs)),
                "schema_valid_final_pct": _pct(sum(d.schema_valid_final for d in docs), len(docs)),
                "latency_p50_ms": _p([d.latency_ms for d in docs], 50),
                "latency_p95_ms": _p([d.latency_ms for d in docs], 95),
                "per_field_accuracy_pct": {k: _pct(sum(v), len(v)) for k, v in sorted(per_field.items())},
            }
        )
    return rows


def results_json(rows: list[dict], docs: list[DocResult]) -> str:
    return (
        json.dumps(
            {
                "summary": rows,
                "documents": [
                    {
                        **{k: v for k, v in asdict(d).items() if k != "fields"},
                        "wrong_fields": [
                            {"field": f.field, "expected": str(f.expected), "predicted": str(f.predicted)}
                            for f in d.fields
                            if not f.correct
                        ],
                    }
                    for d in docs
                ],
            },
            indent=2,
            ensure_ascii=False,
            default=str,
        )
        + "\n"
    )
