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

- Current: **v0.19.0** (Set 034 — Session Set Explorer honesty pass;
  per-row orchestrator-tracking accordion + ActionRegistry
  orchestrator group RETIRED from the UI surface, replaced by a
  bold color-coded progress-fraction list-icon and a cursor-anchored
  popup right-click menu; bucket-level collapse remains as the sole
  expand/collapse affordance; the cascading-checkout preview is
  saved as an artifact for Set 036+ reactivation). No companion
  PyPI release this set. The version walk:
  - **0.18.1** (Set 035) — state-file sole truth for cancellation /
    restoration extended from the Set 033 H2 verdict (orchestrator
    block) to the cancellation lifecycle. See below for the prior
    Set 035 description.

- Previous: **v0.18.1** (Set 035 — state-file sole truth for
  cancellation/restoration; Marketplace publish gated on operator
  confirmation). No companion PyPI release this set
  (`ai_router/session_lifecycle.py` verified byte-equivalent with the
  TypeScript writer and required no edits). The version walk:
  - **0.14.2** (S2) — Claude-only Orchestrator webview, marker
    helper + hook installer.
  - **0.15.x** (S3) — per-session-set identity (schema v3,
    `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`),
    walk-up resolver with fail-closed posture on ambiguity.
  - **0.16.0** (S4) — Session Sets view rewired as a webview
    custom tree; dedicated orchestrator-indicator view retired in
    favor of per-row accordions.
  - **0.17.0** (S5) — Codex auto-detect via `~/.codex/config.toml`
    watcher (configured-default signal, medium confidence,
    debounced); universal manual-override quickpick
    (`dabbler.setOrchestrator`) with MRU at `~/.dabbler/orchestrator-mru.json`,
    multi-step provider→model→effort→thinking flow, hotkey-bindable
    args, force-override confirmation; Gemini + Copilot manual-only
    installer shims (no auto-detect path documented); smart
    empty-state CTA that picks the install/preset link based on
    locally-installed orchestrators + MRU preference. Session 2 stub
    retired. Companion PyPI release: `dabbler-ai-router` 0.4.0.
  - **0.17.1** (S6) — `Set Orchestrator…` and `Open Orchestrator
    Writer Log` relegated from the accordion-body buttons to the
    right-click context menu (on in-progress rows / always
    respectively) + Command Palette (already registered) per the
    cross-provider consensus call run mid-session. The accordion
    body is no longer cluttered with two buttons that don't directly
    affect the surrounding gauges. The check-out / check-in
    architecture migration that came up during this session is
    deferred to a follow-on session set
    (`030-orchestrator-checkout-checkin`) under proper audit-then-
    spec discipline; pre-audit artifacts preserved at
    `docs/proposals/2026-05-19-orchestrator-tracking-architecture/`.
    Hygiene: `readCurrentMarkerForWorkspace` converted from sync to
    async `fs.promises`.
  - **0.18.0** (Set 033) — orchestrator check-out / check-in
    migration shipped across six sessions per the Set 032 audit
    verdicts (H1 router-only writes, H2 `session-state.json` sole
    truth, H3 hard coordination, H4 `engine + provider` identity,
    OQ1 nested timestamps, OQ2 documentation aliases). User-facing
    surface: `dabbler.setOrchestrator` →
    `dabbler.checkOutOrchestrator` ("Check Out As…"); new
    `dabbler.releaseCheckOut` Command Palette action; multi-in-
    progress rendering (single-active-set banner retired);
    queueing/polling on conflict via `CheckoutPollService` with
    configurable timeout (`dabblerSessionSets.checkoutPollTimeoutMinutes`,
    default 30); Claude `SessionStart` hook refactored to invoke
    `start_session` (H1); `.dabbler/orchestrator.json` per-set
    marker retired entirely. Layer-3 Playwright coverage of
    multi-set + refusal + force + re-attach. Cross-tier
    `close_session` check-in (Full + Lightweight) shipped in
    companion `dabbler-ai-router 0.6.0`. Cross-repo CLAUDE.md
    insertion text at
    [`docs/cross-repo-checkout-notice.md`](docs/cross-repo-checkout-notice.md).
  - **0.18.1** (Set 035) — state-file sole truth for cancellation /
    restoration extended from the Set 033 H2 verdict (orchestrator
    block) to the cancellation lifecycle. New canonical reader
    `readCancellationState(sessionSetDir)` in `cancelLifecycle.ts`
    consults `session-state.json`'s `status` field first; `CANCELLED.md`
    / `RESTORED.md` markdown files survive as durable audit-history
    artifacts and serve as a legacy-fallback signal only (no usable
    state file + `CANCELLED.md` present → `console.warn` + bucket to
    cancelled). `fileSystem.ts:readSessionSets` migrated. TS + Python
    writers verified byte-equivalent across 10 parity rows; no Python
    edits needed (no PyPI release). 16 new unit tests (10 reader + 6
    writer-parity) and 3 new Layer-3 Playwright scenarios in
    `cancellation-state-file.spec.ts`. Bundled: empty-state grey
    gauges removed from `renderAccordionEmpty()` per operator
    directive; glossary-harvest tool (`scripts/harvest_glossary.py`)
    surfaced 40 near-match clusters across 5 extension buckets (all
    triaged as acceptable variance). Deferred follow-ups: 3 pre-
    existing Layer-3 test-scaffolding failures in
    `session-sets-tree.spec.ts` → Set 034 (styling iteration); C1
    Python CLI `print_session_set_status` cancellation-reader
    migration → follow-on patch.
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

### Decision-time consensus (pointer)

When you hit an in-session design / architecture / process question
that has more than one plausible answer, route it through cross-
provider consensus *before* falling back to `AskUserQuestion`. The
opt-in (`delegation.decision_consensus.enabled`), category gates,
journal format, and the human-only vs consensus-eligible split are
documented in `docs/ai-led-session-workflow.md` → **Decision-time
consensus**.
