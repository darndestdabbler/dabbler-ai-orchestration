# Explorer Enrichment from Harvest Records

> **Purpose:** leverage the canonical Harvest Record stream that Set 045
> produces to surface richer per-row signals in the Session Set Explorer
> — orchestrator badges, cost surfacing, conflict warnings, and other
> derived views that the post-044 information surface makes possible.
> **Created:** 2026-05-23 (stub — Set 044 / S6 close-out).
> **Status:** STUB — AUDIT PENDING. The candidate leverage points
> listed below are starter material captured at close-out; a fresh
> cross-provider audit pass should run before the spec is detailed.
> **Session Set:** `docs/session-sets/046-explorer-enrichment-from-harvest-records/`
> **Prerequisites:**
> - Set 045 (`045-log-harvest-implementation`) CLOSED. The canonical
>   Harvest Record schema, the joiner, and the wrapper + parsers must
>   exist and be production-grade before this set can derive views
>   from them.
> - Set 036 (`036-chatsessionid-and-watcher-scope`) CLOSED. Writer-side
>   identity must be solid first.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Relationship to other sets:**
> - **Consumes** Set 045's Harvest Record stream. This set ships no
>   new producer channels; it ships new *consumer* views over the
>   information Set 045 makes available.
> - **Replaces (for the upside use case)** the cancelled Sets 042-043
>   chat-interface roadmap. Those sets answered "do we need our own
>   chat surface?"; this set answers the more valuable downstream
>   question "what should the existing Explorer surface, now that
>   we have honest per-session visibility?"
> - **Does not modify** the Set 045 architecture or its Harvest Record
>   schema. If a leverage point requires a schema change, that's a
>   Set 045 amendment, not an in-set 046 decision.

---

## Why this is a STUB

This stub exists to park the idea while it's fresh. The candidate
leverage points below are operator-sourced starting material, not
audit-locked scope. Before this set begins:

1. **Audit pass** — run the cross-provider consensus pattern from
   `docs/ai-led-session-workflow.md` over the candidate list. Prune
   low-value entries; surface any leverage points the operator
   missed. The two-pass devil's-advocate variant should be default
   given the discretionary nature of the work (per the
   `feedback_devils_advocate_default_for_roadmap_decisions` memory).
2. **Scope-lock** — the audit-endorsed subset becomes the actual
   set scope. Estimated session count and effort are deferred to
   that scope-lock pass; this stub does not pre-commit a session
   breakdown.
3. **Detail pass** — first session of the audited set authors the
   per-session breakdown.

---

## Candidate leverage points (audit-pending)

Each entry below is a possible direction. None is committed. Listed
roughly in operator-floated-first order, then by my-read-of-value
order, but the audit should reorder.

### 1. Second-line orchestrator badge on in-progress rows

**What:** for each accordion row in the IN PROGRESS bucket, render a
second line under the title showing `engine • model • effort` derived
from the most recent `event_type=launch` record (or the latest turn's
`engine` + `model` + `effort` if no launch record).

**Why this is valuable:** today the operator sees "this set is in
progress" but has to dig (or remember) to know what AI is driving
it. With multiple checkout-capable orchestrators, single-glance
identification matters.

**Data source:** Harvest Record fields `engine`, `model`, `effort`
filtered to records where `set_slug` matches the row's set.

**Open questions for audit:**
- Compact rendering when the model name is long (`claude-opus-4-7`
  vs `gpt-5.4-turbo-preview-...`).
- Behavior when records show effort drift mid-session (which
  effort to display).
- Behavior when no harvest records exist for the set (fallback to
  the orchestrator block from `session-state.json`, which is the
  Set 033 check-out source-of-truth).

### 2. Live cost surfacing per row

**What:** for each in-progress row, render a running cost estimate
derived from `tokens_in` × in-rate + `tokens_out` × out-rate per
provider, summed across all records for that set_slug. Optionally
render cumulative cost across all sessions in the set on the bucket
header.

**Why this is valuable:** matches the operator's recurring budget-
question pattern (per `feedback_budget_question_scope`). Today
budget tracking is manual recall from session prompts; harvest
records make it observable.

**Data source:** `tokens_in`, `tokens_out`, `model`, `provider`
fields across all Harvest Records for the set. Provider-rate
lookup table (likely already in `ai_router/budget.yaml`).

**Open questions for audit:**
- Authoritative cost source: the Harvest Record stream, or the
  router's own metric ledger (which is already authoritative for
  router-routed calls)? Reconciliation strategy if they diverge.
- IDE-agent calls (Codex, Gemini Code Assist) bypass the router;
  harvest-record-derived cost may be the only signal for those.
- Honest-display posture per `feedback_user_facing_cost_messaging`:
  cost messaging must be explicit about source, range, and limits.

### 3. Writer-bypass warning surface

