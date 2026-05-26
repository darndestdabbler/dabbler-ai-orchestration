# Lightweight-Tier Parity — Audit Pending

> **Purpose:** audit-then-spec the Lightweight tier's adoption of the
> Full-tier workflow per the operator directive locked in Set 047 S1.
> **Created:** 2026-05-26 (stub — Set 047 / S1 close-out).
> **Status:** STUB — AUDIT PENDING. The pre-audit material below
> captures the locked premises and the Set-047-deferred deliverables.
> A fresh cross-provider audit pass should run before this spec is
> detailed.
> **Session Set:** `docs/session-sets/048-lightweight-tier-parity/`
> **Prerequisite:** Set 047 (`047-state-file-schema-v4-audit`)
> CLOSED. v4 schema must be canonical and stable before the
> non-router writer code path lands; otherwise Set 048's writers
> would need to emit v3 and then be re-migrated to v4.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Why this is a STUB

Per [[feedback_audit_then_spec_for_substantial_features]] and the
explicit Q4 verdict in Set 047 S1's audit
(`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md`):
Set 048 needs its own audit pass. Set 047's Group B section
scope-locked Set 047's *treatment* of the Lightweight directive
(what Set 047 does NOT ship), not Set 048's implementation plan
(what Set 048 DOES ship).

---

## Operator-locked premises (inherited from Set 047, NOT open to challenge)

- **P1.** Lightweight orchestrators MUST follow the same process as Full for: (a) model and effort identification, (b) session-set identification, (c) session identification, (d) `session-state.json` updates at the appropriate times.
- **P2.** Session Set Explorer UX is identical between tiers.
- **P3.** Lightweight differs from Full ONLY in: no AI router runtime calls; no auto-verification; provides copyable review prompts; suggests (does not require) UAT/E2E.
- **P4.** Lightweight users must not be required to hand-edit any state files.

These premises and the operator's clarifying message are captured in memory at `project_lightweight_uses_same_process_as_full.md`.

---

## Locked-from-Set-047 design decisions

The following were settled during Set 047 S1's audit and should NOT be revisited:

- **Single `dabbler-ai-router` package.** No package split. (Set 047 Bias 1 flip — Path 2 won.)
- **Copyable-prompt commands ship on BOTH surfaces.** Command Palette commands AND right-click context-menu commands. (Set 047 Bias 3 flip.)
- **Three commands:** copy-spec-review-prompt, copy-session-accomplishments-prompt, copy-set-accomplishments-prompt.
- **Tri-state for `requiresUAT` / `requiresE2E`:** `true | false | "suggested"`. Runtime: `true` blocks close-out; `false` skips; `"suggested"` logs a reminder without blocking.
- **CLI backward compatibility is a firm requirement.** Existing `python -m ai_router.start_session` etc. invocations must continue to work after the `--no-router` mode lands.

---

## Pre-audit material — what Set 048 is expected to ship

### Major deliverables

1. **`--no-router` mode** on `dabbler-ai-router`: env var (e.g., `DABBLER_NO_ROUTER=1`) or CLI flag (e.g., `--no-router`) that suppresses LLM SDK imports and verification calls. Lightweight installations install `dabbler-ai-router` like Full but never make an LLM API call.
2. **Copyable-review-prompt commands**: three Command Palette + right-click context-menu commands. Each emits a templated prompt onto the clipboard (or surfaces it for copy):
   - Copy spec-review prompt: full `spec.md` body + operator-customizable review questions.
   - Copy session-accomplishments prompt: `activity-log.json` entries for the session + commit diff + change-log entry if present.
   - Copy set-accomplishments prompt: full `change-log.md` + session-set commit range.
3. **Tri-state UAT/E2E**: schema validation for `spec.md` accepts the third state `"suggested"`. Runtime logging emits a reminder line at session start and a Step 10 reminder at close-out, but does not block.
4. **`docs/adoption-bootstrap.md`** Step 4.5 rewrite: hand-edit recipe deleted; "install dabbler-ai-router + run with `--no-router`" added; tier-choice text aligned with P1-P4.
5. **`docs/ai-led-session-workflow.md`** Step 6 rewrite: documents Lightweight's verification-via-copyable-prompts as a substitution, not a skip.
6. **`docs/session-state-schema.md`** §Tier Expectations rewrite: hand-edit recipe deleted; Lightweight uses same writers; tier difference is the verification mechanism only.

### Open audit topics (S1 audit will dispose)

1. **Where does the `--no-router` flag live?** Env var vs CLI flag vs both. What's the precedence order? Should it persist across invocations or be re-passed each call?
2. **Copyable-prompt templating**: where do templates live (source-tree text files? Python module strings? JSON config)? How does the operator customize review questions?
3. **Clipboard mechanism on Windows vs macOS vs Linux**: VS Code has a built-in `vscode.env.clipboard.writeText()` API; using it for B2 commands is the obvious path, but the audit should confirm.
4. **Suggested-state reminder UX**: where does the reminder surface? Activity-log entry only? Close-out output? VS Code information toast? All three?
5. **Migration of consumer repos** currently emitting non-canonical Lightweight shapes (e.g., `great-psalms-scroll-font`'s `sessionLog[]`): does Set 048 ship per-repo migration tooling, or is each consumer responsible for their own migration?
6. **AI router config under no-router mode**: does the operator still need a `router-config.yaml`? An LLM API key? Or are those silently skipped?
7. **Lightweight verification mechanism**: when the operator pastes a copyable prompt into a separate chat, how does the result come back into the session set? Manual paste into a free-form artifact? A dedicated `external-verification.md` per session?
8. **Bootstrap UX for new Lightweight repos**: does the existing `Dabbler: Get Started` wizard handle Lightweight, or does it need a tier-conditional branch?

### Estimated session arc (audit-deliverable)

Provisional: 4-6 sessions (audit S1 + 3-5 implementation sessions). The audit will lock the exact count.

---

## Non-goals (audit-pending — to be confirmed in S1)

- **v4 schema design** — Set 047's territory; Set 048 builds against canonical v4.
- **PyPI package split** — rejected in Set 047 Bias 1 flip.
- **Auto-verification for Lightweight** — explicitly excluded by premise P3.

---

## Cross-references

- Predecessor: [`docs/session-sets/047-state-file-schema-v4-audit/`](../047-state-file-schema-v4-audit/)
- Set 047 audit verdict (Set 048's grounding): [`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md`](../../proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md)
- Operator directive memory: `project_lightweight_uses_same_process_as_full.md`
- Tier definition history: `project_lightweight_tier_added_to_bootstrap.md`
