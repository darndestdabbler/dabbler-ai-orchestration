
## Round 4 (remediation-review cycle 2) — L4, and the class behind L1/L4

**Round 3's L3 stayed accepted; L1, L2 and L3 all came back
fix-accepted.** The new finding, L4, was that the A4.2 backstop assembled
its remediation-review bundle with only `DEFAULT_DIFF_EXCLUDES`, while
the CLI phase adds `PHASED_EVIDENCE_SET_EXCLUDES` first. Loop bookkeeping
— including the round ledger `record_round_completed` appends *after*
taking the snapshot the delta is anchored on — therefore landed inside a
bundle whose own heading tells the verifier that new defects are
admissible within these hunks.

**Correct, and fixed.** But the more important fact is the pattern:
rounds 3 and 4 found the SAME CLASS twice. The backstop was
reproducing the CLI's phase piece by piece — first the cross-round ledger
and the fix-verdict coverage check, then the evidence exclusions — and
each round found whichever piece had not been copied yet. Mirroring was
the defect; the instances were symptoms.

**The operator authorized passing the round bound specifically to review
the class fix rather than the instance** (education-mode brief,
2026-08-12; the alternative offered was closing on the round-4 record).

**Fixed** by extracting `verify_session.build_phase_round_inputs`, which
returns a `PhaseRoundInputs` carrying the phase's excludes, framing,
cross-round ledger and ledger ids in one place:

- `verify_session.run` now calls it (behaviour-preserving: the 154-line
  inline region was replaced and `test_verify_session.py`'s 79 cases pass
  unchanged, including the ledger, supplementary and oversized-evidence
  paths).
- `close_backstop.run_close_backstop` calls the same function. Its own
  mirrored assembly is gone entirely.
- `supplementary_unavailable` keeps the assembly a pure read: the CLI
  still owns its `EXIT_USAGE` refusal, so no behaviour moved between
  layers.

**Falsifiers.** The instance keeps
`test_a4_2_round_applies_the_phased_evidence_exclusions` (bookkeeping
written after the anchor must not reach the hunks; a mutation dropping
the exclusions fails it). The class gets a structural assertion,
`test_the_backstop_has_no_second_spelling_of_the_phase_assembly`, which
fails if `build_phase_framing`, `assemble_cross_round_ledger_with_ids`,
`assemble_acceptance_block` or `PHASED_EVIDENCE_SET_EXCLUDES` is ever
assembled a second time inside the backstop. That is what makes a third
gap unreachable rather than merely unobserved.
