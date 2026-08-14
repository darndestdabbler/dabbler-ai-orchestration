# Inventory findings — Set 118 Session 1

> **Deliverable of Session 1, step 4.** The spec asked that its own
> figures "fall out of `suite_inventory`", and named a discrepancy to
> chase rather than a match to hope for. Both are settled below.
>
> **Tool:** `ai_router/suite_inventory.py`
> **Contract:** `inventory-snapshot.json` (this directory), contract v1
> **Written:** 2026-08-13, against `ab47a3e7` (the spec's re-read commit),
> `8fda8d85` (the spec's original commit) and the working tree.
>
> **Read every `test_inventory` in the spec as `suite_inventory`.** The
> spec names the module `ai_router/test_inventory.py`. A shipped
> invariant refuses that name — `test_packaging_hygiene.py` asserts
> every `test_*.py` under `ai_router/` lives in `ai_router/tests/`,
> which is what turns the wheel's `ai_router.tests*` exclude into a
> *proof* that no test module ships, and what keeps one import name
> from meaning two things. The guard caught it on the first targeted
> run. The spec's goal is a queryable inventory, not a spelling, so the
> module was renamed rather than the guard widened (journaled,
> `goal-over-letter`).

---

## 1. How to re-derive anything on this page

```
python -m ai_router.suite_inventory                       # today, human report
python -m ai_router.suite_inventory --rev ab47a3e7        # the spec's re-read
python -m ai_router.suite_inventory --rev 8fda8d85        # the spec's original
python -m ai_router.suite_inventory --json out.json       # the machine contract
python -m ai_router.suite_inventory --guards              # the guard section
```

That is the whole point of the session. Every number the 118 spec
carries came from a one-off shell command nobody wrote down, and the
cost of that showed up immediately: its coupling figure could not be
reproduced under its own prose. The report prints the **predicate**
behind every figure before it prints the figure, and the JSON carries
the same text under `predicates`.

`--rev` reads the corpus out of git in one `git cat-file --batch` pass.
Without it this step could not be performed at all — the figures under
audit are at `ab47a3e7`, not at HEAD.

---

## 2. The spec's numbers, reproduced

**Every figure in the spec's re-read table falls out of the tool
exactly.** Not approximately, and not after adjusting a definition.

| metric | spec's re-read (`ab47a3e7`) | `suite_inventory --rev ab47a3e7` | |
| :--- | ---: | ---: | :--- |
| test files | 133 | **133** | exact |
| test functions | 3,513 | **3,513** | exact |
| test LOC | 67,182 | **67,182** | exact |
| production LOC | 67,634 | **67,634** | exact |
| test / production ratio | 0.99 | **0.99** | exact |
| `parametrize` decorators | 142 | **142** | exact |
| coupling, prose detector | 48 / 1,452 | **48 / 1,452** | exact |
| coupling, bare-`__file__` | 55 / 1,711 | **55 / 1,711** | exact |

The counters were validated the same way Set 128 S3 validated its own —
against the *earlier* commit first, so the series is comparable rather
than merely adjacent:

| metric | spec's original (`8fda8d85`) | `--rev 8fda8d85` |
| :--- | ---: | ---: |
| test files / functions / LOC | 124 / 3,345 / 60,188 | **124 / 3,345 / 60,188** |
| production LOC, ratio | 62,103, 0.97 | **62,103, 0.97** |
| coupling, two readings | 43 / 1,294 and 48 / 1,497 | **43 / 1,294 and 48 / 1,497** |

**The predicates that produce them, written down for the first time:**

- **test file** — a `*.py` under `ai_router/tests/` (recursively) whose
  **basename starts with `test_`**. This is the clause that was doing
  invisible work: counting every `*.py` under that directory gives
  **131** files at `8fda8d85`, not 124. The seven excluded files are
  `conftest.py`, `e2e/conftest.py`, `e2e/fixtures.py`,
  `e2e/harness_cli.py`, `model_inventory_fixtures.py`,
  `pricing_page_fixtures.py` and `stamp_fixtures.py` — helpers carrying
  no test functions of their own.
- **test function** — a line matching `^[ \t]*(async )?def test_`. The
  tool also counts them structurally from the AST and reports both;
  they agree exactly (3,513 = 3,513) at every commit measured, so
  nothing is hiding in a docstring.
- **test LOC / production LOC** — physical lines, blanks and comments
  **included**.
- **production module** — a `*.py` under `ai_router/` that is not under
  `ai_router/tests/`, `ai_router/scripts/` included.

> **This also settles the spec's "two different line counters" note.**
> The ratio table's 52,868 and the headline 60,188 are the same commit
> under a blank/comment-**excluding** and a blank/comment-**including**
> counter. This tool implements the second. The spec's warning stands:
> only the ratio is comparable across the two tables.

---

## 3. The coupling discrepancy, settled

**The spec's 47 files / 1,485 tests is superseded.** It was never
reproducible because the detector behind it was never written down, and
the sentence describing it has at least three defensible readings that
disagree by ~250 test functions:

| reading of the spec's one sentence | `8fda8d85` |
| :--- | ---: |
| `Path(__file__)` \| `parents[N]` \| repo-root constant **as substrings** | 43 files / 1,294 |
| ...the same, with `repo_root` **word-anchored** | 42 files / 1,251 |
| bare `__file__` \| `parents[N]` \| repo-root constant | 48 files / 1,497 |
| **the spec's stated figure** | *47 files / 1,485* |

The stated figure sits *between* readings. The word-boundary variant is
the one that surprises: anchoring `repo_root` on `\b` excludes helpers
named `_repo_root()` and silently drops a whole 43-test file. One
underscore, 43 tests.

The tool ships all of these as **named** detectors (`D1-spec-prose`,
`D2-bare-file`) so the spec's history stays checkable, and then gives
its own answer as a **tier**, because the flat count was measuring the
wrong thing:

| tier | `8fda8d85` | `ab47a3e7` | today | what it means |
| :--- | ---: | ---: | ---: | :--- |
| **strong** — a `__file__`-derived path is actually enumerated | **7 / 176** | **9 / 222** | 11 / 311 | breaks on a rename or a doc move |
| **weak** — derives a path from `__file__`, never enumerates it | 22 / 690 | 27 / 813 | 28 / 822 | locates the package or builds a fixture path; breaks on a depth change |
| **names-only** — matched only in text, never in code | 19 / 631 | 19 / 676 | 21 / 735 | **not coupling** |
| sandboxed | 76 / 1,848 | 78 / 1,802 | 78 / 1,809 | — |

**The measurement correction filed against this spec is confirmed.** The
change-amplification tax the set was scoped to attack is paid by **222
test functions at the spec's own commit, not 1,485**. Both of the
over-counting mechanisms it named are real and are now excluded by
construction:

- `repo_root` as an ordinary parameter name (`run(repo_root=str(tmp_path))`)
  is the **opposite** of touching the real tree, and is tiered
  `names-only`.
- a `docs/...` string literal used as test data is not a path that is
  opened — so `D3` reads the **AST**, where a string is a constant and
  not a name. That correction was not theoretical. This session's own
  test file plants `.rglob(` in a string to prove D4 fires, and the tool
  tiered it `strong` until the fix — the tool reproducing, on itself,
  the exact over-count it was built to retire. D1 and D2 stay textual on
  purpose: they exist to reproduce historical regexes, and a regex sees
  strings.

### 3a. Strong coupling is a dataflow question, not a co-occurrence one

The correction's own detector — *derives from `__file__`* **and**
*calls `glob`/`iterdir`/`rglob` somewhere in the same file* — is a
**file-level co-occurrence check**, and this tool reproduces it exactly
as `D3a-enumerates-anywhere` (5 / 66 at `8fda8d85`, 7 / 167 at
`ab47a3e7`). Cross-provider verification found that it is wrong in
**both** directions, and the tool now answers with `D4`, which asks
whether the *enumerated path* derives from `__file__`:

- **It over-counts.** `test_session_state_backfill.py` builds a script
  path from `__file__` and, elsewhere and unrelatedly, calls
  `.iterdir()` on a `tmp_path`. Two tokens in one file, no contact with
  the real tree. `test_close_preflight.py` is the same shape.
- **It under-counts, and by more.** The repository-is-the-system-under-test
  guards do not enumerate the tree themselves — they hand the real root
  to a production scanner and walk what comes back
  (`list(guard.iter_scanned_files(_repo_root()))`). There is no
  `glob`/`iterdir` token to grep, so the correction's detector cannot
  see them at all. That is why `D4` (9 files) is *larger* than `D3a`
  (7 files) at the same commit, not smaller.

`D4` resolves this over the AST: assignments are followed to a bounded
fixpoint, a helper returning a `__file__`-derived path taints its
callers, and a path handed to a call **whose result is iterated**
counts. Deliberately narrow — a result that is merely asserted on is not
evidence that anything was enumerated, and `os.path` plumbing
(`join`/`dirname`/`abspath`) *constructs* a path rather than walking
one. So `D4` is a floor, and the direction of its error is named rather
than hidden.

> **Both narrowing clauses were bought with a verification round each.**
> The first cut of `D4` treated any argument-passing as a reach into the
> tree, which made it identical to `D3` (39 files — every file that
> derives a path at all). Narrowing to iterated results fixed that and
> introduced the next error: `join` was in the iterated-consumer set for
> `"\n".join(...)`, so `os.path.join(os.path.dirname(...), ...)` — how
> half the suite builds a fixture path — read as an enumeration. Three
> readings, three answers, again. The lesson the spec draws about the
> *coupling figure* applies to its replacement: a detector is only as
> good as the falsifiers planted against it, and each of these was
> found by a verifier planting a real file shape, never by reading the
> predicate.

---

## 4. Guards

**4 guard files carrying 122 test functions**, today, all by heuristic
and none yet by marker (Session 2 ships the marker; the tool's reader
for it is already in place and takes precedence wherever it appears).

| file | tests | pins set | age in sets | sole cover |
| :--- | ---: | ---: | ---: | :--- |
| `test_production_imports.py` | 10 | 48 | **81** | — |
| `test_drift_guard.py` | 49 | 58 | **71** | YES |
| `test_set111_close_gates.py` | 19 | 111 | 18 | — |
| `test_lightweight_resurrection_guard.py` | 44 | 112 | 17 | YES |

Age is `latest set on disk (129) − the set the guard names`. That column
is the input Session 2's rule consumes.

**Two things this classification is not, stated so Session 2 does not
over-trust it.**

**(a) It is tuned for precision and misses guards.** The first cut fired
on any single signal and called **53 of 124 files (1,838 test
functions)** guards — a population useless to a retirement rule. The
majority clause (guard-shaped functions must be at least two *and* at
least half the file) brought it to 5. A second pass then found a real
false-positive class: bare **"resurrection" is not a permanence signal
in this repo**, because the verification loop uses it for a settled
finding that reappears. It had flagged `test_blocking_classifier.py`
and `test_post_round_delta.py`, neither of which guards an absence.
Only `anti-resurrection` survives.

**(b) It cannot see an invariant pin — and nothing mechanical can.**
The spec names four guards. The tool finds the two that *declare*
themselves (a `guard` filename, a `set111` filename). It does **not**
find `test_step_row_parity.py` or
`test_print_session_set_status_completed_count.py`, because a file that
pins one rendering invariant or one number is indistinguishable by
name, docstring or shape from an ordinary behaviour test — it *is* one,
until you know why it was written.

> **That gap is the argument for Session 2's marker, not a defect in
> the heuristic.** A guard's purpose is authorial intent; it can be
> declared, never inferred. The heuristic exists to seed the markers and
> should stop being load-bearing as they land — which the report makes
> visible by counting `by marker` against `by heuristic`.
>
> `test_step_row_parity.py` is also the file the spec's re-read caught
> **growing** from 4 tests to 9 while the spec sat unstarted. It is 9
> today. Accrual is landing on exactly the file the tool cannot classify.

---

## 5. Sole cover (A1) — what Session 3 must not do quietly

`suite_inventory` flags, per test file, whether it is the **only** test
file importing a production module. At the working tree:

- **30 production modules are covered by exactly one test file.**
- **2 files are both a guard and a sole cover** — `test_drift_guard.py`
  (→ `scripts/drift_guard.py`) and
  `test_lightweight_resurrection_guard.py`
  (→ `scripts/lightweight_resurrection_guard.py`). Per A1 these are
  **never** eligible for a bulk retirement pass; they go to the
  operator by name, with the module named.
- **5 production modules have no test file importing them at all**:
  `close_out.py`, `notifications.py`, `prompting.py`,
  `scripts/backfill_session_state.py`, `validate_guidance_meta.py`.

> **`report.py` was on that list until cross-provider verification took
> it off, and the reason generalises.** `test_entry_points.py` imports
> every `[project.scripts]` target through
> `importlib.import_module(module_path)`, where `module_path` is read
> out of `pyproject.toml` at runtime. No static analysis can resolve
> that — and the tool's first cut read it as *imports nothing*, so four
> console-script modules looked untested and `report.py` was reported
> **uncovered when it is not**. A false negative on the A1 map is the
> highest-consequence error this tool can make: it is the surface
> Session 3 retires against.
>
> The fix completes the map from the **declaration** rather than
> guessing: where a file makes a non-literal `import_module` call *and*
> reads `pyproject.toml`, the declared console-script targets are
> credited to it. Any other unresolvable dynamic import is counted per
> file and the file is listed under
> `soleCover.unresolvedDynamicImportFiles`, so a hole in the map is
> **visible rather than silent**. There are none in the suite today.

That last bullet is a finding in the *opposite* direction from this
set's premise and is recorded rather than acted on: this set retires
tests, it does not add them.

**A3 is untouched by any of this.** `covers` is a path-prefix list and
nothing here edits one. No retirement identified so far would vacate a
declared `covers` prefix; if one ever would, that is a finding to
report, not an edit to make. How "the required portion" resolves *per
module* is A5 and belongs to Set 129, which has since closed it.

---

## 6. What Sessions 2 and 3 inherit

1. **The volume premise stands and still bounds the set.** Growth has
   not saturated (3,345 → 3,513 → 3,672 across the three commits
   measured), and the ratio has not moved (0.97 / 0.99 / 0.96). The
   suite is not outrunning the system, so nothing here licenses
   deleting to hit a number.
2. **The guard-accrual premise stands, and is now queryable.** Four
   files, 122 test functions, oldest pinning a decision **81 sets** ago,
   none ever reviewed. Zero markers exist, which is Session 2's work.
3. **The coupling premise is materially weakened, and this is now
   measured rather than asserted.** 222 test functions at the spec's own
   commit, against a spec written for 1,485. The measurement
   correction's recommended disposition — *re-scope or retire the
   coupling half of the set* — is now supported by the tool it asked
   for. **That is a scope decision and is put to the operator**; it is
   not taken here, and Session 2 should not rule on a retirement policy
   until it is answered.
