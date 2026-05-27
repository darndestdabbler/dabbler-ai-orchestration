# Set 049 Change Log

**Orchestrator Coordination Removal — audit, scope-lock, core
ai_router rip, writer-side cleanup + migration sweep, extension TS
cleanup + Explorer revert, docs + version bumps + close-out.**

This set rips out the check-out / check-in coordination layer
shipped in Set 033 (`dabbler-ai-router 0.6.0` / extension `0.18.0`)
and refined in Set 036 (`0.7.0` / `0.20.0`). The `session-state.json`
orchestrator block reshapes from 7 fields to 4 — `engine`, `provider`,
`model`, `effort` — with an omit-null writer pattern. Set 045's
orchestrator-rendering Explorer surface (harvest badges, conflict
pills) is reverted per operator-locked P4. The
`writer-bypass` detector (D3) is preserved as a general
writer-discipline check, decoupled from coordination context.

The audit-locked spec at [`spec.md`](spec.md) scopes 5 sessions: an
audit pass (S1), core ai_router code removal (S2), writer-side
cleanup + migration sweep (S3), extension TS cleanup + Explorer
revert (S4), then docs + version bumps + close-out (this S5).
Companion PyPI release: `dabbler-ai-router 0.11.0`. Companion
Marketplace release: `DarndestDabbler.dabbler-ai-orchestration 0.24.0`.

## Session 1 — Audit pass + scope-lock

Closed 2026-05-27 with disposition `completed`.

- Two-pass devil's-advocate cross-provider consensus over the audit
  proposal at
  [`docs/proposals/2026-05-27-set-049-orchestrator-coordination-removal/proposal.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/proposal.md).
  Pass A (gemini-pro) framed as primary author ($0.0175); Pass B
  (gpt-5-4-mini) framed as devil's advocate ($0.0300; fell back from
  gpt-5-4 which timed out). Verdict at
  [`verdict.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/verdict.md).
- 7 topics + 3 collisions + 5 feature-roll-call items dispositioned.
  Operator-locked premises P1-P5 carried forward unmodified.
  Notable: T1 = v4-compatible schema (operator pre-signal honored —
  the v5 case Pass B raised was resolved by the T4 sweep+normalize
  rather than a writer flip); T2 = accept-with-warning (Pass B
  preference); T4 = sweep historical files as part of S3.
- Stub spec rewritten from STUB AUDIT-PENDING to AUDIT-LOCKED.
  5-session arc locked. NTE $10.
- Hygiene patch in S1 close-out cycle: "Copy Eval ▸" → "Copy
  Prompt ▸" rename + "Start New Parallel Session" submenu entry
  added (commit
  [`e32dd85`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/e32dd85)).
- S1 commits:
  [`a520b97`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/a520b97),
  [`e32dd85`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/e32dd85),
  [`61625f9`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/61625f9),
  [`2c99987`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/2c99987).
- Cumulative S1 routed cost: **$0.0475 of $10 NTE (0.48%)**.

## Session 2 — Core ai_router code removal

Closed 2026-05-27 with disposition `completed`.

S2 ran the rip across the Python surface. Net diff: **-2916 lines**
(3266 deletions, 350 insertions) across 14 files.

- **Pre-flight survey** (Pass B gap close, §4 of the spec) at
  [`s2-survey-findings.md`](s2-survey-findings.md): webview protocol
  shape + `HarvestService.ts` + consumer-repo hooks +
  `dump_session_state_schema.py`. No blockers; one in-S2 addition
  (the schema dumper).
- **Writer reshape (P1/P2/P3)** in `ai_router/session_state.py`:
  4-field omit-null orchestrator block. `orchestrator_chat_session_id`
  parameter removed; `checkedOutAt` / `lastActivityAt` emission lines
  removed; `prior_orch_for_holder_check` derivation + same-holder
  re-attach branches deleted. `orchestrator_model` and
  `orchestrator_effort` made `Optional[str] = None` so callers omit
  when they can't declare authoritatively.
- **`start_session.py` CLI rip**: removed `EXIT_CHECKOUT_CONFLICT`,
  `EXIT_READ_ONLY`, `CHAT_SESSION_ID_ENV_VAR`,
  `ENFORCE_COORDINATION_ENV_VAR`. Removed
  `_coordination_enforced()`, `_identity_label()`,
  `_prompt_takeover_choice()`, `_is_interactive_tty()`,
  `_log_force_override()`, `_resolve_chat_session_id()`. Removed the
  entire H3/H4 refusal branch in `_run_under_lock` (~100 lines).
  Added `_warn_chat_session_id_ignored()` (T2 accept-with-warning).
  Added `_log_session_start()` (T5 generic audit appender).
  `--force` flag removed. `--chat-session-id` retained as
  accept-with-warning. `--model` and `--effort` made optional.
