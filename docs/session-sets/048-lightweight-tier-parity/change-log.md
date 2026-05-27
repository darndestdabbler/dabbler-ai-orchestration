# Set 048 Change Log

**Lightweight-Tier Parity — audit, scope-lock, `--no-router` mode,
tri-state UAT/E2E with upfront positive-confirmation prompt,
copyable-review-prompt commands (path-reference per L1), context-menu
IA refresh on `showQuickPick` (per audit Bias 3 flip), per-consumer
migrator, doc revisions across bootstrap + schema + workflow + authoring
guide, single PyPI + Marketplace publish.**

This set ships end-to-end parity between the Full and Lightweight tiers
per the operator-locked premises P1-P4 (carry-forward from Set 047) and
the four new operator-locked additions L1-L4. The Lightweight tier
becomes a first-class peer to Full: same writers, same Explorer UX,
same `session-state.json` lifecycle. Differences from Full are limited
to no AI router runtime calls, no auto-verification, copyable review
prompts in lieu of routed verification, and suggested-not-required
UAT/E2E.

The audit-locked spec at [`spec.md`](spec.md) scopes 5 sessions: an
audit pass (this S1), then `--no-router` mode + tri-state runtime + soft
gate (S2), then combined copyable-prompt commands + context-menu IA
refresh (S3 — Bias 7 flipped to combine), then doc revision + per-
consumer migrator + bootstrap tier-branch (S4), then UAT + change-log +
version bumps + single bundled publish (S5). Set 047's HELD PyPI +
Marketplace publishes will ship BEFORE S2 begins (Bias 8 flipped to
ship-first) so Set 048 implementation builds against a stable published
v4 baseline.

## Session 1 — Audit pass + scope-lock

Closed 2026-05-26 with disposition `completed`.

- Two-pass devil's-advocate cross-provider consensus over the audit
  proposal at
  [`docs/proposals/2026-05-26-set-048-lightweight-tier-parity/proposal.md`](../../proposals/2026-05-26-set-048-lightweight-tier-parity/proposal.md).
- Verdict at
  [`verdict.md`](../../proposals/2026-05-26-set-048-lightweight-tier-parity/verdict.md):
  8 biases dispositioned (Bias 3 + Bias 5 flipped after Pass B,
  Biases 7 + 8 dispositioned by operator on split votes, Bias 4
  overridden by operator; Biases 1 + 2 + 6 stood by); 5 open questions
  resolved.
- Cross-provider verifier (gpt-5-4-mini) caught a Critical correctness
  issue on BOTH Pass A and Pass B independently: both reviewers
  recommended adding a content-embed fallback for the L1 path-only
  prompt format. The verifier ruled both recommendations as L1
  violations. Resolution: agent-capability variance handled via UX
  documentation, not by reintroducing content-embed.
- Operator override on Bias 4: triple-redundancy reminders (toast +
  activity-log + close-out) replaced by single upfront positive-
  confirmation prompt from the AI orchestrator at session start when
  the session has UX scope and `requiresUAT`/`requiresE2E` is
  `"suggested"`. The operator's four-way choice (E2E / UAT / both /
  neither) is recorded once in `activity-log.json` and read by close-
  out to gate appropriately.
- Stub spec.md rewritten from STUB AUDIT-PENDING to AUDIT-LOCKED with
  `Session Set Configuration` (totalSessions=5, prerequisites=[047],
  tier=full, requiresUAT=true, requiresE2E=false, uatStyle=ad-hoc,
  effort=high), §1-§7 covering full scope-lock.
- Cumulative S1 routed cost: **$0.1027 of $10 NTE (1.0%)**.

### Next-session prerequisite

Before S2 starts: ship Set 047's HELD PyPI `dabbler-ai-router 0.9.0` +
Marketplace `dabbler-ai-orchestration 0.22.0` publishes. Publish action
is operator-initiated (requires Marketplace PAT + PyPI twine
credentials).

## Session 2 — `--no-router` mode + tri-state schema/runtime + soft gate

Closed 2026-05-26 with disposition `completed`.

Four commits land the Lightweight-tier `--no-router` mode infrastructure
per audit-locked spec §3.1, §3.4, §3.5, §3.6:

