"""Markdown report of an eval run."""

from __future__ import annotations

EXPECTED = [
    ("baseline", "regex-baseline-v1", "no AI; template rules written against the synthetic layouts"),
    ("ollama", "qwen3:4b", "private mode, small local model"),
    ("groq", "openai/gpt-oss-120b", "demo mode, Groq free tier"),
]


def _fmt(v: object, suffix: str = "") -> str:
    return "–" if v is None else f"{v}{suffix}"


def markdown(rows: list[dict]) -> str:
    out = [
        "| Corpus | Provider | Model | Docs | Field accuracy (all) | Field accuracy (fields present) "
        "| Hallucinated fields | Schema valid (1st / after repair) | Latency p50 / p95 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    corpora = sorted({r["corpus"] for r in rows}) or ["synthetic"]
    for corpus in corpora:
        for provider, model, _note in EXPECTED:
            hit = next((r for r in rows if r["corpus"] == corpus and r["provider"] == provider), None)
            if hit is None:
                out.append(f"| {corpus} | {provider} | {model} | 0 | not recorded | – | – | – | – |")
                continue
            out.append(
                f"| {corpus} | {provider} | {hit['model']} | {hit['documents']} | "
                f"{_fmt(hit['field_accuracy_pct'], ' %')} ({hit['fields_scored']} fields) | "
                f"{_fmt(hit['present_field_accuracy_pct'], ' %')} | {hit['hallucinated_fields']} | "
                f"{_fmt(hit['schema_valid_first_pct'], ' %')} / "
                f"{_fmt(hit['schema_valid_final_pct'], ' %')} | "
                f"{_fmt(hit['latency_p50_ms'], ' ms')} / {_fmt(hit['latency_p95_ms'], ' ms')} |"
            )
    out.append("")
    out.append(
        '"not recorded" means no real outputs of that model exist in `fixtures/recordings/` yet. '
        "Record them with `python -m erc_eval record --provider groq` (needs `GROQ_API_KEY`) or "
        "`--provider ollama` (needs a local Ollama with the model pulled). Numbers are never estimated."
    )
    worst = []
    for r in rows:
        weak = [(k, v) for k, v in r["per_field_accuracy_pct"].items() if v is not None and v < 100]
        if weak:
            worst.append(
                f"- {r['corpus']} / {r['provider']}: "
                + ", ".join(f"{k} {v} %" for k, v in sorted(weak, key=lambda x: x[1]))
            )
    if worst:
        out += ["", "Fields below 100 %:", *worst]
    return "\n".join(out) + "\n"
