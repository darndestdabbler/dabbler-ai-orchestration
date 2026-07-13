# Remediation notes — round 3 (remediation-review cycle 1)

- **Per-finding fix-verdict coverage still fail-open (fix-rejected ×2 —
  the same point, restated as the round's one Issue):** the deterministic
  half is now machine-enforced — a remediation-review round that
  enumerates ZERO `Fix verdict:` lines escalates to blocking (synthetic
  unknown-severity `incomplete-fix-verdict-coverage` finding) instead of
  warning, whenever the round would otherwise be non-blocking. And on
  every phased round, a blocking classification under a contradictory
  VERIFIED token now fails the SESSION disposition claim closed to
  ISSUES_FOUND — so no contradictory round can leave a closable VERIFIED
  claim for the stamped row to corroborate (the claim/stamp mismatch
  blocks the close; the classic path keeps its existing semantics for
  compat).
- **Deliberate residual, stated for adjudication:** PARTIAL coverage
  (some but not all verdict lines present) remains a count-level WARNING,
  not a block, because the historical blocking count double-counts
  restatements across rounds — identity-free enforcement would
  false-positive honest reviews and manufacture exactly the churn this
  set exists to kill. The envelope's `fixVerdicts` gives the operator the
  full enumeration to audit. If the verifier still grades this residual
  blocking, the 2-cycle bound stops the loop to the operator — which is
  the designed adjudication path.

Tests: `test_zero_fix_verdicts_escalates_to_blocking`,
`test_blocking_round_under_verified_token_fails_disposition_closed`
(suite: 3006 passed / 6 skipped).
