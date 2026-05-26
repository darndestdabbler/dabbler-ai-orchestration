# Set 047 — State-File Schema v4 + Lightweight-Tier Parity — Audit Proposal (Pass A)

**Status:** PASS A DRAFT — awaiting two-pass devil's-advocate cross-provider verification at end-of-Session-1 for scope-lock.

**Authored:** 2026-05-26, Set 047 Session 1.

**Predecessors:**
- Set 046 (`046-explorer-enrichment-from-harvest-records`) CLOSED 2026-05-26 (2 of 2 sessions); deferred the v4 schema work to this set explicitly.
- Set 044 (`044-log-discovery`) audit established the audit-then-spec discipline; this set follows the same template.

**Source-of-truth spec:**
[`docs/session-sets/047-state-file-schema-v4-audit/spec.md`](../../session-sets/047-state-file-schema-v4-audit/spec.md) (stub-mode; this proposal is the audit pass the stub deferred to).

---

## 1. Purpose of this proposal

The Set 047 spec was authored as a STUB at Set 046 S1 close-out to park the v4 schema work pending its own audit pass. The spec listed five audit topics. Mid-Session-1 of this set, the operator issued a directive that materially expands the audit scope: **the Lightweight tier should use the same exact process as Full**, with differences limited to AI-router opt-out, no auto-verification, copyable review prompts in lieu of routed verification, and suggested-not-required UAT/E2E.

This proposal: (i) ratifies the Lightweight-parity directive as a load-bearing premise, (ii) audits the original five v4 topics with the directive baked in, (iii) audits the four new topics the directive introduces, (iv) recommends a disposition on the critical scope question of whether Set 047 stays one set or splits into Set 047 (v4 schema) + sibling Set 048 (Lightweight parity), and (v) proposes a session breakdown for whichever shape the consensus locks.

---

## 2. Operator-locked premises (the Lightweight-tier directive)

The following is **not** open to verifier challenge. The verifier may push back on the *consequences* we draw from these premises but not on the premises themselves.

**P1.** Lightweight orchestrators MUST follow the same process as Full for:
- (a) model and effort identification
- (b) session-set identification
- (c) session identification
- (d) `session-state.json` updates at the appropriate times

**P2.** Session Set Explorer UX is identical between tiers. No tier-conditional rendering.

**P3.** Lightweight differs from Full ONLY in:
- No AI router runtime calls.
- No auto-verification (consequence of P3a).
- Provides copyable review prompts for an operator to run in a separate chat/model against `spec.md` and against per-session and per-set accomplishments.
- Suggests (does not require) E2E testing and UAT checklists for interface-bearing work.

**P4.** Lightweight users must not be required to hand-edit any state files. The Set-018 manual one-field-flip recipe is retired.

