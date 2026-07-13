# Remediation notes — round 9 (reshaped-context re-verify)

Round 9 carried the operator adjudication context (2026-07-13). Both
previously adjudicated points were ACCEPTED by the verifier (no replay
finding, no output-budget finding). One genuinely new refinement of the
round-5 coverage fix was raised and is remediated:

- **"Coverage IDs are assigned to report occurrences, so duplicate
  findings can manufacture blocking review failures" (Major) — FIXED.**
  Within a cycle, fan-out siblings / reworded restatements of the same
  defect each carried their own required id; a reviewer accepting one
  occurrence but omitting its redundant sibling produced a synthetic
  incomplete-coverage blocker and wasted a bounded cycle. The reviewer —
  the party the policy already entrusts with same-point judgment — now
  has a sanctioned, machine-readable way to declare identity:
  `Fix verdict: L<m> -- duplicate-of L<n>`. A duplicate's id counts as
  covered in its own round, its disposition follows its target's, and
  the next cycle's exemption set carries acceptance through duplicates
  by fixpoint (chains included). Grammar in `parse_fix_verdicts`
  (`duplicateOf` captured), framing updated, JSON schema + doc extended
  in parity, three new tests
  (`test_duplicate_of_parses_with_target`,
  `test_duplicate_sibling_covered_by_declaration`,
  `test_duplicate_of_follows_target_acceptance_next_cycle`).
  No fuzzy text matching anywhere — identity remains a recorded judgment,
  never an inference.
