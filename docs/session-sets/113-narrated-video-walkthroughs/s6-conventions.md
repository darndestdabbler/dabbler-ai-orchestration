# Session 6 verification conventions

Read this before the work. It states the agreed baseline so Round 1 spends its
findings on real defects rather than on things already settled (G-010).

## What this session is

A **diagnosis** session. Session 4's advisory path-aware critique produced no
artifact across three attempts: google succeeded every time, openai failed
every time, in two distinct ways. The spec's steps are: reproduce both failures
*before changing anything*, start from the sharpest fact (the same openai
models answered five `session-verification` calls in Session 4 without
trouble), judge the servant violation on its own merits, and ship a falsifier
rather than just a fix.

It is **not** set-terminal. `change-log.md`, the Step 9 guidance review and the
set's UAT accounting all belong to **Session 8** and are deliberately absent
here — the spec says so in Session 6 step 8. Their absence is not a finding.

## Suite baseline

- **pytest**: the required portion is run at Step 8, after every code-changing
  stage, per A1/A3. Interim targeted runs recorded during the session:
  226 passed across `test_pull_verifier.py` / `test_pull_critique.py` /
  `test_dual_surface_verify.py`, and 485 passed across the thirteen test files
  that make up the `conftest.py` change's blast radius. No failures, no
  tracked-failure exceptions in play.
- `run_of_record affected` reports **pytest, mocha and playwright** all owed,
  because all three declare `covers: ai_router/` and this session changed
  `ai_router/`. All three are run and recorded at Step 8.

## Release contract

Nothing is published. The router change is `[Unreleased]`; publishing is
operator-gated and out of scope for this session.

## By-design exclusions — please do not report these as defects

1. **Both live critique runs are `--dry-run`, and no `path-aware-critique.json`
   exists.** Deliberate. That artifact is gated at the **set-terminal** close,
   which the 2026-08-16 amendment moved to Session 8. Writing it now would bank
   a stale artifact against code that Sessions 7 and 8 will keep changing.
   The runs were to prove the producer works, which is this session's
   Ends-with.
2. **`SandboxNotQuiescent` does not fail the run.** This is a deliberate,
   journaled judgment (`decisions.jsonl`, authority `ai`, `goal-over-letter`),
   and it is the one call in this session most worth challenging — please do
   challenge it on its merits. The claim under test is: a lying servant lies
   *deterministically*, so narrowing the guard to fire only against a stable
   tree removes a false-accusation class without losing a true positive. If you
   can name a servant that is dishonest **and** non-deterministic in a way this
   misses, that is a real finding.
3. **`_registry_model_id` passes unknown strings through unchanged.** Required,
   not a gap: the executor's own pins and `_DEFAULT_MODELS` are already
   provider ids, and an operator may pin an id the registry does not list.
4. **105 rows were deleted from `ai_router/router-metrics.jsonl`.** They were
   fixture rows this session's own test runs wrote there in error, all `$0.00`,
   all carrying fixture set names. The file is gitignored, a pre-cleanup copy
   was kept outside the repo, and the cause is closed by a conftest guard with
   its own falsifier. Deleting them is the repair, not a ledger rewrite.
5. **Session 5 left an adjudicated-at-the-bound residual** (a remediated but
   unreviewed post-capture-step fix). It is Session 5's, closed on the operator
   path, and is out of scope here.

## Severity rubric (G-013)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. A finding
with no nameable failure scenario is a nit. Please state the scenario.