**What:** if the Harvest Record stream shows event_type=`tool_call`
records with B5 (Edit/Write on `session-state.json` or similar
load-bearing state files) without an accompanying B4 (subprocess
invocation of the writer CLI), surface a warning badge on the
affected row. This is the post-Set-033 honesty guarantee made
visible.

**Why this is valuable:** the Set 033 architecture is designed to
prevent writer-bypass; the joiner from Set 045 will detect it; this
set makes the detection operator-visible.

**Data source:** B4 / B5 signals already specified in Set 044
proposal §4.4. The joiner emits a conflict record; this set
renders it.

**Open questions for audit:**
- Persistence: is the warning live-only, or sticky across Explorer
  refreshes / VS Code reloads? (Sticky implies a persistence layer
  this set may or may not own.)
- Operator dismissal flow.

### 4. Multi-AI-on-same-set conflict warning

**What:** if Harvest Records show more than one distinct
`(engine, conv_id)` pair touching the same `set_slug` within a
short time window AND `session-state.json`'s orchestrator block
shows a single checkout, render a coordination-conflict warning
on the row.

**Why this is valuable:** the Set 033 check-out / check-in
architecture's whole reason for existing was preventing exactly
this; making it visible when it slips through is the natural
endpoint.

**Data source:** record grouping by `set_slug` + temporal window
on `ts`, compared against `session-state.json` orchestrator block.
Largely a joiner emission; this set renders it.

**Open questions for audit:**
- Window length and quiescence threshold for the "same-set" check.
- Behavior when the second AI is operator-driven explicit reread
  with `--force` (legitimate, not a conflict).

### 5. Time-since-last-activity per row

**What:** for in-progress rows, render "active 2 min ago" or "idle
45 min" derived from the most recent Harvest Record's `ts` for that
set. Distinguishes live checkouts from stranded ones at a glance.

**Why this is valuable:** stranded check-outs are a Set 033
operational pain point (per the `dabblerSessionSets.checkoutPollTimeoutMinutes`
setting). Surfacing idleness visibly cues the operator to release
or follow up.

**Data source:** max(`ts`) across Harvest Records for set_slug.

**Open questions for audit:**
- Tick frequency vs. webview re-render cost.
- Threshold-based color coding ("live" green / "idle" amber /
  "stale" red) — what thresholds, and is amber/red ever wrong?

### 6. Tool-touch histogram or scope-creep indicator per session

**What:** for each in-progress row, derive a per-session breakdown
of which file paths the AI has been touching (Edit / Write tool
calls), and surface either a count badge ("28 file touches") or a
scope indicator ("touching files outside `docs/session-sets/<slug>/`").

**Why this is valuable:** scope creep / writer-bypass / accidental
edits to load-bearing infrastructure are recurring concerns; tool-
call records make this measurable.

**Data source:** B1 records filtered by `event_type=tool_call` and
`tool ∈ {Edit, Write, apply_patch}`, with `tool_args` path
extraction.

**Open questions for audit:**
- Privacy: file paths are arguably sensitive in some workspaces.
- Useful aggregation level: per-session, per-set, per-bucket.
- Threshold for the "outside session-set scope" warning.

---

## Candidate non-goals (audit-pending)

- **A full Dabbler-owned chat replay UI.** The cancelled Sets 042-043
  were the chat-interface direction. This set should NOT drift into
  that territory; the goal is *enriching the existing Explorer*, not
  building a new conversation surface.
- **Modifying the Harvest Record schema.** If a leverage point
  requires fields Set 045 doesn't already emit, the right path is a
  Set 045 amendment (or a follow-on parser-side set), not in-set 046
  schema changes.
- **Cross-provider cost reconciliation.** If §2 (live cost
  surfacing) is in-scope, the cost source decision is locked at
  audit; reconciling routed vs harvested cost data is its own
  problem and can be deferred unless audit endorses it.

---

## Open architectural questions parked here

This set is also the natural home for the "blocked-on-prereqs"
lifecycle-state question that surfaced during Set 044 close-out
(see Set 044's `change-log.md`). The question:

> Should the canonical state-file `status` field gain a "deferred"
> or "blocked" value distinct from "not-started" and "cancelled"
> for sets whose prerequisites are unmet? Or is that better
> modeled as a derived Explorer property over machine-readable
> prerequisite declarations on existing "not-started" specs?

Not committed to Set 046 — flagged here so the next audit pass can
decide whether to absorb it, spin it into its own set, or defer
indefinitely.

---

## Note on this stub

The candidate leverage points are operator + drafter starting
material captured during Set 044 / S6 close-out while the
information surface from Set 045 was fresh. The audit pass should
treat the list as a prompt for thinking, not a checklist to
implement. Some entries may merge; others may be cancelled; new
ones may emerge.

The session count, effort estimate, and exact scope are deliberately
NOT specified here — those are audit deliverables. This stub locks
only: (a) the set exists as a parking spot; (b) it consumes Set 045's
output; (c) it ships UI changes to the existing Explorer, not a new
UI surface.
