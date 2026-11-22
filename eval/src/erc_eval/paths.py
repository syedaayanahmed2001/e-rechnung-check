"""Repository locations shared by the eval modules."""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCHEMA_FILE = REPO / "schema" / "invoice-extraction.schema.json"
PROMPT_FILE = REPO / "schema" / "extraction-prompt.md"
RECORDINGS = REPO / "fixtures" / "recordings"
#: Recordings of fetched third-party documents contain excerpts of them; kept local, never committed.
LOCAL_RECORDINGS = REPO / ".cache" / "recordings"
SYNTHETIC_HYBRID = REPO / "corpus" / "synthetic" / "hybrid"
SYNTHETIC_PLAIN = REPO / "corpus" / "synthetic" / "plain"
EXTERNAL_FX = REPO / ".cache" / "external" / "zugferd-corpus" / "XML-Rechnung" / "FX"
RESULTS = REPO / "eval" / "results"
