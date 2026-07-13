# Conventions block — Set 100 Session 2 (final session of the set)

**Severity rubric (L-095-1, grade by CONSEQUENCE):** severity =
probability the stated failure scenario materializes for a real user ×
impact on the deliverable's objectives. Low-probability OR low-impact
findings are Minor even when technically correct; a finding with no
plausible failure scenario is Minor by definition. Only material
Critical/Major findings block.

**Suite baseline (all run fresh this session):** extension unit suite
(vscode-stub mocha path) 1605 passing / 0 failing (up from the Set 100
S1 baseline of 1588 — +17 new tests this session: narrowing/targeting
gates, rename/delete `preselectedSlug` seam, Add-module lifecycle
scaffold wiring, host/client source-scan pins). `npm test` (Layer 2
@vscode/test-electron) remains environment-broken on VS Code 1.128.0
(`bad option: --no-sandbox`, standing issue, not session-caused) — the
stub path is the sanctioned local runner. `tsc --noEmit` clean; esbuild
compile clean; eslint: the same 7 pre-existing errors in untouched test
files as S1's baseline (`no-var-requires` / `no-regex-spaces`), none in
files this session touched. Playwright Layer 3 run locally per
L-064-12 (this session changes Explorer-rendering surfaces): full run
26/26 passing, zero product defects surfaced. `ai_router` pytest: 3030
passed / 6 skipped — the standing baseline, unchanged (zero
`ai_router/` code files changed this session).

**Release contract:** NO version bump and NO publish out of this set —
the module-lifecycle-simplification bundle (Sets 098-101) has a single
release boundary after Set 101 closes (operator-confirmed verdict).
`package.json` stays at 0.43.0 (Set 097's bump; that publish itself is
still operator-gated). The tracked `dist/` bundle is committed as
rebuilt (repo convention) but is default-excluded from the
verification evidence diff.

**By-design decisions (operator-confirmed verdict + spec — do not
re-litigate):**
- The four Set 093 S2 authoring actions (`ai-plan` / `import-plan` /
  `ai-sets`) are DELIBERATELY retired from the module-row strip and
  context menu this session — superseded by the scaffolded
  `kind: plan|decomposition` lifecycle sets (Set 098). `open-plan`
  survives unchanged. The underlying capability (plan
  prompt/import/open, decomposition prompt) is NOT removed — it
  survives palette-only (`dabbler.importPlan`,
  `dabbler.generateSessionSetPrompt`, module-decomposition prompt) for
  legacy repos that predate `kind` sets. Findings that ask to keep
  those buttons on the strip, or that flag the palette commands as
  dead capability, are out-of-scope by design ("retire the affordance,
  not the capability").
- `add-module` / `rename-module` / `delete-module` are DECLARED-modules
  only, by design: the pseudo module keeps only `Assign legacy sets to
  module…` (Unassigned) and `Open Plan`, and gets NO lifecycle-management
  actions. This is not an oversight — a management action on the
  implicit/pseudo grouping has no manifest entry to rename or delete.
- `add-module` ignores the carried row/context module slug entirely —
  it always launches the same New Module flow regardless of which
  declared module's strip it was clicked from (the row is a convenient
  place to reach the "add module #2..N" affordance, not a target). This
  is intentional (verdict: "module-row management actions (Open plan /
  Add / Rename / Delete)") — do not flag it as a targeting bug.
- Rename/Delete from the row/context path use the EXPLICIT-TARGET seam
  (`opts.preselectedSlug`): NO module QuickPick fires, mirroring the
  Set 093 S2 authoring-action precedent. The palette commands
  (`dabbler.renameModule` / `dabbler.deleteModule`) intentionally KEEP
  their own QuickPick — that is the documented targeting-parity
  contract (row/context vs palette), not an inconsistency.
- The interactive parts of Add/Rename/Delete (VS Code's native input
  boxes and confirm dialogs) are NOT driven by the Layer 3 Playwright
  suite this session — clicking those buttons in an automated run
  would open a blocking modal Playwright never dismisses in this
  harness, so the click-focus/tabindex Playwright test
  (`module rows carry a hover/focus-revealed action strip...`)
  deliberately exercises `open-plan` (fire-and-forget) instead.
  `s2-dogfood.md` exercises the WRITER layer directly
  (`scaffoldNewModule` / `scaffoldModuleLifecycleSets` / `renameModule`
  / `deleteModule`) against a scratch multi-module repo, one layer
  below the interactive command-flow functions
  `moduleActionExec` binds — it names this explicitly as a known gap,
  not an overclaim. The command-flow layer itself IS exercised
  headlessly by the `preselectedSlug` unit-test suites
  (`renameModule.test.ts` / `deleteModule.test.ts`, which inject a fake
  UI in place of the real dialogs) and the `runNewModuleFlow`
  lifecycle-scaffold suite in `moduleAuthoring.test.ts`. The true
  end-to-end click-through (real input boxes, real confirm dialogs) is
  covered only by UAT Walks 4-6 (suggested, non-gating). This is a
  scoped, named gap, not a missed test.
- `runNewModuleFlow`'s lifecycle-scaffold call is WRAPPED separately
  from the manifest-append call: a scaffold refusal reports (appended
  to the same info toast) but the module stays declared — "module
  without sets beats half-written sets" (spec, verbatim). This is the
  by-design failure posture; do not flag the module-declared-but-
  sets-not-scaffolded state as a defect.
- `copySessionSetGenPrompt` / `copyPlanningPrompt` / `importPlanFromFile`
  in `wizard/planImport.ts` / `wizard/sessionGenPrompt.ts` still accept
  a `preselectedSlug` option that no caller passes anymore (the strip's
  `ai-sets`/`ai-plan`/`import-plan` producers retired). This is shared,
  still-tested infrastructure `openModulePlan` continues to use — those
  two files are outside this session's declared "Touches" list in the
  spec and were deliberately left untouched; do not flag the now-unused
  parameter as dead code requiring removal in this session.

**Known pre-existing gaps, out of this session's scope:**
- `docs/spec-md-schema.md` still does not document `module:` /
  `prerequisites:` (recorded at Set 098 for a Step 9 follow-on;
  unchanged here).
- The `npm test` electron launcher failure on VS Code 1.128.0 is a
  standing environment issue (memory: extension-test-harness-electron-
  broken), not introduced or fixable here.
- Scaffolding the REAL `default` module on Build, and any physical
  `docs/session-sets/<module>/` moves, are explicitly Set 101's and a
  separate deferred follow-on respectively (this spec's Non-goals) —
  not in scope for Session 2.
