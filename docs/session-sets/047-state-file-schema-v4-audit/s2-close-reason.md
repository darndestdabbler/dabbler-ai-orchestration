# Set 047 Session 2 — Close-out reason and manual-verify attestation

## Close-out reason

Session 2 is the reader-first phase of the v4 schema migration per the
Session-1 audit verdict (Group A4). It ships:

- `normalize_to_v4_shape(state, spec_md_path)` in `ai_router/progress.py`
  — pure-function shim accepting v1/v2/v3/v4 input, returning a v4
  read-view dict.
- `normalizeToV4Shape(state, specMdPath)` in
  `tools/dabbler-ai-orchestration/src/utils/progress.ts` — TS mirror.
- Reader routing: `read_progress` (Python) and `readProgress` (TS)
  internally normalize through the shim; `readSessionSets` in
  `fileSystem.ts` pipes the raw parsed JSON through `normalizeToV4Shape`
  so v4 files (per-session metadata only) read identically to v3 files.
  The v2-compat events-ledger merge is hoisted ABOVE the normalize
  call so it operates on the raw dict (since normalize guarantees
  `sessions[]` on the output, the post-normalize merge would never
  fire). The `needsMigration` detector reads `rawSd.schemaVersion`,
  not the normalized `sd`, so the v2 / broken-v3 signals stay honest
  after the shim bumps the in-memory dict to schemaVersion 4.
- Unit tests: 32 Python + 31 TS (covering v3-in / v4-in / v2-in /
  errors / pure-function guarantee / routing through shim / verifier-
  flagged regressions / idempotence).
- `readSessionSets()` perf benchmark establishing baseline:
  mean=21.8ms p50=21.2ms p95=32.5ms max=32.5ms over 47 sets × 20 iters.

The shim is the canonical reader path for Sessions 4-5 forward: every
reader goes through it so the write side and the read side can evolve
independently. The migrator (Session 3) and the writer flip (Sessions
4-5) both depend on this contract.

## Cross-provider verification

Routed verification via `python docs/session-sets/047-state-file-schema-v4-audit/run_s2_verification.py`
against `task_type='session-verification'` (gpt-5-4, tier 3). Two
rounds:

