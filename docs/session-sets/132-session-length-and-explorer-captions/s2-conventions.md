# Conventions for this round (read before reporting findings)

## What this session is

Set 132 Session 2 of 3, "Fix the instrument before trusting it".

`ai_router/spec_admission.py` is the authoring-time admission test for session
specs: it counts each session's declared steps and refuses a spec whose session
exceeds `DEFAULT_MAX_STEPS = 7` (4 baked-in ceremony steps + the operator's
ratified `WORK_STEP_BUDGET = 3`). Set 131 found it wrong in two independent
ways, and this session fixes both, then re-runs on the corrected instrument the
measurement that Set 131 built on the broken one.

- **D1** — nested ordered lists were hoisted to top level, so a compliant spec
  was reported `OVER CAP`.
- **D2** — ceremony was classified by *mention*, so a work step that merely
  referenced verification / registration / close-out was charged as ceremony
  and `N` was deflated.
- **Third**, the spec asked this session to decide deliberately whether
  `--spec` should exit non-zero (it printed `OVER CAP` and exited 0).

Session 1 was a VS Code extension change and Session 3 is a causality study.
**Nothing under `tools/dabbler-ai-orchestration/` is touched by this session**,
by design.

## The one thing most likely to be mis-reviewed

**This change makes an admission gate MORE permissive**, and the spec armed
`pathAwareCritique: advisory` for exactly that reason. Please attack it on
those terms. The specific claim to test is that the parser now counts *fewer*
steps only where the extra steps were never steps.

The evidence offered: both instruments were run over **identical rows** (the
pre-fix module is imported verbatim via `git show HEAD:ai_router/spec_admission.py`).
Across all 374 sessions in the repo the total step count falls 2030 → 2005, and
only **five** sessions change:

| session | old | new | why |
| :--- | ---: | ---: | :--- |
| 131 S1 | 11 | 6 | five precedence rules nested at indent 3 under step 2 |
| 107 S1 | 16 | 9 | a seven-item nested contract under step 3 |
| 022 S1 | 9 | 6 | a nested read-order list under step 2 |
| 022 S2 | 10 | 6 | same shape |
| 002 S4 | 6 | 0 | no step list at all — six *test scenarios* under a `- Test scenarios:` bullet |

Each was checked by hand against the raw markdown. 002 S4 going to **0** is the
correct answer, not a regression: that session (a pre-skeleton 2026 spec)
declares deliverables and acceptance criteria, never a numbered step list, and
the old parser was counting its nested test scenarios as its steps. Its set is
complete, so the resulting shape finding is an informational note, not a block.

Sessions over the cap of 7 go 51 → 48 corpus-wide (50 → **47** once the
one declared `sessionSizeException` is honoured, which is the number the
gate actually refuses).

> **Corrected after round 1.** This file originally said "the gate still
> refuses 48", and the code and changelog said "50". Round 1's second nit
> caught the inconsistency; a precise recount gives 51 → 48 raw and 50 →
> 47 without an exception, across 32 → 31 specs. Every shipping surface
> now says 47/31.

## Why `intents_named` was not narrowed

D2 says "fix the classifier". `intents_named` was left **unchanged** and a new
`classify_steps()` added beside it. That is deliberate, and it is the decision
most worth attacking:

- `intents_named` reports what a step **mentions**. That is exactly the right
  test at a fixed skeleton position, which is the only way `check_step_shape`
  uses it ("does the step in the close-out slot say close-out?").
- Narrowing it would have broken the shape check while fixing the count.
- Ceremony is a **role**: the first slot and the last three, confirmed by the
  step naming the stage it stands for. Everything else is work.

