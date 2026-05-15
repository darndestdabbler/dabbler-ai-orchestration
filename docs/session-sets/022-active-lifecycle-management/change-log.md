# Set 022: active-lifecycle-management — Change Log

**Sessions:** 3 of 3 completed (2026-05-15)
**Orchestrator:** Anthropic / Claude Opus 4.7 (1M context) — all three sessions
**Cumulative metered cost:** ~$0.99 — Session 1 verification $0.228 (gpt-5-4
$0.212 + gemini-pro $0.015), Session 2 verification $0.345 (gpt-5-4 round 1
$0.149 + round 2 $0.195), Session 3 verification $0.418 (gpt-5-4 across 3
rounds: $0.096 + $0.163 + $0.159).

---

## What Set 022 delivers

Session sets now transition cleanly through their lifecycle in the
Session Set Explorer: the set appears in **In Progress** the moment
the orchestrator declares session N is in flight on disk; the fraction
advances monotonically `0/N → 1/N → … → N/N`; the set moves to **Done**
the moment the final session's `close_session` returns success.

The mixed-mode-drift defensive guards that shipped in v0.13.11 and
ai_router 0.2.2 (commit `7166754`) remain as recovery defense-in-depth.
This set adds the **prevention layer**: a tier-symmetric "state first,
work second" protocol enforced by router-driven CLI writers, made
self-healing via a shared reconciliation helper that runs on every
boundary write, and encoded into the canonical workflow / schema /
close-out docs so every consumer's AI follows it.

### Session 1 — ai_router writer changes (commit `1a973be`, released as ai_router 0.2.3)

**`ai_router/start_session.py` (new)**
CLI entry point `python -m ai_router.start_session --session-set-dir <path>`.
Infers the next session via `compute_effective_completed_sessions`,
refuses to advance past an open session (exit 3 boundary violation),
refuses to re-open a closed session, refuses to skip ahead. Idempotent
re-entry for in-flight sessions. Thin wrapper around the existing
`register_session_start` machinery with boundary enforcement on top.

**`ai_router/session_state.py` — new helper + close writer changes**
- `compute_effective_completed_sessions(session_set_dir)` — single
  source of truth for "how many sessions closed." Read order:
  `completedSessions[]` (authoritative) → distinct `closeout_succeeded`
  events (Full-tier fallback) → legacy `currentSession − 1` heuristic
  (last resort, emits stderr warning).
- `_flip_state_to_closed` — now appends `currentSession` to
  `completedSessions[]` (sorted, unique) on every close. Final-session
  detection uses `len(completedSessions) == totalSessions` post-append,
  with `change-log.md` presence as belt-and-suspenders.
- `register_session_start` — preserves `completedSessions[]` across the
  snapshot rewrite, backfilling from events for legacy sets.

**`ai_router/close_session.py` — `--repair --apply` extension**
Case 1 (state-says-closed-but-no-closeout-event) now also backfills
`completedSessions[]` directly from the events ledger using the new
helper. A drifted set with events for sessions 1–4 but a snapshot
claiming session 5 done gets `completedSessions: [1, 2, 3, 4]` plus
synthetic session-5 events on the same boundary write.

**Tests:** 699 pass. New `test_start_session.py` covers idempotency,
the three boundary-violation refusals, currentSession inference, and
work_started event emission/dedupe. Extended `test_close_session_session4`
and `test_repair_detects_mixed_mode_drift` for `completedSessions[]`
assertions.

Cross-provider verification: gpt-5-4 ($0.212) + gemini-pro ($0.015) →
both VERIFIED in round 1.

### Session 2 — Extension reader changes (commit `dcc8636`, released as v0.13.12)

**`tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`**
- Removed activity-log unique-sessionNumber count derivation (per
  Decision 4: activity-log is a step log, not a count source).
- Removed the `currentSession − 1` reader-side fallback (the helper
  on the writer side makes it unnecessary, and dropping it eliminates
  an off-by-one class).
- New `countDistinctCloseoutSessions(eventsPath)` helper generalizes
  the v0.13.11 `hasCloseoutEventForSession` to count distinct sessions
  — Full-tier events-ledger fallback.
- New count derivation order: `completedSessions.length` (primary) →
  `countDistinctCloseoutSessions(eventsPath)` (Full-tier fallback) →
  `totalSessions` when `state === "done"`.
- `LiveSession.completedSessions: number[] | null` surfaced through
  the type system so the tree view computes the in-flight predicate
  without re-reading the snapshot.

