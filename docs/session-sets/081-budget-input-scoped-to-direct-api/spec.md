# Budget Input Scoped To The Direct-API Sub-Choice Spec

> **Purpose:** During the Set 080 UAT walk the operator asked whether the
> Full tier's "Verification budget (USD, not-to-exceed)" input applies
> only to the "Direct provider API keys" sub-option — it does: the budget
> governs metered provider-API verification spend, and under the
> `copilot-cli` seat profile every cost-keyed guard (dollar/token budgets,
> price-table estimators, quota preflights) is excluded by design
> (`docs/concepts/tier-model.md` → seat billing is not locally meterable;
> the non-cost `max_invocations_per_session` breaker caps seat burn
> instead). The operator requested the budget label + input move below
> the "Direct provider API keys" option and display only while that
> sub-option is selected. This set makes the budget block a conditional
> child of the Direct-API pick — and makes Build honest about it: a
> Copilot-seat Build writes no `budget.yaml` (absence already has
> documented compat defaults in `docs/budget-yaml-schema.md`).
> **Created:** 2026-07-05 (operator-requested during Set 080 S2 UAT)
> **Session Set:** `docs/session-sets/081-budget-input-scoped-to-direct-api/`
> **Prerequisite:** 080-getting-started-subchoice-legibility (complete —
> this set nests the budget block inside the row layout 080 shipped)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: true
requiresE2E: false
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 080-getting-started-subchoice-legibility
    condition: complete