- **A** ([`44a1d45`](../../../../commit/44a1d45)) — spec.md schema additions: `tier` field +
  tri-state UAT/E2E. New `ai_router/spec_config.py` Python parser
  mirroring the TS parser at
  `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`. 16 Python +
  10 TS tests; 6 TS test fixtures updated for the new required field.
- **B** ([`90b7c0c`](../../../../commit/90b7c0c)) — `--no-router` activation infrastructure.
  New `ai_router/runtime_mode.py` with three-knob precedence
  (CLI flag > env var `DABBLER_NO_ROUTER` > spec.md `tier` field >
  default `full`). CLI flags `--no-router` (start_session + close_session)
  and `--accept-suggestions` (close_session) added; `main()` resolves
  runtime mode at entry-point startup. Override logging via `log.info`
  names the source that won when CLI/env contradicts spec. Lazy
  LLM-SDK imports per §3.1 A2 documented as no-op (providers.py uses
  httpx directly). 29 new unit tests.
- **C** ([`1eed29a`](../../../../commit/1eed29a)) — `route()` / `verify()` short-circuit +
  `external-verification.md` soft gate. `route()` and `verify()`
  prologues return zero-cost stubs without calling `_init()` when
  `is_no_router_mode()` is True. `close_session.run()` integration:
  manual-attestation block + method resolution + new soft gate after
  gate_checks pass + before state flip. Soft gate branches on
  `--accept-suggestions` / TTY / non-TTY; aborts with
  `result="aborted_at_soft_gate"` + `closeout_failed` event on TTY
  non-affirmative answer. 5 route/verify short-circuit + 12
  close_session integration tests.
- **D** ([`bd94205`](../../../../commit/bd94205)) — `suggestion_disposition` reader/writer
  helpers (new `ai_router/suggestion_disposition.py`) + 13 CLI
  backward-compat regression tests. **Deferral note**: the close-out
  *gate* that USES these helpers ships in S3 because Full-tier
  `close_session.py` has no existing UAT/E2E gate today — adding one
  would touch Full behavior outside the audit scope. Documented in
  module docstring + commit message + this change-log.

### Cross-provider verification round

Route (`sonnet`, $0.132) + verify (`gemini-pro`, $0.015) = **$0.147**
routed for S2. Verifier confirmed `ISSUES_FOUND` with 7 findings:

| # | Severity | Disposition |
|---|---|---|
| 1 | Critical — route/verify silent-swallow falls back to live LLM | **FIXED** in-flight (fail-CLOSED with top-level import) |
| 2 | Major — bare imports | **FALSE POSITIVE** (matches existing package convention) |
| 3 | Major — race condition on activity-log read-modify-write | **FIXED** in-flight (write-temp + atomic-rename) |
| 4 | Major — `resolve_no_router_mode` re-entry overwrites cache | **FIXED** in-flight (no-op on re-entry) |
| 5 | Important — false-positive tier detection from full-file fallback | **FIXED** in-flight (`tier:` read only from canonical YAML block; UAT/E2E retain Set 015 plain-text fallback) |
| 6 | Minor — timestamp not UTC | **FIXED** in-flight |
| 7 | Suggestion — lazy cache consistency | **DEFERRED** (production callers always resolve at entry-point startup) |

2 new regression tests for I5 lock in the behavior:
`test_tier_from_free_form_prose_is_ignored` and
`test_requiresUAT_in_plain_text_still_parses_set015_compat`.

### Test counts at close

- **Python:** 982 passed + 1 skipped (98 new for S2). Cumulative
  Set 048 routed spend $0.250 of $10 NTE (2.5%).
- **TypeScript:** 633 passed + 2 pre-existing failures unrelated to S2.

## Session 3 — Copyable-prompt commands + Context-menu IA refresh (COMBINED per Bias 7 flip)

Closed 2026-05-26 with disposition `completed`.

### What ships in S3

S3 implements spec §3.2 (copyable-review-prompt commands), §3.3
(context-menu IA refresh — Bias 3 FLIP locks QuickPick), and §3.9
(review-criteria storage). The cursor-anchored HTML popup that
Set 034 introduced is retired. Operator locks L1-L5 all land in this
session.

