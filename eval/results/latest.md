| Corpus | Provider | Model | Docs | Field accuracy (all) | Field accuracy (fields present) | Hallucinated fields | Schema valid (1st / after repair) | Latency p50 / p95 |
|---|---|---|---|---|---|---|---|---|
| synthetic | baseline | regex-baseline-v1 | 12 | 100.0 % (330 fields) | 100.0 % | 0 | 100.0 % / 100.0 % | 0 ms / 0 ms |
| synthetic | ollama | qwen3:4b | 0 | not recorded | – | – | – | – |
| synthetic | groq | openai/gpt-oss-120b | 0 | not recorded | – | – | – | – |

"not recorded" means no real outputs of that model exist in `fixtures/recordings/` yet. Record them with `python -m erc_eval record --provider groq` (needs `GROQ_API_KEY`) or `--provider ollama` (needs a local Ollama with the model pulled). Numbers are never estimated.
