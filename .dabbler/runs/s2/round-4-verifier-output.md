**ISSUES FOUND**

The default-transport and pricing-surface prior findings are now assigned in Session 8, and the run-core `finish --waive` path is named. One blocking defect remains.

- **Issue 1:** The “no approval anywhere” design still leaves Session 3 instructed to preserve planning-session waivers.
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-framework-spec.md:455-492`, `docs/session-sets/148-the-session-framework/spec.md:96-100`, `docs/session-sets/148-the-session-framework/spec.md:162-175`, `ai_router/verify.py:1365-1571`, `ai_router/runcli.py:706-719`, `ai_router/runcli.py:1465-1470`, `tests/test_runcore_verified.py:280-299`
  - **Failure scenario:** Session 3 follows its explicit step 2 and adds only a “not ordinary code” guard, leaving `verify waive` / `finish --waive` usable for planning sessions. Planning sessions are exactly the likely cap-hit case the docs cite, so a future capped plan can still be operator-waived even though the new spec says no person can type a verdict.
  - **Acceptance criterion:** `JUDGMENT - The build sequence must no longer preserve any planning-session waiver exception; every public WAIVED path is assigned for removal/refusal for all sessions, or the no-override §9 contract is explicitly changed.`
  - **Details:** **Violation:** §9 says “There is no approval gate anywhere” and “An override has no home here,” but Session 3 still says “Restrict the operator waiver to planning sessions” and “Spec §9 puts the override in the planning sessions and nowhere else.” **Impact:** this would cause the first code session to implement the opposite of the new deliverable, reintroducing a human override path into the framework. **Evidence:** the current code has both waiver entrypoints and tests proving `finish --waive --attest-operator` records `WAIVED`; the session plan tells Session 3 to keep those paths for planning sessions instead of eliminating them.