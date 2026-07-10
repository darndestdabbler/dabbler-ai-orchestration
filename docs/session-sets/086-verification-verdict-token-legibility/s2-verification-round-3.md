## Issue 1 → Location → Fix

**Issue** → `diagnostics_summary()` is not actually “always safe”; a malformed-but-truthy `transport_metadata` (or non-string `raw_stderr`) can raise inside the new error-surfacing path and mask the original transport failure.

**Location** → `ai_router/transport_diagnostics.py`
- `build_record()`: `md = getattr(result, "transport_metadata", None) or {}` followed by `md.get(...)`
- `diagnostics_summary()`: same pattern, but **without** the protective `try/except` that `emit_diagnostics()` has
- Callers that would be masked: `ai_router/__init__.py` at the generator raise site in `_route_via_copilot_cli()` and the verifier failure summary in `_run_verification_via_copilot_cli()`

**Fix** → Harden the summary/build helpers to treat non-mapping metadata as `{}` and coerce stderr to string before scrubbing/capping.
- Replace `md = getattr(... ) or {}` with a mapping check, e.g. `md = raw_md if isinstance(raw_md, Mapping) else {}`
- Normalize `raw_stderr` defensively (`str(...)` or `""` for non-string values)
- Add tests proving `diagnostics_summary()` and `build_record()` do **not** raise for:
  - `transport_metadata=5`
  - `transport_metadata=[]`
  - `raw_stderr=b"..."`
  
This is the remaining “mask the original failure” hole on the new diagnostics path.

---

## Issue 2 → Location → Fix

**Issue** → The reader-side verdict guardrail is too permissive: it treats any token starting with `VERIFIED`, `ISSUES_FOUND`, or `WAIVED` as “recognized”, so obvious confabulated look-alikes like `VERIFIED_NOT_REALLY` still render as clean verdicts instead of being flagged.

**Location** → `tools/dabbler-ai-orchestration/src/utils/tierLegibility.ts`
- `isRecognizedVerdictToken(...)` (mirrored in `tools/dabbler-ai-orchestration/dist/extension.js` as `RECOGNIZED_VERDICT_PREFIXES.some(...startsWith(...))`)
- Consumed by `verdictFractionTooltip(...)` in `tools/dabbler-ai-orchestration/src/providers/SessionSetsModel.ts`

**Fix** → Narrow recognition to the actual shipped vocabulary instead of unrestricted prefix matches.
- Use an explicit allowlist for:
  - `VERIFIED`
  - `ISSUES_FOUND`
  - `WAIVED`
  - `ISSUES_FOUND_RESOLVED_IN_FLIGHT`
- If forward-compatibility is required, use an explicit registry of allowed extension tokens/prefixes rather than unconditional `startsWith` on canonical verdicts
- Add tests that `VERIFIED_NOT_REALLY` and `WAIVED_NOT_REALLY` are flagged as unrecognized

As implemented, the tooltip still launders a class of bogus verdict strings the guardrail is supposed to make visibly suspect.