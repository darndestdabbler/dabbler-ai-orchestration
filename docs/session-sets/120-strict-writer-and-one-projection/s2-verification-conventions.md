# Session 2 verification conventions

Read this before the work under review. It states the baseline, the
release contract, and the by-design exclusions, so Round 1 spends its
findings on real defects rather than on the agreed starting position.

## Suite baseline

- **pytest is the only expensive suite this session owes.**
  `run_of_record`'s `covers` map puts `ai_router/**` under pytest;
  Playwright (Layer 3) covers `tools/**` plus `session_state` /
  `start_session` / `close_session`, none of which this session touched.
  The set declares `requiresE2E: false` and `requiresUAT: false`.
- Baseline at Session 1's close, on the frozen tree: **3,835 passed,
  9 skipped, 0 failed** (585.49s, digest `73c048d7a24b`). There are no
  tracked failures on the Python side.
- Targeted suites run during this session: `test_step_status_drift.py`,
  `test_step_status_vocabulary.py`, `test_drift_guard.py`,
  `test_session_checklist.py` — **143 passed**. The full run of record
  is taken after code freeze, per the constitution's Step 8.

## Release contract

- `ai_router/CHANGELOG.md` gains a Set 120 S2 `[Unreleased]` section.
  **No version is bumped and nothing is published** — the router's
  `1.0.0` is staged and operator-gated, and no session may publish.
- No extension change, no `package.json` change, no VSIX.

## By-design exclusions — please do not report these as findings

1. **The operator's ruling is not reopenable.** Option (c) — normalise
   the lossless synonyms, preserve the semantically loaded entries — was
   ruled by the operator on 2026-08-11, before this session opened, and
   is recorded in `spec.md` → *Decisions already made* (item 5) and
   → *Session 2*. This session's job was to **falsify the premise** and
   report if it failed, then execute. It did falsify it (three signals,
   zero counter-examples) and executed. A finding arguing for option
   (a) or (b), or for widening the scope to the 15 loaded entries, is
   out of scope.
2. **`skipped` stays refused.** Settled by operator ruling at S1
   (`spec.md` → *Decisions already made*, item 6). Revisiting belongs
   after S3 collapses the two readers.
3. **The readers were not touched, deliberately.** Standing decision 1:
   readers stay lenient about history; the writer is strict. This
   session changed no reader.
4. **No extension changes** (standing decision 3), which is also why the
   pinned UAT fixture's 2 `completed` tokens were left alone — journaled
   as a scoping decision in `decisions.jsonl`.
5. **Session 3 owns the projection.** `unknown` / `stale` / `unreadable`
   states, the parity proof, and removing the `<- here` marker are S3's,
   not gaps in S2.

## What to review hardest

The migration rewrote **271 entries across 21 files of real historical
records**. The claim that needs adversarial attention is *restraint*:
that nothing outside the 271 ruled status tokens changed, in any file,
at the byte level — and that the 15 semantically loaded entries are
byte-identical to what they were before. Independent evidence beyond the
migrator's own assertions: `git diff` across the 21 migrated files
contains exactly 271 removed `"status"` lines and 271 added ones and
nothing else.

The second claim worth attacking is whether the **premise check could
have failed at all** — a falsifier that cannot fail is not evidence. It
is planted in both structural directions in
`test_step_status_drift.py`.