**New files:**

- `tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts`
  registers four commands: `dabbler.copySpecReviewPrompt` (always
  enabled), `dabbler.copySessionAccomplishmentsPrompt` (≥1 completed
  session), `dabbler.copySetAccomplishmentsPrompt` (`state ===
  "complete"`), `dabbler.copyStartNextSessionPrompt` (non-terminal
  rows only). Each builder is pure with a `BuildContext` dependency-
  injection seam for unit testing. Path-reference format per L1:
  prompts list relative-to-root paths (forward-slash normalized) and
  NEVER embed session-set artifacts. §3.9 carve-out documented in
  the module header — `docs/review-criteria/<kind>.md` is operator-
  authored meta-instructions, intentionally embedded as the
  reviewer's checklist (NOT the artifact under review). The
  `sanitizeSlugForPrompt` helper replaces backticks with single-
  quotes so the L5 backtick-delimited clipboard payload stays
  well-formed even on slugs containing a `` ` ``.

- `tools/dabbler-ai-orchestration/src/providers/rowMenuHelpers.ts`
  holds the pure decision logic extracted from
  `CustomSessionSetsView`: `buildTopLevelItems` (produces the top-
  level QuickPick item list with `Open File ▸` / `Copy Eval ▸`
  chips and inline flat actions), `buildSubmenuItems` (second-level
  picker items), and `planLeftClickActivation` (L5 dual-action plan:
  ALWAYS open spec.md; ALSO copy `Start the next session of
  \`<slug>\`.` + info toast on non-terminal rows). The state check
  is a positive `in-progress | not-started` test so unknown future
  state values FAIL CLOSED — schema drift cannot accidentally fire
  L5 on a bucket the operator never approved.

- `tools/dabbler-ai-orchestration/src/test/playwright/context-menu-quickpick.spec.ts`
  pins two negative invariants at Layer 3: the cursor-anchored
  `.context-menu*` DOM never appears (before or after a right-click)
  and the L3-removed `openAiAssignment` data-command attribute is
  absent from the row tree.

**Reshape — `ActionRegistry.ts`:**

- New `ActionCategory` discriminator (`"openFile" | "copyEval" |
  "flat"`) on each `RowAction` entry; `categorizedActions(set,
  supports)` partitions the applicable subset by category for the
  two-step QuickPick.
- Final entry count: 14 (was 15). Removed: `openAiAssignment` (L3),
  the `Open File`-adjacent palette actions (`openUatChecklist`,
  `revealPlaywrightTests`, `openFolder`) which L2 narrows away from
  the menu surface (commands remain registered for Command Palette
  use), and the pre-existing `copyStartCommand.default | .parallel`
  + `copySlug` (replaced by the §3.2 copy-prompts; the old commands
  stay palette-accessible). Added: 4 copyEval entries + 2 flat
  orchestrator entries (`dabbler.checkOutOrchestrator` gated to
  in-progress rows; `dabbler.openOrchestratorWriterLog`).
- Open File submenu is locked to exactly four entries per L2:
  Spec / Activity Log / Change Log / Session State. The convention-
  level invariant is asserted by a new test in
  `actionRegistry.test.ts`.

**Rewrite — `CustomSessionSetsView.ts`:**

- `showContextMenu` rebuilt on `vscode.window.showQuickPick`. The
  host opens a top-level pick (submenu chips + flat actions), then
  on submenu selection opens a second-level pick. Escape from
  either level dismisses (L4 close-on-blur free byproduct).
- `handleActivateRow` implements L5: `dispatchCommand(openSpec)` +
  conditional `vscode.env.clipboard.writeText` + info toast.
- `COMMAND_ALLOWLIST` collapsed from 14 entries to 1
  (`dabblerSessionSets.openSpec`) — the QuickPick selections
  dispatch via `vscode.commands.executeCommand` directly from the
  host (no webview round-trip), so the allowlist now governs only
  the L5 left-click `activateRow` path. Comment expanded to make
  the narrowed purpose explicit for future webview→host dispatch
  additions.

