# Set 047 Session 2 — Cross-provider verification prompt

This prompt verifies the reader-first phase deliverables for the v4
schema migration. The session ships:

1. `normalize_to_v4_shape(state, spec_md_path)` in `ai_router/progress.py`
   — Python shim that accepts v1/v2/v3/v4 input and returns a v4
   read-view dict.
2. `normalizeToV4Shape(state, specMdPath)` in
   `tools/dabbler-ai-orchestration/src/utils/progress.ts` — TS mirror.
3. `readSessionSets()` in
   `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` updated to
   route the raw parsed JSON through `normalizeToV4Shape` so v4-shaped
   files (per-session metadata only) read identically to v3 files.
4. `read_progress` (Python) and `readProgress` (TS) updated to route
   internally through the shim.
5. 23 Python unit tests + 22 TS unit tests covering v3-in / v4-in /
   v2-in / errors / pure-function guarantee / routing through shim.
6. `readSessionSets()` perf benchmark: baseline
   mean=21.8ms p50=21.2ms p95=32.5ms max=32.5ms over 47 sets × 20 iters.

## Contract under verification

The shim is a PURE transformation function with these invariants:

- **v4 sessions[] structural shape preserved.** Each session entry has
  `number`, `title`, `status`, plus defaulted-to-null `startedAt`,
  `completedAt`, `orchestrator`, `verificationVerdict`.
- **v3 input → v4**: top-level `orchestrator` / `startedAt` /
  `completedAt` / `verificationVerdict` are promoted onto the in-progress
  session (or, if none, the most-recently-completed session). The
  output's top-level fields are then re-derived from the per-session
  metadata so callers reading top-level fields get the expected values.
- **v4 input → v4**: per-session metadata is authoritative; the
  top-level fields are derived FROM per-session metadata. Stale
  top-level values on a v4 file are ignored (the shim does NOT
  overwrite per-session values with stale top-level junk).
- **No mutation**: caller's input dict survives unchanged (verified by
  unit tests).
- **Status canonicalization**: `"completed"` / `"done"` alias to
  `"complete"` per the existing convention.
- **Passthrough fields preserved**: `preCancelStatus` (cancellation
  reader) and `forceClosed` (force-closed badge) ride through unchanged.

## Specific properties the verifier should check

1. **Idempotence**: `normalize(normalize(x)) == normalize(x)` for all
   v3 and v4 inputs.
2. **Round-trip via readProgress**: a v3 file and the same data
   re-encoded as v4 (per-session metadata) produce identical
   `ProgressView` outputs from `read_progress` / `readProgress`.
3. **The v3 needsMigration detector still trips on v3 files** even
   after the shim has bumped the in-memory dict to schemaVersion 4.
   (Fix in fileSystem.ts: read `rawSd.schemaVersion`, not `sd`.)
4. **The v2-compat events-ledger merge still fires for legacy v2
   snapshots without `completedSessions[]`**. (Fix in fileSystem.ts:
   the merge is hoisted ABOVE the normalize call so it operates on
   `rawSd`, since the normalize output always has sessions[].)
5. **Top-level `status: "cancelled"` is preserved through normalize**
   (the cancellation reader contract depends on this).

## Files included for review

- `ai_router/progress.py` (around lines 31–62, 285–470 for the shim
  + the routing of `read_progress`)
- `tools/dabbler-ai-orchestration/src/utils/progress.ts` (around lines
  25–40 for SCHEMA_VERSION_V4, 220–400 for the shim + readProgress
  routing)
- `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` (around
  lines 53–80 for `isMidSetComplete` comment; lines 340–470 for the
  reader-routing changes in `readSessionSets`)
- `ai_router/tests/test_normalize_v4_shape.py` (full file)
- `tools/dabbler-ai-orchestration/src/test/suite/normalizeV4Shape.test.ts`
  (full file)
- `tools/dabbler-ai-orchestration/src/test/suite/readSessionSetsPerfBenchmark.test.ts`
  (full file)

## Verification verdict requested

Respond with one of:

- **VERIFIED** — the implementation matches the contract and the
  invariants are correctly enforced; no must-fix issues.
- **ISSUES_FOUND** — at least one issue that needs addressing before
  Session 3 ships the migrator. List each issue with file:line.

A list of suggested but non-blocking improvements is welcome under a
"Nice to have" section but should not gate VERIFIED.