- **`new_chat_id.py` whole-file retire** (no preservation flag per
  spec §5 S2). Companion `test_new_chat_id.py` deleted.
- **`close_session.py` audit-payload cleanup**:
  `_peek_orchestrator_identity()` drops `chatSessionId` from its
  return dict (P3). Docstring + caller-site comment updated.
- **`joiner/conflicts.py` D1+D2 retire, D3 decoupled**:
  `detect_engine_mismatch` + `detect_bare_or_stale_touch` +
  `_touches_workspace` helper deleted. `ConflictKind` Literal
  narrowed to `Literal["writer-bypass"]`. Module + function
  docstrings reframed as engine-independent writer-discipline check.
  `scan_conflicts` signature drops the retired-detector kwargs.
- **`session_events.py` T6** — verified no-op. The retired event-type
  strings (`holder_change`, `checkout_conflict`) were never emitted
  by any code path in this repo; T6 reduces to a documentation-only
  directive.
- **`dump_session_state_schema.py` + reference** updated for the
  4-field block; committed reference at
  `docs/session-state-schema-example.json` regenerated.
- **Tests retired (whole-file)**:
  `test_chatsessionid_writer.py`, `test_checkout_writer.py`,
  `test_start_session_takeover_prompt.py`, `test_new_chat_id.py`.
  Updates to `test_joiner_conflicts.py` and
  `test_session_state_v4_writers.py`.
- 952 ai_router tests pass + 1 skipped + 0 regressions.
- S2 commits:
  [`1e5f53c`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/1e5f53c),
  [`d89c596`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/d89c596),
  [`1237c87`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/1237c87),
  [`9ebfe22`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/9ebfe22).
- Cumulative through S2: **$0.0475 of $10 NTE (0.48%)** — S2 ran
  without invoking the router mid-session, and `close_session`'s
  routed verification was short-circuited by Set 048's `runtime_mode`
  (`tier: full` + `requiresE2E: false` defaults to zero-cost stub).

## Session 3 — Writer-side cleanup + migration sweep

Closed 2026-05-27 with disposition `completed`.

- **`claude-session-start-invoker.js` post-rip rewrite** (372 → 226
  lines): drops `--chat-session-id` forwarding,
  `EXIT_CHECKOUT_CONFLICT` handling, `emitConflictRecord`, and
  `~/.dabbler/checkout-conflicts/` directory writes. The hook now
  walks up to resolve the in-progress set and spawns
  `start_session --engine claude --provider anthropic [--model X
  --effort Y]` where model/effort come from prior block recovery
  (no `"unknown"` fallback under T3). On non-zero exit: logs stderr,
  exits 0.
- **`migrate_v3_to_v4.py` T4 sweep+normalize extension**: strips
  `chatSessionId`, `checkedOutAt`, `lastActivityAt` from all
  orchestrator blocks (top-level legacy + per-session ledger).
  Idempotent on already-clean v4 files. `.bak` rollback preserved.
  15 new tests covering: clean-v4 idempotency, v3→v4 with field
  stripping, top-level orchestrator stripping on pre-v4 files,
  ledger-only stripping when top-level is already clean, mixed
  shapes. Real-world dry-run on the 47 historical sets in
  `docs/session-sets/` confirms the extension works across every
  shape variant.
- **`migrateSessionStateV4.ts` parity mirror**: TS-side migrator
  receives the same field-stripping logic so the extension's right-
  click "Migrate to v4 schema" action emits canonical v4-post-rip
  shape.
- **`docs/session-state-schema.md`** reshaped: orchestrator-block
  definition reduced to 4-field omit-null. New § Writer Contract
  documents the T3 per-orchestrator declaration pattern.
- **Consumer-repo doc canonicalization** (bundled with S3 work, not
  S3 scope itself per the operator-scope discipline — sibling repos
  outside this worktree): state-file rules updated to v4 shape in
  4 consumer repos; 4 stale duplicate authoring-guide + workflow
  docs deleted; 6 consumer instruction files point at the canonical
  via GitHub URL. Drift detector deferred to a future audit-then-spec
  set.
- Mid-session anomaly: the Codex `SessionStart` hook (the very
  pattern Set 049 mitigates) re-wrote the orchestrator attribution
  for S3 from Claude to Codex. The hook's unreliable-data behavior
  is exactly what justified the rip-out.
- S3 commits:
  [`d99bdb7`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/d99bdb7),
  [`df34fae`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/df34fae),
  [`92efda3`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/92efda3).
- Cumulative through S3: **$0.0475 of $10 NTE (0.48%)** — S3 ran
  without invoking the router mid-session.

## Session 4 — Extension TS cleanup + Explorer revert

Closed 2026-05-27 with disposition `completed`.

