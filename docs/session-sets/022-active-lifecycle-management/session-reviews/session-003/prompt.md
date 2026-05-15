# Set 022 Session 3 — Workflow doc + schema doc + close-out doc + cross-consumer verification

You are an independent verifier reviewing Session 3 of session set
`022-active-lifecycle-management` in the `dabbler-ai-orchestration` repo.
Sessions 1 and 2 already shipped:

- **Session 1** delivered the ai_router state-first lifecycle protocol
  writer side: `ai_router/start_session.py` (CLI), `compute_effective_completed_sessions()`,
  `_flip_state_to_closed` appending to `completedSessions[]` on every close,
  `--repair --apply` backfilling `completedSessions[]` from events.
  Released as ai_router 0.2.3 (commit `1a973be`). Cross-provider VERIFIED.
- **Session 2** delivered the extension reader side: dropped activity-log
  as a count source, added `countDistinctCloseoutSessions()` events-ledger
  fallback, added `isCurrentSessionInFlight()` predicate, surfaced
  `LiveSession.completedSessions`, file watcher extended to
  `session-events.jsonl` + `CANCELLED.md`. Released as extension v0.13.12
  (commit `dcc8636`). Cross-provider VERIFIED (round 2).

**Session 3 scope** (what you are reviewing): documentation + cross-consumer
verification. No code changes. Three docs edited; no version bump.

## Decisions confirmed (do not re-litigate)

These came from a design round on 2026-05-15 with GPT 5.4 (Codex) and
Gemini Pro and were the foundation for Sessions 1 and 2. Session 3 is
the doc layer that encodes them as canonical:

1. **`completedSessions[]` is the authoritative progress ledger** on
   both tiers, maintained on every session close. The schema doc's
   "currently optional but planned" status for Full tier becomes
   "always written."
2. **Mid-set `lifecycleState` stays `work_in_progress`.** Only the
   final close flips it to `closed` (alongside `status: complete`).
3. **State invariant (load-bearing):**
   ```
   currentSession not in completedSessions[]                  → currentSession is in flight
   currentSession in completedSessions[] AND status="in-progress"  → between sessions
   status = "complete"                                        → set done
   ```
4. **`activity-log.json` is a step log only, not a count source.**
5. **Extension stays passive.** No "Start Session" / "Close Session"
   context-menu commands.
6. **CLI-driven on Full tier; hand-write on Lightweight.** The
   orchestrator runs `python -m ai_router.start_session <slug>`
   (Full) or hand-writes the same shape to `session-state.json`
   (Lightweight).
7. **Fraction convention stays `sessionsCompleted / totalSessions`.**
8. **Failure mode: passive recovery.** A stranded session is its own
   marker; the orchestrator resumes by re-reading state.

## Session 3 plan (from `spec.md`)

**Goal:** Encode the "state first, work second" protocol into the
workflow doc and orchestrator instructions so every consumer's AI
follows it. Verify end-to-end across all three consumers.

**Steps:**

