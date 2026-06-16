# ISSUES FOUND

## Issue 1:
- **Category:** Verification Evidence / Honest Status
- **Severity:** Major
- **Issue:** `path-aware-critique.json` is still not a post-fix artifact for the final tree. Its first finding says the schema is missing the `provenanceComplete=true -> pushUnkeyed=0 && pullUnkeyed=0` constraint, but this staged diff adds exactly that `if/then` rule to `docs/dual-surface-comparison.schema.json`. So the committed critique predates the final schema fix and cannot honestly serve as the final gate artifact for this tree.
- **Location:** `docs/session-sets/070-dual-surface-verification-telemetry/path-aware-critique.json`
- **Fix:** Rerun the path-aware critique on the final post-fix tree and replace `path-aware-critique.json` with that result, or relabel the current file as another pre-fix/intermediate dogfood artifact instead of final gate evidence.

## Issue 2:
- **Category:** Telemetry Integrity / Correctness
- **Severity:** Major
- **Issue:** The equal-arms scoring guard still trusts self-asserted booleans instead of verifying the recorded arm identities/framing. `_arms_held_equal()` accepts any artifact whose `attestation` contains the four booleans set to literal `true`, even if the artifact omits `pushProvider`/`pullProvider`/`pushModel`/`pullModel`/framing details entirely or those raw fields would disagree. That means scoreability is still based on an unverified claim, not on “measured from each arm's actually-reported identity” as the design/docs say. The new tests codify this weaker contract: `_equal_arms_attestation()` returns only the four booleans, and `test_held_equal_artifact_still_scores` proves such an artifact is accepted.
- **Location:**  
  - `ai_router/dual_surface_verify.py` — `_arms_held_equal`, `score_comparison`, `score_against_benchmark`  
  - `ai_router/tests/test_dual_surface_s2.py` — `_equal_arms_attestation`, `TestEqualArmsGuardOnScoring.test_held_equal_artifact_still_scores`
- **Fix:** Make scoreability depend on raw recorded evidence, not derived booleans alone: require per-arm provider/model/framing fields in `attestation`, recompute equality/adversariality from those fields in the scorer or validator, and reject artifacts that only assert `providerEqual`/`modelEqual`/`framingEqual`/`bothAdversarial` without the underlying arm identities.