- **Pre-flight survey** (Pass B re-survey extension to spec §4):
  `sessionSetsWebviewProtocol.ts` types confirmed sole-consumer (the
  webview client.js); `HarvestService.ts` sole caller was
  `CustomSessionSetsView`; consumer-repo hooks don't ship their own
  `claude-session-start-invoker.js`; Gemini + Copilot installer shims
  depended entirely on retired surfaces (broken-by-construction
  post-rip). No blockers.
- **Commands retired** (3 from spec + 2 expansions —
  `installOrchestratorHook.gemini` and `.copilot` had no useful
  behavior remaining):
  - `src/commands/checkOutOrchestrator.ts`
  - `src/commands/releaseCheckOut.ts`
  - `src/commands/newChatIdWorkflowToast.ts`
  - `src/commands/installOrchestratorHookGemini.ts`
  - `src/commands/installOrchestratorHookCopilot.ts`
- **Providers retired**:
  - `src/providers/CheckoutPollService.ts`
  - `src/providers/chatSessionMismatchModal.ts`
  - `src/providers/ReadOnlyIntentService.ts` (orphaned)
  - `src/providers/HarvestService.ts` (spec divergence — see below)
- **`package.json` reshape**: 5 command entries removed; 1 config
  setting removed (`dabblerSessionSets.checkoutPollTimeoutMinutes`).
- **`extension.ts` wiring trim**: 5 imports + 5 `safeRegister` calls +
  inline `CheckoutPollService` block + `ReadOnlyIntentService`
  dispose wiring all removed. New Set 049 comment block explains
  the rip and points at surviving surfaces (Claude installer +
  writer-log opener).
- **Set 045 Explorer surface revert (P4)**:
  - `CustomSessionSetsView.ts` — `HarvestService` import + instance +
    cache invalidation calls removed; `buildRow` no longer attaches
    `harvestSignals` / `conflicts`.
  - `sessionSetsWebviewProtocol.ts` — `ConflictKind`,
    `ConflictSeverity`, `HarvestSignalsPayload`, `ConflictPayload`
    types + `RowPayload.harvestSignals` / `RowPayload.conflicts`
    fields deleted.
  - `media/session-sets-tree/tree.css` — `.harvest-badges` +
    `.harvest-badge*` + `.conflict-pills` + `.conflict-pill` +
    `.conflict-severity-*` rules removed (~95 lines).
  - `media/session-sets-tree/client.js` — `renderHarvestBadges()` +
    `renderConflictPills()` functions deleted (~50 lines).
- **ActionRegistry trim**: `dabbler.checkOutOrchestrator` entry
  removed from `ROW_ACTIONS` (14 entries now, was 15).
  `dabbler.openOrchestratorWriterLog` retained per T5.
- **Test surface trims** (whole-file deletes — 10 spec + 3
  expansions): `checkOutOrchestrator.test.ts`,
  `checkOutOrchestratorChatSessionMismatch.test.ts`,
  `releaseCheckOut.test.ts`, `chatSessionMismatchModal.test.ts`,
  `checkoutPollService.test.ts`, `readOnlyIntentService.test.ts`
  (S4 expansion), `readOnlyIntentTiming.test.ts` (S4 expansion),
  `playwright/new-chat-id-cli-flow.spec.ts`,
  `playwright/chatsessionid-takeover.spec.ts`,
  `playwright/chatsessionid-missing-tolerance.spec.ts`,
  `playwright/checkout-polling.spec.ts`,
  `playwright/checkout-conflict.spec.ts`,
  `playwright/harvest-signals.spec.ts`. Plus updates to
  `claudeSessionStartInvoker.test.ts` (rewritten for post-S3 shim
  exports), `actionRegistry.test.ts` (count 15→14),
  `rowMenuHelpers.test.ts`, `watcherInventory.test.ts`.
- **`docs/cross-repo-checkout-notice.md` rewritten as T7
  deprecation instruction** — one-page "remove this content from
  your CLAUDE.md" with step-by-step remediation for consumer repos.
- **Spec divergences** (both rationale-documented in
  [`s4-close-reason.md`](s4-close-reason.md) for verifier review):
  1. `HarvestService.ts` deleted, not stubbed. With its sole caller
     disconnected and the load-bearing scaffolding (Python joiner)
     living independently in `ai_router/`, a TS stub serves no
     purpose.
  2. Gemini + Copilot installer shims deleted. Both wrapped retired
     surfaces; post-rip they were broken-by-construction.
- 553 TS tests pass + 0 S4 regressions (2 pre-existing Layer-1
  failures and 4 pre-existing Layer-3 failures, both verified
  unrelated to S4 via `git stash` comparison).
- S4 commits:
  [`8c9279e`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/8c9279e),
  [`5edf3a6`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/5edf3a6),
  [`684e8d6`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/684e8d6).
- Cumulative through S4: **$0.0475 of $10 NTE (0.48%)** — S4 ran
  without invoking the router mid-session.

