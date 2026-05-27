# Changelog — `dabbler-ai-router`

All notable changes to the `ai_router` Python package are documented
here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.11.0] — 2026-05-27 (Set 049 — Orchestrator coordination removal)

Rips out the hard-coordination layer shipped in Set 033 (0.6.0) and
refined in Set 036 (0.7.0). The `orchestrator` block on the per-session
ledger reshapes from 7 fields to 4 (`engine`, `provider`, `model`,
`effort`) with an omit-null writer pattern. The `new_chat_id` CLI is
retired; vestigial flags survive as accept-with-warning for backward
compatibility. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.24.0`.

### Breaking

- **`python -m ai_router.new_chat_id` CLI removed.** The module is
  gone; consumers calling it directly will get `ModuleNotFoundError`.
  No replacement — the chatSessionId concept it served is retired.
- **Orchestrator block fields `chatSessionId`, `checkedOutAt`,
  `lastActivityAt` no longer written.** The on-disk shape drops these
  3 fields. Readers ignore them on legacy files; the
  `migrate_v3_to_v4` migrator strips them from historical files on
  invocation.
- **Exit code `EXIT_CHECKOUT_CONFLICT` retired.** `start_session` no
  longer emits this code. The two-different-holders case that it
  guarded against is no longer a refusal scenario.
- **Holder-identity / takeover-prompt / Read-Only-Mode contracts
  retired.** `start_session` no longer interrogates the prior
  orchestrator block; any caller can claim a not-in-flight session
  regardless of who ran the previous one. Within-set sequential
  (one in-progress session per set) is still enforced.

### Changed

- **`start_session` writer reduced.** Removed
  `EXIT_CHECKOUT_CONFLICT`, `prior_engine_provider` matching, takeover
  modal / TTY prompt, `_coordination_enforced()` gate, and the
  `orchestrator_chat_session_id` writer parameter. The orchestrator
  block emitter applies omit-null on the 4-field result.
- **CLI backward compatibility — accept-with-warning (T2).**
  `start_session --chat-session-id <id>` (and any other vestigial
  flag) is accepted by argparse and ignored by the writer with a
  single stderr line per invocation:

  ```
  start_session: --chat-session-id is no longer used (Set 049); ignoring
  ```

  Consumer-repo hooks that still pass the flag keep working without
  modification. The flag will be removed in a future major release.
- **`close_session` simplified.** Check-in branch removed. The
  per-session orchestrator block stays attached to its `sessions[i]`
  entry as a historical record (no top-level clearing).
- **`migrate_v3_to_v4` extended with T4 sweep+normalize.** Strips
  `chatSessionId`, `checkedOutAt`, `lastActivityAt` from all
  orchestrator blocks (top-level legacy + per-session ledger) during
  the migration pass. Idempotent on already-clean v4 files. `.bak`
  rollback preserved.
- **`writer-bypass` detector (D3) kept, decoupled.** Survives in
  `ai_router/joiner/conflicts.py` as a general writer-discipline
  check, documented as engine-independent. Its sibling detectors
  (`bare-touch` / `engine-mismatch` / `stale-checkout-touch`) are
  retired — see Removed below.

### Removed

- **`ai_router/new_chat_id.py`** — whole CLI retired.
- **`ai_router/joiner/conflicts.py` D1/D2 detectors** —
  `bare-touch` (incompatible with omit-null engine field),
  `engine-mismatch` and `stale-checkout-touch` (both depended on
  `lastActivityAt`). `ConflictKind` Literal narrowed to
  `"writer-bypass"` only.
- **`session_events.py` holder_change + checkout_conflict
  emission** — event-type-emission calls deleted; existing JSONL
  entries in legacy ledgers are left intact (audit history).
- **Tests retired (whole-file):**
  `test_chatsessionid_writer.py`, `test_checkout_writer.py`,
  `test_start_session_takeover_prompt.py`, `test_new_chat_id.py`.
  `test_joiner_conflicts.py` reduced to writer-bypass coverage only.

### Kept

- `~/.dabbler/orchestrator-writer.log` — retained as a generic
  "start_session ran" audit appender. May be retired in a future
  stability set if it proves dead.

## [0.10.0] — 2026-05-27 (Set 048 — Lightweight-tier parity)

End-to-end Lightweight parity with Full shipped across 5 sessions.
Adds `--no-router` mode with three-knob precedence (CLI flag >
`DABBLER_NO_ROUTER` env > spec.md `tier: lightweight` > default Full).
`route()` / `verify()` prologues short-circuit to zero-cost stubs
without `_init()` (no config load, no credentials needed).
`close_session` gains a manual-attestation block + soft gate for
`external-verification.md` with TTY/non-TTY branching and
`--accept-suggestions` non-interactive flag. Tri-state `requiresUAT` /
`requiresE2E` schema (`true | false | "suggested"`) on both Full and
Lightweight. `spec.md` `tier: full | lightweight` field with
backwards-compat default to `full`. New
`python -m ai_router.migrate_lightweight_to_canonical_v4` CLI handles
three Lightweight non-canonical shapes (`sessionLog[]` → `sessions[]`,
`done`/`completed` status aliases, missing schemaVersion) with
`.lwbak.json` backup. S5 UAT discovered and fixed a Critical
bare-import bug: production-code bare imports of `runtime_mode` /
`spec_config` (left over from S2's test-conftest convention) raised
`ModuleNotFoundError` under pip-install consumers, silently no-op'ing
`--no-router` across the entire CLI surface; the fix uses relative
imports and the bug is locked out by a new static-analysis test.
Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.23.0`.

