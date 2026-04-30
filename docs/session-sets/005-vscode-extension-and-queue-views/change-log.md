# Set 005 — VS Code Extension: Queue Views + Provider Heartbeats (Change Log)

**Status:** complete · 3 of 3 sessions verified
**Started:** 2026-04-30 · **Completed:** 2026-04-30
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifier:** gemini-pro (Google) — all sessions

This set surfaced the outsource-last infrastructure landed in Sets 1–4
inside the VS Code extension. No new data sources or router behavior:
the extension just makes the existing SQLite queues, capacity-signal
JSONL files, and `outsourceMode` spec field visible at a glance.
Heartbeat data is framed strictly as **observational only** throughout
— per the cross-provider review of the v1 plan, predictive framings
(remaining subscription window, throttle risk, "is this provider
healthy") were rejected.

## Summary of changes

### Session 1 — Python helpers (`queue_status` + `heartbeat_status`) and manifest scaffold

- New module `ai-router/queue_status.py`:
  - `collect_status()` walks `<base_dir>/<provider>/queue.db` and emits
    the schema `{providers: {<name>: {queue_path, queue_present, states,
    messages}}}`. Reads via short-lived `QueueDB` connections so daemon
    writers are not starved.
  - `get_payload()` returns the full payload of a single message for
    the extension's Open Payload action.
  - Two emergency-intervention paths:
    - `mark_failed(message_id)` forces `state='failed'` regardless of
      lease ownership — operator escape hatch for a stuck claim with a
      live lease.
    - `force_reclaim(message_id)` releases a stuck claim back to
      `state='new'` and bumps `attempts`.
    Both interventions use `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`
    directly rather than the ownership-checked `QueueDB` methods.
  - CLI flags: `--workspace`, `--base-dir`, `--provider`, `--state`,
    `--limit`, `--format text|json`, `--mark-failed`, `--force-reclaim`,
    `--get-payload`.
- New module `ai-router/heartbeat_status.py`:
  - `collect_status()` reads `capacity_signal.jsonl` via the existing
    `read_capacity_summary()` (Set 4) and emits per-provider
    `{signal_path, signal_file_present, last_completion_at,
    minutes_since_last_completion, completions_in_last_<N>min,
    tokens_in_last_<N>min, lookback_minutes, _disclaimer}`. Field
    names embed the lookback value so an extension tree label can
    read e.g. `completions_in_last_60min` directly without iterating
    into the payload to discover N.
  - `DISCLAIMER` constant ("Observational only; subscription windows
    are not introspectable.…") is duplicated at both top level and per
    provider so a consumer rendering only one provider still sees it.
  - CLI flags: `--workspace`, `--base-dir`, `--provider`,
    `--lookback-minutes`, `--format text|json`.
- `tools/dabbler-ai-orchestration/package.json`:
  - Added view containers `dabblerProviderQueues` and
    `dabblerProviderHeartbeats` under the existing
    `dabblerSessionSetsContainer`.
  - Registered command IDs (`refresh`, `openPayload`, `markFailed`,
    `forceReclaim`) as placeholders for Sessions 2 and 3.
  - Added `view/title` and `view/item/context` menu entries.
  - Added six configuration settings:
    - Queues: `autoRefreshSeconds`, `pythonPath`, `messageLimit`.
    - Heartbeats: `autoRefreshSeconds`, `lookbackMinutes`,
      `silentWarningMinutes`.
- Tests: `ai-router/tests/test_queue_status.py` (23 tests) and
  `ai-router/tests/test_heartbeat_status.py` (11 tests). Full
  ai-router suite (591 tests) passes with no regressions.
- Verifier (Gemini Pro) flagged three substantive issues:
  - **Major:** `force_reclaim` set
    `failure_reason='manual_force_reclaim_via_queue_status'` while
    moving a message from `claimed` back to `new`. A reclaimed message
    is being retried, not failed — leaving `failure_reason` populated
    on a non-terminal row muddles audit reads. Resolution: write
    `failure_reason = NULL`. Operator-audit lives in command history,
    not on the row; a comment in the source explains the choice.
  - **Major:** `heartbeat_status.collect_status` had a redundant
    `if/else` where both branches reduced to `providers =
    [provider_filter]`. Resolution: collapsed to a single statement.
  - **Suggestion:** `_print_text` reconstructed embedded-N field names
    from the function argument rather than the payload itself.
    Resolution: derive `n` from `info['lookback_minutes']` inside the
    loop, fall back to the function argument only as a default.

### Session 2 — `Provider Queues` tree view

- New module `src/utils/pythonRunner.ts`: shared spawn helper for
  `python -m <module>`. Resolves the configured Python via
  `dabblerProviderQueues.pythonPath`; relative paths are
  workspace-relative so a checked-in `.venv/Scripts/python.exe` works
  without machine-specific config. Always resolves with `{stdout,
  stderr, exitCode, signal, timedOut}`; never throws so the tree-view
  caller can render an error info node without try/catch noise. 10s
  default timeout.
- New module `src/providers/ProviderQueuesProvider.ts` implementing
  `vscode.TreeDataProvider`. Tree shape: root → providers (alphabetic)
  → state buckets (lifecycle order: `new`, `claimed`, `completed`,
  `failed`, `timed_out`) → message nodes.
  - Risk mitigation per spec: 5s result cache (`CACHE_TTL_MS`) so a
    tree expand/collapse cycle does not re-spawn Python; concurrent
    `getChildren()` calls fold onto a single in-flight promise.
  - State-bucket message lists are filtered from the per-provider
    message slice; if `count` exceeds the slice size (Python
    `--limit`), an info node `… N more not shown` is appended so the
    operator never assumes the queue is shorter than reality.
  - Codicons by state (`circle-large-outline`, `sync`, `pass`,
    `error`, `watch`).
  - Message tooltip includes id, task_type, session_set, attempts,
    `claimed_by`, `lease_expires_at`, `completed_at`. Single-click on
    a message routes to `dabblerProviderQueues.openPayload` (same as
    right-click).
- New module `src/commands/queueActions.ts` with three commands and a
  content provider:
  - **Open Payload:** `queue_status --get-payload`, renders the JSON
    into a `dabbler-queue-payload://` virtual document (read-only by
    construction; payloads must not be mutated mid-flight).
  - **Mark Failed:** modal confirmation + `queue_status --mark-failed`;
    refuses non-existent or terminal messages via the Python helper's
    existing checks.
  - **Force Reclaim:** modal confirmation + `queue_status
    --force-reclaim`; refuses non-claimed messages.
  - Both interventions surface success/failure via VS Code
    information/error messages and refresh the tree.
- `src/extension.ts`: registered the tree provider, the manual
  `dabblerProviderQueues.refresh` command, a configurable auto-poll
  (`autoRefreshSeconds`, default 15s, `0` disables, rebinds on settings
  change), and the three queue-action commands.
- Tests: `src/test/suite/providerQueues.test.ts` (14 tests) covering
  tree-shape contract, tree-item rendering, and `parseFetchResult` JSON
  parser.
- Verifier (Gemini Pro): VERIFIED with no substantive findings.

### Session 3 — `Provider Heartbeats` view + mode badges + polish

- New module `src/providers/ProviderHeartbeatsProvider.ts` implementing
  `vscode.TreeDataProvider<HeartbeatTreeNode>`. Tree shape: root →
  per-provider leaf nodes (no further expansion; each row carries its
  own description and tooltip). Shells out to `python -m
  ai_router.heartbeat_status --format json` via the existing
  `pythonRunner`; reuses `dabblerProviderQueues.pythonPath` so users
  configure Python once.
  - Same caching shape as the queues provider (5s TTL, in-flight-promise
    dedupe), keyed on `(root, lookback)` so changing `lookbackMinutes`
    invalidates immediately.
  - `parseFetchResult` normalizes the helper's embedded-N field names
    (`completions_in_last_60min`) into a stable shape via
    `normalizeProvider`; defensively falls back to the requested
    lookback if the payload disagrees with the request — protects
    against a future helper version that ignores or rounds the
    `--lookback-minutes` flag.
  - `isSilent` treats both "no signal file" and "completions never
    recorded" as silent. The operator cannot distinguish "never ran"
    from "stopped" without other context, and either way the provider
    has not produced anything.
  - Per-row icon: `pulse` when active, `warning` when silent.
  - Exported `HEARTBEAT_FOOTER` constant for the view-description
    footer.
- `src/extension.ts`: registered the heartbeats provider via
  `vscode.window.createTreeView` (rather than
  `registerTreeDataProvider`) so the view's `description` field can
  hold `HEARTBEAT_FOOTER` at the view header at all times. Wired the
  `dabblerProviderHeartbeats.refresh` command and a configurable
  auto-poll (default 15s; `0` disables; rebinds on settings change).
- `src/types.ts`: added `OutsourceMode = "first" | "last"` and threaded
  `outsourceMode: OutsourceMode` through `SessionSetConfig`. Default
  `"first"` matches the AI router's documented backward-compat default.
- `src/utils/fileSystem.ts`: extended `parseSessionSetConfig` to read
  `outsourceMode` from the same yaml block it already scans. Accepts
  only `first` or `last`; anything else falls back to `first`.
- `src/providers/SessionSetsProvider.ts`: new exported `modeBadge()`
  returning `[FIRST]` / `[LAST]` from `set.config.outsourceMode`.
  Inserted into the `bits.join` chain on each session-set row's
  description and added a `Mode: outsource-<mode>` line to the row
  tooltip's config block. Backward-compat: existing repos with no
  spec changes render as `[FIRST]`.
- `tools/dabbler-ai-orchestration/README.md`: new `Provider Queues`
  and `Provider Heartbeats` feature sections (the latter prominently
  flagging the observational-only framing in a blockquote), a `Mode
  badges` note under `Session Set Explorer`, an `Outsource modes`
  subsection explaining `first` vs. `last` semantics, six new rows in
  the Extension Settings table, and `outsourceMode` in the example
  `Session Set Configuration` block.
- Bumped extension version `0.10.0` → `0.11.0`; added a 0.11.0
  CHANGELOG entry.
- Tests: 26 new tests across
  `src/test/suite/providerHeartbeats.test.ts` (19) and
  `src/test/suite/modeBadge.test.ts` (7).
- Verifier (Gemini Pro): VERIFIED with one suggestion. The
  `dabblerProviderHeartbeats` config-change listener was rebinding the
  poll for any of three settings even though only `autoRefreshSeconds`
  drives the `setInterval`. Resolution: split the conditional —
  `affectsTiming` gates `rebindHeartbeatsPoll`, `affectsTiming ||
  affectsContent` gates the refresh.

## Acceptance criteria — all met

- [x] All three sessions complete with verified deliverables.
- [x] Provider Queues tree view renders queue state and supports
  right-click actions (Open Payload, Mark Failed, Force Reclaim).
- [x] Provider Heartbeats view shows last-seen timestamps with
  explicit "observational only" framing in the view-description
  footer.
- [x] Mode badges (`[FIRST]` / `[LAST]`) visible on existing
  session-set items.
- [x] Extension's existing functionality unchanged (Sessions 1–2
  scaffold and Session 3 changes are purely additive on the consumer
  side; backward-compat default preserves the rendering for specs
  with no `outsourceMode`).
- [x] No marketplace-blocking issues (manifest validates via
  `vsce ls`; `vsce package` produces
  `dabbler-ai-orchestration-0.11.0.vsix`).

## Test status

- `npx tsc --noEmit`, `npm run compile`, `vsce ls`, `vsce package`:
  all pass across all three sessions.
- Python suite: 591 tests pass; 34 new tests added in Session 1.
- TypeScript test suites: 40 new tests written across Sessions 2 and 3
  against the same `suite()` / `test()` shape as the existing
  `metrics.test.ts` and `fileSystem.test.ts`. The Electron-based
  harness (`@vscode/test-electron`) is blocked by a pre-existing
  Windows-launcher problem unrelated to this set (Code.exe rejects
  the runner's `--no-sandbox` / `--user-data-dir` flags). Same harness
  was non-functional during Set 4. Tracked as a follow-up; tests will
  run once the harness is unstuck.

## Cross-provider verification cost (this set)

| Session | Cost |
|---|---|
| 1 — code-review | $0.0332 |
| 2 — code-review | $0.0173 |
| 3 — code-review | $0.0185 |
| **Total** | **$0.0690** |

All verifications routed to `gemini-pro` (Google) per session
instruction.
