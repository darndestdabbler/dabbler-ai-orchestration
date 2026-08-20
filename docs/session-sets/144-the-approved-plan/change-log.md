## Session 1 adjudication — VERIFIED (every disputed finding OVERRULED)

- Adjudicator: gemini-3.1-pro-preview (google) over copilot-cli
- Excluded providers: anthropic, openai
- Routed cost, all rounds: unpriced (seat transport)
- Dispute on round 3 finding 0: OVERRULED — The orchestrator added logic to explicitly detect unclosed `(slug` markers using `_SLUG_OPEN_RE` and correctly raises `MalformedSlugError` when a trailing closing parenthesis is missing, satisfying the criteria and addressing the specific failure scenario detailed in the finding. Regression tests were appropriately added.
- Raw round output: `.dabbler/runs/144-the-approved-plan/s1/`

## Session 2 verification — VERIFIED after 3 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/144-the-approved-plan/s2/`

## Session 3 verification — VERIFIED after 1 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/144-the-approved-plan/s3/`

## Session 3 verification — VERIFIED after 2 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/144-the-approved-plan/s3/`

## Set 144 close-out — the plan, and what it cannot promise

A session's plan is now a machine-owned artifact: schema-validated, written
only through the sanctioned writers, hashed at approval, and immutable
afterwards except by an appended amendment that the write ledger can tell
apart from a rewritten history. A step with no evidence contract cannot be
written — the schema refuses it, not a reviewer — and no plan may carry more
than seven steps or any of the lifecycle ceremony around them.

Checking a plan costs nothing until it has to. The free mechanical checks run
first and settle the round on their own; the cheap model reads what survives
against fixed checklist text and answers approve, amend or human per step; a
revision that does not touch the objected-to fields bounces with no model
call at all. Premium review fires only on derived high risk or a second
objection, and the record names which trigger fired.

Session 3 closed the loop. An amendment now carries the change rather than a
note about it — `added_files` widens the amended step's envelope,
`evidence_contract` replaces its proof, and `effective_plan` folds them over
a core that is never rewritten, so `plan_hash` never moves. Risk is
re-derived from the widened envelope, so a supervisor cannot amend its way
out of the review its own risk earns. Only the amended step goes back through
the checks. Whether the work stayed inside its plan is decided by
`compare_to_envelope`: git says what changed, the envelope says what was
declared, and set difference decides. No model is asked.

### What the replay measured, and what it could not

`scripts/plan_replay.py` replays all 16 closed sessions of sets 136–141 and
publishes its counts to `replay-136-141.md`. The headline is a negative
result, and it is reported as one: **14 of 15 measurable sessions** would
have needed an amendment against an envelope reconstructed from the files
their own specs name. That is not evidence that plans are paperwork. It is
evidence that the reconstruction has no resolution — a spec names two to
eight files and a session touches three to twenty-five — so the rate must be
measured against envelopes an author actually declares, live, in set 145.

The actionable half is the distribution. The escapes concentrate in the
source tree (45 files) and the test tree (43). A step whose evidence contract
says a test proves it, and whose envelope does not name that test, amends its
plan the moment it writes the test. Authoring the envelope from the evidence
contract rather than from the spec's prose is what the measurement asks of
set 145.

Of 16 verification findings on disk, 1 cited only files inside the
reconstructed envelope. `coverable` is the strongest claim available: a
declared proof *could* have been asked to cover it. Whether it *would* have
is the completeness question, and pre-registration cannot answer it by
construction. A weak criterion inside the envelope passes. What
pre-registration does guarantee is that the criterion could not be rewritten
once the code was seen — which is the whole of what it was built to do.

### Two corrections taken rather than deferred

The replay found that a set's `change-log.md` is written by close-out, which
is a lifecycle step and therefore never a plan step — so no envelope is
permitted to declare it, and counting it as outside-the-plan would refuse
every session for obeying the lifecycle. It now joins `session-state.json`
and `activity-log.json` as lifecycle-written. `spec.md` deliberately did not
join them: a session editing its own spec mid-flight is the drift the plan
exists to catch. This is not a loosened check; it names whose work the file
is.

That correction surfaced a second one. Three modules already declared the
same three filenames independently — what the close commits, what the
evidence diff drops, what a covered-surface change ignores — and the plan
work was about to add a fourth. They now read one declaration in `ledger.py`,
beside `MACHINE_DIRNAME`, which owns the same distinction between the record
of a session and the work of one.

### The arithmetic

Against the post-141 baseline `fa3c28c7` (12,650 LOC / 25 modules / 455
tests) and the sequence ceiling of 16,800 / 33 / 605:

| Dimension | After 143 | After 144 | Ceiling |
| --- | ---: | ---: | ---: |
| Python source | 14,007 | **15,556** | 16,800 |
| Python modules | 27 | **29** | 33 |
| Python tests | 476 | **531** | 605 |
| TypeScript tests | 161 | **161** | 215 |

Two modules were added across the set — `approved_plan.py` and
`plan_review.py` — and both hold a concern that had no home rather than
sitting beside one that did. `verify.py` is untouched at **1,789** and must
end below 1,200; set 145 session 3 still owns that extraction.

The test forecast was 18 (8, 7, 3) and the set spent 55. Session 3 alone
forecast 3 and spent 7: the amendment flow turned out to be four behaviours
rather than one — the fold, the scoped re-check, the rejected amendment that
must leave the plan alone, and the re-derived risk that must still escalate —
and the mechanical envelope comparison needed a second test for the
lifecycle-written files it must never count. The overrun sits inside the
envelope, but it is an overrun, and the pattern across 142–144 is that
estimates made before the behaviours are enumerated run low.
