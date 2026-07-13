# Change Log — Set 098: Module Plan/Decomposition Set Kinds

> **Set complete: 2026-07-13** (2 sessions). First of the four-set
> module-lifecycle-simplification bundle (Sets 098–101): the optional
> `kind: plan | decomposition` spec-config identity, the two scaffolded
> spec templates carrying the special AI guidance, and a reusable writer
> that scaffolds a module's lifecycle sets. No UI wiring and no publish —
> Sets 100/101 own those, with a single release boundary after Set 101.

## Session 1 of 2 — The optional `kind` field

- `SessionSetKind = "plan" | "decomposition"` in `src/types.ts`;
  `SessionSetConfig.kind` (raw, as-authored) and `SessionSet.kind`
  (validated) — absent stays undefined (every pre-098 spec unchanged),
  an unknown value warns and degrades to an ordinary work set, never a
  refusal.
- Raw capture in `parseSessionSetConfig` + warn-and-degrade validation in
  `readSessionSets` (`fileSystem.ts`).
- Documented in `docs/spec-md-schema.md` and the authoring guide
  (config-block snippet + Field semantics entry, scaffolder-output-only
  rule); the hand-authoring template snippet deliberately gains no
  `kind:` line.
- Python side: record-and-skip per spec step 3 — every `ai_router`
  config-block reader key-plucks its own fields, so `kind` is inert
  there and no consumer exists yet.
- 11 new tests (`sessionSetKind.test.ts`). Suites green; cross-provider
  phased discovery VERIFIED with zero findings on round 1.

## Session 2 of 2 — Lifecycle-set templates and the scaffold writer

- **The two templates** (`docs/templates/consumer-bootstrap/`):
  `module-plan-set.spec.md.template` (`kind: plan` — create **or**
  import the module's `project-plan.md`, replacing the separate
  AI-Plan/Import-Plan flows Set 100 retires) and
  `module-decomposition-set.spec.md.template` (`kind: decomposition` —
  read the current plan plus the module's existing sets, author the
  next batch, `prerequisites:` pre-linked to the sibling plan set —
  reuses the existing gating machinery, no new mechanism). Both are
  single-session, `tier: full`, placeholder-parameterized
  (`{{MODULE_SLUG}}`, `{{MODULE_TITLE}}`, `{{SLUG}}`, `{{CREATED}}`,
  `{{PLAN_REL_PATH}}`, and — decomposition only — `{{PLAN_SLUG}}`).
- **`scaffoldModuleLifecycleSets(root, module)`** (`moduleAuthoring.ts`):
  resolves the next two free set numbers (new `nextSessionSetNumberFrom`
  in `resolveSetNumber.ts`, a pure TS mirror of
  `ai_router.resolve_set.next_session_set_number`; new
  `listSessionSetDirNames` in `fileSystem.ts`), renders both templates
  by loading and `{{TOKEN}}`-substituting the on-disk files, and writes
  `spec.md` only into `docs/session-sets/NNN-<module>-plan/` and
  `docs/session-sets/NNN-<module>-decomposition/` — state files stay
  the blessed runtime writers' job. **Identity-based skip-existing:** a
  module that already has a scaffolded lifecycle set of a kind keeps it
  (matched by slug suffix, not merely path) and the writer reuses its
  slug for the sibling `prerequisites:` cross-link — a re-run never
  mints a duplicate. Fail-loud: an invalid module slug throws before
  any write; a parse-after-write guard re-parses each freshly-written
  file with the real parsers and confirms `kind` / `prerequisites`
  landed. Not wired to any UI yet — Sets 100/101 are the callers.
- **Suite green:** extension unit 1522 → 1534 (12 new tests); `tsc`,
  `eslint`, esbuild all clean; `ai_router` pytest 3030/6 skipped
  (unchanged baseline — no Python touched).

### Verification (phased loop, 2 rounds, $0.40 total)

- **Round 1 (discovery, K=2 fan-out):** ISSUES_FOUND, 2 blocking
  findings (each independently found by both fan-out calls):
  1. **Fixed:** the decomposition template's step 2 told the AI to
     hand-author `session-state.json` for each new child set, directly
     contradicting this same session's own "state files are the
     blessed runtime writers' job" posture — a real risk of invented or
     stale lifecycle state colliding with `start_session`/registration
     on every generated child set. Reworded the template to author only
     `spec.md` per child and explicitly forbid hand-authoring
     `session-state.json`, naming the `start_session` bootstrap
     contract instead; pinned with a new assertion.
  2. **Fixed:** the two render functions embedded template text as
     hand-synced TS literals — nothing read the checked-in `.template`
     files at all, so a future edit to either file would silently drift
     from generated output with no test to catch it. Both render
     functions now load and substitute the real on-disk files via a new
     `resolveModuleLifecycleTemplatesDir()` resolver (mirrors
     `consumerBootstrap.ts`'s bundle-directory precedent), with a new
     parity test proving render output is a token-substitution of the
     checked-in files.
- **Round 2 (remediation-review, fix delta):** **VERIFIED**, 0 blocking,
  both fix verdicts accepted.

## End state

`kind` is a real, documented, tolerantly-parsed spec-config field; the
two lifecycle templates and the scaffold writer exist, are tested
against their own checked-in source, and are ready for Set 100 to wire
into the Work Explorer's Add-module flow. No release out of this set —
the module-lifecycle-simplification bundle ships together after Set 101.
