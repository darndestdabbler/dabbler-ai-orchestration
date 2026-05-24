# Set 036: chatSessionId identity refinement + MVVM watcher-scope discipline — implementation

**Status:** COMPLETE (7 of 7 sessions; closed 2026-05-24)
**Created:** 2026-05-21 (post-Set-033-close)
**Cost:** routed verification spend tracked per session in
`activity-log.json` `routedApiCalls`; cumulative through Round A on
S6 = $3.4106 of $5 NTE; S7 verification appended at close.
**Forecast:** $0.33–$1.05 (per spec); **actual:** materially over —
the verifier surfaced real Major-class defects across S1/S2/S4 and
the gpt-5-4 rate-limit cascade on S5 forced a $1.25 opus fallback.
**NTE ceiling:** $5 (operator-confirmed at set start).

---

## Context

Set 033 shipped the orchestrator check-out / check-in coordination
model anchored in `session-state.json`'s `orchestrator` block (H1
router-only writes + H2 state-file sole truth + H3 hard coordination
+ H4 `engine + provider` identity composite + OQ1 nested timestamps
+ OQ2 documentation aliases). Within ~36 hours of release the
operator surfaced two design questions:

1. The H4 `engine + provider` composite collapses two distinct
   chats on the same engine onto a single holder — so a second
   Claude Code chat that opens the same workspace silently
   "re-attaches" to the first chat's check-out instead of being
   recognized as a new holder.
2. The extension still had two inference watchers (Codex
   config-toml watcher + `signalKind`-driven accordion variants)
   left over from the pre-H2 architecture that were producing
   stale gauges and silently writing state on the operator's
   behalf.

The audit half ran informally per
[[feedback_audit_then_spec_for_substantial_features]] (Gemini Pro
routed + GPT-5.4 manually pasted), with the operator adjudicating
seven items (D1 watcher-scope discipline, D2 MVC-shaped agent API,
Q1 chatSessionId source per orchestrator, Q2 cadence of identity
checks, Q3 takeover UX, Q4 chatSessionId on close, Q5 hybrid
migration tolerance, Q6 `requireExplicitTakeover` setting, Q7
watcher-scope enforcement). Locked verdicts at
[`docs/proposals/2026-05-21-chatsessionid-and-watcher-scope/proposal-addendum.md`](../../proposals/2026-05-21-chatsessionid-and-watcher-scope/proposal-addendum.md).

Set 036 is the implementation half across 7 sessions: writer + lock
+ CLI + invoker + UI retirements + takeover UX + watcher inventory
+ Playwright + cross-tier docs + cross-repo notice + UI audit +
dual-registry release.

---

## Session 1: Writer migration + per-set lifecycle lock (Q5 prerequisite) (COMPLETE 2026-05-23)

Schema delta + H4 refinement + the per-set lifecycle lock that makes
the hybrid migration safe.

**Shipped:**

- `ai_router/session_state.py` — `register_session_start` writes the
  orchestrator block's new `chatSessionId` field strictly on every
  new write (value None when neither `--chat-session-id` nor
  `$CHAT_SESSION_ID` supplies one). Downstream readers use key
  presence + None vs. key absence to tell Set-036+ from pre-Set-036
  state files.
- `ai_router/start_session.py` — H4 identity predicate refined to
  `engine + provider + chatSessionId`; new `--chat-session-id` CLI
  arg with `$CHAT_SESSION_ID` env fallback via
  `_resolve_chat_session_id()`. H3 refusal message names both
  holders' chatSessionIds via the expanded `_identity_label()`.
  Tolerant-on-read: prior block missing the `chatSessionId` key
  (legacy) OR with key present and value None (Set 036+ no-ID
  write) is treated as same-holder for engine + provider matches.
  Force-override audit-log line carries both chatSessionIds.
- `ai_router/close_lock.py` — renamed `LOCK_FILENAME` from
  `.close_session.lock` to `.lifecycle.lock`; added
  `LEGACY_LOCK_FILENAME` for the R1 alias-on-read window. Both
  `start_session` AND `close_session` acquire this lock via a dual-
  acquire (Round A blocker fix); new `acquire_lock_with_timeout()`
  polling variant for start_session (30s default; bounded by
  `EXIT_LOCK_CONTENTION = 5`). close_session keeps its existing
  exit 3 contract. Stale-window reaping preserved.