- **Round 1** — gpt-5-4 (tier 3), 215s, $0.258. Verdict:
  **ISSUES_FOUND** with 3 must-fix items:
  1. Per-session `status` aliases (`"completed"` / `"done"`) not
     canonicalized in the shim before downstream derivation reads
     them. Bug: a hand-edited "completed" session would not appear
     in derived `completedSessions[]`.
  2. Top-level `startedAt` lost on v3 between-sessions / all-complete
     snapshots (no in-progress session to receive promotion); v4
     derivation fallback scanned from start of `sessions[]` (returns
     session 1's startedAt) instead of the most-recently-completed
     session.
  3. `needsMigration` should flag raw v3 files (verifier's reading
     of my own contract property 3).
- **Round 2** — gpt-5-4 (tier 3), 187s, $0.226. Verdict:
  **ISSUES_FOUND** — Issues 1 and 2 confirmed resolved; Issue 3 still
  flagged. Decision: keep deferral, document rationale (see below).

**Total S2 routed cost: $0.484** ($0.594 cumulative S1+S2 of $10 NTE; 5.9%).

### Disposition of verifier issues

- **Issue 1 (per-session status alias canonicalization) — FIXED.**
  Added a `canonicalize_status` call inside the shim's per-session
  build loop in both Python (`ai_router/progress.py` ~line 385) and
  TypeScript (`tools/dabbler-ai-orchestration/src/utils/progress.ts`
  ~line 306). Regression tests cover v3 with `"completed"` and
  `"done"` aliases (Python `TestVerifierFix1PerSessionStatusAliasesCanonicalized`,
  TS `verifier fix 1` suite).
- **Issue 2 (`startedAt` promotion + derivation) — FIXED.**
  Python and TS now promote top-level `startedAt` to the most-recently-
  completed session when there is no in-progress session, and derive
  the top-level `startedAt` from the most-recently-completed session
  (scanning `completedV4` in reverse) instead of the first session
  with any startedAt. Regression tests cover both (`TestVerifierFix2StartedAtPromotionAndDerivation`,
  TS `verifier fix 2` suite).
- **Issue 3 (v3→v4 `needsMigration` flag) — DEFERRED to Session 3
  (migrator phase), intentionally and with documented rationale.**
  The `dabblerSessionSets.migrate` command and its Action Registry
  entry are hardwired to "Migrate to v3 schema" (see
  [`commands/migrateSet.ts:70`](../../../tools/dabbler-ai-orchestration/src/commands/migrateSet.ts)
  and [`providers/ActionRegistry.ts:75`](../../../tools/dabbler-ai-orchestration/src/providers/ActionRegistry.ts)).
  Flipping `needsMigration` to flag v3 files now (Session 2) would
  surface the badge on 47+ historical sets where the only available
  action is a CTA pointing at the WRONG migrator (v2→v3, which has
  nothing to do for a v3 file — see the `set.needsMigration`
  early-return in `migrateSet.ts:76`). The verifier's reading is
  technically correct on my own ambiguous contract property 3
  wording, but ships broken UX. The badge + CTA expansion belongs
  with the v3→v4 migrator in Session 3.

  Code comment captures the deferral and the rationale at
  `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` (above the
  `needsMigration` detector block).

### Verifier nice-to-have (incorporated)

The verifier requested explicit idempotence tests for
`normalize(normalize(x)) == normalize(x)`. Three were added to each
language (Python `TestVerifierNiceToHaveIdempotence`, TS
`idempotence` suite) covering v3 input, v4 input, and passthrough-
field preservation. All pass.

## Test posture

- **Python**: 850 passed (818 baseline + 32 new shim tests) +
  1 skipped (pre-existing). Zero regressions. Plus 8 pytest e2e
  marker tests + 11 ai_router/tests/e2e tests pass cleanly.
- **TypeScript**: 563 passed (553 baseline + 10 baseline shim tests
  + 9 regression + 1 perf benchmark). 2 failures unchanged from the
  pre-S2 baseline (`configEditor-foundation` ViewColumn stub issue;
  `notificationsSection` disabled-button assertion). Both last-touched
  in Set 026 (2 weeks ago); unrelated to this session's changes.
- **Perf baseline**: `readSessionSets(47 sets) × 20`: mean=21.8ms,
  p50=21.2ms, p95=32.5ms, max=32.5ms. Test asserts `p95 < 5000ms` as
  the regression guard.

## What ships in this commit

- `ai_router/progress.py` — `normalize_to_v4_shape` + `SCHEMA_VERSION_V4`
  constant + `read_progress` routing through the shim + per-session
  status canonicalization + startedAt promotion/derivation fixes.
- `tools/dabbler-ai-orchestration/src/utils/progress.ts` — TS mirror
  of the Python shim.
- `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` — `readSessionSets`
  routed through normalize; v2-compat ledger merge hoisted above the
  normalize call; `needsMigration` reads `rawSd.schemaVersion` with
  deferral comment for v3→v4 expansion.
- `ai_router/tests/test_normalize_v4_shape.py` — 32 unit tests
  (10 v3, 4 v4, 2 v2, 3 errors, 3 routing, 3 fix1 regression,
  3 fix2 regression, 3 idempotence).
- `tools/dabbler-ai-orchestration/src/test/suite/normalizeV4Shape.test.ts`
  — 31 TS unit tests mirroring the Python coverage.
- `tools/dabbler-ai-orchestration/src/test/suite/readSessionSetsPerfBenchmark.test.ts`
  — perf benchmark with baseline + regression guard.
- `docs/session-sets/047-state-file-schema-v4-audit/s2-verification-prompt.md`
  — the verification prompt.
- `docs/session-sets/047-state-file-schema-v4-audit/run_s2_verification.py`
  — the verification driver (corrected to use the right
  `RouteResult.content` attribute per memory
  `feedback_ai_router_route_result_handling`).
- `docs/session-sets/047-state-file-schema-v4-audit/s2-verification-result.json`
  — Round-2 cost / timing meta.
- `docs/session-sets/047-state-file-schema-v4-audit/s2-verification-transcript.md`
  — Round-2 transcript (lists the deferred Issue 3 only; Issues 1
  and 2 confirmed resolved).
- `docs/session-sets/047-state-file-schema-v4-audit/activity-log.json`
  with Session 2 steps.
- `docs/session-sets/047-state-file-schema-v4-audit/session-state.json`
  flipped to closed-for-S2 (currentSession unchanged, completedSessions
  appended with 2, status remains "in-progress" since this is mid-arc).
- `docs/session-sets/047-state-file-schema-v4-audit/session-events.jsonl`
  with the `closeout_succeeded` event.
- `docs/session-sets/047-state-file-schema-v4-audit/disposition.json`
  pointing at Session 3 with the next-orchestrator block.