Requiring the naming as well as the position is load-bearing for the
pre-skeleton corpus: a session that compressed its whole tail into one step
(Set 127 S2 wrote "Full pytest and the Layer 3 run recorded as runs of record;
verify; close.") is charged for one ceremony step, not four. There is a
falsifier for that case.

## The exit-code decision

`--spec` now exits non-zero on a failed admission; `--all` stays a census and
still needs `--check`. Journaled in this set's `decisions.jsonl`
(`goal-over-letter`, `verification_effect: strengthens`), with the asymmetry's
reason stated: `--all` over this corpus would exit non-zero on every run (47
legacy over-cap sessions without a declared exception), which is a gate that
always fires.

The existing test `test_without_check_a_violation_still_exits_zero` asserted the
opposite contract. It was **rewritten, not deleted**, and a companion test for
the `--all` census was added beside it. If you think the asymmetry is wrong,
that is a fair finding — but please engage the "always fires" argument.

## Suite baseline

- `python -m pytest ai_router/tests/test_spec_admission.py
  test_spec_admission_shape.py test_spec_admission_step_counting.py
  test_plan_seeding.py test_session_checklist.py test_step_row_parity.py
  test_step_status_drift.py` → **305 passed, 0 failed**.
- `python -m ai_router.changelog check` → **round trip OK** (router and
  extension).
- The full pytest suite is the **required portion** here and runs at step 6,
  after this verification round, per the A2 ordering rule (no full suite before
  a cross-provider stage). Its result is not yet in evidence; if you need it to
  judge a finding, say so and it will be supplied rather than guessed at.
- No test was deleted, weakened, skipped or marked pending.

## Falsifiers, and the proof they fire

L-112-1: a gate that only ever passes proves nothing. The new module
`ai_router/tests/test_spec_admission_step_counting.py` ships 28 tests, each rule
with a plant on both sides. They were then proven to fire by **planting the
defect back into the module** and re-running — nine plants, all nine caught,
module restored byte-identical:

| plant | caught by |
| :--- | :--- |
| hoist nested lists (the shipped defect) | 7 failures |
| count nothing as a step | 11 failures |
| drop the indented-code-block guard | 1 failure |
| admit the paren marker `1)` | 1 failure |
| classify by mention (the shipped defect) | 6 failures |
| classify by position alone, no naming | 2 failures |
| classify everything as work | 7 failures |
| revert `--spec` to reporting-only | 2 failures |
| make `--all` enforce by default too | 1 failure |

The fourth plant is worth naming because the **first attempt at it went
uncaught** and the harness said so: changing only the regex left a second guard
(`marker.endswith(".")`) still refusing the paren form, so the plant had not
actually planted the defect. The plant was corrected to change both, and the
test fixture was rewritten to use the real Set 023 line (`  023) that clamps the
union to ...`, indentation and all) rather than a hand-made approximation.

## The measurement, and what it is not

`s2-measurement.md` re-runs Set 131's probe. Three things about how to review it:

1. **It is deliberately not a causal claim.** Section 7 states what it does not
   establish. The author chooses N knowing how big the work is; every number in
   it is observational. Please do not report "does not establish causation" as
   a finding — it is the document's own stated position, and Session 3 owns the
   identification strategy.
2. **The primary result is the tail, per the spec**, and the finding is that the
   tail is mostly an artifact: duration is `completedAt − startedAt`, elapsed
   *calendar* time, 15 of 225 sessions crossed a night, and all 15 are in the 23
   longest sessions on record. p90 301 → 147 excluding them; 311 → 140
   idle-trimmed. This is a claim about the *measure*, and it is supported by two
   independent cuts plus a threshold sweep (20–120 min) with zero
   ceiling-binding sessions.
3. **The refit is a first pass for Session 3 to attack, not a finding to
   defend.** It reports that `F` is positive on every measure and estimator,
   which removes the spec's own argument that "constant `w̄` does not fit the
   data" (that argument rested on `F ≈ −16`, from a two-point fit on band
   medians). Consistency, not proof — and it says so.

The four probe scripts are reproduced by description in the appendix rather
than committed: they read only committed state and produce no artifact beyond
the document. If you think they should be committed, that is a legitimate
finding.

## By-design exclusions

- **No change to `WORK_STEP_BUDGET`.** The spec's non-goal: N moves only on the
  operator's word, and Session 3 produces the brief. The corrected numbers do
  not ask it to move — the median still steps up between `N = 3` and `N = 4–5`.
- **No new gate wired into `start_session` or CI.** The observation that
  `start_session` never consults the admission test is recorded in the code and
  named as a residual; wiring a blocking check into a boundary write is not this
  session's scope.
- **`--all`'s size check still ignores set status**, while the *shape* check
  scopes itself to unstarted sets on the operator's Set 128 ruling. That
  inconsistency was noticed and deliberately **not** fixed here (it would change
  `passed` semantics on the operator's ratified scoping); it is named as a
  residual instead of silently expanded into.
- **No end-of-set path-aware critique in this session.** It is a once-per-set
  stage before the set-terminal close, which is Session 3.
