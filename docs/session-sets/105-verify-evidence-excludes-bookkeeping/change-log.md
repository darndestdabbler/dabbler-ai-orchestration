# Change log — Set 105: verification evidence excludes framework bookkeeping

**Outcome:** `verify_session` no longer false-positives on lazily-synthesized
`session-state.json` files. The cross-provider verifier used to see untracked
`not-started` state files (materialized out of band by any all-sets status scan
via the Set 7 invariant), inline them as deliverables, and flag them as
"never hand-author state" violations — a loop that never cleared because the
files re-synth between rounds. The evidence pipeline now reclassifies framework
bookkeeping as *expected output, not reviewed work*, without blinding the
verifier to *deliberate* state-machinery changes. One session, VERIFIED.
Router-side, publish operator-gated (CHANGELOG `[Unreleased]`).

## Session 1 (of 1) — Reclassify framework bookkeeping in the evidence bundle

- **Corrected root cause.** The field report blamed `verify_session` for
  "auto-bootstrapping" state files. It does not: `verify_session` never writes
  state. The lazy-synth writer is `session_state.py`
  `read_status` → `ensure_session_state_file` (the Set 7 "every spec folder
  carries a `session-state.json`" invariant), fired across every set by the Work
  Explorer refresh / any all-sets status scan. That is why "delete then
  re-verify" failed — the files are re-created **out of band** between rounds.
- **Fix** (`ai_router/verify_session.py`): a new `FRAMEWORK_BOOKKEEPING_FILES`
  set (`session-state.json`, `session-events.jsonl`, `activity-log.json`);
  `_collect_untracked_contents` returns a **third partition** (bookkeeping),
  matched by **basename** (own + sibling sets, any depth) **before** the
  generated-bundle / inline partitions; `EvidenceBundle` gains
  `untracked_bookkeeping`, rendered under a new *"Expected framework bookkeeping
  (blessed-writer / lazy-synth output — NOT reviewed work)"* section — paths
  disclosed (honesty preserved), content **not** inlined and **not** in the
  "review directly" bucket.
- **Deliberately NOT a `DEFAULT_DIFF_EXCLUDES` entry.** A blanket pathspec
  exclude would drop **tracked** state-file changes from the diff, blinding the
  verifier to legitimate state-machinery work (schema/meta sets, committed
  fixtures). Only the untracked-content inlining is reclassified; the tracked
  diff is untouched. Non-goal (declared): the lazy-synth / Set 7 invariant
  itself is load-bearing and was not touched — mirrors Set 089's evidence-layer
  approach.
- **Sub-decision settled:** the optional `verification.md` framing line was
  **not** added. The structural reclassification alone proved sufficient
  (smaller change wins; removal-over-addition). The routed step-3.5 analyst
  (gemini-2.5-pro) recommended the line, but the self-witnessing VERIFIED round
  superseded that advisory.
- **Tests:** new `TestFrameworkBookkeepingReclassification` (real-git fixture)
  proves the three buckets — sibling not-started → bookkeeping (not inlined /
  not review-directly), a genuine untracked deliverable still inlined, a tracked
  state change still in the diff, `session-events.jsonl` + `activity-log.json`
  symmetric, and basename-classification at any depth.
- **Suite:** 3060 passed / 6 skipped; `drift_guard` OK; guidance ceiling OK; no
  copilot-CLI dependence.
- **Verification:** routed cross-provider `verify_session --phase discovery`
  (fan-out 2/2, gpt-5-6, anthropic auto-excluded) → **VERIFIED, 0 findings**,
  $0.1557. Its own regression witness: the round's evidence rendered *this set's
  own* `session-state.json` / `session-events.jsonl` / `activity-log.json` under
  the new bookkeeping section rather than flagging them.

## Immediate operator unblock (pre-publish)

Anyone hitting this before Set 105 ships can run
`verify_session --exclude session-state.json`, or adjudicate the finding as a
false positive in `disposition.json` (the sanctioned per-finding path).
