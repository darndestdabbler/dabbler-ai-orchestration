# Set 049 audit-S1 — Orchestrator coordination removal

> **Audit posture:** the **premises are operator-locked** (P1–P5 below) and
> NOT open to challenge. Audit-S1's job is to dispose the **open topics**
> (T1–T7), surface the **discovered collisions** the pre-audit survey
> turned up (D1–D3), and produce a recommendation on the **5 feature
> roll-call items** before the operator decides Keep/Drop/Defer inline.

## What's being removed and why

The check-out / check-in coordination layer shipped in Set 033 (0.18.0)
and was refined in Set 036 (0.20.0). Its enforcement was disabled by
default mid-Set-046 after a staff-onboarding incident, with mechanics
retained behind `DABBLER_ENFORCE_CHECKOUT_COORDINATION=1`. The
longer-term decision has been made: **full rip-out, not
preservation-with-flag**.

Triggering observation (operator, 2026-05-26): `session-state.json` for
Set 047 S4 and S5 recorded `engine=codex, model=gpt-5.4` while the
operator was actually running Claude Opus Max. The recorded
orchestrator identity is unreliable. The `lastActivityAt` field was
observed as *earlier* than `completedAt`, which is nonsense. Better to
show no information than wrong information.

## Operator-locked premises (NOT open to challenge)

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
- **P5.** CLI backward compatibility: existing flags continue to work.
  Concrete behavior for now-meaningless flags is T2 below.

## Open audit topics (audit disposes; recommendation + reasoning)

1. **Schema version**: v4-compatible (writers stop emitting 3 fields;
   readers ignore extras) vs. v5 bump (clean break + explicit
   migration). The pre-audit signal favors v4-compatible. Audit input:
   read-site survey (below) shows zero non-enforcement consumers of
   the 3 dropped fields after the discovered collisions in D1–D3 are
   resolved. Is the v4-compatible path safe to take?
2. **CLI compatibility surface**: `python -m ai_router.start_session
   --chat-session-id ...` — accept-and-ignore, accept-with-warning, or
   refuse-with-deprecation-error? What does the H1 router-only-writes
   contract imply? (Currently the Claude hook unconditionally passes
   `--chat-session-id` when the SessionStart payload has one. Refusal
   breaks live hook installs in consumer repos.)
3. **How does the orchestrator declare engine/provider/model/effort to
   the writer under H1?** Currently the hook hard-codes engine/provider
   and pulls model/effort from the prior state-file block with
   `"unknown"` fallback. Under omit-null with no placeholder strings,
   should the hook simply pass the subset it knows (engine+provider
   reliably; model+effort omitted unless the prior block had them) and
   let omit-null handle the rest? Should new orchestrators (Codex,
   Gemini) ship analogous hooks, or is this an operator-CLI-only
   pattern post-rip?
