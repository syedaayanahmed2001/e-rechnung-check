"""Command line: `python -m erc_eval {record,run,index}`.

record --provider baseline|groq|ollama [--corpus synthetic|plain|external|all]
    Produces recordings in fixtures/recordings/ (live calls only for groq/ollama).
run [--corpus synthetic|external|all] [--out eval/results]
    Replays recordings with the network blocked and writes latest.md / latest.json.
index
    Rebuilds fixtures/recordings/index.json (best recording per document, used by the web demo).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .netguard import no_network
from .paths import EXTERNAL_FX, LOCAL_RECORDINGS, RECORDINGS, RESULTS, SYNTHETIC_HYBRID, SYNTHETIC_PLAIN
from .providers import groq_completer, ollama_completer, write_index
from .report import markdown
from .run import evaluate, record, results_json, summarise


def corpus_files(name: str) -> dict[str, list[Path]]:
    sets = {
        "synthetic": sorted(SYNTHETIC_HYBRID.glob("*.pdf")),
        "plain": sorted(SYNTHETIC_PLAIN.glob("*.pdf")),
        "external": sorted(EXTERNAL_FX.glob("*.pdf")) if EXTERNAL_FX.exists() else [],
    }
    if name == "all":
        return sets
    return {name: sets[name]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="erc_eval")
    sub = parser.add_subparsers(dest="cmd", required=True)
    rec = sub.add_parser("record")
    rec.add_argument("--provider", choices=["baseline", "groq", "ollama"], required=True)
    rec.add_argument("--corpus", default="all", choices=["synthetic", "plain", "external", "all"])
    run = sub.add_parser("run")
    run.add_argument("--corpus", default="synthetic", choices=["synthetic", "external", "all"])
    run.add_argument("--out", type=Path, default=RESULTS)
    sub.add_parser("index")
    args = parser.parse_args(argv)

    if args.cmd == "record":
        complete = None
        if args.provider == "groq":
            key = os.environ.get("GROQ_API_KEY")
            if not key:
                print("GROQ_API_KEY is not set", file=sys.stderr)
                return 2
            complete = groq_completer(key)
        elif args.provider == "ollama":
            complete = ollama_completer(os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"))
        for name, files in corpus_files(args.corpus).items():
            # Fetched third-party documents: recordings stay in the local cache (not committed).
            paths = record(
                files, args.provider, complete, LOCAL_RECORDINGS if name == "external" else RECORDINGS
            )
            print(f"{name}: {len(paths)} recordings ({args.provider})")
        print(f"index: {write_index()}")
        return 0

    if args.cmd == "index":
        print(write_index())
        return 0

    with no_network():
        rows, docs = [], []
        for name, files in corpus_files(args.corpus).items():
            if name == "plain":
                continue
            d = evaluate(files)
            docs += d
            rows += summarise(d, name)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "latest.json").write_text(results_json(rows, docs), encoding="utf-8")
    md = markdown(rows)
    (args.out / "latest.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
