# Getting Started Shrink & Manifest Lifecycle Spec (Work Explorer redesign — Set D)

> **Purpose:** Finish the redesign's onboarding/lifecycle half: shrink the
> Getting Started form to **two sections** (Build project structure +
> Define modules (optional)), wire the **create-on-demand
> `docs/modules.yaml`** ensure-writes on **explicit user actions only**
> (adjudication A — never on activation), add the Work Explorer toolbar
> **open modules.yaml** button, deliver the **D6 AI module-decomposition
> prompt** as a copy command (never a giant YAML comment), **shelve the
> parallel-session-sets UI** with an advanced escape hatch (machinery
> kept), complete the docs pass, and run **release prep for the single
> release boundary** covering Sets 091–094.
> **Created:** 2026-07-11
> **Session Set:** `docs/session-sets/094-getting-started-shrink-and-manifest-lifecycle/`
> **Prerequisite:** `093-work-explorer-module-row-interactions` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # The Getting Started form is rebuilt and the manifest lifecycle is new; arm the ad-hoc human walk (Set 078/087-S3 bar) against the locally built VSIX.
requiresE2E: suggested    # The form webview changes have Playwright Layer 3 coverage (L-064-12 precedent).
uatStyle: ad-hoc          # Non-web VS Code UI.
uatScope: per-session
pathAwareCritique: advisory  # The ensure-write rule (explicit action only, never activation) must hold identically across scaffold, toolbar, form button, new-module, and prompt-copy paths — one trust-boundary invariant spanning five call sites.
prerequisites:
  - slug: 093-work-explorer-module-row-interactions
    condition: complete
```

> Rationale: UAT/E2E `suggested` per the Set 087 precedent. This is the
> **release-boundary set**: when it closes, Sets 091–094 publish together
> (extension version bump + Marketplace publish per the CONTRIBUTING
> runbook, operator-gated) — a half-migrated UX is worse than either whole
> (verdict). Until then all UAT runs on the locally built VSIX.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements **Set D** of the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md);
proposal D1/D2/D5/D6 + amendments 3 (trigger half), 5 (form half), 7, 8
(prompt half) + adjudication A):

- **D1 — the form shrinks to two sections.** (1) **Build project
  structure** — substantially as today (tier radio, seat profile,
  budget/NTE on the Direct-API path, no-prompt scaffold), NOT collapsible
  (operator correction 2026-07-11). (2) **Define modules (optional)** —
  NEW: a button that opens `docs/modules.yaml` in the editor; section copy
  encourages AI-assisted decomposition (D6) and explicitly instructs the
  human to SAVE the file. The old steps 2 (plan create/import) and 3
  (build session sets) — and the S3 "New module…" button — are REMOVED
  from the form: Set 093's per-module row actions own them now. The
  no-folder CTA surface is unchanged.
- **Adjudication A — ensure-write on explicit user action ONLY, never on
  activation.** The Set 091 canonical template (header comments +
  commented examples + `modules: []`) is written idempotently
  (skip-existing; the Set 077 S4 `ensureCrossProviderVerificationDoc`
  precedent) by: the scaffold/`setupNewProject`, the form's and toolbar's
  **Open modules.yaml** (create-if-absent, then open), **Add module**, and
  **copy decomposition prompt**. An extension that edits a repo because it
  was opened is a trust violation.
- **D6 / amendment 8 — the decomposition prompt is a copy command.** A
  bundled, copyable prompt (house copy-prompt pattern) instructing an AI
  agent to decompose the project into modules and write
  `docs/modules.yaml` (slugs, titles, codeRoots, planPath, integration
  `touches`), honoring the invariants (globally-unique set names; module =
  grouping, never identity). Referenced from the Define-modules section
  copy and from the manifest's header comment — never embedded as a giant
  comment block.
- **D5 / amendment 7 — parallel-sets UI shelved with an escape hatch.**
  Remove the "Create parallel session sets where possible" checkbox and
  its prompt guidance from primary UI; KEEP the `prerequisites:` machinery
  and the worktree tooling; preserve an advanced path (Command Palette
  variant or a `parallelHint` setting) for the narrow
  multiple-branches-in-one-module case. UI-level shelving, reversible.
- **Dissolved 087 deferral:** the form's step-2 `planPresent` flag gap
  (module plan imports didn't flip the step) dissolves — the plan step no
  longer exists on the form; plan state lives on Set 093's per-module
  `Plan` nodes. Retire the flag machinery the shrink orphans; the
  remaining completion flag semantics (structureBuilt) are re-derived for
  the two-section form.

### Explicitly out of scope (proposal)

- Copilot seat cost estimation (own future set); the custom right-click
  context menu revival; physical set moves; codeRoots scope check;
  ai_router/Python changes beyond what the ensure-write requires (if any).

---

## Sessions

### Session 1 of 2: Form shrink + create-on-demand manifest lifecycle

**Steps:**
1. Register; read this spec, the verdict (adjudication A), the compat
   matrix, and Sets 092/093 outcomes.
2. Getting Started (`media/session-sets-tree/gettingStartedHtml.js` +
   `src/commands/gettingStartedActions.ts` + protocol): rebuild to the two
   sections; remove old steps 2/3, the S3 "New module…" button, and the
   parallel-sets checkbox (its guidance strings go in Session 2); the
   Define-modules section gets the open-modules.yaml button (create-if-
   absent from the Set 091 template, then open in the editor), the
   save-the-file instruction, and the D6 prompt reference; re-derive the
   completion-flag model for the two-section form and delete the orphaned
   `planPresent`/`sessionSetsPresent` machinery (Set 060 D3 lineage —
   record what the watcher contract loses).
3. Toolbar: add the **open modules.yaml** button to the Work Explorer
   title bar (same create-if-absent handler).
4. Ensure-write audit: exactly the four explicit-action call sites write
   the template (scaffold, open-modules.yaml button/toolbar, add-module,
   copy decomposition prompt — the last lands in Session 2 but the shared
   handler ships now); test-pin that activation and refresh NEVER write.
5. Tests: two-section render; button create-vs-open matrix (absent /
   present / invalid — invalid opens the file and lets the Set 092 strip
   report, never overwrites); no-write-on-activation; form completion
   flags; Layer 3 smoke on the shrunken form.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`.

