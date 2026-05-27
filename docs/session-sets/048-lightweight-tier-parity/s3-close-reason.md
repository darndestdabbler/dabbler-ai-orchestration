# Set 048 Session 3 — Close-out reason and verification attestation

## Close-out reason

Session 3 ships the **copyable-review-prompt commands** and the
**context-menu IA refresh** per the audit-locked spec at
[`spec.md`](spec.md) §3.2 (path-reference copy commands), §3.3
(Bias 3 FLIP to QuickPick + L2 four-item submenu + L3 openAiAssignment
removal + L4 close-on-blur + L5 left-click dual-action), and §3.9
(review-criteria storage convention). S3 was combined with S4's
original scope per the operator's Bias 7 disposition during the S1
audit pass.

### What ships in S3

**New files:**

- `tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts`
  — four prompt builders (`buildSpecReviewPrompt`,
  `buildSessionAccomplishmentsPrompt`,
  `buildSetAccomplishmentsPrompt`, `buildStartNextSessionPrompt`) +
  the `BuildContext` dependency-injection seam +
  `sanitizeSlugForPrompt` helper + four command registrations
  (`dabbler.copySpecReviewPrompt`,
  `dabbler.copySessionAccomplishmentsPrompt`,
  `dabbler.copySetAccomplishmentsPrompt`,
  `dabbler.copyStartNextSessionPrompt`). L1 honored: paths
  referenced (forward-slash normalized), artifacts never embedded.
  §3.9 carve-out documented in module header — review-criteria
  embedding is the operator-authored meta-instructions slot, not
  the artifact under review.

- `tools/dabbler-ai-orchestration/src/providers/rowMenuHelpers.ts`
  — pure decision logic extracted from `CustomSessionSetsView`:
  `buildTopLevelItems` (top-level QuickPick: `Open File ▸` + `Copy
  Eval ▸` chips when applicable + flat actions inline),
  `buildSubmenuItems`, and `planLeftClickActivation` (L5 dual-
  action: ALWAYS open spec.md; ALSO copy + toast on non-terminal
  rows). The state check is a positive `in-progress | not-started`
  test so unknown future state values FAIL CLOSED — schema drift
  cannot accidentally fire L5 on a bucket the operator never
  approved.

- `tools/dabbler-ai-orchestration/src/test/playwright/context-menu-quickpick.spec.ts`
  — Layer-3 negative invariants: no `.context-menu*` DOM in the
  webview (before or after right-click) and no `openAiAssignment`
  data-command attribute in the row tree.

**Reshaped — `ActionRegistry.ts`:**

- New `ActionCategory` discriminator (`"openFile" | "copyEval" |
  "flat"`) on each `RowAction` entry; `categorizedActions(set,
  supports)` partitions the applicable subset by category.
- 14 entries (was 15): 4 `openFile` (Spec/Activity Log/Change
  Log/Session State — L2-locked), 4 `copyEval` (the new
  `dabbler.copy*Prompt` commands with §3.2 gating), 6 `flat`
  (`dabbler.checkOutOrchestrator` gated to in-progress + `dabbler.
  openOrchestratorWriterLog` + the two mutually-exclusive migrate
  predicates + Cancel + Restore).
- Dropped: `openAiAssignment` (L3), `openUatChecklist` +
  `revealPlaywrightTests` + `openFolder` (L2 narrowed the Open File
  submenu — these commands remain palette-accessible),
  `copyStartCommand.default | .parallel` + `copySlug` (replaced by
  §3.2 copy-prompts; the old commands stay registered for backwards
  compatibility but no longer appear on the right-click surface).

**Rewritten — `CustomSessionSetsView.ts`:**

- `showContextMenu` rebuilt on `vscode.window.showQuickPick` as a
  two-step flow. Native QuickPick handles click-outside / Escape /
  focus-loss (L4 close-on-blur is a free byproduct).
- `handleActivateRow` implements L5 via the pure
  `planLeftClickActivation` planner.
