<!-- Routed review of proposal.md. Model: gemini-3.1-pro-preview. Commissioned by the operator during Set 128 Session 2, 2026-08-12. Saved raw: this is paid analysis and is never edited after the fact. -->

# Design Proposal Analysis: Multi-Module Retesting Rules

## 1. Fit Assessment

**Confidence Level: High (90%)**

*   **Existing Machinery Fit:** The proposal's concept of content-hash affected-set computation perfectly maps to `ai_router/run_of_record.py`'s `surface_digest()` and `session_touched()` functions. The concept of input sets corresponds directly to the `covers` and `tests` path prefix tuples in the `SuiteSpec` dataclass. The concept of identifying what changed directly maps to `_changed_paths_since()` and `classify_delta()` in `ai_router/post_round_delta.py`.
*   **Genuinely New Machinery:** Establishing an explicit, machine-readable dependency graph (Invariant I3), enforcing boundary imports via linting (Invariant I5), and tiering E2E suites (Section 7's Smoke vs. Full tiers) represent genuinely new concepts not present in the current test-run policy.
*   **Poor Fit / Premature:** The entire Mock Drift and Contract Locking apparatus (Section 6) is premature and a poor fit. This repo has exactly *one* module in practice, and its test suites (pytest, mocha, Playwright) do not utilize leaf/integration mock boundaries. Building complex provider-side contract verification logic into the core framework violates the "Prefer removal over addition" principle and the universal core portability rule for an architecture that doesn't exist here.

## 2. The Honest Disagreements

**Confidence Level: Critical (100%)**

*   **The "Provably Redundant" Claim is WRONG and Unsafe:** The proposal asserts in Section 5 that "A deterministic test suite is a pure function of its inputs... Skipping... is provably redundant work being removed." This is dangerously naive. Tests are not pure functions; they are subject to time-dependence, network state, environment configurations, file descriptors, and test runner flakiness. More importantly, in this codebase, `covers` is a *path prefix list*, not a true AST-derived dependency graph. Undocumented coupling, global state modifications, or shared environment variables outside of the explicitly mapped `covers` can easily break a suite. Skipping a suite is *always* a risk trade-off, trading CI duration for the risk of shipping a side-effect defect.
*   **Over-engineered Contract Machinery:** Section 6 (Locking, Mocks, Provider-side verification) is vastly over-engineered for the framework core. Because consumer repos might not adopt a leaf/integration contract architecture, imposing contract hashing and mock-drift orchestration on `verify_session.py` or `run_of_record.py` will force consumer repos into a rigid paradigm they don't need, violating the "universal core" mandate.
*   **Integration Events vs. Session Workflow:** Section 8 dictates moving E2E runs to the "Integration event". While logically sound for parallel multi-module teams, it fundamentally conflicts with the established Step 8 close-out gate (`ai_router/gate_checks.py::check_test_run_fresh`), which requires a fresh full run *per session* to prevent stranding a stale verdict.

## 3. The Minimal Viable Subset

**Confidence Level: High (95%)**

If we adopt exactly one session's worth of work, we must strictly target the open question **A5** from `docs/planning/session-step-skeleton-and-verification-cost.md` ("how 'the required portion' resolves per module").

**Specific Data-Structure / API Change to `ai_router/run_of_record.py`:**
We expand `SuiteSpec` to allow module scoping, answering A5.1 and A5.2 while fully respecting the portability rule (defaulting to `None` keeps current global behavior intact).

```python
@dataclass(frozen=True)
class SuiteSpec:
    name: str
    command: str
    covers: Tuple[str, ...]
    expensive: bool = False
    tests: Tuple[str, ...] = ()
    # NEW DATA:
    module: Optional[str] = None  # Maps to the docs/modules.yaml tier
```
**API Change:** Update `def session_touched(...)` to accept a new `active_module: Optional[str] = None` parameter. The function will intersect the session's active module against `SuiteSpec.module`. If a suite belongs to module X, a session in module Y does not owe it, even if a shared global surface was incidentally touched.

## 4. What Must NOT Be Adopted (and Deferral Triggers)

*   **Do NOT Adopt:** Section 6 (Contract locking, mock pinning, provider-side test cascades) and Section 3's Invariants I3-I5 (mechanical import boundaries/linting).
*   **Deferral Trigger Condition:** Defer all mock-drift and contract-locking architecture *until* a consumer repo explicitly implements a leaf/integration module split that suffers a documented mock-drift production defect, AND that repo implements its own machine-readable dependency graph. It must be built as a gated extension, not in the universal core.

## 5. Decomposition

If forced to adopt the viable parts of this proposal into a 3-session set, it should look like this:

**Session 1: Module-aware Suite Obligation (Answers A5.1 & A5.2)**
*   **Step 1:** Update `SuiteSpec` in `ai_router/run_of_record.py` to include `module: Optional[str] = None`, and adapt `load_suites` to parse it from configuration.
*   **Step 2:** Update `run_of_record.py::session_touched` to intersect the session's `docs/modules.yaml` assignment against the suite's module.
*   **Step 3:** Write falsifier tests demonstrating that a session touching a shared path fails open (owes the suite) unless explicitly isolated by module boundaries.

**Session 2: Focused Remediation Scoping (Answers A5.3)**
*   **Step 1:** Update `ai_router/post_round_delta.py` (`classify_delta`) to constrain the A4.2 "targeted/focused remediation-review" strictly to the active module's diff.
*   **Step 2:** Ensure `verify_session.py` with `--phase remediation-review` respects the module boundaries, avoiding open re-verification for isolated module code fixes.

**Session 3: E2E Tiering (Adopts Section 7 & 8 practically)**
*   **Step 1:** Add an `is_e2e: bool = False` flag to `SuiteSpec` to differentiate standard expensive suites from cross-module integration suites.
*   **Step 2:** Update `ai_router/gate_checks.py::check_test_run_fresh` to enforce the "Smoke tier" locally but explicitly permit deferring the "Full tier" to the final merge (Integration Event).

## 6. Risks and Failure Modes

**Confidence Level: High (95%)**

1.  **Risk 1 (Critical): False-Negative Test Skips (Silent Defect Shipping)**
    *   *Scenario:* A session modifies a shared database schema, a global library, or an environment config that is *not* perfectly mapped to `covers` (violating Invariant I4). Because the diff falls outside the rigid path prefix, `session_touched` skips the dependent suite. The build ships a side-effect defect because the risk trade-off was mistaken for "provably redundant work."
2.  **Risk 2 (High): The E2E Gate Loophole**
    *   *Scenario:* Session 3 introduces E2E deferral to the "Integration Event" (merge). A session modifies Leaf A and bypasses E2E locally. The UAT step (Layer 3) is then executed against a system that hasn't run the full integration suite, completely destroying the evidentiary value of the operator's UAT walk because it was tested against unverified integration points.
3.  **Risk 3 (Medium): Portability Fracture via Over-engineering**
    *   *Scenario:* Contract locking (Section 6) is prematurely implemented in `run_of_record.py`. A standard single-module consumer repo upgrades the orchestrator package and fails the `check_test_run_fresh` gate because it lacks `docs/modules.yaml` or pinned mocks, forcing the consumer to adopt phantom scaffolding to pass a gate meant for an AI designed for a different architecture.