**`tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`**
- New `isCurrentSessionInFlight(set)` predicate implementing the spec
  invariant (`currentSession not in completedSessions[]`); guards
  against legacy snapshots by requiring a non-null array.
- `progressText` now appends ` Done` on done rows and
  ` · session N in flight` when the predicate fires. Both functions
  exported for unit-test reuse.

**`tools/dabbler-ai-orchestration/src/extension.ts`**
File watcher `RelativePattern` extended to include
`session-events.jsonl` and `CANCELLED.md`, so a fresh-set
Not Started → In Progress flip on session 1 doesn't wait for the 30s
poll loop (start_session writes the ledger before the state file), and
so a cancel/restore command's CANCELLED.md write fires an immediate
refresh.

**Tests:** 5 new fileSystem regression tests + 13 new SessionSetsProvider
tests + 1 round-1-fix regression test. TypeScript compiles cleanly.
`npx vsce package` produced `dabbler-ai-orchestration-0.13.12.vsix`
(19 files, 398.91 KB).

Cross-provider verification: gpt-5-4 round 1 ISSUES_FOUND (1 real
Major on state-file vs activity-log totalSessions precedence, 1
context-gap false positive — both fixed); round 2 VERIFIED.

### Session 3 — Workflow doc + schema doc + close-out doc + cross-consumer verification (this commit)

**`docs/ai-led-session-workflow.md`**
- Step 1 gained "State first, work second (Set 022)" — the canonical
  three-line invariant, a Full-tier CLI invocation block (with both
  bash and Python subprocess pseudo-code), and a Lightweight-tier
  hand-write template.
- Step 8 gained "Symmetric close protocol (Set 022)" — a non-final-
  vs-final field-change table and tier-specific writer/maintainer
  notes. The "do not skip `close_session`" warning from `7166754` is
  preserved and cross-referenced to the new start protocol.

**`docs/session-state-schema.md`**
- New "State invariant (Set 022 — canonical)" section directly under
  the title carrying the load-bearing three-line invariant.
- `completedSessions[]` added to the Required-fields JSON schema
  example and promoted from "optional but planned" to "always written
  (Full) / always maintained (Lightweight)" with explicit writer
  responsibilities.
- Parser cheat-sheet updated to add the events-ledger fallback step
  and drop the retired `currentSession − 1` reader fallback (matches
  extension v0.13.12). New in-flight predicate computation block.
- Full-tier mid-set worked example now includes `completedSessions: [1]`
  with an explanatory note.
- Migration section declares the array required on both tiers as of
  Set 022.

**`ai_router/docs/close-out.md`**
- New Section 0 "Session-boundary writes (start and close)" covering
  why two writers exist, field-by-field tables for both, idempotency
  notes, and tier symmetry.
- Section 5 drift-case-1 extended to mention `completedSessions[]`
  backfill via `compute_effective_completed_sessions` on
  `--repair --apply`. A drifted set's snapshot and events ledger
  come into agreement on the same boundary write.

**Cross-consumer verification (read-only — no repairs run from this set):**
- `dabbler-platform` (38 sets): 0 carry `completedSessions[]`; 8
  Full-tier sets heal cleanly via events-ledger fallback on their next
  boundary write; 30 Lightweight-tier sets continue under hand-
  maintenance.
- `dabbler-access-harvester` (33 sets): 0 carry the array; 5 Full-tier
  sets heal cleanly; 28 Lightweight-tier sets continue under hand-
  maintenance. `integration-testing-and-acceptance` (cancelled) and
  `vba-symbol-resolution-and-enrichment` (retired) are terminal
  states — no action.
- `dabbler-homehealthcare-accessdb` (6 sets): 4 fully compliant
  (numeric arrays); 2 (`003-reports-client-svc-uat`,
  `004-reports-provider-uat`) carry string-array session IDs in
  terminal-state Lightweight sets — non-blocking follow-up for the
  consumer repo.

**No consumer-repo session set will break on next boundary write.**

Cross-provider verification: gpt-5-4 across three rounds — round 1
ISSUES_FOUND (2 Major findings in the homehealthcare narrative — a
counting error and an overstated compliance verdict); round 2
ISSUES_FOUND (1 Minor on Lightweight stderr-warning precision); round
3 VERIFIED, issues: []. All findings were in the verification
narrative, not in the doc edits themselves.

---

## Architecture summary