- `COMMAND_ALLOWLIST` collapsed from 14 entries to 1
  (`dabblerSessionSets.openSpec`) — the L5 left-click path is the
  only remaining webview→host command-dispatch channel; QuickPick
  selections execute via `vscode.commands.executeCommand` directly
  from the host. Comment expanded to make the narrowed purpose
  explicit for future additions.

**Retired — cursor-anchored popup surface:**

- ~100 lines removed from `media/session-sets-tree/client.js`
  (`showCursorContextMenu` / popup DOM management / popup-related
  event listeners + state).
- All `.context-menu*` rules removed from
  `media/session-sets-tree/tree.css`.
- `RenderContextMenuMsg`, `ContextMenuItem`, `ExecuteRowCommandMsg`
  removed from `src/types/sessionSetsWebviewProtocol.ts`.

**Removed — `openAiAssignment` (L3):** command registration in
`openFile.ts`, `package.json` declaration, `COMMAND_ALLOWLIST`
entry, `ROW_ACTIONS` entry. The `aiAssignmentPath` field on
`SessionSet` survives so any consumer that reads the file
directly continues to work; only the menu / palette entry to open
it is gone.

## Cross-provider verification attestation

End-of-session cross-provider verification ran via
`docs/session-sets/048-lightweight-tier-parity/run_s3_verification.py`:

- **Route** — `claude-sonnet-4-6` (tier 2): ISSUES_FOUND, 8 findings.
  Cost: $0.147.
- **Verify** — `gemini-pro` (verifier): VERIFIED (review quality).
  Confirmed all 8 findings as accurate with appropriate severity
  and correct proposed fixes. Cost: $0.014.

**S3 routed cost: $0.161** of $10 NTE.
**Cumulative Set 048 spend: $0.411** (S1 $0.103 + S2 $0.147 +
S3 $0.161 = 4.1%).

