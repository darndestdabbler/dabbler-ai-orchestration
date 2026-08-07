ISSUES FOUND

- **Issue 1:** `decisions.jsonl` is self-excluded from phased verification under AI authority.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A normal phased verification session journals an AI-made waiver/adjudication after a round, which the new docs explicitly describe as sanctioned. Because `decisions.jsonl` is now in `WORK_DIFF_SET_BOOKKEEPING`, phased evidence excludes its content and the freshness hash ignores later edits, so the verifier cannot review the decision record that changed after the round. That is probable because the change is intentionally documented as the expected flow.
  - **Acceptance criterion:** `JUDGMENT - The decision to classify decisions.jsonl as loop bookkeeping is either removed so journal content remains verification-binding, or is recorded and documented as a human-authority verification-reduction with non-empty operator_attestation.`
  - **Details:** **Violation:** the spec says the hard carve-out is “decisions that reduce verification stay outside AI authority,” and the session goal says verification-reducing calls “structurally cannot be self-authorized.” **Impact:** this is a self-authorized reduction in verifier visibility, so it changes the merge decision for the core carve-out deliverable. **Evidence:** `verification_stamp.py` adds `decisions.jsonl` to `WORK_DIFF_SET_BOOKKEEPING` and explicitly states “on a --phase round the verifier does not see the journal”; `verify_session.py` applies that list to phased evidence exclusions; `work_diff_content_digest()` ignores those files for freshness; the journal’s own record for this decision declares `authority: "ai"` and `verification_effect: "none"`.

NITS

- **Nit:** The docs/config comments call `enabled: false` “opt-out by default”; that should say opt-in, though nearby text correctly says existing behavior is unchanged until the operator flips it on.