1. Update `docs/ai-led-session-workflow.md`:
   - Step 1 ("Identify the Active Session Set and Register Session
     Start") gains the explicit protocol: orchestrator runs
     `python -m ai_router.start_session` (Full) *or* hand-writes the
     boundary fields (Lightweight) **before any other work in the
     session**. Pseudo-code for both tiers.
   - Step 8 gains the symmetric close-protocol detail: every close
     appends to `completedSessions[]`; only the final close flips
     status + lifecycleState.
   - The "do not skip close_session" warning added in commit
     `7166754` stays; cross-reference the new start-protocol.

2. Update `docs/session-state-schema.md`:
   - Promote `completedSessions[]` from "optional but planned" to
     "always written (Full tier) / always maintained (Lightweight)."
   - Add the GPT three-line invariant as the canonical state
     interpretation rule.
   - Note the new "in flight" predicate
     (`currentSession not in completedSessions[]`) and how the
     extension uses it.

3. Update `ai_router/docs/close-out.md`:
   - Add a "Session-boundary writes" subsection covering both
     `start_session` and `close_session`, with a table mirroring
     the protocol.
   - Extend the `--repair --apply` description to mention
     `completedSessions[]` backfill.

4. Verify across consumers (each verification is read-only —
   identify any drifted sets that need `--repair --apply` after this
   set lands; do not run repairs from this session set):
   - `dabbler-platform`
   - `dabbler-access-harvester`
   - `dabbler-homehealthcare-accessdb`

5. Cross-provider verification.

**Ends with:** Workflow doc + schema doc + close-out doc are consistent
with the new invariant; verification confirms no consumer-repo set will
break on next boundary write.

## Files in this session's commit

The diffs below are the full changes for Session 3. There are three doc
edits and no code changes; no version bump.

### `docs/ai-led-session-workflow.md` — Step 1 + Step 8 updates

```diff
{{DIFF_WORKFLOW}}
```

### `docs/session-state-schema.md` — promote completedSessions[], canonical invariant

```diff
{{DIFF_SCHEMA}}
```

### `ai_router/docs/close-out.md` — Section 0 session-boundary writes + --repair --apply extension

```diff
{{DIFF_CLOSEOUT}}
```

## Cross-consumer verification (Step 4)

Walked `docs/session-sets/<slug>/` in each of the three consumer repos.
Read-only inventory; no repairs run. Findings:

**`dabbler-platform`** (38 sets walked):
- 0 sets carry `completedSessions[]` today.
- 8 Full-tier sets (have `session-events.jsonl`): will heal cleanly via
  the events-ledger fallback on next boundary write:
  - `admin-user-creation-flow`, `admin-user-creation-flow-uat-remediation`,
    `admin-users-cross-links`, `composable-crud-helpers`,
    `packaging-and-template-readiness`, `transactional-system-columns`,
    `uat-dsl-verify-input-value`, `unified-master-details-composite`.
- 30 Lightweight-tier sets (no `session-events.jsonl`): continue under
  hand-maintenance per the schema doc going forward. Their next "write"
  is a hand edit that does not pass through
  `compute_effective_completed_sessions` — so no stderr warning fires
  and the helper is never consulted. The
  `currentSession − 1` heuristic warning only applies if one of these
  sets is later reopened under Full-tier CLI writes (rare; would
  require migrating the set to Full mid-life).

**`dabbler-access-harvester`** (33 sets walked):
- 0 sets carry `completedSessions[]` today.
- 5 Full-tier sets (have `session-events.jsonl`): will heal cleanly via
  events-ledger fallback:
  - `access-object-extractor-spike`, `form-report-code-and-grouping`,
    `generalization-validation-on-non-northwind`,
    `structured-form-report-extractor`, `table-extractor-coverage`.
- 28 Lightweight-tier sets: same as `dabbler-platform` — hand-
  maintenance going forward; the helper isn't called on hand writes,
  so no stderr warning fires unless one is later transitioned to
  Full-tier CLI writes.
- Edge cases flagged: `integration-testing-and-acceptance` (cancelled
  mid-flight) and `vba-symbol-resolution-and-enrichment` (retired /
  superseded). Both can be left as-is; they're terminal states that
  won't see another boundary write.

**`dabbler-homehealthcare-accessdb`** (6 sets walked — counts verified
by direct file inspection):
- **4 sets fully compliant** — numeric `completedSessions[]` arrays
  matching the Set 022 invariant:
  - `001-forms-detail-uat`: `[1, 2, 3, 4]`
  - `002-forms-browse-uat`: `[1, 2, 3, 4]`
  - `005-cleanup-sweep`: `[1, 2]`
  - `006-finalize-and-publish`: `[1, 2, 3]`
- **2 sets schema-non-conformant but stable** — carry string-based
  session IDs in `completedSessions[]` rather than integers:
  - `003-reports-client-svc-uat`: `["001-rptClientProfile-UAT", ...]`
  - `004-reports-provider-uat`: `["001-rptProviderServiceCatalog-UAT", ...]`
  These violate the integer-array contract added by Session 3's schema
  doc edits. The arrays are *present and non-empty* so the Full-tier
  backfill helper won't fire on them. Both are terminal-state
  Lightweight sets in a Lightweight-tier-candidate repo, so they
  won't see another boundary write under the new protocol. **Not
  blocking** for this session set; the homehealthcare repo can migrate
  them at leisure if they're ever revisited.
- **0 sets carry `session-events.jsonl`** — all 6 are Lightweight tier.

**Verdict:** no consumer-repo set will *break* on next boundary write.

- 13 Full-tier sets (8 in `dabbler-platform`, 5 in
  `dabbler-access-harvester`) heal cleanly via the events-ledger
  fallback when their next `start_session` or `close_session` runs.
- 58 Lightweight-tier sets across `dabbler-platform` (30) and
  `dabbler-access-harvester` (28) continue under hand-maintenance.
  Their hand writes do not call `compute_effective_completed_sessions`,
  so no stderr warning fires in normal operation. The legacy
  `currentSession − 1` heuristic warning only fires if one of these
  sets is later transitioned to Full-tier CLI writes — at that
  moment, the helper backfills `completedSessions[]` from its
  conjectural reconstruction and writes the warning to stderr.
- 6 `dabbler-homehealthcare-accessdb` sets: 4 fully compliant,
  2 schema-non-conformant but stable (string arrays in terminal-state
  Lightweight sets).

## Your verification task

Verify that:

1. **Workflow-doc changes** correctly encode the state-first protocol
   in Step 1 with pseudo-code for both Full and Lightweight tiers, and
   that Step 8 gains the symmetric close-protocol detail (append on every
   close; flip status+lifecycleState only on final). Cross-reference the
   "do not skip close_session" warning is preserved.

2. **Schema-doc changes** promote `completedSessions[]` to "always written
   (Full) / always maintained (Lightweight)" — both worked examples and
   parser cheat-sheet must reflect this. The canonical three-line state
   invariant must be present and load-bearing. The reader-side parser
   cheat-sheet must (a) drop the `currentSession − 1` fallback and (b)
   add the events-ledger fallback step.

3. **Close-out doc changes** add a "Session-boundary writes" section
   covering both writers with a table mirroring the spec's protocol
   table, and extend the `--repair --apply` Case 1 description to
   mention `completedSessions[]` backfill.

4. **Cross-consumer verification** correctly identified which sets heal
   cleanly vs. which need hand-maintenance. Sanity-check the verdict
   "no consumer-repo set will break on next boundary write."

5. **Internal consistency**: the three docs cite each other where
   appropriate and don't disagree on field semantics.

Use the verification template instructions (verdict + issues with
category/severity). Doc-only work — no code or tests to validate.

Output JSON only. Use this exact shape:

```json
{
  "verdict": "VERIFIED" | "ISSUES_FOUND",
  "issues": [
    {
      "category": "Correctness | Completeness | False Positive",
      "severity": "Critical | Major | Minor",
      "description": "<what's wrong and what the correct answer should be>",
      "location": "<file path or section>"
    }
  ]
}
```
