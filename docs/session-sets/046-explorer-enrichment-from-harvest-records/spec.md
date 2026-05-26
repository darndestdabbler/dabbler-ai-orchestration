# Explorer Enrichment from Harvest Records

> **Purpose:** ship the operator-locked deliverable (a) — `0/?`
> fraction icon for not-started session sets whose spec.md has no
> defined session breakdown — and **DEFER everything else.**
> **Status:** SCOPE-REDUCED 2026-05-26 mid-Session-2. Originally a
> 7-session arc covering deliverables (a)/(b)/(c) plus four follow-
> on Explorer enrichments. Cancelled to (a)-only after an operator
> incident: the Set 033 / Set 036 hard-coordination toast
> (poll/force/dismiss on a different-orchestrator claim) blocked
> staff onboarding. Set 048+ (audit-then-spec) is the path for any
> wider Explorer or coordination work; do not silently re-expand
> this set.
> **Session Set:** `docs/session-sets/046-explorer-enrichment-from-harvest-records/`
> **Workflow:** Orchestrator → AI Router → minimal verification.
> **Cumulative Set 046 NTE:** $5 (set 2026-05-26; ~$0.183 spent on
> the Session 1 audit; Session 2 is the implementation + close-out).

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
effort: medium
```

---

## 1. What this set ships (reduced scope)

Two sessions. The change is **writer-side only** plus a complementary
read-side guard. No new UI surface, no new chat interface, no changes
to Harvest Records or the `session-state.json` schema.

| # | Title | Scope | Layer |
|---|---|---|---|
| **1** | **Audit pass + scope-lock** | *(closed 2026-05-26)* — two-pass devil's-advocate audit, spec rewrite (later reduced — see this header), Set 047 stub opened. | docs |
| **2** | **Writer-side `totalSessions: null` + Explorer pre-flight (deliverable (a)) + close-out** | (a) ``start_session`` keeps ``totalSessions: null`` (and omits ``sessions[]``) when neither ``--total-sessions`` nor an existing total nor a spec.md configuration block nor heading-derived total resolves a value. Removed the pre-Set-046 ``session_number`` fallback that wrote ``totalSessions: 1`` on every fresh stub. Read-side: the v2→v3 synthesizer no longer inflates total from ``legacyCurrent`` alone (mirror change in `ai_router/progress.py` and `tools/dabbler-ai-orchestration/src/utils/progress.ts`). Tests cover the plan-less write path, the new ``--total-sessions`` CLI arg, and refusal of incoherent state. Also closes out the set (the Set 033 / Set 036 enforcement disable shipped in this session is a separate concern — see [`CLAUDE.md`](../../../CLAUDE.md) "Hard-coordination enforcement … is OFF by default"). | router + ext |

## 2. Cancelled scope (deferred indefinitely)

The original 7-session arc covered the following follow-on Explorer
enrichments. All are **cancelled** as of 2026-05-26. The decision is
not "these features are bad", it is "the path of least disruption
right now is to stop touching the Explorer surface and the
coordination layer." Any future work in this area goes through Set
048+ with the standard audit-then-spec discipline.

| Deliverable | Status |
|---|---|
| (b) Second-line `engine • model • effort` orchestrator badge under In Progress rows | **cancelled** — see [`docs/proposals/2026-05-26-explorer-enrichment-from-harvest-records/`](../../proposals/2026-05-26-explorer-enrichment-from-harvest-records/) for the audit artifacts if the work is ever revived. |
| (c) README screenshot of the enriched Explorer | **cancelled** (the enrichment surface it would screenshot is no longer being shipped). |
| Live cost surfacing per row | **cancelled.** |
| Time-since-last-activity per row | **cancelled.** |
| `state-divergence` conflict pill | **cancelled.** |
| `(needs migration)` expansion (migrator + triage + click action) | **cancelled** — the migrator-incompleteness observation in `project_needs_migration_lightweight_repo_observation` reverts to its pre-Set-046 deferred state; absorb into Set 047 or Set 048 only via a fresh audit. |

## 3. Audit artifacts (preserved)

The Session 1 audit at
[`docs/proposals/2026-05-26-explorer-enrichment-from-harvest-records/`](../../proposals/2026-05-26-explorer-enrichment-from-harvest-records/)
remains on disk as a historical record. The two-pass devil's-advocate
consensus and the bias-flip analysis (Bias 4: migrator gets its own
session) inform any future Set 048+ work, but the *plan* it audit-
locked is no longer the plan; this header overrides it.

## 4. Non-goals

- Modifying the `session-state.json` schema. (Belongs in Set 047.)
- Touching the Set 033 / Set 036 hard-coordination layer beyond the
  default-off env-var flip already landed. (Belongs in Set 048+.)
- Retroactive `totalSessions: null` migration of existing session sets
  (forward-only — same posture the audit's Q1 disposition locked).

## 5. Cumulative spend tracking

Session 1 routed cost: $0.183 of $5 NTE (~3.7%). Session 2 routed
cost: $0 (no cross-provider verification — the change set is small
enough that a self-review is the right level of rigor for the
reduced scope). Final: ~$0.183 of $5 NTE.
