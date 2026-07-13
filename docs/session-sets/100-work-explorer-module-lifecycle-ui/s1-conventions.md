# Conventions block — Set 100 Session 1

**Severity rubric (L-095-1, grade by CONSEQUENCE):** severity =
probability the stated failure scenario materializes for a real user ×
impact on the deliverable's objectives. Low-probability OR low-impact
findings are Minor even when technically correct; a finding with no
plausible failure scenario is Minor by definition. Only material
Critical/Major findings block.

**Suite baseline (all run fresh this session):** extension unit suite
(vscode-stub mocha path) 1588 passing / 0 failing — the Set 099
baseline was 1694 including electron-only suites; the stub path is the
sanctioned local runner while `npm test` (Layer 2 @vscode/test-electron)
cannot launch on VS Code 1.128.0 (`bad option: --no-sandbox`, standing
environment issue, not session-caused). `tsc --noEmit` clean; esbuild
compile clean; eslint: 7 pre-existing errors in untouched test files
(`no-var-requires` in prerequisites/pythonInterpreter/perf-benchmark/
scanAnnotations tests, one `no-regex-spaces` in consumerBootstrap
tests) — the standing baseline, none in files this session touched.
Playwright Layer 3 run locally per L-064-12 (this session changes
Explorer-rendering surfaces): full run 25 passed / 1 failed where the
one failure was this session's own new bucket-key assertion pointed at
an EMPTY bucket (empty buckets are leaves and carry no
`data-bucket-key`); assertion corrected to the populated bucket and the
spec file re-run 9/9 green — 26/26 effective, zero product defects
surfaced. `ai_router` pytest: 3030 passed / 6 skipped — the
standing baseline, unchanged (zero `ai_router/` code files changed
this session).

**Release contract:** NO version bump and NO publish out of this set —
the module-lifecycle-simplification bundle (Sets 098–101) has a single
release boundary after Set 101 closes (operator-confirmed verdict).
`package.json` stays at 0.43.0 (Set 097's bump; that publish itself is
still operator-gated). The tracked `dist/` bundle is committed as
rebuilt (repo convention) but is default-excluded from the verification
evidence diff.

**By-design decisions (operator-confirmed verdict + spec — do not
re-litigate):**
- This session REVERSES Set 093 S1's tree on purpose: the persistent
  `Plan` / `Session sets` child nodes, the `blocked-until-plan` module
  state, `deriveModuleChildren`, and the `planExists` plumbing are
  REMOVED per the verdict ("buckets nest directly under the module
  row"; plan/decomposition state is visible as the kind-typed sets
  themselves). Findings that ask to restore any of them are
  out-of-scope by design.
- The tree is three levels (module aria-level 1 / bucket 2 / row 3).
  The never-hide-work guarantee now rests entirely on the TERMINAL
  row-rendering gate in `renderBucket` (emptiness decided from the
  actual rows array, never the display count) — the removed
  `renderSessionSetsNode` hasRows guard was defense-in-depth for a node
  that no longer exists.
- Kind badge is PRESENTATION ONLY (verdict decision 5: `kind` must not
  grow into a workflow/state schema): `kindBadge` ships the validated
  `SessionSet.kind` verbatim ("plan"/"decomposition"/""), unknown kinds
  degrade badge-less (Set 098 warn-and-degrade), no new node types, no
  new states, no new actions.
- The blocked-until-plan signal now rides the scaffolded decomposition
  set's prerequisite blocked marker (existing Set 061 machinery,
  pre-linked by Set 098's template) — pinned end-to-end in
  `moduleLifecycleUi.test.ts` including the unblock when the plan set
  completes.
- Module-row ACTIONS are unchanged this session — Session 2 owns the
  lifecycle action strip rework, strip retirements, and Add-module
  scaffolding. The 093 S2 action strip (AI Plan / Import Plan / Open
  Plan / AI Sets) still renders as-is; do not flag its presence.
- `VisibleModule.planPath` deliberately survives (the wizard flows and
  Session 2's `Open Plan` resolve it at action time); only `planExists`
  died with the Plan node.
- The Set 093 S1 UAT checklist walks are superseded by this change
  (they assert the removed child rows) — recorded in this session's
  checklist Notes and the disposition as a known consequence, not a
  defect.
- UAT/E2E are `suggested` (non-gating). The spec's operator-authored
  config comments arm both: E2E = the Layer 3 pins moved in the same
  session (093 amendment-6 discipline); UAT = the ad-hoc human walk
  compiled at the 078/087-S3 bar
  (`100-work-explorer-module-lifecycle-ui-uat-checklist.json`,
  optional, does not gate close). `suggestion_disposition: both`
  recorded in activity-log.json.

**Known pre-existing gaps, out of this session's scope:**
- `docs/spec-md-schema.md` still does not document `module:` /
  `prerequisites:` (recorded at Set 098 for a Step 9 follow-on;
  unchanged here).
- The `npm test` electron launcher failure on VS Code 1.128.0 is a
  standing environment issue (memory: extension-test-harness-electron-
  broken), not introduced or fixable here.
