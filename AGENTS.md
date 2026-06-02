# AGENTS.md — dabbler-ai-orchestration

> **Audience:** Codex (OpenAI) and GitHub Copilot agents that look for an
> `AGENTS.md` at the repo root. Claude Code reads `CLAUDE.md`; Gemini Code
> Assistant reads `GEMINI.md`. All three files describe the same role and
> rules — only the engine-specific bootstrap at the end differs.

## Quick start

New to this repo? Read [`docs/quick-start.md`](docs/quick-start.md) first —
it explains the framework in five minutes and points to the right reference
docs from there.

## Purpose

This repo is the canonical source of truth for shared AI orchestration
infrastructure used across all Dabbler AI-led-workflow repos:

- **`ai_router/`** — multi-provider routing, prompt templates, session
  state, metrics, and workflow utilities
- **`tools/dabbler-ai-orchestration/`** — the "Dabbler AI Orchestration"
  VS Code extension

Your role in this repo is **canonical source and release gatekeeper**:
- Changes to `ai_router` are released to PyPI
- Changes to the extension are released to the VS Code Marketplace
- Consumer repos consume both via their respective registries — no file copying

## Portability rule

> **Universal core, gated extensions, addendum specifics.**
>
> Anything in the core must work unmodified when `requiresUAT: false` and
> `requiresE2E: false` are permanent defaults. UI/UAT/E2E-specific behavior
> must be gated on spec-level flags.

## License

`LICENSE` at the repo root is canonical. `tools/dabbler-ai-orchestration/LICENSE`
is a required duplicate — `vsce package` expects the file alongside
`package.json` and has no flag to point elsewhere. Keep both in sync.

## Shared repo facts

Current consumer repos, canonical release status, and the shared version
walk live in [`docs/repository-reference.md`](docs/repository-reference.md)
→ [Documentation authority and release status](docs/repository-reference.md#documentation-authority-and-release-status).
Do not make this engine-specific bootstrap file the only home for shared
operational history; if a future orchestrator needs a shared operational
fact, update that engine-agnostic section (and the package changelogs when
relevant), not this file.

## Building & testing

The test layers (Layer 1 pytest end-to-end, Layer 2 tree-provider harness,
Layer 3 Playwright rendering smoke), the full pre-commit pass, the
extension build, the publish runbook, and the CI matrix all live in
[`CONTRIBUTING.md`](CONTRIBUTING.md). CI itself is defined in
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## Session state schema

[`docs/session-state-schema.md`](docs/session-state-schema.md) is the
authoritative reference for `session-state.json` (the v4 shape, on both
Full and Lightweight tiers) and is required reading at every session
boundary — an orchestrator that touches a state file without reading it is
the usual cause of the N−1/N display drift the Session Set Explorer
surfaces. The per-session `orchestrator` block (the four `engine` /
`provider` / `model` / `effort` fields, written omit-null) and the Set 049
writer contract live there too; the engine-agnostic narrative of the
coordination-layer rip-out — the `writer-bypass` (D3) check in
`ai_router/writer_discipline.py` and the operator-locked "no orchestrator
info in the Explorer" (P4) decision — is in
[`docs/ai-led-session-workflow.md`](docs/ai-led-session-workflow.md).

## Repo layout standard

The sibling-worktrees-folder layout is the dabbler standard for new
repos and the migration target for existing ones — main checkout at
`~/source/repos/<repo>/` (never moves), worktrees at
`~/source/repos/<repo>-worktrees/<slug>/`. See
`docs/planning/repo-worktree-layout.md` for the layout, fresh-repo
setup recipe, migration recipes (covering both the legacy sibling-
worktree pattern and the retired bare-repo + flat-worktree pattern),
drift recovery, deactivate-mode recipe, and gotchas. Consumer repos
point their own agent-instruction files at this doc.

## Close-out and outsource-last

Step 8 of `docs/ai-led-session-workflow.md` is collapsed to a single
paragraph that points at the canonical close-out reference:

- **`ai_router/docs/close-out.md`** — when `python -m
  ai_router.close_session` runs, how to invoke it, what it does
  (gate checks, idempotent writes, lock contention), common
  failures and remediation, the manual-flag matrix
  (`--interactive`, `--force`, `--manual-verify`, `--repair`), and
  troubleshooting (stranded sessions, mixed-mode drift,
  reconciler behavior).

`close_session --help` echoes Section 2 of `close-out.md`; the doc
is the single source of truth.

## When curator work runs as a session set

Most curator work in this repo is ad-hoc PR-style review and
normalization. When a structured pass is justified (e.g., merging a
non-trivial change from a consumer repo, or refactoring `ai_router/`),
author a session set under `docs/session-sets/<slug>/` and follow the
full procedure in `docs/ai-led-session-workflow.md`. Required reading
before any session: `docs/planning/project-guidance.md`,
`docs/planning/lessons-learned.md`, and
`docs/planning/session-set-authoring-guide.md`.

## Running the router

Use `.venv/Scripts/python.exe` to run Python on Windows. After
`.venv/Scripts/pip install -e .` from the repo root (or `pip install
dabbler-ai-router` once published), import the router directly:

```python
from ai_router import route
```

The same module exposes `send_session_complete_notification()`, which
reads `PUSHOVER_API_KEY` / `PUSHOVER_USER_KEY` from the environment or the
Windows User environment. (The provider API keys must be available first —
see **Engine-specific bootstrap** at the end of this file.)

## Delegation Discipline (pointer)

Your role is orchestrator, not solo coder. Reasoning tasks — code
review, security review, architecture, analysis, documentation, test
generation, session verification — **always** go through `route()`.
Only handle work directly when it is mechanical, single-file, and
under ~50 lines.

See `docs/ai-led-session-workflow.md` → **Delegation Discipline** for
the full criteria, the human-tunable thresholds (in
`ai_router/router-config.yaml` under `delegation:`), and the rationale.

## Decision-time consensus (pointer)

When you hit an in-session design / architecture / process question
that has more than one plausible answer, route it through cross-
provider consensus *before* falling back to `AskUserQuestion`. The
opt-in (`delegation.decision_consensus.enabled`), category gates,
journal format, and the human-only vs consensus-eligible split are
documented in `docs/ai-led-session-workflow.md` → **Decision-time
consensus**.

## Engine-specific bootstrap (Codex / GitHub Copilot, Windows)

Codex and GitHub Copilot run in a shell that does not inherit the Windows
User environment, so export the provider API keys explicitly before
running the router (see **Running the router** above):

```bash
export GEMINI_API_KEY=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')" | tr -d '\r')
export ANTHROPIC_API_KEY=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User')" | tr -d '\r')
export OPENAI_API_KEY=$(powershell -Command "[System.Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User')" | tr -d '\r')
.venv/Scripts/python.exe -c "
import os
missing = [k for k in ('ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY') if not os.environ.get(k)]
if missing:
    raise SystemExit(f'Missing environment variables: {missing}')
print('API keys OK')
"
```

If keys are missing, stop and tell the human.