```

> Rationale: the set changes visible Getting Started form behavior
> (conditional display of the budget block) and Build wiring (when
> `budget.yaml` is written), so a human UAT walk is required — including
> one real Build per sub-option. No new browser E2E surface beyond the
> existing Layer-2/Layer-3 coverage → no E2E gate. `pathAwareCritique:
> advisory` follows the blast-radius recommendation for this path set
> (Build wiring is touched; the critique warns at close but never
> blocks). Declared in the config block per L-079-2 — prose does not arm
> gates.

---

## Project Overview

**Scope.** One behavior change with two faces, applied to the Full tier
only:

- **Placement / visibility.** The budget block (label, input, help
  text, the $0 zero-rule radio pair, and the validation element) moves
  from its current position after the provider-access group to render
  as an indented child of the "Direct provider API keys" option row
  inside `transportProfileBlockHtml` — and it is present only while the
  Full tier AND the `api` sub-option are selected. With "GitHub Copilot
  CLI seat" selected the block is not shown (S1 picks omit-vs-hidden
  consistent with the form's existing conditional patterns; whichever
  mechanism, a not-shown budget input must never trip Build
  validation). The Lightweight tier is untouched (it already never
  renders the block).
- **Build honesty.** When Build runs with the Copilot sub-option
  selected, the scaffold does not write `ai_router/budget.yaml` and
  does not validate the (hidden) budget input. A missing `budget.yaml`
  is already a documented, supported state (compat defaults in
  `docs/budget-yaml-schema.md`; `verification_method` → `api` when
  absent), and it keeps the later flip-back-to-`profile: api` story
  clean: the operator authors a budget then, informed by real usage.
  When Build runs with the Direct-API sub-option selected, behavior is
  unchanged (validate, write `budget.yaml` no-clobber, report
  `budgetOutcome`).
- **Persistence.** A typed budget value survives sub-choice flips via
  `gsState` (api → copilot → api restores the typed value); flipping to
  Copilot hides but never clears it.

**Non-goals.** No change to the `budget.yaml` schema or its compat
defaults, the zero-rule ($0 method choice) semantics, the budget copy
(label, help, placeholder), the Lightweight tier, the Command-Palette
`setupNewProject` flow (which has no budget prompt today), or anything
in `ai_router/` (extension-only release). No redesign of the option-row
layout Set 080 shipped — the block nests under it, it does not alter it.

---

## Sessions

### Session 1 of 2: Conditional budget block + Build gating

**Steps:**
1. Move `budgetBlockHtml` rendering inside `transportProfileBlockHtml`
   as an indented child of the "Direct provider API keys" option row,
   rendered only when `controls.tier === "full"` AND
   `controls.transportProfile === "api"`; pick omit-vs-hidden
   consistent with the form's existing conditional-render patterns and
   document the choice in the code comment.
2. Update `client.js`: sub-choice flips show/hide (or re-render) the
   block; Build reads and validates the budget only while the block is
   live; the scaffold call passes `budget` only when the Direct-API
   sub-option is selected (`gitScaffold.ts` caller condition —
   `writeBudgetYaml` itself is unchanged).
3. Layer-2 tests: new placement/visibility suite (block under the api
   row on Full+api; absent on Full+copilot; absent on Lightweight),
   Build-matrix tests (api+budget writes `budget.yaml`; copilot writes
   none and skips validation), and persistence (typed value survives an
   api → copilot → api flip). Existing budget parsing / zero-rule /
   no-clobber tests must not need semantic edits — a semantic edit is a
   scope smell to stop on (the Set 080 tripwire).
4. Full Layer-2 suite + `tsc` green; Layer-3 Playwright run locally
   (this session changes an Explorer-rendering surface — L-064-12).

**Creates:** conditional budget-block markup + client wiring + Build
gating, new Layer-2 suites.
**Touches:** `media/session-sets-tree/gettingStartedHtml.js`,
`media/session-sets-tree/client.js`, `media/session-sets-tree/tree.css`
(indentation only, if needed), `src/commands/gitScaffold.ts`,
`src/test/suite/gettingStartedHtml.test.ts`, the gitScaffold test suite.
**Ends with:** on the vscode-stub, Full+api renders the budget block
under the Direct-API row, Full+copilot renders no budget block, Build
writes `budget.yaml` only on the api path, and all pre-existing budget
semantics tests pass unchanged.
**Progress keys:** `s1.placement`, `s1.build-gating`, `s1.tests`

---

### Session 2 of 2: UAT, screenshot, and release

**Steps:**
1. Author the per-set UAT checklist to the Set 078/079/080 bar (literal
   labels, source-re-grounded strings, fresh suite counts quoted per
   walk): a placement/visibility walk per sub-option, a persistence
   walk (typed value survives the flip round-trip and a window reload),
   and one REAL Build per sub-option in fresh empty folders asserting
   the `budget.yaml` write matrix (present with api + typed budget;
   absent with copilot) — cold-start per L-079-3.
2. Operator walk; remediate any findings.
3. Operator captures a refreshed `getting-started.png` (the 0.36.0
   capture shows the budget block below the group; this set moves it
   under the Direct-API row); commit it.
4. Run the advisory end-of-set path-aware critique stage; then version
   bump (extension only), CHANGELOG, repository-reference, commit,
   push, green Test, operator-authorized tag push.

**Creates:** `081-budget-input-scoped-to-direct-api-uat-checklist.json`,
refreshed screenshot, `path-aware-critique.json`, release.
**Touches:** `tools/dabbler-ai-orchestration/CHANGELOG.md`,
`package.json`, `docs/repository-reference.md`,
`tools/dabbler-ai-orchestration/media/getting-started.png`.
**Ends with:** UAT attested, screenshot current, advisory critique
artifact saved, release published on operator authorization.
**Progress keys:** `s2.uat`, `s2.screenshot`, `s2.release`

---

## Anti-patterns avoided

- **Implicit UAT** — declared `requiresUAT: true`; visible form behavior
  and Build outcomes change.
- **Prose-vs-config gate mismatch** — `pathAwareCritique: advisory` is
  declared in the config block (L-079-2).
- **Pre-seeded dogfood** — Session 2's Build walks start from fresh
  empty folders so the write-matrix assertion exercises the true cold
  start (L-079-3).
- **Scope creep** — a semantic edit to any pre-existing budget
  parsing / zero-rule / no-clobber test means the change leaked past
  placement + gating, and the session stops.
