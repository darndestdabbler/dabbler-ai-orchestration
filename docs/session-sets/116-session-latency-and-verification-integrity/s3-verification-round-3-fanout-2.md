ISSUES FOUND

- **Issue 1: The canonical numbered workflow no longer explicitly instructs the required path-aware critique to run before the full suite**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** An orchestrator follows `docs/session-constitution.md`, the mandatory workflow document: it completes Steps 6–7, reaches Step 8, runs and records the applicable full suites, and attempts close without ever running the armed path-aware critique. The critique is either skipped entirely or a close-time check forces it afterward, invalidating the full run and requiring another. This is probable because the only explicit instruction to run the critique was deleted from Step 9, while Step 8 merely assumes that its remediation has happened. Armed critiques routinely produce changes, as this session itself demonstrates.
  - **Acceptance criterion:** JUDGMENT - `docs/session-constitution.md` must explicitly require an armed path-aware critique and any resulting remediation before Step 8’s single applicable full-suite run.
  - **Details:**
    - **Violation:** The accepted round-2 remediation requires “all expected code-changing verification and path-aware critique remediation before the single applicable full run,” and the original task requires “the **required** path-aware critique.” The constitution removed: “the multi-provider path-aware critique stage runs before the set-terminal close.”
    - **Location:** `docs/session-constitution.md`, Steps 8–9.
    - **Impact:** The main workflow can omit a required verification stage or recreate the exact invalidated-full-run loop this session is intended to eliminate. That materially changes the merge decision for a latency-and-verification-integrity change.
    - **Evidence:** Step 8 now says only “After every code-changing stage … and the path-aware critique’s remediation when armed” before directing the suite run. It contains no instruction to execute the critique. Step 9’s former explicit instruction was deleted. The authoring guide contains the intended sequence, but the mandatory numbered constitution does not.
    - **Fix:** Add an explicit critique action and sequence before the full-suite instruction: verify → remediate → run armed path-aware critique → remediate → run each applicable full suite once → close.

## NITS

- **Nit:** `ai_router/CHANGELOG.md` still says “a docs-only session still owes nothing,” contradicting the implemented prefix semantics and new tests: documentation under `ai_router/`, including `ai_router/docs/close-out.md`, owes pytest. Qualify this as documentation outside every applicable `covers` prefix.

- **Nit:** `docs/planning/session-set-authoring-guide.md` retains “The waste pattern being eliminated is invalidated runs, not full runs,” while the immediately following remediated policy says full runs are bounded to exactly once. `s3-nit-dispositions.md` also preserves the rejected claim that the policy bounds only the run of record and permits a mid-loop full run as “targeted testing with a wide net.” Mark that disposition as superseded by round 2 and remove the contradictory canonical-policy sentence.

- **Nit:** The illegal-token backstop explanation is false for the acknowledged zero-budget exception. `close_backstop.py`, `ai_router/docs/close-out.md`, and the emitted message say no evidence could let the close pass and instruct “Fix the token,” but a zero-budget repository with the same non-standard token in `budget.yaml` can close without fixing it. The skip remains valid because a verification round is unnecessary; the explanation should state that rather than claim the token must be fixed.