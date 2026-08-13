ISSUES FOUND

- **Issue 1:** A4.2 is only reported; close backstop still runs an unphased full backstop round for shipped-code deltas.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/close_backstop.py:887`, `ai_router/close_backstop.py:918`, `ai_router/close_backstop.py:1149`, `docs/planning/session-set-authoring-guide.md:1873`, `docs/session-sets/128-session-step-skeleton-and-test-ordering/decisions.jsonl:4`
  - **Failure scenario:** A typical session fixes shipped code after the post-verification full suite and then attempts close without manually running A4.2. That is the exact stale-evidence path A4 addresses; `validate_stamped_row` rejects the row, `decide_backstop` routes, and `run_close_backstop` assembles the normal session diff and records `phase=None`, so the close buys the unphased backstop round the operator decision says must be replaced by a delta-scoped remediation-review.
  - **Acceptance criterion:** `JUDGMENT - A close with stale stamped evidence caused by a post-round shipped-code delta must route through a delta-scoped remediation-review path, with the round recorded as remediation-review/fix-delta evidence, not as an unphased close-backstop round.`
  - **Details:** **Violation:** the recorded operator decision says “a shipped-code delta runs the delta-scoped remediation-review phase instead of an unphased full round,” and the authoring guide says the close backstop consults the classifier “rather than buying an unphased full round.” **Impact:** the central A4.2 cost-reduction objective is not delivered for the close path that spends money; reviewers would merge a change that still does the old expensive thing for code fixes. **Evidence:** `close_backstop._a4_obligation_note` explicitly “Reports; never decides,” then `run_close_backstop` calls `_vs.assemble_evidence(...)` and records the ledger row with `phase=None`; it appends only a message saying remediation-review was owed.

NITS

- **Nit:** The spec’s “Irony budget” says 8 new test functions, while `ai_router/tests/test_post_round_delta.py` adds 11 test functions. This is non-blocking, but it is a stated plan constraint the delta does not match.