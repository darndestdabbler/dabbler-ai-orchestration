# Set 004 — Cost Enforcement and Capacity (Change Log)

**Status:** complete · 4 of 4 sessions verified
**Started:** 2026-04-30 · **Completed:** 2026-04-30
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifier:** gemini-pro (Google) — all sessions

This set turned on the new cost-reporting and gate-enforcement
behavior. Sets 001–003 shipped data structures and dormant machinery;
Set 004 wired them together. The reconciler from Set 003 means failures
here have an automatic recovery path.

## Summary of changes

### Session 1 — Dual-sourced `print_cost_report()` (outsource-first mode)

- Extracted `get_costs()` and `print_cost_report()` from `ai-router/__init__.py`
  into a new leaf module `ai-router/cost_report.py` so unit tests can
  import the cost-reporting surface without setting API keys (the
  package's `__init__.py` has transitive API-key-dependent imports).
- Re-sourced both functions:
  - `router-metrics.jsonl` filtered by `session_set` is now the
    canonical billing-grade total (`Routed-model spend (canonical)`).
  - `activity-log.json` provides the supplemental layer
    (`Activity-log adjustments (supplemental)`), capturing manual
    costs and human edits.
  - Discrepancies of more than $0.01 between the two sources produce
    a labeled WARNING with the discrepancy direction (more vs less).
  - `format='json'` parameter on `print_cost_report` emits stable,
    sort-keyed JSON suitable for piping or diffing.
- `get_costs()` extends — does not replace — the prior return shape:
  every old top-level key (`total_calls`, `total_cost`, `by_model`,
  `sessions_completed`, `sessions_remaining`) is preserved; the new
  `routed_total_usd` / `activity_total_usd` / `delta_usd` /
  `discrepancy` keys layer on top.
- Verifier (Gemini Pro) flagged two issues:
  - **Major:** basename-only matching could risk cross-set
    contamination. Resolution: the basename-uniqueness assumption
    was documented in `_matches_session_set` rather than removed —
    removing basename matching would have broken the production
    flow where records carry relative paths but consumers may pass
    absolute paths.
  - **Minor:** `activity_log_present` was always True because the
    SessionLog constructor creates the file. Resolution: probe
    `os.path.isfile` before constructing SessionLog. Two regression
    tests added.

### Session 2 — Capacity heartbeat + outsource-last utilization heuristic

- New module `ai-router/capacity.py`:
  - `write_capacity_signal(provider, completion_metadata)` appends
    one JSON line per completion to
    `provider-queues/<provider>/capacity_signal.jsonl`. Schema fixed:
    `timestamp`, `provider`, `task_type`, `tokens_input`,
    `tokens_output`, `elapsed_seconds`, `model_name`. Unknown metadata
    keys are dropped; missing keys serialize as JSON `null`.
  - `read_capacity_summary(provider, lookback_minutes=60)` returns a
    `CapacitySummary` (`last_completion_at`, `completions_in_window`,
    `tokens_in_window`, `time_since_last`).
  - **Heartbeat-only framing.** The module + dataclass + read function
    docstrings repeat four times that this is observational data, not
    routing intelligence — a downstream reader should not be able to
    misinterpret the values as predictive of remaining capacity.
  - Best-effort write semantics: `OSError` is swallowed so a transient
    FS hiccup cannot wedge the role-loop.
- Wired into `ai-router/verifier_role.py:process_one_message` via
  `_emit_capacity_signal`, after a successful `queue.complete()`.
  Because `orchestrator_role.py` reuses `process_one_message`, this
  single wire point covers both daemons.
- Extended `cost_report.py` with mode-aware reporting. For
  `outsourceMode: last`, `print_cost_report()` shows a
  utilization-led report (sessions completed in 5h subscription
  window, tokens/min over last 60 min, last-activity-ago) with a
  NOTE block reasserting the heartbeat-only framing. JSON output
  surfaces `outsource_mode` + `subscription_utilization`.
- Verifier (Gemini Pro) flagged one Minor: timezone-normalization
  block in `read_capacity_summary` had a confusing dual-return path.
  Resolution: normalized naive `now` to UTC once at the top of the
  function. Investigation surfaced a related latent bug
  (`ts_dt >= cutoff` would have raised on a naive `now`) — closed by
  the same fix. Regression test added.

### Session 3 — `mark_session_complete()` enforces the gate

- Added public `run_gate_checks(session_set_dir, allow_empty_commit=False)`
  in `ai-router/close_session.py`. Gate-only entry point: no lock, no
  event emission, no queue wait, no force handling. Missing
  `disposition.json` surfaces as a synthetic `disposition_present`
  gate failure rather than as an exception, so callers get a single
  uniform list-of-failures surface.
- New `CloseoutGateFailure(Exception)` and frozen `GateCheckFailure`
  dataclass in `ai-router/session_state.py`. The exception carries
  `.failures: List[GateCheckFailure]` and `str()`-renders a
  bulleted human-readable summary.
- Refactored snapshot-flip mechanics out of `mark_session_complete`
  into a private `_flip_state_to_closed(session_set, verification_verdict)`.
  `mark_session_complete` now layers gate-then-event-emit-then-flip on
  top; `close_session._run_repair` calls `_flip_state_to_closed`
  directly so it does not re-run the gate or emit a duplicate event.
- New keyword-only `force=False` parameter on `mark_session_complete`:
  - Gate passes → append `closeout_succeeded` with `forced=False`,
    flip the snapshot.
  - Gate fails + `force=False` → raise `CloseoutGateFailure`, no
    flip, no event.
  - Gate fails + `force=True` → log a loud `DEPRECATION` warning,
    append `closeout_succeeded` with `forced=True` and the failed
    check names, then flip.
- Event emit happens **before** the flip so a write failure leaves the
  snapshot un-flipped — the snapshot and the ledger never disagree on
  success.
- Verifier (Gemini Pro): **VERIFIED**, no findings. Verifier
  explicitly endorsed the gate-then-emit-then-flip ordering, the
  lazy-import resolution of the `session_state` ↔ `close_session`
  cycle, and the synthetic `disposition_present` gate failure.

### Session 4 — Schema-drift fix: generator script for the session-state.json example

- New module `ai-router/dump_session_state_schema.py`:
  - `build_example_state()` returns a fully-populated v2 dict built
    from the live schema constants (`SCHEMA_VERSION`,
    `SessionLifecycleState`) so a constant-renaming refactor surfaces
    on the next `--check`.
  - `format_example(state, *, include_comments)` emits either pure
    JSON (byte-deterministic; the form `--check` compares against)
    or JSONC with one `//` comment per top-level field from a
    `_FIELD_COMMENTS` table.
  - `run_check()` compares the regenerated output to the committed
    reference at `docs/session-state-schema-example.json`; returns
    0 on match, 1 on byte drift or missing reference, with an
    operator hint pointing at the regeneration command.
  - CLI: `--write <path>` writes to a file (path confirmation on
    stderr, stdout stays clean for piping); `--include-comments`
    emits JSONC; `--check` short-circuits both for drift detection.
- New committed reference at
  `docs/session-state-schema-example.json` and a README at
  `docs/session-state-schema-example.md` documenting the workflow
  (regenerate → commit alongside schema change) and providing a
  ready-to-paste pre-commit hook recipe.
- 29 unit tests covering: schema-version pinning, lifecycle-enum
  pinning, presence of every top-level field, validator-acceptance of
  the emitted `nextOrchestrator` block, byte-determinism, round-trip
  through `read_session_state`, JSONC `//` injection at top-level
  only (not nested), end-to-end subprocess invocation of `--check`,
  and drift detection against a tampered reference.
- **Audit finding for the spec.** The spec asked for a "stale
  committed example" to be replaced. There is no such file in this
  repo today — the only `session-state.json` files in
  `docs/session-sets/` are the live runtime state files for sets
  001–004. The deliverable was reframed as "provide the generator +
  reference + drift check so future drift becomes detectable;"
  this is recorded in the activity log.
- Verifier (Gemini Pro) flagged 1 Minor (JSONC parser brittleness on
  keys with escaped quotes) and 1 Suggestion (test for stale
  `_FIELD_COMMENTS` entries). Both addressed:
  - JSONC key parsing replaced with a compiled regex
    (`_TOP_LEVEL_KEY_RE`) that handles JSON string escapes and
    round-trips matched text through `json.loads`. Regression test
    `test_jsonc_parser_handles_escaped_quote_in_key` synthesizes a
    state with an escaped-quote key and confirms the comment still
    injects.
  - Added `test_field_comments_table_has_no_stale_entries`. CI fails
    fast when a schema field is removed but its comment is left
    behind.

## Test deltas across the set

| Stage | Tests passing | Delta |
|---|---|---|
| Pre-set baseline (end of Set 003) | 477 | — |
| Set 004 / Session 1 (cost report) | 479 | +2 (verifier-finding regressions only — Session 1's main test file landed at 477+ but the closing count post-fix was +2 over the baseline) |
| Set 004 / Session 2 (capacity) | 513 | +34 (33 new + 1 regression) |
| Set 004 / Session 3 (gate wiring) | 528 | +15 |
| Set 004 / Session 4 — pre-verifier | 555 | +27 |
| Set 004 / Session 4 — post-verifier | **557** | +2 (regression tests for verifier findings) |

No regressions across the 26 ai-router test files.

## Routing costs

| Session | Verifier model | Cost (USD) | Tokens (in / out) |
|---|---|---|---|
| 1 | gemini-pro | $0.0260 | (not separately recorded — see session-001.md) |
| 2 | gemini-pro | $0.0488 | (not separately recorded — see session-002.md) |
| 3 | gemini-pro | $0.0211 | 15,870 / 127 |
| 4 | gemini-pro | $0.0203 | 10,707 / 694 |
| **Total** | — | **$0.1162** | — |

Per the user instruction effective for this set, no other external
routing was performed: each session ran end-to-end on Claude Opus 4.7
locally, with one cross-provider verification call per session.

## Acceptance criteria — final

- [x] All four sessions complete with passing tests
- [x] Cost reports surface both routed-canonical and
  activity-log-supplemental totals (outsource-first mode)
- [x] Subscription utilization heuristic available with clear
  heartbeat-only framing (outsource-last mode)
- [x] `mark_session_complete()` enforces gate checks; `--force` works
  with a loud DEPRECATION warning and an audit-trail event marker
- [x] Schema-example generator + drift check committed; the previously
  hand-edited example has been **superseded** (not "replaced",
  because no such file existed) by a generator-driven reference
- [x] All existing callers of affected APIs continue to work
- [x] No reconciler invocations were needed during this set's own
  implementation (the pre-existing snapshot from Set 003 was clean,
  and no transient failures occurred)

## What's next

Per the spec, Set 005 is `vscode-extension-and-queue-views` (queue and
capacity views in the Session Set Explorer extension). Set 006 is
`docs-fresh-turn-and-alignment-audit`.
