# Conventions block — Set 098 Session 1

**Suite baseline (all run fresh this session, all green):** `ai_router`
pytest 3030 passed / 6 skipped (the 6 skips are the standing baseline,
none introduced here; zero `ai_router/` code files changed this
session). Extension unit suite 1522 passing (1511 post-Set-097 baseline
+ 11 new `sessionSetKind.test.ts` tests). Playwright Layer 3 run
locally per L-064-12 (this session touches `readSessionSets`, the
Explorer's data source): 25/26 on the full run with one failure in
`blocked-by-prereqs.spec.ts` at a command-palette interaction step —
an electron palette-timing flake on a surface this session does not
touch; the spec passed 4/4 on an isolated re-run immediately after.
`tsc --noEmit` clean; esbuild compile clean.

**Release contract:** NO version bump and NO publish out of this set —
the module-lifecycle-simplification bundle (Sets 098–101) has a single
release boundary after Set 101 closes (operator-confirmed verdict).
`package.json` stays at 0.43.0 (Set 097's bump, publish itself still
operator-gated); `dabbler-ai-router` stays at its staged version. The
tracked `dist/` bundle is committed as rebuilt (repo convention, same
as Set 097) but is default-excluded from the verification evidence
diff.

**By-design decisions (operator-confirmed verdict + spec — do not
re-litigate):**
- `kind` is deliberately minimal: one optional enum field,
  `plan | decomposition`; absent means ordinary work set. Its only
  sanctioned machine consumers are Set 099's delete removal rule and
  human/tooling legibility. Recommendations to extend it into a
  workflow/state schema, add more kinds, or persist it in
  session-state.json are out of scope by verdict decision 5.
- An unknown `kind` value warns and degrades to an ordinary work set —
  never a refusal (the Set 091 warn-and-degrade posture, spec-mandated).
  Raw value kept on `SessionSetConfig.kind`; validated enum on
  `SessionSet.kind`.
- NO Python-side parsing of `kind` — spec step 3 mandated
  check-then-skip unless an `ai_router` reader needs it today. The
  audit found every `ai_router` config-block reader key-plucks its own
  fields (`spec_config.py`: tier/requiresUAT/requiresE2E/uatScope;
  `start_session` gate seeds; `session_state.py`: totalSessions), so
  an added `kind:` line is inert there and no consumer exists yet.
  Recorded in activity-log step 3; not an omission.
- NO rendering/UI change ships here — Set 100 owns kind-aware rows and
  all UI wiring; this session's round-trip tests assert data presence
  on the `SessionSet` object only. `requiresUAT: false` /
  `requiresE2E: false` are spec-declared for exactly this reason.
- The authoring-guide spec TEMPLATE snippet deliberately does NOT gain
  a `kind:` line: the field is scaffolder output only; hand-authored
  work sets omit it. The reference config block + Field semantics entry
  document it instead.
- Session 2 of this set (not this session) owns the two lifecycle spec
  templates and the `scaffoldModuleLifecycleSets` writer.

**Known pre-existing gaps, out of this session's scope:**
- `docs/spec-md-schema.md` has never documented the shipped `module:`
  (Set 087) or `prerequisites:` (Set 047) config fields; this session
  adds `kind` per its spec but does not backfill those two (recorded
  for the Step 9 review, candidate follow-on).
- `ai_router/spec_config.py`'s docstring references a
  `schema_validator.py` that does not exist (aspirational since
  Set 048). Unchanged by this session.
