# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.15.0] — 2026-05-18 (Set 029 Session 3 — per-session-set identity)

### Changed — orchestrator-marker identity model (BREAKING within the v0.14.2 preview)

- **Marker schema bumped to v3.** New top-level `sessionSetSlug` field
  carries the slug of the session set the marker belongs to. The
  reader validates `sessionSetSlug` against the resolved set before
  rendering; a mismatch falls back to the empty-state CTA (treats the
  marker as orphaned).
- **Per-session-set marker path.** Markers now live at
  `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
  instead of the legacy global `~/.dabbler/current-orchestrator.json`.
  Three parallel VS Code windows on three different consumer repos
  now render their own correct orchestrator state — the cross-window
  contamination bug from the v0.14.2 preview is eliminated.
- **Walk-up resolver in `scripts/write-orchestrator-marker.js`.** The
  writer walks up from `cwd` looking for `docs/session-sets/`, then
  scans subdirectories for the single set whose `session-state.json`
  reports `status: "in-progress"`. The reader runs the same algorithm
  rooted at the workspace folder.
- **Fail-closed posture.** When zero or more than one in-progress
  sets are resolvable (or no `docs/session-sets/` directory is reachable
  from `cwd`), the writer SKIPS the write and appends a diagnostic
  line to `~/.dabbler/orchestrator-writer.log` (which stays global so
  one log captures every writer attempt across every session set).
  No workspace-level orphan marker is created. The renderer surfaces
  its existing empty-state CTA on the same conditions.
- **Watcher re-binding on set transitions.** The indicator now watches
  every workspace `docs/session-sets/*/session-state.json` file in
  addition to the resolved per-set marker, so close-out flips and
  start_session events trigger an immediate re-resolution + re-render.
- **`.gitignore` self-protection.** On first write, the writer drops
  a `.gitignore` containing `*\n!.gitignore\n` into the per-set
  `.dabbler/` directory. The workspace's root `.gitignore` does not
  need to be patched for the marker file to stay untracked —
  consumer repos inherit the protection automatically. This canonical
  repo's `.gitignore` also lists `docs/session-sets/*/.dabbler/` as
  belt-and-suspenders.
- **`SessionSetsModel` data-layer extraction.** Pulled `progressText`,
  `isCurrentSessionInFlight`, `iconUriFor`, `needsMigrationBadge`,
  `forceClosedBadge`, `bucketSets`, `sortBucket`, and friends out of
  `SessionSetsProvider.ts` into `src/providers/SessionSetsModel.ts`.
  The provider is now a thin VS Code adapter; the model is the
  canonical home and is what the Set 029 S4 custom webview tree will
  consume. Existing callers continue to import from
  `SessionSetsProvider` via re-exports — no breakage.

### Removed

- **Legacy global marker path.** `~/.dabbler/current-orchestrator.json`
  is no longer read or written. Operators who installed the v0.14.2
  Claude Code hook must re-run `Dabbler: Install Orchestrator Hook
  (Claude Code)` to pick up the new walk-up resolver in the helper
  script (the installer is idempotent; helper-script path unchanged).
  Acceptable because v0.14.2 never shipped to Marketplace — no
  external consumer is affected.

### Known limitations

- **Wrong-set attachment (R8).** A stale `session-state.json` that
  lingers as `in-progress` after a forgotten close-out causes the
  walk-up resolver to attach the marker to the wrong work. Mitigation
  in this release: the indicator's hover tooltip surfaces the
  resolved set slug so the operator can spot the mismatch. Set 029 S4
  may add a small "attached to: \<slug\>" badge in the gauge frame.
- **`.gitignore` auto-patch (R9).** Workspaces that haven't been
  re-initialized still have their root `.gitignore` un-patched. The
  per-set `.dabbler/.gitignore` self-protection covers this case —
  the marker file stays untracked even without the root patch.

### Documentation

- **`docs/orchestrator-marker-schema.md`** — new file documenting the
  v3 marker shape, the per-set path, the walk-up resolver algorithm,
  the fail-closed posture, and the migration from the legacy v2
  global marker.

### Set 029 mid-set pivot (2026-05-18, S3 spec basis)

Cross-provider audit reshaped Set 029 from 4 → 6 sessions. Audit +
decisions:
[`docs/proposals/2026-05-18-custom-tree-pivot/`](../../docs/proposals/2026-05-18-custom-tree-pivot/)
(proposal.md, GPT-5.4 + Gemini Pro consensus, synthesis.md,
s3-spec-delta.md). The custom-tree pivot (replacing the native
`dabblerSessionSets` TreeView with a webview-rendered accordion that
embeds the gauges into each in-progress set's row) is S4 with its own
pre-session audit. Non-Claude provider detection is S5; README +
Marketplace publish is S6.

## [0.14.2] — 2026-05-18 (Set 029 Session 2 — orchestrator indicator gauges, Claude-only v1 preview)

### Added — Set 029 Session 2 deliverables (Claude Code surface only)

- **Orchestrator Indicator webview view.** New "Orchestrator" view
  pinned above the Session Sets tree in the Dabbler AI Orchestration
  view container. Renders two side-by-side semi-circle CSS gauges
  driven by `~/.dabbler/current-orchestrator.json`:
  - **Left gauge: Model.** Needle position encodes
    tier-within-provider (low/mid/flagship → red/yellow/green per
    Set 029 D5 — red=warning, green=preferred — inverts the
    conventional "red=expensive" mapping because the operator's
    stated failure mode is *forgetting to switch back up*, not
    overspending).
  - **Right gauge: Effort.** Five normalized levels (Low / Medium /
    High / Extra-High / Max) plus a binary Thinking-on LED.
- **Visual-treatment matrix per signalKind** (Set 029 audit
  §"Visual treatment by signalKind" REVISED 2026-05-18):
  - `current`: solid fill + solid rim + no badge
  - `configured-default`: ~85% opacity + dashed rim + "DEFAULT" pill
  - `last-observed`: hollow rim + filled needle + clock-icon overlay
    + "(last /think Xm ago)" suffix
  - `manual`: solid fill + operator-icon overlay
  - **stale** (signal-agnostic, ≥`stalenessMaxSec` default 8h):
    diagonal-stripe overlay at 50% opacity over whatever the
    underlying treatment is. No install-CTA on stale (only on
    missing marker, per audit Q6).
- **Tooltip copy embeds confidence explicitly:** "live signal (high
  confidence)", "live signal (low confidence — hook payload missing
  model)", "configured default (medium confidence — does not track
  runtime changes)", "last observed Xm ago via /think (high
  confidence in detection, but may not reflect current message)",
  "set manually (high confidence)".
- **`Dabbler: Install Orchestrator Hook (Claude Code)` command.**
  Idempotently adds `SessionStart` (matchers: startup / resume /
  clear / compact) and `UserPromptSubmit` hooks to
  `~/.claude/settings.json` that pipe the hook payload to
  `scripts/write-orchestrator-marker.js`. The SessionStart hook
  writes `signalKind: "current"` + Medium effort default; the
  UserPromptSubmit hook detects `/think` / `/megathink` /
  `/ultrathink` prefixes in the prompt and updates effort to
  `last-observed`. Re-running the command upgrades the helper path
  in place; foreign hooks the operator may have configured are
  preserved verbatim.
- **`Dabbler: Set Orchestrator Model & Effort` command (stub).**
  Surfaces a "coming in the next release (Session 3 of Set 029)"
  message with a one-click jump to the Claude installer. The full
  MRU + multi-step + hotkey-bindable implementation lands in 0.14.3.
- **`Dabbler: Open Orchestrator Writer Log` command.** Opens
  `~/.dabbler/orchestrator-writer.log` for diagnosing skipped marker
  writes (e.g., a Codex configured-default signal blocked by a fresh
  Claude SessionStart per the multi-writer precedence policy).
- **`scripts/write-orchestrator-marker.js` helper.** Multi-mode
  marker writer:
  - `--mode session-start` — full marker write with model + Medium
    default effort. Confidence-low producer rule: if the payload's
    `.model` is missing/null/unparseable, emits `confidence: "low"`
    + `model: "unknown"` + `modelDisplayName: "Claude (model unknown)"`
    so the tooltip can surface the low-confidence reason.
  - `--mode user-prompt-submit` — preserves top-level signal, updates
    only `effort.*` based on the detected `/think*` prefix. Bootstraps
    a Medium-default Claude marker if none exists. Exits cleanly
    (no write) on prompts without a `/think*` prefix.
  - `--mode manual` — sets `signalKind: "manual"` + `confidence: "high"`.
  - `--mode configured-default` — sets `signalKind: "configured-default"`
    + `confidence: "medium"`. Used by Session 3's Codex watcher.
  - `--force-override` — bypasses the precedence check (manual
    quickpick uses this with operator confirmation).
- **Multi-writer precedence** (Set 029 audit §"Multi-writer
  precedence"): every writer reads existing marker, compares
  signalKind precedence (`current` > `manual` > `last-observed` >
  `configured-default`), re-reads immediately before the atomic
  write+rename (to close the TOCTOU race window), and skips the
  write if the proposed signal is weaker than a fresh existing
  signal. Stale signals (>`stalenessMaxSec`) never block a fresh
  write. Skipped writes are appended to
  `~/.dabbler/orchestrator-writer.log` with `{timestamp, writer,
  proposed, existing, reason}` for operator diagnostics.
- **Windows-aware retry loop on atomic write** (Set 029 R5 REVISED
  2026-05-18): 5 attempts total (initial + 4 retries) at 50 / 200 /
  600 / 1200 ms backoff between attempts, ~2050 ms total ceiling.
  Handles `PermissionError` / `EBUSY` contention with the VS Code
  file watcher on `~/.dabbler/current-orchestrator.json`.
- **Effort resets to Medium on every `SessionStart`** (Set 029 R7
  pre-implementation verification PASSED 2026-05-18 via official
  Claude Code hooks docs at https://code.claude.com/docs/en/hooks):
  `/clear` fires `SessionStart` with `source: "clear"` AND
  `/clear` is a fresh-session boundary (`/think*` is per-message,
  not a persistent session setting). Both R7 conditions are TRUE,
  so the SessionStart hook clobbers any existing `last-observed`
  effort signal back to Medium across all four source values
  (`startup`, `resume`, `clear`, `compact`).

### Known limitations (Claude-only v1 preview)

- **Starting model only.** The SessionStart hook fires on session
  boundaries (startup / resume / clear / compact) — mid-session
  `/model` changes are NOT auto-detected in v1 because the Claude
  Code hook payload's `model` field only exists on `SessionStart`,
  not on per-turn hooks. Use `Dabbler: Set Orchestrator Model &
  Effort` as the recovery path when this happens (lands fully in
  Session 3 of Set 029; stub in 0.14.2).
- **Container height cannot be guaranteed.** Per audit S3, VS Code's
  `contributes.views` schema has no `initialSize` property; ordering
  and sizing are best-effort. The webview CSS sizes content to fit
  within 100px, but if the operator has previously dragged the view
  divider, VS Code restores that height. To reset, drag the divider
  back. Content remains scrollable (`overflow: auto`) if compressed
  below 100px.
- **Non-Claude orchestrator surfaces (Codex, Gemini Code Assist,
  GitHub Copilot) ship in 0.14.3** (Session 3 of Set 029). v1 marker
  schema supports them, but the writers and config-file watchers
  are not yet implemented. Operators using non-Claude surfaces will
  see the "No signal — install hook" empty state until they manually
  seed the marker file (or until 0.14.3 ships).
- **Codex config.toml watcher and the universal manual-override
  quickpick (MRU + hotkey-bindable args + force-override
  confirmation) all ship together in 0.14.3.** The 0.14.2 stub for
  `Dabbler: Set Orchestrator Model & Effort` surfaces an
  informational dialog rather than a quickpick.
### Post-S2 polish — operator-feedback round 2 (2026-05-18)

After viewing the standalone `C:\temp\orchestrator-gauges-preview.html`
that Session 2 generated, the operator flagged three more issues and
asked for the mismatch warning to be wired up. All addressed before
Session 3:

- **Container query replaces `@media (max-width: 260px)`.** The
  responsive wrap fired against the BROWSER viewport, not the panel
  width — useless in a wide browser window where only the side-bar
  panel was being resized (the failure mode the operator caught in
  the preview). Switched to `@container (max-width: 260px)` with
  `container-type: inline-size` on `.container`. The wrap now fires
  when the panel itself narrows, regardless of browser viewport.
- **Thinking LED repositioned to the gauge wrapper, not the cell.**
  The LED was at `right: -3px` relative to `.gauge-cell`, but the
  cell stretches to the grid column width (~140px+), so the LED was
  floating in the column gap rather than next to the gauge — looked
  like the LED wasn't there at all. Introduced a `.gauge-svg-wrap`
  positioned div around the SVG; the LED, clock-overlay, and
  operator-overlay now anchor to the gauge's top-right corner.
- **Switched to IBM colorblind-safe categorical palette.** The
  audit-locked D5 red→green polarity ("Haiku is red, Opus is green")
  was semantically wrong — Haiku is the right pick for cheap tasks,
  not a failure state. Replaced with the IBM 5-color colorblind-safe
  palette (`#648FFF` blue, `#785EF0` purple, `#DC267F` magenta,
  `#FE6100` orange, `#FFB000` yellow). Tiers and effort levels both
  draw from this palette; gauge color is now purely categorical
  encoding (which level, not good/bad). The Thinking LED also moved
  to IBM purple when on.
