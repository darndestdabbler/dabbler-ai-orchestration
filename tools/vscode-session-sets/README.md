# Session Set Explorer

VS Code extension that adds an activity-bar tree view of session-set
state for the dabbler-platform AI-led workflow. Reads
`docs/session-sets/<slug>/{spec.md, session-state.json,
activity-log.json, change-log.md, <slug>-uat-checklist.json}` and
renders three groups: **In Progress**, **Not Started**, **Done**.

> **Safe to install in any AI-led-workflow repo, UI or non-UI.** The
> extension's UAT and E2E commands self-hide in workspaces where no
> spec declares `requiresUAT: true` / `requiresE2E: true`. Sets that
> don't carry those flags render as a minimal entry — no UAT badge,
> no UAT/E2E commands, no Playwright lookup. Repos that never want
> these surfaces can hard-disable via the
> `dabblerSessionSets.uatSupport.enabled` / `e2eSupport.enabled`
> settings (see *Settings* below).

## Install

From this folder:

```bash
npm install --global @vscode/vsce   # one-time
vsce package
code --install-extension dabbler-session-sets-*.vsix
```

The extension activates on any workspace containing
`docs/session-sets/`. There is no extension settings UI — it reads
file presence and renders.

## State derivation

State is derived from file presence, mirroring
`ai_router.find_active_session_set()` and
`ai_router.print_session_set_status()`:

| Files present | State |
|---|---|
| `change-log.md` | done |
| `activity-log.json` *or* `session-state.json` | in-progress |
| only `spec.md` | not-started |

`session-state.json` is the **earliest in-progress signal** — it's
written at Step 1 of every session (before any activity-log entry
exists), so a freshly-started set flips to In Progress immediately.

## Worktree auto-discovery

For every workspace folder that is a git repo, the extension scans
the `docs/session-sets/` tree of every other worktree of that repo
(via `git worktree list --porcelain`). This surfaces in-progress
sessions running in sibling worktrees without requiring the user to
add each worktree as a workspace folder.

When the same slug exists in multiple roots (e.g., the main repo
carries the spec while a worktree carries the live activity log), the
higher-state entry wins (done > in-progress > not-started); ties
break on most-recent `lastTouched`.

## Optional UAT and E2E behaviors

All features below are gated on the Session Set Configuration block in
each spec (`requiresUAT`, `requiresE2E`). Sets without the block — or
with both flags `false` — render as the same minimal tree entry the
extension has always shown. No commands or badges appear unless a spec
opts in.

- **Reads the Session Set Configuration block** from each spec's
  `## Session Set Configuration` YAML block. Tolerant: missing block
  = all-false defaults.

- **Pending UAT badge** *(requires `requiresUAT: true`).* Parses
  `<slug>-uat-checklist.json` (best-effort, tolerant of schema drift)
  and shows `[UAT n]` in the row description when `n` items are still
  pending human review. Renders `[UAT done]` when fully resolved.

- **Tooltip detail.** For UAT-bearing sets the tooltip includes
  `UAT items: n pending / m total`. For all sets it includes the
  current session number, orchestrator (engine + model + effort),
  and latest verification verdict from `session-state.json`.

- **Right-click commands** (gated on the spec's flags):
  - *Open Spec* / *Open Activity Log* / *Open Change Log* / *Open
    AI Assignment* — always available.
  - *Open UAT Checklist* — only on sets with `requiresUAT: true`.
  - *Reveal Playwright Tests for This Set* *(requires `requiresE2E:
    true`).* Searches the directory configured by
    `dabblerSessionSets.e2e.testDirectory` (default `tests/`) for
    files matching the slug tokens or any `E2ETestReference` values
    in the checklist. Opens directly when one match; pick-list when
    many.
  - *Copy: Start next session* / *Copy: Start next parallel session* /
    *Copy: Start next session — maxout Claude* — phrases that match
    `docs/ai-led-session-workflow.md` → Trigger Phrases.
  - *Copy: Slug only*.

## Settings

Two settings control whether UAT- and E2E-related surfaces appear at
all. The defaults work out-of-box: in `auto` mode, the surfaces appear
only when at least one spec in the workspace opts in.

| Setting | Values | Default | Behavior |
|---|---|---|---|
| `dabblerSessionSets.uatSupport.enabled` | `auto` / `always` / `never` | `auto` | `auto`: show UAT badge + commands when any spec declares `requiresUAT: true`. `always`: show regardless. `never`: hide regardless. |
| `dabblerSessionSets.e2eSupport.enabled` | `auto` / `always` / `never` | `auto` | `auto`: show *Reveal Playwright Tests* command when any spec declares `requiresE2E: true`. `always`: show regardless. `never`: hide regardless. |
| `dabblerSessionSets.e2e.testDirectory` | string (relative path) | `tests` | Root directory to search for E2E test files. Default `tests/` searches everything under `tests/`. Set to a specific subdirectory (e.g., `tests/MyApp.Playwright`) to narrow the search. |

For a console-only / library / CLI repo with no UI surfaces, set both
to `never` to keep the command palette free of UAT/E2E entries even if
a stray spec accidentally declares them.

## Refresh

The view auto-refreshes on any change to `spec.md`,
`session-state.json`, `activity-log.json`, `change-log.md`, or
`*-uat-checklist.json` under `docs/session-sets/`. New worktrees are
picked up on workspace-folder changes, the title-bar refresh button,
or a 30-second background poll.

## Companion docs

- `docs/ai-led-session-workflow.md` — the workflow doc; defines the
  trigger phrases this extension copies and the lifecycle of
  `session-state.json`.
- `docs/planning/session-set-authoring-guide.md` — the authoring
  guide; defines the Session Set Configuration block schema this
  extension reads.