4. **Migration of existing `session-state.json` files** (47+
   historical sets, plus 048's). Three sub-questions:
   - Do we sweep-and-normalize, leaving only `engine/provider/model/
     effort` in historical orchestrator blocks?
   - Or leave them bloated (readers ignore extras)?
   - If we sweep: per-session orchestrator block (v4 ledger) too, or
     only the top-level legacy fields (which v4 derives away)?
5. **`~/.dabbler/orchestrator-writer.log`**: retained as audit-history
   artifact, or retired with the rest of the coordination layer? The
   log records every check-out / handoff. Without coordination, the
   only writers are start_session and close_session — the audit log
   would degrade to a thin record of session boundaries that
   `session-events.jsonl` already records.
6. **Session-events.jsonl event types** `holder_change` and
   `checkout_conflict`: retire from the emit-side, or keep emitting as
   no-op-but-recorded for downstream consumers (joiner, future
   harvest)? Retiring is cleaner; keeping is the H2 "events ledger is
   sole truth" hedge.
7. **Cross-repo CLAUDE.md insertion text** at
   `docs/cross-repo-checkout-notice.md`: what's the replacement
   message for consumer repos that paste-in'd the original? Three
   candidates: retire the file outright; rewrite as "this content no
   longer applies, remove it from your CLAUDE.md"; rewrite as a brief
   "orchestrator-identity is no longer tracked beyond a 4-field block,
   here's what you'll see instead."

## Discovered collisions (pre-audit survey)

These were uncovered by the audit-S1 reviewer surveying the codebase
before this proposal was drafted. They are NOT topic disagreements —
they are factual coupling problems that the rip-out plan needs to
account for.

- **D1. `bare-touch` under omit-null fires constantly.** The current
  `bare-touch` detector in `ai_router/joiner/conflicts.py` fires when
  `state.orchestrator_engine is None`. Under P2 (omit-null) + P3
  (chatSessionId/checkedOutAt/lastActivityAt dropped), the `engine`
  field may legitimately be missing whenever a writer ran without
  knowing the engine (the hook's fallback case). The `bare-touch`
  detector cannot survive omit-null without redefinition; the spec's
  removal of the detector is consistent and necessary.

- **D2. `engine-mismatch` and `stale-checkout-touch` both depend on
  `lastActivityAt`.** Both detectors in `conflicts.py` read
  `state.last_activity` (`orchestrator.lastActivityAt`). Under P3,
  this field is dropped. The detectors are no longer functional
  regardless of whether the spec explicitly retires them.

- **D3. `writer-bypass` is engine-independent.** Unlike A/B/C above,
  `writer-bypass` (in the same file) detects when `session-state.json`
  mtime is not bracketed by a corresponding `session-events.jsonl`
  entry. It has nothing to do with orchestrator identity — it's a
  writer-discipline check. The spec retires it alongside the
  coordination detectors, but the reasoning is unclear: writer-bypass
  catches "someone wrote the state file outside the canonical writer"
  which is a generally useful integrity check beyond coordination.
  **Audit input requested:** justify keeping or dropping `writer-bypass`
  on its own merits, not as part of the coordination layer.

## Read-site survey for the 3 dropped fields

- `chatSessionId`: 18 files contain the snake or camel form. Outside
  tests, the only readers are:
  - `ai_router/start_session.py` (`_resolve_chat_session_id`,
    `prior_chat_session_id` matching — both in the H3/H4 coordination
    path that the rip-out removes)
  - `ai_router/session_state.py` (`orchestrator_chat_session_id`
    writer param — write-side only)
  - `ai_router/new_chat_id.py` (whole file retiring)
  - `tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js`
    (passes `--chat-session-id` to start_session; under P3 this
    becomes a no-op)
  - Extension TS: `CheckoutPollService`, `checkOutOrchestrator`,
    `chatSessionMismatchModal` — all retiring per P4
  - `tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts`
    — needs verification (likely shape declaration only)

- `checkedOutAt`: 178 files match `chatSessionId|checkedOutAt|
  lastActivityAt` globally; the field-specific reader is `prior_orch.
  get("checkedOutAt")` in `session_state.py:862` for the
  same-holder-keep-timestamp logic (retiring). The hook invoker emits
  it into the conflict record (retiring). The Explorer renders it via
  P4-removed code paths.

- `lastActivityAt`: read by `conflicts.py` (Mode A + B detectors, both
  retiring per D2). Read by the joiner's `parsers.SessionStateView`
  (which the harvest infrastructure outside coordination uses, per
  spec Non-goal 2 — but only as part of conflict detection).

**Audit conclusion:** after the rip removes the 6 conflict-detection +
coordination code paths, **no remaining reader depends on any of the 3
dropped fields**. v4-compatible (T1) is safe.

## Feature roll-call (5 items needing Keep / Drop / Defer)

These were AI-proposed during Set 047 / Set 048 audits and self-approved
through cross-provider consensus without an explicit per-feature
operator decision. Per the 2026-05-27 operator-accountability
addition to the stub memory, audit-S1 surfaces them for inline
Keep/Drop/Defer:

- **FR1.** Set 048 §3.5 `external-verification.md` soft gate (TTY [y/N]
  prompt in `close_session`, non-interactive `--accept-suggestions`
  flag).
- **FR2.** Set 048 §3.7 `migrate_lightweight_to_canonical_v4` CLI.
- **FR3.** Set 048 §3.8 `dabbler.openExternalVerificationDoc` command.
- **FR4.** Set 048 §3.9 `docs/review-criteria/{spec,session,set}.md`
  template bootstrap kit.
- **FR5.** Set 047 §3.4 `Migrate to v4 schema` right-click action +
  `python -m ai_router.migrate_v3_to_v4` CLI.

For each item, audit-S1 produces a Keep/Drop/Defer recommendation with
reasoning. Operator decides inline during S1.

## Session-arc estimate (audit disposes)

Provisional: 3-5 sessions. Pass A and Pass B each estimate a count.

## What the audit must produce

1. Disposition for each of T1–T7 (chosen path + brief reasoning).
2. Disposition for each of D1–D3 (D1+D2 likely just "consistent with
   rip"; D3 needs an actual call).
3. Keep/Drop/Defer recommendation for FR1–FR5 (with reasoning).
4. A locked session arc count.
5. A flag for any audit-discovered open question the operator should
   see before lock.