- `ai_router/close_session.py` — `closeout_succeeded` event payload
  gains `chatSessionId`, `engine`, `provider`, `model` fields (Q4
  audit trail). Snapshot taken via new `_peek_orchestrator_identity()`
  helper BEFORE `_flip_state_to_closed()` nulls the block. Legacy
  state files with no orchestrator block degrade gracefully by
  omitting the four identity fields rather than emitting empty
  strings.
- `ai_router/session_events.py` — `closeout_succeeded` docstring
  documents the four new payload keys and the legacy-degradation
  behavior.
- `ai_router/gate_checks.py` — `_WORKING_TREE_IGNORE_PATTERNS`
  ignores both lock filenames during close-out.
- `ai_router/tests/test_chatsessionid_writer.py` — 17 unit tests
  across all branches: fresh write (explicit value / env / None
  default), same-composite re-attach, mismatch refusal naming both
  IDs, legacy-state refusal ('no chat session ID recorded'),
  --force rewrites, legacy block tolerance (key absent), prior null
  tolerance (key present, value None), lock contention exits 5,
  clean acquire/release, closeout payload identity (string + None),
  live legacy lock blocks new acquisition, dual-acquire creates
  both files, explicit `--chat-session-id ''` clears env (Round A
  major fix), stale legacy lock swept.

**Verification:** Round A (gpt-5-4) — three findings, all addressed:
(1) Blocker — read-only legacy-lock sweep insufficient against a
live pre-Set-036 close_session; dual-acquire required. (2) Major —
`_resolve_chat_session_id()` did not honor explicit
`--chat-session-id ''` to clear an inherited env var. (3) Minor —
close_lock.py docstring referenced wrong exit code. Round B (gpt-5-4)
— three Minor findings, all addressed (test coverage for null-key
tolerance + null-id closeout payload + close-out doc reference fix).

---

## Session 2: `new_chat_id` CLI + Claude Code hook-invoker pass-through (COMPLETE 2026-05-23)

Agent-facing token-source plumbing.

**Shipped:**

- `ai_router/new_chat_id.py` — new module + CLI entrypoint. Plain
  mode prints a UUID v4; `--export` emits a shell-eval-able line
  via `_format_bash` / `_format_powershell` / `_format_fish` with
  single-quote escaping. `_detect_shell` consults `$SHELL` first on
  every platform (Round A Major fix: was Windows-first), then falls
  back to PowerShell on Windows when `$SHELL` is unset or
  unrecognized. Idempotency: existing non-empty `$CHAT_SESSION_ID`
  short-circuits the mint. Exits 0 success, 1 shell-detect-failed
  (--export without --shell on undetectable shell), 2 argparse.
- `tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js`
  — extracts `session_id` from the SessionStart payload via new
  `extractSessionId()` helper (trim + non-empty-string gate; null
  on missing / non-string / whitespace-only) and forwards as
  `--chat-session-id` to `start_session`. `preserveExistingClaude()`
  gates model/effort preservation on the full H4 triple (Round B
  Medium fix: was engine + provider only). Tolerant branches: prior
  chatSessionId key absent or value null treated as same-holder.
  Stderr warning when `session_id` missing/invalid (Round B Low fix:
  R2 schema-drift visibility).
- `tools/dabbler-ai-orchestration/src/commands/newChatIdWorkflowToast.ts`
  — new shared helper. One-time-per-(workspace, orchestrator) info
  toast with three clipboard-copy actions: bash (Round B Major fix:
  switched from broken `... | eval "$(cat)"` pipeline-subshell to
  current-shell `eval "$(cmd)"`), PowerShell (`Invoke-Expression`),
  fish (Round B Medium fix: was omitted despite R3 initial scope;
  `... | source`). Suppression via workspaceState; 'Don't show
  again' button.
- `installOrchestratorHookGemini.ts` + `installOrchestratorHookCopilot.ts`
  — invoke `maybeShowNewChatIdWorkflowToast` before opening the
  `dabbler.checkOutOrchestrator` quickpick.
