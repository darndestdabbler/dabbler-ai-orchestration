ISSUES FOUND

- **Issue 1:** Bare `close` is accepted as `Close-out`, so a non-close-out final work step can satisfy the skeleton.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/spec_admission.py:195-203`, `ai_router/spec_admission.py:280-338`, `docs/planning/session-set-authoring-guide.md:180-190`
  - **Failure scenario:** A future unstarted spec ends with `Close the tracking issue.` or `Close remaining docs.` after the verification and suite steps. Because `_INTENT_RE[CLOSE_OUT]` matches bare `close`, `check_step_shape()` treats that final work item as the required close-out stage and the spec passes without declaring close-out. That is probable because “close” is common AI/operator prose, and this set exists specifically because orchestrators followed spec wording over the higher-level workflow.
  - **Acceptance criterion:** `JUDGMENT - A reviewer must see close-out recognition distinguish actual close-out/session-close intent from arbitrary bare "close" usage, with a falsifier where a spec ending in "Close the tracking issue." fails while "Close out." and the Set 127 compressed step still fail/pass as intended.`
  - **Details:** **Violation:** the guide requires the final baked-in step to be **“Close-out”** and says every session declares those ceremony steps. **Impact:** the new gate can provide a false all-clear for a spec that omits the close-out step, undermining the skeleton it is meant to enforce. **Evidence:** the close-out regex includes `clos(?:e|...)`, so any bare `close` token is enough; the tail checker only asks whether the expected intent appears.

NITS

- **Nit:** `CONFORMING` in `test_spec_admission_shape.py` has only six steps despite `test_a_conforming_spec_at_the_budget_passes` claiming “Three work steps plus the four baked-in ones.” That misses the exact at-budget positive boundary, though it does not by itself prove product behavior is wrong.