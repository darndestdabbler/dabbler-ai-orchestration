# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
