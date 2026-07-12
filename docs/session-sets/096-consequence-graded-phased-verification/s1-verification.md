# ISSUES FOUND

- **Issue 1:** The ledger declares prior findings settled without evidence that they were remediated or adjudicated
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A normal round-2 verification follows a findings-bearing round where one issue was overlooked or incompletely remediated and no sidecar was written. This is probable because later rounds exist specifically to validate remediation, while `run()` neither requires a sidecar nor checks resolution metadata. The generated prompt nevertheless tells the verifier that the unresolved finding is settled and that raising it again is a review error, creating a likely false-negative on the verification machinery’s main path.
  - **Details:**
    - **Violation:** `assemble_cross_round_ledger()` states, “Every entry below is SETTLED: remediated or adjudicated” and “re-raising one … is a review error,” but the only required input is the existence of a prior `sN-issues*.json` artifact. Such an artifact proves that a finding was reported, not that it was settled.
    - **Impact:** An unchanged blocking defect can be suppressed in the next verification round. That directly undermines the deliverable’s objective of reliable cross-round verification and should block merging.
    - **Evidence:** `assemble_cross_round_ledger()` unconditionally applies the settled/no-resurrection header whenever an issues artifact contributes lines. It does not inspect `resolution_status`, require a non-empty remediation sidecar, or otherwise establish disposition. Tests such as `test_no_resurrection_framing_present` deliberately exercise an issues artifact without a sidecar and still expect the settled framing. The remediation exception does not correct the false assertion when no remediation exists at all.
    - **Location:** `ai_router/verify_session.py` — `assemble_cross_round_ledger()`; `ai_router/tests/test_verify_session.py` — `TestCrossRoundLedger`.
    - **Fix:** Fail closed when a findings-bearing prior round lacks settlement evidence. Require a non-empty remediation/adjudication sidecar or structured resolution status before applying no-resurrection framing; otherwise mark the finding unresolved and instruct the verifier to re-evaluate it, or refuse to route the next round.

## NITS

- **Nit:** `docs/session-issues.schema.json` still says the issues artifact “has no runtime reader in the orchestration layer,” but `verify_session.assemble_cross_round_ledger()` now reads it at runtime to construct prompts. Update the schema documentation to describe this compatibility-sensitive consumer.
- **Nit:** `s1-fanout-experiment.md` justifies rejecting K=3 as “+$0.25 for +1 finding here,” but that marginal is specific to choosing runs a and b as the first pair. Since the three identical-model runs are exchangeable, the third-run marginal across possible pairs is 1, 5, or 3 findings—an average of 3, consistent with the memo’s own 81% mean K=2 coverage. The K=2 recommendation may remain reasonable, but its sizing rationale should distinguish chronological yield from expected marginal yield.