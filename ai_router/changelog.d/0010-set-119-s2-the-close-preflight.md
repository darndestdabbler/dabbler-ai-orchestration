## [Unreleased] — the close preflight (Set 119 S2)

### Added

- **`python -m ai_router.close_preflight` — every close-out obligation,
  knowable before the close runs.** Runnable at any time against a
  session set, with **no side effects and no routed call**: no lock, no
  ledger event, no file written. It prints every obligation in one pass
  — met and unmet, blocking and advisory — each with the predicate's own
  remediation and the action that satisfies it. Exit `0` when nothing
  blocking is unmet, `1` when something is, `2` on an invalid
  invocation; `--json` emits the same report for a script.

  Authorized by measurement: close-out is not slow (median 0.1 min) — it
  **fails**. 122 of 295 sessions failed at least once, mean 1.6 attempts,
  max 9, and every failure is an obligation nobody knew they had until a
  gate refused.

  It **reports; it never refuses** (this set's spec forbids a new gate).
  Its blocking/advisory split is read from `gate_checks.is_blocking_check`
  rather than re-derived, so it cannot refuse something the close allows,
  and a check demoted to advisory is advisory here automatically. Every
  verdict comes from **calling** the predicate `close_session` calls —
  a preflight that disagrees with the gate is worse than no preflight.

- **The expensive question, answered for free.**
  `close_backstop.decide_backstop` (+ `BackstopDecision`) is **extracted**
  from `run_close_backstop`, which now consumes it, so there is one
  spelling of "will the backstop spend a routed call" with two readers.
  Every branch of that sequence is a pure read — the method token,
  `budget.yaml`, the orchestrator identity, the stamped rows and their
  hash-bound artifacts, the round ledger, and the git diff base — so the
  preflight predicts it without buying it. `verification_backstop` is 79
  of 214 recorded check-failures and each firing spends a routed call at
  close time.

  Three answers, and the middle one is the point: the backstop **will not
  run** (settling evidence, zero-budget tier, or an illegal method token);
  it **will refuse before routing** (unresolvable identity, spent round
  budget, unresolvable diff base) — reported unmet and blocking with the
  backstop's own remediation; or it **will route**, reported as a **cost
  warning, not a refusal**, because a backstop round returning VERIFIED
  closes fine. Only `EvidenceTooLargeError` stays unpredicted: it is
  raised by the evidence assembly *after* the decision.

- **`--replay-history` — the tool's reach, measured rather than
  asserted.** Replays coverage over every `closeout_failed` event in the
  corpus and reports how many still-blocking failures the preflight would
  have named first. Measured at Set 119 S2: 186 events, 214 recorded
  check-failures, 64 belonging to checks Set 116 S3 demoted (worth
  nothing to pre-empt now), **150 still blocking, of which the preflight
  covers 150**. Filtering to before `2026-08-10T20:28Z` reproduces the
  spec's prediction to the digit (184 events, 212 failures, 148
  still-blocking, 78 backstop, 122 sessions); the delta is exactly Set
  117 Session 1's two close-out failures, recorded after the spec was
  written. The prediction was right and history grew.

  It counts **coverage, not outcomes**, and says so: the working trees
  that produced those failures are gone, so it answers "would the
  preflight have named this obligation first?" — which for a
  deterministic read-only predicate is the same question.

### Fixed

- **A legacy `"session_number": 0` event no longer counts as a session.**
  Set 047's first close attempt recorded one; session numbers are 1-based
  everywhere here, so counting it inflated the replay's per-session tally
  by one (123 vs the spec's 122). Its check-failures still count — a close
  really did fail and really did name them — and the discarded events are
  reported separately as `unnumbered_events` rather than vanishing.

- **`docs/path-aware-critique.schema.json` no longer accepts a
  whitespace-only `evidencePaths` entry** (the owed residual from Set 119
  S1's own verification). The item constraint was `minLength: 1`, which a
  single space satisfies, while `path_aware_critique` rejects it via
  `p.strip()` — the sibling `description` property in the same file
  already carried the non-whitespace `pattern` and the array item did not.
  Fail-closed is not the same as in-parity (L-066-1): nothing invalid was
  ever accepted at runtime, but a schema-only consumer would have accepted
  an artifact the runtime rejects. Both directions are now pinned by
  falsifier pairs in `test_path_aware_critique_schema.py`.

