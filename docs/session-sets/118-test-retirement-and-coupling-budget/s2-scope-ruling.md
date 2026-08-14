# Scope ruling — Set 118 stops here

> **Session 2, step 2 — the set's scheduled operator stop.**
> **Ruled:** 2026-08-14 by the operator, under `value-trade-off`
> (journaled, `decisions.jsonl`).
> **Outcome:** Set 118 is **cancelled**, not completed. Sessions 2 and 3
> are not run. Session 1's `ai_router/suite_inventory.py` — VERIFIED and
> merged — is the set's durable deliverable and stays shipped.
> **Reversible:** `session_lifecycle.restore_session_set` returns the
> set, its spec and its mid-flight Session 2 exactly as they are.

---

## 1. What the stop was for, and what it turned into

The spec scheduled one operator stop here, for one purpose: retiring a
test is a **verification reduction**, `decision_journal` refuses it under
AI authority, so the retirement rule needed a human attestation before
any retirement could be implemented.

Two more questions arrived at the same stop:

- **Session 1's handoff.** The measurement correction filed against this
  set recommended *"re-scope or retire the coupling half"* if
  re-derivation confirmed its numbers. Session 1's tool confirmed them
  and, correctly, did not act — a scope decision is not an
  orchestrator's to take (journaled, `defer-to-existing-gate`).
- **The operator's own framing.** *"I wanted to streamline the tests."*

The third question turned out to govern the other two, and measurement
answered it.

## 2. The measurement that decided it

**Removed functionality already takes its tests with it, in the same
commit.** This is the finding that reframed the set. It was not
assumed — it was read out of git:

```
Set 112 S1  2026-08-09   5 production modules + 9 test files deleted together
Set 119 S3  2026-08-11   4 production modules + 4 test files deleted together
```

`git log --diff-filter=D -- "ai_router/*.py"`

And it cannot silently stop being true: a test importing a deleted
module does not fail, it **fails to collect**, so the suite goes red at
once. The suite is green at 4,374 collected. Checked directly: the
residual references to the seven modules deleted above are a handful of
mentions inside guard lists and comments, not tests.

**So there is no orphaned test mass in this repo.** The premise that
motivated a retirement campaign — tests outliving the thing they test —
is already handled by ordinary practice.

**What is genuinely un-retired is the guards, and they are small.**

| | |
| :--- | ---: |
| guard test functions (all four heuristic-detected files) | **122** |
| share of the 4,374 collected | **2.8%** |
| implied wall clock, at Set 112's measured deletion-to-runtime rate | **~0.2%** |

That is the **ceiling** on everything retirement could ever buy in this
repo — deleting every guard, protections and all.

**Strong coupling is 222 test functions at the spec's own commit**, not
the 1,485 the spec was written for (Session 1,
[`inventory-findings.md`](inventory-findings.md) §3), and most of those
must read the real tree because the repository *is* their system under
test.

**Test count and test cost are nearly unrelated here, and this was
already settled.** Set 112 measured it: −233 tests (−6.1% of count)
bought 3.64s against a 957s suite — **0.4%**. Parallelism already
collected the 3.61x that was available; the slowest ~25 tests are about
a quarter of serial runtime and the rest average 0.16s. A set aimed at
*streamlining* by count is aimed at the wrong quantity.

## 3. The candidates, and why none of them was retirable anyway

Seven files: the four `suite_inventory` detects by heuristic, plus the
two the spec names that no mechanical signal can see, plus one the
heuristic missed that is older than any of them.

| file | tests | pins set | age | sole cover | read |
| :--- | ---: | ---: | ---: | :--- | :--- |
| `test_lightweight_resurrection_guard.py` | 44 | 112 | 18 | YES → `scripts/lightweight_resurrection_guard.py` | genuine absence guard; also the only cover of a live script |
| `test_no_legacy_field_reads.py` | 2 | 030 | **100** | — | genuine permanence guard (D13 lint); **heuristic missed it entirely** |
| `test_production_imports.py` | 10 | 048 | 82 | — | genuine permanence guard; still load-bearing |
| `test_drift_guard.py` | 49 | 058 | 72 | YES → `scripts/drift_guard.py` | **not a guard** — the test suite of a live CI gate, flagged on its filename |
| `test_set111_close_gates.py` | 19 | 111 | 19 | — | **not a guard** — tests two live `gate_checks` functions, flagged on its filename |
| `test_step_row_parity.py` | 9 | 114 | — | — | live cross-language parity gate |
| `test_print_session_set_status_completed_count.py` | 4 | 023 | — | — | regression pin on live behaviour |

**Every one either covers a feature that still ships or hedges a defect
class that can still recur.** Two are not guards at all. The retirement
pass Session 3 was scheduled to run would have retired **nothing** on
this evidence — which the spec explicitly permits (*"nothing" is a
complete and acceptable answer*), and which is the honest reading of the
set's own anti-pattern list: *deleting to hit a number*.

`test_no_legacy_field_reads.py` is worth naming separately. It is the
oldest guard in the repo — 100 sets — it is 2 test functions, and the
heuristic does not see it. It is simultaneously the best argument for
the marker convention and an illustration of how little is at stake:
the whole thing costs two tests.

## 4. What was NOT built, stated plainly

- **The `guard` pytest marker convention** (step 3) — a marker in
  `pytest.ini` carrying what a guard protects, the set that removed it,
  and a review-after horizon in sets.
- **The expiry report** (step 4) — guards past their horizon surfaced
  with a recommendation, report-only.
- **The retirement pass and the Step 8 retirement question** (Session 3).

The operator's reason: a marker, a horizon and a periodic review report
are administrative overhead whose benefit is not guaranteed, against a
population whose entire ceiling is 2.8% of the test count.

**The spec's scheduled verification-reduction attestation was therefore
never reached and is deliberately left unmade.** No test is deleted by
this ruling and no verification is reduced by it — the ruling *removes*
a planned retirement rather than authorising one. A future set that
wants to retire a test must obtain that attestation fresh; nothing here
pre-authorises anything.

## 5. What survives, and how to reopen the question

`ai_router/suite_inventory.py` is the set's product and it answers the
retirement question **on demand**, which is most of what the standing
mechanism would have bought:

```
python -m ai_router.suite_inventory --guards     # guards, age in sets, sole cover
python -m ai_router.suite_inventory              # volume, coupling tiers, sole cover (A1)
python -m ai_router.suite_inventory --rev <sha>  # any historical commit, reproducibly
python -m ai_router.suite_inventory --json out.json
```

Every figure it prints names the predicate behind it first. The A1
sole-cover map — which production modules are covered by exactly one
test file — is a permanent capability regardless of this ruling, and it
is the thing that stops any future retirement from silently making every
later session's targeted run cheaper.

**Reopen this set** (`restore_session_set`) only if guard accrual becomes
material. Check with the command above: today it is 4 files and 122 test
functions, growing by roughly one guard file every twenty sets. The
instrument exists, so the question can be re-asked at any time for the
cost of running it — which is the argument that made stopping cheap.

**A separate set, not this one, owns suite runtime.** If the goal is a
faster suite, the lever is the slowest ~25 tests and the Layer 3 worker
policy (Set 117), not the test count. Set 116 and Set 112 both measured
that, and this set's spec records it as a decision not to reopen.
