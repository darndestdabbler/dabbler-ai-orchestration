# Conventions for this round — Set 119 Session 3

## Suite baseline (measured, not asserted)

`.venv/Scripts/python.exe -m pytest ai_router/tests -q -n auto` —
**3,780 passed, 9 skipped, 0 failed** in 513.23s, run AFTER the last code
change and recorded in `test-runs.jsonl`
(digest `859283c79f4f`, 514s). The 9 skips are the pre-existing
platform/optional-dependency skips this repo has carried for many sets;
none is new here. There are no tracked failures.

The suite is **235 tests smaller** than before this session, entirely
because four test modules were deleted along with the four modules they
covered. No test was weakened, disabled, or made lenient.

## Release contract

`ai_router/CHANGELOG.md` gains a new `## [Unreleased] — ... (Set 119 S3)`
section, matching this file's one-section-per-session convention (S1 and
S2 each have their own). The package version stays `1.0.0`: this set has
not been released, so every Set 119 section is still Unreleased and the
version bump belongs to the release walk, not to this session.

**This session removes public API.** `ai_router.get_costs`,
`ai_router.print_cost_report` and the `routed_gate` re-exports are gone.
That is deliberate and is declared in the changelog's `### Removed`
section as breaking for library consumers.

## By-design exclusions — please do not report these as findings

1. **`pathAwareCritique` is deliberately absent** from this set's
   configuration block, so no critique artifact is owed at the
   set-terminal close. The spec argues the case explicitly.
2. **`pricing.py` STAYS** even though cost calculation is useless on a
   Copilot seat. `models.py`, `pull_verifier.py`, `config.py` and
   `__init__.py` import it, and it feeds the api-profile verifier's
   `max_cost_multiplier` guard. The spec names this exclusion.
3. **`contract_gate.py`, `spec_admission.py` and `replacement_gate.py`
   were NOT deleted despite appearing in the spec's step-4 list.** They
   were proven reachable and are kept and reported, which is what the
   spec's own rule requires ("a module that turns out to be reachable
   stays and is reported, not forced"). The reasoning is journaled in
   `decisions.jsonl` (session 3, `goal-over-letter`). The spec's
   "5,165 lines" figure in Session 3's *Ends with* line is therefore
   wrong; the measured deletion is 3,483 module LOC + 3,012 test LOC.
   **The spec being wrong here is a reported finding of this session, not
   an unnoticed discrepancy.**
4. **Historical documents keep their historical claims.** Design and
   strategy records (`docs/verification-surface-strategy.md`,
   `ai_router/docs/pull-verifier.md`, `docs/contract-gate.md`,
   `docs/proposals/**`, `docs/planning/**`) describe what past sets built.
   They were annotated with deletion notes where they read as *current
   instruction or current behaviour*; they were not rewritten to erase
   the record.
5. **The doc-only severity cap shipped in Session 1 is live for this
   round.** A finding whose cited `evidencePaths` are all documentation
   prose records at Minor. That is the deliverable working. Code
   surfaces, JSON schemas and `ai_router/prompt-templates/**` are not
   documentation and block exactly as before.

## Severity rubric for this round

Grade by **CONSEQUENCE**: probability the stated failure scenario hits a
real user × impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit.

**Every Critical or Major finding must carry `Evidence paths:`** — the
repo-relative paths you actually read. This is contract on this template
(Set 119 S1). A blocking finding with no paths is unknown severity, and
unknown still blocks, so the requirement costs you nothing but tells the
next round where you looked.

## What this session claims to have done

1. **Close-mandated writes became a declared category.** Writers declare
   `CLOSE_MANDATED_WRITES`; `verification_stamp` discovers it by `ast`
   without importing. Two `bound` values: `whole-file`, and a normalizer
   for artifacts the close only *partly* owns. `cite_lessons` uses a
   normalizer so lesson **prose** keeps binding the freshness digest — a
   wholesale exemption would have let a post-verification rewrite of a
   preload document ride a passed round.
2. **Every completed round records the baseline it reviewed** in
   `sN-rounds.jsonl` (omit-null), and `find_discovery_baseline_tree`
   reads the ledger as well as the envelopes — so `--phase
   remediation-review` is reachable after a clean round or a backstop
   round. The **envelope** field kept its Set 096 meaning exactly
   (discovery-family only); only the ledger widened.
3. **`EvidenceTooLargeError` inherits `VerifySessionError`**, fixing four
   crash sites by type rather than by four more catches — and the
   `verify_session` CLI's handler order was reversed in the same change,
   because a subclass caught after its parent is unreachable code.
4. **Four unreachable modules deleted**, with reachability proven first
   by a static import graph over all 78 `ai_router` modules.

## Where to be most adversarial

- The `ast`-based discovery in `verification_stamp.py`: can a
  close-mandated declaration exempt something it should not? Can a
  malformed one exempt silently?
- `normalize_close_mandated_metadata`: does it move any byte other than
  the `last-used-set` value inside a lesson trailer?
- The normalize-and-compare-to-base branch in
  `compute_work_diff_sha256`: is there a state where real work stops
  binding the digest?
- The exception-hierarchy change: is there any surviving handler where
  the subclass is now caught before it should be, or swallowed?
- The deletions: is any deleted symbol still referenced anywhere that
  would fail at runtime rather than at import?