- **Mismatch badge driven by `ai-assignment.md`.** When the active
  session set's `ai-assignment.md` recommends a different
  orchestrator than the current marker (provider, model, OR effort),
  a `≠ recommended` badge appears next to the last-updated annotation
  at the bottom of the indicator. Tooltip enumerates which axes
  differ. **Valence-neutral by design** per operator directive:
  higher-than-recommended is sometimes intentional (extra credits,
  task harder than anticipated), lower might be intentional too.
  The badge surfaces the difference; the operator decides. No color
  warning. The badge is sourced from `ai-assignment.md` parsed via
  a regex against the `## Session N` heading + `### Recommended
  orchestrator` block; defensive — any parse failure (missing file,
  malformed text) silently falls back to no badge.

The audit-locked D5 ("red = low-tier, green = flagship") phrasing is
now **superseded** alongside D3 (the 100px → 150px revision earlier
in S2). Both are documented as in-flight design relaxations the
operator drove during on-device review; the audit-summary.md still
shows the original D3/D5 text with revision notes pointing at this
CHANGELOG.

### Mid-S2 sizing + responsive-wrap revision (operator feedback 2026-05-18)

After seeing the rendered gauges in the Playwright diagnostic, the
operator flagged two issues that were addressed in-session:

- **Effort gauge "Medium" rendered with a too-short color arc.**
  Medium's needle was at -120° (~1/3-filled arc) while the Model
  gauge for Opus rendered at -30° (~5/6-filled arc) — a jarring
  visual imbalance. Re-centered the 5-level effort scale so Medium
  sits at the gauge center (-90°) with the other levels redistributed
  around it: Low -150°, High -60°, Extra-High -35°, Max -15°. Medium
  is now the "neutral half-fill" default that matches the design
  intent (it's the lagging-signal-resistant fallback per Q1).
- **Gauges + fonts bumped ~40-50% for legibility.** Gauge SVG width
  70 → 100px (height 54px), gauge-cell font 10 → 14px, gauge-suffix
  9 → 12px, last-updated 9 → 12px, empty-state 11 → 14px,
  default-pill 8 → 10px, clock/operator overlays 11 → 14px, thinking
  LED 7 → 10px. Container max-height bumped 100 → 150px to match.
- **Responsive wrap added.** When the panel is below 260px wide, the
  CSS grid switches from `1fr 1fr` to single-column so the second
  gauge stacks below the first instead of being squished into an
  unreadable sliver. Matches operator's stated workflow of
  resizing side-bar panels regularly.

### Implementation notes

- **Spec drift correction (versioning).** Set 029 spec.md Session 2
  step 8 directed a 0.13.17 → 0.13.18 bump, authored before Set 030
  shipped its 0.14.x line. Current is 0.14.1; this release bumps
  patch to 0.14.2. The spec-locked S3 → 0.14.0 and S4 → 0.14.1
  progression shifts to S3 → 0.14.3 and S4 → 0.14.4 (or 0.15.0 if
  the feature warrants a minor at publish).
- **Playwright tests live at `src/test/playwright/`,** not the
  prospective `tests/playwright/` the spec text mentioned. Aligned
  to the existing `playwright.config.ts` `testDir`. Seven scenarios
  added in `orchestrator-indicator.spec.ts`: current Opus, low-tier
  Haiku, low-confidence tooltip, last-observed effort with clock
  overlay + elapsed suffix, configured-default with DEFAULT pill
  (and NO stripes — REVISED 2026-05-18 audit decision), 9h-stale
  state, empty-state CTA, plus a non-Electron helper-precedence
  smoke that runs the script directly.

## [0.14.1] — 2026-05-17 (GA hotfix — Linux build casing)

### Fixed

- **Linux CI build failure: `SessionSetsProvider.ts` import casing.**
  The 0.14.0 commit normalized five imports to the lowercase form
  `./providers/sessionSetsProvider` while the file on disk in git is
  `SessionSetsProvider.ts` (capital S). On Windows this worked because
  the filesystem is case-insensitive; on Linux runners the lowercase
  import resolved to nothing and esbuild errored with "Could not
  read from file: .../providers/sessionSetsProvider.ts." This hotfix
  reverts the five imports to capital `SessionSetsProvider`. Affected
  files: `src/extension.ts` and four test files under `src/test/`.
- The `vsix-v0.14.0` tag's CI build never produced a Marketplace
  artifact; 0.14.1 is the first Marketplace-published version of the
  Session 5 deliverables. Functionally identical to 0.14.0 as
  documented below.

## [0.14.0] — 2026-05-17 (GA — never published; superseded by 0.14.1)

### Added — Session 5 deliverables

- **In-extension lazy migration UX for v2 → v3 state files.** Tree
  rows whose `session-state.json` is still v2 (or broken-v3) render
  a "(needs migration)" badge. Right-clicking exposes a new
  "Migrate to v3 schema" command with a quickpick offering three
  strategies: "Use spec.md headings" (regex, zero cost, default),
  "Use AI to refine titles" (routes via `ai_router`,
  ~$0.05/spec, opt-in with cost-confirmation modal), and "Use
  generic labels" (fallback). All three strategies share the same
  Python migrator entry point (`migrate_one_set`) via subprocess,
  so the in-extension migrator and the bulk CLI emit identical
  files set-for-set.
- **AI failure modes get kind-specific notifications.** Per
  cross-provider design audit (2026-05-17), each AI-strategy
  failure has its own action code and operator-actionable
  message: missing provider credentials (instructs which env var
  to set), provider error (rate limit / network — instructs to
  retry), bad output (the model returned non-JSON or wrong shape
  — instructs to retry once or fall back to regex), count
  mismatch (the model returned the wrong number of titles —
  instructs to edit spec.md or use deterministic strategies).
  Distinct from malformed-input-state errors so "your file is
  broken" never overlaps with "the model answered badly."
- **Activation-time scanState lifecycle ("loading" → "ready").** A
  new `ScanState` manager publishes a `dabblerSessionSets.scanState`
  context key. The tree provider renders a "Setting up your
  project…" sentinel TreeItem with the Dabbler icon during the
  loading window; the `viewsWelcome` "No session sets" CTA is now
  gated on `scanState == ready`, eliminating the welcome-CTA
  flash on first activation. The setImmediate flip happens on the
  same tick activation returns, so the loading window is brief on
  warm filesystems and unmissable on cold ones.

### Changed

- Mock SessionSet objects in the test suite gained the new
  required `needsMigration` field. The `SessionSet.needsMigration`
  flag is set by `readSessionSets()` whenever the parsed state
  file lacks `schemaVersion: 3` or has v3 but with a missing
  `sessions[]` array — the same heuristic the bulk migrator's
  ACTION_SKIPPED_MALFORMED case uses.

### Release notes

- **`0.14.0` is the Session 5 GA release.** Published to the
  Marketplace in lockstep with `dabbler-ai-router` 0.4.0 so the
  in-extension migrator's AI-strategy quickpick connects to a
  Python migrator that knows how to handle `--strategy ai`.
- Operators upgrading from any prior 0.13.x version see no
  disruption — v2 state files continue to render correctly; the
  new badge surfaces sets that *could* be migrated, but migration
  remains operator-driven. No automatic background rewrites.

## [0.14.0-rc.1] — 2026-05-17 (release candidate, not published)

### Added

- **`session-state.json` schema v3 support (Set 030).** The Session
  Set Explorer reads v3 files via the new `progress.ts` helper
  (Session 1); the TypeScript writer in `sessionState.ts` emits the
  v3 dual-write shape from Session 2. Status terminology now unified
  on `"complete"` across the JSON schema and the operator-visible
  Explorer display.

### Changed

- **Explorer label: "Done" → "Complete" (Set 030 Session 3, per
  spec D3).** The fourth bucket header in the Session Sets Explorer
  is now "Complete" (was "Done"). Aligns the tree's vocabulary with
  the v3 schema's `status: "complete"`. The TypeScript
  `SessionState` union literal followed the same rename across 24
  test fixtures.
- **v2 state files render correctly during the migration window.**
  The Explorer's read path is permanently v2-tolerant; the tree
  provider's count-derivation uses `read_progress()` (a new TS
  helper) so v2 files with missing `completedSessions[]` no longer
  bucket as "In Progress" — they now bucket correctly based on the
  v3 invariant projection (closed sets to Complete with [FORCED]
  badge per the v2-bare-snapshot rule from Session 3).

