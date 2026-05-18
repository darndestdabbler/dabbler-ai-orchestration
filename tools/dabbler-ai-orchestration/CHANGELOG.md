# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.14.0] — 2026-05-17 (GA)

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
