# State-File Schema v4 — Audit-Locked Spec

> **Status:** **AUDIT-LOCKED 2026-05-26 (S1 closed).** This document
> was originally a STUB; Session 1 ran a two-pass devil's-advocate
> cross-provider audit and rewrote it into this scope-locked spec.
> The audit verdict lives at
> [`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md`](../../proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md).
> **Session Set:** `docs/session-sets/047-state-file-schema-v4-audit/`
> **Prerequisite:** Set 046 (`046-explorer-enrichment-from-harvest-records`) CLOSED 2026-05-26.
> **Companion:** Set 048 (`048-lightweight-tier-parity`) — to-be-stubbed; will run its own audit S1 against the operator-locked premises P1-P4 below.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

## Session Set Configuration

```yaml
totalSessions: 6
requiresUAT: true
requiresE2E: true
uatStyle: ad-hoc
effort: high
```

`requiresUAT: true` because Session 5 ships a user-visible Explorer change (the `blockedByPrereqs` derived property surfaces a new badge/indication). `requiresE2E: true` because the migrator path (Session 3) and the writer-flip (Sessions 4–5) demand Playwright-layer coverage of the dual reader-shim invariants. `effort: high` because the touch surface spans every state-file reader and writer across Python and TypeScript plus a doc rewrite plus a release.

---

## 1. What this set ships

A v4 evolution of the canonical `session-state.json` schema that derives top-level state (`totalSessions`, `currentSession`, `completedSessions`, `status`, `startedAt`, `completedAt`, `orchestrator`, `verificationVerdict`) from a per-session `sessions[]` array. The schema migration ships with a reader-first phased migration, an idempotent v3→v4 migrator with explicit rollback, a `prerequisites` field on `spec.md` with derived Explorer rendering, and updated authoritative documentation.

**This set deliberately does NOT ship Lightweight-tier writer parity** — that's Set 048's scope. Set 047 stays focused on the canonical Full-tier schema migration. The operator-locked Lightweight-parity premises (§2) carry forward unchanged to Set 048's audit.

---

## 2. Operator-locked premises (carry forward to Set 048)

The following premises were operator-locked mid-Session-1. They are NOT open to re-litigation in Set 047 implementation or Set 048 audit.

- **P1.** Lightweight orchestrators MUST follow the same process as Full for: (a) model and effort identification, (b) session-set identification, (c) session identification, (d) `session-state.json` updates at the appropriate times.
- **P2.** Session Set Explorer UX is identical between tiers.
- **P3.** Lightweight differs from Full ONLY in: no AI router runtime calls; no auto-verification; provides copyable review prompts; suggests (does not require) UAT/E2E.
- **P4.** Lightweight users must not be required to hand-edit any state files.

These shape Set 048's scope. They influence Set 047 only insofar as the v4 schema must be writable by a non-router code path in Set 048 (a single-package `--no-router` mode, per the audit verdict — Bias 1 flip).

---

## 3. Scope-locked decisions (from S1 audit verdict)

### 3.1 v4 schema shape (Group A1)

The v4 schema derives top-level state from `sessions[]`. Each session record gains:

```json
{
  "number": <int>,
  "title": "<string>",
  "status": "not-started" | "in-progress" | "complete" | "cancelled",
  "startedAt": "<ISO 8601>" | null,
  "completedAt": "<ISO 8601>" | null,
  "orchestrator": { "engine", "provider", "model", "effort", "chatSessionId" } | null,
  "verificationVerdict": "VERIFIED" | "ISSUES_FOUND" | null
}
```

Top-level fields preserved: `schemaVersion: 4`, `sessionSetName`, `sessions[]`, `status` (`"not-started" | "in-progress" | "complete" | "cancelled"`).

Top-level fields **dropped**: `lifecycleState` (sub-states move to events ledger), `currentSession`, `totalSessions`, `completedSessions`, `startedAt`, `completedAt`, `orchestrator`, `verificationVerdict`. All derived from `sessions[]` by the reader.

`verificationVerdict` is **token-only** per session (verdict only; full output stays in `session-events.jsonl`).

### 3.2 Cancellation marker (Group A2)

Top-level `status: "cancelled"` token is preserved. The `readCancellationState` Set 035 reader contract is unchanged. `CANCELLED.md` markdown audit-history artifact remains.

### 3.3 Prerequisites + blocked-on-prereqs (Group A3)

`spec.md` gains an optional `prerequisites: [{slug: string, condition: "complete"}]` field. Initial enum for `condition`: `"complete"` only. The Explorer's `readSessionSets()` cross-references each set's prereqs against the target set's `status` and adds a `blockedByPrereqs: boolean` derived property to the in-memory `SessionSet` record.

**No new `status` enum value.** Prerequisites are a spec concern, not a state concern.

### 3.4 Migration sequencing (Group A4)

Three-phase: **reader-first** → **migrator** → **writer-flip**.

1. Phase 1 (Session 2): every reader gains a `_normalize_to_v4_shape(state)` shim that handles both v3 and v4. Readers work against v3 fixtures transparently.
2. Phase 2 (Session 3): `migrate_v3_to_v4` CLI + TS right-click action walks `docs/session-sets/*/session-state.json`. Idempotent; writes `session-state.v3.bak.json` alongside.
3. Phase 3 (Sessions 4-5): all writers emit v4. The v3-shim stays for one cycle and is scheduled for removal in a follow-on set after v4 has shipped on a release.

### 3.5 Migrator scope (Group A5)

Migrator handles **canonical v3 → canonical v4** for files in this repo's `docs/session-sets/*/session-state.json` only. Non-canonical Lightweight shapes from consumer repos are out of scope; consumer-repo migration happens per-repo under Set 048+ when those repos adopt v4.

