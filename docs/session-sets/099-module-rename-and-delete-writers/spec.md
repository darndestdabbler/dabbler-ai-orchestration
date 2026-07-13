# Module Rename and Delete Writers Spec (Module lifecycle simplification — Set 2 of 4)

> **Purpose:** Make module management safe without hand-editing
> `docs/modules.yaml`: a **transactional rename writer** (manifest entry +
> every affected set's `module:` stamp rewritten all-or-nothing, with
> preflights) and a **delete writer** (manifest entry removed;
> non-terminal sets cancelled via the existing `CANCELLED.md` writer;
> only an unstarted `kind: plan|decomposition` scaffold with no execution
> artifacts is removed outright; completed sets untouched — they fall
> into the existing fallback group). Palette commands ship here; the
> module-row UI wiring is Set 100's.
> **Created:** 2026-07-13
> **Session Set:** `docs/session-sets/099-module-rename-and-delete-writers/`
> **Prerequisite:** `098-module-plan-and-decomposition-set-kinds` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # Writer-level set; the interactive flows get their human walk with Set 100/101's UI (the modal confirms here are exercised by dogfood + tests).
requiresE2E: false        # No tree/DOM change; Layer 1/2 coverage governs the writers.
uatScope: none
pathAwareCritique: advisory  # Rename touches one manifest + N spec files atomically across two writers' machinery — the transaction seam deserves a multi-provider look.
prerequisites:
  - slug: 098-module-plan-and-decomposition-set-kinds
    condition: complete
