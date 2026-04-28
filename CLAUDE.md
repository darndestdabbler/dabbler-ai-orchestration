# CLAUDE.md — dabbler-ai-orchestration

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

## Repo layout standard

The bare-repo + flat-worktree layout is the dabbler standard for new
repos and the migration target for existing ones. See
`docs/planning/repo-worktree-layout.md` for the layout, fresh-repo
setup recipe, migration recipe (for repos still on the legacy
sibling-worktree pattern), and gotchas. Consumer repos point their own
agent-instruction files at this doc.
