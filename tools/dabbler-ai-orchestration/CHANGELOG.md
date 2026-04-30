# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
