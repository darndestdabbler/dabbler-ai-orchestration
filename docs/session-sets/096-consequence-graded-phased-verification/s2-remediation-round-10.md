# Remediation notes — round 10

Round 10 challenged the round-9 remediation under the ledger's sanctioned
exception, and the challenge was correct:

- **"duplicate-of cycles or dangling targets can bypass every remediation
  verdict" (Major) — FIXED.** The in-round coverage check treated any
  parsed ledger id as covered, so reciprocal aliases (L1 -> L2 -> L1), a
  self-reference, or a dangling target (L9) let a VERIFIED response pass
  with no real disposition anywhere. Coverage is now CHAIN-TERMINATING:
  each required id must resolve — directly or through its duplicate-of
  chain — to a real verdict (fix-accepted / fix-rejected /
  accepted-with-modification) or to an exempt previously-accepted id;
  cycles, self-references, and targets outside the assigned id universe
  are rejected as missing coverage (escalation + session-verdict
  fail-close, as before). The framing states the rule; the exemption
  fixpoint already only propagated genuine acceptance, so next-cycle
  semantics were sound and unchanged. Tests:
  `test_duplicate_cycle_is_not_coverage`,
  `test_dangling_duplicate_target_is_not_coverage`,
  `test_self_referencing_duplicate_is_not_coverage`
  (suite: 3020 passed / 6 skipped).
