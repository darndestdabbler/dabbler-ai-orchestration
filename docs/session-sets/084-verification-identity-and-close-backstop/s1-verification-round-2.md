**ISSUES FOUND**

- **Issue 1:** `start_session` does not validate every supplied `--model`; single-vendor sessions can persist an unresolvable model and silently fall back to the free-text provider label
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The session plan requires: **“`start_session` … validates any supplied model against the registry”** and Step 1 makes the registry-resolved model the authoritative identity. The implementation explicitly does not do that for single-vendor engines.
    - **Impact:** A normal supported CLI path can write `session-state.json` with a typoed/arbitrary `model` on a single-vendor engine. Downstream identity consumers then ignore that bad model and trust the free-text `provider` label instead of failing loud at the boundary. That breaks the F1 identity contract on real inputs and can miscompute the cross-provider gate/exclusion, which is merge-blocking because this session’s core deliverable is identity hardening.
    - **Evidence:**
      - In `ai_router/start_session.py`, `_refuse_unresolvable_identity()` only rejects `resolved is None` when `multi` is true:
        ```python
        if multi and resolved is None:
            return ...
        ```
      - The same function’s docstring says the opposite of the spec:
        ```python
        Single-vendor engines keep their existing contract: ... an unrecognized model string is accepted as a label.
        ```
      - In `ai_router/orchestrator_identity.py`, `resolve_orchestrator_identity()` explicitly falls back on an unresolvable model for single-vendor engines:
        ```python
        # Single-vendor engine with an unresolvable model string: fall
        # through to the provider-field second choice below
        ```
      - The new tests lock this behavior in as expected:
        `ai_router/tests/test_orchestrator_identity.py::TestResolveOrchestratorIdentity::test_single_vendor_unresolvable_model_falls_back_to_label`.
    - **Correct answer:** Refuse any supplied model that does not resolve in the registry at `start_session`, not just for multi-provider engines. If provider-field fallback is kept for back-compat, it should be limited to the case where a known single-vendor engine omitted `model`, not where a `model` was supplied and failed to resolve.

#### NITS

- **Nit:** The activity-log claims about “full suite green” / “drift check green” are not substantiated by any command output in the diff. That is not a blocking code defect, but it is still an unproven claim from the material in front of us.