ISSUES FOUND

- **Issue 1: Discovery does not implement the required raised output budget**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A finding-dense Full-tier session—the intended workload for exhaustive discovery—produces a response larger than the unchanged verifier output limit. This is probable because discovery explicitly requests every defect at every severity and was introduced for corpora like Set 095 with dozens of findings. A truncated first call makes verification unavailable; a truncated sibling silently reduces the measured K=2 harvest, materially defeating exhaustive discovery.
  - **Details:**
    - **Violation:** The task requires discovery with “**exhaustive enumeration framing, all severities, raised output budget**.” The implementation raises only `complexity_hint` to 85; that is routing/model-selection input, not an output-token budget.
    - **Impact:** The principal discovery mode can fail or lose fan-out coverage on exactly the large, finding-heavy sessions it is intended to handle. Since truncation is correctly treated as invalid evidence, this can prevent mandatory verification from completing and changes the merge decision.
    - **Evidence:** `ai_router/verify_session.py` adds `PHASE_COMPLEXITY_HINT` and passes it to `route_fn`, whose invocation has no output-budget argument. The only new verification configuration is `fan_out` and `provider_diversity`; no generation/output-token setting was added. Tests assert complexity 85 but contain no assertion that the output cap increases.
    - **Location:** `ai_router/verify_session.py` phase configuration and `_route_once`; `ai_router/router-config.yaml`; `ai_router/tests/test_verify_session_phases.py`.
    - **Fix:** Add a phase-specific output-token budget through the router’s generation-parameter path, set discovery above the classic limit, and test that discovery propagates the raised cap while no-phase behavior retains its existing budget.

#### NITS

- **Nit:** `ai_router/verification.py::parse_fix_verdicts` and `docs/session-issues-schema.md` still call fix verdicts “observability-only” and claim blocking reads only restated Issue blocks. `verify_session.run()` now directly synthesizes blockers from `fix-rejected` verdicts and incomplete coverage. Update those descriptions to match runtime behavior.
- **Nit:** `provider_diversity: same-model` does not pin fan-out calls to the same model; it merely repeats identical routing requests. Either enforce the first selected model for sibling calls or document this as a routing preference rather than an invariant.
