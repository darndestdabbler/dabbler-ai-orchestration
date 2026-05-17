# Set 030: Session-state v3 `sessions` ledger + terminology alignment

**Status:** In progress (3 of 5 sessions complete)
**Created:** 2026-05-17
**Cost so far:** $1.25 (Session 1: $0.28 Round A; Session 2: $0.27 Round A + $0.19 Round B; Session 3: $0.28 Round A + $0.23 Round B)

---

## Context

`session-state.json` v2 carries three independent progress fields
(`currentSession`, `totalSessions`, `completedSessions`) that drift
in real failure modes — most notably the ctelr-spec N-1/N display
drift (2026-05-12) and the fresh-set `completedSessions` schema gap
fixed in Set 028 Session 1.

Set 030 introduces schema v3 with a single canonical `sessions[]`
array. All summary values are derived from it. Phased migration
preserves backward compatibility through Phase 3, then drops legacy
field writes. Terminology unifies on "Complete" across the JSON
schema and the Session Set Explorer display (retiring "Done").

Origin: proposal at
`docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md`
authored by/with GPT-5.4, strong-approved by Gemini Pro.

---

## Session 1: Schema doc + `get_progress()` helper + v2-read synthesizer

**Status:** Complete (2026-05-17)
**Orchestrator:** Claude Opus 4.7 @ effort=high
**Verification:** gpt-5-4, $0.275525, found 6 issues — all addressed

### Shipped

1. **`ai_router/progress.py`** — canonical Python reader. Exports
   `get_progress()`, `synthesize_v3_from_v2()`,
   `validate_invariants()`, `canonicalize_status()`,
   `extract_session_titles_from_spec()`, plus `ProgressView` /
   `SessionRecord` dataclasses and the
   `SessionStateInvariantError(rule, message)` exception class.
2. **`ai_router/tests/test_progress.py`** — 48 pytest cases covering
   all 8 invariants, v3 happy paths, v2 read synthesis, edge cases
   (bool/float in v2 numbers, contiguous-from-1, session-level
   cancelled rejection, rule 8 fires without top-status,
   alias canonicalization).
3. **`tools/dabbler-ai-orchestration/src/utils/progress.ts`** —
   TypeScript mirror with the same API, same invariants, same
   default-to-not-started semantics.
4. **`tools/dabbler-ai-orchestration/src/types.ts`** — adds
   `SessionStatus`, `SessionRecord`, `ProgressView`,
   `SessionStateV3` interfaces.
5. **`tools/dabbler-ai-orchestration/src/test/suite/progress.test.ts`** —
   46 mocha cases mirroring the pytest coverage.
6. **`docs/session-state-schema.md`** — full rewrite for v3.
   Sections: shape, derived values, 8 invariants, status glossary,
   Lightweight-tier worked example (one-field-flip per transition),
   migration notes, reader contract, bucketing rules.
7. **`docs/session-state-schema-example.{json,md}`** — v3 closed-shape
   example + side-by-side v2-vs-v3 narrative.
8. **`docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md`** —
   patched two lingering `done` references (lines 139, 246) to
   `complete`; Revisions footer already documented the
   terminology-lock + GPT-5.4-revisions.
9. **`ai_router/router-config.yaml`** — registered
   `spec-title-extraction` task type per spec D14 (Session 5's AI
   fallback depends on it; landing in S1 removes a dependency risk).
   Pinned to `gemini-flash`, not auto-routed, not auto-verified.
10. **`ai_router/tests/test_spec_title_extraction_registered.py`** —
    6-test guard suite asserting the routing wiring stays correct.

### The 8 invariants (locked in code + doc)

