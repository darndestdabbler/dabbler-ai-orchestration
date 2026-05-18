# CLAUDE.md — dabbler-ai-orchestration

## Purpose

This repo is the canonical source of truth for shared AI orchestration
infrastructure used across all Dabbler AI-led-workflow repos:

- **`ai_router/`** — multi-provider routing, prompt templates, session
  state, metrics, and workflow utilities
- **`tools/dabbler-ai-orchestration/`** — the "Dabbler AI Orchestration" VS Code
  extension

Your role in this repo is **canonical source and release gatekeeper**:
- Changes to `ai_router` are released to PyPI
- Changes to the extension are released to the VS Code Marketplace
- Consumer repos consume both via their respective registries — no file copying

## Consumer repos

| Repo | ai_router | Extension |
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

## Extension versioning

- Current: **v0.14.0** (Set 030 Session 5 — GA: session-state schema v3
  + in-extension v2-migration UX + AI-strategy quickpick + activation
  scanState loading sentinel). Companion PyPI release:
  `dabbler-ai-router` 0.4.0.
- Publisher: `DarndestDabbler` (VS Code Marketplace: `DarndestDabbler.dabbler-ai-orchestration`)
- Namespace: `dabblerSessionSets` (shared across all consumers)
- Build: `cd tools/dabbler-ai-orchestration && npx vsce package`
- Publish: `cd tools/dabbler-ai-orchestration && npx vsce publish`

## Building & testing

```bash
# Extension (requires Node/npm)
cd tools/dabbler-ai-orchestration
npm install
npx vsce package

# ai_router (Python, requires .venv with `pip install -e .[tests]` from repo root)
python -m pytest
```

### Orchestrator e2e harness (Set 027)

Three layered test suites — pick the lowest layer that can see the
regression you're guarding against:

```bash
# Layer 1: pytest end-to-end against the real start/close CLIs
#   ~30s; covers state.json, events ledger, completedSessions[], change-log
python -m pytest -m e2e

# Layer 2: @vscode/test-electron tree-provider harness
#   ~90s on a clean host; covers SessionSetsProvider.getChildren() bucketing
#   Note: on Windows 11 + VS Code 1.120 the runner has a pre-existing env
#   issue; run via the lighter `npm run test:unit` stub harness instead,
#   which exercises the same provider code through a vscode-stub shim.
cd tools/dabbler-ai-orchestration && npm test
cd tools/dabbler-ai-orchestration && npm run test:unit  # Windows fallback

# Layer 3: Playwright Electron rendering smoke
#   ~90s for 5 scenarios; covers what the operator actually sees painted
#   on screen (bucket counts, [FORCED] badge, "in flight" annotation)
cd tools/dabbler-ai-orchestration && npm run test:playwright
```

Picking a layer: data assertions belong in Layer 1; bucketing / sort /
file-watcher invariants belong in Layer 2; rendered-text invariants
(badges, group counts, "N/N", "in flight" annotation) belong in Layer 3.
Each layer's runtime grows ~3× over the previous; reach for the cheapest
that can see the regression.

### Continuous Integration (Set 028 Session 3)

GitHub Actions matrix (`[.github/workflows/test.yml](.github/workflows/test.yml)`) 
runs on every push to master and all PRs:

- **Python tests:** `python -m pytest` on ubuntu-latest, macos-latest, windows-latest
- **Playwright Layer 3:** `npm run test:playwright` on all three platforms
  - Linux: wrapped in `xvfb-run` (headless X11 framebuffer for GUI rendering)
  - Windows/macOS: run directly
  - Artifacts (test-results/) uploaded on failure

**Layer 2 (@vscode/test-electron) skipped in CI** — known broken on Windows 11 + VS Code 1.120 
(upstream arg incompatibility), untested on macOS/Linux. See docs/implementation-summary-023-027.md 
for details.

### Router-config editor

The VS Code extension ships a visual config editor (`Dabbler: Open Dabbler Config Editor`)
that reads and writes `ai_router/router-config.yaml`, `ai_router/budget.yaml`, and
`ai_router/local-overrides.yaml` (gitignored). The editor is implemented in
`tools/dabbler-ai-orchestration/src/configEditor/`. Key files:

- `ConfigEditorPanel.ts` — webview panel, load/save/drift-detect, Python subprocess dispatch
- `yamlReadWrite.ts` — comment-preserving YAML round-trip (uses the `yaml` package)
- `schemaValidator.ts` — AJV-based validation of all three config files
- `sections/` — one file per section (routing, budget, providers, significance, notifications, local-overrides-summary)
- `patch.ts` — `applyPatch()` translates the webview `SavePayload` into YAML mutations

The wizard (`Dabbler: Get Started`) now also has a "Configure AI Router" button
that opens the config editor directly.

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

## Quick start

New to this repo? Read [`docs/quick-start.md`](docs/quick-start.md) first —
it explains the framework in five minutes and points to the right reference
docs from there.

## Session state schema (required reading at every session boundary)

[`docs/session-state-schema.md`](docs/session-state-schema.md) is the
**authoritative reference** for `session-state.json` on both Full and
Lightweight tiers. Any AI orchestrator that touches a state file without
having read it has a high chance of producing the N−1/N display drift
the Session Set Explorer is known to surface.

The non-negotiable rules:

- `completedSessions: [<int>, ...]` is the canonical "X done out of N"
  ledger. Append `currentSession` to it (sorted, unique) on every
  successful close.
- **Lightweight tier** — the orchestrator (or human) maintains
  `completedSessions[]` **by hand** on every close. There is no router
  writer and no events-ledger fallback; this array is the only
  authoritative count signal.
- **Full tier** — `close_session` writes `completedSessions[]`
  automatically. The orchestrator never edits it directly.
- Canonical `status` values are `"not-started"`, `"in-progress"`,
  `"complete"`, `"cancelled"`. Never `"completed"` or `"done"` on a
  new write (the read boundary tolerates them; the writer must emit
  the canonical token).
- The state invariant for "in flight" vs. "between sessions" vs. "done"
  is at the top of the schema doc — consult it before hand-editing any
  state.

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