## [0.9.0] — 2026-05-26 (Set 047 — state-file schema v4 audit)

v4 evolution of `session-state.json` shipped end-to-end across 6
sessions. Derives every legacy top-level lifecycle field
(`currentSession` / `totalSessions` / `completedSessions` /
`lifecycleState` / `startedAt` / `completedAt` / `orchestrator` /
`verificationVerdict`) from a per-session `sessions[]` ledger where
each entry carries its own `startedAt` / `completedAt` /
`orchestrator` / `verificationVerdict`. Reader-first migration via
`normalize_to_v4_shape(state, spec_md_path)` shim that accepts
v1/v2/v3/v4 input transparently. New `python -m ai_router.migrate_v3_to_v4`
CLI with `.bak` rollback contract and documented rollback procedure
at `docs/v3-to-v4-rollback-procedure.md`. All Python writers
(`register_session_start` / `_flip_state_to_closed` /
`cancel_session_set` / `restore_session_set`) emit canonical v4
on-disk shape. New `spec.md` `prerequisites:` field surfaced via the
extension's `[BLOCKED BY PREREQS]` badge. Companion VS Code
Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.22.0`.

## [0.8.0] — 2026-05-25 (Set 045 — log-harvest implementation)

Dual-primary observability surface per Set 044's consensus-locked
proposal v1 shipped end-to-end across 6 sessions. New
`python -m ai_router.joiner` CLI is the async-shell-out the
extension calls to populate Session Set Explorer harvested-signal
badges (W / N / M / B for wrapper-launched / native-log /
narration-marker / writer-bypass) plus coordination-conflict pills
(engine-mismatch / bare-touch / stale-checkout-touch / writer-bypass).
Wrapper-launched detection and native-log parsing serve as co-equal
channels (Pass B framing-bias correction). Joiner output schema
documented for cross-tier consumer-repo paste-in. Companion VS Code
Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.21.0`.

> Note: The Set 045 Explorer surface (harvest badges + conflict pills)
> was reverted in Set 049 per operator-locked P4. The joiner CLI and
> its `writer-bypass` detector survive; the badge/pill rendering does
> not.

## [0.7.0] — 2026-05-24 (Set 036 — chatSessionId identity refinement + watcher-scope discipline)

