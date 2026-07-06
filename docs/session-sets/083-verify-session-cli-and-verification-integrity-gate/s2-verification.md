**ISSUES FOUND**

- **Issue 1:** Verifier provider is not actually resolved via the model registry; the gate trusts the metrics row’s `provider` field
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 2 requires: **“provider resolved via the model registry; orchestrator from the session-state block; missing identity fails closed”**.
    - **Impact:** The core cross-provider evidence check can be satisfied by whatever `provider` string is present in `router-metrics.jsonl`, even if the model registry is missing/unloadable or the row’s provider value is wrong. That can let a same-provider or otherwise uncorroborated verification pass the new gate, which defeats the main integrity guarantee a reviewer is being asked to approve.
    - **Evidence:** In `ai_router/gate_checks.py`, `_row_provider()` explicitly does the opposite of the spec:
      ```python
      provider = row.get("provider")
      if isinstance(provider, str) and provider.strip():
          return provider.strip().lower()
      ```
      Only if that field is absent does it consult the model registry. `_models_registry()` also returns `{}` on load failure, but `_row_provider()` can still succeed from `row["provider"]`, so missing registry identity does **not** fail closed.
    - **Correct answer:** Resolve verifier provider from the metrics row’s model via the loaded model registry; if the registry/model mapping cannot be resolved, return `None` and let the gate fail closed.

- **Issue 2:** The required new regression suite is not part of the tracked patch as presented
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 4 requires a **“Layer-1 pytest matrix”** covering the new gate cases, and the activity log claims a **“42-test matrix ... test_verification_integrity_gate.py”** was added.
    - **Impact:** The main new test file is not actually included in the change set under review, so the required coverage is not reviewable and would not ship as part of the tracked patch in its current state. That is a merge blocker for a change whose acceptance criteria explicitly include new regression coverage.
    - **Evidence:** `git status --short` shows:
      ```text
      ?? ai_router/tests/test_verification_integrity_gate.py
      ```
      and the provided **“Complete diff”** contains no contents for that file. The claimed matrix is therefore not part of the reviewed diff.
    - **Correct answer:** Add/track `ai_router/tests/test_verification_integrity_gate.py` and include its contents in the actual patch/commit under review.

- **Issue 3:** The required live dogfood close for Session 2 is not evidenced; the session is still open
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 5 requires: **“Dogfood: this session's own close runs through the new gate live.”** The session plan also says it **“Ends with: ... this session's own close passed the live gate with real evidence.”**
    - **Impact:** A stated acceptance criterion is unmet. Without a real close of Session 2 through the new gate, the patch does not provide the promised live proof that the gate works on the session’s own artifacts, which is exactly the kind of end-to-end confirmation the spec called for before sign-off.
    - **Evidence:** The session artifacts still show Session 2 as open:
      - `docs/.../session-events.jsonl` only adds:
        ```json
        {"session_number": 2, "event_type": "work_started"}
        ```
        There is no `closeout_requested` or `closeout_succeeded` for Session 2.
      - `docs/.../session-state.json` marks Session 2:
        ```json
        "status": "in-progress",
        "completedAt": null
        ```
      - No Session-2 verification artifact or close-out evidence appears in the diff/status.
    - **Correct answer:** Actually run Session 2’s close through the new gate and record the resulting closeout events/state/evidence in the session-set artifacts.

#### NITS

- **Nit:** The spec says the refusal message should print the exact `verify_session` invocation, but several failure branches in `ai_router/gate_checks.py::check_verification_integrity()` omit `command` entirely (`view is None`, `current is None`, and `normalize_to_v4_shape` failure). Non-blocking because those paths still fail closed, but it does not fully match the stated operator-guidance requirement.