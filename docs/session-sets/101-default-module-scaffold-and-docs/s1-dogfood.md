# Set 101 S1 dogfood — the real Build -> default-module -> rename -> delete -> re-add loop

Ran the REAL compiled (`tsc --outDir out`) `buildProjectStructureNoPrompt`
entry point — the actual Build command's implementation, not a stand-in —
against a genuinely empty scratch temp folder (cold start, L-079-3), with
only the network `pip install` faked (offline/fast; unrelated to this
session's change). Every other step of Build runs for real: git init,
template rendering, `ensureModulesManifest`, and — the point of this
session — the new default-module + lifecycle-set scaffold hookup. Then
walked the full Class1 loop with the REAL `moduleAuthoring.js` writers
(`renameModule`, `deleteModule`, `scaffoldNewModule`,
`scaffoldModuleLifecycleSets`), mirroring the Set 100 S2 dogfood harness
style: writer-level, one layer below the interactive command-flow
functions VS Code's native input boxes and confirm dialogs sit on top of
(the same acknowledged, non-gating gap Set 100 named — covered instead by
this session's unit tests plus optional ad-hoc UAT).

```
Scratch cold-start repo: <tmp>\dabbler-101-s1-dogfood-*
Cold-start check: EMPTY (pass)

=== STEP 1: Build project structure (full tier) ===
[info] Project structure built (full tier): 13 file(s) written. ai-router installed. Default module scaffolded: 001-default-plan (plan) and 002-default-decomposition (decomposition) — rename or delete "Default" any time from the Work Explorer.
buildProjectStructureNoPrompt -> {"written":13,"skipped":0}

--- AFTER Build (fresh scaffold) ---
modules.yaml: [default]
  001-default-plan [module=default, kind=plan, prereqs=(none)]
  002-default-decomposition [module=default, kind=decomposition, prereqs=001-default-plan]

=== STEP 2: Re-run Build (idempotency check) ===
[info] Project structure built (full tier): 1 file(s) written, 12 existing kept. ai-router installed.
second Build call -> {"written":1,"skipped":12}

--- AFTER second Build (must be unchanged) ---
modules.yaml: [default]
  001-default-plan [module=default, kind=plan, prereqs=(none)]
  002-default-decomposition [module=default, kind=decomposition, prereqs=001-default-plan]

=== STEP 3: Rename Default -> Greeter ===
renameModule -> {"oldSlug":"default","newSlug":"greeter","newTitle":"Greeter","slugChanged":true,"titleChanged":true,"restamped":["001-default-plan","002-default-decomposition"]}

--- AFTER rename (default -> greeter) ---
modules.yaml: [greeter]
  001-default-plan [module=greeter, kind=plan, prereqs=(none)]
  002-default-decomposition [module=greeter, kind=decomposition, prereqs=001-default-plan]

=== STEP 4: Delete Greeter ===
deleteModule -> {"slug":"greeter","cancelled":[],"removed":["001-default-plan","002-default-decomposition"],"terminal":[]}

--- AFTER delete (greeter) ---
modules.yaml: []

=== STEP 5: Re-add a real module (payments) ===
scaffoldNewModule -> {"manifestRel":"docs/modules.yaml","planRel":"docs/modules/payments/project-plan.md","manifestCreated":false,"planCreated":true}
scaffoldModuleLifecycleSets -> {"planSlug":"001-payments-plan","planSpecRel":"docs/session-sets/001-payments-plan/spec.md","planCreated":true,"decompositionSlug":"002-payments-decomposition","decompositionSpecRel":"docs/session-sets/002-payments-decomposition/spec.md","decompositionCreated":true}

--- AFTER re-add (payments) ---
modules.yaml: [payments]
  001-payments-plan [module=payments, kind=plan, prereqs=(none)]
  002-payments-decomposition [module=payments, kind=decomposition, prereqs=001-payments-plan]

=== DOGFOOD PASS/FAIL CHECKS ===
PASS: Build scaffolds default + 2 lifecycle sets
PASS: default module declared after first Build
PASS: Re-run Build makes no NEW module/set writes (docs/modules.yaml skipped 2nd time)
PASS: Rename restamped both lifecycle sets, zero orphans
PASS: Delete removed both unstarted lifecycle scaffolds
PASS: Re-add creates a fresh payments module + 2 sets

=== FULL CLASS1 LOOP DOGFOOD: PASS ===
```

Confirmed: a fresh Build declares the real `default` module and scaffolds
its plan set (`001-default-plan`, ready, no prereqs) and decomposition set
(`002-default-decomposition`, cross-linked `prerequisites: [001-default-plan]`)
in one call — the Class1 starter. Re-running Build makes `docs/modules.yaml`
report in `skipped`, not `written` (12 existing kept, only the always-write-
through tier marker landing new) — no second module or set is minted,
confirming the idempotent-rerun contract at the wiring layer (also unit-
pinned in `gitScaffoldDefaultModule.test.ts`, both fake-seam and real-writer
variants). Rename restamps both lifecycle sets with zero orphans; delete
removes both (unstarted `kind: plan|decomposition` scaffolds with no
execution artifacts classify `remove`, per Set 099's disposition rule) and
clears the manifest entry; re-adding a real module (`payments`) via the same
`scaffoldNewModule` + `scaffoldModuleLifecycleSets` pair the module row's
`Add` action calls produces a fresh, correctly-numbered plan/decomposition
pair — the full first-run loop the spec's Session 1 "Ends with" line names.

**Known, named gap (mirrors Set 100 S2):** this run drives the real
`buildProjectStructureNoPrompt` entry point and the real
`moduleAuthoring.js` writers directly, not the full interactive VS Code
command-flow layer (native input boxes / confirm dialogs / the Getting
Started webview form) — headlessly driving those is out of scope for this
session's dogfood. That layer is covered instead by the existing
`renameModule.test.ts` / `deleteModule.test.ts` `preselectedSlug` suites,
the `runNewModuleFlow` lifecycle-scaffold suite in `moduleAuthoring.test.ts`,
this session's new `gitScaffoldDefaultModule.test.ts` (fake-seam gating +
one real-writer wiring test), and optional, non-gating ad-hoc UAT.

The legacy-repo non-interference case (Build on a repo whose
`docs/modules.yaml` already exists, however empty) is unit-pinned rather
than re-run here: `gitScaffoldDefaultModule.test.ts`'s "pre-existing
manifest (skipped): the default-module seam never runs" test (both Full and
Lightweight tier) exercises exactly that branch deterministically.