Refines the Set 033 H4 holder-identity composite from
`engine + provider` to `engine + provider + chatSessionId` so two
distinct chats on the same engine are recognized as different holders.
Ships the per-set lifecycle lock (Q5 prerequisite) that serializes
`start_session` and `close_session` against each other across the
migration window. Ships the `new_chat_id` CLI as the agent-facing
token source for orchestrators with no native per-chat metadata
surface. Adds the `closeout_succeeded` event payload's Q4 audit-trail
extension. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.20.0`.

### Added

- **`chatSessionId` field on the `orchestrator` block.** New nested
  field, `string | null`. Strict-on-write (every new write populates
  the key; `--chat-session-id` arg, `$CHAT_SESSION_ID` env, or
  None). Tolerant-on-read for legacy state (key absent OR value
  None is treated as same-holder for engine + provider matches).
- **`start_session --chat-session-id <value>` CLI argument.**
  Defaults to `$CHAT_SESSION_ID` env when unset. Refines the H3
  holder-identity predicate to the H4 triple composite. Refusal
  stderr names both holders' chatSessionIds (or "no chat session ID
  recorded" for legacy).
- **`start_session` TTY-interactive takeover prompt (Q3).** When
  stdin AND stderr are both TTYs, a chatSessionId-only mismatch
  surfaces a 3-line menu (Take Over / Open in Read-Only Mode /
  Cancel) on stderr instead of refusing outright. Engine+provider
  mismatches stay on the non-interactive refusal path.
  - New exit code `EXIT_LOCK_CONTENTION = 5` (lifecycle lock
    contention; 30s default poll).
  - New exit code `EXIT_READ_ONLY = 6` (operator chose Read-Only
    Mode at the TTY prompt).
- **`ai_router.new_chat_id` CLI (Q1 fallback).** Mints a UUID v4
  per chat for orchestrators with no native session-id surface
  (Codex CLI, Gemini Code Assist, GitHub Copilot, manual Lightweight
  tier). Plain mode prints the UUID; `--export` emits a shell-eval-
  able line; `--shell bash|powershell|fish` selects syntax (default:
  detect via `$SHELL` first, then platform fallback). Idempotent
  within a shell session: existing non-empty `$CHAT_SESSION_ID`
  short-circuits the mint.
- **Per-set lifecycle lock (Q5).** `close_lock.py` renamed
  `.close_session.lock` → `.lifecycle.lock`; both `start_session`
  and `close_session` dual-acquire it (legacy `.close_session.lock`
  alias survives one release on read). `start_session` polls 30s
  before exiting `EXIT_LOCK_CONTENTION = 5`; `close_session` keeps
  its existing immediate exit-3 contract on contention.
- **`closeout_succeeded` event payload extension (Q4).** Now carries
  `chatSessionId`, `engine`, `provider`, `model` snapshotted from
  the orchestrator block BEFORE block-clear. Legacy state files
  without a block degrade gracefully by omitting the four identity
  fields rather than emitting empty strings.

### Changed

- **Holder-identity equality** is now the
  `engine + provider + chatSessionId` triple composite. Two chats
  with the same engine + provider but different chatSessionIds are
  now recognized as different holders (they would have silently
  collapsed onto a single holder under the Set 033 base composite).
- **`start_session` refusal message** names the existing
  chatSessionId (or "no chat session ID recorded" for legacy) and
  the two release paths.
- **Force-override audit log** carries both holders' chatSessionIds
  (or sentinels for legacy).

### Migration

- **Pre-0.7.0 state files** (no `chatSessionId` key in the
  orchestrator block) are tolerated on read. The first new write
  from any caller populates the field strictly. Legacy data is
  also tolerated when the field is present but value is `null`
  (Set 036+ writer's no-ID-at-write-time shape).
- **Lock-file path migration.** `.lifecycle.lock` is the new name;
  `.close_session.lock` survives as a read-only alias for one
  release window (`LEGACY_LOCK_FILENAME` in `close_lock.py`).
  External scripts that monitored the old lock filename should be
  updated to consult either name. Schedule for alias retirement
  TBD in a follow-on patch.

### Release notes

- **No breaking changes** to consumers that don't read the
  `orchestrator.chatSessionId` field. The field is additive; the
  tolerant-on-read contract preserves Set 033 behavior for state
  files written before 0.7.0.
- **Schema version unchanged** (still v3). The `chatSessionId`
  nests under the existing `orchestrator` block; no top-level
  structural change.

## [0.6.0] — 2026-05-21 (Set 033 — orchestrator check-out / check-in)

Ships the writer side of the check-out / check-in coordination
model anchored in `session-state.json`'s `orchestrator` block, per
the Set 032 audit verdicts. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.18.0`.

### Added

- **`start_session` hard-coordination gate (H3 + H4).** New exit
  code `EXIT_CHECKOUT_CONFLICT = 4` fires when the existing
  `orchestrator` block on `session-state.json` names a different
  `engine + provider` (H4 identity composite) than the caller and
  `--force` is not set. The refusal stderr names both the current
  holder and the two release paths (`--force`, "Release Check-Out"
  Command Palette action) so the operator can act without consulting
  external docs.
- **`--force` flag on `start_session` CLI.** Authority handoff;
  rewrites `checkedOutAt` to now and appends an audit line to
  `~/.dabbler/orchestrator-writer.log` (best-effort; failure to
  write the log does not block the override).
- **Nested timestamps on the `orchestrator` block (OQ1).**
  - `checkedOutAt` — set on fresh check-out / preserved across
    same-holder re-attach.
  - `lastActivityAt` — bumped on every write.
- **Cross-tier check-in.** `close_session` (via
  `_flip_state_to_closed`) clears the `orchestrator` block to
  `null` on every successful close, mid-set and final alike. The
  session boundary IS the release point. **Idempotent** — a close
  on a set whose block is already `null` lands the same write and
  reports `succeeded`.

