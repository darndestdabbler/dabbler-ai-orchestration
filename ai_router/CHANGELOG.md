# Changelog — `dabbler-ai-router`

All notable changes to the `ai_router` Python package are documented
here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.4.0] — 2026-05-17 (GA)

### Added — Session 5 deliverables

- **AI title-extraction strategy (`--strategy ai`) in the bulk
  migrator.** The Session 4 RC reserved the flag and raised
  `NotImplementedError`; this release wires it. Routes via
  `ai_router.route(task_type='spec-title-extraction')` and validates
  the response: exact JSON shape, count match against the spec's
  expected session count, numbered 1..N in order. Each failure mode
  has a distinct ``ACTION_FAILED_AI_*`` action code
  (`no-creds` / `provider-error` / `bad-output` / `count-mismatch`)
  so the in-extension lazy migrator can surface kind-specific
  notifications. ``RouteResult`` is dumped via ``dataclasses.asdict
  → json.dumps`` before any attribute access (per memory
  `feedback_ai_router_route_result_handling`). Per cross-provider
  design audit (2026-05-17, Option A locked): the route() call site
  lives in Python so the extension subprocesses the same migrator
  for all three strategies.
- **Structured exception classes** (`AiTitleResolutionError` and
  four subclasses) re-exported from `ai_router.migrate_session_state`
  for library callers.
- **10 new pytest cases** under `TestAIStrategy` covering each
  failure mode (missing credentials, 401 unauthorized, 429 rate
  limit, non-JSON output, truncated response, wrong-shape JSON,
  count mismatch with no silent truncate, out-of-order numbering,
  zero-count-state never-calls-route, plus a happy path + markdown
  code-fence stripping). All hermetic — mock `ai_router.route` via
  `sys.modules` injection; no real provider calls.

### Release notes

- **`0.4.0` is the Session 5 GA release.** Published to PyPI in
  lockstep with the dabbler-ai-orchestration extension v0.14.0 so
  operators upgrading the extension see the migration UX (which
  consumes this AI path) at the same time as the AI strategy
  becomes available.
- Schema v3, the bulk migrator, dual-write writers, and the eight
  invariants (all shipped in Sessions 1-4 of Set 030 under the
  0.4.0rc1 RC) are GA in this release.

## [0.4.0rc1] — 2026-05-17 (release candidate, not published)

### Added

- **`session-state.json` schema v3 (Set 030).** Replaces the v2
  progress triple (`currentSession` / `totalSessions` /
  `completedSessions`) with a single canonical `sessions[]` ledger.
  Status terminology unified on `"complete"` at both session and set
  level (the v2 `"done"` / `"completed"` aliases are tolerated on
  read, canonicalized on write). New writes carry `schemaVersion: 3`;
  read-side tolerates v2 indefinitely via `synthesize_v3_from_v2()`.
- **Single normalized progress helper (`ai_router/progress.py`,
  Session 1).** `get_progress()` is the canonical reader path; every
  application reader in `ai_router/` was migrated to it in Session 3
  (close-out gates, the reconciler, `start_session` preflight, the
  cost reporter). Direct reads of the legacy triple are forbidden in
  source under a pytest grep guard (D13 lint rule, also Session 3).
- **8 v3 invariants enforced by writers and readers (Sessions 1-2).**
  `register_session_start` and `_flip_state_to_closed` raise
  `SessionStateInvariantError` (re-exported from `progress`) on every
  rule violation — no silent recovery, no force-close fallback (spec
  D6).
- **Dual-write writers (Session 2).** Writers emit BOTH the v3
  `sessions[]` and the legacy triple (derived, never independently
  maintained) so consumer repos still on v2 readers see no
  disruption. The legacy emission stays in place for the entire
  Set 030 release window (spec D5); a future set may flip "stop
  writing legacy" once consumers confirm v3-reader migration.
