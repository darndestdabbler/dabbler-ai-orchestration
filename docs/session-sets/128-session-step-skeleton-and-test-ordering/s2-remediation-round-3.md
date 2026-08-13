
## Round 3 (remediation-review cycle 1) — L1 rejected, L3 accepted

**L3 (untracked-file misclassification) — fix-accepted.** No further
action.

**L1 (A4.2) — fix-rejected, and correctly.** The delta round was scoped
but not *phased*: it carried `build_phase_framing(remediation-review)`
and the fix-delta bundle, and nothing else the phase means. A round that
calls itself a remediation-review must BE one, or the close accepts
settlement evidence the CLI's own phase would refuse.

**Fixed** by giving the backstop the phase in full, through the same
code path rather than a second spelling of it:

- `verify_session.evaluate_fix_verdicts` was **extracted** from
  `verify_session.run` (behaviour-preserving: the 121-line block moved
  verbatim, and `test_verify_session.py`'s 79 cases pass unchanged).
  It owns both escalations — anti-laundering on a bare structured
  `fix-rejected`, and the terminal-verdict coverage arithmetic over the
  ledger ids, including duplicate-of chains, cycles and dangling
  targets. Duplicating that in `close_backstop` would have been the same
  defect with a second place to drift from (L-069-1).
- `run_close_backstop` now assembles `assemble_cross_round_ledger_with_ids`
  and `assemble_acceptance_block` for an A4.2 round, passes the ledger
  into `build_prompt`, grades the response through the shared evaluator,
  and records `phase` + `fixVerdicts` on the issues envelope.

**Falsifier** (`test_a4_2_round_enforces_remediation_review_coverage`):
a prior round bears a blocking finding, the post-round fix is
shipped-code, and the reviewer returns a bare `VERIFIED` enumerating
nothing. Asserts the prompt carries the ledger id and the close is
BLOCKED for incomplete coverage. A mutation probe disabling the
evaluation flips the outcome to `verified` and the test fails, so the
enforcement is proven live rather than merely present.