These four premises are stored in memory at [`project_lightweight_uses_same_process_as_full.md`](file:///C:/Users/denmi/.claude/projects/c--Users-denmi-source-repos-dabbler-ai-orchestration/memory/project_lightweight_uses_same_process_as_full.md).

---

## 3. Code-state grounding (pre-audit)

An Explore subagent enumerated the touch surface. Key findings:

### 3.1 Writer-call-site inventory

Six writer call sites mutate `session-state.json`:

| Location | Top-level fields touched |
|---|---|
| `ai_router/session_state.py:408` — `register_session_start()` | `currentSession`, `totalSessions`, `completedSessions`, `status`, `lifecycleState`, `startedAt`, `orchestrator` |
| `ai_router/session_state.py:847` — `_flip_state_to_closed()` | the seven above + `completedAt` + `verificationVerdict` |
| `ai_router/session_state.py:1064` — `mark_session_complete()` | same as `_flip_state_to_closed` (gate + flip) |
| `ai_router/session_lifecycle.py:161` — `cancel_session_set()` | `status`, `preCancelStatus` |
| `tools/dabbler-ai-orchestration/src/utils/sessionState.ts:267` — `synthesizeNotStartedState()` | all 9 + `sessions[]` (TS lazy synthesis) |
| `tools/dabbler-ai-orchestration/src/utils/sessionState.ts:288` — `ensureSessionStateFile()` | all 9 + `sessions[]` (TS lazy fallback) |
| `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts:~250` — `cancelSessionSet()` | `status`, `preCancelStatus` |

Set 035's dual-write convergence is confirmed: Python and TS writers go through the same lazy-synthesize and cancel paths symmetrically.

### 3.2 Reader-call-site inventory

| Location | What it reads |
|---|---|
| `tools/dabbler-ai-orchestration/src/providers/CustomSessionSetsView.ts:142-147` — `fractionFor()` | `set.totalSessions`, `set.sessionsCompleted` |
| `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts:243-524` — `readSessionSets()` | all 9 top-level fields + `sessions[]` + nested orchestrator block |
| `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts:147-158` — `readCancellationState()` | `status` only |
| `ai_router/gate_checks.py:648` | `startedAt` (only direct top-level read) |
| `ai_router/reconciler.py` | events ledger only — does NOT read snapshot fields directly |

### 3.3 Needs-migration detector

[`fileSystem.ts:373-381`](../../../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts#L373-L381) flags `set.needsMigration` when either:
- `schemaVersion` absent OR `< 3`, OR
- `schemaVersion === 3` but `sessions[]` not an array.

The bulk migrator (`ai_router/migrate_session_state.py`) recognizes stronger combined signals (e.g., `status: "complete"` + `lifecycleState: "closed"` ⇒ force-close all sessions regardless of `completedSessions[]` fidelity).

### 3.4 Events-ledger fact

`session-events.jsonl` carries `verification_completed` events with a `verdict` field and `closeout_succeeded` events with optional `verdict` payload. Verdict *history* is therefore already audit-trail material in the ledger; the snapshot field is point-in-time. **These are not redundant.**

### 3.5 Non-canonical Lightweight shape — NOT found in this codebase

The subagent searched for `sessionLog[]` (memory-cited) and found nothing in this repo. That shape lives in a consumer repo (`great-psalms-scroll-font`), not in `dabbler-ai-orchestration`. **Audit implication:** the v4 migrator does not need to recognize Lightweight-emitted shapes living in *this* repo — but it does need to handle the shapes already produced by the 47 historical session-set state files in `docs/session-sets/*/session-state.json`.

### 3.6 Test-coupling surface

54 Python test files + 128 TS test files + ~35 Playwright specs touch state-file shape. Real fixtures live in `docs/session-sets/*/session-state.json` across 47 historical sets. Playwright uses fakes generated by a test harness — no real-state-file fixtures.

---

## 4. Audit Group A — v4 schema design (original 5 topics, Lightweight-parity baked in)

### A1. Shape of v4 — which fields move to per-session, which stay top-level

**Spec.md's straw-man derivation table:**

| Top-level field today | v4 derivation |
|---|---|
| `totalSessions` | `len(sessions)` |
| `completedSessions` | `[s.number for s in sessions if s.status == "complete"]` |
| `currentSession` | singleton `s` where `s.status == "in-progress"`, else `null` |
| `status` | all complete → complete; all not-started → not-started; any in-progress → in-progress |
| `lifecycleState` | DROP; sub-states move to events ledger |
| `startedAt` (set) | `min(s.startedAt)` |
| `completedAt` (set) | `null` unless status==complete, else `max(s.completedAt)` |
| `orchestrator` (set) | the orchestrator of the in-progress session (per-session field) |
| `verificationVerdict` (set) | per-session field (today's top-level overwrites on every close, losing history) |

**Proposed disposition: ENDORSE the straw-man with three refinements.**

- **A1-R1.** Keep `schemaVersion: 4` as a top-level field. Readers branch on this; writers emit it.
- **A1-R2.** Keep `sessionSetName` at top level. It's an identity field, not a derived state field.
- **A1-R3.** Move `verificationVerdict` to per-session AND keep an events-ledger event for verdict transitions (Set 046 S1 spelled this out: snapshot ≠ audit trail; the ledger already has `verification_completed` events with a `verdict` field, see §3.4). The point-in-time snapshot per session is the new top-level shape; cross-session history reconstructs from the ledger.

**Bias caution for verifier:** the drafter's instinct is "denormalize less, derive more." Devil's-advocate position: derivation costs CPU on every read, and on a session-state file that's read by both the Explorer (every refresh) and gate-checks (every close), the cost compounds. Counter-counter: these reads are bounded (47 sets × <10 sessions each = 470 derivations per refresh worst case), well below noise threshold. But the verifier should weigh this explicitly.

### A2. Cancellation marker

**Question:** explicit set-level `cancelled: true` flag, or every-session-cancelled-or-not-started inference?

**Proposed disposition: KEEP the explicit `status: "cancelled"` token on the SET level.**

Reasons:
- Cancellation is a set-level act, not a per-session act. The Set 011 cancel path cancels the entire set, including not-yet-started sessions whose `status` field is `"not-started"` not `"cancelled"`.
- Inferring cancellation from "all sessions cancelled or not-started" is ambiguous against the "set never started" case.
- The Set 035 cancellation-reader contract (`readCancellationState`) already reads only the top-level `status` field. Preserving that as the v4 contract minimizes breakage to the cancellation reader.
- The `CANCELLED.md` markdown audit-history artifact remains.

**Drop:** the implied `cancelled: true` boolean some early v4 drafts mentioned. The `status` enum token is sufficient.

### A3. Blocked-on-prereqs lifecycle question

**Question:** should the `status` enum gain a "deferred" or "blocked" value distinct from "not-started" and "cancelled" for sets whose prerequisites are unmet? Or is that better modeled as a derived Explorer property over machine-readable prerequisite declarations on existing "not-started" specs?

**Proposed disposition: DERIVED Explorer property, not a status-enum value.**

Reasons:
- Prerequisites are a *spec* concern (declared in `spec.md`), not a *state* concern. The state file represents work-in-progress / done state; a set whose prerequisites are unmet is still "not started" from the state perspective.
- Adding a "blocked" enum value forces every reader to handle it — gates, migrator, Explorer, cancel-lifecycle. That's wide blast radius for a narrow UX win.
- A derived property — "Explorer reads spec.md's prerequisites field; cross-references it against the prereq target's state-file `status`; renders a blocked-badge if any prereq is not `complete`" — keeps the state file's enum tight.
- Bonus: this is decoupled from v4. It could ship in any extension version after a machine-readable prerequisites field is added to `spec.md`. The audit can recommend the prereqs field for v4 even though Explorer rendering is downstream.

**Implementation hook:** `spec.md` gains a `prerequisites: [{slug, condition}]` field. The Explorer's `readSessionSets()` cross-references and adds a `blockedByPrereqs: boolean` derived property to the in-memory `SessionSet` record.

### A4. Migration sequencing — reader-first or atomic flip with migrator

**Proposed disposition: READER-FIRST (accept both v3 and v4) followed by WRITER-FLIP-WITH-MIGRATOR.**

Sequence (which becomes the Implementation Set's session structure):

1. **Reader-first phase.** Every reader gains a `_normalize_to_v4_shape(state)` shim that recognizes both v3 and v4 shapes and returns a uniform in-memory representation. Readers can run against v3 or v4 files indistinguishably.
2. **Migrator phase.** A `migrate_v3_to_v4.py` CLI subcommand walks every session-set, reads v3 state, writes v4 state. Idempotent (re-running on v4 files is a no-op). Backup file `session-state.v3.bak.json` written alongside for one-cycle rollback.
3. **Writer-flip phase.** All writers emit v4. The reader's v3-shim stays for one cycle to handle stragglers, then is removed in Set 048+.

Rationale: atomic flip requires every reader, writer, and test to update in lockstep; the reader-first approach lets the cross-test surface stabilize on v4 reads before any v4 writes happen.

### A5. v3-to-v4 migrator scope

Per §3.5, the migrator only needs to handle shapes living in *this* repo's `docs/session-sets/*/session-state.json`. Non-canonical Lightweight shapes from consumer repos are not Set 047's concern (Lightweight repos that adopt v4 will run the migrator against their own state files, and the migrator is canonical-only).

**Proposed disposition: SCOPE the migrator to canonical v3 → canonical v4 only.** Drop the "subsume non-canonical Lightweight recognition" line from the original spec — the Lightweight-parity directive (§2) eliminates non-canonical shapes by construction at the writer level, so no migrator-side recognition is needed.

---

## 5. Audit Group B — Lightweight-tier parity (the new directive)

### B1. Writer-architecture for AI-router-less Lightweight tier

The core decision: where does the state-file writer live such that Lightweight installations can use it without pulling the AI router?

**Two paths weighed:**

**Path 1 — Split the PyPI package.** Create `dabbler-session-state` as a pure state-file writer package with no LLM dependencies. `dabbler-ai-router` depends on it. Lightweight installs only `dabbler-session-state`.

| Pro | Con |
|---|---|
| Clean dependency boundary; Lightweight has zero LLM-SDK install footprint | Two packages to version, release, document |
| Future consumers (e.g., pure-CI state-file readers) can install state-only | First-time published-package split for this repo; non-trivial setup |
| Matches the conceptual split between "session-state mechanics" and "AI routing" | Lightweight users still need a CLI surface; either package ships its own CLI, or there's a thin `dabbler-session-state` CLI |

**Path 2 — No-router-mode in dabbler-ai-router.** Single package; an env var `DABBLER_NO_ROUTER=1` or a `--no-router` CLI flag suppresses all router calls. Verification calls become no-ops. API keys not required.

| Pro | Con |
|---|---|
| One package, one version, one release cadence | Lightweight still installs Anthropic / OpenAI / Google SDK dependencies (unused) |
| Lighter docs burden | The "no-router" mode becomes a permanent dual code path forever |
| Faster to ship | Lightweight install footprint stays bloated |

**Proposed disposition: Path 1 — split the package.**

Reasons:
- The dependency boundary already exists conceptually; making it physical clarifies the architecture.
- Lightweight install footprint stays minimal — important for `dabbler-homehealthcare-accessdb` and the future Lightweight-tier consumer repos that may run in constrained government environments where pip pull-down is itself scrutinized ([[feedback_user_facing_cost_messaging]] caveat).
- The release cost is one-time; the dual-code-path cost in Path 2 is perpetual.
- The CLI surface can be split: `dabbler-session-state` ships `start_session`, `close_session`, `cancel_session_set`, `restore_session_set`. `dabbler-ai-router` re-exports these and adds routed-verification.

**Bias caution for verifier:** the drafter has a preference for clean architectural splits. Pass B should challenge whether the operator-visible benefit of Path 1 outweighs the one-time release-and-doc cost for a project with current Marketplace count = 3 ([[project_marketplace_download_count]]).

### B2. Copyable-review-prompt deliverable

**Question:** where in the operator workflow is the copyable prompt surfaced? What does it reference? What's the trigger?

**Proposed disposition:**
- **Surface:** Session Set Explorer, right-click context menu on a row, three new actions: *Copy Spec-Review Prompt*, *Copy Session-Accomplishments-Review Prompt* (active only on the most-recently-completed session), *Copy Set-Accomplishments-Review Prompt* (active only on completed sets).
- **Content of the spec-review prompt:** templated text including the full `spec.md` body and the operator's chosen review questions ("Does this scope make sense? What is missing? What is at risk?"). The operator pastes into a chat with a different model.
- **Content of session-accomplishments prompt:** the session's `activity-log.json` entries + the diff for the session's commits + the change-log entry if present.
- **Content of set-accomplishments prompt:** the full `change-log.md` + the session-set's commit range.
- **Trigger:** right-click only; no auto-popup. Explicit operator action keeps the noise floor low.

**Bias caution:** the drafter chose the most explicit surface (right-click context menu). Pass B should challenge whether this belongs as a Command Palette action instead (universal) or both.

### B3. Suggested-not-required UAT/E2E pathway for Lightweight

**Question:** how is the suggested-not-required distinction represented in `spec.md` and enforced at runtime?

**Proposed disposition:**
- Add a third state to `requiresUAT` and `requiresE2E`: `"suggested"` (in addition to `true` and `false`). The Lightweight bootstrap chooses `"suggested"` when an interface component is present.
- The orchestrator runtime:
  - `true` → block close-out until the checklist is checked off (current Full behavior).
  - `false` → skip entirely (current default).
  - `"suggested"` → log a one-line reminder in `activity-log.json` and a Step 10 prompt in the close-out output, but DO NOT block close-out. The reminder is the deliverable.
- The Session Set Authoring Guide is updated to document the third state.

**Bias caution:** the drafter assumed a string enum; a boolean-with-third-state is unusual JSON shape. Pass B should weigh whether a separate field (`uatRequired: bool` + `uatSuggested: bool`, mutually exclusive when both true) is cleaner.

### B4. Bootstrap and schema-doc revision plan

The Lightweight-parity directive cascades to multiple docs:
- `docs/adoption-bootstrap.md` — Step 4.5 tier choice text needs rewriting. The "Lightweight skips Step 5 entirely" line is preserved; "Lightweight hand-edits state files" line is removed.
- `docs/session-state-schema.md` — §Tier Expectations section needs rewriting. Hand-edit recipe deleted. Lightweight-uses-same-writers added.
- `docs/planning/session-set-authoring-guide.md` — `requiresUAT` / `requiresE2E` docs gain the third "suggested" state.
- `docs/ai-led-session-workflow.md` — every step is already tier-agnostic, EXCEPT Step 6 (verification) which is Full-only. The Lightweight-substitute for Step 6 is the copyable review prompts; needs to be documented as such, not as a skip.

**Proposed disposition:** doc revision is a single session in the implementation set, late in the arc, after the writer-architecture and copyable-prompt surfaces are stable.

---

## 6. Critical scope decision — Set 047 alone or split into 047 + sibling 048?

The original Set 047 stub was sized for v4 schema audit + multi-session implementation. The Lightweight-parity directive adds: a package split (B1), a UI surface for copyable prompts (B2), a third-state on configuration flags (B3), and a 4-doc revision pass (B4). The audit is one set; the implementation will be at least two arcs.

### Three shapes weighed

**Shape 1 — Single bundled set (047 only).** v4 schema implementation + Lightweight parity implementation in one 8-10 session arc.

| Pro | Con |
|---|---|
| Single audit-then-implementation cycle | Long arc → higher mid-set drift risk |
| The two efforts touch overlapping code (writers, schema doc) | The two efforts can interfere — package split (B1) reshuffles imports across writers; v4 schema (A1) also reshuffles writers |
| One commit history to reason about | Verification cost compounds across both efforts |

**Shape 2 — Split into 047 (v4 schema implementation only) + 048 (Lightweight parity).** Set 047 ships v4 first; Set 048 implements Lightweight parity against the new v4 baseline.

| Pro | Con |
|---|---|
| Smaller arcs, lower mid-set drift risk | Two audit-then-implementation cycles, two close-outs |
| v4 readers/writers stabilize before the package split touches them | The Lightweight directive waits a full set before users see it |
| Cleaner verification gates per arc | Some code may be touched twice (writers re-shuffled in 047, re-imported in 048) |

**Shape 3 — Split into 047 (Lightweight parity first) + 048 (v4 schema).** Inverse of Shape 2.

| Pro | Con |
|---|---|
| The user-visible Lightweight benefit ships first | v4 schema is the foundation the Lightweight tier *should* be writing against — shipping Lightweight on v3 means migrating Lightweight users a second time when v4 ships |
| - | Significant rework on Lightweight tier when v4 lands; argues against this shape |

**Proposed disposition: SHAPE 2 (047 v4 schema, 048 Lightweight parity).**

Reasons:
- The reader-first v4 migration (§A4) is the foundation: every writer changes once, and the Lightweight-tier writer in Set 048 picks up the v4 contract from day one.
- 048's package split (B1) operates on already-stable v4 writers, lower interference risk.
- Cumulative routed verification cost stays within the $10 NTE Set 047 budget AND a comparable Set 048 budget (operator can re-confirm at Set 048 start), rather than a single mega-set risking blow-through.
- Matches the audit-then-spec discipline ([[feedback_audit_then_spec_for_substantial_features]]): each set has its own audit pass; the audit of Set 048 will have the benefit of Set 047's lessons.

**This is the load-bearing recommendation of this proposal.** The verifier should weigh it explicitly.

---

## 7. Proposed session breakdown for Set 047 (assuming Shape 2 from §6)

Set 047 — **v4 schema implementation, schema audit + 5 implementation sessions** = 6 sessions total.

| # | Title | Scope |
|---|---|---|
| 1 | Audit pass + scope-lock | **This session.** Self-author proposal → Pass A → Pass B → synthesis → scope-lock → spec.md authored. |
| 2 | Reader-first phase: normalize-to-v4 shim + reader updates | Add `_normalize_to_v4_shape(state)` in both Python and TS. Every reader (`readSessionSets`, `readCancellationState`, `fractionFor`, gate-checks, reconciler) routes through it. v3 fixtures unchanged. Full Python + TS test pass on v3 inputs through the shim. |
| 3 | Migrator phase: `migrate_v3_to_v4.py` + `MigrateV3ToV4` TS command | Idempotent walk of `docs/session-sets/*/session-state.json`; backup file written; dry-run + apply modes. New Layer-3 Playwright spec exercises the right-click migrate path. |
| 4 | Writer-flip phase part 1 — Python writers | `register_session_start`, `_flip_state_to_closed`, `mark_session_complete`, `cancel_session_set` all emit v4. v3 fixture tests updated. |
| 5 | Writer-flip phase part 2 — TS writers + Explorer rendering | `synthesizeNotStartedState`, `ensureSessionStateFile`, `cancelSessionSet` emit v4. Explorer's in-memory `SessionSet` record gains `blockedByPrereqs` derived property; `spec.md` gains optional `prerequisites: []` field. README and screenshot updated. |
| 6 | Schema-doc + bootstrap revision + close-out | Update `docs/session-state-schema.md` to canonical v4; update `docs/adoption-bootstrap.md` (Step 4.5 still references hand-edit — flag as Set-048 follow-up); update `docs/planning/session-set-authoring-guide.md`. Bundle close-out with PyPI + Marketplace publishes. |

**Sessions are sized to be commit-able units.** Set 045's 6-session arc is the closest precedent and shipped at ~$0.39 routed cost cumulative ([[project_set_045_session_1_closed]]).

**Note on Session 1 cost:** at the time this proposal goes to consensus, Pass A + Pass B will run on `gemini-2.5-pro` (route) + `gpt-5-4-mini` (verify) at tier-2 + verifier rates. Set 046 S1's two-pass cost was $0.0917 cumulative; Set 047 S1 should land in the same range.

---

## 8. Bias-cautions for the verifier (Pass A + Pass B)

**Bias 1 — Drafter prefers clean architectural splits.** §B1 Path 1 (separate `dabbler-session-state` package) reflects an architectural-cleanliness preference. The verifier should challenge whether the one-time release-and-doc cost is justified given Marketplace count = 3 ([[project_marketplace_download_count]]).

**Bias 2 — Drafter prefers derive-over-denormalize.** §A1 endorses the straw-man derivation table. Devil's-advocate: derivation costs compound on every reader read. The verifier should weigh worst-case read cost against schema cleanliness.

**Bias 3 — Drafter prefers explicit operator action over auto-prompts.** §B2 chose right-click context menu for copyable prompts. The verifier should challenge whether Command Palette (universal access, easier discovery) is a better surface, or whether both should exist.

**Bias 4 — Drafter prefers reader-first migration.** §A4 proposes reader-first → migrator → writer-flip. Devil's-advocate: atomic flip is faster and avoids a v3-shim that needs to be removed in a follow-on set. The verifier should weigh phasing risk against ship-velocity.

**Bias 5 — Drafter prefers split over bundle.** §6 recommends Shape 2 (047 v4 schema, 048 Lightweight parity). The verifier should challenge whether the v4 schema work and the Lightweight package split are *coupled enough* that splitting introduces more rework than it saves.

**Bias 6 — Drafter dropped the migrator's recognition of Lightweight shapes (§A5).** This is a consequence of premise P4 — but the drafter could be wrong about the cleanliness of that consequence. The verifier should check whether any historical state files in *this* repo's `docs/session-sets/*` carry non-canonical shapes the migrator needs to handle, and if so, the migrator scope expands.

---

## 9. Open questions for the verifier

**Q1.** Should `sessions[].verificationVerdict` carry the full verifier output, or just the verdict token (`VERIFIED` / `ISSUES_FOUND`)? Today's top-level field carries the token only; the events ledger carries the full output. Per-session is the snapshot — token-only is consistent. Pass A position: token-only. Pass B should consider whether the full output belongs in `sessions[]` for offline review without ledger access.

**Q2.** When the package split lands (§B1), should `dabbler-ai-router` re-export the `dabbler-session-state` CLI commands transparently, or should they be invoked via `python -m dabbler_session_state.start_session` regardless of which package is installed? Re-export keeps Full's UX unchanged; explicit module path keeps the dependency boundary visible. Pass A position: re-export. Pass B should weigh long-term boundary clarity.

**Q3.** Should the v4 migrator write a backup `session-state.v3.bak.json` alongside, or operate in-place with git as the rollback mechanism? Pass A position: backup file (one cycle), removed in Set 048+. Pass B should weigh whether git-only rollback is sufficient.

**Q4.** Does Set 048's Lightweight-parity work need its own audit pass, or does this proposal's §B count as that audit? The drafter's read: this is a *combined audit* of v4 schema AND Lightweight parity, but each set's implementation gets its own pre-flight check. The verifier should confirm whether §B is sufficient to scope-lock Set 048's spec, or whether Set 048 needs a fresh audit pass at its own S1.

---

## 10. Memory-hook citations

- [[project_set_047_v4_schema_audit_stub]] — the audit-pending stub this proposal converts into a scope-locked spec.
- [[project_lightweight_uses_same_process_as_full]] — the operator directive that drives Group B.
- [[project_set_046_session_1_audit_locked]] — the precedent two-pass audit; the structure of this proposal mirrors it.
- [[feedback_devils_advocate_default_for_roadmap_decisions]] — why two-pass devil's-advocate is default for this kind of audit.
- [[feedback_audit_then_spec_for_substantial_features]] — why this proposal scope-locks a multi-session implementation arc separately from the audit.
- [[feedback_budget_question_scope]] — budget question asked once at set start; $10 NTE locked for Set 047.
- [[project_lightweight_tier_added_to_bootstrap]] — the bootstrap doc that needs revision under Group B4.
- [[project_consumer_repos]] — the consumer-repo split that defines which repo gets which tier.
- [[project_marketplace_download_count]] — informs the "is the package split's one-time cost justified?" bias check.
- [[project_session_state_auto_creation_observed]] / [[project_needs_migration_lightweight_repo_observation]] — observations whose failure modes the Lightweight-parity directive eliminates.
- [[feedback_ai_router_usage]] — restricts in-session router invocations to end-of-session verification; this proposal is self-authored on that basis.
- [[feedback_no_env_var_probing]] — applies to the Marketplace PAT during Set 047 implementation set's publish phase, not this audit; flagged for the implementation set.

---

**End of Pass A draft.** Sending to cross-provider consensus next.