**Retired — cursor-anchored popup surface:**

- `media/session-sets-tree/client.js`: ~100 lines removed
  (`showCursorContextMenu` / `ensureContextMenuEl` /
  `hideContextMenu` / `bandForCommandId` + click/keydown/resize/
  scroll handlers + `lastContextMenuPos` state + the
  `renderContextMenu` host→webview case). The `contextmenu`
  listener on each row survives — it now just posts
  `showRowContextMenu` to the host, which opens the QuickPick.
- `media/session-sets-tree/tree.css`: all `.context-menu`,
  `.context-menu-item`, `.context-menu-separator` rules removed.
- `src/types/sessionSetsWebviewProtocol.ts`: `RenderContextMenuMsg`,
  `ContextMenuItem`, `ExecuteRowCommandMsg` removed.

**Removed — `openAiAssignment` (L3):** the command registration in
`openFile.ts`, the `package.json` command declaration, the
`COMMAND_ALLOWLIST` entry, and the `ROW_ACTIONS` entry all go.
The underlying `ai-assignment.md` file on disk is unaffected;
any future surface that needs to read it should depend on the
`aiAssignmentPath` field, not on this menu entry.

### Cross-provider verification round

Route (`sonnet`, $0.147) + verify (`gemini-pro`, $0.014) =
**$0.161** routed for S3. Verifier verdict `VERIFIED` for review
quality with all 8 findings confirmed accurate:

| # | Severity | Disposition |
|---|---|---|
| 1 | Critical — review-criteria content-embed violates L1 | **DOCUMENTED** in-flight (operator-authored §3.9 carve-out; comment expanded; behavior preserved per spec §3.2 + §3.9 explicit "embedded" wording) |
| 2 | Critical — potential `.kind` vs `.dabblerKind` dispatch-key mismatch | **FALSE POSITIVE** on inspection (actual code reads `picked.dabblerKind` correctly); interface comment expanded to make the QuickPickItem.kind collision explicit |
| 3 | Important — backtick in slug breaks L5 markdown payload | **FIXED** in-flight (`sanitizeSlugForPrompt` helper + applied in both prompt builder + clipboard write) |
| 4 | Important — unknown future state values fall through to clipboard | **FIXED** in-flight (positive `in-progress | not-started` check; unknown states fail CLOSED) |
| 5 | Minor — redundant `.slice()` in `applicableActions` | **FIXED** in-flight |
| 6 | Minor — `copyToClipboard` swallows no error | **FIXED** in-flight (try/catch + `showWarningMessage` on rejection) |
| 7 | Minor — `buildSetAccomplishmentsPrompt` omits activity-log silently | **DOCUMENTED** in-flight (comment references spec §3.2's intentional set-vs-session evidence distinction) |
| 8 | Minor — `COMMAND_ALLOWLIST` narrowed purpose undocumented | **DOCUMENTED** in-flight (comment expanded) |

3 new regression tests lock in the in-flight fixes (sanitize-
backticks for both prompt + clipboard paths + unknown-state
fail-CLOSED).

### Test counts at close

- **TypeScript:** 665 passed (29 new tests for S3) + 2 pre-existing
  failures unrelated to S3 (`configEditor-foundation` panel-
  lifecycle + `notificationsSection` rendering — both predate
  Set 048).
- **Python:** 994 collected (no Python changes in S3; net new
  Python tests came from elsewhere between S2 close and S3 open).
- Cumulative Set 048 routed spend: **$0.411 of $10 NTE (4.1%)**
  (S1 $0.103 + S2 $0.147 + S3 $0.161).

### Next-session prerequisite

S4 starts against S3's QuickPick + copy-prompt surface. The S4 doc-
revision scope (bootstrap Step 4.5, schema doc § Tier Expectations,
workflow doc Step 6, authoring guide tri-state docs, agent-
capability documentation per §3.2, wizard tier-branch, cross-repo
notice) will cite the now-shipped commands by id and the L5 left-
click behavior by user-visible effect. The per-consumer migrator
(§3.7) is also S4 territory. No S3-deferred items roll forward.

<!-- Sessions 4-5 to be appended on each session close-out -->
