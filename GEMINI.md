# GEMINI.md — dabbler-ai-orchestration

> **Audience:** Gemini Code Assistant. Claude Code reads `CLAUDE.md`;
> Codex (OpenAI) and GitHub Copilot read `AGENTS.md`. All three files
> describe the same role and rules — only the agent-specific bootstrap
> differs.

## Purpose

This repo is the canonical source of truth for shared AI orchestration
infrastructure used across all Dabbler AI-led-workflow repos:

- **`ai-router/`** — multi-provider routing, prompt templates, session
  state, metrics, and workflow utilities
- **`tools/vscode-session-sets/`** — the "Session Set Explorer" VS Code
  extension

Your role in this repo is **curator and normalizer**, not solo developer:
- Receive proposed changes from consumer repos
- Vet them for portability (would this break a no-UI repo? a UI repo?)
- Normalize and merge into the canonical source
- Produce a clean change summary that consumer repos can apply

## Consumer repos

| Repo | ai-router copy | Extension |
|---|---|---|
| `dabbler-access-harvester` | owns its own copy | references VSIX from this repo |
| `dabbler-platform` | owns its own copy | references VSIX from this repo |

## Portability rule

> **Universal core, gated extensions, addendum specifics.**
>
> Anything in the core must work unmodified when `requiresUAT: false` and
> `requiresE2E: false` are permanent defaults. UI/UAT/E2E-specific behavior
> must be gated on spec-level flags.

## License

`LICENSE` at the repo root is canonical. `tools/vscode-session-sets/LICENSE`
is a required duplicate — `vsce package` expects the file alongside
`package.json` and has no flag to point elsewhere. Keep both in sync.

## Extension versioning

- Current: **v0.8.0** (merged harvester 0.7.1 + platform gating)
- Namespace: `dabblerSessionSets` (shared across all consumers)
- Build: `cd tools/vscode-session-sets && npx vsce package`
- Distribution: local VSIX install; future → shared local path → Marketplace

## Building & testing

```bash
# Extension (requires Node/npm)
cd tools/vscode-session-sets
npm install
npx vsce package

# ai-router (Python, requires .venv)
cd ai-router
python -m pytest  # if tests are added
```

## When curator work runs as a session set

Most curator work in this repo is ad-hoc PR-style review and
normalization. When a structured pass is justified (e.g., merging a
non-trivial change from a consumer repo, or refactoring `ai-router/`),
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

```python
import importlib.util, sys

def load_ai_router():
    spec = importlib.util.spec_from_file_location(
        'ai_router', 'ai-router/__init__.py',
        submodule_search_locations=['ai-router'])
    mod = importlib.util.module_from_spec(spec)
    sys.modules['ai_router'] = mod
    spec.loader.exec_module(mod)
    return mod

ar = load_ai_router()
route = ar.route
```

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
`ai-router/router-config.yaml` under `delegation:`), and the rationale.
