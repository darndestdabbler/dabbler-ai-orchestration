# dabbler-ai-orchestration

Canonical home for shared AI orchestration infrastructure across all
Dabbler AI-led-workflow repos.

## What lives here

- **`ai-router/`** — multi-provider AI routing, prompt templates, session
  state, metrics, verification, and workflow utilities. Consumer repos
  (`dabbler-access-harvester`, `dabbler-platform`, etc.) carry their own
  copies; this repo is the source of truth from which they sync.
- **`tools/vscode-session-sets/`** — the "Session Set Explorer" VS Code
  extension (namespace `dabblerSessionSets`). Safe to install in any
  AI-led-workflow repo, UI or non-UI. UAT/E2E commands self-hide in
  workspaces with no opted-in specs.

## Consumer repo responsibilities

Each consumer repo maintains its own `ai-router/` copy. A Claude instance
in *this* repo is responsible for identifying, vetting, and normalizing
inbound changes from consumer repos, then propagating canonical updates
back out.

The VS Code extension has exactly one home (here). Consumer repos reference
the VSIX from `tools/vscode-session-sets/` — they do not carry their own
copy.

## Version baseline

The extension enters this repo at **v0.8.0**, merged from:
- `dabbler-access-harvester` v0.7.1 (functional baseline)
- `dabbler-platform` v0.1.0 (UAT/E2E gating, configurable Playwright path)
