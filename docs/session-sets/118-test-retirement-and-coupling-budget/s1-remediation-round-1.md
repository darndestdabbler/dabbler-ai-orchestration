# Remediation — Session 1, rounds 1 and 2

Both rounds found Correctness Majors, both were **accepted without
dispute**, and both were the same class of defect: a static
approximation quietly reporting an *answer* where it only had a
*guess*. That is the exact failure this session exists to retire, found
in the session's own deliverable.

Fixes landed before any full suite ran, so the run of record at Step 6
covers the remediated tree.

---

## Round 1 (discovery, both lenses) — the A1 map dropped dynamic imports

**Finding (Major, Correctness).** `test_entry_points.py` imports every
`[project.scripts]` target through
`importlib.import_module(module_path)`, where `module_path` is read out
of `pyproject.toml` at runtime. `imported_production_modules` only
recorded `import_module()` calls with a **literal** argument, so that
file recorded `"imports": []` and `ai_router/report.py` was published
under `uncoveredModules` — in the delivered snapshot, and in
`inventory-findings.md` section 5.

**Why it is Major and not a nit.** The sole-cover map is the A1 surface
Session 3 retires against. A false *negative* there is the worst error
this tool can make: it tells a later session that a module has no cover,
or that some other file is its only cover, when neither is true. The
conventions block for the round named this surface as the
highest-consequence one in the change set; the verifier went straight
at it and was right.

**Fix.** Static analysis genuinely cannot resolve a module name read out
of a TOML file at runtime, so the map is completed from the
**declaration** instead of guessed:

- `_entry_point_modules()` parses `[project.scripts]` out of
  `pyproject.toml` (now carried on the corpus, for `--rev` as well as
  the working tree) and resolves each `module:attr` target through the
  same `ModuleIndex` every other import spelling uses.
- A file that makes a non-literal `import_module` call **and** reads
  `pyproject.toml` is credited with those targets.
- Every other unresolvable dynamic import is counted per file
  (`dynamicImportCalls`) and the file is listed under
  `soleCover.unresolvedDynamicImportFiles`. **A hole in the map is now
  visible rather than silent** — which is the durable half of the fix,
  since the next dynamic-import shape will not be an entry point.
- Published as the `imports.dynamic` predicate.

**Result.** `test_entry_points.py` now records `close_session.py`,
`reconciler.py`, `report.py` and `start_session.py`;
`uncoveredModules` drops 6 → 5 and no longer contains `report.py`;
`unresolvedDynamicImportFiles` is empty for the suite as it stands.

**Falsifier.** `test_a_dynamic_entry_point_import_is_credited_not_dropped`
plants a `pyproject.toml`, a file that resolves through it, **and** a
file whose dynamic import is genuinely opaque — asserting the first is
credited and the second is reported as a hole. Both directions, per
L-112-1.

---

## Round 2 (supplementary) — strong coupling was a co-occurrence check

**Finding (Major, Correctness).** `D4-enumerates-real-tree` was
`derives-from-__file__ AND an-enumeration-token-somewhere-in-the-file`.
`test_session_state_backfill.py` builds a *script* path from `__file__`
and, in a different function, calls `.iterdir()` on a `tmp_path`. Two
tokens in one file, no contact with the real tree — and the snapshot
marked it `strong`. The set's whole coupling scope decision reads off
that number.

**Why it is Major.** This is the *same* over-counting mechanism the Set
118 measurement correction was filed about, reproduced by the tool
built to retire it. It also cannot be waived as conservative: the
strong tier is the number Session 2's scope decision consumes.

**Fix.** `D4` now asks a **dataflow** question — does the *enumerated*
path derive from `__file__`? — resolved over the AST:

- `_repo_derived_bindings()` follows assignments to a bounded fixpoint
  (`ROOT = Path(__file__).parents[2]`, then `DOCS = ROOT / "docs"`), and
  taints callers of a helper that returns such a path (`_repo_root()`).
- `_enumerates_derived_path()` counts an enumeration whose **receiver**
  is derived (`ROOT.rglob(...)`), an `os.walk(ROOT)`-style call whose
  first **argument** is derived, and a derived path handed to a call
  **whose result is iterated**
  (`list(guard.iter_scanned_files(_repo_root()))`).

**The grep reading was wrong in BOTH directions, which is why it is kept
rather than replaced.** `D3a-enumerates-anywhere` still reproduces the
measurement correction's own figure exactly (5 / 66 at `8fda8d85`, 7 /
167 at `ab47a3e7`), so the over-count stays visible. But `D4` is
*larger* than `D3a` at the same commit (11 / 240 vs 7 / 167), because
the repository-is-the-system-under-test guards never write a
`glob`/`iterdir` token at all — they hand the real root to a production
scanner and walk the result. A grep cannot see them.

`D4` is deliberately narrow: a derived path passed to a call whose
result is merely asserted on does **not** count, because that is not
evidence anything was enumerated. So `D4` is a floor, and the direction
of its error is stated in its published predicate rather than left for
the next reader to discover.

**Result.** `test_session_state_backfill.py` and
`test_close_preflight.py` leave the strong tier; the thirteen files that
remain are the repo-scanning population (`test_drift_guard.py`,
`test_packaging_hygiene.py`, `test_production_imports.py`,
`test_step_status_vocabulary.py`, ...). Strong coupling at the spec's
own commit is **240 test functions, not 167 and not 1,485**.

**Falsifiers.** `test_enumerating_a_tmp_path_is_not_strong_coupling`
plants the exact defect and asserts D3a fires while D4 does not.
`test_a_repo_root_handed_to_a_scanner_and_iterated_is_strong` plants the
opposite shape — no enumeration token, real coupling — and also asserts
the narrow boundary (a merely-asserted result is not strong).

---

## What did not change

- **Every volume figure still reproduces exactly** at both historical
  commits: 124 / 3,345 / 60,188 / 62,103 / 0.97 at `8fda8d85`, and 133 /
  3,513 / 67,182 / 67,634 / 0.99 / 142 at `ab47a3e7`. `D1` (43 / 1,294
  and 48 / 1,452) and `D2` (48 / 1,497 and 55 / 1,711) are byte-identical
  to Set 128 S3's figures, because both remain textual by design.
- Both corrected detectors are now **pinned** in
  `test_the_spec_re_read_figures_are_reproducible_by_command` alongside
  D1 and D2, so neither can drift silently.
- Test count: 20 → 23 functions, still inside the spec's irony budget of
  25.
