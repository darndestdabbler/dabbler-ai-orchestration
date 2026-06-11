# Change Log — Set 060: Getting Started redesign

**Status:** COMPLETE (4 of 4 sessions) — 2026-06-11
**Release:** Extension **0.29.0** to the VS Code Marketplace. The local-UAT
gate passed 2026-06-11 and the operator explicitly authorized the publish
in-session; the `vsix-v0.29.0` tag push (publish-vscode.yml) follows this
set's close-out commit, with the run outcome recorded in
`docs/repository-reference.md` once the workflow completes. Also carries the
held Set 059 activation fix — no standalone 0.28.1 was ever published.
**No PyPI release**: `ai_router`'s packaged surface is unchanged since the
published v0.16.0.

## Why this set existed

Operator UAT rejected the published 0.28.0 onboarding (a Command-Palette
wizard + QuickPick scaffolder with an unwanted "first session set title"
prompt, no progress feedback, and no validation). The operator's redesign
(mockup: `docs/planning/getting-started-instructions.svg`) makes the Session
Set Explorer itself the setup surface — a stateful three-step form with live
progress and guardrails — paired with static teaching instructions in the
editor. Per the Set 058/059 lesson, a passing operator UAT on a **local**
build was the hard pre-publish gate (`requiresUAT: true`, ad-hoc, per-set).

## What shipped

### Session 1 — completion-detection model + dual-mode Explorer shell (VERIFIED, 4 rounds)

- Pure, VS Code-free `gettingStartedDetection.ts`: the D3 completion flags
  (`structureBuilt` / `planPresent` / `sessionSetsPresent`), the D1/D5
  `selectExplorerMode` switch, and the host composition helper — all
  fs-injected and unit-tested.
- Dual-mode rendering in `CustomSessionSetsView` (no-folder CTA /
  Getting Started form / session-set list) with a second file watcher over
  all D3 inputs so the form's step state flips live.
- The form shell (Full/Lightweight radio + parallel checkbox), greyed/checked
  per live completion state; buttons inert this session.

### Session 2 — the three actions wired (VERIFIED, 2 rounds)

- **Build project structure** → a structure-only, no-prompt scaffold into the
  open folder (`renderStructureBootstrap` + `buildProjectStructureNoPrompt`):
  no title prompt, silent git init, tier from the radio, NO starter session
  set (seeding one would flip the Explorer to list mode mid-form).
- **Import project-plan.md / Copy prompt for planning** → `planImport.ts`
  split into testable `importPlanFromFile` + `copyPlanningPrompt`.
- **Build session sets** → copies the decomposition prompt (D4), honoring the
  parallel checkbox (worktree + `prerequisites:` guidance in the prompt text).
- The typed `GettingStartedActionMsg` channel (separate from the
  executeCommand allowlist) with pure dispatch/narrowing.

### Session 3 — validation, instructions, old path retired (VERIFIED, 1 round, 0 issues)

- **D6:** Full-tier provider-key warning under the Build button —
  `providerKeyPresent(env)` predicate (any of `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` / `GEMINI_API_KEY`), host-computed from `process.env`
  (merged Windows System+User at launch — hence "set a key, then reload the
  window"); Lightweight shows no warning.
- **D7:** the parallel checkbox surfaces the git-worktree info note while
  checked (resolved carried verifier issue S060-S2-V1-001 with
  checked-vs-unchecked rendering tests).
- **D8:** a token-free `getting-started.md.template` in the consumer-bootstrap
  bundle carrying the operator's five-step SVG copy; written to
  `docs/dabbler/getting-started.md` by both scaffold paths; opened as a
  markdown preview when the Getting Started surface first shows.
- **Old path retired:** `WizardPanel.ts` + `webview/wizard.html` deleted;
  `dabbler.getStarted` focuses the Explorer + opens the instructions;
  `dabbler.setupNewProject` kept as a palette entry converged on the same
  no-prompt scaffold (tier QuickPick only). Form HTML builders extracted to
  the mocha-testable `gettingStartedHtml.js`. Stale doc references reconciled.

### Session 4 — operator UAT gate + release (this session)

- Operator preliminary UAT on a local build: all walked rows passed. Two
  feedback items were folded in before the gate closed:
  1. The copied decomposition prompt now **references**
     `docs/planning/project-plan.md` instead of inlining the plan text
     (readability; the audience is a path-aware assistant — the same contract
     as the Set 048 copyable review prompts).
  2. The form's tier radio now rides the Build session sets action, so the
     prompt's worked exemplars + guidance steer the planner to the operator's
     tier (the bare palette command stays generic Full).
- Operator re-walked the affected rows on the rebuilt
  `dabbler-ai-orchestration-0.29.0.vsix` and passed the gate
  ("good to go", 2026-06-11); results recorded in
  `060-getting-started-redesign-uat-checklist.json`.
- Version finalized at **0.29.0** (`package.json` + lock + `CHANGELOG.md` —
  the bump itself was found pre-written in the working tree from the
  operator's UAT-build preparation and was kept, extended, and committed
  here); `docs/repository-reference.md` release status updated (including
  correcting the stale "held" wording on the already-published 0.28.0 /
  v0.16.0 / v0.15.0 rows).
- Release authorized by the operator in-session; the `vsix-v0.29.0` tag push
  (publish-vscode.yml) follows the close-out commit, per the spec's
  held-release mechanics. The publish-run outcome is recorded in
  `docs/repository-reference.md` after the workflow completes.

## Deferred / follow-on (Set 061 candidates, from operator UAT discussion)

- **Explorer UX polish:** `N/M+` fraction for Lightweight
  `dedicated-sessions` sets (typed verification/remediation sessions append
  at runtime), per-row tier visibility, and a quieter `[BLOCKED BY PREREQS]`
  treatment (unobtrusive marker + tooltip naming each unsatisfied prerequisite
  and its state — the Set 050 migration-asterisk pattern).
- **"Switch tier…"** right-click action on not-started sets (per-set tier is
  already the data model; mid-set switching deliberately unsupported —
  `--no-router` is the per-session escape hatch).

## Verification & cost

Cross-provider verification every session (gpt-5-4): S1 four rounds
($0.514), S2 two rounds ($0.137, one Major disputed as S3 scope and resolved
there), S3 one round clean ($0.258), S4 one round (see `s4-verification.md`).
Routed analysis (ai-assignment / next-orchestrator recs) via gemini-pro.
Full suites green throughout: 699 TS unit tests passing at close (the only 2
failures are pre-existing Set-026 vscode-stub gaps), Python 1185 passing,
tier-model drift guard clean.
