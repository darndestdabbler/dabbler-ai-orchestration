# AI Router — Manager Report

Period: **2026-04-25** to **2026-04-30**
Generated: 2026-05-04

## Headline

- **Total routed calls**: 990
- **Total spend**: $63.4785
- **Opus-only baseline** (hypothetical): $235.8678 (at $15.00 in / $75.00 out per 1M tokens)
- **Ratio of actual to Opus baseline**: 26.9% (**73.1% savings** from tiered routing)
- **Verifier fallback rate**: 0.0% (223 verify calls, no fallbacks)

## Per-task-type summary

| Task type | Calls | Primary model | Avg $/call | Esc % | Rej % | Retry % | Unreliability |
|---|---:|---|---:|---:|---:|---:|---:|
| `session-verification` | 201 | `gpt-5-4` | $0.1463 | 0.0% | — | — | 0.0% |
| `analysis` | 226 | `gemini-pro` | $0.0590 | 0.0% | — | — | 0.0% |
| `documentation` | 504 | `gemini-pro` | $0.0209 | 0.0% | 100.0% | 0.0% | 33.3% |
| `architecture` | 16 | `opus` | $0.4372 | 0.0% | 100.0% | 0.0% | 33.3% |
| `planning` | 3 ⚠️ | `opus` | $0.7184 | 0.0% | — | — | n=3, too few |
| `code-review` | 14 | `sonnet` | $0.0602 | 0.0% | 28.6% | 0.0% | 9.5% |
| `test-generation` | 7 | `gemini-pro` | $0.0179 | 0.0% | — | — | 0.0% |
| `schema-validation` | 3 ⚠️ | `gemini-pro` | $0.0148 | 0.0% | — | — | n=3, too few |
| `summarization` | 16 | `gemini-flash` | $0.0005 | 0.0% | — | — | 0.0% |

_Unreliability = mean of escalation rate, verifier rejection rate (ISSUES_FOUND verdicts), and retry rate (tiebreaker / verify ratio). Cells with fewer than 5 calls are flagged rather than rated._

## Outliers

### Top 3 most expensive individual calls

| Rank | Cost | Model | Task type | Session set | Timestamp |
|---:|---:|---|---|---|---|
| 1 | $1.8674 | `opus` | `architecture` | …session-sets/access-metadata-extraction | 2026-04-26T03:49:08 |
| 2 | $1.4413 | `opus` | `planning` | …session-sets/accessexportertemp1-import | 2026-04-25T15:08:03 |
| 3 | $1.4363 | `opus` | `session-verification` | docs/session-sets/workflow-package-pilot | 2026-04-30T11:39:19 |

### Top 3 task types by unreliability (min 5 calls)

| Rank | Task type | Unreliability | Calls | Esc % | Rej % | Retry % |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `documentation` | 33.3% | 504 | 0.0% | 100.0% | 0.0% |
| 2 | `architecture` | 33.3% | 16 | 0.0% | 100.0% | 0.0% |
| 3 | `code-review` | 9.5% | 14 | 0.0% | 28.6% | 0.0% |

## Verifier findings & adjudication

- **Verifier findings (ISSUES_FOUND)**: 218
- **Adopted without challenge**: 215 (98.6%)
- **Challenged by orchestrator**: 3 (1.4%)
    - Accept finding after challenge: 0
    - Accept dismissal: 0
    - Reverify with reshaped context: 0
    - Second opinion from different provider: 3

### Challenge causes

| Cause | Count |
|---|---:|
| `context-gap` | 2 |
| `genuine-split` | 1 |

## Auto-generated action items

- `documentation` — unreliability 33% (verifier rejection at 100%). Consider raising its base tier or tightening its prompt template.
- `architecture` — unreliability 33% (verifier rejection at 100%). Consider raising its base tier or tightening its prompt template.
