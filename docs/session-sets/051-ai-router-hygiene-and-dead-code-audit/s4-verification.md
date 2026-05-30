# Set 051 — S4 cross-provider verification record (whole-set)

**Performed:** 2026-05-30 (Session 4, set close-out)
**Verifier:** `gemini-pro` (google / `gemini-2.5-pro`) — different provider
from the Claude/Opus orchestrator.
**Call mechanics:** `providers.call_model` with the provider-scoped config
(`cfg["providers"]["google"]`), `thinking_budget=6000`, `max_tokens=16000`.
Given the **actual code** (old vs new D3 module, the S2 packaging diff)
plus neutral framing of each deviation — not a pre-framed narrative.
**Cost:** $0.0219 (9242 in / 1031 out · $1.25/$10.00 per 1M). Cumulative
Set 051 routed: **$0.0491 of $10 NTE (0.49%)** ($0.0272 S1 + $0.0219 S4;
S2 + S3 invoked no router).

## Verdict: **VERIFIED** (0 critical, 0 important)

The panel scrutinized the four highest-risk surfaces: the load-bearing D3
salvage and the three implementer deviations from the locked S1 verdict.

- **Target 1 — D3 writer-bypass salvage (V2).** "Almost perfectly
  behavior-preserving … the core logic … is identical to the source
  implementation in `joiner/conflicts.py`. The inlining of helper
  functions (`parse_iso`, `canonicalize_cwd`) and the refactoring of
  `scan_session_states` are correct and do not alter the outcome.
  `WriterBypassReport` is a correctly renamed analogue of
  `ConflictReport`." Sound, effective, no `joiner` dependency.
- **Target 2 — V3 backfill entry point RETIRED not repointed.**
  "Correct and justified … shipping a known-broken console script is
  worse than not shipping it." Endorsed `test_entry_points.py` as a
  robust regression guard.
- **Target 3 — V4 relocate AND fix the stray tests.** "Correct and
  justified … the non-goal has a legitimate exception for code that was
  demonstrably *not live* because it was broken. Fixing [the `sys.path`
  bootstrap] restores intended functionality, it does not change it."
  Both fixes (`parent`→`parent.parent`; `_FIELD_COMMENTS` v4 trim)
  judged correct.
- **Target 4 — S3 spec-implied deletions.** Both correct: deleting
  `claudeSessionStartInvoker.test.ts` is "the correct and clean final
  step of retiring the feature it tested" (it dynamic-imports the
  deleted JS); the watcher-allowlist line bump (154→153) "is the test
  working as designed" — a tripwire whose contract instructs updating
  the pin on an intentional refactor.

## Findings & dispositions

- **NTH-1 (Nice-to-have) — KEPT (deliberate, verifier fix declined).**
  The verifier noted the salvaged report `note` string changed from the
  original's `±2s` (unicode) to `+/-2s` (ASCII) and suggested reverting
  to `±2s`. **Empirically confirmed** the change is real
  (`old conflicts.py:159` `±2s` → `writer_discipline.py:237` `+/-2s`) but
  the suggested revert is **declined**: this repo has a documented,
  empirically-reproduced gotcha that non-ASCII output **crashes the
  Windows cp1252 console** (Set 050 S2 — the `check_migrations` advisory
  was made ASCII-only for exactly this reason). The `writer_discipline`
  report note can be surfaced to a console, so the ASCII `+/-2s` is the
  correct, defensive form; reverting would reintroduce the crash risk.
  Salvage *behavior* (the numeric tolerance, the detection logic) is
  unchanged — only the human-readable rendering is ASCII-safe. No change.

## Suite state at verification time

- Python: **1028 passed / 1 skipped / 0 regressions** (the −1 vs S2's
  1029 is the deleted `test_invoker_schema_constant.py`).
- TypeScript: `tsc --noEmit` clean; `test:unit` **554 passing / 2
  failing** — the 2 are the known pre-existing Set-026 stub-harness
  failures (`configEditor-foundation` panel-lifecycle +
  `notificationsSection` rendering), unrelated to Set 051.
- Extension packages clean at **0.26.0** (`vsce package` → 21 files,
  930 KB).