- **Bulk migrator CLI (`python -m ai_router.migrate_session_state`,
  Session 4).** One-shot v2→v3 migration. Inferential (force-promote
  closed sets even when `completedSessions[]` was never populated).
  Strategies: `regex` (spec.md headings, default), `generic`
  (`Session N` labels), `ai` (reserved for Session 5),
  `interactive`. Idempotent. Dry-run default; `--in-place` to
  write. JSON output for CI hooks. See
  [`docs/migration-v3-dry-run.md`](../docs/migration-v3-dry-run.md).
- **`spec-title-extraction` task type registered in
  `router-config.yaml` (Session 1, per spec D14).** Pinned to
  `gemini-flash`; not auto-routed; the Session 5 in-extension AI
  fallback consumes it. Landing the task type early removes a
  Session 5 dependency risk.

### Schema

- `session-state.json` now carries `sessions[]` (required, non-empty,
  contiguous from 1, max one `"in-progress"`). The legacy
  `currentSession` / `totalSessions` / `completedSessions` are
  retained as derived dual-write fields.
- See [`docs/session-state-schema.md`](../docs/session-state-schema.md)
  for the canonical v3 reference (rewritten in Session 1).

### Release notes

- **`0.4.0rc1` is the Session 4 release candidate.** Not published to
  PyPI. The GA build (`0.4.0`) ships with Session 5, after the
  in-extension migration UX lands so operators never see broken v2
  state on first contact with the new release. The RC version exists
  so this repo can pin tests against the same wheel shape consumers
  will see after GA.
- Internal smoke test only: `python -m build` + `pip install
  dist/dabbler_ai_router-0.4.0rc1-py3-none-any.whl` from a clean
  venv; do NOT `twine upload`.

## [0.3.2] — 2026-05-16

### Fixed

- **`register_session_start()` now always emits `completedSessions[]` on fresh sets.** Previously, the function omitted the `completedSessions` key entirely when no prior sessions were closed (keeping the snapshot "clean"). This created schema inconsistency: Lightweight-tier orchestrators maintain this array by hand and could not append to a pre-existing `[]` when starting a fresh set. Now the key is unconditionally written (as an empty array on fresh sets), ensuring consistent schema across all sets and tiers. Set 028 Session 1.

### Behavior notes

- 0.3.2 is functionally identical to 0.3.1 for PyPI consumers. The patch bump clarifies that the schema is now normalized; no runtime code path changes.
- Backwards compatible: existing consumers that read `completedSessions` already handle its absence (defaulting to 0 done sessions). Adding an explicit `[]` is semantic no-op for those readers.

## [0.3.1] — 2026-05-16

### Added — repo-only test infrastructure (not in published wheel)
- **Python e2e harness (`ai_router/tests/e2e/`, Set 027).** Three
  modules under the repo's test tree: `fixtures.py` (tmpdir-scoped
  session-set generator with real git working tree + bare remote),
  `harness_cli.py` (thin JSON-over-stdout dispatcher used by the
  TS-side Layer 2 and Layer 3 harnesses), and seven scenario files
  covering happy-path, cancel/restore, force-close, sibling
  worktree, multiset-sequential, and the `register_session_start`
  `completedSessions[]`-loss regression that pinned the v0.1.1
  dabbler-platform incident shut. **These files are excluded from
  the published wheel** by `[tool.setuptools.packages.find]
  exclude = ["ai_router.tests", "ai_router.tests.*"]` — PyPI
  consumers get the same public API as 0.3.0; the harness is only
  available to contributors cloning the repo.
- **`e2e` pytest marker** registered in `pytest.ini` — partition the
  suite via `pytest -m e2e` (full harness) or
  `pytest -m "not e2e"` (fast pre-commit subset). Also repo-only;
  consumers running the wheel see no behavior change.

### Behavior notes (no API change)

- 0.3.1 is functionally identical to 0.3.0 for PyPI consumers. The
  patch bump exists to let the consuming extension declare a
  matching floor; there are no runtime changes between 0.3.0 and
  0.3.1.
