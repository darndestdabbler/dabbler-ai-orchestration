**Overall:** not fully clean. The doc-only path is substantively implemented, and the new test does exercise the residual-race gate, but there are two doc inconsistencies and one assignment-record gap.

## Issue 1
- **Issue:** Q2 still opens with the superseded recommendation to reject same-`(repo, branch)` parallel sessions via an advisory lock, so the answer does not cleanly match the shipped contract.
- **Location:** `docs/proposals/2026-04-29-session-close-out-reliability.md`, Q2 opening paragraph before the new `Resolution (2026-05-01...)`.
- **Fix:** Rewrite Q2 so the shipped contract is the primary answer: same-set close-out re-entry is serialized; cross-set same-branch races are not admission-rejected and rely on `check_pushed_to_remote` as the residual safety net. Keep the old lock idea only as rejected history, not as the live recommendation.

## Issue 2
- **Issue:** Lock-file naming is inconsistent, which weakens operator-actionability.
- **Location:**  
  - `ai-router/docs/close-out.md`, “Lock contention without an obvious holder.” → `docs/session-sets/<slug>/.close.lock`  
  - `ai-router/docs/close-out.md`, “Cross-set parallelism on the same (repo, branch).” → `<session-set-dir>/.close_session.lock`  
  - `docs/proposals/2026-04-29-session-close-out-reliability.md`, Q2 resolution → `<session-set-dir>/.close_session.lock`
- **Fix:** Normalize all references to the actual implementation path. If the real file is `.close.lock`, update the new Q2 resolution and new troubleshooting entry. If the real file is `.close_session.lock`, update the older troubleshooting command.

## Issue 3
- **Issue:** The docs slightly overstate what the new executable test proves.
- **Location:**  
  - `ai-router/docs/close-out.md`, cross-set troubleshooting entry  
  - `docs/proposals/2026-04-29-session-close-out-reliability.md`, Q2 resolution  
  - `ai-router/tests/test_failure_injection.py`, `TestScenario7CrossSetParallelRejection`
- **Fix:** Either:
  - narrow the docs to say the test covers the **gate behavior** (`check_pushed_to_remote` rejection/remediation), or
  - extend the test to invoke `close_session` and assert exit code/state preservation if you want the docs to claim coverage of “exits 1 without flipping lifecycle state.”

## Issue 4
- **Issue:** From the provided excerpt, the Session 2 block documents the Session 2 routing-suspension deviation, but it does not show Session 1 actual cost/deviations.
- **Location:** `docs/session-sets/009-alignment-audit-followups/ai-assignment.md`, Session 2 block.
- **Fix:** If Session 1 actuals were meant to be backfilled as part of this deliverable, add them explicitly in the Session 1 block or reference them here. If they already exist elsewhere in the file, include that evidence in verification; the shown excerpt is not sufficient to confirm item 4.

## Status against the four asks
- **1. close-out.md Section 6 clarity:** **Mostly yes**, but **Issue 2** should be fixed; otherwise the entry is operator-actionable and correctly names `check_pushed_to_remote`, `TestScenario7CrossSetParallelRejection`, and drift item D-1.
- **2. Proposal Q2 revised to shipping contract:** **Partial / not fully clean** because of **Issue 1**. The new resolution is good, but the lead answer still states the old lock recommendation.
- **3. New test exercises residual-race protection:** **Yes.** It creates a real race against a real bare remote with two clones, makes one side win the push, and asserts the loser’s `check_pushed_to_remote(...)` fails with non-fast-forward/rebase-style remediation.
- **4. ai-assignment Session 2 block records Session 1 actuals and Session 2 deviation:** **Partial / unverifiable from the excerpt.** Session 2’s routing-suspension deviation is documented; Session 1 actuals are not evident in the provided block.