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

## Session 4 — Doc revision + per-consumer migrator + bootstrap tier-branch

Closed 2026-05-26 with disposition `completed`.

Six commits shipped end-to-end:

### Commit A — Lightweight migrator CLI (`5fbfbb9`)

`python -m ai_router.migrate_lightweight_to_canonical_v4` rewrites
hand-edited Lightweight state files into canonical v4 (§3.7). New
module `ai_router/migrate_lightweight_to_canonical_v4.py` (~500 LOC):

- `_normalize_to_v3_intermediate` recognizes three documented
  non-canonical Lightweight shapes — `sessionLog[]` -> `sessions[]`
  rename (great-psalms-scroll-font), per-session + top-level
  `status` alias canonicalization (`"done"` / `"completed"` ->
  `"complete"`), and missing-`schemaVersion` stamping on otherwise-
  v3-shaped input.
- Routes the normalized intermediate through
  `progress.normalize_to_v4_shape` so the v4 invariants apply
  identically to v3-via-migrate-v3-to-v4 inputs.
- Idempotent: canonical v4 input returns `ACTION_SKIPPED_V4` without
  touching disk.
- Refuses pre-v3 (`ACTION_SKIPPED_PRE_V3` with a pointer to
  `migrate_session_state`) and future-schema
  (`ACTION_SKIPPED_FUTURE_SCHEMA`).
- Apply mode writes `session-state.lwbak.json` (intentionally
  distinct from `.v3.bak.json` so the operator can tell which
  migrator last ran on a set). One-cycle rollback = one rename.

16 unit tests in `ai_router/tests/test_migrate_lightweight_to_canonical_v4.py`
covering all four normalizers, idempotent skip, the seven refusal
cases, backup-before-state ordering, and CLI / JSON output.

### Commit B — `dabbler.openExternalVerificationDoc` command (`53aa8cb`)

`tools/dabbler-ai-orchestration/src/commands/externalVerification.ts`
(~80 LOC). Command Palette only — opens or creates
`<set>/external-verification.md` in an editor tab per §3.8:

- Free-form text (no templated header).
- `flag: "wx"` on create; `EEXIST` treated as a benign race and
  falls through to open.
- Single-set workspaces skip the picker; multi-set workspaces show
  a QuickPick with `set.name + set.state` columns.
- Registered in `extension.ts` via `safeRegister`. New entry in
  `package.json` `contributes.commands`. Watcher-inventory pinned
  line bumped 149 -> 150 to track the new import.

### Commit C — Review-criteria template files (`1ae5d80`)

`docs/review-criteria/{spec,session,set}.md` (§3.9). Each file has a
comment-header explaining edit + delete-to-default semantics with
repo-specific sample bullets:

- `spec.md` — scope realism, verifiability, prerequisites + non-
  goals, audit-lock discipline, backwards-compatibility surfaces,
  repo conventions.
- `session.md` — spec alignment, activity-log honesty, Round-A
  in-flight fixes, test coverage, documentation drift, budget
  discipline.
- `set.md` — scope vs. delivery, memory carry-forward, version-bump
  correctness, set-level Round-A discipline, cross-repo notice,
  cumulative budget.

Picked up automatically by S3's `copyPromptCommands` default
`readReviewCriteria` reader (no code change required).

### Commit D — Wizard tier-branch (`50db03e`)

`tools/dabbler-ai-orchestration/webview/wizard.html` (E8):

- New `<h2>Choose adoption tier</h2>` radio group above
  `<h2>Prerequisites</h2>`. Default selection is **Full** to
  preserve existing behavior.
- `data-tier="full"` / `data-tier="lightweight"` attributes tag
  prerequisites, callouts, and buttons; the `applyTierVisibility(tier)`
  JS handler toggles `.hidden` on every `[data-tier]` element on
  load and on every radio change.
- New Lightweight-only prerequisite (path-aware review agent) and
  no-API-spend callout surface only under Lightweight.
- The `Configure AI Router` and `Show Cost Dashboard` buttons hide
  under Lightweight; `Troubleshoot` stays for both.
- The existing `pricingLink` click handler is now guarded with
  `if (pricing)` because the link lives inside the cost-reality
  callout, which can be hidden.

