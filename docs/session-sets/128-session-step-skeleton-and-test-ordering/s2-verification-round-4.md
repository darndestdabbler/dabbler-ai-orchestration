ISSUES FOUND

- Fix verdict: L1 A4.2 backstop now routes a shipped-code post-round delta as remediation-review -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 unchanged untracked anchor files are no longer reported as post-round shipped changes -- fix-accepted
- Fix verdict: L4 A4.2 backstop now carries ledger, acceptance block, fix-verdict parsing, and coverage enforcement -- fix-accepted

**Issue 1:** The A4.2 close backstop’s remediation-review omits the CLI phase’s evidence exclusions, so its “FIX DELTA ONLY” prompt includes loop bookkeeping as reviewable fix hunks.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/close_backstop.py:958`, `ai_router/close_backstop.py:977`, `ai_router/verify_session.py:3260`, `ai_router/verify_session.py:3315`, `ai_router/verification_stamp.py:398`
- **Failure scenario:** A typical session completes a verification round, then fixes shipped code after the full suite and closes. `record_round_completed` snapshots `worktreeTreeAtCompletion` before appending the round ledger; the A4.2 classifier correctly excludes that ledger bookkeeping, but the backstop builds its remediation-review evidence with only `DEFAULT_DIFF_EXCLUDES`. The routed prompt therefore includes `sN-rounds.jsonl` and other phase bookkeeping in the diff hunks while instructing the verifier that new defects are admissible within those hunks, making the backstop’s phase weaker/noisier than the CLI phase on the main A4.2 path.
- **Acceptance criterion:** JUDGMENT - The close-backstop A4.2 remediation-review must apply the same phased set exclusions that `verify_session --phase remediation-review` applies before `assemble_fix_delta_evidence`, and a fixture with a post-round shipped-code edit plus post-anchor round/checklist bookkeeping must produce a prompt whose fix-delta diff contains the shipped-code hunk but not the excluded loop-bookkeeping paths.
- **Details:** Violation: the remediation notes claim the backstop runs the remediation-review “through the same code path,” and the CLI phase explicitly adds `PHASED_EVIDENCE_SET_EXCLUDES` before calling `assemble_fix_delta_evidence`; the backstop calls `assemble_fix_delta_evidence(..., list(DEFAULT_DIFF_EXCLUDES))` instead. Impact: this changes the actual evidence scope for the metered close backstop and can turn normal framework ledger writes into apparent in-scope fix hunks. Evidence: `verify_session.run` extends phase excludes from `PHASED_EVIDENCE_SET_EXCLUDES`, while `close_backstop.run_close_backstop` does not.