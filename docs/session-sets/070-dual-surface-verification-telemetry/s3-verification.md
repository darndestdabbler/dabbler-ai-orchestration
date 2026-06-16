# ISSUES FOUND

## Issue 1:
- **Category:** Honest Telemetry Status
- **Severity:** High
- **Issue:** The docs claim Set 070 has already been **dogfooded over this set’s own diff** and that the first `dual-surface-comparison.json` datapoint exists, but the session is still open in this diff and the closeout/dogfood artifacts are not present. That overstates the as-built telemetry state.
- **Location:**  
  - `docs/verification-surface-strategy.md` §5.2 (`"dogfooded over this set's own diff"`, recorded `dualSurfaceMode: opt-in`, `dual-surface-comparison.json`)  
  - `ai_router/docs/pull-verifier.md` final paragraph (`"built + dogfooded"`)  
  - `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md` Session 3 Dogfood bullet, Telemetry status section, End-of-set deliverables table
- **Fix:** Change these claims to future/pending tense until close actually runs, or stage the actual dogfood artifacts and closeout metadata in the same change before claiming dogfood completed.

## Issue 2:
- **Category:** Release / Status Correctness
- **Severity:** High
- **Issue:** The change-log says Session 3 is **CLOSED, VERIFIED** and that `ai_router` **0.24.0 was published to PyPI**, but this diff only shows the version bump plus in-progress session metadata. Per the stated release contract, publish is operator-gated later on the tagged SHA, so these claims are premature.
- **Location:**  
  - `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md` header (`"Release: ai_router 0.24.0 (PyPI)"`), Session 3 status line, Release bullet (`"published to PyPI per the runbook"`)  
  - Contradicted by `docs/session-sets/070-dual-surface-verification-telemetry/session-state.json` (`"status": "in-progress"`) and `session-events.jsonl` (only `work_started` for S3)
- **Fix:** Reword to “version bumped for 0.24.0 release” / “prepared for PyPI publish,” and leave Session 3 open until closeout + operator publish actually complete; or include the close/publish artifacts if this commit is meant to represent post-close state.

## Issue 3:
- **Category:** Internal Consistency / Scope Framing
- **Severity:** Medium
- **Issue:** The docs say that absent `dualSurfaceMode`, **“every existing flow” is byte-for-byte unchanged**, but Set 070 also intentionally changed the standing push-verification prompt (`verification.md`) to strong adversarial framing. The dual-surface mode may be additive, but the set as shipped is not behaviorally unchanged for the existing push verifier.
- **Location:**  
  - `ai_router/docs/pull-verifier.md` final paragraph  
  - `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md` intro paragraph
- **Fix:** Narrow the claim to the new mode only, e.g. “the dual-surface mode is additive; existing non-dual-surface code paths are unchanged,” while separately acknowledging that the standard push verification prompt itself now runs with stronger framing.