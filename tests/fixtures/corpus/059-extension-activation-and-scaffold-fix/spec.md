# Extension Activation & Scaffold Fix (0.28.1)

> **Purpose:** Fix the two operator-found defects in the published extension
> 0.28.0 so a fresh VS Code window (no folder open) can run **Set up a new
> project** end to end, and the Get Started wizard's tier choice flows through
> instead of dead-ending — then re-verify on a LOCAL build before any republish.
> **Session Set:** `docs/session-sets/059-extension-activation-and-scaffold-fix/`
> **Created:** 2026-06-09
> **Workflow:** Full
> **Prerequisite:** Set 058 complete (shipped the scaffold flow these defects sit in).

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true
requiresE2E: false
uatScope: per-set
uatStyle: ad-hoc
totalSessions: 2
```

> Rationale: this set fixes the VS Code activation / command / webview layer —
> precisely the layer the Set 058 test stack (which runs against a `vscode-stub`)
> never exercised, which is why the defects shipped. `requiresUAT: true`
> because the fix is only trustworthy once a human drives a real Extension
> Development Host (no folder, then a fresh folder, both tiers). `requiresE2E:
> false` — no Playwright surface. The UAT is the **pre-publish gate** this time,
> not a post-publish checklist.

---

## Project Overview

### The defects (operator UAT, 2026-06-09, against published 0.28.0)

1. **No-folder hang / setup unavailable.** `src/extension.ts` `activate()`
   returns early (`if (!vscode.workspace.workspaceFolders?.length) return;`)
   **before** registering the webview view provider or any command. With no
   folder open, the Session Sets view has no provider (hangs) and
   `dabbler.setupNewProject` / `dabbler.getStarted` are never registered — the
   exact situation "Set up a new project" is for.
2. **Wizard tier dead-end.** The Get Started wizard has a tier radio-group
   (Full default), but the "Set up a new project" button
   (`WizardPanel.ts` → `case "setupProject"`) calls
   `executeCommand("dabbler.setupNewProject")` with **no tier**, so the command
   re-prompts for tier (double prompt); and when the command is unregistered
   (no folder, defect 1) the `executeCommand` silently no-ops ("nothing
   happens").

Blast radius is limited: users who open VS Code **with a folder** are
unaffected (activation runs fully), so 0.28.0 did not break the installed base
— a patch (0.28.1) is the right response, no rollback.

### Non-goals

- No change to the scaffolding *content* (the Set 058 shared writer, templates,
  cold-start chain, drift guards are correct and stay as-is).
- No new feature. This is a defect fix for the activation + wizard wiring only.

---

## Sessions

### Session 1 of 2: Fix activation + wizard-tier passthrough + regression tests

**Goal:** Make the no-folder path register everything and render a sane empty
state; flow the wizard's tier into the scaffold; cover both with tests that
would have caught these defects; build a local `.vsix` for operator UAT. No
release.
**Steps:**
1. **Restructure `activate()`** (`src/extension.ts`): register the webview view
   provider AND every feature command **unconditionally**. Move the
   workspace-folder-dependent runtime (watchers, context-key evaluation, the
   30s poll, onboarding auto-`getStarted`) behind a guarded init that no-ops
   with zero folders and (re)runs on `onDidChangeWorkspaceFolders`. The Session
   Sets view must show a friendly empty state ("no folder — Set up a new
   project / Open Folder"), never hang.
2. **Wizard tier passthrough:** `webview/wizard.html` posts the selected tier
   with the `setupProject` message; `WizardPanel.ts` forwards
   `executeCommand("dabbler.setupNewProject", { tier })`;
   `src/commands/gitScaffold.ts` accepts an optional `{ tier }` arg and skips
   `promptTier()` when a valid tier is provided (still validates).
3. **Regression tests:** (a) `activate()` with empty `workspaceFolders`
   registers `dabbler.setupNewProject` + `dabbler.getStarted` and the view
   provider (the test that would have caught defect 1); (b) the wizard forwards
   the chosen tier and `setupNewProject` honors a provided tier (no double
   prompt).
4. **Build a local `.vsix`** (`npm run package`) and confirm `vsce ls` still
   ships `dist/templates/**`. Cross-provider verification of the diff. No
   release.
**Creates:** an activation regression test; (extends wizard/scaffold tests).
**Touches:** `src/extension.ts`, `src/wizard/WizardPanel.ts`,
`webview/wizard.html`, `src/commands/gitScaffold.ts`.
**Ends with:** TS suite green; a local `.vsix` built; verified; release held.
**Progress keys:** `session-001/activation-fixed`,
`session-001/wizard-tier-passthrough`, `session-001/regression-tests`,
`session-001/local-vsix-built`, `session-001/verified`.

---

### Session 2 of 2: Close-out (release folded into Set 060)

> **Re-scoped 2026-06-10.** Operator UAT of the S1 fix surfaced that the whole
> Getting Started / scaffolder UX is being redesigned (operator mockup
> `docs/planning/getting-started-instructions.svg`) — including removing the
> "title of the first session set" prompt this set kept. The S1 activation +
> wizard-tier fix is merged and verified on master; rather than cut a
> throwaway standalone **0.28.1** for a scaffolder flow about to be replaced,
> the release **folds forward into Set 060 (0.29.0)**. S2 therefore closes the
> set and hands the redesign to Set 060. Original S2 goal (operator UAT → bump
> 0.28.1 → held release) preserved below for the record.

**Goal:** Gate the release on a passing live UAT, then bump 0.28.1 and hold the
Marketplace republish.
**Steps:**
1. **Operator UAT** (ad-hoc, per-set) on the local `.vsix` / F5 dev host: the
   no-folder window (view renders, Set up a new project works), and the wizard →
   tier → scaffold flow for **both** tiers (no double prompt, real tree
   written). Record results in the set's UAT checklist.
2. On pass: **bump 0.28.0 → 0.28.1** (`package.json` + lock + `CHANGELOG.md`);
   update `docs/repository-reference.md` release status.
3. Cross-provider verification; close-out (final session → `change-log.md`).
4. **Held release:** the operator pushes `vsix-v0.28.1` after the UAT passes.
**Touches:** `tools/dabbler-ai-orchestration/package.json`, `package-lock.json`,
`CHANGELOG.md`, `docs/repository-reference.md`, the set's UAT checklist.
**Ends with:** a verified, locally-UAT'd 0.28.1 held for operator tag-push.
**Progress keys:** `session-002/operator-uat-passed`,
`session-002/version-bumped`, `session-002/verified`,
`session-002/change-log-written`.

---

## End-of-set deliverables

- An `activate()` that registers commands + the view provider regardless of
  whether a folder is open, with folder-dependent runtime gated and
  re-initialized on folder-add.
- The Get Started wizard's tier choice carried into `setupNewProject` (no double
  prompt, no dead-end).
- Regression tests covering the no-folder activation path and the wizard tier
  passthrough.
- A locally-UAT'd extension 0.28.1, held for operator tag-push `vsix-v0.28.1`.