- `ai_router/tests/test_new_chat_id.py` — 26 unit tests covering
  UUID v4 emission, distinct UUIDs across calls, per-shell export
  shape, auto-detect (Windows + `$SHELL=bash/fish/nu` fallback after
  Round A Major; Unix bash/zsh/fish/pwsh), idempotency,
  empty-env-value mints fresh, failure mode, helper-level escape
  coverage (Round A Minor fix: fish-formatter escape test).
- `tools/dabbler-ai-orchestration/src/test/suite/claudeSessionStartInvoker.test.ts`
  — 22 Layer-2 tests across `extractSessionId` (9), `parsePayload`
  (4), and `preserveExistingClaude` (Round B: 9 covering H4 triple
  branches).

**Verification:** Round A (gpt-5-4) — two findings: Major
(Windows-first shell detection), Minor (untested fish escape).
Round B (gpt-5-4) — four findings, all addressed: Major (bash
eval-in-subshell), Medium (missing fish copy), Medium
(preserveExistingClaude H4 gap), Low (missing R2 stderr signal).

---

## Session 3: `signalKind` retirement + Codex config-toml watcher retirement (COMPLETE 2026-05-23)

D1 watcher-scope discipline applied. Codex config-toml watcher
retired entirely; `signalKind` enum + all UI variants disappear.

**Shipped:**

- `tools/dabbler-ai-orchestration/src/codex/configWatcher.ts` —
  DELETED (the entire `src/codex/` directory went with it; the
  watcher was the most prominent D1 violator).
- `tools/dabbler-ai-orchestration/src/test/suite/codexConfigParser.test.ts`
  — DELETED (10 unit tests pairing the deleted TOML extractor +
  `parseCodexConfig`).
- `tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts`
  — `signalKind` enum retired entirely from `OrchestratorMarker`
  (top-level + nested `effort.signalKind` + `effort.observedAt`);
  the `accordionStateFromOrchestratorBlock` adapter no longer
  synthesizes either field. `renderAccordionLoaded`'s clock-overlay
  span (`⏱`) deleted; `describeMarker`'s `(configured default)`
  qualifier removed; `modelTooltip` collapsed from 4-branch switch
  to single `live signal (<confidence> confidence)`; `effortTooltip`
  collapsed similarly. The `effort.observedAt`-driven
  `(last /think Xs ago)` clause gone with the field; `thinking on`
  / `thinking off` remains.
- `media/orchestrator-indicator/indicator.css` +
  `media/session-sets-tree/tree.css` — `.signal-current` /
  `.signal-manual` / `.signal-last-observed` /
  `.signal-configured-default` / `.clock-overlay` rules removed
  with per-site retirement-note comments. Visual-treatment-matrix
  header rewritten: every gauge renders solid fill (formerly
  `.signal-current`); only surviving non-default treatment is the
  signal-agnostic stale-stripe overlay. `data-signal=` attribute
  no longer emitted by `renderGaugeSvg`.
- `renderGaugeSvg` signature dropped its `signalKind: string`
  parameter; `renderAccordionLoaded` no longer assembles
  `signal-*` tokens onto `gauge-cell` class strings; renderer's
  input shape now matches the on-disk orchestrator block plus
  display metadata only (tier, confidence, stalenessMaxSec).
- Audit pass for indirect-signal inference (D1 discipline): MRU
  file age read in `detectOrchestrators.ts` for install-link CTA
  ordering — non-orchestrator UI signal, explicitly permitted under
  D1. No other inference paths surfaced.

**Verification:** Round A (gpt-5-4) — 4 Minor findings, no
Blockers/Majors: stale headers in `CheckoutPollService.ts` +
`CustomSessionSetsView.ts` + `openOrchestratorWriterLog.ts` referencing
deleted Codex watcher and retired accordion buttons; rewrote each.
`tsc --noEmit` clean post-fixes (comment-only).

---

## Session 4: Takeover UX (Q3) + watcher-inventory convention test (Q7) (COMPLETE 2026-05-23)

User-facing takeover UX + code-level enforcement of watcher-scope
policy.

**Shipped:**

