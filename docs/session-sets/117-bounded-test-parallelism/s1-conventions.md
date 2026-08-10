# Session 1 verification conventions

Read this before the change set. It states the baseline, the contract,
and the by-design exclusions, so the round spends its findings on real
defects rather than on the agreed starting position.

## What this session is, and is not

Set 117 Session 1 has two deliverables: **per-launch state isolation for
VS Code Electron launches**, and **a re-measurement of the Layer 3 worker
ceiling**. It changes *how the tests are scheduled and isolated* and
nothing else.

Explicit non-goals, from the spec and binding on this review:

- **No new Playwright tests**, and **no change to what any test asserts.**
- **No fixing of product races.** The spec says in terms: "Recording them
  precisely is in scope; repairing them is a later set." A finding that
  this session should have *fixed* the flaky test it documents is
  contradicted by the spec.
- **No worker count is adopted here.** Session 2 sets the Playwright
  worker count and Session 3 writes the policy. This session measures and
  hands over. `playwright.config.ts` is deliberately untouched and still
  reads `workers: 1` — that is correct, not an omission.

## Part of the change had already landed before the session started

Commit `5388c3d1` (2026-08-10, work seat + Copilot) shipped the
APPDATA/LOCALAPPDATA scoping inline in `electronLaunch.ts` and named what
it left for this session: *"tests for the isolation, the worker count, and
a decision on whether HOME/USERPROFILE need the same treatment."* This
session does not re-do or re-claim that work. Its three additions are:

1. Moving the isolation onto the **shared seam** (`vscode-launch.js`) so
   the second launch site, `scripts/stage-walk.js`, gets it too. The
   inline version missed it, so `npm run walk` was still launching against
   the operator's real machine-wide VS Code profile (L-069-1).
2. **Tests**, which it had none of.
3. Scoping **HOME/USERPROFILE** as well, so the fix is not Windows-only.

## Suite baseline — read before reporting a failing test

- **Layer 2 (mocha, `npm run test:unit`): one PRE-EXISTING failure**,
  `sampleProjectSmoke.test.ts` → "close_session closes cleanly on the
  local-only repo" (`close_session: gate_failed`). Verified to fail on
  **clean master with this session's changes stashed**. It is not caused
  by this change set and is not this session's to fix.
- **Layer 3 (Playwright): one failing test**,
  `vsix-first-run-walkthrough.spec.ts`, in 2 of 9 full-suite runs. It is
  the *subject* of this session's step-4 finding. Its cause is recorded as
  **UNRESOLVED**, with two distinct failure modes; one of them persisted
  under full isolation and is recorded as an open product-race candidate,
  as spec step 4 requires. Full characterisation, with sample sizes and
  the explicit limits of what they support, is in
  `s1-worker-sweep-DENICI.txt` section 3.
- Every other **included** Layer 3 test passed in every run at every
  worker count (1, 4, 8, 12) across 9 full-suite runs.
  `real-host-baseline` was **excluded from every run** (Session 2
  quarantines and re-baselines it), so this session makes no claim about
  it either way.

## Release contract

Nothing is released. No version bump, no publish, no tag. The extension
package version is untouched.

## The measurements are from a different machine than the spec's

The spec's Layer 3 figures came from the operator's 14-core / 31.5 GB work
machine. This session ran on DENICI (20 logical CPUs, 63.8 GB). Both sets
of numbers are kept; neither replaces the other. A finding that the
session's numbers "contradict the spec" should first check which machine
each figure came from — the evidence file labels every one.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit. Please state the
failure scenario explicitly for anything rated Critical or Major.