### Schema

- The extension's `SessionState` types and reader path now use the
  v3 `sessions[]` ledger internally. The legacy
  `currentSession` / `totalSessions` / `completedSessions` fields
  are read only through approved compatibility helpers (D13 lint
  rule, enforced by the Mocha suite).

### Release notes

- **`0.14.0-rc.1` is the Session 4 release candidate.** Not
  published to the Marketplace. The GA build (`0.14.0`) ships with
  Session 5 after the in-extension migration UX (loading state +
  per-set "(needs migration)" badge + Migrate-to-v3 command) lands.
  Publishing the RC would expose operators to v2 state files
  without the lazy-migration UX, so the publish moves to S5.
- Internal smoke test only: `npx vsce package` + side-load the
  VSIX into a clean VS Code instance.

## [0.13.17] — 2026-05-16

### Changed
- **Electron launch environment: blocklist → allowlist (Set 028 Session 2).** 
  Previously, `_electronEnv()` started from full `process.env` and blocked only
  known VS Code IPC vars (`ELECTRON_RUN_AS_NODE`, `VSCODE_*` prefix). Now uses
  an explicit allowlist of safe vars: universal (PATH, HOME, TEMP, LANG, TERM),
  Windows-specific (SYSTEMROOT, APPDATA), and GUI/locale (DISPLAY,
  WAYLAND_DISPLAY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR, etc.). This
  guards against future IDE host pollution if new IPC vars are added. Blocklists
  are brittle; allowlists are maintainable.

