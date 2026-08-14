# Verification conventions — Set 118, Session 1

Read this before the evidence. It states the baseline, the contract, and
the by-design exclusions, so a round is not spent re-deriving them.

## 1. What this session is

Set 118 Session 1 of 3, "Make the suite legible to itself". It is a
**measurement** session. It ships one new module, its tests, a findings
document and a JSON snapshot. It **retires nothing** — the first
retirement pass is Session 3, and only against what the operator attests
to in Session 2. A finding that this session should have deleted a test
is out of scope by construction.

## 2. Suite baseline

- **Targeted run (A1), the only runs that precede this round:** 178
  passed, 0 failed — `test_suite_inventory.py` (20) plus the five
  repo-scanning guards most exposed to a new production module
  (`test_drift_guard.py`, `test_production_imports.py`,
  `test_packaging_hygiene.py`, `test_no_legacy_field_reads.py`,
  `test_lightweight_resurrection_guard.py`) and `test_entry_points.py`.
- **No full suite has run, deliberately.** A2 forbids a full suite
  before any cross-provider stage. The run of record is Step 6, after
  this round.
- **No pre-existing failures are being carried or waived.**

## 3. Release contract

- Nothing is published. No version bump, no tag, no registry push.
- `ai_router/CHANGELOG.md` gets a fragment at close (the partitioned
  append-file convention), not an edit to the shared file.
- The VS Code extension is untouched.

## 4. By-design exclusions — please do not report these as defects

1. **The module is named `suite_inventory`, not `test_inventory`.** The
   spec says `ai_router/test_inventory.py`. `test_packaging_hygiene.py`
   refuses that name: every `test_*.py` under `ai_router/` must live in
   `ai_router/tests/`, which is what makes the wheel's
   `ai_router.tests*` exclude a proof that no test module ships. The
   guard caught it on the first targeted run. Renaming rather than
   widening the guard is journaled in `decisions.jsonl`
   (`goal-over-letter`), and the rename is stated in the module
   docstring and in `inventory-findings.md`.
2. **The guard heuristic is tuned for precision and misses guards.**
   That is the design, and it is published as the `guard.limits`
   predicate. A rule fed a noisy population is worse than one fed a
   small clean one, and Session 2's `guard` marker — not a better regex
   — is what closes the gap. Two named misses:
   `test_step_row_parity.py` and
   `test_print_session_set_status_completed_count.py`, both of which
   pin an invariant and are mechanically indistinguishable from
   ordinary behaviour tests.
3. **D1 and D2 are textual and match inside string literals.** That is
   intentional: they exist to reproduce the historical regexes behind
   the spec's figures, and a regex sees strings. Only D3/D4 — this
   tool's own answer — blank strings and comments first.
4. **No gate is added.** The set's fourth standing decision: everything
   it ships reports. `suite_inventory` has no non-zero exit on policy
   and is wired into no CI job.
5. **This session adds tests to a set about test accrual.** The spec
   caps it at 25 new test functions; 25 are spent -- exactly at cap after three verification rounds added five falsifiers.
6. **`inventory-snapshot.json` is excluded from the diff** (134 KB of
   generated machine artifact). It is a deliverable and it is committed
   — read it at
   `docs/session-sets/118-test-retirement-and-coupling-budget/inventory-snapshot.json`
   if the contract shape matters to a finding.

## 5. What is genuinely worth attacking

- **The counters.** Every figure in the spec's re-read table is claimed
  to reproduce exactly at `ab47a3e7`, and the spec's original table at
  `8fda8d85`. If any predicate in `PREDICATES` does not describe what
  the code actually does, that is the finding this session most
  deserves — the whole point is that a number nobody can re-derive is
  not evidence.
- **The coupling tiers.** The claim is that strong coupling is 167 test
  functions at the spec's own commit, not the 1,485 the spec asserts,
  and that the difference is over-counting rather than tree drift.
- **`_code_only`.** D3/D4 blank strings and comments via `tokenize`. If
  it can blank too much, or fail open in a way that silently exempts a
  file, the tier numbers are wrong.
- **The sole-cover map (A1).** It is derived from AST imports against a
  module index. If a spelling the suite actually uses is missed, a file
  that *is* the only cover for a module would not be flagged — and
  under A1 that flag is what stops Session 3 retiring it in a bulk
  pass. This is the highest-consequence correctness surface here.
- **Severity by consequence** (L-095-1): probability the stated failure
  reaches a real user times impact. Low probability *or* low impact is
  Minor; no nameable failure scenario is a nit.