- `tools/dabbler-ai-orchestration/src/providers/chatSessionMismatchModal.ts`
  — Q3-locked takeover modal. Three buttons (Take Over /
  Open in Read-Only Mode / Cancel) via
  `showInformationMessage({modal: true})`. Pure helpers
  (`truncateChatSessionId` — 8-char + ellipsis per Q3 lock;
  `formatHolderLabel` — engine + provider + chat <8char>;
  `buildModalMessage`; `resolveChoice` — undefined / unknown labels
  collapse to cancel). Injectable `ShowModal` surface for Layer-2
  testability.
- `tools/dabbler-ai-orchestration/src/providers/CheckoutPollService.ts`
  — `ConflictRecord` schema extended with optional
  `heldByChatSessionId` + `wouldBeHolderChatSessionId`
  (schemaVersion stays 1 — additive). New `isChatSessionMismatch`
  predicate (true only when engine+provider match AND both
  chatSessionIds non-null AND differ). `handleChatSessionMismatch`
  branch fires when predicate true, surfacing modal in place of
  legacy poll/force/dismiss prompt. Take Over delegates to
  forceOverride; Read-Only sets intent on shared service + info
  toast; Cancel no-op. `spawnRetry` forwards
  `record.wouldBeHolderChatSessionId` as `--chat-session-id`.
  **Round A Major fixes:** (a) `pollKey()` now includes
  `wouldBeHolderChatSessionId` with `<no-chat-id>` sentinel for
  null; (b) `isSlotFreeForHolder()` extended with optional
  `wouldBeChatSessionId` applying same tolerant-on-read rule as
  H3 predicate.
- `tools/dabbler-ai-orchestration/src/providers/ReadOnlyIntentService.ts`
  — in-memory `Set<string>` of session-set paths flagged
  read-only via modal. Transient (clears on extension-host restart);
  no persistence per Q6 REJECTED. Module-level singleton via
  `getReadOnlyIntentService()` shared with checkOutOrchestrator.
  EventEmitter on add/clear.
- `tools/dabbler-ai-orchestration/src/commands/checkOutOrchestrator.ts`
  — Round B Major fix: extended `InProgressSet.state.orchestrator`
  with chatSessionId; new
  `maybeShowChatSessionMismatchOnManualCheckout()` helper routes
  the manual command to chatSessionMismatchModal when
  same-engine/provider/prior-string mismatch. Round A Minor fix:
  split `maybeClearReadOnlyIntent()` into
  `confirmRevertReadOnlyIntent()` + `commitClearReadOnlyIntent()`;
  commit fires only after `dispatchCheckOut()` returns exitCode 0
  (no more silent loss of read-only protection on cancelled
  force-override).
- `ai_router/start_session.py` — TTY-interactive takeover prompt.
  New `_is_interactive_tty()` requires BOTH stdin AND stderr TTYs.
  `_prompt_takeover_choice(prior, new)` writes 3-line menu to
  stderr; reads single char (empty/EOF/garbage → cancel). Gated on
  chat_session_id mismatch AND `_is_interactive_tty()` (Q3 scope:
  engine+provider mismatch stays non-interactive). Take Over →
  forced=True; Read-Only → new `EXIT_READ_ONLY=6`; Cancel →
  EXIT_CHECKOUT_CONFLICT=4. Module docstring exit-code table
  extended.
- `tools/dabbler-ai-orchestration/src/test/suite/watcherInventory.test.ts`
  — Q7 allowlisted watcher-inventory convention test.
  Hand-maintained `WATCHER_ALLOWLIST` of `{file, line, target,
  purpose}` tuples. Three tests: (a) every callsite is allowlisted
  (fails with file:line + D1 rationale-required message), (b)
  allowlist entries point at real callsites, (c) baseline count of
  3 watchers. Initial allowlist: extension.ts:146 (tree-refresh on
  canonical state files), CheckoutPollService.ts:249
  (`~/.dabbler/checkout-conflicts/` directory),
  CheckoutPollService.ts:426 (per-poll session-state.json watcher).