## [0.13.16] — 2026-05-16

### Added
- **Layer 2 tree-provider e2e harness (Set 027 Session 3).** New suite
  at `src/test/suite/e2e/` (5 test files, 20 scenarios) drives the
  Python harness shim through real start/close CLIs and asserts on
  `SessionSetsProvider.getChildren()` output. Covers happy-path,
  cancel/restore, force-close, multiset, and sibling-worktree
  bucketing. Pins two pre-existing drift classes: (1) fresh-set
  `completedSessions[]` omission disables Set 022's in-flight
  annotation on session 1; (2) `isMidSetComplete` downgrades
  force-closed mid-set snapshots to In Progress regardless of
  `forceClosed` / `status` (truthful-display invariant). Neither
  shipped a fix in this set — both deserve targeted reader/writer
  work.
- **Layer 3 Playwright Electron rendering smoke (Set 027 Session 4).**
  New suite at `src/test/playwright/treeView.spec.ts` (5 scenarios)
  launches a real VS Code Electron instance via Playwright's
  `_electron.launch`, opens the Session Sets activity-bar view, and
  asserts on rendered text — bucket headers (`In Progress (N)`,
  `Not Started (N)`, `Done (N)`, `Cancelled (N)`), `[FORCED]` badge,
  `session N in flight` annotation, `N/N` progress text. Bypasses
  the @vscode/test-electron runner (broken on Windows 11 + VS Code
  1.120 since Set 027 Session 3) by driving the cached `Code.exe`
  binary directly. Runs in ~90s for 5 tests.
- **`test:playwright` npm script** — `npm run test:playwright` runs
  the Layer 3 suite. Each test owns a fresh user-data-dir and
  extensions-dir; tests run serially (workers=1) to avoid
  user-data-dir lock contention.

### Changed
- **Extension shipped against `ai_router` 0.3.1** (was 0.3.0). 0.3.1
  is functionally identical to 0.3.0 for PyPI consumers — the patch
  bump exists to let the extension's version floor track the
  repo-side test harness Set 027 added (`ai_router/tests/e2e/`),
  which is excluded from the published wheel. No public-API changes.

## [0.13.15] — 2026-05-15

### Removed
- **`outsourceMode` config field and the entire queue-mediated verifier
  daemon path (Set 026 Session 1).** The `OutsourceMode` TypeScript
  type, the `outsourceMode` field on `SessionSetConfig`, the `Mode:
  outsource-<x>` tooltip line, and the `modeBadge` text are gone.
  Specs that previously declared `outsourceMode: first` or `last` will
  have the field ignored on read; no behavior change for first-mode
  consumers since first was the default.