### Round-A findings dispositioned in-flight (per `feedback_dont_hide_behind_out_of_scope`)

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Review-criteria content embedded into prompt body — L1 reading | Critical | **DOCUMENTED** — `docs/review-criteria/<kind>.md` is operator-authored META-INSTRUCTIONS per §3.9 explicit "embedded" wording, not artifact content. Header comment in `copyPromptCommands.ts` tightened to make the L1 vs §3.9 distinction explicit. Behavior preserved. |
| 2 | Potential `.kind` vs `.dabblerKind` dispatch-key mismatch | Critical | **FALSE POSITIVE** on inspection — actual code reads `picked.dabblerKind` correctly. Verifier was working from pseudocode in the changes summary. Interface comment on `TopLevelPickItem.dabblerKind` expanded to make the `vscode.QuickPickItem.kind` collision explicit. |
| 3 | Backtick in slug breaks L5 markdown payload | Important | **FIXED** in-flight (`sanitizeSlugForPrompt` helper replaces `` ` `` with `'` in both `buildStartNextSessionPrompt` and `planLeftClickActivation`). |
| 4 | Unknown future state values fall through to clipboard write | Important | **FIXED** in-flight (`planLeftClickActivation` flipped from negative `state !== complete && state !== cancelled` to positive `state === in-progress || state === not-started` check — unknown values fail CLOSED). |
| 5 | Redundant `.slice()` after `.filter()` in `applicableActions` | Minor | **FIXED** in-flight. |
| 6 | `copyToClipboard` swallows no error | Minor | **FIXED** in-flight (try/catch + `showWarningMessage` on rejection). |
| 7 | `buildSetAccomplishmentsPrompt` omits activity-log silently | Minor | **DOCUMENTED** in-flight (comment references spec §3.2's intentional set-vs-session evidence-source distinction). |
| 8 | `COMMAND_ALLOWLIST` narrowed purpose undocumented | Minor | **DOCUMENTED** in-flight (comment expanded explaining that QuickPick dispatches bypass the allowlist and any new webview→host channel must add allowed ids explicitly). |

Verification artifacts persisted at:

- [s3-verification-prompt.md](s3-verification-prompt.md)
- [s3-verification-route.md](s3-verification-route.md) — full 8-finding catalog
- [s3-verification-verify.md](s3-verification-verify.md)
- [s3-verification-result.json](s3-verification-result.json)

Three new regression tests lock in the in-flight fixes:

- `sanitizes backticks in slug to avoid breaking the markdown payload (S3 verifier-flagged edge case)` in `copyPromptCommands.test.ts`
- `sanitizes backticks in slug so the markdown payload stays well-formed (S3 verifier-flagged)` in `rowMenuHelpers.test.ts`
- `unknown/future state values fail CLOSED — skip clipboard, still open spec.md` in `rowMenuHelpers.test.ts`

## Test counts at close

- **TypeScript:** 665 passed (29 net new tests for S3 — 14 new in
  `copyPromptCommands.test.ts`, 16 new in `rowMenuHelpers.test.ts`,
  several added to `actionRegistry.test.ts`, minus a few replaced
  during the registry reshape) + 2 pre-existing failures unrelated
  to S3 (`configEditor-foundation` panel lifecycle +
  `notificationsSection` rendering — both predate Set 048).
- **Python:** 994 collected (no Python changes in S3).
- `npx tsc --noEmit` clean. `npm run compile` (esbuild) clean.

## Operator-takeover note

S3 was originally started ~20 minutes earlier by a Codex / gpt-5.4 /
medium chat in a different window — `start_session` flipped the
state file to `in-progress` and appended a `work_started` event,
but no implementation commits followed. The operator opened a new
Claude Opus Max chat and asked for the next session; the chat
asked via `AskUserQuestion` how to proceed and the operator chose
"Take over as Claude Opus" (preserve the original `startedAt`
timestamp, swap the orchestrator block in `session-state.json` to
`claude-code / anthropic / claude-opus-4-7 / max`, append a
`work_resumed` event to the ledger). Set 033/036 hard-coordination
enforcement is disabled by default per `project_set_033_
enforcement_disabled.md`, so no state-writer refusal fired; the
takeover was purely an audit-log update. The verifier-flagged
"chatSessionId may indicate a different chat owns the lock"
scenario doesn't apply here (no enforcement, no concurrent writer).

## What ships in this commit

- New `copyPromptCommands.ts` (~200 lines) + reshaped
  `ActionRegistry.ts` + new `rowMenuHelpers.ts` (~80 lines) +
  rewritten `CustomSessionSetsView.showContextMenu` +
  `handleActivateRow` + thinned `COMMAND_ALLOWLIST` +
  cursor-anchored popup retirement across `client.js` + `tree.css`
  + `sessionSetsWebviewProtocol.ts` + `openFile.ts` openAiAssignment
  removal + `package.json` updates + `extension.ts`
  `registerCopyPromptCommands` addition.
- New unit tests: `copyPromptCommands.test.ts` (14 tests),
  `rowMenuHelpers.test.ts` (16 tests). Updated
  `actionRegistry.test.ts` (replaces the pre-S3 15-entry contract
  with the new 14-entry + category-discriminator contract; pins the
  L3 absence invariant + L2 four-item-submenu lock). Updated
  `watcherInventory.test.ts` (bumped pinned line 148 → 149).
- New Layer-3 spec: `context-menu-quickpick.spec.ts` (2 negative
  invariants).
- Verification driver + artifacts under
  `docs/session-sets/048-lightweight-tier-parity/`.
- Activity-log entries 1-8 for S3.

## Next-session prerequisites

S4 (doc revision + per-consumer migrator + bootstrap tier-branch)
starts against the QuickPick + copy-prompt surface S3 just shipped.
The S4 doc-revision scope (bootstrap Step 4.5 + schema doc § Tier
Expectations + workflow doc Step 6 + authoring guide tri-state
docs) will cite the now-shipped commands by id and the L5 left-
click behavior by user-visible effect. The per-consumer migrator
(§3.7), wizard tier-branch (E8), cross-repo notice, agent-capability
documentation per §3.2, review-criteria template files (§3.9), and
the external-verification command (§3.8) are all S4 territory.

No S3-deferred items roll forward — every Round-A finding was
addressed in-flight.
