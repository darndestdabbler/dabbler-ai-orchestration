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

## Orchestrator-block contract (post-Set-049)

The `orchestrator` block in each `sessions[i]` entry of
`session-state.json` carries exactly four fields:

- `engine` — `claude` / `codex` / `gemini` / `copilot` / …
- `provider` — `anthropic` / `openai` / `google` / `github` / …
- `model` — model id when the hook can declare it authoritatively
- `effort` — effort tier when the hook can declare it authoritatively

Writers use **omit-null**: a field the caller cannot declare
authoritatively is simply absent from the on-disk block. No `null`
values, no `"unknown"` placeholder strings. Readers tolerate missing
keys.

The Set 033 H3 + Set 036 H4 hard-coordination check (refusal toast,
poll/force/dismiss flow, `EXIT_CHECKOUT_CONFLICT`,
`chatSessionId` / `checkedOutAt` / `lastActivityAt` fields) was fully
ripped out in Set 049. The shim that disabled it by default
(`DABBLER_ENFORCE_CHECKOUT_COORDINATION`) is gone. The
`~/.dabbler/orchestrator-writer.log` audit appender is retained as a
generic "start_session ran" record (no holder-change semantics).

The orchestrator block is not surfaced in the Session Set Explorer
rendering (P4: no orchestrator info in the UI, no harvest-record
badges, no coordination-conflict pills). The `writer-bypass` detector
(D3) survives in `ai_router/writer_discipline.py` as a general
writer-discipline check, decoupled from coordination context. (It was
salvaged there in Set 051 S2 when the orphaned `ai_router/joiner/`
subpackage was deleted; the standalone module has no joiner import.)

See `docs/session-state-schema.md § Writer Contract` for the
per-orchestrator declaration pattern and `docs/cross-repo-checkout-notice.md`
for the consumer-repo deprecation instruction.

## License

`LICENSE` at the repo root is canonical. `tools/dabbler-ai-orchestration/LICENSE`
is a required duplicate — `vsce package` expects the file alongside
`package.json` and has no flag to point elsewhere. Keep both in sync.

## Shared repo facts

Current consumer repos, canonical release status, and the shared version
walk live in `docs/repository-reference.md` → `Documentation authority and
release status`. If a future orchestrator needs a shared operational fact,
update that engine-agnostic section (and the package changelogs when
relevant), not just this bootstrap file.

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

The non-negotiable rules (v4 shape; Set 047):

- `sessions: [{ number, title, status, startedAt, completedAt, ... }, ...]`
  is the canonical per-session ledger. Legacy top-level fields
  (`currentSession`, `totalSessions`, `completedSessions`,
  `lifecycleState`, `startedAt`, `completedAt`) are NOT written to
  disk in v4 — readers derive them at read time from `sessions[]`
  via the `normalize_to_v4_shape` shim.
- **Lightweight tier** — the orchestrator (or human) maintains
  `sessions[i]` **by hand** on every close: set the matching entry's
  `status` to `"complete"` and populate its `completedAt`. There is
  no router writer; this per-session ledger is the only authoritative
  completion signal.
- **Full tier** — `close_session` writes the per-session entry
  automatically. The orchestrator never edits `sessions[]` directly.
- Canonical per-session `status` values are `"not-started"`,
  `"in-progress"`, `"complete"`, `"cancelled"`. Never `"completed"`
  or `"done"` on a new write (the read boundary tolerates them; the
  writer must emit the canonical token).
- The set's top-level `status` flips to `"complete"` on the final
  close (Full: `close_session`; Lightweight: the orchestrator).
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

### Decision-time consensus (pointer)

When you hit an in-session design / architecture / process question
that has more than one plausible answer, route it through cross-
provider consensus *before* falling back to `AskUserQuestion`. The
opt-in (`delegation.decision_consensus.enabled`), category gates,
journal format, and the human-only vs consensus-eligible split are
documented in `docs/ai-led-session-workflow.md` → **Decision-time
consensus**.
