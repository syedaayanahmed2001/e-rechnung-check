"""Live providers for `record` (Groq free tier, local Ollama) and the recordings store.

Request shapes mirror the web app's TypeScript providers (src/lib/convert/providers.ts): the same
models, the same system prompt (schema/extraction-prompt.md) and the same JSON Schema
(schema/invoice-extraction.schema.json). Live calls happen only in `record`. `run` (CI) replays
recordings and has the network blocked.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import httpx

from .paths import PROMPT_FILE, RECORDINGS, SCHEMA_FILE

MODELS = {
    "groq": {"text": "openai/gpt-oss-120b", "vision": "qwen/qwen3.8-27b"},
    "ollama": {"text": "qwen3:4b", "vision": "granite3.2-vision:2b"},
}


def user_content(text: str, repair: tuple[str, str] | None = None) -> str:
    base = f"Invoice text:\n<<<\n{text}\n>>>"
    if not repair:
        return base
    previous, errors = repair
    return (
        f"{base}\n\nYour previous answer was not valid against the schema:\n{errors}\n\n"
        f"Previous answer:\n{previous}\n\nReturn a corrected JSON object."
    )


def groq_body(text: str, schema: dict, system: str, repair: tuple[str, str] | None = None) -> dict:
    return {
        "model": MODELS["groq"]["text"],
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content(text, repair)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "invoice_extraction", "strict": True, "schema": schema},
        },
    }


def ollama_body(text: str, schema: dict, system: str, repair: tuple[str, str] | None = None) -> dict:
    return {
        "model": MODELS["ollama"]["text"],
        "stream": False,
        "format": schema,
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content(text, repair)},
        ],
    }


@dataclass
class Completion:
    raw: str
    model: str
    latency_ms: int


Complete = Callable[[str, tuple[str, str] | None], Completion]


def groq_completer(api_key: str, client: httpx.Client | None = None) -> Complete:
    http = client or httpx.Client(timeout=120)
    schema, system = load_contract()

    def complete(text: str, repair: tuple[str, str] | None) -> Completion:
        t0 = time.perf_counter()
        res = http.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"authorization": f"Bearer {api_key}"},
            json=groq_body(text, schema, system, repair),
        )
        res.raise_for_status()
        body = res.json()
        return Completion(
            raw=body["choices"][0]["message"]["content"],
            model=body.get("model", MODELS["groq"]["text"]),
            latency_ms=round((time.perf_counter() - t0) * 1000),
        )

    return complete


def ollama_completer(
    base_url: str = "http://127.0.0.1:11434", client: httpx.Client | None = None
) -> Complete:
    http = client or httpx.Client(timeout=600)
    schema, system = load_contract()

    def complete(text: str, repair: tuple[str, str] | None) -> Completion:
        t0 = time.perf_counter()
        res = http.post(f"{base_url}/api/chat", json=ollama_body(text, schema, system, repair))
        res.raise_for_status()
        body = res.json()
        return Completion(
            raw=body["message"]["content"],
            model=body.get("model", MODELS["ollama"]["text"]),
            latency_ms=round((time.perf_counter() - t0) * 1000),
        )

    return complete


def load_contract() -> tuple[dict, str]:
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8")), PROMPT_FILE.read_text(encoding="utf-8")


@dataclass
class Attempt:
    raw: str
    ok: bool
    errors: str | None
    latency_ms: int


@dataclass
class Recording:
    """One recorded extraction run for one document (the shape the web app replays)."""

    documentSha256: str
    provider: str
    model: str
    recordedAt: str
    latencyMs: int
    raw: str
    file: str
    attempts: list[Attempt] = field(default_factory=list)

    @staticmethod
    def now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()


def slug(model: str) -> str:
    return model.replace("/", "_").replace(":", "_")


def recording_path(provider: str, model: str, sha256: str, root: Path = RECORDINGS) -> Path:
    return root / provider / slug(model) / f"{sha256}.json"


def save_recording(rec: Recording, root: Path = RECORDINGS) -> Path:
    path = recording_path(rec.provider, rec.model, rec.documentSha256, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(rec), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_recordings(root: Path = RECORDINGS) -> list[Recording]:
    out: list[Recording] = []
    for path in sorted(root.glob("*/*/*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["attempts"] = [Attempt(**a) for a in data.get("attempts", [])]
        out.append(Recording(**data))
    return out


PRIORITY = {"groq": 0, "ollama": 1, "baseline": 2}


def write_index(root: Path = RECORDINGS) -> Path:
    """index.json for the web app's recorded provider: the best recording per document."""
    best: dict[str, Recording] = {}
    for rec in load_recordings(root):
        cur = best.get(rec.documentSha256)
        if cur is None or PRIORITY.get(rec.provider, 9) < PRIORITY.get(cur.provider, 9):
            best[rec.documentSha256] = rec
    rows = [
        {
            k: v
            for k, v in asdict(r).items()
            if k in {"documentSha256", "provider", "model", "recordedAt", "latencyMs", "raw"}
        }
        for r in sorted(best.values(), key=lambda r: r.file)
    ]
    path = root / "index.json"
    path.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
