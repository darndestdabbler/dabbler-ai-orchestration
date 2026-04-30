---
title: Extension rebranding + project-wizard feature set
status: accepted — implementation in progress
date: 2026-04-29
authors: human + Claude (Sonnet 4.6)
applies-to: dabbler-ai-orchestration (tools/vscode-session-sets → tools/dabbler-ai-orchestration)
---

# Extension rebranding + project-wizard feature set

## Executive summary

The current VS Code extension (`Session Set Explorer`, v0.8.1) is a
narrow file-navigation tool. This proposal expands it into the primary
user-facing artifact for the entire dabbler AI-led-workflow ecosystem —
renamed `dabbler-ai-orchestration`, published to the VS Code
Marketplace, and extended with a project-wizard feature set that guides
users from a blank directory through git scaffolding, plan import,
session-set generation, cost monitoring, and troubleshooting.

The self-update mechanism (retrieving ai-router scripts from GitHub at
runtime) is **deferred to a separate proposal**. This document covers
the extension rebranding, marketplace readiness, and wizard features
(2a–2g) only.

## Status & next actions

Accepted. Concrete implementation sequence:

1. **Phase 0 — Scaffold** (current): Rename folder, convert to TypeScript,
   add test infrastructure, wire CI, update all metadata. Zero feature
   change; result is a buildable, testable, marketplace-ready shell.
2. **Phase 1 — Wizard shell + onboarding panel (2a)**: Add webview
   infrastructure and the "Welcome / How it works" panel.
3. **Phase 2 — Git scaffolding (2b)**: New-project and worktree-setup
   commands backed by `simple-git`.
4. **Phase 3 — Plan import + session-set generation prompt (2c, 2d)**:
   Plan file picker and prompt-to-clipboard generation.
5. **Phase 4 — Troubleshooting + caution messaging (2e, 2f)**:
   Diagnostic command and expense-awareness prompts.
6. **Phase 5 — Cost dashboard (2g)**: Webview panel reading
   `ai-router/metrics.jsonl` (or equivalent), ASCII sparkline + table.

Each phase ships as an independently testable increment. Phases 0–2 are
the minimum viable product for a Marketplace listing.

## Background

### What the extension does today

`Session Set Explorer` (v0.8.1) is a VS Code tree-view extension
written in plain JavaScript (~787 lines, zero dependencies, no build
step, no tests). It:

- Scans `docs/session-sets/<slug>/` directories across workspace roots
  and git worktrees.
- Derives per-session-set state from file presence (`spec.md`,
  `activity-log.json`, `change-log.md`).
- Groups sessions into In Progress / Not Started / Done panels.
- Exposes context-menu commands for opening session files, copying
  trigger phrases, and (when applicable) opening UAT checklists and
  locating Playwright tests.

It has no onboarding story, no project creation support, no cost
visibility, and no tests. It is distributed as a local VSIX.

### Why the rebranding and expansion

- **The extension is the most visible user artifact.** The ai-router
  Python module and session-set markdown conventions are invisible
  plumbing; the extension is what users open daily. Naming it
  `dabbler-ai-orchestration` makes the branding coherent.
- **No guided path into the workflow.** New users must read multiple
  docs to understand how to start a project. A wizard reduces that
  friction to a single panel.
- **No cost visibility.** The ai-router already logs per-session
  token/cost data; surfacing it in the extension closes a meaningful
  feedback loop and prevents billing surprises.
- **Marketplace publication is within reach.** The existing feature set
  is complete enough to be useful to others; the primary blocker is the
  absence of TypeScript, tests, and proper metadata.

## Proposal details

### Folder rename

| Before | After |
|--------|-------|
| `tools/vscode-session-sets/` | `tools/dabbler-ai-orchestration/` |

Internal layout after conversion:

