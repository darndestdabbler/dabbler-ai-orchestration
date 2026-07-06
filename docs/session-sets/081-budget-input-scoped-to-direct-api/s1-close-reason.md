# Session 1 close reason — Conditional budget block + Build gating

Session 1 of 2 completed all four spec steps and ends in the spec's
declared end-state: on the vscode-stub, Full+api renders the budget block
under the Direct-API row, Full+copilot renders no budget block,
Build threads `budget.yaml` material only on the api path, and every
pre-existing budget-semantics test passes unchanged.

## What landed

- **Placement (s1.placement).** `budgetBlockHtml` gains a second omit
  gate (`transportProfile === "copilot-cli"` → `""`), and
  `transportProfileBlockHtml` nests the non-empty block in a
  `.gs-option-child` wrapper between the Direct-API row and the Copilot
  row. Omit-vs-hidden: **omit**, matching the block's existing tier-gate
  pattern (Set 063 R1 Minor) — sub-choice flips already re-render the
  form surface (Set 079 S1 listener) and `gsState` preserves the typed
  value, so hiding never clears it. The choice and its rationale are
  documented in the builder's code comment. `renderGettingStarted` no
  longer renders the block as a sibling. `tree.css` adds the
  `.gs-option-child` indent plus a separator-restore rule (the child div
  breaks the `.gs-option-row + .gs-option-row` adjacency); when the
  block is absent no wrapper renders, keeping the rows adjacent.
- **Build gating (s1.build-gating).** `client.js`: on Full the
  `transportProfile` rider always rides Build; budget validation and the
  budget riders run only while the Direct-API sub-option is selected — a
  not-shown budget input never trips Build validation.
  `gettingStartedActions.ts`: `asBudgetChoice` drops the rider outright
  under `copilot-cli` (the Lightweight-drop posture), and the Set 063
  fail-closed "Full without budget" rejection is scoped to the
  Direct-API path. `gitScaffold.ts`: `effectiveBudget` caller condition —
  a Copilot-seat Build passes no budget to the scaffold step
  (`writeBudgetYaml` unchanged); the `runScaffold` seam carries the
  effective budget so Layer-2 pins the condition.
- **Tests (s1.tests).** New Layer-2 suites: placement/visibility
  (Full+api nested under the api row inside the transport block;
  Full+copilot omitted entirely including no empty child wrapper;
  Lightweight absent), persistence (typed value and the $0 zero-rule
  pick survive an api → copilot → api flip), Build write matrix at the
  seam (api+budget threads the budget; copilot-cli drops it even when a
  caller passes one), and the action-router matrix (Full+copilot
  dispatches budgetless; Full+api stays fail-closed). **Zero semantic
  edits to pre-existing budget parsing / zero-rule / no-clobber tests**
  (the Set 080 scope tripwire held; the existing Set 063 ordering
  assertions also pass unchanged).

## Gates

- `npx tsc --noEmit` clean; Layer-2 mocha **1265 passing / 0 failing**;
  Layer-3 Playwright **19/19 passed** locally (L-064-12 — this session
  changes an Explorer-rendering surface).
- Routed gate: **REQUIRED** (breadth: 8 files ≥ 4). Cross-provider
  verification on gpt-5-4 (openai; orchestrator claude/anthropic):
  - **Round 1: ISSUES_FOUND** — one Major, S081-S1-V1-001: the evidence
    diff was path-filtered and omitted the tracked `session-state.json`
    boundary write visible in `git status` (the L-064-9 class extended
    to path-filtered diffs). Structured finding persisted to
    `s1-issues.json`.
  - **Round 2** (narrow, complete unfiltered diff, no max_tier pin —
    substantive): S081-S1-V1-001 **RESOLVED**; the added hunk is
    session-lifecycle ledger state, no other round-1 conclusion changed.
  - **Round 3** (wording-only — R2's verdict token was "RESOLVED",
    outside the binary grammar; max_tier pinned per L-064-7):
    **VERIFIED**, empty issues list.
  - Raw outputs: `s1-verification.md`, `s1-verification-round-2.md`,
    `s1-verification-round-3.md` (never edited).

## Deferred / notes for Session 2

- Session 2 owns the per-set UAT checklist (078/079/080 bar), the
  refreshed `getting-started.png`, the advisory end-of-set path-aware
  critique, and the extension-only release. The routed gate will trip
  on the release diff (package.json build-ci-config trigger) — plan for
  a cross-provider verification call there.
- Evidence-bundle calibration: keep the generated `dist/` bundle out of
  re-verify evidence and send only the missing hunk — R2's full-diff
  overcorrection cost $0.60 of a $0.76 session.