```

> Rationale: the delete removal rule reads `kind` (Set 098). Destructive
> writers with an audit posture — dogfood on a scratch repo is mandatory
> before close. **No publish out of this set** — single release boundary
> after Set 101.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements P2's writers per the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-13-module-lifecycle-simplification/verdict.md),
decisions 1–3):

- **Slug stays identity.** No `moduleId`, no tombstones, no slug
  registry — explicitly cut as overengineering. Rename is therefore a
  preflighted, all-or-nothing rewrite: the `modules.yaml` entry
  (format-preserving, the Set 091 appender posture) AND a restamp of
  `module: <old>` → `module: <new>` in every affected set's `spec.md`
  (the two-phase atomic temp→rename machinery from
  `assignLegacySetsToModule`).
- **Rename preflights:** target slug validates (`validateNewModuleSlug`
  rules) and is unique among declared slugs; **reject** a rename whose
  target collides with an undeclared slug that already has stamped sets
  (merging histories silently is the failure mode); **refuse while any
  affected set has a running session** (non-terminal state with an
  active session). A refusal leaves every file untouched and reports.
- **Delete semantics (operator's rule, adjudicated):** remove the
  manifest entry; cancel each non-terminal set via `cancelSessionSet`
  (CANCELLED.md, audit preserved, restorable); **remove outright only**
  an unstarted `kind: plan|decomposition` set with no execution
  artifacts (no `session-state.json`, no session artifacts — the
  scaffold placeholder Set 098/100/101 creates); completed sets are
  never touched and reappear in the undeclared-slug fallback group.
  Re-declaring the slug later restores the history — document this
  emergent property, do not build mechanism for it.
- **Two-step confirmation** on both commands, mirroring the cancel
  writer's modal posture; delete's confirm enumerates exactly what will
  be cancelled/removed/left before acting.

### Non-goals (owned by sibling sets)

- Module-row buttons / context menu — **Set 100** (palette-only here).
- `planPath` files are **never moved or deleted** by rename/delete —
  the plan doc is operator-owned content; rename keeps `planPath`
  as-is, delete leaves the `docs/modules/<slug>/` folder in place.
- Split/merge module reorganizations — the ask-the-AI guidance doc,
  **Set 101**.

---

## Sessions

### Session 1 of 2: Transactional rename writer

**Steps:**
1. Register; read this spec, the verdict, and
   `src/utils/moduleAuthoring.ts` (the appender + stamp machinery and
   `assignLegacySetsToModule`'s two-phase pattern).
2. Implement `renameModule(root, oldSlug, {newSlug?, newTitle?})` in
   `moduleAuthoring.ts`: preflight (validate + uniqueness + undeclared-
   slug-history collision + no-running-session), then the all-or-nothing
   apply — format-preserving manifest edit (slug and/or title) +
   restamp of every affected spec.md; parse-after-write guards on every
   file; any failure rolls back to the pre-transaction state and
   reports. Title-only rename skips the restamp entirely (manifest-only
   edit).
3. Palette command `dabbler.renameModule`: module QuickPick → input
   boxes (new slug and/or title, validated live) → two-step confirm
   naming the N sets that will be restamped → writer → summary toast.
4. Tests: preflight matrix (invalid slug, duplicate declared slug,
   undeclared-slug history collision, running-session refusal), apply
   matrix (0/1/N affected sets, title-only, slug+title), rollback on
   injected mid-transaction failure, format preservation (comments and
   entry order survive).
5. Dogfood on a scratch multi-module repo: rename a module with stamped
   sets end-to-end; confirm the Explorer regroups with zero orphans.
6. Build + full suite; verify (mandatory); author `disposition.json`;
   commit + push; `close_session`.

**Creates:** `renameModule` writer + `dabbler.renameModule` + tests.
**Touches:** `src/utils/moduleAuthoring.ts`, new
`src/commands/renameModule.ts`, `tools/dabbler-ai-orchestration/package.json`
(command contribution), test suites.
**Ends with:** rename is transactional with zero stranded sets in every
tested path; refusals leave files byte-identical; dogfood pass; suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded.
**Progress keys:** rename-preflights, rename-transactional-restamp,
rollback-proven, format-preserved, dogfood-pass, suite-green

---

### Session 2 of 2: Delete writer

**Steps:**
1. Register; read this spec, Session 1's outcome, and
   `src/utils/cancelLifecycle.ts` (the cancel writer contract).
2. Implement `deleteModule(root, slug)` in `moduleAuthoring.ts`:
   classify the module's sets — terminal (untouched), non-terminal
   (cancel via `cancelSessionSet`, reason auto-noted "module <slug>
   deleted"), removable scaffold (unstarted `kind: plan|decomposition`,
   no execution artifacts → remove the set directory); then remove the
   manifest entry (format-preserving). Refuse while any affected set
   has a running session. Partial-failure posture: cancels are
   idempotent and re-runnable; the manifest edit happens **last** so a
   failed run never half-deletes the module.
3. Palette command `dabbler.deleteModule`: module QuickPick → two-step
   modal confirm that enumerates the exact disposition (K cancelled,
   M removed, J completed left in fallback) → writer → summary toast.
4. Tests: classification matrix (terminal / non-terminal / started
   plan set is CANCELLED not removed / unstarted plan+decomposition
   scaffolds removed / kindless unstarted set is cancelled not removed),
   manifest-edit-last ordering, running-session refusal, re-declare
   slug → history reappears (the emergent-restore property).
5. Dogfood on a scratch repo: delete a module carrying all four set
   states; confirm the confirm-dialog enumeration matches the outcome
   exactly.
6. Build + full suite; verify (mandatory); author `disposition.json`;
   commit + push; `close_session`; end-of-set `change-log.md`; Step 9
   review; the armed advisory path-aware critique before the
   set-terminal close.

**Creates:** `deleteModule` writer + `dabbler.deleteModule` + tests,
`change-log.md`.
**Touches:** `src/utils/moduleAuthoring.ts`, new
`src/commands/deleteModule.ts`, `tools/dabbler-ai-orchestration/package.json`,
test suites.
**Ends with:** delete follows the adjudicated disposition rules exactly;
completed history is never touched; the modal enumeration is truthful;
dogfood pass; suite green; cross-provider VERIFIED (or Minor-only);
pushed; `close_session` succeeded; Step 9 + advisory critique recorded.
**Progress keys:** delete-classification-correct, cancel-writer-reused,
scaffold-removal-scoped, manifest-edit-last, dogfood-pass, suite-green,
set-closed

---

## End-of-set deliverables

- `renameModule` + `deleteModule` writers in `moduleAuthoring.ts` with
  the adjudicated preflights and disposition rules.
- `dabbler.renameModule` / `dabbler.deleteModule` palette commands with
  two-step truthful confirms.
- Writer test matrices incl. rollback and emergent-restore; dogfood
  records; `change-log.md`; standard per-session artifacts.

> **Release boundary reminder:** no Marketplace/PyPI publish until
> Set 101 closes.