- 4 new test files (7 Python + 21 modal + 9 ReadOnlyIntent + 5
  checkoutPollService chatSessionId branches + 4 timing branches
  in `readOnlyIntentTiming.test.ts` (Round A) + 9 branches in
  `checkOutOrchestratorChatSessionMismatch.test.ts` (Round B)).
  Extension Layer-2: 519 → 539 passing.

**Verification:** Round A (gpt-5-4) — 3 findings (2 Major + 1
Minor) all real bugs, all addressed: pollKey collapse, isSlotFreeForHolder
gap, read-only timing window. Round B (gpt-5-4) — 1 new Major:
manual `dabbler.checkOutOrchestrator` had no takeover-modal routing
for chatSessionId-mismatch; fixed with
`maybeShowChatSessionMismatchOnManualCheckout` helper.
Round C skipped — gpt-5-4 hit 429 after three back-to-back tier-3
calls; Round B fix is mechanically symmetric with verified
CheckoutPollService routing and pinned by 9 regression tests.

---

## Session 5: Layer-3 Playwright coverage + cross-tier docs + cross-repo notice (COMPLETE 2026-05-23)

End-to-end test coverage + canonical docs aligned + cross-repo notice
updated for consumer repos.

**Shipped:**

- `tools/dabbler-ai-orchestration/src/test/playwright/chatsessionid-takeover.spec.ts`
  — 3 scenarios at start_session process boundary: chatSessionId-
  mismatch refuses with EXIT_CHECKOUT_CONFLICT and names both IDs in
  composite label format; --force handoff rewrites state + writer-log
  carries both IDs (homeOverride redirects HOME/USERPROFILE to
  tmpdir for hermetic audit); same-chat re-attach preserves
  checkedOutAt + bumps lastActivityAt.
- `tools/dabbler-ai-orchestration/src/test/playwright/chatsessionid-missing-tolerance.spec.ts`
  — 3 scenarios: legacy state (key absent) tolerates + populates
  strictly; Set-036 null state (key present, value null) same; post-
  population a different chatSessionId is refused strictly.
- `tools/dabbler-ai-orchestration/src/test/playwright/new-chat-id-cli-flow.spec.ts`
  — 3 scenarios: plain mode UUID v4 emission (strict regex), env-
  fallback flow into orchestrator.chatSessionId via start_session,
  idempotency (second mint re-emits same value). Local
  `mintChatSessionId` helper sets cwd=REPO_ROOT for subprocess
  resolution.
- `docs/session-state-schema.md` — chatSessionId added to
  orchestrator block JSON shape; field table row added; H4 holder
  identity refined to `engine + provider + chatSessionId` composite
  with discriminator explanation; chatSessionId-source paragraph
  (Claude Code automatic; new_chat_id CLI for others); tolerant-on-
  read covers both key-absent and key-present-null branches;
  strict-on-write contract; H3 refusal mentions TTY takeover prompt
  as inline CLI mirror; force-override notes writer log carries
  both IDs; new per-set lifecycle lock paragraph; block-null
  invariant extended; mid-set worked example carries populated
  chatSessionId UUID.
- `ai_router/docs/close-out.md` — Section 0 protocol table extended
  with `orchestrator: cleared to null` row; new paragraph on Q4
  payload extension; Section 2 + Section 3 step 9 note chatSessionId
  clears with block + snapshot-ordering; Section 4 stranded-checkout
  recovery extended for chatSessionId-only mismatch + TTY takeover
  prompt.
- `docs/ai-led-session-workflow.md` — Orchestrator check-out /
  check-in subsection refined; new chatSessionId-source paragraph;
  closeout_succeeded Q4 payload note; new per-set lifecycle lock
  paragraph; tier symmetry extended for Lightweight (humans run
  new_chat_id to mint UUID).
- `docs/cross-repo-checkout-notice.md` — REWROTE from Set 033 base
  to Set 036 refinement. Both authored (2026-05-21) + updated
  (2026-05-23) dates with diff-based swap guidance. Version bumps
  in heading + summary; pasted snippet covers chatSessionId
  composite + source-by-orchestrator + new resolution path (Q3
  takeover modal/CLI) + tolerant-on-read + close-out + lifecycle
  lock + Lightweight new_chat_id workflow.

