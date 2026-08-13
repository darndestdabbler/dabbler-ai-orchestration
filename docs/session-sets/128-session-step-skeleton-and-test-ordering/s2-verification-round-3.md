ISSUES FOUND

Fix verdict: L1 A4.2 close backstop runs delta-scoped evidence but not the remediation-review machinery -- fix-rejected  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 unchanged untracked anchor files are no longer misclassified -- fix-accepted

**Issue 1:** The A4.2 backstop path labels itself `remediation-review` but omits the CLI phase’s ledger, acceptance block, fix-verdict parsing, and coverage enforcement.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/close_backstop.py:947`, `ai_router/close_backstop.py:1001`, `ai_router/verify_session.py:3228`, `ai_router/verify_session.py:3748`
- **Failure scenario:** A typical session has prior blocking findings, gets a clean remediation-review, then a post-suite shipped-code fix stales the evidence and close triggers the A4.2 backstop. The backstop sends only phase framing plus the fix delta, without the cross-round ledger or coverage check, so a bare `VERIFIED` response can close without re-confirming each prior ledger id. That forfeits the mandatory regression check that defines remediation-review.
- **Acceptance criterion:** `JUDGMENT - In the A4.2 close-backstop path, the prompt must include the same cross-round ledger and acceptance block as verify_session --phase remediation-review, and the backstop must parse/enforce fix-verdict coverage before allowing a non-blocking close.`
- **Details:** Violation: the ratified fix says the backstop runs “a delta-scoped remediation-review phase,” not merely a delta diff. Impact: the close can accept settlement evidence that the normal remediation-review CLI would reject for missing fix-verdict coverage. Evidence: `verify_session.run` assembles the ledger/acceptance block and enforces coverage; `close_backstop.run_close_backstop` passes only `framing=` and never supplies `ledger=` or runs the coverage logic.