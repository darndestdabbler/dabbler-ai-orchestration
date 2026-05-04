# AI Router — Manager Report

Period: **2026-04-19** to **2026-05-04**
Generated: 2026-05-04

## Headline

- **Total routed calls**: 370
- **Total spend**: $63.1357
- **Opus-only baseline** (hypothetical): $92.4749 (at $15.00 in / $75.00 out per 1M tokens)
- **Ratio of actual to Opus baseline**: 68.3% (**31.7% savings** from tiered routing)
- **Verifier fallback rate**: 0.0% (28 verify calls, no fallbacks)

## Per-task-type summary

| Task type | Calls | Primary model | Avg $/call | Esc % | Rej % | Retry % | Unreliability |
|---|---:|---|---:|---:|---:|---:|---:|
| `session-verification` | 84 | `opus` | $0.4920 | 3.8% | 100.0% | 0.0% | 34.6% |
| `uat-coverage-review` | 127 | `sonnet` | $0.0758 | 0.0% | 83.3% | 0.0% | 27.8% |
| `uat-plan-generation` | 20 | `opus` | $0.4422 | 0.0% | 100.0% | 0.0% | 33.3% |
| `architecture` | 6 | `gemini-pro` | $0.3083 | 0.0% | 100.0% | 0.0% | 33.3% |
| `uat-failure-triage` | 80 | `sonnet` | $0.0080 | 0.0% | — | — | 0.0% |
| `analysis` | 34 | `gemini-pro` | $0.0088 | 0.0% | — | — | 0.0% |
| `uat-script-author` | 4 ⚠️ | `sonnet` | $0.0683 | 0.0% | — | — | n=4, too few |
| `test-generation` | 5 | `gemini-pro` | $0.0459 | 0.0% | — | — | 0.0% |
| `planning` | 1 ⚠️ | `gemini-pro` | $0.0430 | 0.0% | — | — | n=1, too few |
| `summarization` | 8 | `gemini-flash` | $0.0008 | 0.0% | — | — | 0.0% |
| `documentation` | 1 ⚠️ | `gemini-flash` | $0.0002 | 0.0% | — | — | n=1, too few |

_Unreliability = mean of escalation rate, verifier rejection rate (ISSUES_FOUND verdicts), and retry rate (tiebreaker / verify ratio). Cells with fewer than 5 calls are flagged rather than rated._

## Outliers

### Top 3 most expensive individual calls

| Rank | Cost | Model | Task type | Session set | Timestamp |
|---:|---:|---|---|---|---|
| 1 | $1.8162 | `opus` | `session-verification` | …sets/security-dashboard-uat-remediation | 2026-04-21T08:40:43 |
| 2 | $1.5986 | `opus` | `session-verification` | …architect-role-administration-dashboard | 2026-04-19T18:51:57 |
| 3 | $1.5357 | `opus` | `architecture` | docs/session-sets/uat-dsl-compiler | 2026-04-28T07:31:36 |

### Top 3 task types by unreliability (min 5 calls)

| Rank | Task type | Unreliability | Calls | Esc % | Rej % | Retry % |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `session-verification` | 34.6% | 84 | 3.8% | 100.0% | 0.0% |
| 2 | `uat-plan-generation` | 33.3% | 20 | 0.0% | 100.0% | 0.0% |
| 3 | `architecture` | 33.3% | 6 | 0.0% | 100.0% | 0.0% |

## Verifier findings & adjudication

- **Verifier findings (ISSUES_FOUND)**: 26
- **Adopted without challenge**: 25 (96.2%)
- **Challenged by orchestrator**: 1 (3.8%)
    - Accept finding after challenge: 0
    - Accept dismissal: 1
    - Reverify with reshaped context: 0
    - Second opinion from different provider: 0

### Challenge causes

| Cause | Count |
|---|---:|
| `context-gap` | 1 |

## Auto-generated action items

- `session-verification` — unreliability 35% (verifier rejection at 100%). Consider raising its base tier or tightening its prompt template.
- `uat-coverage-review` — unreliability 28% (verifier rejection at 83%). Consider raising its base tier or tightening its prompt template.
- `uat-plan-generation` — unreliability 33% (verifier rejection at 100%). Consider raising its base tier or tightening its prompt template.
- `architecture` — unreliability 33% (verifier rejection at 100%). Consider raising its base tier or tightening its prompt template.