1. `sessions[]` required and non-empty.
2. Numbers are positive ints, unique, **contiguous starting at 1**
   (tightened from "ascending" after Round A — per spec D12 "strict
   sequential invariant"). Session-level `"cancelled"` is rejected
   (reserved for a future schema).
3. At most one session in-progress.
4. Complete sessions form a contiguous prefix.
5. Top-level `"not-started"` requires every session to be
   `"not-started"`.
6. Top-level `"in-progress"` allows exactly one in-progress OR a
   between-sessions state (≥1 complete, ≥1 not-started, 0
   in-progress).
7. Top-level `"complete"` requires every session to be `"complete"`
   — synthesizer no longer papers over contradictions.
8. `lifecycleState: "closed"` pairs only with `"complete"` or
   `"cancelled"` top-level status. Rule 8 fires even when top-level
   status is absent.

### Round A verification fixes applied

gpt-5-4 verifier flagged 6 must-fix issues; all addressed:

1. **`synthesize_v3_from_v2()` force-promote removed.** Earlier
   draft promoted every session to complete when top-level status
   was `"complete"`. Now defaults stay `"not-started"` and the
   contradiction surfaces as rule 7 on `get_progress()`. "Fail
   loud, never silently recover" per spec D6.
2. **Strict-int filtering.** Python treats `bool` as `int`
   (`isinstance(True, int)` is `True`); both helpers now require
   `type(v) is int` (Python) / `Number.isInteger(v) && typeof v
   !== "boolean"` (TS) before using a v2 field for membership or
   status escalation. JS/Python divergence on `1.0` is documented.
3. **Rule 2 tightened to contiguous-from-1.** `[1, 3]` and `[2, 3]`
   are now rejected. Aligns code with spec D12.
4. **Session-level `"cancelled"` rejected.** `SESSION_STATUSES`
   tuple no longer includes `"cancelled"`; top-level
   `"cancelled"` is still accepted.
5. **Rule 8 always fires.** Hoisted above the `top_status is None`
   guard so `lifecycleState: "closed"` with missing top-level
   status no longer bypasses the check.
6. **Unknown top-level status now reports rule 2 (not rule 5).** The
   error is a shape/enum problem, not an inconsistency between
   top-level and per-session states.

### Test results

- pytest: **484 passed, 1 skipped, 8 e2e deselected** (was 476
  pre-Session-1; +8 from new edge-case coverage).
- mocha (Session 1's progress.test.ts): **46 passed**.
- TypeScript `tsc --noEmit`: clean.

### What did NOT ship in Session 1

- No writer changes (`register_session_start`, `close_session`
  unchanged). Writer dual-write ships in Session 2.
- No reader migration (close-out gates, tree provider, etc., still
  read legacy fields). Reader migration + Explorer label
  ("Done" → "Complete") ships in Session 3.
- No bulk migrator, no in-repo state-file migration. Ships in
  Session 4.
- No in-extension migration UX, no loading state, no GA release.
  Ships in Session 5.

### Decisions reified (from spec.md)

- **D2** — terminology unified on "complete" across schema + display
  labels (proposal doc patched; schema doc rewritten).
- **D7** — regex-first title extraction lives in
  `extract_session_titles_from_spec()`; AI fallback wires up in
  Session 5 via the now-registered `spec-title-extraction` task
  type.
- **D10** — Lightweight one-field-flip worked example shipped in
  the schema doc; Session 4 will dry-run it against a real
  homehealthcare-accessdb state file.
- **D13** — "no application reader may read legacy fields except
  through approved compatibility helpers" — `progress.py` /
  `progress.ts` ARE those helpers. Session 3 ships the lint rule.
- **D14** — `spec-title-extraction` registered in S1, not S5.
- Synthesizer hardened: default-to-not-started, fail-loud on
  contradictions, strict-int filtering.

## Session 2: Phase 2 dual-write writers + scaffolding

**Status:** Complete (2026-05-17)
**Orchestrator:** Claude Opus 4.7 @ effort=high
**Verification:** gpt-5-4, $0.460133 across two rounds.
- Round A ($0.266495) found 4 must-fix issues; all addressed.
- Round B ($0.193638) VERIFIED — every fix landed cleanly, no new
  issues introduced.

### Shipped

1. **`ai_router/session_state.py`** — Phase 2 writers. Per spec D5,
   `register_session_start` and `_flip_state_to_closed` now emit
   BOTH the canonical v3 `sessions[]` ledger AND the legacy
   `currentSession` / `totalSessions` / `completedSessions` triple,
   with legacy fields derived from `sessions[]` via
   `_derive_legacy_fields()`. `SCHEMA_VERSION` bumped 2 → 3. Per
   spec D6, writer-side invariant violations raise
   `SessionStateInvariantError` (re-exported from
   `ai_router.progress`) BEFORE any file is written — no silent
   recovery.

2. **New helpers** in `session_state.py`:
   - `_existing_sessions_records(state)` — coerces a prior
     `sessions[]` on disk into `SessionRecord` objects, carrying
     titles forward across boundary writes.
   - `_spec_titles_for_set(dir)` — wraps
     `progress.extract_session_titles_from_spec()` to return
     `{number: title}`.
   - `_build_sessions_array(dir, total, completed_numbers,
     in_progress_number, prior_state)` — single source of truth
     for the v3 ledger. Title resolution: prior `sessions[]` →
     `spec.md` → generic `Session N`. Status assignment:
     `in-progress > complete > not-started`. Rejects in_progress
     or completed values outside `[1, total]` (rule 2).
   - `_derive_legacy_fields(sessions)` — derives
     `(currentSession, totalSessions, completedSessions)` from
     `sessions[]`. The ONLY materialization path for the legacy
     triple (spec D5).
   - `_validate_sessions_or_raise(sessions, top_status,
     lifecycle_state)` — writer-side wrapper around
     `progress.validate_invariants()`.

3. **Scaffolding writes v3.** `_not_started_payload` and
   `_backfill_payload` now include a v3 `sessions[]` array when
   `totalSessions` is known from `spec.md`. The change-log
   backfill branch promotes every session to `complete`; the
   activity-log-only branch conservatively promotes session 1 to
   `in-progress`. All scaffolding paths run
   `_validate_sessions_or_raise`.

4. **`ai_router/tests/test_session_state_v3.py`** — 37 new pytest
   cases covering: `SCHEMA_VERSION`; `_build_sessions_array` unit
   tests (status assignment, title carry-forward, generic fallback,
   rejection of out-of-range numbers); `_derive_legacy_fields`
   unit tests; `register_session_start` v3 dual-write (sessions[]
   + legacy triple, title carry-forward across `spec.md` mutation,
   dual-write parity at session 2 start, idempotent
   `work_started`, `totalSessions` backfill);
   `mark_session_complete` v3 dual-write (mid-set keeps SET
   in-progress, final close flips to complete, forced promotes
   all); scaffolding writes v3
   (`synthesize_not_started_state`, `ensure_session_state_file`,
   `backfill_session_state_files`); Round-A regression coverage
   (`TestWriterRejectsOutOfRange`,
   `TestFlipStateRequiresTotalSessions`,
   `TestNaturalLastSessionCloseDoesNotPromoteAll`);
   `SessionStateInvariantError` re-export identity.

5. **`ai_router/tests/test_session_state_v2.py`** — updated
   assertions for v3 dual-write shape. `schemaVersion` bumped to
   3 across writer tests; v3 `sessions[]` assertions added;
   `test_mark_complete_rewrites_v1_as_current_schema` updated
   for the new forced-incident-recovery semantic (every session
   promoted to complete + `forceClosed: true`).

6. **3 downstream tests updated for v3 currentSession semantics**
   (the spec problem statement's "ambiguous in-flight or
   most-recently-closed" v2 fix landing as a behavior change):
   - `test_happy_3session.test_happy_3session_full_cycle` —
     `currentSession is None` after every close.
   - `test_force_close_path.test_force_close_nonfinal_session` —
     `completedSessions == [1, 2, 3]` under forced
     incident-recovery (not `[1, 2]`).
   - `test_close_session_snapshot_flip.test_close_session_multi_session_set_clean`
     — `currentSession is None` after final close.

### Round A verification fixes applied

gpt-5-4 verifier flagged 4 must-fix issues; all addressed:

1. **Silent truncation of out-of-range session numbers.**
   `_build_sessions_array` now raises rule 2 when
   `in_progress_number` or any `completed_numbers` falls outside
   `[1, total]`. `register_session_start` raises rule 2 when
   `session_number > effective_total` or
   `max(prior_completed) > effective_total`. Previously, a
   `register_session_start(session_number=3, total_sessions=2)`
   call would silently truncate and write a between-sessions
   snapshot with `currentSession: null`.

2. **Natural last-session close no longer silently promotes-all.**
   `_flip_state_to_closed` splits two paths: `forced=True`
   promotes `1..total` to complete (incident-recovery semantic);
   natural close (`forced=False`) uses `new_completed` as-is so
   the invariant validator can catch any gap rather than mask
   it. The validator (rule 7) raises if top-status is `complete`
   but any session isn't.

3. **Unvalidated legacy-only fallback removed.**
   `_flip_state_to_closed` now requires `totalSessions` to be
   resolvable through the fallback chain (state → spec → ledger
   → existing `sessions[]`). If still 0 after fallbacks, raises
   rule 1 rather than fall through to an unvalidated legacy-only
   write. Every successful close writes a fully validated v3
   `sessions[]`.

4. **`work_started` event ordering relative to validation.**
   `register_session_start` reordered to: build `sessions[]` →
   validate → emit `work_started` → write snapshot. Previously,
   the event was emitted BEFORE validation, so a validation
   failure left the events ledger ahead of the snapshot. New
   ordering keeps both files in lockstep on every failure path
   while preserving the original event-before-snapshot success
   ordering.

### Test results

- pytest: **529 passed, 1 skipped, 8 e2e deselected** (was 484
  pre-Session-1; +45 from v3 coverage + Round-A regression tests).
- TypeScript `tsc --noEmit`: clean (no TS-side changes; Session 3
  owns the reader migration).
- The Set 030 state file remains v2-shape on disk; the next
  `_flip_state_to_closed` call (this session's close-out below)
  will rewrite it as v3 with `sessions[]` populated from `spec.md`.

### Operator-visible behavior change

The v2 `currentSession` semantic ("the session in flight OR the
most-recently-closed one") was the load-bearing ambiguity the spec
calls out as the bug being fixed. v3's derived `currentSession`
field is strictly the in-progress session's number, or `null` when
no session is in-flight. Consumer-repo readers that relied on v2's
"survives close" semantic will see `null` after every close
boundary — by design, per spec D5's "legacy fields derived from
sessions[]" rule. The Session Set Explorer extension reader
migration in Session 3 will replace any such direct-field reads
with `get_progress()` calls so the ambiguity is opt-out, not
forced on consumers mid-migration.

### What did NOT ship in Session 2

- No reader migration. The extension's tree provider and the
  close-out gates still read legacy fields directly; Session 3
  migrates them to `get_progress()` calls and adds the lint rule.
- No Explorer label migration ("Done" → "Complete"). Session 3.
- No bulk migrator. Session 4.
- No in-extension migration UX or loading state. Session 5.
- No PyPI / Marketplace publish. Session 5 (per spec D14 revision).

### Decisions reified (from spec.md)

- **D5** — dual-write is the operational steady state: writers
  emit both v3 `sessions[]` and the legacy triple, derived from
  `sessions[]`. Tested via `test_dual_write_parity_after_session_two_start`.
- **D6** — writer-side invariant enforcement is fail-loud, no
  silent recovery. Implemented via `_validate_sessions_or_raise`
  which raises `SessionStateInvariantError` BEFORE any file
  write or event emission.
- Forced-incident-recovery semantic (`force=True`) is "operator
  asserts the SET is done"; promote every session to complete so
  rule 7 holds by construction.

## Session 3: Phase 3 reader migration + Explorer "Done" → "Complete"

**Status:** Complete (2026-05-17)
**Orchestrator:** Claude Opus 4.7 @ effort=high
**Verification:** gpt-5-4, $0.51486 across two rounds.
- Round A ($0.28155) found 1 must-fix issue; addressed.
- Round B ($0.23331) confirmed all four Round-A scope items (the
  Session 1+2 wrappers, the gate migration, the
  fileSystem.ts/SessionSetsProvider.ts reader migration, the
  sessionState.ts writer dual-write) and surfaced 1 NEW finding
  about strict-vs-filter handling of malformed v2 progress fields
  — deliberately deferred (see "Round B new finding" below).

### Shipped

1. **`ai_router/progress.py`** — added `read_progress(state,
   spec_md_path)`, the canonical reader entry point per spec D13.
   Branches v3 (state.sessions present) vs v2 (synthesize first)
   internally so callers never reach into the legacy progress triple.
   `__all__` updated.

2. **`tools/dabbler-ai-orchestration/src/utils/progress.ts`** —
   added `readProgress(state, specMdPath)` mirror.

3. **`ai_router/gate_checks.py`** — three close-out gate predicates
   migrated to `read_progress`:
   - `check_activity_log_entry`
   - `check_next_orchestrator_present` (the `is_final` predicate)
   - `check_change_log_fresh`
   Added two helpers: `_read_progress_or_none(state, dir)` and
   `_session_in_focus(view)`. The latter preserves the v2 "in flight
   OR most-recently-closed" semantic so idempotent close-out retries
   still find a target.

4. **`ai_router/start_session.py`** — preflight migrated.
   `current_in_flight` now derived from `view.current_session`.
   `total_sessions` for `register_session_start` derived from
   `view.total_sessions`.

5. **`ai_router/close_session.py`** — `_peek_session_number`
   migrated through `read_progress`. The `_run_repair` walk's
   v2-compat reads retain inline `# noqa: D13` markers
   (file-level allowlist in the lint rule below; the repair logic
   reconciles legacy fields by definition).

6. **`ai_router/__init__.py`** — `print_session_set_status` cost
   reporter migrated. `session-state.json` totalSessions read now
   routes through `read_progress`; the activity-log.json
   `totalSessions` carrier field keeps the direct read with a
   `# noqa: D13` annotation (different artifact's schema).

7. **`tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`** —
   TWO migrations:
   - `isMidSetComplete` rewritten to a single v3 invariant probe
     (collapses the Set 022 + Set 023 multi-signal predicate). Pre-
     populates `completedSessions[]` from the events ledger for
     pre-Set-022 snapshots (`readClosedSessionsFromLedger` helper).
   - `readSessionSets` state-file block migrated through
     `readProgress`. `liveSession.currentSession` /
     `liveSession.completedSessions` / `totalSessions` /
     `sessionsCompleted` all derive from the v3 view, with a
     v2-compat fallback chain preserved for snapshots that fail
     invariants.

8. **`tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`** —
   Explorer label "Done" → "Complete" per spec D3. `ICON_FILES` key
   `done` → `complete` (file name `done.svg` unchanged for
   continuity). `isCurrentSessionInFlight` simplified to a null-check
   on the v3 `liveSession.currentSession` (which is now strictly the
   in-progress session's number, or null). `progressText` annotation
   "N/N Done" → "N/N Complete".

9. **`tools/dabbler-ai-orchestration/src/types.ts`** — `SessionState`
   union literal `"done"` renamed to `"complete"` per spec D3.

10. **`tools/dabbler-ai-orchestration/src/utils/sessionState.ts`** —
    TS lazy-synth writers updated to mirror Session 2's Python
    writer changes. `SCHEMA_VERSION` bumped 2 → 3. New
    `buildSessions(total, topStatus)` helper produces v3 sessions[]
    for the inferred top-status: complete → all complete,
    in-progress → session 1 in-progress (conservative), not-started
    → all not-started. `notStartedPayload` and `backfillPayload`
    now emit the v3 dual-write shape (sessions[] + derived legacy
    triple) when spec.md declares totalSessions. Per Round-A fix,
    backfill stays at not-started when totalSessions is unknown
    (the writer cannot emit a reader-valid `status: "complete"`
    snapshot without per-session evidence).

11. **`tools/dabbler-ai-orchestration/src/commands/troubleshoot.ts`** —
    user-visible state-machine help string updated `done` →
    `complete`.

12. **`ai_router/tests/test_no_legacy_field_reads.py`** — NEW D13
    lint guard. Scans `ai_router/*.py` for direct dict-access
    patterns (`.get("currentSession")`, `["completedSessions"]`,
    etc.) outside an allowlist. Allowlist: `progress.py`,
    `session_state.py`, `session_log.py`, `close_session.py`
    (file-level: `_run_repair` is v2-compat), `tests/`, `scripts/`,
    plus any line carrying `# noqa: D13`. Sanity-check test
    confirms the scanner actually walks the tree.

13. **`tools/dabbler-ai-orchestration/src/test/suite/noLegacyFieldReads.test.ts`** —
    NEW Mocha equivalent. Targets raw state-dict access patterns
    (`sd.completedSessions`, `state.currentSession`, etc.) rather
    than any field-named access, so downstream `SessionSet` /
    `ProgressView` reads aren't false-positives. Allowlist:
    `utils/progress.ts`, `utils/sessionState.ts`, `types.ts`,
    `providers/SessionSetsProvider.ts` (reads the SessionSet
    model, not raw state), `test/`, plus `// noqa: D13` lines.

14. **`tools/dabbler-ai-orchestration/src/test/playwright/treeView.spec.ts`** —
    5/5 Layer 3 scenarios updated for the new "Complete" bucket
    label and the v3 "force=True promotes all sessions" semantic
    (forced sets now bucket as Complete with the [FORCED] badge,
    not In Progress).

### Round A verifier fix applied

Round A REJECTED with 1 must-fix issue. Addressed:

1. **`backfillPayload` no-plan promotion fixed.** When
   `readTotalSessionsFromSpec` returns null (spec.md has no Session
   Set Configuration block), `buildSessions` returns undefined. The
   pre-fix `backfillPayload` still wrote `status: "complete"` /
   `lifecycleState: "closed"` (or `status: "in-progress"`) without
   `sessions[]` or `completedSessions[]`, producing a snapshot the
   v3 reader would reject (rule 1 + rule 7 / rule 6 violation).
   Fix: when `buildSessions` returns undefined, fall through to
   `notStartedPayload` so the snapshot stays at not-started until
   the next boundary write with a known plan. Mirrored on the
   Python side (`ai_router/session_state.py::_backfill_payload`).
   Added regression tests on both sides
   (`test_session_state_v3.py::TestBackfillPayloadV2Promotion::test_backfill_payload_change_log_without_spec_total_stays_not_started`,
   etc., and `fileSystem.test.ts::lazy-synth with change-log.md
   but NO spec totalSessions stays not-started (Round A fix)`).

### Round B new finding (deferred)

Round B raised one NEW finding outside the Round-A scope: the v2
synthesizer's strict-int filter in `synthesize_v3_from_v2`
(`progress.py:215-228`) silently drops malformed legacy values
(e.g. `currentSession: true` becomes `None`; `completedSessions:
[1.0]` becomes `[]`) rather than raising. The verifier interprets
this as a D6 ("fail loud") violation.

**Deliberately deferred** — this is a Session 1 design decision the
Session 1 verifier explicitly approved ("Pre-filter currentSession
and completedSessions[] to strict positive ints before using them
for totals, membership, or status escalation"). The filter is
**defensive**, not strict: a garbage value in a legacy v2 file
shouldn't crash the close-out gate or the Explorer tree provider;
operators should see a sensible synthesized view instead. The
synthesizer's silent-clean behavior is consistent with the
extension's "trust the canonical status; don't second-guess on
garbled input" stance in `isMidSetComplete` (which returns false
on parse errors). Per memory
`feedback_verifier_spiral_recruit_codex`, a new finding in Round B
that contradicts a prior verifier's design call is exactly the
spiral signal — Session 3 stops here rather than thrashing on a
strict-vs-defensive philosophy debate. If the operator wants strict
fail-loud handling of malformed v2 inputs in a future set, the
change is a one-line edit in `synthesize_v3_from_v2`.

### Operator-visible behavior changes

1. **Explorer label change.** The Session Set Explorer's bucket
   label "Done" is now "Complete"; the row annotation "N/N Done"
   is "N/N Complete". (Spec D3.)
2. **v2 bare-status downgrade.** A v2 snapshot with
   `{status: "complete"}` and no per-session evidence (no
   `completedSessions[]`, no events ledger) now buckets as In
   Progress instead of Done. The Session 4 bulk migrator heals
   these by writing v3 `sessions[]` directly. (Default-to-not-
   started rule per memory
   `feedback_default_not_started_evidence_to_escalate`.)
3. **Force-closed bucket flip.** Per Session 2's writer change
   (`force=True` promotes every session in `sessions[]` to
   complete), force-closed sets now satisfy all v3 invariants and
   bucket as Complete. The `[FORCED]` badge remains the operator-
   facing cue that the gate was bypassed.

### Test results

- pytest: **538 passed, 1 skipped, 8 e2e deselected** (was 529
  pre-Session-3; +9 from the new lint tests + Round-A regression
  tests + the `read_progress` wrapper tests).
- mocha unit: **376 passing, 2 failing** (both pre-existing,
  unrelated: `configEditor-foundation` panel-lifecycle and
  `notificationsSection` rendering).
- Layer 3 Playwright: **5/5 passing** against v3 fixtures.
- TypeScript `tsc --noEmit`: clean.

### Decisions reified (from spec.md)

- **D3** — Explorer label "Done" → "Complete" landed (both string
  literals and TypeScript `SessionState` union literal renamed).
- **D13** — "No application reader may read legacy fields except
  through approved compatibility helpers" enforced via the two new
  lint tests. The only remaining direct legacy-field reads outside
  the approved helpers are in `close_session._run_repair` (v2-compat
  carve-out, file-level allowlist) and four `// noqa: D13` /
  `# noqa: D13` annotated lines (the v2-compat ledger-merge
  pre-processor in `fileSystem.ts` / `isMidSetComplete`, and the
  activity-log.json carrier-field read in `__init__.py`).

### What did NOT ship in Session 3

- No bulk migrator. Session 4.
- No in-extension migration UX, no loading state. Session 5.
- No PyPI / Marketplace publish. Session 5 (per spec D14 revision).
- The Round B new finding (strict-vs-defensive synthesizer) is
  deferred — see "Round B new finding (deferred)" above.

## Session 4: (pending — bulk migrator + in-repo migration + RC build, NO publish)

(populated at session close)

## Session 5: (pending — alignment migration UX + loading state + final release)

(populated at session close)

---

## Final cost summary

(populated after Session 5 close-out)