### 3.6 Package architecture (Bias 1 FLIPPED from proposal)

**Single `dabbler-ai-router` PyPI package preserved.** No package split. The Lightweight-tier opt-out comes via a future `--no-router` mode (Set 048 scope). Internal modules separate state-mechanics from routing; CLI surface stays `python -m ai_router.start_session` etc. — **CLI backward compatibility is a firm requirement** (any future refactor preserves existing invocations).

### 3.7 Performance baseline

Session 2 ships a benchmark for `readSessionSets()` against all historical state files (47+ sets). Baseline persists; future regressions are caught.

### 3.8 Formal rollback procedure

Session 3 ships an explicit rollback procedure: failure conditions (which migrator errors trigger rollback), step-by-step restore from `.bak`, validation steps confirming successful restoration. The procedure is documented in the schema doc.

---

## 4. Session breakdown

| # | Title | Scope | Layer |
|---|---|---|---|
| **1** | **Audit pass + scope-lock** | *(closed 2026-05-26)* — two-pass devil's-advocate cross-provider audit; verdict at [`verdict.md`](../../proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md); spec rewritten; Set 048 stubbed. | docs / audit |
| **2** | **Reader-first phase** | Add `_normalize_to_v4_shape(state)` shim in both Python (`ai_router/session_state.py` adjacent module) and TS (`tools/dabbler-ai-orchestration/src/utils/sessionState.ts`). Every reader (`readSessionSets`, `readCancellationState`, `fractionFor`, `gate_checks`, `reconciler`) routes through it. All existing v3 fixtures pass unchanged. **+ `readSessionSets()` benchmark** establishing performance baseline against 47+ historical state files. | reader code + tests |
| **3** | **Migrator phase** | `python -m ai_router.migrate_v3_to_v4` CLI subcommand: walks `docs/session-sets/*/session-state.json`, idempotent re-runs, dry-run + apply modes, writes `session-state.v3.bak.json` alongside on apply. TS Explorer right-click "Migrate to v4 schema" command. **+ formal rollback procedure** doc deliverable (trigger conditions, restore-from-`.bak` steps, validation). New Layer-3 Playwright spec for the right-click migrate path. | migrator + docs |
| **4** | **Writer-flip phase part 1 (Python)** | All Python writers emit v4: `register_session_start`, `_flip_state_to_closed`, `mark_session_complete`, `cancel_session_set`. v3-shim reader stays in place; readers continue to handle both. Python test fixtures updated; v3 fixtures retained for shim coverage. | Python writers + tests |
| **5** | **Writer-flip phase part 2 (TS + Explorer)** | TS writers emit v4: `synthesizeNotStartedState`, `ensureSessionStateFile`, `cancelSessionSet`. Explorer in-memory `SessionSet` record gains `blockedByPrereqs` derived property. `spec.md` `prerequisites` field schema lands: `[{slug, condition: "complete"}]`. README screenshot updated. Layer-3 Playwright spec for blockedByPrereqs rendering. **UAT checklist authored** for the user-visible Explorer change. | TS writers + UI + tests |
| **6** | **Schema-doc + authoring-guide revision + close-out + publish** | Rewrite `docs/session-state-schema.md` to canonical v4. Update `docs/planning/session-set-authoring-guide.md` to document the `prerequisites` field. Generate `change-log.md` for the set. Cross-provider verification of the bundled set. Dual publish: `dabbler-ai-router` (minor version bump) + extension Marketplace (minor version bump). **`docs/adoption-bootstrap.md` revision is DEFERRED to Set 048** (substantive Lightweight rewrite belongs with the Lightweight tier work). | docs + release |

---

## 5. Deferred to Set 048 (companion set, audit-pending)

Set 048 will run its own S1 audit before implementation. Inherited premises P1-P4 above. Set 048's audit will scope-lock:

1. **`--no-router` mode** on `dabbler-ai-router` — env var or CLI flag; suppresses LLM imports and verification calls.
2. **Copyable-review-prompt commands**: Command Palette + right-click context menu. Three commands: copy-spec-review-prompt, copy-session-accomplishments-prompt, copy-set-accomplishments-prompt.
3. **Suggested-not-required UAT/E2E**: `requiresUAT: true | false | "suggested"` tri-state (same for `requiresE2E`). Runtime: `true` blocks; `false` skips; `"suggested"` logs reminder without blocking.
4. **`docs/adoption-bootstrap.md`** Step 4.5 rewrite — hand-edit recipe deleted, "install dabbler-ai-router + run --no-router" added.
5. **`docs/ai-led-session-workflow.md`** Step 6 rewrite — Lightweight substitutes copyable prompts for routed verification; this is documented as a substitution, not a skip.

---

## 6. Non-goals (for Set 047, locked)

- **Lightweight-tier writer parity** — Set 048's scope.
- **`--no-router` mode** — Set 048's scope.
- **Copyable-review-prompt commands** — Set 048's scope.
- **`adoption-bootstrap.md` revision** — Set 048's scope.
- **Suggested-not-required UAT/E2E tri-state** — Set 048's scope.
- **PyPI package split** — explicitly rejected by Bias 1 flip.
- **Consumer-repo state-file migration** — out of scope for the migrator; each repo migrates its own state files under its own session set when adopting v4.

---

## 7. Cross-references

- Audit verdict: [`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md`](../../proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/verdict.md)
- Audit proposal: [`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/proposal.md`](../../proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/proposal.md)
- Predecessor: [`docs/session-sets/046-explorer-enrichment-from-harvest-records/`](../046-explorer-enrichment-from-harvest-records/)
- Companion (to be stubbed): `docs/session-sets/048-lightweight-tier-parity/`
- Canonical schema: [`docs/session-state-schema.md`](../../session-state-schema.md) (this set rewrites it)
