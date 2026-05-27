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
(D3) survives in `ai_router/joiner/conflicts.py` as a general
writer-discipline check, decoupled from coordination context.

See `docs/session-state-schema.md § Writer Contract` for the
per-orchestrator declaration pattern and `docs/cross-repo-checkout-notice.md`
for the consumer-repo deprecation instruction.

## License

`LICENSE` at the repo root is canonical. `tools/dabbler-ai-orchestration/LICENSE`
is a required duplicate — `vsce package` expects the file alongside
`package.json` and has no flag to point elsewhere. Keep both in sync.

## Extension versioning

- Current: **v0.24.0** (Set 049 — Orchestrator coordination
  removal; full rip-out of the Set 033 H3 + Set 036 H4
  hard-coordination check shipped end-to-end across 5 sessions;
  `session-state.json` orchestrator block reshaped from 7 fields
  to 4 (`engine`, `provider`, `model`, `effort`) with omit-null
  writer pattern — `chatSessionId`, `checkedOutAt`,
  `lastActivityAt` dropped from on-disk shape AND writer code
  paths; `start_session --chat-session-id <id>` and other
  vestigial flags accepted by argparse and ignored by the writer
  with a single stderr deprecation line per invocation
  (T2 accept-with-warning); `python -m ai_router.new_chat_id`
  CLI retired entirely; `EXIT_CHECKOUT_CONFLICT` /
  `prior_engine_provider` matching / takeover modal / TTY prompt
  / `_coordination_enforced()` gate / `chatSessionMismatchModal`
  / `CheckoutPollService` / `dabbler.checkOutOrchestrator` /
  `dabbler.releaseCheckOut` / `dabbler.newChatIdWorkflowToast`
  / Gemini + Copilot installer shims all deleted; `bare-touch`
  / `engine-mismatch` / `stale-checkout-touch` joiner detectors
  retired (D1/D2 loss-of-signal accepted per audit); D3
  `writer-bypass` detector kept, decoupled from coordination
  context as a general writer-discipline check; Set 045
  Explorer surface reverted per P4 — `RowPayload.harvestSignals`
  / `RowPayload.conflicts` fields removed,
  `renderHarvestBadges()` / `renderConflictPills()` deleted,
  `.harvest-badges` / `.conflict-pills` CSS rules removed
  (~145 lines CSS+JS); `HarvestService.ts` deleted (sole-caller
  disconnect made the stub pointless; load-bearing scaffolding
  lives in `ai_router/joiner/`); `holder_change` /
  `checkout_conflict` event-type emission retired in
  `session_events.py` (existing JSONL entries intact);
  `~/.dabbler/orchestrator-writer.log` audit appender retained
  as a generic "start_session ran" record (no holder-change
  semantics); `migrate_v3_to_v4` migrator extended with T4
  sweep+normalize that strips the 3 retired fields from
  historical orchestrator blocks (top-level legacy + per-session
  ledger; `.bak` rollback preserved; idempotent on clean v4
  files); `claude-session-start-invoker.js` simplified to walk-up
  resolve + spawn `start_session --engine claude --provider
  anthropic [--model X --effort Y]` with model/effort from prior
  block recovery (no `"unknown"` fallback under T3);
  `docs/cross-repo-checkout-notice.md` rewritten as one-page
  deprecation instruction for consumer-repo CLAUDE.md
  remediation (T7); `docs/session-state-schema.md` § Writer
  Contract documents the T3 per-orchestrator declaration
  pattern; `CLAUDE.md` "Hard-coordination enforcement is OFF
  by default" section retired entirely (rip-out makes it
  obsolete). Companion PyPI release: `dabbler-ai-router 0.11.0`.
  The version walk:
  - **0.23.0** (Set 048) — Lightweight-tier parity;
    end-to-end Lightweight parity with Full shipped across 5
    sessions; `--no-router` mode with three-knob precedence
  (CLI flag > env var `DABBLER_NO_ROUTER` > `spec.md` `tier:
  lightweight` > default Full); route() / verify() prologues
  short-circuit to zero-cost stubs without `_init()` (no
  config load, no credentials needed); `close_session`
  manual-attestation block + soft gate for
  `external-verification.md` with TTY/non-TTY branching and
  `--accept-suggestions` non-interactive flag; tri-state
  `requiresUAT` / `requiresE2E` schema (`true | false |
  "suggested"`) on both Full and Lightweight; AI orchestrator
  asks operator at session start when scope has UX and value
  is `"suggested"` ("E2E tests, UAT checklist, both, or
  neither?") and records the choice as a
  `suggestion_disposition` activity-log entry that the
  close-out gate consumes; spec.md `tier: full | lightweight`
  field with backwards-compat default to `full`; four
  copyable-review-prompt commands (`dabbler.copy{Spec
  Review,SessionAccomplishments,SetAccomplishments,
  StartNextSession}Prompt`) using path-reference format per
  operator-locked L1 (no content-embed) and visible from both
  Command Palette and the right-click context menu's `Copy
  Eval ▸` submenu; per-row left-click is a dual action — ALWAYS
  opens `spec.md` and ALSO copies `Start the next session of
  \`<slug>\`.` plus a one-line toast on non-terminal rows
  (terminal rows skip the clipboard write); per-row right-click
  rebuilt on `vscode.window.showQuickPick` with two-step
  submenus (`Open File ▸` / `Copy Eval ▸` / flat actions) —
  the cursor-anchored HTML popup from Set 034 is fully retired
  including its `.context-menu*` CSS and ~100 lines of webview
  client.js; `dabblerSessionSets.openAiAssignment` deleted per
  operator-locked L3; `dabbler.openExternalVerificationDoc`
  Command Palette action; `python -m ai_router.migrate_
  lightweight_to_canonical_v4` CLI handles three Lightweight
  non-canonical shapes (`sessionLog[]` → `sessions[]`,
  `done`/`completed` status aliases, missing schemaVersion)
  via a `_normalize_to_v3_intermediate` -> `normalize_to_v4_
  shape` pipeline with `.lwbak.json` backup; `docs/review-
  criteria/{spec,session,set}.md` template bootstrap kit;
  Get Started wizard gains a `Choose adoption tier` radio
  group above `Prerequisites` with `applyTierVisibility(tier)`
  hiding the API-spend cost-reality callout / `Configure AI
  Router` / `Show Cost Dashboard` under Lightweight while
  preserving `Troubleshoot`; new `docs/cross-repo-lightweight-
  notice.md` for consumer paste-in; `docs/session-state-
  schema.md § Tier Expectations` rewritten;
  `docs/ai-led-session-workflow.md Step 6` gains a Lightweight
  subsection documenting the 5-step copy / paste / paste-back
  / soft-gate flow + path-aware-agent requirement;
  `docs/planning/session-set-authoring-guide.md` documents
  the `tier:` field and tri-state UAT/E2E with the upfront-
  positive-confirmation prompt (replacing the audit's
  originally-proposed triple-redundancy reminders per
  operator override). S5 UAT discovered + fixed a Critical
  bare-import bug: production-code bare imports of
  `runtime_mode` / `spec_config` (left over from S2's
  test-conftest convention) raised `ModuleNotFoundError`
  under pip-install consumers, silently no-op'ing
  `--no-router` across the entire CLI surface; now use
  relative imports and the bug is locked out by a new
  static-analysis test. Companion PyPI release:
  `dabbler-ai-router 0.10.0`. The version walk:
  - **0.22.0** (Set 047) — state-file schema v4 audit;
    v4 evolution of `session-state.json` shipped end-to-end
    across 6 sessions; derives every legacy top-level lifecycle
    field (`currentSession` / `totalSessions` /
    `completedSessions` / `lifecycleState` / `startedAt` /
    `completedAt` / `orchestrator` / `verificationVerdict`)
    from a per-session `sessions[]` ledger where each entry
    carries its own startedAt / completedAt / orchestrator /
    verificationVerdict; reader-first migration via
    `normalizeToV4Shape(state, specMdPath)` shim (TS) +
    `normalize_to_v4_shape(state, spec_md_path)` shim (Python)
    that accepts v1/v2/v3/v4 input transparently; new
    `python -m ai_router.migrate_v3_to_v4` CLI + `Migrate to v4
    schema` right-click action with `.bak` rollback contract
    and documented rollback procedure at
    `docs/v3-to-v4-rollback-procedure.md`; all writers
    (`register_session_start` / `_flip_state_to_closed` /
    `cancel_session_set` / `restore_session_set` + TS mirrors)
    emit canonical v4 on-disk shape; new `spec.md`
    `prerequisites:` field with `[BLOCKED BY PREREQS]` badge in
    the Session Set Explorer description (suppressed on
    terminal-state rows); `docs/session-state-schema.md`
    rewritten as canonical v4 reference. Companion PyPI
    release: `dabbler-ai-router 0.9.0`.
  - **0.21.0** (Set 045) — log-harvest implementation;
    dual-primary observability surface per Set 044's
    consensus-locked proposal v1 shipped end-to-end across 6
    sessions; Session Set Explorer rows gain
    harvested-signal badges (W / N / M / B for wrapper-launched
    / native-log / narration-marker / writer-bypass) plus
    coordination-conflict pills (engine-mismatch / bare-touch /
    stale-checkout-touch / writer-bypass) fed by an async
    shell-out to the new `python -m ai_router.joiner` CLI in
    the companion `dabbler-ai-router 0.8.0`; new `Dabbler:
    Regenerate Narration Templates` Command Palette action
    writes canonical CLAUDE.md / AGENTS.md files with the
    Set-044-spec'd session-start attribution marker an operator
    can drop into a free-running consumer workspace; one-time
    setup warning toast with `Open settings` action when
    `dabbler-ai-router` is not installed in the active venv
    (otherwise the surface keeps rendering all rows but the
    badge / pill columns stay empty); IBM colorblind-safe
    palette for badge colors; CSS custom-property indent for
    the conflict-pill column so it tracks the fraction column
    above through font-size changes; new `CONTRIBUTING.md` at
    repo root with per-test-layer scope guidance + the rebuild-
    trap note (invoke through `npm run test:playwright` not
    bare `npx playwright test`); new
    `docs/cross-repo-harvest-notice.md` for cross-tier
    consumer-repo paste-in. Companion PyPI release:
    `dabbler-ai-router` 0.8.0.
  - **0.20.0** (Set 036) — chatSessionId identity refinement +
    MVVM watcher-scope discipline; H4 holder-identity composite
    refined from `engine + provider` to
    `engine + provider + chatSessionId` so two distinct chats on
    the same engine are recognized as different holders; new
    `new_chat_id` CLI workflow for orchestrators without native
    per-chat metadata; takeover modal in IDE / TTY prompt in
    terminal for chatSessionId-only mismatches; per-set lifecycle
    lock (`.lifecycle.lock`) serializes start/close; Codex
    config-toml watcher RETIRED entirely (D1 watcher-scope
    discipline); `signalKind` enum + clock-overlay + multi-branch
    tooltip variants RETIRED; orphan source from Set 034's
    per-row accordion retirement DELETED
    (`OrchestratorAccordion.ts` + `detectOrchestrators.ts` +
    media/orchestrator-indicator/); watcher-inventory convention
    test enforces D1 at code-review time. Companion PyPI
    release: `dabbler-ai-router` 0.7.0.
  - **0.19.0** (Set 034) — Session Set Explorer honesty pass;
    per-row orchestrator-tracking accordion + ActionRegistry
    orchestrator group RETIRED from the UI surface, replaced by a
    bold color-coded progress-fraction list-icon and a cursor-
    anchored popup right-click menu; bucket-level collapse remains
    as the sole expand/collapse affordance; the cascading-checkout
    preview is saved as an artifact for Set 036+ reactivation. No
    companion PyPI release this set.
  - **0.18.1** (Set 035) — state-file sole truth for cancellation /
    restoration extended from the Set 033 H2 verdict (orchestrator
    block) to the cancellation lifecycle. See below for the prior
    Set 035 description.

- Previous: **v0.23.0** (Set 048 — Lightweight-tier parity.
  Companion PyPI release: `dabbler-ai-router 0.10.0`). Full
  description preserved in the version walk above.

- Pre-Previous: **v0.22.0** (Set 047 — state-file schema v4 audit.
  Companion PyPI release: `dabbler-ai-router 0.9.0`). Full
  description preserved in the version walk above.

- Pre-Pre-Previous: **v0.21.0** (Set 045 — log-harvest implementation.
  Companion PyPI release: `dabbler-ai-router 0.8.0`). Full
  description preserved in the version walk above.

- Pre-Pre-Pre-Previous: **v0.18.1** (Set 035 — state-file sole truth for
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
