# Module Plan/Decomposition Set Kinds Spec (Module lifecycle simplification — Set 1 of 4)

> **Purpose:** Give plan authoring and decomposition a home inside the
> session-set pipeline: a small, **optional** `kind: plan | decomposition`
> field in the spec config block (machine-readable identity — set numbers
> are global and carry no meaning), scaffolded spec **templates** for the
> two kinds carrying the special AI guidance (create-or-import the plan;
> decompose reading the current plan + existing sets), a reusable
> **module-lifecycle-sets scaffold writer**, and decomposition gating via
> the existing `prerequisites:` machinery (the decomposition set declares
> its sibling plan set — no new gating code).
> **Created:** 2026-07-13
> **Session Set:** `docs/session-sets/098-module-plan-and-decomposition-set-kinds/`
> **Prerequisite:** None (builds on shipped Sets 091–094)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # Model/parser/template work; no interaction surface ships here (Set 100 owns the UI walk).
requiresE2E: false        # No user-visible behavior change; Layer 1/2 unit coverage governs.
uatScope: none
pathAwareCritique: advisory  # The kind field is a cross-seam contract: TS types, spec parser, schema doc, templates, and the scaffold writer must agree.
```

> Rationale: foundations set — everything lands behind the scenes until
> Set 100 wires the UI. **No Marketplace/PyPI publish out of this set** —
> single release boundary after Set 101.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements P1's foundations per the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-13-module-lifecycle-simplification/verdict.md)):

- **The session set is the audited transaction, not the artifact.**
  `docs/modules/<slug>/project-plan.md` stays the stable, amendable
  artifact. A plan amendment or a continue-decomposition pass is just
  another set of the same kind — nothing is one-shot or frozen.
- **`kind` stays minimal** (verdict decision 5): one optional enum
  field, `plan | decomposition`; absent means ordinary work set (every
  existing spec is untouched and valid). It exists for exactly two
  consumers — Set 099's delete removal rule and human/tooling
  legibility. It must NOT grow into a workflow/state schema.
- **Decomposition gating reuses `prerequisites:`** (verdict decision 6):
  the scaffolded decomposition set declares its sibling plan set with
  `condition: complete`. The Explorer's existing `[BLOCKED BY PREREQS]`
  badge does the work; no new mechanism.
- **Verification on planning documents is proportionate** (unanimous
  panel): plan/decomposition sets run the normal pipeline for their
  tier, no special-casing, honoring the no-skip mandate.

### Non-goals (owned by sibling sets)

- Rename/delete writers — **Set 099**.
- Tree changes, row actions, Add-module scaffolding the two sets —
  **Set 100**.
- Scaffolding the real `default` module + docs — **Set 101**.
- Any change to how existing flows (`AI Plan`, `Import Plan`, `AI Sets`)
  behave — they retire in Set 100, not here.

---

## Sessions

### Session 1 of 2: The optional `kind` field

**Steps:**
1. Register; read this spec, the verdict, and
   `docs/spec-md-schema.md` + `src/types.ts` for the current config
   contract.
2. Schema: add optional `kind: plan | decomposition` to the spec
   config block — `SessionSetConfig.kind` (raw) and `SessionSet.kind`
   (validated) in `src/types.ts`; tolerant parsing in the spec reader
   (`src/utils/fileSystem.ts`): absent → undefined; an unknown value
   parses as a **warning, never a refusal** (fail-loud-not-hidden, the
   Set 091 posture).
3. Mirror the field in the Python side only if the router's spec
   readers need it (check `ai_router/` spec consumers; if none read the
   config block today, record that and skip — do not add speculative
   parsing).
4. Document the field in `docs/spec-md-schema.md` and add the authoring
   note to `docs/planning/session-set-authoring-guide.md` (config-block
   snippet + "when to use `kind`" — scaffolder output only; hand-authored
   work sets omit it).
5. Tests: parse matrix (absent / plan / decomposition / unknown value /
   malformed), round-trip through the Explorer model (kind surfaces on
   the `SessionSet` object; no rendering change asserted here).
6. Build + full suite; verify (mandatory); author `disposition.json`;
   commit + push; `close_session`.

**Creates:** the `kind` contract + tests.
**Touches:** `src/types.ts`, `src/utils/fileSystem.ts`,
`docs/spec-md-schema.md`, `docs/planning/session-set-authoring-guide.md`,
Layer 2 suites.
**Ends with:** `kind` parses per the matrix; every existing spec still
validates unchanged; docs updated; suite green; cross-provider VERIFIED
(or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** kind-field-parsed, unknown-kind-warns-not-refuses,
schema-doc-updated, authoring-guide-updated, suite-green

---

### Session 2 of 2: Lifecycle-set templates and the scaffold writer

**Steps:**
1. Register; read this spec, Session 1's outcome, and the existing
   template bundle under `docs/templates/consumer-bootstrap/`.
2. Author the two spec **templates** (plan set, decomposition set) with
   the special AI guidance:
   - **Plan set** (`kind: plan`): create **or import** the module's
     `project-plan.md` (both paths are in-session work, replacing the
     separate AI-Plan/Import-Plan flows); the plan is the deliverable,
     verified through the normal pipeline. Amendments later = a new
     `kind: plan` set that revises the same artifact.
   - **Decomposition set** (`kind: decomposition`): read the current
     plan AND the module's existing sets (avoid duplication), author
     the next batch of session sets per the authoring guide;
     `prerequisites:` pre-filled with the sibling plan set. Continuing
     later = a new `kind: decomposition` set.
   Templates are placeholder-parameterized (module slug/title, set
   number, sibling-set slug) and follow the authoring-guide template
   snippet.
3. Implement the reusable scaffold writer in the extension
   (`src/utils/moduleAuthoring.ts`):
   `scaffoldModuleLifecycleSets(root, module)` — resolves the next two
   free set numbers (the `next_session_set_number` convention), renders
   both templates into `docs/session-sets/NNN-<module>-plan/` and
   `docs/session-sets/NNN-<module>-decomposition/` (spec.md only —
   state files are the blessed runtime writers' job), skip-existing and
   parse-after-write guarded (the Set 091 appender posture). Not wired
   to any UI yet — Sets 100/101 are the callers.
4. Tests: template rendering matrix (fresh module, numbers advance,
   prerequisite cross-link correct, skip-existing, refusal leaves the
   tree untouched); template specs validate against the spec parser
   including `kind`.
5. Build + full suite; verify (mandatory); author `disposition.json`;
   commit + push; `close_session`; end-of-set `change-log.md`; Step 9
   review; the armed advisory path-aware critique before the
   set-terminal close.

**Creates:** the two templates, `scaffoldModuleLifecycleSets`, tests,
`change-log.md`.
**Touches:** `docs/templates/consumer-bootstrap/` (new template files),
`src/utils/moduleAuthoring.ts`, `src/utils/fileSystem.ts` (number
resolution reuse), test suites.
**Ends with:** the writer scaffolds a module's two lifecycle sets with
correct numbers, kinds, guidance, and the prerequisite link; nothing in
shipped UI calls it yet; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded; Step 9 + advisory
critique recorded.
**Progress keys:** plan-template-authored, decomposition-template-authored,
scaffold-writer-guarded, prereq-cross-link, suite-green, set-closed

---

## End-of-set deliverables

- Optional `kind: plan | decomposition` spec-config field, parsed
  tolerantly, documented in the schema doc and authoring guide.
- Plan-set and decomposition-set spec templates carrying the special AI
  guidance; decomposition pre-linked to its sibling plan set via
  `prerequisites:`.
- `scaffoldModuleLifecycleSets` writer (guarded, not yet UI-wired).
- Updated Layer 2 suites; `change-log.md`; standard per-session artifacts.

> **Release boundary reminder:** no Marketplace/PyPI publish until
> Set 101 closes.