- **Reversal of v0.13.14's "the CLIs stay" promise.** v0.13.14's
  CHANGELOG noted the Provider Queues / Heartbeats *views* were
  removed but said the underlying Python CLIs would stay. v0.13.15
  removes those CLIs (`python -m ai_router.queue_status`,
  `python -m ai_router.heartbeat_status`,
  `python -m ai_router.queue_db`, `python -m ai_router.daemon_pid`,
  `python -m ai_router.orchestrator_role`,
  `python -m ai_router.verifier_role`,
  `python -m ai_router.restart_role`,
  `python -m ai_router.role_status`,
  `python -m ai_router.capacity`) along with the underlying modules.
  Justification: Marketplace download count remains at 3 (all
  operator's own); the cost of carrying unused infrastructure
  exceeded the cost of a fast reversal. Restoration is git-revert-able
  from Set 026 Session 1.

### Changed
- **Extension shipped against `ai_router` 0.3.0** (was 0.2.5). The
  router package's breaking change is the public removal of
  `ModeConfig`, `OUTSOURCE_MODES`, `ROLE_VALUES`,
  `DEFAULT_OUTSOURCE_MODE`, `parse_mode_config`, `read_mode_config`,
  `validate_mode_config`, `QueueDB`, `VerifierDaemon`,
  `OrchestratorDaemon`, and the `mode=` / `queue_base_dir=` parameters
  on `route()`.

### Notes
- **Partial release — Session 1 of Set 026 only.** The extension
  bumps to v0.13.15 to reflect the breaking change in the TypeScript
  surface, but docs scrubs (workflow doc, adoption-bootstrap,
  authoring-guide, close-out.md, spec-md-schema) and the 26 historical
  `spec.md` `outsourceMode:` config-line scrubs are deferred to a
  follow-up session. The acceptance criterion "zero hits for
  outsourceMode / queue_db / verifier daemon / subscription cli via
  `git grep`" is NOT yet satisfied — narrative references remain in
  docs and historical specs. Sessions 2–6 of Set 026 (YAML schema,
  resolver, config-editor webview, sections, significance flagging,
  release) are the rest of the work.

### Added (Session 7 — wizard integration + test notification + release)

- **Wizard "Configure AI Router" button** — `Dabbler: Get Started` now includes
  a "Configure AI Router" button that opens the config editor directly. Wired
  via a new `openConfigEditor` webview message case in `WizardPanel.ts`.
- **"Send a test notification now" button (§5 Notifications)** — the button that
  was rendered but disabled in Session 5 is now enabled and wired. Clicking it
  spawns a Python subprocess that calls `send_pushover_notification()` from
  `ai_router/notifications.py`, using the API-key and user-key env var names
  configured in `local-overrides.yaml` (defaulting to `PUSHOVER_API_KEY` /
  `PUSHOVER_USER_KEY`). Success surfaces the Pushover request ID via an info
  notification; failure surfaces the error message. The Python process inherits
  the VS Code process environment, so both standard and custom env var names
  resolve correctly.
- **`docs/quick-start.md` — "Configuring your project" section** — new section
  covering the config editor command, a table of all six sections, and the
  shared/local split for sensitive fields.
- **`docs/adoption-bootstrap.md` — "Configuring the AI router visually" closing
  pointer** — Step 9 closing pointers (Full tier) now include the config editor
  as the recommended ongoing-tuning surface alongside the local-overrides note.
- **`CLAUDE.md` — Router-config editor subsection** — documents the editor's
  file layout and key files for future session-level context; version line
  updated to v0.13.15.

### Added (Session 6 — significance flagging)

- **`dabbler.flagDecisionForReview` command** — operator-invoked input box
  prompts for a one-line reason, appends one JSON line to the active
  session set's `decision-review-queue.jsonl`. With no in-progress set,
  surfaces an info notification and exits cleanly. The "Run command
  now..." button in the config editor's §4 section is now wired to
  this command unconditionally (the Session-5 graceful-fallback branch
  is gone).
- **`dabbler.scanAnnotationsForActiveSet` command** — walks workspace
  source files (ts/tsx/js/py/go/rs/java/cs/cpp/sh/yaml/toml/...) for
  `# @dabbler:outsource-review("...")` or `// @...` annotations,
  deduplicates against the existing queue (file+line+reason), and
  appends new findings. Honors
  `local-overrides.yaml → decision_review.honor_annotations` (default
  `true`; setting `false` makes the scan a no-op with an info
  notification).
- **`src/configEditor/annotationParser.ts`** — pure annotation regex
  parser. `findAnnotations(text, filePath)` returns one entry per match
  with `{ts, reason, source: "annotation", file, line}`; supports
  escaped quotes and backslashes inside the reason and CRLF line
  endings. `deduplicateAnnotations(incoming, existing)` filters out
  collisions keyed on `file+line+reason`.
- **`src/commands/decisionReviewQueue.ts`** — pure helpers shared by
  both commands (`appendQueueEntry`, `findActiveSessionSetDir`,
  `QueueEntry` type). Split from the vscode wiring so the helpers can
  be unit-tested via plain mocha + ts-node.
- **`src/commands/annotationScanner.ts`** — pure helpers for the scan
  command (`scanFilesForAnnotations`, `loadHonorAnnotationsToggle`,
  `loadExistingQueueEntries`, `SCAN_GLOB`, `SCAN_EXCLUDE_GLOB`). Same
  unit-testability rationale.

## [0.13.14] — 2026-05-15

### Removed
- **Provider Queues and Provider Heartbeats tree views (Set 024).** Both
  views, their five commands
  (`dabblerProviderQueues.refresh` / `.openPayload` / `.markFailed` /
  `.forceReclaim`, `dabblerProviderHeartbeats.refresh`), their menu
  contributions, and their six configuration properties under
  `dabblerProviderQueues.*` and `dabblerProviderHeartbeats.*` are gone.
  These views were scaffolding for the `outsourceMode: last`
  (subscription-CLI verifier daemon) path; no session set in this repo
  has declared `outsourceMode: last`, and the persistent yellow
  warning triangle that surfaced on every refresh ("Failed to read
  queue status. queue_status exited 1 …") was worse UX than no view at
  all. The Python CLI surface (`python -m ai_router.queue_status` and
  `python -m ai_router.heartbeat_status`) stays — operators who run
  outsource-last in other repos can still invoke those commands from a
  terminal, and `ai_router/docs/two-cli-workflow.md` still documents
  the path. The shared `dabblerSessionSetsContainer` activity-bar
  container stays for the Session Sets view.
- Five TypeScript source files
  (`ProviderQueuesProvider.ts`, `ProviderHeartbeatsProvider.ts`,
  `queueActions.ts`, and the two corresponding test suites) plus
  `utils/pythonRunner.ts` (now unused after the providers and
  `queueActions` that called it were removed).
- The "Falls back to `dabblerProviderQueues.pythonPath` if unset"
  fallback sentence on `dabblerSessionSets.pythonPath`'s markdown
  description, and the corresponding code-side fallback in
  `installAiRouterCommands.ts → resolvePythonPath`. Operators who want
  to point the install command at a venv interpreter should set
  `dabblerSessionSets.pythonPath` directly.

### Migration

If you had set `dabblerProviderQueues.pythonPath` or
`dabblerProviderHeartbeats.*` keys in your user or workspace settings,
those entries become orphaned on upgrade and are no longer consulted.
Remove them, or — if you were using `dabblerProviderQueues.pythonPath`
to point the install command at a venv — rename the key to
`dabblerSessionSets.pythonPath` so the install command continues to
honor it.

## [0.13.13] — 2026-05-15

### Changed
- **`isMidSetComplete` now consults `completedSessions[]` as an
  alternative authoritative whether-closed signal to the events
  ledger (Set 023 Session 4).** When the snapshot's
  `completedSessions[]` includes `currentSession`, the guard accepts
  the snapshot as Done even if `session-events.jsonl` lacks a
  corresponding `closeout_succeeded` event. This is the migration
  shape Set 022 promised: a pre-Set-022 set whose operator hand-adds
  `completedSessions: [1..N]` to its snapshot now displays as N/N
  Done in the Session Set Explorer without also needing to synthesize
  a final-session ledger event via `--repair --apply`. The legacy
  ledger-only path is preserved for sets that don't carry the array.

### Added
- **Observability warn when the array overrides a missing ledger
  closeout.** When `completedSessions[]` says the final session is
  closed but the events ledger does not, `isMidSetComplete` emits a
  one-line `console.warn` of the form
  `[session-set <slug>] completedSessions[] overrides missing ledger
  closeout for session N`. The override is correct; the warn surfaces
  the drift shape so an operator who wants the ledger healed too can
  run `--repair --apply` (which, as of `ai_router 0.2.4`, preserves
  the operator-attested array while synthesizing the missing event).

### Docs
- `docs/session-state-schema.md` "Parser cheat-sheet" now documents the
  new array-before-ledger ordering in the bucketing guard, plus the
  sharpened invariant phrasing: `completedSessions[]` is authoritative
  for *whether* a session is closed; the events ledger is authoritative
  for *when* each closeout was recorded. Future maintainers should not
  read "both are authoritative" as "must agree" — they are alternative
  whether-closed signals.
- `ai_router/docs/close-out.md` § 5 drift case 1 gains an attestation
  note: `completedSessions[]` is operator-attested for migrated sets
  and tool-maintained for sets that ran the close-out gate.

## [0.13.12] — 2026-05-15

### Changed
- **Tree-view bucketing and progress display follow the new state-first
  lifecycle protocol shipped in `ai_router 0.2.3` (Set 022 Session 1).**
  The Session Set Explorer reflects four behavior changes:

  1. **`completedSessions[]` is the primary count source.** Reader
     priority is now `completedSessions.length` → distinct
     `closeout_succeeded` session numbers in `session-events.jsonl`
     (new Full-tier fallback) → `totalSessions` when `state === "done"`.
     The pre-existing `currentSession - 1` fallback was removed; the
     writer protocol from Session 1 guarantees the array is present
     after the first boundary write, and the events-ledger fallback
     covers legacy sets that haven't been healed by their next
     boundary write yet. Removing the heuristic eliminates the
     off-by-one classes at both lifecycle endpoints (stuck `0/N`
     at start of session 1; stuck `N-1/N` while the final session is
     wrapping up).

  2. **`activity-log.json` is no longer a count source.** Schema-wise,
     it's a step log, not a progress ledger — and the activity log
     was producing inflated counts on Lightweight-tier sets that
     hand-maintained step entries but no `completedSessions[]`. The
     activity-log read is retained for the `totalSessions` field
     (which the schema places at the file's top level) and per-entry
     `dateTime` (which still informs the `lastTouched` display
     because step-level timestamps are more granular than the
     state-file's session-boundary timestamps while a session is
     mid-flight).

  3. **In-flight row annotation: `0/4 · session 1 in flight`.** A new
     `isCurrentSessionInFlight` predicate in
     `src/providers/SessionSetsProvider.ts` implements the spec
     invariant — `currentSession not in completedSessions[]` means
     session N has started but not closed. When that predicate fires,
     `progressText` appends the annotation so the row visibly
     distinguishes "session 1 in flight" from "no work started yet."
     The predicate requires `completedSessions[]` to be present;
     legacy snapshots without the array stay annotation-free.

  4. **Done row annotation: `4/4 Done`.** The trailing " Done" label
     on done rows distinguishes a healthy final close from a stale
     `N/N` snapshot that's about to be downgraded by
     `isMidSetComplete`. Done is now visibly Done.

- **File watcher coverage extended to `session-events.jsonl` and
  `CANCELLED.md`.** The new Full-tier sessionsCompleted fallback
  reads the events ledger directly, and the boundary writes from
  `start_session` / `close_session` only touch the ledger and the
  state file (not `activity-log.json`) — without the ledger in the
  watcher pattern, a Not Started → In Progress bucket-flip on
  session 1 of a fresh set would wait for the 30-second poll loop.
  `CANCELLED.md` is the canonical signal for the cancelled
  tree-state under Set 8's spec; the watcher now refreshes
  immediately when a cancel/restore command writes it.

- **`LiveSession.completedSessions` exposed through the type
  system.** The tree-view's in-flight predicate computes from
  `liveSession.currentSession` and `liveSession.completedSessions`
  without re-reading the state file. Surfaced as `number[] | null`:
  null for legacy snapshots that pre-date the array; empty array
  when the protocol has been applied but no session has closed yet.

  Set 022 Session 2 / consumer-facing spec:
  `docs/session-sets/022-active-lifecycle-management/spec.md`.

## [0.13.11] — 2026-05-13

### Fixed
- **Tree view no longer shows Done for sets whose final session never
  closed.** The v0.13.8 defensive guard caught the
  `currentSession < totalSessions` drift shape (pre-0.2.1 ai_router and
  manual edits). It missed a different shape observed on
  `unified-master-details-composite` (2026-05-12): snapshot claimed
  `status: complete` with `verificationVerdict: VERIFIED` at
  `currentSession=5/totalSessions=5`, but `session-events.jsonl` had
  `closeout_succeeded` events for sessions 1-4 only — session 5 never
  closed. The pre-existing guard didn't fire (5 is not <5) and the set
  appeared in Done. `isMidSetComplete` in
  `src/utils/fileSystem.ts` now also cross-checks the events ledger: if
  the ledger file exists and has no `closeout_succeeded` event for
  `currentSession`, the snapshot has drifted from the authoritative
  ledger and bucketing downgrades to in-progress. The ledger-existence
  check is critical so Lightweight-tier consumers (no router writer,
  no ledger file) are unaffected — there, the snapshot remains
  authoritative. Two regression tests added in
  `src/test/suite/fileSystem.test.ts`: ledger-gap (downgrades) and
  ledger-complete (remains Done). The root-cause writer bug — how the
  snapshot got written without a corresponding closeout event — is a
  separate ai_router investigation; the tree-view fix defends against
  whatever path produced the drift.

## [0.13.3] — 2026-05-06

### Fixed
- **`requiresUAT` / `requiresE2E` detection no longer silently fails
  for specs with non-canonical headings.** `parseSessionSetConfig`
  in `src/utils/fileSystem.ts` previously fell back to scanning only
  the first 4000 bytes of a spec when the canonical
  `## Session Set Configuration` heading was absent. Specs that put
  their config yaml block under a non-canonical heading like
  `## UAT scope` and had enough upstream prose to push the yaml
  past the 4000-byte cutoff were silently treated as
  `requiresUAT: false`, suppressing UAT badges, the
  "Open UAT Checklist" context-menu item, and any other
  UAT-conditional affordance for the affected sets. Fix: scan the
  entire spec when the canonical heading is absent. The line-
  anchored regex (`^\s*requiresUAT\s*:\s*(true|false)\s*$`) is
  specific enough that false positives from prose mentions are very
  unlikely. Two regression tests added in
  `src/test/suite/fileSystem.test.ts` (positive and negative case).
  Surfaced and fixed during dabbler-ai-orchestration Set 015
  Session 3 (consumer-repo alignment) on `dabbler-platform`'s
  `admin-user-creation-flow` and `admin-users-cross-links` specs.

## [0.13.2] — 2026-05-05

### Fixed
- **Marketplace listing image now displays.** The hero screenshot
  was referenced via a relative path (`media/...`); vsce's
  relative-to-absolute URL rewrite based on `repository.url` did
  not consistently apply on the Marketplace render. The image
  reference now uses an absolute `raw.githubusercontent.com` URL
  so the Marketplace listing renders the screenshot reliably.

### Added
- **Defensive activation wrappers.** Each `register*Commands` call
  in `extension.ts` is now wrapped in its own try/catch with
  `console.error` logging via a `safeRegister` helper. v0.13.1
  shipped without these wrappers; in some workspaces a throw in
  one register group silently skipped the registrations that
  followed (causing "command 'dabbler.showCostDashboard' not
  found" because an earlier register call threw and the cost-
  dashboard / wizard / install-ai-router registrations were
  skipped). The wrappers ensure independent failures and surface
  the exact failing group + error in `Help → Toggle Developer
  Tools → Console` rather than presenting as opaque
  command-not-found at click time. The early-activation steps
  `evaluateContextKeys()` and `bindWatchers()` are also wrapped
  for the same reason.
- **Diagnostic state-bucketing log.** `readSessionSets()` now logs
  a one-line summary per root to the dev console:
  `[dabbler-ai-orchestration] readSessionSets(<root>): N set(s) — done=X, in-progress=Y, not-started=Z, cancelled=W`.
  Helps pinpoint cache / worktree-merge / file-read drift when a
  session set's bucket disagrees with its on-disk
  `session-state.json` status.

### Changed
- **Evidence-based bucketing for "in-progress" status.** A session
  set whose `session-state.json` claims `status: "in-progress"`
  is now bucketed as In Progress only when there's positive
  corroborating evidence — either `session-events.jsonl` contains
  at least one `work_started` event, or `activity-log.json` has
  at least one entry. Without corroboration the status decays to
  Not Started. Implements the principle: "default Not Started;
  require positive evidence to escalate to In Progress / Done /
  Cancelled" (Done is already gated by `change-log.md` presence
  via close_session; Cancelled is gated by `CANCELLED.md`; In
  Progress now joins them). Handles two failure modes: stale
  `in-progress` status from past partial work that was abandoned
  without closing, and migrations / manual edits that flipped the
  status field prematurely.

## [0.13.1] — 2026-05-05

### Fixed
- **Marketplace publish workflow now ships the correct VSIX.** The
  `vsix-v0.13.0` release run inadvertently published the prior
  `0.12.1` VSIX to the Marketplace because two VSIX files were present
  in the build directory at tag-checkout time (the just-built one and
  the canonical sideload artifact committed in Set 014); the upload
  step's `*.vsix` glob captured both, and the publish step's
  lexicographic `head -n1` picked the older one. Workflow now
  version-pins the upload and publish paths to the exact tag-derived
  filename, plus a new defensive build-step gate that fails if any
  extra VSIX is present alongside the just-built one. Marketplace
  v0.13.0 was never actually published; v0.13.1 is the corrected
  release with the v0.13.0 payload (Marketplace-publish workflow,
  runbook, `maxoutClaude` removal).

### Added
- **Empty-state Get Started prompt in the Session Set Explorer.** When
  the active workspace has no `docs/session-sets/` directory or the
  directory is empty, the Session Set Explorer view shows a concise
  welcome message with a one-click **Copy adoption bootstrap prompt**
  link and a pointer at the Get Started wizard. Once any session set
  exists, the welcome content suppresses automatically. Previous
  behavior (relying on the activity-bar Get Started icon and the
  context-menu actions) put the discoverable starting point too far
  from where a first-time user is looking; this change makes the
  empty-state itself a teachable moment.

### Changed
- **`[FIRST]` and `[LAST]` mode badges removed from session-set tree
  rows.** When 99% of sets use the default `outsourceMode: first`, the
  badge becomes visual noise that doesn't differentiate anything. The
  mode still surfaces in the row tooltip on hover for diagnostic
  purposes, and the AI router still consumes the `outsourceMode`
  field from each spec — only the always-visible badge text was
  removed.
- **Marketplace listing README rewritten for the listing page
  audience.** The extension-local README that the Marketplace serves
  on the listing page is now lean, visual-led, and points at the
  GitHub repo for technical depth — replaces the ~600-line technical
  reference that was previously the listing copy. The repo's deep
  documentation is unchanged (still at `docs/repository-reference.md`
  in the source tree); this is purely the Marketplace-facing front
  door.

## [0.13.0] — 2026-05-04

### Added
- **Marketplace-publish-ready release.** This is the first VSIX
  designated for publication to the VS Code Marketplace as
  `DarndestDabbler.dabbler-ai-orchestration`. The publishing
  infrastructure (workflow + runbook) lands in this commit; the
  one-time human-driven publisher account setup + first
  `vsix-v0.13.0` tag push are operator-driven steps that may have
  not yet completed at the time the VSIX is built. Once the publish
  lands, `code --install-extension
  DarndestDabbler.dabbler-ai-orchestration` will resolve from the
  Marketplace.
- `.github/workflows/publish-vscode.yml` — tag-driven publish workflow
  for the VS Code Marketplace and Open VSX Registry. Triggered on
  `vsix-vX.Y.Z` (publish) and `vsix-vX.Y.Z-rcN` (build-only) tags.
  See `docs/planning/marketplace-release-process.md` for one-time
  setup, the per-release checklist, rollback paths, and the
  failure-modes table.

### Removed
- `Dabbler: Copy: Start next session — maxout Claude` command (and the
  matching session-set context-menu entry). The "maxout" suffix as a
  per-session token-window override is no longer surfaced as a
  one-click affordance; the broader `— maxout <engine>` workflow
  concept remains documented in `docs/ai-led-session-workflow.md` for
  operators who want to type the suffix manually.

## [0.12.1] — 2026-05-04

### Added
- `Dabbler: Copy adoption bootstrap prompt` command. Copies a short
  prompt to the clipboard that points an arbitrary AI assistant
  (Claude Code, Gemini Code Assist, GPT-based tools) at the canonical
  online instructions at
  [docs/adoption-bootstrap.md](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md).
  The pasted prompt instructs the AI to gather all decisions in dialog
  with the human, then present a numbered checklist of intended writes
  and configs for batch approval before executing — no per-write
  confirmation prompts. The canonical doc is engine-agnostic
  (capabilities-term tools, no Claude-specific tool names) and runs a
  9-step interactive flow: detect VS Code state, fast-path detection,
  in-flow education, **budget-threshold dialog with four tiers**
  (zero / less than ~$20 / $20–$99 / $100+, mapping to verification
  modes from manual-via-other-engine through outsource-first with full
  API automation), plan alignment, action checklist, execute, and
  closing pointers (budget monitoring, cost dashboard, more-info
  links, next-session trigger phrase).
- `adoption`, `bootstrap`, `onboarding` keywords for Marketplace
  search.
- Extension description now mentions the bootstrap entry point.

### Notes
- This is a single new top-level command with no logic changes to any
  existing command — version bump is a patch (0.12.0 → 0.12.1). The
  next release (Set 012 Session 2's planned Marketplace publish) will
  bump 0.12.1 → 0.13.0.
- This release ships the file format for `ai_router/budget.yaml`
  (documented in the canonical doc) but does not yet enforce
  thresholds or warn on approaching spend — automated enforcement is
  a follow-up set. The bootstrap flow tells the human that monitoring
  is currently manual via `python -m ai_router.report --since
  YYYY-MM-DD` and the cost dashboard.

## [0.11.0] — 2026-04-30

### Added
- `Provider Heartbeats` tree view (Set 5 / Session 3). Reads
  `python -m ai_router.heartbeat_status --format json`. Shows per-provider
  last-completion timestamp and lookback-window completions/tokens. Silent
  providers (no completions in `silentWarningMinutes`, default 30) are
  flagged with a warning icon. The view's description footer carries a
  permanent observational-only disclaimer to discourage misreading the
  view as a routing or capacity signal.
- Mode badges (`[FIRST]` / `[LAST]`) on session-set tree items, derived
  from each spec's `outsourceMode` field. Backward-compat default is
  `first` when the field is absent. Mode also surfaces in the row tooltip.
- Auto-refresh for the heartbeats view (15s default, configurable;
  `0` disables) with rebind on settings change.

## [0.10.0] — 2026-04-30

### Added
- `Provider Queues` and `Provider Heartbeats` view containers in the
  activity-bar (Set 5 / Session 1). Tree implementations land in
  Sessions 2–3; this release wires the manifest-side scaffold so the
  extension still loads while the providers are stubbed.
- Configuration settings for both views: `dabblerProviderQueues.*`
  (auto-refresh interval, Python path, message limit) and
  `dabblerProviderHeartbeats.*` (auto-refresh interval, lookback
  window, silent-provider warning threshold).
- Command IDs for queue refresh, payload inspection, mark-failed,
  force-reclaim, and heartbeat refresh. The extension shells out to
  two new helpers — `python -m ai_router.queue_status` and
  `python -m ai_router.heartbeat_status` — rather than embedding a
  SQLite client of its own.

## [0.9.0] — 2026-04-29

### Added
- TypeScript rewrite with esbuild bundler and strict mode
- Project wizard panel (`Dabbler: Get Started`) — onboarding overview,
  prerequisites checklist, and first-steps guide
- `Dabbler: Set Up New Project` command — git init, folder scaffold,
  optional worktree setup via simple-git
- `Dabbler: Import Project Plan` command — file picker with preview,
  copies plan to `docs/planning/project-plan.md`
- `Dabbler: Generate Session-Set Prompt` command — builds and copies
  an AI prompt to translate a project plan into session-set specs
- `Dabbler: Troubleshoot` command — diagnostic QuickPick covering
  common failure modes (activation, state machine, worktrees, API keys)
- `Dabbler: Show Cost Dashboard` command and toolbar button — reads
  `ai-router/metrics.jsonl`, shows cumulative totals, per-session-set
  breakdown, ASCII sparkline, model mix, and CSV export
- Expense-awareness callout in onboarding panel and after
  session-set prompt generation
- `category: "Dabbler"` on all commands for clean command-palette grouping
- `simple-git` dependency for typed git operations
- Mocha + @vscode/test-electron test infrastructure
- GitHub Actions CI (build + lint + test on push/PR)
- VS Code Marketplace metadata (icon, homepage, bugs, repository, keywords)

### Changed
- Extension renamed from `dabbler-session-sets` / "Session Set Explorer"
  to `dabbler-ai-orchestration` / "Dabbler AI Orchestration"
- Folder renamed from `tools/vscode-session-sets/` to
  `tools/dabbler-ai-orchestration/`
- `engines.vscode` bumped from `^1.70.0` to `^1.85.0`
- Activity-bar container title updated to "Dabbler AI Orchestration"
- All command IDs and setting keys retain the `dabblerSessionSets.*`
  prefix for backwards compatibility with existing consumer repos

### Preserved (no logic changes)
- Session-set tree view (In Progress / Not Started / Done groups)
- State derivation from file presence
- Git worktree auto-discovery
- UAT checklist parsing and badge rendering
- Playwright test discovery
- All existing right-click context-menu commands
- 30-second auto-refresh poll and file watchers
- All three `dabblerSessionSets.*` settings

## [0.8.1] — 2026-04-27

### Fixed
- Version bump for VSIX distribution

## [0.8.0] — 2026-04-27

### Added
- Merged harvester 0.7.1 feature set with platform-specific UAT/E2E gating
- `requiresUAT` and `requiresE2E` spec-level flags
- UAT checklist parsing, pending badge, Open UAT Checklist command
- Playwright test discovery command
- "Copy: Start next session — maxout Claude" variant
- Multi-root / worktree state merging (done > in-progress > not-started)

## [0.7.1] — 2026-04-15

### Added
- Initial harvester session-set explorer
- Git worktree auto-discovery
- Copy trigger-phrase commands