### Changed

- **Holder-identity equality** is the `engine + provider` composite
  (H4). Two orchestrators with the same `engine + provider` but
  different `model` (e.g., `claude-opus-4-7` vs.
  `claude-sonnet-4-6` both on `claude + anthropic`) are treated as
  the same holder; model and effort update in place on a same-
  holder re-attach without resetting `checkedOutAt`.
- **Documentation aliases (OQ2).** In operator-facing prose,
  `work_checked_out` ↔ `work_started` and `work_checked_in` ↔
  `closeout_succeeded`. The ledger event names in
  `session-events.jsonl` are unchanged (no schema break).

### Migration

- **In-flight sets without `checkedOutAt`** (state files written by
  pre-0.6.0 writers that are still mid-set when 0.6.0 lands) are
  tolerated on read. The next `start_session` call from the same
  holder populates `checkedOutAt` with the current time — a one-
  time loss of fidelity (the actual original check-out moment is
  unknown) in exchange for not forcing a synchronous migration of
  every in-flight set across consumer repos.
- **Stranded check-outs** (state file says held but the holder is
  gone): use `start_session --force` from the would-be next holder,
  or "Release Check-Out" from the VS Code Command Palette. Both
  log the authority handoff to
  `~/.dabbler/orchestrator-writer.log`. See
  [`ai_router/docs/close-out.md`](docs/close-out.md) Section 4.

### Release notes

- **No breaking changes** to consumers that don't read the
  `orchestrator` block directly. The block grew two new nested
  fields and is now cleared on close (was: stayed populated
  between sessions). Consumers that scanned `session-state.json`
  to derive the current holder will start seeing `null` between
  sessions; if that breaks anything, the holder identity is
  derived from `session-events.jsonl` (`work_started` for the
  highest open session number).
- **Schema version unchanged** (still v3). The two new fields nest
  under the existing `orchestrator` block; no top-level structural
  change.
- **Tier symmetry preserved.** Full tier writers do the check-in
  automatically; Lightweight tier humans write `orchestrator: null`
  by hand at the same boundary alongside the manual
  `completedSessions[]` update.

### Reference

- [`docs/session-state-schema.md`](../docs/session-state-schema.md)
  "Check-out / check-in (Set 033)" — full schema + holder identity
  + invariants
- [`ai_router/docs/close-out.md`](docs/close-out.md) Section 4 —
  stranded-check-out recovery; Section 2 — check-in side effect
- [`docs/ai-led-session-workflow.md`](../docs/ai-led-session-workflow.md)
  "Orchestrator check-out / check-in (Set 033)" — workflow-level
  invariants
- [`docs/cross-repo-checkout-notice.md`](../docs/cross-repo-checkout-notice.md)
  — one-time consumer-repo CLAUDE.md insertion text

## [0.5.1] — 2026-05-19

### Fixed

- **`ruamel.yaml` packaging gap (pre-existing since Set 026 Session 3).**
  `ai_router/migrate_router_config.py` has imported `ruamel.yaml`
  at module load time since commit `fc2d117` (2026-05-12), but the
  dep was never declared in `pyproject.toml`. A fresh
  `pip install dabbler-ai-router` would `ModuleNotFoundError` on any
  attempt to `import ai_router.migrate_router_config` (including the
  three `test_migrate_router_config_*` test modules at collection
  time, and the supported `python -m ai_router.migrate_router_config`
  CLI invocation). 0.5.1 fixes both surfaces:
  - `migrate_router_config.py` now imports `ruamel.yaml` lazily via
    `_require_ruamel()`, called at the top of `migrate()`. The
    module itself imports cleanly without `ruamel.yaml` installed;
    users who actually invoke the migrator without the dep get a
    clear remediation message pointing at the `[migration]` extras
    group below.
  - `pyproject.toml` declares a new
    `[project.optional-dependencies].migration = ["ruamel.yaml>=0.17"]`
    extras group (install via `pip install dabbler-ai-router[migration]`).
    The `[tests]` group also picks up `ruamel.yaml>=0.17` so the
    test suite works on a clean `pip install -e .[tests]`.

### Release notes

- **Bug-only patch release.** No new features, no schema changes —
  the `decision_consensus` V1 schema from 0.5.0 ships unchanged.
- **Backwards compatibility.** The lazy-import refactor preserves the
  module's public API (`migrate()`, `main()`); only the import-time
  side-effects change. No consumer code calling
  `from ai_router.migrate_router_config import migrate` is affected.
