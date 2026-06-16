# ISSUES FOUND

## Issue 1:
- **Category:** Documentation Accuracy / Contract Drift
- **Severity:** Minor
- **Issue:** The R4 equal-arms fix is implemented correctly in code, but its shipped contract description is still stale. `_arms_held_equal()` no longer requires or compares `requestedProvider` / `requestedModel`; it re-derives scoreability only from `pushProvider` vs `pullProvider`, `pushModel` vs `pullModel`, and the two framing strengths. However, both the function docstring and the set change-log still say the scorer "requires" the requested fields and/or treats divergence across the requested+actual triple as disqualifying. That is now false and misstates what artifacts are scoreable.
- **Location:**  
  - `ai_router/dual_surface_verify.py` — `_arms_held_equal()` docstring (`requestedProvider`/`requestedModel` still described as required inputs to the re-derivation)  
  - `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md` — Session 3, “Dogfood findings”, item 1
- **Fix:** Update both descriptions to match the shipped guard: equality is re-derived from `pushProvider`/`pullProvider`, `pushModel`/`pullModel`, and `pushFraming`/`pullFraming.strength`; `requestedProvider` / `requestedModel` are provenance-only and are not consulted by the scorer. If those requested fields are intended to remain mandatory provenance, enforce that in `_arms_held_equal()` and add a regression test for their absence.