## Session 5 — Docs + version bumps + close-out

Closed 2026-05-27 with disposition `completed`.

- **`CLAUDE.md` rewrite**:
  - "Hard-coordination enforcement (Sets 033 / 036) is OFF by
    default" section retired entirely.
  - New "Orchestrator-block contract (post-Set-049)" section
    documents the 4-field omit-null shape, the surviving D3
    writer-bypass detector, and the P4 Explorer revert.
  - "Extension versioning" section updated: v0.24.0 description
    added, v0.23.0 / v0.22.0 / v0.21.0 promoted in the
    Previous/Pre-Previous/Pre-Pre-Previous walk.
- **`docs/ai-led-session-workflow.md`**:
  - "Orchestrator check-out / check-in (Set 033)" section (114
    lines) replaced with "Orchestrator identity and concurrency
    (post-Set-049)" describing the 4-field record, T3 declaration
    contract, T2 accept-with-warning, and the absence of
    holder-identity gating.
  - Step 8-area cross-reference at line ~1770 rewritten to point
    at the new section.
- **PyPI version bump**: `pyproject.toml` and
  `ai_router/__init__.py` `__version__` bumped to **0.11.0**.
  ai_router/CHANGELOG.md `[0.11.0]` entry added with full Breaking
  / Changed / Removed / Kept sections. CHANGELOG also backfilled
  with retroactive `[0.8.0]` (Set 045 — log-harvest), `[0.9.0]`
  (Set 047 — v4 schema), `[0.10.0]` (Set 048 — Lightweight parity)
  entries that were missed during their respective sets.
- **Marketplace version bump**: `tools/dabbler-ai-orchestration/package.json`
  bumped to **0.24.0**. `tools/dabbler-ai-orchestration/CHANGELOG.md`
  `[0.24.0]` entry added.
- **Rip-out UAT checklist** at
  [`uat-checklist.md`](uat-checklist.md): 17 items covering
  clean session start/close on Full + Lightweight, new orchestrator
  block shape, migrator sweep behavior, accept-with-warning,
  Explorer surface free of harvest badges / conflict pills,
  writer-bypass detector still fires, cancel/restore lifecycle.
- **CHANGELOG.md entries** in both `ai_router/` and
  `tools/dabbler-ai-orchestration/`.
- **This change-log.md**.
- **Verification**: Round A only (no `requiresE2E`, no UI work
  needing a Round B re-check beyond UAT confirmation).
- **Marketplace + PyPI publishes** are tag-driven via GitHub
  Actions per [[publish-via-github-actions]]: operator pushes
  `v0.11.0` for PyPI and `vsix-v0.24.0` for Marketplace when ready.
  This S5 builds the wheel and the .vsix locally as a smoke check;
  the tag-push is operator-gated.

### Test suite results

- **Python**: 952 + 15 (new migrator) = 967 tests pass + 1 skip +
  0 regressions.
- **TypeScript (Layer-1 Mocha)**: 553 passing, 2 pre-existing
  failures unrelated to Set 049 (configEditor-foundation vscode
  stub + notificationsSection regex stale, both surveyed in S4
  close-reason).
- **TypeScript (Layer-3 Playwright)**: 14 passing, 4 pre-existing
  failures unrelated to Set 049 (Windows temp-dir race in
  blocked-by-prereqs + migration-cta-v4 badge text expectation,
  both surveyed in S4 close-reason).

## Cumulative routed cost

| Session | Routed cost | Cumulative | % of NTE ($10) |
|---|---|---|---|
| S1 (audit) | $0.0475 | $0.0475 | 0.48% |
| S2 (rip) | $0.0000 | $0.0475 | 0.48% |
| S3 (sweep) | $0.0000 | $0.0475 | 0.48% |
| S4 (TS cleanup) | $0.0000 | $0.0475 | 0.48% |
| S5 (close-out) | TBD on close | TBD | <1% |

S5's only routed cost is `close_session`'s Round-A cross-provider
verification (subject to the Set 048 `runtime_mode` short-circuit —
default `tier: full` + `requiresE2E: false` defaults to a zero-cost
stub; this set's `spec.md` has `requiresUAT: true` + `requiresE2E:
false` so the routed cost path runs only if `runtime_mode` is
overridden).

The whole set ran well under the $10 NTE budget. The audit-then-spec
discipline + Claude Opus 4.7 1M orchestrator-direct work
combination repeats the Set 048 pattern.

## Why this set is deletion-dominant

Set 049 is a rip-out, not a feature add. Net diff across the 5
sessions: roughly **-3500 lines** (Python) plus **-300 lines** (TS
+ CSS/JS + docs). The coordination layer's surface area accumulated
across Sets 033, 036, and 045 was substantial; S2-S4 retired the
code that implemented it; S5 retires the documentation and brings
the version numbers + change logs along.