```
tools/dabbler-ai-orchestration/
├── src/
│   ├── extension.ts          (activate/deactivate, wires providers + commands)
│   ├── providers/
│   │   └── SessionSetsProvider.ts
│   ├── commands/
│   │   ├── openFile.ts
│   │   ├── copyCommand.ts
│   │   ├── gitScaffold.ts    (Phase 2)
│   │   └── troubleshoot.ts   (Phase 4)
│   ├── wizard/
│   │   ├── WizardPanel.ts    (Phase 1 — webview host)
│   │   ├── onboarding.ts     (Phase 1 — 2a)
│   │   ├── planImport.ts     (Phase 3 — 2c)
│   │   └── sessionGenPrompt.ts (Phase 3 — 2d)
│   ├── dashboard/
│   │   └── CostDashboard.ts  (Phase 5 — 2g)
│   └── utils/
│       ├── git.ts
│       ├── fileSystem.ts
│       └── metrics.ts        (Phase 5)
├── media/
│   ├── DarndestDabblerIcon.svg   (128×128 marketplace icon)
│   ├── icon.svg                  (activity bar icon, 16px-friendly)
│   ├── done.svg
│   ├── in-progress.svg
│   └── not-started.svg
├── webview/
│   ├── wizard.html           (Phase 1)
│   └── dashboard.html        (Phase 5)
├── test/
│   ├── suite/
│   │   ├── extension.test.ts
│   │   ├── SessionSetsProvider.test.ts
│   │   └── metrics.test.ts   (Phase 5)
│   └── runTests.ts
├── .vscode/
│   └── launch.json           (Extension Development Host + test runner)
├── .github/
│   └── workflows/
│       └── ci.yml            (build + test on push/PR)
├── package.json
├── tsconfig.json
├── .vscodeignore
├── CHANGELOG.md
├── README.md
└── LICENSE
```

### Package.json metadata (marketplace requirements)

```json
{
  "name": "dabbler-ai-orchestration",
  "displayName": "Dabbler AI Orchestration",
  "publisher": "darndestdabbler",
  "version": "0.9.0",
  "description": "Project wizard, session-set explorer, and cost dashboard for the Dabbler AI-led workflow.",
  "categories": ["Other", "SCM Providers"],
  "keywords": ["ai", "workflow", "session", "claude", "orchestration"],
  "icon": "media/DarndestDabblerIcon.svg",
  "homepage": "https://darndestdabbler.org",
  "bugs": { "url": "https://github.com/darndestdabbler/dabbler-ai-orchestration/issues" },
  "repository": { "type": "git", "url": "https://github.com/darndestdabbler/dabbler-ai-orchestration" },
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js"
}
```

Note: `engines.vscode` bumped to `^1.85.0` (Dec 2023) to allow use of
`vscode.workspace.fs` and current Webview API surface without polyfills.

### Feature 2a — Onboarding panel ("How it works")

A webview panel (`Dabbler: Get Started`) that opens automatically the
first time the extension activates in a workspace that has no
`docs/session-sets/` directory, and is also available from the command
palette at any time.

Content:
1. **What this workflow is** — one-paragraph plain-English description
   of the AI-led session-set pattern.
2. **What you need** — prerequisites checklist: VS Code, Python ≥ 3.10,
   Node, API keys (Claude / OpenAI / Gemini as applicable), this
   extension.
3. **How a session works** — numbered steps with links to the relevant
   docs files in `dabbler-ai-orchestration`.
4. **What to do first** — big "Set up this project" button that invokes
   the git scaffolding wizard (2b) or, if the repo already exists,
   "Import a plan" (2c).

Implementation notes:
- Webview HTML is static, loaded from `webview/wizard.html`.
- VS Code's `getNonce()` pattern and a strict Content Security Policy
  are required for Marketplace submission.
- A `dabblerAiOrchestration.hasSeenOnboarding` workspace-state key
  prevents auto-open after first use.

### Feature 2b — Git scaffolding

Command: `Dabbler: Set Up New Project`

Steps (each confirmed or skippable by the user via QuickPick):

1. Prompt for project name and root directory.
2. `git init` the directory (or skip if already a repo).
3. Create standard folder skeleton:
   `docs/session-sets/`, `docs/planning/`, `ai-router/`
4. Copy `ai-router/` bootstrap files from the bundled extension
   resources (not from a live GitHub fetch — deferred to the
   self-update proposal).