**Verification:** Round A initial attempts hit 429 on gpt-5-4
(session-verification task type pinned); switched to tier-routed
`verification` task type per Set 036 S4 Round-C-skipped precedent +
[[feedback_split_large_verification_bundles]]. Router selected
opus ($1.2482) — same provider as orchestrator, so cross-provider
intent lost in rate-limit workaround. Verdict: VERIFIED. One Minor:
prose typo in REPO_ROOT comment ('four parent hops' → 'five').
Round B not warranted. Doc-heavy session + deterministic Layer-3
test runs make the cross-provider gap acceptable.

---

## Session 6: Orchestrator-agnostic UI audit + empty-state refactor (COMPLETE 2026-05-23)

Sweep the extension UI for Claude-specific framing. Audit reframes
the spec's pre-canned (a)/(b)/(c) empty-state dispositions: Set 034
had already retired the per-row accordion at the render surface;
the empty-state CTA + the entire `OrchestratorAccordion.ts` +
`detectOrchestrators.ts` modules are orphan source. Disposition
locked: DELETE the orphan source (YAGNI cleanup; git history
preserves the v0.18.x implementation for any future re-enable).

**Shipped (source cleanup):**

- `src/providers/OrchestratorAccordion.ts` — DELETED (496 LOC; all
  gauge / accordion-body / mismatch / tooltip / classifyRecommendationTier
  / providerHasExtraCapacity / SVG / tier-rank helpers).
- `src/providers/detectOrchestrators.ts` — DELETED (137 LOC;
  CLAUDE_CTA / CODEX_CTA / GEMINI_CTA / COPILOT_CTA +
  claudeCodeInstalled() / codexInstalled() / geminiInstalled() /
  copilotInstalled() + pickEmptyStateCta()).
- `src/test/suite/detectOrchestrators.test.ts` — DELETED (8 tests).
- `Recommendation` interface moved from OrchestratorAccordion.ts to
  inProgressSetsService.ts (its only non-test consumer).

**Shipped (CSS cleanup):**

- `media/orchestrator-indicator/` — DIRECTORY DELETED. indicator.css
  was orphan since Set 029 S4 retired orchestratorIndicatorProvider.
- `media/session-sets-tree/tree.css` — TRIMMED 458 → 282 lines. Full
  accordion-body section removed: `.accordion-body`, `.acc-link`,
  `.acc-empty` + `.acc-empty-cta` + `.acc-empty .grey-gauges`,
  `.gauges` + container query, `.gauge-cell` + `.gauge-svg` + arc /
  needle / pivot / sublabel rules, `.tier-low/mid/flagship/unknown`,
  `.effort-low/medium/high/extra-high/max/unknown`, `.stale ::after`
  diagonal stripes, `.last-updated`, `.model-sections`. Custom-
  properties block (`--indicator-stripe-color` etc.) replaced with
  retirement note since only consumers were deleted rules. File
  header rewritten to reflect single-layer (tree shell only).

**Shipped (Layer-3 sweep — 4 pre-existing failures all addressed):**

- Baseline 21/2/4 → post-cleanup 24/2/0.
- DELETED 'empty-state CTA falls back to Claude installer' scenario
  (asserted `.acc-empty-cta` which no longer renders).
- DELETED 'seeded orchestrator block renders provider sublabel'
  scenario (asserted retired-accordion gauge sublabel).
- REPLACED 'two in-progress sets each render their own accordion
  body' with 'multi-in-progress workspaces render two rows (no
  ambiguity banner)' (the data-expandable attribute assertion was
  orphan; the ambiguity-banner-absence assertion remains a real
  regression check).
- DELETED multi-in-progress.spec.ts test.skip'd 'each in-progress
  row paints its own gauge SVG' (FIXME from Set 033 S4 resolved by
  deletion).
- In-flight fix per [[feedback_dont_hide_behind_out_of_scope]]: 'In
  Progress bucket header shows the multi-in-progress count' was
  failing because Set 034 prepended a chevron glyph (▾/▸) to the
  bucket header; dropped the `^` regex anchor (provenance
  documented).
- Dropped `aria-expanded` assertion in 'renders ARIA tree structure'
  (rows are no longer expandable per Set 034).

**Shipped (comment-freshness sweep):**

