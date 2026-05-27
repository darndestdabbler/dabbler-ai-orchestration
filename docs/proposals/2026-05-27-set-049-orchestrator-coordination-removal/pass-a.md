# Audit-S1 Pass A — Primary author disposition

## T1 schema version
**Disposition:** v4-compatible
**Reasoning:** The read-site survey confirms no non-retiring code consumes the three dropped fields. A v4-compatible change avoids an unnecessary migration step for 47+ historical sets and aligns with the principle of least disruption for a purely subtractive change.

## T2 CLI compatibility surface
**Disposition:** accept-and-ignore
**Reasoning:** P5 requires backward compatibility, and the live Claude hook integration passes the `--chat-session-id` flag unconditionally. Refusing the flag would break this integration, while a warning would be unactionable noise. Accepting and ignoring is the smoothest path forward.

## T3 How does the orchestrator declare engine/provider/model/effort to the writer under H1?
**Disposition:** The hook shall pass only the subset of orchestrator block fields it knows authoritatively.
**Reasoning:** The hook can reliably provide `engine` and `provider`. Passing these and omitting `model` and `effort` respects the omit-null (P2) contract and prevents the propagation of stale or incorrect data, which was the original trigger for this rip-out.

## T4 Migration of existing `session-state.json` files
**Disposition:** Leave them bloated (readers ignore extras).
**Reasoning:** Since the v4-compatible approach (T1) ensures readers safely ignore extra fields, a mass migration of historical files offers no functional benefit. It introduces unnecessary work and risk for a purely cosmetic outcome.

## T5 `~/.dabbler/orchestrator-writer.log`
**Disposition:** Retire the file and its writer.
**Reasoning:** The log's purpose was to record check-out and handoff events, which are being eliminated. Its residual function—logging session boundaries—is already served with greater detail and structure by `session-events.jsonl`. Retaining it would be redundant.

## T6 Session-events.jsonl event types
**Disposition:** Retire `holder_change` and `checkout_conflict` from the emit-side.
**Reasoning:** Emitting events for concepts that have been removed from the system's model is semantically incorrect and pollutes the event stream. The event ledger's integrity is best preserved by recording only what actually occurs.

## T7 Cross-repo CLAUDE.md insertion text
**Disposition:** Rewrite as "this content no longer applies, remove it from your CLAUDE.md".
**Reasoning:** The most actionable guidance for consumer repos is a clear directive. Rewriting `docs/cross-repo-checkout-notice.md` to explicitly state that the previous notice is obsolete and should be removed provides this clarity and prevents stale documentation in downstream projects.

## D1 bare-touch under omit-null
**Disposition:** Retire detector.
**Reasoning:** The detector's logic (`state.orchestrator_engine is None`) is fundamentally incompatible with the operator-locked premise P2 (omit-null). An absent `engine` field is now a valid state, not an error condition, so the detector's premise is invalid.

## D2 engine-mismatch and stale-checkout-touch
**Disposition:** Retire detectors.
**Reasoning:** Both detectors are critically dependent on the `lastActivityAt` field. Per premise P3, this field is being removed from the data model and writers. The detectors are therefore non-functional and must be retired.

## D3 writer-bypass
**Disposition:** Decouple and Keep.
**Reasoning:** This detector enforces a critical system invariant: that `session-state.json` is only modified through canonical writers that also update `session-events.jsonl`. This integrity check is valuable independently of the coordination layer and should be retained to prevent untracked state modifications.

## Feature roll-call

### FR1 external-verification.md soft gate
**Recommendation:** Keep
**Reasoning:** This feature directly addresses the quality and completeness of session artifacts, a core concern of the system. It's a lightweight, valuable check that is independent of the orchestrator coordination logic being removed.

### FR2 migrate_lightweight_to_canonical_v4 CLI
**Recommendation:** Defer
**Reasoning:** This migration tool is unrelated to the Set 049 rip-out. Its inclusion should be deferred until its necessity and relationship to other tools can be assessed independently, avoiding scope creep for the current set.

### FR3 dabbler.openExternalVerificationDoc command
**Recommendation:** Keep
**Reasoning:** This command is a direct UX enhancement for the `external-verification.md` workflow (FR1). Keeping the prompt but removing the easy way to act on it would be a poor user experience. The two features should be kept together.

### FR4 docs/review-criteria/{spec,session,set}.md template bootstrap kit
**Recommendation:** Keep
**Reasoning:** These document templates are a valuable asset for maintaining process consistency and have no impact on the core software. They are purely additive and their removal would be a net loss with no corresponding engineering benefit.

### FR5 Migrate to v4 schema right-click action + python -m ai_router.migrate_v3_to_v4 CLI
**Recommendation:** Keep
**Reasoning:** This migration path is unrelated to the Set 049 changes but remains critical for the v3 -> v4 schema transition. As long as v3 artifacts exist, this tool is necessary for repository maintenance and upgrades.

## Locked session arc
**Count:** 4
**Per-session theme breakdown:**
*   **Session 1:** Core code removal. Delete coordination logic from `session_state.py`, retire `conflicts.py` detectors (except `writer-bypass`), remove `new_chat_id.py`.
*   **Session 2:** Writer-side cleanup. Purge `checkedOutAt`, `lastActivityAt`, `chatSessionId` from all writer paths. Implement accept-and-ignore for CLI flags (T2). Retire `orchestrator-writer.log` and event types (T5, T6).
*   **Session 3:** Decoupling and updates. Decouple `writer-bypass` from coordination context (D3). Update Claude hook to pass only known orchestrator fields (T3). Update `CLAUDE.md` insertion text (T7).
*   **Session 4:** Integration and verification. Validate rip-out against historical sets, ensure Session Set Explorer rendering is correct (P4), and perform end-to-end testing of remaining session start/close flows.

## Audit-discovered open questions for operator
None