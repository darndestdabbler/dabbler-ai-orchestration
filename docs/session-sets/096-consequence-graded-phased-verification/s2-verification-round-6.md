ISSUES FOUND

- **Issue 1:** The convergence replay does not substantiate the required materially lower-cost falsifier
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The phased loop is accepted as empirically demonstrating substantially cheaper convergence for normal, initially defective sessions. Those sessions begin before remediation, but the replay begins after all 39 Set 095 Majors were already fixed and processes only five latent findings plus one fix-induced defect. Because this workload mismatch affects the normal use case, the claimed 17-round/$4.88 to 4-round/$0.85 improvement may reflect the easier starting state rather than the phased loop.
  - **Details:**
    - **Violation:** The task requires “the Set 095 corpus replay demonstrating convergence … at materially lower cost” and calls it “the set’s falsifier.” The delivered artifacts continue to describe the replay as that falsifier and compare its cost directly with the Set 095 baseline.
    - **Impact:** The set’s central empirical acceptance criterion remains unproven. A reasonable reviewer cannot attribute the reported cost reduction to the phased design, which changes the merge decision for a release justified by that experiment.
    - **Evidence:** `s2-convergence-replay.md` states that it starts at `b16dd58`, where “all 39 remediated Majors are fixed,” and explicitly concedes that it is not a defect-for-defect A/B. Nevertheless, `change-log.md` and `ai_router/CHANGELOG.md` still present 4 rounds/$0.85 versus 17 rounds/$4.88 as the set’s lower-cost falsifier. Qualifications accurately describe the limitation but do not supply the missing comparative evidence.
    - **Location:** `docs/session-sets/096-consequence-graded-phased-verification/s2-convergence-replay.md`, `change-log.md`, and `ai_router/CHANGELOG.md`.
    - **Fix:** Replay from an equivalent pre-remediation Set 095 state and preserve the rounds/cost evidence, or characterize the existing run only as an end-to-end machinery demonstration and acknowledge that the required comparative-cost falsifier remains incomplete.

#### NITS

- **Nit:** The requested “raised output budget” is not visibly implemented. Phased calls raise `complexity_hint` to 85, but neither `verify_session.py` nor the added configuration changes an output-token budget. The live runs happened to fit, so the demonstrated consequence is currently minor.
- **Nit:** `provider_diversity: same-model` does not enforce same-model discovery. Fan-out calls independently invoke the router with identical arguments but are not pinned to the first call’s model; routing or availability changes can select another model.
- **Nit:** Documentation says `fixVerdicts` are “observability-only” and never affect blocking, while `verify_session.run()` directly synthesizes blockers from `fix-rejected` verdicts and incomplete coverage. Update `verification.py`’s docstring and `docs/session-issues-schema.md`.
- **Nit:** The claimed exact ledger-ID coverage has an id-less count fallback. Two id-less verdicts can satisfy two required IDs even if they concern the same finding, so this path is count-checked rather than per-finding machine-checked.