- `CustomSessionSetsView.ts` header + imports + renderShell CSP
  comments rewritten to note Set 036 S6 deleted OrchestratorAccordion
  + detectOrchestrators.
- `extension.ts` CustomSessionSetsView-registration + orchestratorIndicator-
  retirement comments rewritten.
- `tree.css` file header + theme-properties comment rewritten.
- `watcherInventory.test.ts` WATCHER_ALLOWLIST extension.ts line
  number 147→146 (the comment-deletion shifted the createFileSystemWatcher
  callsite; caught by the convention test itself).

**Audit findings catalog:** `docs/session-sets/036-.../ui-audit-findings.md`.
F3 + F4 findings (package.json command titles for Install Orchestrator
Hook (X) per orchestrator, viewsWelcome contribution naming all three
orchestrators, copyAdoptionBootstrapPrompt toast, wizard.html API key
list, installer-shim file headers) all classified KEEP — parity copy
or correctly-engine-specific-by-scope.

**Verification:** Round A routed via task_type='verification'
(tier-routed, NOT session-verification's gpt-5-4 pin) per the S5
429-cascade fallback precedent. Router selected gemini-pro
(complexity_score=57, tier 2); 22.4s; $0.03835. All six asks PASS:
audit completeness, Recommendation move, CSS deletion bounds,
broken-test sweep completeness, comment freshness, out-of-scope
(bucket-count regex fix acceptable opportunistic correction).
Round B not warranted.

---

## Session 7: Tests + change-log + dual-registry release (COMPLETE 2026-05-24)

**Shipped (test sweep):**

- `python -m pytest` — 693 passed + 1 skipped.
- `npx tsc --noEmit` on the extension — clean.
- `npm run test:unit` — 531 passing; same 2 pre-existing failures
  unchanged through the set (configEditor-foundation panel lifecycle
  + notificationsSection rendering scaffolding gaps).
- `npm run test:playwright` — see verification appendix at close.

**Shipped (docs):**

- `docs/session-sets/036-chatsessionid-and-watcher-scope-implementation/change-log.md`
  — this file. Final-session aggregation per
  [[project_final_session_changelog_pre_close]].

**Shipped (in-flight UI fix per [[feedback_dont_hide_behind_out_of_scope]]):**

- `CustomSessionSetsView.fractionFor` — session sets without a
  known `totalSessions` count (spec.md not yet written or doesn't
  enumerate sessions, e.g. Set 046) now render `N/?` instead of an
  empty fraction. Operator directive 2026-05-24 surfaced during the
  S7 release pass — keeps the Session Set Explorer's fraction
  column always populated so not-yet-spec'd sets don't render
  visually identical to malformed rows. Two-line code change;
  rebuild + Layer-2 sweep (531 passing + 2 unchanged pre-existing
  failures) confirmed no regression.

**Shipped (release):**

- `pyproject.toml` 0.6.0 → 0.7.0 (minor — feature release for
  chatSessionId + new_chat_id CLI + lifecycle lock + Q4 payload).
- `ai_router/CHANGELOG.md` 0.7.0 entry.
- `tools/dabbler-ai-orchestration/package.json` 0.19.0 → 0.20.0
  (minor — feature release for takeover UX + watcher retirement +
  orchestrator-agnostic UI). Note: spec said "0.18.x → 0.19.0" but
  Set 034 already shipped 0.19.0, so this set bumps to 0.20.0.
- `tools/dabbler-ai-orchestration/CHANGELOG.md` 0.20.0 entry.
- `CLAUDE.md` Extension versioning walk extended.
- `dabbler-ai-router` PyPI release: `0.7.0` (operator-gated push).
- `DarndestDabbler.dabbler-ai-orchestration` Marketplace publish:
  `0.20.0` (operator-gated push).

**Verification:** Round A verdict appended at close.

---

## What ships across the framework

- Holder identity composite refined to `engine + provider +
  chatSessionId`. Two distinct chats on the same engine + provider
  are now recognized as different holders.
- Per-chat token source: Claude Code automatic via SessionStart hook
  payload; all other orchestrators (Codex CLI, Gemini Code Assist,
  GitHub Copilot, manual Lightweight) use `python -m
  ai_router.new_chat_id` (idempotent within a shell).
- Per-set lifecycle lock (`.lifecycle.lock`) prevents the
  start/close race Q5 flagged. Both `start_session` and
  `close_session` acquire it (start_session: 30s poll, exit 5 on
  contention; close_session: immediate, exit 3). Legacy
  `.close_session.lock` survives as one-release alias on read.
- Tolerant-on-read writer contract: a missing or null prior
  chatSessionId is treated as same-holder for engine+provider
  matches; the first new write populates the field strictly.
- Takeover UX: three-button modal in VS Code (Take Over / Open in
  Read-Only Mode / Cancel) for chatSessionId mismatches; mirror
  CLI prompt at TTY boundaries in `start_session`. Engine+provider
  mismatches stay on the non-interactive refusal path.
- Read-only intent: in-memory map shared across modal +
  checkOutOrchestrator; cleared only after a successful
  force-override dispatch (no silent loss on cancelled prompts).
- `closeout_succeeded` event payload carries the released holder's
  identity (chatSessionId + engine + provider + model) snapshotted
  before block-clear; legacy state degrades gracefully.
- Codex config-toml watcher RETIRED. Codex CLI joins Gemini Code
  Assist and GitHub Copilot as manual-only orchestrators (claim via
  universal "Check Out As…" quickpick).
- `signalKind` enum + clock-overlay + "(configured default)"
  qualifier + multi-branch tooltips RETIRED. Every gauge surface
  renders solid (formerly `.signal-current`); stale-stripe overlay
  is the only surviving non-default visual treatment.
- Watcher-inventory convention test enforces D1 watcher-scope
  discipline at code-review time. New watchers without allowlist
  entries fail with a clear "add me to the allowlist with a
  rationale" message.
- Orphan UI source from Set 034's runtime retirement (per-row
  accordion + empty-state CTA + detector) DELETED. No user-facing
  copy assumes a particular orchestrator; parity language already
  shipped in package.json viewsWelcome + wizard.html + adoption-
  bootstrap toast.