5. Prompt: "Set up git worktrees for parallel sessions?"
   - If yes: run `git commit --allow-empty -m "init"`, then
     `git worktree add worktrees/main main` per the bare-repo +
     flat-worktree recipe in `repo-worktree-layout.md`.
   - If no: skip.
6. Open the onboarding panel (2a) in the new workspace.

Implementation notes:
- Uses `simple-git` npm package for git operations (replaces raw
  `child_process` calls; adds typed API and better error surfaces).
- Worktree creation uses the per-need rule from Proposal B
  (2026-04-28): opt-in only, not forced.
- All destructive steps (git init, worktree add) are confirmed
  individually via `vscode.window.showWarningMessage`.

### Feature 2c — Plan import

Command: `Dabbler: Import Project Plan`

1. Show a file picker filtered to `*.md` files.
2. Read the file; show a preview of the first 40 lines in a
   QuickPick description.
3. Copy the file to `docs/planning/project-plan.md` in the workspace
   (with overwrite confirmation if the file already exists).
4. Open the file in the editor.
5. Show an information message: "Plan imported. Run
   'Dabbler: Generate Session-Set Prompt' to translate it into session
   sets."

Alternative path: if no file is selected, show a QuickPick offering
"Open AI assistant to create a plan" — copies a standard
plan-authoring prompt to the clipboard and shows a notification
explaining what to do with it.

### Feature 2d — Session-set generation prompt

Command: `Dabbler: Generate Session-Set Prompt`

1. Read `docs/planning/project-plan.md` (or prompt to import if
   missing).
2. Build a prompt string:
   - System instructions: persona, output format spec (one
     `spec.md` stub per session set, with YAML configuration block),
     portability constraints.
   - User content: the plan text.
3. Copy the assembled prompt to the clipboard.
4. Show a notification: "Prompt copied. Paste it into your AI assistant.
   When you get the session-set specs back, save each one to
   `docs/session-sets/<slug>/spec.md`."

The prompt template is stored as a bundled text resource
(`resources/session-set-generation-prompt.md`) so it can be updated
without a code change.

### Feature 2e — Troubleshooting assistant

Command: `Dabbler: Troubleshoot`

Opens a QuickPick with categories:

| Category | What it checks / shows |
|----------|------------------------|
| Extension not activating | Explains `workspaceContains` trigger; checks for `docs/session-sets/` |
| Session stuck in "In Progress" | Explains file-presence state machine; links to `activity-log.json` |
| Worktrees not showing | Runs `git worktree list` and shows output in output channel |
| API key not found | Points to `ai-router/` env-var export instructions |
| Cost seems high | Links to 2f caution text and 2g cost dashboard |
| File/folder layout wrong | Shows expected layout vs. actual workspace state |

Each item opens an output channel with diagnostics and links to the
relevant doc section. No file modifications.

### Feature 2f — Expense caution

Surfaced in three places:

1. **Onboarding panel (2a)**: A yellow "Cost awareness" callout box with
   estimated per-session-set cost ranges (Opus 4.x vs. Sonnet 4.x vs.
   Haiku 4.x) and a link to Anthropic pricing.
2. **Session-set generation prompt (2d)**: Notification after copy:
   "Reminder: each session set typically costs $0.10–$2.00 depending
   on model and effort. Review your plan before running all sessions."
3. **Cost dashboard (2g)**: Prominent cumulative total at the top of the
   panel.

The cost estimates are stored in a bundled JSON resource
(`resources/cost-estimates.json`) and can be updated without a code
change.

### Feature 2g — Cost dashboard

Command: `Dabbler: Show Cost Dashboard`
Also accessible via a toolbar button on the Session Set Explorer tree view.

The dashboard reads `ai-router/metrics.jsonl` (one JSON object per
line, one line per session run) from the workspace root. Expected
schema per line:

```json
{
  "session_set": "my-feature",
  "session_num": 3,
  "model": "claude-sonnet-4-6",
  "effort": "normal",
  "input_tokens": 12400,
  "output_tokens": 3200,
  "cost_usd": 0.34,
  "timestamp": "2026-04-29T14:23:00Z"
}
```

Panel content:
1. **Cumulative project total** (large, prominent).
2. **Per-session-set breakdown** table: slug, sessions run, total cost,
   last run date.
