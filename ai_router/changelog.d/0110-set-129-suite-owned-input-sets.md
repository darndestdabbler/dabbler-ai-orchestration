## [Unreleased] — the suite declares its inputs (Set 129)

### Added

- **(Set 129 S1) `affected_suites(files_changed, suites)` — which suites a
  change set affects, and *which inputs* made each one affected.** Returns
  `SuiteMatch` records carrying `changed_inputs` and `matched_prefixes`,
  because "which suites does this session owe" must be **auditable**
  rather than a bare boolean: a session told only *that* it owes a
  14-minute suite cannot check the claim, and a wrong declaration is
  invisible from a yes/no answer. `evaluate_freshness()` consumes it
  instead of re-deriving the intersection per suite, so the report and
  the close gate cannot disagree (L-069-1). Exposed as
  `python -m ai_router.run_of_record affected --session-set-dir <dir>`,
  which defaults to the disposition's `files_changed`.

  There is deliberately **no module axis** — the answer A5 resolves to
  (`docs/proposals/2026-08-12-multi-module-retesting/verdict.md` §3–§4)
  is that the suite declares its inputs, the intersection decides the
  obligation, and modules are grouping and ownership metadata. A module
  label could only ever *subtract* from this intersection, and nothing
  checks that a module's declared `codeRoots` match its real imports, so
  routing test selection through one would fail open (L-125-1).

- **(Set 129 S1) `load_suites_checked()` → `SuiteLoadResult`, and
  `SUITE_FIELDS` as an allowlist.** `load_suites()` is now its
  error-discarding projection. Every unusable entry, every unusable
  value and every unrecognised **key** is carried rather than dropped;
  the key check is an allowlist because a denylist could never contain
  the next typo.

### Changed

- **(Set 129 S1) `covers` is a suite's INPUT SET, not the paths it is
  about.** The complete allowlist of repo-relative prefixes that can
  affect the suite's **result**: product source, test source, fixtures,
  contracts, mocks, shared libraries, **lockfiles, build and test
  configuration, and checked-in toolchain configuration**. Under the old
  reading a lockfile or a CI config outside `covers` was merely out of
  scope; under this one it is a **declaration bug**, because a dependency
  bump or an unpinned GitHub action can turn a suite red without touching
  a line the declaration names.

  All three of this repo's suites were re-derived against the stronger
  definition **empirically** rather than editorially — a full pytest run
  under a `sys.addaudithook` tracer recorded 1,655 distinct repo paths
  the suite actually opens or enumerates, and every addition is one that
  evidence named. pytest gained `pytest.ini`, `pyproject.toml`,
  `.github/`, `test-fixtures/`, `scripts/`, `tests/`, `docs/templates/`,
  `tools/dabbler-ai-orchestration/dist/templates/`,
  `tools/dabbler-ai-orchestration/changelog.d/` and
  `docs/session-sets/`; mocha and playwright gained their lockfile,
  `tsconfig.json`, `esbuild.js`, `playwright.config.ts` — and both gained
  `ai_router/`, because Layer 2 shells out to the real router CLIs and
  Layer 3 `pip install -e`s this tree rather than exercising the
  published package. `MANIFEST.in` looked like an input and the trace
  never touched it, so it stays out; `docs/planning/` is deliberately
  undeclared and the module docstring says why.

  What this does **not** license is the inverse claim. Unchanged declared
  inputs are *evidence that a rerun is likely redundant within a
  qualified execution environment; they do not prove identical outcomes
  for non-hermetic or flaky suites.* Skipping a suite remains a
  verification reduction and keeps needing the operator attestation every
  verification reduction needs.

- **(Set 129 S1) `surface_digest()` excludes the ACTIVE set's own
  close-out bookkeeping** (`is_active_set_bookkeeping`, reusing
  `verification_stamp.WORK_DIFF_SET_BOOKKEEPING` rather than re-listing
  it). This is what makes `docs/session-sets/` declarable at all: without
  it, `record_run` digests the covered surfaces and *then* appends
  `test-runs.jsonl` into the set directory, so the suite stales its own
  run at the instant it records it. Another set's artifacts are ordinary
  changed files and bind normally.

- **(Set 129 S2) A5 is written into the authoring guide beside A1–A4,
  with the refusals and the trigger-gated deferrals.** The test-run
  policy section is now *A1–A5*. Eight rejections with their reasons and
  six deferrals with their **trigger conditions** land where a future
  author will meet them rather than only in a proposal folder — a
  rejection nobody wrote down gets re-proposed by the next reader of a
  persuasive document.
  `docs/planning/session-step-skeleton-and-verification-cost.md` is now
  fully closed: A5 was its last open item.

### Fixed

- **(Set 129 S1) A typo in `testing.suites` disarmed the close gate for
  every expensive suite in the repo.** `load_suites()` dropped malformed
  entries in silence, so a `suites:` key yielding zero usable entries
  returned an empty tuple and `check_test_run_fresh()` read it as *"no
  expensive suites declared"* and **passed**. Nothing said so. The gate
  now blocks on any suite-configuration error. Tolerance is right for a
  *reader* and wrong for the input to a *gate*: if the information a skip
  needs is missing or unverifiable, do not skip. An explicit
  `suites: []` is untouched — that is the deliberate operator disarm, a
  declaration rather than a typo.

- **(Set 129 S1) Four coupled fail-open path-matching bugs**, surfaced by
  unifying four copies of prefix matching into `matching_prefixes()`.
  `session_touched` normalised with `lstrip('./')` — a **character-set**
  strip — which ate the leading dot of every dotfile, so a `.github/` or
  `.gitignore` declaration matched nothing while reading as correct.
  Prefixes were normalised on only one side of the comparison, so the
  ordinary `covers: ["./src/"]` spelling matched nothing. A repo-root
  `covers: ["./"]` normalised to empty and matched nothing, disarming a
  whole-repo suite for every change. And an unrecognised key such as
  `expensvie: true` silently kept `expensive`'s default, loading the
  suite as cheap. Each one reads as correct code and fails open.