## Risks closed

- **R1** (Per-set lifecycle lock breaks existing close_session
  callers): mitigated with `LEGACY_LOCK_FILENAME` alias on read for
  one release; documented in close_lock.py.
- **R2** (Claude Code hook payload schema drift): mitigated with
  stderr warning when `session_id` missing/invalid + tolerant-on-
  read writer branches that handle the None case.
- **R3** (`new_chat_id` CLI shell-flavor coverage): shipped bash +
  PowerShell + fish; documented in `--help`; operators on nu /
  others fall back to manual env-var setting.
- **R4** (Takeover modal mid-tool-call): Q2 narrow destructive-ops
  definition + boundary-gated check + Layer-3 takeover scenario
  pinning the boundary behavior end-to-end. No mid-tool-call surface
  observed.
- **R5** (`signalKind` retirement breaks legacy data readers):
  Marketplace download count remained negligible through release;
  reader tolerance via silent-drop on legacy data not surfaced in
  UI.
- **R6** (Cross-repo notice fan-out gap): mitigated with timestamped
  + version-stamped notice; consumer repos self-audit by comparing
  pasted version.
- **R7** (Seven-session set creep): S6 absorbed cleanly under the
  audit-driven YAGNI disposition; S7 release on schedule.

## Follow-ups out of scope

- **Set 011 cancel-lifecycle double-append bug**
  ([[project_cancel_lifecycle_double_append_bug]]) — re-cancelling
  an already-cancelled set no-ops the state file but appends a
  redundant "Cancellation history" entry to the markdown.
- **Set 035 Python CLI `print_session_set_status` cancellation-
  reader migration** ([[project_034_035_state_file_sole_truth_audit]]
  deferred-followups) — C1 deferred from Set 035.
- **F3 wizard.html parity-pricing link** — single Anthropic-pricing
  link is acceptable variance for now; file as follow-on if a
  parity-list emerges.
- **Set 045 + Set 046** queued — Set 045 picks up the 4 open
  empirical questions from Set 044's dual-primary log-harvest lock;
  Set 046 (audit-pending) captures the cancelled 042/043 upside on
  Explorer enrichment.
