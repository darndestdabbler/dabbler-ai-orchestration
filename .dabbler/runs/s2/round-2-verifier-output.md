ISSUES FOUND

Round 1’s default-transport and pricing findings are addressed by the new Session 8 steps. The waiver finding persists because the remediation is scheduled too late.

- **Issue 1:** The waiver guard is assigned to Session 4, leaving Session 3 able to use the existing ordinary-code waiver path.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/148-the-session-framework/spec.md:96-99`, `docs/session-sets/148-the-session-framework/spec.md:152-153`, `docs/session-sets/148-the-session-framework/spec.md:187-193`, `ai_router/verify.py:1365-1570`, `tests/test_verify.py:916-934`
  - **Failure scenario:** Session 3 reaches the verification cap with an upheld blocking finding. Because Session 4 has not run yet, today’s `verify waive` still permits an interactive operator to stamp `WAIVED` on that ordinary code session; the close gate then treats it as non-blocking. This is probable because Session 3 is the very next code session, and the current code/tests explicitly support waiver after upheld adjudication for a normal session.
  - **Acceptance criterion:** `JUDGMENT - The approved sequence must make ordinary-code-session waivers impossible before Session 3 can reach the waive path, so no session from 3 onward runs under code that can close ordinary code work with verify waive.`
  - **Details:** **Violation:** the spec says “Sessions 3 onward may not” use operator approval and Session 2 is “the second and last human approval gate,” but the new guard is placed in Session 4. **Impact:** the first code session can still be closed unverified by human waiver, undermining the approved build sequence’s core no-escape-hatch guarantee. **Evidence:** `run_waive` checks exhaustion and TTY, then writes a non-blocking `WAIVED` row and stamps session verification without checking session kind; the existing replay test proves that path closes a regular session.