- The harness depends on `register_session_start` preserving
  `completedSessions[]` across rewrites. The current writer at
  `session_state.py:148` does so when the field is present; the
  Layer 2 harness pinned a discrepancy on fresh-set writes where
  the key is omitted entirely (downstream readers' `Array.isArray`
  predicate then returns false). Fix deserves a targeted writer
  change in a follow-up set, not 0.3.1.

## [0.3.0] — 2026-05-15

### Removed — BREAKING

- **`outsourceMode: last` daemon infrastructure (Set 026 Session 1).**
  The queue-mediated verifier daemon path is gone end-to-end. Modules
  deleted: `queue_status`, `heartbeat_status`, `queue_db`,
  `queue_verification`, `daemon_pid`, `orchestrator_role`,
  `restart_role`, `role_status`, `capacity`, `verifier_role`.
- **Mode-config public surface:** `ModeConfig`, `OUTSOURCE_MODES`,
  `ROLE_VALUES`, `DEFAULT_OUTSOURCE_MODE`, `parse_mode_config`,
  `read_mode_config`, `validate_mode_config`.
- **Queue/daemon public surface:** `QueueDB`, `QueueMessage`,
  `DuplicateIdempotencyKeyError`, `VerifierDaemon`,
  `OrchestratorDaemon`, `FollowUpRequested`,
  `ORCHESTRATOR_TASK_TYPES`, `TASK_VERIFICATION_FOLLOWUP`,
  `TASK_VERIFICATION_REJECTED`, `UnknownTaskTypeError`,
  `make_dispatch_verifier`, `make_worker_id`, `process_one_message`,
  `run_verification`, `HEARTBEAT_INTERVAL_SECONDS`,
  `DEFAULT_POLL_INTERVAL_SECONDS`, the `daemon_pid` PID-file helpers,
  and `QUEUE_DEFAULT_BASE_DIR`.
- **`route()` parameters:** `mode=` and `queue_base_dir=` are gone.
  `route()` is now synchronous-only. `RouteResult` no longer has
  `pending`, `message_id`, or `queue_provider` fields.
  `VerificationResult` no longer has those fields either.
- **`close_session` CLI:** `--timeout` flag removed; exit code 4
  (`verification_timeout`) removed; queue-message-citation repair
  case removed; `_wait_for_verifications` no longer called.
- **`disposition.verification_method`:** value `"queue"` removed.
  Surviving methods are `"api"`, `"manual"`, and `"skipped"`.
  `verification_message_ids` is now required to be empty for every
  method (kept as a list field for schema stability).
- **`ai_router/docs/two-cli-workflow.md`** removed.
- **`reconciler.py`:** `rerun_verification_timeout` action removed.

### Changed

- **`cost_report.py`** simplified — removed the subscription-utilization
  block (`_build_subscription_utilization`, `_print_outsource_last_report`)
  and the mode-aware branch in `get_costs` / `print_cost_report`. JSON
  output no longer carries the `outsource_mode` or
  `subscription_utilization` keys.
- **`close_out.py`** simplified — single-path implementation that
  routes a fresh turn via `route_fn`. The mode-aware
  outsource-last-skip-route branch is gone; `close_session_runner`
  injection point is gone.

### Notes — Partial state (Session 1)

Set 026 Session 1 scrubbed the code surface and all active docs.
The acceptance criterion
`git grep -i 'outsourcemode\|queue_db\|verifier daemon\|subscription cli'`
returning zero hits is satisfied as of the Session 1 close commit.

### Added (Session 2 — budget-dialog simplification)

- **`verification_nte_usd` field in `budget.yaml`** — operator-stated
  not-to-exceed ceiling for cumulative API verification spend.
  Defaults to `threshold_usd` if absent. The orchestrator reports
  running spend against this ceiling at every session stop; if the
  ceiling is reached mid-session it switches to
  `manual-via-other-engine` rather than failing.
- **`ai_router/budget.yaml`** created for this repo with
  `threshold_usd: 10`, `verification_nte_usd: 10`,
  `verification_method: "api"`.

