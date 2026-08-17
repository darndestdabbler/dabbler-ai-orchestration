# Change Log — Set 059: Extension activation & scaffold fix

**Status:** COMPLETE (2 of 2 sessions) — 2026-06-10
**Release:** None standalone. The extension activation/wizard fix is merged on
`master` and **folds forward into 0.29.0** (Set 060). No `vsix-v0.28.1` tag was
pushed; the published Marketplace version stays 0.28.0 until 0.29.0 ships.

## Why this set existed

Operator UAT of the published 0.28.0 (Set 058) consumer-bootstrap flow found two
defects in the VS Code activation/wiring layer — the layer the Set 058 test
stack (run against a `vscode-stub`) never exercised:

1. **No-folder hang / setup unavailable** — `activate()` returned early when no
   workspace folder was open, leaving the webview view provider AND every
   command unregistered, so the Session Sets view hung and
   `dabbler.setupNewProject` / `dabbler.getStarted` silently did nothing — in
   exactly the fresh-window case those commands exist for.
2. **Wizard tier dead-end** — the Get Started wizard's tier choice was discarded
   when launching "Set up a new project," so the command re-prompted (double
   prompt) and, when unregistered, no-op'd.

## What shipped (Session 1)

- `extension.ts` `activate()` now registers the view provider + all commands
  unconditionally; the folder-dependent runtime (watchers, context keys, the
  poll) stays gated and re-initializes on `onDidChangeWorkspaceFolders`; the
  onboarding auto-`getStarted` is gated on having a folder (so it can't pop on
  every bare-window launch). The view renders its welcome CTA instead of hanging.
- The Get Started wizard carries its tier selection into `setupNewProject`
  (`wizard.html` → `WizardPanel` → `asTier`), so no double prompt / dead-end.
- A no-folder activation regression test (drives the real `activate()` with no
  folder; asserts the provider + bootstrap commands register, the view renders,
  and onboarding stays quiet; disposes subscriptions so the poll timer can't
  hang mocha), plus an `asTier` unit test. `vscode-stub` gained
  `registerWebviewViewProvider`; the watcher allowlist line was bumped 172→182.
- Version bumped 0.28.0 → 0.28.1 and a local `.vsix` built for operator UAT.

**Verification (S1):** gpt-5-4 cross-provider, 2 rounds → **VERIFIED** (no
implementation defect; two test-depth follow-ups applied). TS unit 645 passing
(2 pre-existing Set-026 stub failures, untouched files).

## What happened in Session 2 (close-out + re-scope)

Operator UAT of the S1 build surfaced that the **entire Getting Started /
scaffolder UX is being redesigned** (operator mockup
`docs/planning/getting-started-instructions.svg`) — a stateful, two-panel
Getting Started (an interactive form in the Session Set Explorer + static
step-by-step instructions in the editor), which removes the "title of the first
session set" prompt this set kept. Rather than cut a throwaway standalone
**0.28.1** for a scaffolder flow about to be replaced, the set **folds the
release forward into Set 060 (0.29.0)** and closes here. The activation fix is
the load-bearing, foundational part of the redesign (the form must render with
no session sets / no folder), so it ships inside 0.29.0.

## Tests at close

- TS unit suite: 645 passing; 2 pre-existing Set-026 failures in untouched
  specs. `tsc --noEmit` clean; `drift_guard` exits 0; `vsce ls` confirms the
  template bundle still ships.

## Hand-off

- **Next set — 060 (Getting Started redesign, 0.29.0).** The locked design
  (operator-approved 2026-06-10): dual-mode Session Set Explorer (form when no
  sets exist, list otherwise); live state only in the form; static editor
  instructions lifted from the SVG; "Build project structure" scaffolds the open
  folder (offers a picker when none open) with no title prompt; "Build session
  sets" copies a decomposition prompt; Full-tier env-var validation
  (`process.env`, "set then reload window"); a git-worktree info note on the
  parallel checkbox. See the set's spec for the session plan.
