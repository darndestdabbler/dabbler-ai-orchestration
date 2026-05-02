# CLAUDE.md — dabbler-ai-orchestration

## Purpose

This repo is the canonical source of truth for shared AI orchestration
infrastructure used across all Dabbler AI-led-workflow repos:

- **`ai_router/`** — multi-provider routing, prompt templates, session
  state, metrics, and workflow utilities
- **`tools/vscode-session-sets/`** — the "Session Set Explorer" VS Code
  extension

Your role in this repo is **curator and normalizer**, not solo developer:
- Receive proposed changes from consumer repos
- Vet them for portability (would this break a no-UI repo? a UI repo?)
- Normalize and merge into the canonical source
- Produce a clean change summary that consumer repos can apply

## Consumer repos

| Repo | ai_router copy | Extension |
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

# ai_router (Python, requires .venv with `pip install -e .[tests]` from repo root)
python -m pytest
```

## Repo layout standard

The bare-repo + flat-worktree layout is the dabbler standard for new
repos and the migration target for existing ones. See
`docs/planning/repo-worktree-layout.md` for the layout, fresh-repo
setup recipe, migration recipe (for repos still on the legacy
sibling-worktree pattern), and gotchas. Consumer repos point their own
agent-instruction files at this doc.

## Close-out and outsource-last

Step 8 of `docs/ai-led-session-workflow.md` is collapsed to a single
paragraph that points at the canonical close-out reference:

- **`ai_router/docs/close-out.md`** — when `python -m
  ai_router.close_session` runs, how to invoke it, what it does
  (gate checks, idempotent writes, lock contention), common
  failures and remediation, the manual-flag matrix
  (`--interactive`, `--force`, `--manual-verify`, `--repair`), and
  troubleshooting (stranded sessions, queue-state debugging,
  reconciler behavior).
- **`ai_router/docs/two-cli-workflow.md`** — operating guide for
  `outsourceMode: last` session sets: when to use it, initial
  setup, day-to-day operation, verifier-daemon recovery,
  orchestrator CLI context-reset recovery, subscription-window
  fatigue diagnostics, and common pitfalls.

`close_session --help` echoes Section 2 of `close-out.md`; the doc
is the single source of truth.
