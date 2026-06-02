# GEMINI.md — dabbler-ai-orchestration

> **Audience:** Gemini Code Assistant. Claude Code reads `CLAUDE.md`;
> Codex (OpenAI) and GitHub Copilot read `AGENTS.md`. All three files
> describe the same role and rules — only the agent-specific bootstrap
> differs.

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

## Consumer repos

| Repo | ai_router copy | Extension |
|---|---|---|
| `dabbler-access-harvester` | `pip install dabbler-ai-router` | VS Code Marketplace |
| `dabbler-platform` | `pip install dabbler-ai-router` | VS Code Marketplace |
| `dabbler-homehealthcare-accessdb` | not used (Lightweight tier) | VS Code Marketplace |

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
walk live in `docs/repository-reference.md` → `Documentation authority and
release status`. Do not make this engine-specific bootstrap file the only
home for shared operational history.

## Building & testing

```bash
# Extension (requires Node/npm)
cd tools/dabbler-ai-orchestration
npm install
npx vsce package

# ai_router (Python, requires .venv with `pip install -e .[tests]` from repo root)
python -m pytest
```

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

### Gemini Code Assistant bootstrap (Windows)

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

### AI router import

After `.venv/Scripts/pip install -e .` from the repo root (or `pip
install dabbler-ai-router` once published), import directly:

```python
from ai_router import route
```

The previous `importlib.util.spec_from_file_location` shim, required
when the package directory used a hyphenated name, is no
longer needed.

Use `.venv/Scripts/python.exe` to run Python scripts on Windows. The
same module exposes `send_session_complete_notification()`, which reads
`PUSHOVER_API_KEY` and `PUSHOVER_USER_KEY` from the environment or
Windows User environment.

### Delegation Discipline (pointer)

Your role is orchestrator, not solo coder. Reasoning tasks — code
review, security review, architecture, analysis, documentation, test
generation, session verification — **always** go through `route()`.
Only handle work directly when it is mechanical, single-file, and
under ~50 lines.

See `docs/ai-led-session-workflow.md` → **Delegation Discipline** for
the full criteria, the human-tunable thresholds (in
`ai_router/router-config.yaml` under `delegation:`), and the rationale.

### Decision-time consensus (pointer)

When you hit an in-session design / architecture / process question
that has more than one plausible answer, route it through cross-
provider consensus *before* falling back to `AskUserQuestion`. The
opt-in (`delegation.decision_consensus.enabled`), category gates,
journal format, and the human-only vs consensus-eligible split are
documented in `docs/ai-led-session-workflow.md` → **Decision-time
consensus**.