```
                  ┌──────────────────────────────────┐
                  │ compute_effective_completed_     │
                  │ sessions(session_set_dir)        │
                  │  - reads completedSessions[]     │
                  │  - cross-references events       │
                  │    ledger (Full tier)            │
                  │  - last-resort legacy heuristic  │
                  └──────────────┬───────────────────┘
                                 │ shared helper called by every boundary write
       ┌─────────────────────────┼─────────────────────────┐
       ▼                         ▼                         ▼
  start_session (CLI)     close_session (CLI)         --repair --apply
  Full tier writer        Full tier writer            healing path
                                                       (backfills
                                                        completedSessions[]
                                                        and missing
                                                        closeout events)
```

Lightweight tier: same fields, hand-written by the orchestrator. No
router code runs; `completedSessions[]` is the only authoritative
count signal.

Reader path (extension v0.13.12 tree view):
1. `completedSessions.length` (primary).
2. Distinct `closeout_succeeded` session numbers from
   `session-events.jsonl` (Full-tier fallback).
3. `totalSessions` when `status === "complete"` (last resort).

The `currentSession − 1` reader fallback was retired in v0.13.12.
The activity-log unique-`sessionNumber` count path was retired in
v0.13.12 (activity log is now a step log only, per Decision 4).

---

## Files created / modified in this set

**New:**
- `ai_router/start_session.py`
- `ai_router/tests/test_start_session.py`
- `docs/session-sets/022-active-lifecycle-management/spec.md`
- `docs/session-sets/022-active-lifecycle-management/activity-log.json`
- `docs/session-sets/022-active-lifecycle-management/disposition.json`
- `docs/session-sets/022-active-lifecycle-management/session-state.json`
- `docs/session-sets/022-active-lifecycle-management/session-events.jsonl`
- `docs/session-sets/022-active-lifecycle-management/change-log.md`
- `docs/session-sets/022-active-lifecycle-management/session-reviews/` (3 sessions × multiple rounds)
- `tools/dabbler-ai-orchestration/src/test/suite/sessionSetsProvider.test.ts`

**Modified:**
- `ai_router/session_state.py` (helper + close writer changes)
- `ai_router/close_session.py` (`--repair --apply` extension)
- `ai_router/tests/test_close_session_session4.py`
- `ai_router/tests/test_repair_detects_mixed_mode_drift.py`
- `ai_router/__init__.py` (version bump 0.2.3)
- `pyproject.toml` (version bump 0.2.3)
- `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`
- `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`
- `tools/dabbler-ai-orchestration/src/extension.ts` (watcher patterns)
- `tools/dabbler-ai-orchestration/src/types.ts` (`LiveSession.completedSessions`)
- `tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts`
- `tools/dabbler-ai-orchestration/src/test/suite/forceClosedBadge.test.ts`
- `tools/dabbler-ai-orchestration/package.json` (v0.13.12)
- `tools/dabbler-ai-orchestration/package-lock.json`
- `tools/dabbler-ai-orchestration/CHANGELOG.md`
- `CLAUDE.md` (current extension version line)
- `docs/ai-led-session-workflow.md` (Step 1 + Step 8 protocol)
- `docs/session-state-schema.md` (invariant + `completedSessions[]` promotion)
- `ai_router/docs/close-out.md` (Section 0 + `--repair --apply` extension)

---

## Acceptance criteria — all met

- [x] `python -m ai_router.start_session <slug>` flips a Not Started
      set to In Progress immediately (Session 2 watcher fix verified
      against this very set).
- [x] Fraction advances monotonically `0/N → 1/N → … → N/N` (this set
      itself was the live demo: `0/3 · session 1 in flight` → `1/3`
      between sessions → `1/3 · session 2 in flight` → `2/3` → `2/3 ·
      session 3 in flight` → `3/3 Done` after this commit).
- [x] Final-session bucket-flip to Done happens at `close_session`
      success — `len(completedSessions) == totalSessions` post-append
      drives the flip.
- [x] Drifted sets heal on next boundary write — events-ledger
      backfill verified in `test_repair_detects_mixed_mode_drift`.
- [x] v0.13.11 defensive guards untouched; remain as recovery defense-
      in-depth.
- [x] Cross-consumer verification confirms no consumer-repo set will
      break on next boundary write.
- [x] All three sessions cross-provider verified (Session 1: gpt-5-4
      + gemini-pro both VERIFIED; Session 2: gpt-5-4 VERIFIED round 2;
      Session 3: gpt-5-4 VERIFIED round 3).
