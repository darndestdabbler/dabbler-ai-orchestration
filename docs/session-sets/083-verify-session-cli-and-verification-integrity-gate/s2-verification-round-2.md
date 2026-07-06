**ISSUES FOUND**

- **Issue 1:** `--manual-verify` bypasses the illegal-`verification_method` rejection itself, so the retired incident token can still close successfully
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 1 requires: **“Disposition validation: reject unknown `verification_method` tokens fail-closed (legal: `api`, `manual-via-other-engine`, `skipped`)”**. Step 2 separately says **“`--manual-verify` bypasses this gate”** — i.e. the new evidence gate — not the vocabulary rule itself.
    - **Impact:** This leaves a supported close path where the exact retired token from the incident (`"manual"`) is still accepted. A reviewer should block merge because the promised fail-closed token enforcement is not actually universal; operator-attested closes can still persist an illegal disposition token instead of forcing the renamed one.
    - **Evidence:** In `ai_router/close_session.py`, `run()` sets `skip = frozenset({VERIFICATION_INTEGRITY_CHECK_NAME})` when `args.manual_verify`, and `_run_gate_checks()` records that check as passed without executing it. In `ai_router/gate_checks.py`, `check_verification_integrity()` contains **Layer 1 — method vocabulary**, so skipping the check skips the token rejection too. The new test `ai_router/tests/test_verification_integrity_gate.py::TestCloseSessionEndToEnd.test_manual_verify_is_the_sanctioned_bypass` proves the behavior end-to-end: it uses `INCIDENT_DISPOSITION` with `verification_method="manual"` and expects `outcome.result == "succeeded"`.
    - **Correct answer:** Keep `--manual-verify` as a bypass for evidence corroboration only, but enforce `verification_method` legality outside that bypass path (or run the vocabulary sub-check even when the evidence sub-check is skipped) so illegal tokens still fail closed.

#### NITS

- **Nit:** Several `check_verification_integrity()` refusal branches do not include the required verify command, despite the task saying the refusal message should print the exact invocation. Missing in the `view is None`, `current is None`, and `normalize_to_v4_shape(...)` failure branches in `ai_router/gate_checks.py`.
- **Nit:** The new headless end-to-end test does **not** substantiate the claim that it proves the “hard-block-in-both-modes posture”; it only exercises headless mode. The interactive half is unproven by the diff.
- **Nit:** The docs/comments claim `verification_message_ids` is expected to be empty for every surviving method, but `validate_disposition()` only enforces emptiness for `verification_method == "api"`; `manual-via-other-engine` and `skipped` still accept non-empty lists.