3. **ASCII sparkline** of daily cost over the last 30 days — rendered
   in a `<pre>` block using 8-level Braille block characters
   (`▁▂▃▄▅▆▇█`). Width = 30 chars (one column per day).
4. **Model mix** summary: % of spend by model.
5. **"Export CSV"** button that writes `ai-router/cost-export.csv` and
   opens it.

If `metrics.jsonl` is missing, the panel shows setup instructions for
enabling metrics in `ai-router/config.py`.

Implementation notes:
- Dashboard is a second webview panel (`webview/dashboard.html`),
  separate from the wizard webview.
- Both webviews use VS Code's `getUri()` for local resource loading
  and a strict CSP.
- The sparkline computation lives in `src/utils/metrics.ts` and is
  unit-tested independently of VS Code.

## Marketplace readiness checklist

- [ ] TypeScript with strict mode; `dist/` compiled output; `src/`
      committed source.
- [ ] All webviews use nonce-based CSP (`script-src 'nonce-...'`).
- [ ] `README.md` includes feature screenshots (Phase 1+).
- [ ] `CHANGELOG.md` maintained in Keep-a-Changelog format.
- [ ] `.vscodeignore` excludes `src/`, `test/`, `node_modules/`,
      `webview/` source, `*.ts`, `tsconfig.json`, `.github/`.
- [ ] `package.json` `icon` field points to a 128×128 PNG or SVG.
- [ ] All commands have `title` and `category: "Dabbler"` for clean
      command palette grouping.
- [ ] `activationEvents` reviewed; prefer `onCommand` + `onView`
      over `*`.
- [ ] GitHub Actions CI: `npm ci`, `tsc --noEmit`, `npm test` on
      push and PR.
- [ ] No `console.log` in production paths — use VS Code output channel.

## TypeScript and test infrastructure

**TypeScript setup:**
- `tsconfig.json` targeting `ES2020`, `module: commonjs`,
  `outDir: ./dist`, `strict: true`.
- `@types/vscode` at `^1.85.0` matching engines field.
- `esbuild` for bundling (faster than tsc alone; standard VS Code
  extension pattern).

**Test setup:**
- `@vscode/test-electron` for integration tests (Extension Development
  Host).
- `mocha` + `@types/mocha` for unit tests of pure logic
  (metrics.ts, prompt building, state derivation).
- Test entry point: `test/runTests.ts`.
- CI runs unit tests headlessly; integration tests run in the
  Extension Development Host.

## Open questions

1. **`simple-git` vs. raw `child_process`** — `simple-git` adds ~300 KB
   to the VSIX. For a tool this audience-specific, the ergonomics are
   worth it. Decision: use `simple-git`.
2. **`metrics.jsonl` schema ownership** — The ai-router Python module
   must emit this schema for the dashboard to work. The schema above
   is a proposal; the ai-router team (same human) needs to confirm it
   matches or update `ai-router/metrics.py` accordingly.
3. **Webview framework** — Plain HTML/CSS/JS vs. a lightweight framework
   (Lit, Alpine.js). Decision: plain HTML to keep the VSIX small and
   avoid a build step for webview assets. Revisit if the dashboard
   grows complex.
4. **Icon format** — Marketplace accepts PNG or SVG for the `icon`
   field. The existing `DarndestDabblerIcon.svg` can be used directly;
   verify it renders well at 128×128.
5. **GitHub repo** — The package.json `repository` and `bugs` URLs above
   assume a `darndestdabbler/dabbler-ai-orchestration` GitHub repo.
   Confirm the target repo URL before publishing.

## Sequencing and risk

The Phase 0 scaffold (TypeScript conversion, tests, CI) carries the
highest risk of breaking the existing tree-view feature. Strategy:

- Convert `extension.js` to `extension.ts` + `SessionSetsProvider.ts`
  first, with no logic changes, and run the full test suite before
  adding any new features.
- Keep the old `extension.js` in a `legacy/` branch until Phase 1
  ships and is validated.
- Increment the version to `0.9.0` at Phase 0 completion; `1.0.0`
  at Marketplace submission.