- **Why this didn't fix 0.4.0 retroactively.** PyPI doesn't allow
  re-uploading the same version. `0.4.0` (and earlier) ship the
  pre-existing bug; users on those versions can either upgrade to
  0.5.1 or `pip install ruamel.yaml` manually as a workaround.

## [0.5.0] — 2026-05-19

### Added — Set 031 deliverables

- **`delegation.decision_consensus` config sub-block** in
  `ai_router/router-config.yaml`. Opt-in (default `enabled: false`,
  every existing repo unchanged) routing of in-session design /
  architecture / process decisions through cross-provider consensus
  *before* falling back to `AskUserQuestion`. V1 default categories
  are the four mechanical, high-convergence ones
  (`refactor-placement`, `file-layout`, `scoping`,
  `spec-clarification`); V1.5 adds `testing-strategy` + `api-surface`;
  V2 adds `design` + `architecture` once convergence on the narrower
  set has been observed. `unresolved_action` (`ask_user` |
  `proceed_with_orchestrator_judgment`) controls the fallback when
  the consult engines do not agree. `engines` is independent of
  `verification.preferred_pairings` — the two roles (verify vs.
  consult) may want different model pairings.
- **Schema validation in the config loader.** `_validate_decision_consensus`
  is invoked at the `load_config` boundary and rejects: invalid engine
  strings (`provider:model` parse + cross-check against the configured
  `models:` table, with model entries that omit `provider` rejected per
  the S1 Round-A finding), unrecognized category slugs (whitelist
  covers V1 + V1.5 + V2), bad `unresolved_action` enum values, and
  non-writable `journal_path` / `journal_full_payloads_dir` values.
  Unknown sub-keys are tolerated with a one-time warning per load,
  matching the existing config loader's forward-compatibility posture.
- **`ai_router/consensus_journal.py`** — JSONL writer for the
  per-decision audit trail. `ConsensusRecord` dataclass + atomic
  append (`append_record`: POSIX append + flush + best-effort fsync),
  `compute_question_hash` (sha256:-prefixed digest over
  question + category + ISO timestamp), `write_full_payload`
  (Markdown sibling file via temp+rename, one file per call,
  named `<ISO timestamp>-<hash>.md`), and a one-shot
  `write_consensus_record` convenience that combines the two. Input
  validation via `validate_record_inputs` (enum guards for category
  + unresolved_action).
- **AJV schema mirror** in
  `tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts`
  so the visual config editor accepts the new sub-block alongside the
  Python loader — keeps the two implementations in parity.
- **`docs/ai-led-session-workflow.md` → "Decision-time consensus"
  section** documents the 6-step decision tree, the human-only vs
  consensus-eligible category split (table format), the journal
  record schema, the opt-in path, and three explicit limits-of-
  consensus guardrails.
- **Per-agent instruction-file pointers.** `CLAUDE.md`, `AGENTS.md`,
  and `GEMINI.md` each gained a byte-identical "Decision-time
  consensus (pointer)" section directing the orchestrator to the
  new workflow doc section.
- **33 new tests** (17 schema + 16 journal). Full `ai_router` suite
  was 599 passed before Set 031; now 633 passed + 1 skipped.

### Changed

- **`.gitignore`** now excludes `ai_router/consensus-decisions/` (the
  full-payload Markdown sibling directory, default-on but
  disk-heavy). The journal JSONL itself (`ai_router/consensus-decisions.jsonl`)
  stays committed, following the `router-metrics.jsonl` precedent so
  cross-conversation continuity for the audit summary is preserved.

### Release notes

- **`0.5.0` ships the V1 schema only.** The orchestrator-side wiring
  (the code that actually invokes `route(task_type='decision-consensus')`
  on hitting a consensus-eligible decision, synthesizes the
  recommendation, and routes the journal write) is not in this
  release — that lands in a follow-on session set. `enabled: true`
  in a consumer repo's `router-config.yaml` does not change behavior
  until the orchestrator-side wiring ships. The default is opt-out so
  this asymmetry is invisible to every existing consumer.
- **Backwards compatibility:** an existing `router-config.yaml` with no
  `decision_consensus` block continues to load and behave exactly as
  before. The schema is purely additive.
- **Consumer-repo notification.** As an operator-gated step alongside
  this release, `dabbler-access-harvester`, `dabbler-platform`, and
  `dabbler-homehealthcare-accessdb` CLAUDE.md files each get a one-liner
  pointer to the new workflow section. Those edits live outside this
  repo's working tree; consumers can adopt the feature without them by
  setting `delegation.decision_consensus.enabled: true` in their own
  `router-config.yaml` once the orchestrator-side wiring ships.

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