**Creates:** the two-section form; the shared ensure-write handler; the
toolbar button.
**Touches:** `media/session-sets-tree/gettingStartedHtml.js`,
`src/commands/gettingStartedActions.ts`, `src/utils/moduleAuthoring.ts`,
`src/utils/consumerBootstrap.ts`, `src/providers/CustomSessionSetsView.ts`,
`tools/dabbler-ai-orchestration/package.json`, Layer 2/3 suites.
**Ends with:** the form is two sections with no vanished-step mode switch
left in the flow; `docs/modules.yaml` comes into existence only on the
named explicit actions (proven by tests); toolbar button live; suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded.
**Progress keys:** form-two-sections, old-steps-removed,
ensure-write-explicit-only, toolbar-open-manifest,
planpresent-machinery-retired, suite-green

---

### Session 2 of 2: D6 prompt, parallel shelving escape hatch, docs pass & release prep

**Steps:**
1. Register; read this spec and Session 1's outcome.
2. D6 prompt: a `dabbler.copyModuleDecompositionPrompt` command (house
   copy-prompt pattern) whose prompt decomposes the project into modules
   and writes `docs/modules.yaml` honoring the invariants; referenced from
   the Define-modules section copy and the manifest template's header
   comment; the copy action is the fourth ensure-write site.
3. Parallel shelving: strip the parallel-sets guidance from the
   decomposition/session-gen prompt templates; add the escape hatch —
   decide Command-Palette variant vs `parallelHint` setting via routed
   `route(task_type="architecture")` and implement the winner; machinery
   (`prerequisites:` field, worktree tooling) untouched, pinned by an
   explicit regression test.
4. Docs pass: quick-start, README(s), `docs/repository-reference.md`,
   workflow-doc touchpoints, and remaining screenshots/strings from the
   092 rename sweep; the compat matrix marked as shipped-state.
5. Release prep for the single boundary: extension version bump +
   CHANGELOG covering Sets 091–094; confirm the publish runbook
   (CONTRIBUTING) is runnable; **publish itself stays operator-gated**.
   Confirm the pending UAT dispositions across 092/093/094 are resolved or
   explicitly operator-adjudicated before recommending publish.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`; end-of-set
   `change-log.md`; Step 9 review; the armed advisory path-aware critique
   before the set-terminal close.

**Creates:** the D6 decomposition prompt command; the parallel escape
hatch; `change-log.md`; release-prep CHANGELOG entries.
**Touches:** `src/wizard/sessionGenPrompt.ts`, prompt template assets,
`tools/dabbler-ai-orchestration/package.json`, docs tree, `CHANGELOG`s.
**Ends with:** an operator can go sketch→manifest with one copied prompt
and one save; parallel-sets UI is gone from primary surfaces with the
machinery intact and an advanced path preserved; docs/screenshots describe
the shipped UX; the 091–094 release is prepared and publish-ready pending
the operator; suite green; cross-provider VERIFIED (or Minor-only);
pushed; `close_session` succeeded; Step 9 + advisory critique recorded.
**Progress keys:** d6-prompt-command, parallel-ui-shelved,
escape-hatch-live, docs-pass-complete, release-prepped, suite-green,
set-closed

---

## End-of-set deliverables

- Two-section Getting Started (Build + Define modules), old steps 2/3 and
  the S3 New-module button retired to the tree.
- Create-on-demand modules.yaml on the four explicit actions; proven
  no-write-on-activation.
- Work Explorer toolbar open-modules.yaml button.
- The D6 module-decomposition copy-prompt command, referenced from the
  form copy and the manifest header.
- Parallel-sets UI shelved + escape hatch; machinery intact.
- Docs pass + single-boundary release prep for Sets 091–094
  (publish operator-gated).
- `change-log.md` + standard per-session artifacts.

> **After this set (verdict):** Set 095 (the Hello World walkthrough +
> AI feedback prompt — the re-homed 087 S4) documents the new UX; the
> re-attached follow-on sets (locator/scope-check; physical moves) proceed
> per their own re-attach points.
