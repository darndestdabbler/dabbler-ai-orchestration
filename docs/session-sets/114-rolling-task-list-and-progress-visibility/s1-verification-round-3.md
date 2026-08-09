ISSUES FOUND

Fix verdict: L1 late checklist post laundering earlier transitions -- fix-accepted  
Fix verdict: L2 missing pre-command checklist enforcement -- fix-rejected  
Fix verdict: L3 operator-stop posts are still not correctly enforced -- fix-rejected  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 post-vs-run-record ordering -- fix-accepted  

**Issue 1:** The required “before a long-running command” post is still not gate-enforced.
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A normal session starts a full suite or routed verification without posting first, records the run afterward, posts after completion and before close, and `check_checklist_posted` passes. This is probable because full suites and routed verification are on the main path, and the remediation explicitly leaves the pre-command half as “doctrine, not a gate.”
- **Acceptance criterion:** `JUDGMENT - check_checklist_posted must have an enforceable command-start transition, or equivalent non-attestation mechanism, and must fail when the pre-command checklist post is missing.`
- **Details:** Violation: the session plan required posts “before/after a long-running command … so it is checkable,” and L2 required the gate to fail when the pre-command post is missing. Impact: the original silent-decay mode remains for the operator-facing “silent terminal” post. Evidence: `gate_checks._checklist_transitions` records only start, test-run records, verification rounds, human decisions, and last activity-log entry; the new docs say “The *before* half of a long-running command is doctrine, not a gate.” I also confirmed a fixture with no command-start post passes after only post-completion/close posts.

**Issue 2:** Operator-stop enforcement checks a post after the decision record, not the required post before the education-mode brief.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** The orchestrator asks the human for a decision without first posting the checklist, records the human decision in `decisions.jsonl`, then posts afterward; close passes even though the human never saw the checklist before deciding. This is probable for any human-authority stop because the decision journal records the decision after it exists, while the required checklist post is before the brief.
- **Acceptance criterion:** `JUDGMENT - A human-authority operator stop must not be considered covered solely by a checklist post after the decision_journal timestamp; the gate must enforce the documented pre-brief post or the contract must stop claiming that timing is gate-checked.`
- **Details:** Violation: the authoring guide says “Every operator stop | Immediately before the education-mode brief … | Yes.” Impact: the gate accepts the wrong side of the stop and fails to ensure the operator sees current session state while deciding. Evidence: `gate_checks.py` adds `operator-stop` at `record["timestamp"]` and the generic window rule accepts `post >= when`; the added passing test posts at minute 31 after a human decision at minute 30.

**NITS**

- The compact constitution wording dropped the explicit “after each verification round” transition; the authoring guide still implies it via routed rounds and `sN-rounds.jsonl`, but restoring the explicit phrase would avoid close-gate surprise.