### Changed (Session 2 — budget-dialog simplification)

- **`docs/adoption-bootstrap.md` Step 5** — the four-tier budget
  dialog (less-than-$20 / $20–$99 / $100+, each with a different
  explanation) is replaced by a single NTE ask backed by empirical
  range data ($0.05–$0.80/call; 3-session set $0.15–$2.50). The
  $0 special case (manual vs. skipped) is unchanged. The
  tier-to-mode mapping comment in the field reference is preserved
  for backward compatibility.
- **`docs/ai-led-session-workflow.md`** — the four-row budget tier
  table collapses to two rows (zero-budget / non-zero budget);
  the 50%-of-threshold tier-upgrade prompt row is gone; the
  "What this means at session execution time" section now documents
  `verification_nte_usd` behavior.

### Added (Session 3 — YAML schema + Python reader + resolver abstraction)

- **`ai_router/secret_resolver.py`** — new module exporting
  `resolve_secret(name, source="env") -> str | None` and
  `register_backend(name, fn)`. The env-var backend is the only
  backend in Set 026; additional backends (secretStorage, keyring,
  etc.) can be registered by future sets without touching callers.
  Exported from the package public surface alongside `register_backend`.
- **`ai_router/migrate_router_config.py`** — idempotent forward
  migration script for `router-config.yaml` and `budget.yaml`. Injects
  `display_label`, `enabled` per provider, `routing.outsourcing_mode`,
  renames `threshold_scope` → `scope`, and injects `warn_at_percent: 80`.
  Preserves YAML comments via `ruamel.yaml` AST round-trip. Exit codes:
  0 = success/no-op, 1 = parse error. Run with
  `python -m ai_router.migrate_router_config`.
- **`ruamel.yaml>=0.18`** added to `requirements.txt`.

### Changed (Session 3)

- **`ai_router/router-config.yaml`** — `display_label` and `enabled`
  added to each provider block (`anthropic`, `google`, `openai`);
  `routing.outsourcing_mode: whenever-helpful` added to the `routing:`
  block. These fields are consumed by the Set 026 Session 4 config
  editor webview.
- **`ai_router/budget.yaml`** — `threshold_scope: project-lifetime`
  renamed to `scope: per-project`; `warn_at_percent: 80` injected (via
  migration script).
- **`ai_router/config.py`** — now applies Set-026 field defaults on
  load (`display_label`, `enabled`, `routing.outsourcing_mode`);
  validates `models.<id>.provider` against the `providers:` block;
  reads `ai_router/local-overrides.yaml` if present and merges per
  Appendix B precedence rules (local > shared > default). API-key
  validation now goes through `resolve_secret` instead of direct
  `os.environ.get`.
- **`ai_router/providers.py`** — all three provider callers
  (`_call_anthropic`, `_call_google`, `_call_openai`) now look up API
  keys via `resolve_secret` instead of `os.environ[...]`.

### Added (Session 6 — significance flagging)

- **`ai_router/decision_review_queue.py`** — reader for the per-session-set
  `decision-review-queue.jsonl`. Exports `read_queue(session_set_dir)
  -> list[dict]` and `clear_queue(session_set_dir) -> int`. The queue is
  populated by two VS Code extension surfaces (`dabbler.flagDecisionForReview`
  and `dabbler.scanAnnotationsForActiveSet`); orchestrators consume it
  at session start to surface flagged decisions in the planning
  checklist. Schema is intentionally open — callers look up fields
  defensively rather than assuming a fixed shape.
- **`DECISION_REVIEW_QUEUE_FILENAME`** constant (`"decision-review-queue.jsonl"`)
  exported alongside the read/clear surface.

## [0.2.x] and earlier

Prior versions of `ai_router` did not maintain a CHANGELOG.md. The
0.3.0 entry above is the first formal release-notes entry. Refer to
`docs/session-sets/0NN-*/change-log.md` for the per-set narrative
history.
