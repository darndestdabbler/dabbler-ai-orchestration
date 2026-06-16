# ISSUES FOUND

## Issue 1:
- **Category:** Correctness / Equal-Arms Guard
- **Severity:** Medium
- **Issue:** `_arms_held_equal()` is not only checking whether the two executed arms were held equal; it also requires the **requested** provider/model to exactly match both executed-arm identities. That is stricter than the documented contract (“held equal across arms”, “measured from each arm’s actual reported identity”) and can false-reject a legitimately held-equal artifact if both arms resolve to the same canonicalized/fallback provider/model but not the literal request string.
- **Location:** `ai_router/dual_surface_verify.py` — `_arms_held_equal()` provider/model comparisons against `requestedProvider` / `requestedModel`; related contract text in `ai_router/docs/pull-verifier.md` and `docs/verification-surface-strategy.md` §5.2.
- **Fix:** Gate scoreability on **actual arm equality** (`pushProvider == pullProvider`, `pushModel == pullModel`, equal adversarial framing). If request/actual drift should also make telemetry unscoreable, document that explicitly everywhere and add a regression test for the canonicalized-alias case.

## Issue 2:
- **Category:** Schema / Validator Parity
- **Severity:** Major
- **Issue:** The `provenanceComplete` parity fix is still incomplete, and the “schema cannot express the remaining half” adjudication is incorrect. The schema now rejects `provenanceComplete=true` with nonzero `pushUnkeyed`/`pullUnkeyed`, but it still accepts `provenanceComplete=true` with an unkeyed finding (`defectKey: ""`) as long as the counts are zero. JSON Schema **can** express “no finding may be unkeyed” here via `not` + `contains`, so schema-only consumers still accept an artifact the Python validator rejects.
- **Location:** `docs/dual-surface-comparison.schema.json` — top-level `allOf` / `if`-`then`; comments/descriptions claiming the “no unkeyed finding” half is runtime-only; mirrored claim in `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md`.
- **Fix:** Extend the same `then` branch with a schema rule that forbids `findings` containing an item whose `defectKey` is `""` when `provenanceComplete` is `true`, and add a parity test covering that case.