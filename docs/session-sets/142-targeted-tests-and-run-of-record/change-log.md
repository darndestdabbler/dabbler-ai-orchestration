## Session 1 verification — VERIFIED after 2 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/142-targeted-tests-and-run-of-record/s1/`

## Session 2 verification — VERIFIED after 5 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/142-targeted-tests-and-run-of-record/s2/`

## Session 3 verification — VERIFIED after 3 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/142-targeted-tests-and-run-of-record/s3/`

## Set 142 close-out — targeted tests before verification, the full suite after

The economical path is now the mechanically accepted one.

- **`verify` refuses to dispatch** without an accepted `preverify-targeted`
  record for the surfaces as they currently stand, and names the targeted
  command in the refusal.
- **The full suite is not pre-verification evidence.** Two auditable
  exceptions survive: the selector proving every test affected, and
  `--allow-full-preverify` with a non-empty reason. The record says which.
- **`final-full` is the run of record**, bound to the tree digest it ran
  against, and it alone satisfies `test_run_fresh`.
- **Changed-line coverage is measured**, not asserted: added lines from the
  diff, intersected with the statements a coverage report says ran. The
  suite command carries `--cov`, so the fact is produced by the run the
  selector prescribes rather than by a second command nobody remembers.
- **Deterministic controls are normalized** into `pass | fail |
  not_applicable | unknown`. This repository declares none, so all four
  read `not_applicable` — never `pass` for a tool nobody runs.

`verify.py` fell from 1,926 to 1,777 lines; `facts.py` (810) took the
changed-surface block plus the new fact surface. Envelope at close:
**14,473 LOC / 27 modules / 477 Python tests** against 16,800 / 33 / 605.

Set 142 spent 22 tests against an estimate of 14. The overrun is in
sessions 1 and 2; session 3 added 5 against an estimate of 3.

Two corrections landed alongside the work, both operator-directed:

- **The step lists in sets 142–146 had verification before the tests.**
  All fourteen now read tests first. The code always enforced the right
  order; the specs taught the opposite.
- **Sets 143 and 144 now state that the approved plan carries only the
  session's own steps** — never register, verification, the run of record,
  or close-out — and that a session declares at most seven of them,
  refused by the schema at write time.