### Commit E — Doc revisions + cross-repo notice (`fd82944`)

Five doc edits + one new file:

- `docs/session-state-schema.md` § Tier expectations rewritten to
  describe the actual Set 048 model (router writers DO operate
  under `--no-router`; lazy LLM-SDK imports keep credentials out;
  verification short-circuits to manual attestation;
  `external-verification.md` soft gate fires when missing;
  hand-maintained Lightweight files still supported; new migrator
  CLI handles non-canonical drift).
- `docs/ai-led-session-workflow.md` Step 6 gains a
  `#### Lightweight tier — copyable review prompts replace routed
  verification` subsection documenting the 5-step copy / paste /
  paste-back / soft-gate flow with the path-aware-agent
  requirement.
- `docs/planning/session-set-authoring-guide.md` Session Set
  Configuration block example gains `tier: full` and tri-state
  comments for `requiresUAT` / `requiresE2E`. New field-semantics
  bullets added for `tier: "full"`, `tier: "lightweight"`,
  `requiresUAT: "suggested"`, and `requiresE2E: "suggested"`
  documenting the upfront-positive-confirmation prompt that
  replaces the audit's originally-proposed triple-redundancy.
  Defaults section updated to include `tier: full` in the implicit-
  default set.
- `docs/adoption-bootstrap.md` Lightweight closing pointers
  rewritten to describe Set 048's actual deliverables (copy-prompt
  commands, external-verification command, optional review-criteria
  files, hand-maintained state-file migrator, upgrade-to-Full
  path).
- `docs/cross-repo-lightweight-notice.md` NEW file following the
  established `cross-repo-checkout-notice.md` /
  `cross-repo-harvest-notice.md` pattern. One-time copy source for
  consumer-repo CLAUDE.md authors covering activation, copy-prompt
  + paste-back flow, agent-capability requirement, optional
  review-criteria files, one-time migrator recipe, and the Get
  Started panel tier-branch.

### Commit F — Round-A verification + in-flight Medium #1 fix (`9383fa3`)

Round A (gpt-5-4, tier 3, $0.175) returned `needs-attention` with
one Medium finding:

- **Medium #1:** `migrate_one_set` apply-mode backup re-read the
  source file via `json.load(f)`, racing against any concurrent
  edit. A half-written file mid-read would have raised
  `JSONDecodeError` out of the migrator — breaking the
  "never raises on normal failure cases" contract.

Fix applied in-flight per `feedback_dont_hide_behind_out_of_scope`:
backup now writes the already-parsed `state` dict directly via
`_atomic_write_json(backup_path, state)`. No re-read, no race. New
regression test `test_backup_uses_parsed_state_not_reread_from_disk`
monkey-patches the writer to confirm the backup content reflects
the parsed dict, not whatever ends up on disk after concurrent
edits.

Verify-of-verify step skipped — no cross-provider verifier
configured for the gpt-5-4 route model. The route() call already
used `task_type=session-verification` cross-provider routing, so
the route response IS the Round-A verdict.

### Test counts at close

- **Python:** 1010 passed + 1 pre-existing skip (17 new tests for
  the Lightweight migrator: 16 added + 1 Medium #1 regression
  test).
- **TypeScript (unit):** 665 passed + 2 pre-existing failures
  unchanged from S2/S3 (`configEditor-foundation` panel-lifecycle
  + `notificationsSection` rendering — both predate Set 048).
- Cumulative Set 048 routed spend: **~$0.76 of $10 NTE (~7.6%)**
  (S1 $0.103 + S2 $0.147 + S3 $0.161 + S4 ~$0.35 with two route
  calls during the script-debugging cycle).

### Next-session prerequisite

S5 starts with all four §3 deliverables of S4 in place plus the
S1-S3 surface (`--no-router` mode + tri-state schema/runtime +
soft gate, copy-prompt commands, context-menu IA refresh). S5
will exercise the Lightweight UAT end-to-end via `--no-router` +
copyable-prompt + tier-branch wizard, write the cumulative
change-log entry, bump versions to `dabbler-ai-router 0.10.0` +
Marketplace `0.23.0`, and bundle Set 047's HELD publishes
together with Set 048's into a single PyPI + Marketplace release
pair per the audit verdict §4.2 + operator confirmation.

