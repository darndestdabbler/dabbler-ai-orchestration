# dabbler-ai-router

A framework for AI-led coding sessions. Work is organized into **session
sets** — small, independently deployable units of work, each with a spec
that plans its sessions step by step. A router dispatches model calls
across providers with complexity-based selection, escalation, and cost
accounting. Every session must pass **cross-provider verification**
before it can close, and the verification record is machine-written:
no code path accepts a hand-written verdict.

Components:

- **Python package `ai_router`** — routing, session lifecycle, gates,
  verification, cost accounting. Everything that decides lives here.
- **VS Code extension "Dabbler AI Orchestration"** — the Work Explorer
  tree. A pure renderer: it shells to `python -m ai_router.progress
  --json` and draws the JSON. It re-implements no logic.

## How a session runs

1. `python -m ai_router.session start` registers the session in
   `session-state.json` and seeds the spec's step plan into
   `activity-log.json`, once.
2. The orchestrating AI (Claude Code, Codex, Copilot, Gemini — any engine
   that reads `AGENTS.md` or the `CLAUDE.md`/`GEMINI.md` that import it)
   does the work.
3. `python -m ai_router.verify` runs the verification loop **before
   commit**: round 1 reviews the full working-tree diff; rounds ≥ 2
   review only the fix delta. The verifier is always a different
   provider than the orchestrator. Rounds append to a machine-only
   ledger under `.dabbler/runs/`. A contested blocking finding has a
   sanctioned exit ladder instead of an impasse: `verify dispute`
   records an evidence-backed rebuttal the next round must engage,
   `verify adjudicate` routes recorded disputes to a third provider
   that neither orchestrated nor verified, and `verify waive` —
   interactive-only, operator-attested — closes the session as WAIVED
   (accepted **unverified**, on the record) once the machine path is
   exhausted.
4. `python -m ai_router.session close` runs five gates — verification
   clean, working tree clean, pushed to remote, test run fresh, verdict
   vocabulary — then flips the state. The verification gate reads the
   ledger; there is no stamp, no override, no hand-writable record.

See [docs/quick-start.md](docs/quick-start.md) for the full walkthrough.

## Install

```
pip install dabbler-ai-router
```

Requires Python 3.11+. Then install the VS Code extension from the VSIX
(`dabbler-ai-orchestration-*.vsix` in a release, or built from
`tools/dabbler-ai-orchestration/`):

```
code --install-extension dabbler-ai-orchestration-1.0.0.vsix
```

## The per-set artifacts

Each session set lives at `docs/session-sets/<NNN-slug>/` in the
consumer project and carries exactly four artifacts:

| Artifact | Written by | Purpose |
|---|---|---|
| `spec.md` | decomposition session (human-reviewed) | the plan: sessions and their steps |
| `session-state.json` | `ai_router` only | lifecycle state, schema v4 (v3 read-tolerated) |
| `activity-log.json` | `ai_router` only | per-step progress log |
| `change-log.md` | `ai_router` (appends) | human-readable summary blocks per session |

Verification round records live **outside the working tree** at
`.dabbler/runs/<set>/s<N>/rounds.jsonl` (gitignored, machine-written
only), and routed-call metrics append to `router-metrics.jsonl`. Field
by field detail: [docs/schema-reference.md](docs/schema-reference.md).

## Transports

Both transports are first-class for every call type:

- **Direct API** — Anthropic, OpenAI, and Google, over their HTTP APIs,
  with per-call cost accounting from the pricing registry.
- **GitHub Copilot CLI** — dispatches through a Copilot seat. Models
  come from a probed catalog lockfile. Calls are real spend but cannot
  be priced per call; metrics rows carry `cost_usd: null` with
  `billed_usage_unavailable: true`, and seat spend is measured
  afterwards by `python -m ai_router.seat_cost` from the CLI's local
  usage store.

Verification may cross transports: an orchestrator on the direct API
can be verified through the Copilot CLI on another provider's model,
and vice versa. The provider-independence rule (verifier provider ≠
orchestrator provider) holds on both paths.

### Transport preference

Resolved in this precedence (first set wins):

1. an explicit `--transport api|copilot-cli` flag
   (`python -m ai_router.verify --transport …`; programmatically,
   `resolve_transport(config, cli_flag=…)`)
2. the `DABBLER_TRANSPORT` env var (`api` | `copilot-cli`) — the
   operator's standing preference
3. `transport.profile` in `router-config.yaml`
4. default: `api`

This selects the transport for routine dispatch; verifier selection may
still use the other transport when provider independence requires it.

## Credentials

API keys are resolved from environment variables only — never from
config files, never logged:

| Provider | Env var |
|---|---|
| Anthropic | `DABBLER_ANTHROPIC_API_KEY` |
| OpenAI | `DABBLER_OPENAI_API_KEY` |
| Google | `DABBLER_GEMINI_API_KEY` |

A provider whose key does not resolve is simply not a candidate — the
router selects among the providers that have keys (or the Copilot seat,
on that transport). An empty-string value counts as absent.

## Library use

```python
from ai_router import route

result = route("Review this diff for correctness bugs", task_type="code-review")
print(result.model_name, result.cost_usd)
```

`python -m ai_router.metrics` prints the spend report (per model, per
task type, per session set, Opus-equivalent savings). Unpriced seat
calls are reported as unpriced, never as $0.00.

## Layout

```
ai_router/              the Python package (routing, session, verify, gates)
ai_router/schemas/      JSON Schemas: session-state v4, rounds ledger
ai_router/prompt-templates/  system/task/verification prompts
tools/dabbler-ai-orchestration/  the VS Code extension
docs/                   quick-start and schema reference
```

Migrating a project from v1? See
[MIGRATION-FROM-V1.md](MIGRATION-FROM-V1.md) — the short version is:
nothing to migrate.
