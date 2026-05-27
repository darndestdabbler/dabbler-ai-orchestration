# 049 — Orchestrator Coordination Removal

> **Purpose:** rip out the check-out / check-in coordination layer
> shipped in Set 033 (0.18.0) and refined in Set 036 (0.20.0); simplify
> the `session-state.json` orchestrator block to four fields with an
> omit-null writer pattern; remove all orchestrator-rendering and
> coordination-conflict pieces from the Session Set Explorer; sweep
> historical state files to drop the 3 retired fields.
> **Audit:** S1 ran 2026-05-27; verdict at
> [`docs/proposals/2026-05-27-set-049-orchestrator-coordination-removal/verdict.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/verdict.md).
> **Status:** AUDIT-LOCKED. S2 begins on operator request.
> **Session Set:** `docs/session-sets/049-orchestrator-coordination-removal/`
> **Prerequisite:** Set 047 (`047-state-file-schema-v4-audit`) CLOSED
> and Set 048 (`048-lightweight-tier-parity`) CLOSED. Both verified
> 2026-05-27.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.
> **NTE budget:** $10 (per S1 operator answer; $0.0475 spent on S1
> audit).
> **Tier:** full

## Session Set Configuration

```yaml
totalSessions: 5
prerequisites:
  - 047-state-file-schema-v4-audit
  - 048-lightweight-tier-parity
requiresUAT: true
requiresE2E: false
uatStyle: ad-hoc
effort: high
tier: full
```

`requiresUAT: true` because S5 ships a release with a new
4-field omit-null orchestrator block, migrator sweep, and Explorer
surface revert — must be exercised end-to-end before tag-push.
`requiresE2E: false` because the rip is removal-dominated and the
remaining behaviors are covered by Layer-1 unit tests and Layer-3
Playwright smoke. `effort: high` because the touch surface spans
Python (`ai_router/`), TypeScript (extension TS), hook JavaScript,
docs, and tests; the session arc is 5. `tier: full` because the
development arc is Full tier even though the resulting state-file
shape is the canonical post-rip shape both tiers use.

---

## 1. Operator-locked premises (NOT open to challenge)

- **P1.** Orchestrator block fields = `engine`, `provider`, `model`,
  `effort`. Nothing else.
- **P2.** Writers use omit-null. Missing keys allowed in the on-disk
  shape; no `null` values, no `"unknown"` placeholder strings.
- **P3.** `checkedOutAt`, `lastActivityAt`, `chatSessionId` — all
  dropped from the on-disk shape AND the writer code paths.
- **P4.** No orchestrator information in the Session Set Explorer
  rendering. No harvest-record badges (W / N / M / B). No
  coordination-conflict pills. The Explorer's orchestrator-info
  dimension reverts to its pre-Set-045 shape.
- **P5.** CLI backward compatibility — concrete behavior per T2 below.

---

## 2. Audit-locked dispositions

### T1 — Schema version: **v4-compatible**

Writers stop emitting the 3 retired fields. Readers continue to ignore
extras (already the v4-shim contract). No reader cutover. Historical
files get swept (T4) so dual-shape debt doesn't persist.

### T2 — CLI backward compatibility: **accept-with-warning**

`python -m ai_router.start_session --chat-session-id <id>` (and any
other now-vestigial flag) is accepted by `argparse` and ignored by the
writer logic, with one `stderr` line per invocation:

```
start_session: --chat-session-id is no longer used (Set 049); ignoring
```

The Claude `SessionStart` hook continues to pass `--chat-session-id`
from the payload (S2-removed in the hook code itself, but the CLI
keeps the flag definition for consumer repos with older invokers).

### T3 — Orchestrator declaration contract: **subset-of-known + documented**

The hook (or operator CLI) passes only the orchestrator-block fields
it can declare authoritatively. Fields it cannot are simply omitted
from the CLI call. The writer applies omit-null on the resulting block.

For Claude: hook passes `engine=claude`, `provider=anthropic`; omits
`model` and `effort` unless the prior orchestrator block contained
recoverable values (no `"unknown"` fallback). For Codex/Gemini/other:
analogous hooks document the same contract in their installer.

This contract is documented in `docs/session-state-schema.md` § Writer
Contract.

### T4 — Historical state files: **sweep+normalize as part of S3**

The Set 047 `migrate_v3_to_v4` migrator is extended to also strip the
3 retired fields (`checkedOutAt`, `lastActivityAt`, `chatSessionId`)
from existing orchestrator blocks during the v3→v4 (and v4→v4)
normalization pass. Both the top-level legacy `orchestrator` field
(where it survives in pre-Set-047 files) and the per-session ledger
orchestrator blocks (v4 shape) get swept.

Re-running the migrator on already-normalized v4 files becomes a
no-op for the schema version but strips orchestrator-block extras —
idempotent. The `.bak` rollback contract from Set 047 S3 is preserved.

### T5 — `~/.dabbler/orchestrator-writer.log`: **keep provisionally**

The log file and its appender are retained. The append-on-handoff
trigger that called out in CLAUDE.md is preserved as a generic
"start_session ran" record (no holder-change semantics post-rip). The
log gains a short comment in `start_session.py` explaining it survived
as a post-rip diagnosis surface. Revisit in a future stability set if
it proves dead.

### T6 — `holder_change` / `checkout_conflict` event types: **retire emit**

No downstream consumer survives the rip (the joiner conflict detectors
that consumed them are retired per D1/D2). Retire the emit-side calls
in `session_events.py` and any caller. Existing journal entries in
`session-events.jsonl` files are left intact (audit history).

### T7 — Cross-repo notice: **rewrite as deprecation instruction**

`docs/cross-repo-checkout-notice.md` is rewritten as a one-page
"remove this content from your CLAUDE.md" deprecation instruction.
Consumer repos that paste-in'd the original snippet get a clear
remediation path: delete the corresponding block from their CLAUDE.md.

### D1 — `bare-touch`: **retire detector**

Incompatible with P2 (omit-null engine field). Loss-of-signal accepted
as the cost of the unreliable-data premise driving the rip-out.

### D2 — `engine-mismatch` + `stale-checkout-touch`: **retire detectors**

Both depend on `lastActivityAt` (P3). Loss-of-signal accepted —
post-rip there is no time-ordered evidence of staleness or engine
drift. Acceptable.

### D3 — `writer-bypass`: **keep, decoupled**

The detector is preserved in `ai_router/joiner/conflicts.py` (or
relocated to a more honestly named module if helpful). Its predicate
(state-file mtime not bracketed by an events-ledger entry) is
engine-independent and catches out-of-band writes that the
coordination layer never covered. Documented as a general
writer-discipline check.

---

## 3. Feature roll-call dispositions (operator inline)

| FR | What | Decision |
|----|------|----------|
| FR1 | Set 048 §3.5 external-verification.md soft gate | **Keep** |
| FR2 | Set 048 §3.7 `migrate_lightweight_to_canonical_v4` CLI | **Keep** as separate CLI |
| FR3 | Set 048 §3.8 `dabbler.openExternalVerificationDoc` command | **Keep** paired with FR1 |
| FR4 | Set 048 §3.9 review-criteria templates | **Keep** |
| FR5 | Set 047 §3.4 `migrate_v3_to_v4` + right-click action | **Keep** (canonical v3→v4 surface; FR2 is canonical Lightweight→canonical) |

Set 049 leaves all five features intact. The accountability mechanism
(operator review of AI-proposed features during audit-S1) is
preserved for future sets.

---

## 4. Survey gap to close before S2 code-deletion

Pass B identified that the read-site survey underweights non-runtime
consumers. S2 opens with a focused 30-min re-survey across:

- `tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts`
  — does the webview protocol shape declare any of the 3 retired fields?
  If so, are they read or just declared?
- `tools/dabbler-ai-orchestration/src/providers/HarvestService.ts`
  — does HarvestService consume conflict-detector output that's being
  retired? Confirm the harvest infrastructure can survive without
  D1/D2 detectors (D3 stays).
- Consumer-repo hooks in `dabbler-platform`, `dabbler-access-harvester`,
  `dabbler-homehealthcare-accessdb` — do any of these call
  `start_session --chat-session-id` directly (vs. relying on the
  shipped Claude invoker)? If so, the T2 accept-with-warning behavior
  protects them; document the expectation in the cross-repo notice
  rewrite.
- Any JSON schema or generated type derived from `session-state.json`
  that pins the old shape — `ai_router/scripts/dump_session_state_schema.py`
  is a likely candidate.

If anything non-trivial turns up, S2 surfaces it before the rip
proceeds.

---

## 5. Session arc (locked at 5 sessions)

### Session 1 — Audit + locked spec ✅ (this session)

Cross-provider audit-S1 (Pass A gemini-pro + Pass B gpt-5-4-mini),
operator roll-call, locked spec, locked session arc. Implementation
work begins in S2.

### Session 2 — Core ai_router code removal

- **Pre-flight survey** (the §4 gap close, ~30 min): non-runtime
  consumer audit; surface any blockers before rip proceeds.
- **`ai_router/start_session.py`**: remove `EXIT_CHECKOUT_CONFLICT`,
  `prior_engine_provider` matching, takeover modal / TTY prompt,
  `_coordination_enforced()` gate. CLI flag `--chat-session-id` stays
  defined (T2 accept-with-warning) but no longer feeds the writer.
- **`ai_router/new_chat_id.py`**: whole CLI retired (no preservation
  flag; T2 doesn't require its survival).
- **`ai_router/close_session.py`**: check-in branch removed.
- **`ai_router/session_state.py`**: writer reduces to a 4-field block
  with omit-null. `orchestrator_chat_session_id` writer parameter
  removed; `checkedOutAt` / `lastActivityAt` field-emission lines
  removed.
- **`ai_router/joiner/conflicts.py`**: retire `bare-touch`,
  `engine-mismatch`, `stale-checkout-touch` (functions deleted, ConflictKind
  Literal narrowed to just `"writer-bypass"`). Decouple
  `writer-bypass` from coordination context — rename the module
  docstring to reflect general writer-discipline framing.
- **`ai_router/session_events.py`**: retire `holder_change` and
  `checkout_conflict` event-type emission (T6). Existing JSONL entries
  left intact.
- **Tests**: retire `test_chatsessionid_writer.py`,
  `test_checkout_writer.py`, `test_start_session_takeover_prompt.py`,
  `test_new_chat_id.py`. Update `test_joiner_conflicts.py` to only
  cover `writer-bypass` (D3 retained). Update
  `test_session_state_v4_writers.py` for the new 4-field omit-null
  shape.
- **Verification**: Round A only (close_session auto-verify is
  cross-provider per pattern). End-of-session test suite pass.

### Session 3 — Writer-side cleanup + migration sweep

- **`tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js`**:
  drop `--chat-session-id` forwarding; drop `EXIT_CHECKOUT_CONFLICT`
  handling; drop `emitConflictRecord`; drop `~/.dabbler/checkout-conflicts/`
  directory write. Hook reduces to: walk-up resolve in-progress set,
  spawn `start_session --engine claude --provider anthropic [--model X
  --effort Y]` where model/effort come from prior block recovery (no
  `"unknown"` fallback under T3). On non-zero exit, log stderr and exit 0.
- **`ai_router/migrate_v3_to_v4.py`**: extend with the T4 sweep+normalize
  — strip `chatSessionId`, `checkedOutAt`, `lastActivityAt` from all
  orchestrator blocks (top-level legacy + per-session ledger).
  Idempotent on already-clean v4 files. `.bak` rollback preserved.
- **`docs/session-state-schema.md`**: orchestrator-block definition
  reshaped to 4-field omit-null. New § Writer Contract documents T3
  per-orchestrator declaration pattern.
- **Verification**: Round A. Re-run migrator dry-run across the
  47+ historical sets in `docs/session-sets/` to confirm the
  T4 extension works on every shape variant.

### Session 4 — Extension TS cleanup + Explorer revert

- Retire TS commands: `dabbler.checkOutOrchestrator`,
  `dabbler.releaseCheckOut`, `dabbler.newChatIdWorkflowToast`,
  `chatSessionMismatchModal`, `CheckoutPollService`.
- Retire Set 045's Explorer surface additions per P4: harvest-record
  badges (W / N / M / B) and coordination-conflict pills removed from
  `CustomSessionSetsView.ts` and adjacent renderers.
- Confirm `HarvestService.ts` survives in a stub-or-minimal shape
  consistent with §4 survey findings — its conflict-pill rendering
  path is removed, but its log-harvest scaffolding stays available
  for non-conflict use per the spec's Non-goal 2.
- **`docs/cross-repo-checkout-notice.md`**: rewrite as T7 deprecation
  instruction.
- Retire TS tests: `checkOutOrchestratorChatSessionMismatch.test.ts`,
  `chatSessionMismatchModal.test.ts`, `checkoutPollService.test.ts`,
  `claudeSessionStartInvoker.test.ts` (drop coordination assertions;
  keep the invoker shape tests for the simplified path),
  `new-chat-id-cli-flow.spec.ts`, `chatsessionid-takeover.spec.ts`,
  `chatsessionid-missing-tolerance.spec.ts`, `checkout-polling.spec.ts`,
  `checkout-conflict.spec.ts`, `harvest-signals.spec.ts`.
- **Verification**: Round A. Confirm Layer-1 + Layer-3 test
  suites pass with the reduced surface area.

### Session 5 — Docs + version bumps + close-out

- **`CLAUDE.md`**: retire the "Hard-coordination enforcement (Sets
  033 / 036) is OFF by default" section entirely (no historical
  preservation needed — the rip-out makes the section obsolete).
  Rewrite the Extension versioning current-state section. Add a
  Set 049 entry to the version walk.
- **`docs/ai-led-session-workflow.md`**: update Step 6 references to
  start_session (no chatSessionId pre-flight); update Step 8 references
  if any cited the coordination layer.
- **UAT checklist**: produce a focused 15-20 item rip-out UAT covering:
  - clean session start/close end-to-end on Full and Lightweight tiers
  - new orchestrator-block shape verified across each tier
  - migrator dry-run + apply on a fixture v3 file
  - accept-with-warning behavior on `--chat-session-id`
  - Explorer surface free of harvest badges / conflict pills
  - writer-bypass detector still fires on a synthetic bypass
  - close_session and start_session both clean on cancel/restore
- **PyPI `dabbler-ai-router`**: version bump (operator picks
  patch/minor/major at S5 start; default recommendation: **minor**
  for the orchestrator-block reshape + `accept-with-warning`,
  acknowledging the breaking nature of `new_chat_id.py` retirement).
  Build wheel, stage `v<X.Y.Z>` tag for operator-initiated push.
- **Marketplace `dabbler-ai-orchestration`**: parallel minor bump.
  Build .vsix, stage `vsix-v<X.Y.Z>` tag for operator-initiated push.
- **CHANGELOG.md** entries in both `ai_router/` and
  `tools/dabbler-ai-orchestration/`.
- **Change-log.md** for Set 049 + close-out per workflow Step 8.
- **Verification**: Round A + Round B (final session).

---

## 6. Non-goals

- **Re-design of the orchestrator-identity capture pipeline.** Set 049
  is rip-out only. If a future need for accurate orchestrator-identity
  capture arises, it's a separate green-field audit set.
- **Set 045 dual-primary log harvest as a whole.** Only the
  orchestrator-rendering and coordination-conflict pieces of the
  harvest surface are removed (D1/D2 detectors + their Explorer
  rendering). The underlying log-harvest infrastructure
  (wrapper-launched detection, native-log parsing in
  `ai_router/joiner/parsers.py`) and the `writer-bypass` detector (D3)
  survive.
- **Lightweight-tier-specific changes.** Set 048's territory; FR2
  stays as Set 048 shipped it.
- **Schema v5.** v4-compatible per T1.
- **Removal of `dabbler.openExternalVerificationDoc`, review-criteria
  templates, or any other Set 047/048 feature.** Feature roll-call all
  Keep per §3.

---

## 7. Cross-references

- Audit verdict: [`docs/proposals/2026-05-27-set-049-orchestrator-coordination-removal/verdict.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/verdict.md)
- Pass A (gemini-pro): [`pass-a.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/pass-a.md)
- Pass B (gpt-5-4-mini): [`pass-b.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/pass-b.md)
- Proposal (audit input): [`proposal.md`](../../proposals/2026-05-27-set-049-orchestrator-coordination-removal/proposal.md)
- Predecessor v4 schema: [`docs/session-sets/047-state-file-schema-v4-audit/`](../047-state-file-schema-v4-audit/)
- Predecessor Lightweight parity: [`docs/session-sets/048-lightweight-tier-parity/`](../048-lightweight-tier-parity/)
- Pre-rollback architecture audit (historical):
  [`docs/proposals/2026-05-21-chatsessionid-and-watcher-scope/`](../../proposals/2026-05-21-chatsessionid-and-watcher-scope/)
- Memory: `feedback_orchestrator_block_omit_null_no_explorer.md`
- Memory: `project_set_033_enforcement_disabled.md`
- Memory: `project_set_049_stubbed.md`
