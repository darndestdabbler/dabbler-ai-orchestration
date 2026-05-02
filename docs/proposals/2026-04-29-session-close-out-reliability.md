---
title: Session close-out reliability — mechanize the gate, route a fresh turn
status: COMPLETE — implementation verified by cross-provider re-audit (2026-05-01)
date: 2026-04-29
authors: human + Claude (Sonnet 4.6), reviewed by Gemini Pro + GPT-5.4
applies-to: dabbler-ai-orchestration (ai-router/, docs/ai-led-session-workflow.md)
---

> ## ✓ COMPLETE — Combined design verified FULLY ALIGNED by cross-provider re-audit (2026-05-01)
>
> **Implementation under audit:** Sets 001–009 (Sets 001–006 = original
> combined design; Set 009 = corrective work for the 2026-04-30 audit).
>
> **Re-audit verdicts (both providers, independent reads):**
> - **Gemini Pro:** FULLY ALIGNED
> - **GPT-5.4:** FULLY ALIGNED
>
> **Re-audit document:** [`docs/proposals/2026-05-01-combined-design-realignment-audit.md`](2026-05-01-combined-design-realignment-audit.md)
>
> **Cumulative cross-provider verification cost:** $0.7811 across the
> original audit and three corrective-work verifications + the re-audit.
>
> The combined close-out reliability + outsource-last operating-mode
> design is shipped and verified. The original 2026-04-30 audit's three
> corrective drift items (D-1, D-2, D-3) all landed in Set 009 Sessions
> 1–3; the three follow-up items (D-4, F-1, F-2) were explicitly skipped
> with written rationale per the spec's acceptance criterion. See the
> re-audit document for full evidence and the residual operational
> assumptions baked into the chosen corrective paths.

---

> ## SUPERSEDED — combined with outsource-last mode (2026-04-30)
>
> This proposal has been merged with a second architectural proposal
> (outsource-last operating mode) into a single combined design. Both
> proposals went through cross-provider review (Gemini Pro + GPT-5.4);
> the combined design incorporates feedback from both rounds.
>
> **The actionable work is captured in six session sets at `docs/session-sets/`:**
> 1. `001-queue-contract-and-recovery-foundations`
> 2. `002-role-loops-and-handoff`
> 3. `003-closeout-script-and-deterministic-machinery`
> 4. `004-cost-enforcement-and-capacity`
> 5. `005-vscode-extension-and-queue-views`
> 6. `006-docs-fresh-turn-and-alignment-audit`
>
> **Material changes from this proposal's v2 (post-review) design:**
> - Queue mechanism switched from JSONL to **SQLite** (per Gemini Pro +
>   GPT-5.4 review of the outsource-last plan: JSONL is too fragile for
>   a correctness path; needs proper claim/lease/heartbeat semantics).
> - Verification became **non-blocking by default** with `close_session`
>   as the sole synchronization barrier (per both reviewers).
> - Set ordering reversed: queue contract + role-loops land BEFORE the
>   close-out gate.
> - Hybrid mode (`tiebreakerFallback: api`) **deferred** — strict modes
>   only initially.
> - Capacity awareness reframed as **heartbeat-only** (observational,
>   not predictive).
> - Set 6 audit expanded to include **executable failure-injection
>   traces**, not just text-only review (per GPT-5.4).
>
> **For the combined design's full reasoning**, see the v2 plan:
> `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`.
>
> **For the original close-out reliability content**, the body of this
> document below remains valid history — the gate / reconciler /
> disposition.json / lifecycle ledger pattern is preserved in the
> combined design. Only the queue substrate, sequencing, and synchronization
> model changed.
>
> The combined design's alignment audit (final session of Set 6) will
> mark this proposal **complete** when both Gemini Pro and GPT-5.4
> confirm the implementation matches the combined design.

---

> ## POST-IMPLEMENTATION REVISION — close-out does NOT own commit / push / notification (2026-05-01)
>
> Set 6 Session 3's combined-design alignment audit
> (`docs/proposals/2026-04-30-combined-design-alignment-audit.md`)
> flagged drift item **D-3** as corrective: this proposal's §3 items
> 4 ("git commit/push") and 6 ("`send_session_complete_notification()`")
> name `close_session.py` as the owner of commit, push, and
> notification, but the implementation that shipped through Sets 1–5
> deliberately does not include those code paths. Set 9 Session 1
> resolves the drift by **revising the contract to match the
> implementation**, not by changing the implementation:
>
> - **Commit and push** are the orchestrator's (or the fresh
>   close-out turn agent's) responsibility, run **before** invoking
>   `close_session`. The gate's `check_pushed_to_remote` predicate
>   enforces the precondition and fails closed if the work was not
>   pushed.
> - **Notification** (`send_session_complete_notification` in
>   `ai-router/notifications.py`) is fired by the same caller
>   **after** `close_session` returns `succeeded`. The function is
>   intentionally retained as part of the public API and is no longer
>   invoked from inside the close-out flow.
> - **Close-out's responsibilities** are gate checks, verification
>   wait, ledger event emission, and idempotent state writes
>   (`mark_session_complete`, `change-log.md`, next-orchestrator
>   recommendation). That is exhaustive: anything not on this list
>   lives outside `close_session.py`.
>
> The revision exists because mixing publish-side effects (commit,
> push, notify) into the close-out gate would re-introduce the
> "verification + publishing collapse" failure mode that GPT-5.4
> flagged during the original review (see "Synthesis after
> cross-provider review" §2 below — *split the state machine*). The
> shipping design already separates those concerns by accident; this
> revision makes the separation deliberate and documents it
> canonically in `ai-router/docs/close-out.md` Section 1 ("Ownership
> of commit / push / notification") and Section 3 (the revised step
> list, which omits notification).
>
> **What this means for §3 of this proposal:**
>
> - Item 3 ("`mark_session_complete()` becomes the gate") stands as
>   written.
> - §3.3 item 4 ("git commit and push") and §3.3 item 6
>   ("`send_session_complete_notification()`") are **superseded**: the
>   close-out script does not run these. Treat the original wording
>   as historical; the shipping contract is the close-out doc.
> - §3.5 ("Workflow doc collapse") stands; Step 8 of
>   `docs/ai-led-session-workflow.md` was reduced to a one-paragraph
>   pointer at `ai-router/docs/close-out.md`.
> - §3.6 ("Fresh-agent close-out turn") stands but with one
>   adjustment: the fresh turn's prompt
>   (`_CLOSE_OUT_TURN_CONTENT` in `ai-router/close_out.py`)
>   explicitly directs the agent to commit and push before invoking
>   close-out and to notify after close-out succeeds. This makes the
>   ownership boundary visible to the agent at the moment it acts.
>
> The other corrective drift items from the audit (D-1: `(repo,
> branch)` parallel-session lock; D-2: `--force` flag scope) land in
> Sessions 2 and 3 of Set 9. The follow-up items (D-4, F-1, F-2)
> land in Set 9 Session 4 or are explicitly skipped with rationale.

---

# Session close-out reliability

## Executive summary

AI agents intermittently fail to perform end-of-session close-out work in
the Dabbler AI-led-workflow. Common failures: not committing/pushing,
forgetting the next-orchestrator recommendation, missing the
activity-log entry, missing the cost report. The natural instinct is to
clarify, harden, or duplicate the instructions. **None of those help.**

Close-out instructions today live in **Step 8 of a 1,450-line workflow
doc** that the agent reads once at session start. By the time the agent
reaches close-out — typically with reduced context budget — Step 8 is
~900 lines deep in context. Adding more instructions, or repeating them
in CLAUDE.md, makes recall worse, not better. Close-out is also a
**six-task prose paragraph**, not a checklist with mechanical
post-conditions, so the agent self-grades whether it finished.

The proposal: shift close-out from "the agent must remember six things"
to "the orchestrator routes a focused fresh turn whose only job is to
run `close_session`, and `mark_session_complete()` refuses to flip
status until deterministic post-conditions pass." This is two changes —
a Python gate, plus a routing change in the orchestrator — that
together remove most of the failure surface without adding new
instructional burden.

### After cross-provider review (Gemini Pro + GPT-5.4)

Both reviewers verdict: **Recommend with modifications**. The mechanization
direction is correct, but the proposal is overconfident in three places
that need to be fixed before implementation:

1. **The fresh-agent close-out turn is not a sufficient control point.**
   Both reviewers flagged this independently. The orchestrator's ability
   to detect "work appears complete" is itself a reliability problem
   (abnormal exit, max-tokens cutoff, refusal, crash). The fresh-agent
   turn should be **one path** to close-out, not the only one.

2. **A reconciler / sweeper is required infrastructure, not a future
   refinement.** Sessions can be left in a "zombie" state (verified work
   on disk, but `status: in-progress`). The system needs a background
   sweeper that periodically scans for `verification_passed &&
   !closeout_succeeded` and retries close-out. Without this, every
   abnormal termination becomes manual cleanup.

3. **The state machine conflates two things that need to be separate.**
   "Work is verified done" and "publish-side-effects succeeded" must be
   separate states. Push rejection (branch protection, rebase needed,
   missing upstream) can block state transition indefinitely even when
   the actual work is sound. Need at minimum: `work_verified`,
   `closeout_pending`, `closeout_blocked`, `closed`.

GPT-5.4's reframing — *"treat close-out as a reconciled state machine,
not an agent task"* — is the durable principle to pull out of this
review. Let LLMs fill missing narrative fields; do not let them control
whether the workflow advances.

A full synthesis with the modified architecture sits in the
**"Synthesis after cross-provider review"** section near the end of
this document, before the appendices. The body of the proposal below
is the original (pre-review) text, retained verbatim for traceability.

## Status & next actions

Open. Concrete next actions if accepted:

1. Add `nextOrchestrator: { engine, model, effort, reason }` to the
   `session-state.json` schema in `ai-router/session_state.py`. Required
   when `currentSession < totalSessions`.
2. Implement `python -m ai_router.close_session` (a Python entry point,
   not an LLM call). Runs deterministic post-condition checks, prompts
   for narrative fields it can't fill, writes idempotently.
3. Make `mark_session_complete()` the close-out gate: refuse to flip
   status unless all post-conditions pass, return a structured failure
   list with concrete remediations.
4. Redirect `print_cost_report()` to source from `router-metrics.jsonl`
   (auto-written, accurate) instead of `activity-log.json` (depends on
   agent discipline).
5. Move close-out content out of `ai-led-session-workflow.md` Step 8 into
   `ai-router/docs/close-out.md`, surfaced as `close_session --help`.
   The workflow doc's Step 8 collapses to one sentence pointing at the
   script.
6. Wire the orchestrator to route a fresh `task_type="session-close-out"`
   turn after the work turn signals completion. Sonnet/haiku, low
   effort.
7. Fix the `session-state.json` schema-drift opportunistically:
   regenerate the committed example from `session_state.py`, or
   replace the example with a generator script.

## Background

### What exists today

Close-out is **agent-driven, prose-instructed, and unverified after the
fact**. The current Step 8 of `docs/ai-led-session-workflow.md`
(lines 827–965) lists six discrete actions the agent must remember:

1. Print cost report (`print_cost_report()`)
2. Update `ai-assignment.md` actuals
3. Route next-orchestrator recommendation (or change-log for the
   last session)
4. Commit and push (`git add -A; git commit; git push`)
5. Call `mark_session_complete()` to flip status
6. Send notification via `send_session_complete_notification()`

There is no post-Step-8 verifier. If an agent halts after step 4
(commit) but before step 5 (mark-complete), the work is on `main` but
`session-state.json` still reads `"status": "in-progress"` —
state-machine corruption that requires manual cleanup.

### What's already automated

- **`router-metrics.jsonl`** is automatically appended by
  `record_call()` on every routed task. The agent has no role.
  Metrics are accurate by construction.
- **Verification of work** (the in-session cross-provider review at
  Step 6) is automated via `route(task_type="session-verification",
  ...)`. The router picks a different provider deterministically.

### What's NOT automated and currently fails

| Item | Who's responsible | Failure mode |
|---|---|---|
| `activity-log.json` entries | Agent, via `log_step()` | Forgotten log calls → wrong cost report |
| Cost report (`print_cost_report`) | Agent invokes | Reads from activity-log.json, so depends on (1) |
| `mark_session_complete()` | Agent | Forgotten → status corruption |
| Next-orchestrator recommendation | Agent | Lives as prose in `ai-assignment.md`; no schema, no validation |
| Git commit/push | Agent | Six-task prose paragraph; commit-then-stop is a real failure |
| Session notification | Agent | Lower-stakes; commonly skipped |

### Why "clarify, harden, duplicate" doesn't fix this

- **Clarify.** Step 8 is already moderately specific (six numbered
  actions, function names). The failure isn't that the agent doesn't
  know what to do; it's that recall fades and self-grading is unreliable.
- **Harden.** Adding "MUST" / "REQUIRED" tokens to prose instructions
  has limited effect on long-context recall. Tested in many
  agent-workflow projects with mixed-to-poor results.
- **Duplicate.** Putting close-out into CLAUDE.md AND the workflow doc
  AND each spec.md compounds drift over time and doesn't address the
  root cause (close-out is far back in context by the time it's needed).
- **Move.** *This* helps — moving the instructions so the agent encounters
  them at close-out time, not session-start time, addresses recency.
- **Mechanize.** *This* helps most — replacing "agent must remember six
  things" with "agent must run one command" reduces the failure surface
  to "did the agent invoke close-out at all?" The fresh-agent routing
  pattern addresses that residual question.

## Proposed architecture

### 1. `mark_session_complete()` becomes the gate

Today `mark_session_complete()` flips `status: in-progress` →
`status: complete` and stamps `completedAt`. After this proposal, it
also runs deterministic post-condition checks and refuses the flip if
any fail:

| Check | Source of truth | Failure remediation |
|---|---|---|
| Working tree clean | `git status --porcelain` | "Uncommitted files: X, Y, Z. Run `git add -A && git commit`." |
| Pushed to remote | `git log @{u}..HEAD --oneline` | "N unpushed commits. Run `git push`." |
| Activity-log entry exists for currentSession | `activity-log.json` | "No entry for session N. Run `log_step()` or invoke close_session interactively." |
| `nextOrchestrator` populated | `session-state.json` | "No recommendation for next session. Set via close_session." |
| (Final session only) `change-log.md` exists | filesystem | "Final session must produce change-log.md." |

Each check returns a `(passed: bool, remediation: str)` tuple. The gate
returns a structured failure list, not a single error string. If the
agent (or human) reads that list, they know exactly what to fix and in
what order.

### 2. New `session-state.json` field: `nextOrchestrator`

Add to the schema in `ai-router/session_state.py`:

```python
{
  # ... existing fields ...
  "nextOrchestrator": {
    "engine": "claude" | "openai" | "gemini",
    "provider": "anthropic" | "openai" | "google",
    "model": "claude-sonnet-4-6" | ...,
    "effort": "low" | "normal" | "high",
    "reason": str  # 1–3 sentences
  } | null
}
```

Required (non-null) when `currentSession < totalSessions`. Validated
by the gate. The narrative elaboration of *why* this orchestrator was
recommended remains in `ai-assignment.md` for human review; the
*choice itself* is structured for validation.

### 3. `python -m ai_router.close_session` — the single entry point

A Python entry point (not an LLM call) that:

1. Loads `session-state.json` for the current session set.
2. Runs each gate check, prints a green/red checklist.
3. For checks that need narrative input (activity-log entry summary,
   next-orchestrator reason), reads the agent's environment for them
   or prompts interactively.
4. Writes idempotently — re-runs are safe. Specifically:
   - `log_step()` checks for duplicate `(sessionNumber, stepKey)` before
     appending.
   - `mark_session_complete()` is a no-op if status is already
     `complete`.
   - Git operations skip when nothing to commit / nothing to push.
     **[Superseded by post-implementation revision above:
     `close_session` does not perform git operations. The caller
     commits/pushes before invoking the script, and the gate's
     `check_pushed_to_remote` enforces the precondition.]**
5. Prints the final `print_cost_report()` (sourced from
   `router-metrics.jsonl`).
6. Calls `send_session_complete_notification()`.
   **[Superseded by post-implementation revision above:
   `close_session` does not call the notification function. The
   caller fires `send_session_complete_notification(...)` after
   `close_session` returns `succeeded`.]**
7. Returns 0 on full success, non-zero on any failed check, with the
   failure list as stderr output.

The script's `--help` output IS the close-out documentation. Replaces
the workflow doc's Step 8.

### 4. Cost report sources from `router-metrics.jsonl`

`print_cost_report(session_set_dir)` currently reads from
`activity-log.json`. Change it to:

1. Filter `router-metrics.jsonl` by `session_set` field.
2. Group by `session_num` and `model`.
3. Print the summary.

This decouples cost reporting from the agent's discipline at calling
`log_step()`. Activity-log keeps its narrative role (what was done, what
was decided, what's blocked); metrics handle the numbers.

A small migration concern: existing session sets won't have populated
`router-metrics.jsonl` retroactively. Either backfill (one-time script)
or accept that historical reports come from activity-log and new ones
from metrics. Recommend backfill — straightforward and produces clean
data.

### 5. Workflow doc collapse

`docs/ai-led-session-workflow.md` Step 8 currently spans lines 827–965
(~140 lines of prose). After this proposal, Step 8 becomes:

> **Step 8: Close-out.** When session work is verified complete, run
> `python -m ai_router.close_session`. The script handles the cost
> report, activity-log entry, commit/push, mark-complete, and
> notification. Run `python -m ai_router.close_session --help` for
> details.

The detailed content moves to `ai-router/docs/close-out.md`,
referenced by the script's `--help` text. Agents encounter the details
at the moment they need them, not 1,400 lines earlier.

This addresses the placement / recency issue. Combined with mechanization
(items 1–4) it addresses the recall issue.

### 6. Fresh-agent close-out turn

The orchestrator (the wrapping Python that drives sessions) detects when
the agent's work turn signals completion. Instead of trusting the work
agent to also run close-out, it routes a **fresh turn** with
`task_type="session-close-out"`. The fresh turn's prompt is short and
focused:

> *Session work is complete. Read the close-out checklist
> (`ai-router/docs/close-out.md`) and run
> `python -m ai_router.close_session`. Fill in any narrative fields it
> prompts for, using the activity log
> (`docs/session-sets/<slug>/activity-log.json`) and the session set's
> spec for context. Do not perform additional work — close-out only.*

The fresh agent has full context budget. It has one job. It encounters
the close-out instructions at close-out time. Routing typically goes to
sonnet/haiku at low effort because the task is mechanical.

**Cost impact:** +5–10% per session (one extra short turn). Cheaper
than the manual cleanup cost of a corrupted session-state.json.

### 7. Schema-drift fix (opportunistic)

The committed `session-state.json` example in
`docs/session-sets/<sample-slug>/` uses the pre-`register_session_start()`
schema. Two options:

- **A.** Regenerate the example from `session_state.py` as part of this
  work. Quick, but the example will drift again next time the schema
  changes.
- **B.** Replace the static example with a generator script
  (`python -m ai_router.dump_session_state_schema`). The committed
  artifact becomes a script invocation, not a stale snapshot.

Recommend B. Same pattern can apply to other schema-bearing files
(activity-log.json structure, ai-assignment.md template) over time.

## Trade-offs and risks

### Costs
- **+5–10% session cost** from the fresh close-out turn. Mitigation: run
  it at low effort on a cheap model. Mitigation 2: skip the fresh turn
  for trivially short sessions where context fade isn't a factor (heuristic:
  if the work turn used <30% of its token budget, let it close itself).
- **More Python code to maintain.** ~150–250 lines for `close_session`,
  the gate logic, and the schema additions. Adds a unit test surface.

### Reliability traps to avoid
- **Idempotency must be built in from day one.** The most common
  partial-failure mode (work-agent commits then stops) means
  `close_session` will be re-run. Re-runs must be safe — no duplicate
  log entries, no double-pushes, no double-notifications.
- **Atomic file writes on Windows.** `session-state.json` updates need
  to be atomic (write to temp, rename) so partial writes don't corrupt
  state.
- **Don't make the gate too strict.** Some legitimate sessions produce
  no commits (pure exploration; spec authoring; refactor that turned
  out to be a no-op). Add `--allow-empty-commit` for those cases. The
  gate should fail closed by default, but allow human override.

### Behavioral risks
- **Agents may "game" the gate.** If `nextOrchestrator` is required, the
  agent may fill it in with a generic recommendation just to pass the
  check. Mitigation: spot-check `reason` field for substance during
  routine review. Long-term: add a verifier check that scores the
  reason for specificity, but defer until needed.
- **The fresh-agent prompt is itself an instruction the orchestrator
  must produce.** If that prompt is wrong, every close-out is wrong.
  Mitigation: keep the prompt short, version it, validate it lands in
  router-metrics.jsonl correctly during initial rollout.

## Open questions

1. **Should `close_session` be invokable by the human directly, not just
   the agent?** Probably yes — useful for debugging stuck sessions and
   for the case where the agent fails entirely and the human needs to
   close out manually. Easy to support; just don't require a routing
   context.

2. **What's the right heuristic for "skip the fresh close-out turn for
   short sessions"?** A token-budget threshold is concrete but model-
   specific. An alternative: always route the fresh turn, accept the
   cost. Recommend "always route" until evidence shows the cost is
   meaningful in practice.

3. **Should the gate's failure list be machine-readable?** Yes —
   structured JSON output mode (`--format=json`) so the orchestrator can
   parse it and inject specific remediations into a follow-up turn,
   rather than having the agent re-read prose. Defer to a later
   refinement; first cut is human-readable.

4. **Should `nextOrchestrator` recommendations be logged in
   `router-metrics.jsonl` for retrospective analysis?** Yes — useful for
   studying whether the recommendations match what was actually used.
   Cheap to add. Include in initial implementation.

5. **What about sessions that legitimately end without next-session
   work (final session of a set)?** `nextOrchestrator: null` is allowed
   when `currentSession === totalSessions`, and the gate requires
   `change-log.md` to exist instead. Already covered above; flagging
   here for visibility.

## Sequencing

Recommended order, smallest-blast-radius first:

1. **Add `nextOrchestrator` field to schema, no enforcement yet.** Pure
   data addition. Backfill committed examples. Low risk.
2. **Implement `print_cost_report()` from `router-metrics.jsonl`.** No
   behavior change for callers; same function signature, more reliable
   data source.
3. **Implement `python -m ai_router.close_session` as a runnable script,
   no orchestrator integration yet.** Test it manually. Iterate on the
   gate checks and remediation strings.
4. **Wire `mark_session_complete()` to invoke the gate.** This is the
   first behavior change — `mark_session_complete()` may now refuse.
   Roll out with a `--force` flag for the transition period; remove
   the flag once confidence is high.
5. **Move Step 8 content out of the workflow doc.** Cosmetic, but does
   the placement work.
6. **Wire the orchestrator to route the fresh close-out turn.** This is
   the largest behavior change and goes last so earlier mechanization
   work is in place.

Each step is independently shippable and rollback-safe.

## Synthesis after cross-provider review

Both reviewers (Gemini Pro and GPT-5.4) returned "Recommend with
modifications" verdicts and converged on the same set of weaknesses.
This section consolidates the reshape; the appendices contain the
verbatim reviews.

### What changes from the original proposal

#### 1. Promote the reconciler to a first-class component

The original proposal treated reconciliation as implicit (idempotency
of `close_session` on retry). Both reviewers flagged that this is not
enough. Add a **session lifecycle ledger** with explicit transitions
(`work_started`, `verification_passed`, `closeout_requested`,
`closeout_succeeded`, `closeout_failed`) and a **background sweeper**
that retries close-out for any session in
`verification_passed && !closeout_succeeded` for longer than N minutes.

The fresh-agent turn becomes an *optimization* (fast path) rather than
the *only* path. The reconciler is the durable recovery mechanism. A
human, the work-agent, the fresh close-out agent, or the sweeper can
all invoke `close_session` with the same result — that's the
correctness invariant.

#### 2. Split the state machine

Don't let `mark_session_complete()` represent both "work done" and
"publish succeeded." Replace the boolean `status: in-progress | complete`
with a richer enum:

- `work_in_progress` — agent is working
- `work_verified` — verification (Step 6) passed; work is on disk
- `closeout_pending` — close-out requested but not yet finished
- `closeout_blocked` — close-out failed for a recoverable reason
  (push rejected, missing upstream, etc.); reconciler will retry
- `closed` — close-out succeeded; all post-conditions met

Persist failure details as machine-readable blockers on
`closeout_blocked` rather than pushing users toward `--force`. The
sweeper transitions `closeout_blocked` → `closeout_pending` on retry.

#### 3. Make `close_session` non-interactive by default

The original proposal had the script prompt for narrative fields. Both
reviewers flagged this as brittle (varies by orchestrator, can hang).
Revised:

- **Default mode: non-interactive.** Reads inputs from a
  `disposition.json` file that the work-agent (or fresh close-out
  agent) writes. Emits structured failure codes / JSON output the
  orchestrator can parse and act on.
- **Optional `--interactive` flag** for human use (debugging stuck
  sessions, manual close-out).
- **Specific flags** for partial automation:
  `--set-next-orchestrator`, `--reason-file`, `--allow-empty-commit`,
  `--json` output mode.

This change also makes the reconciler simpler — it can run
`close_session --json` and parse the output programmatically.

#### 4. Add a `disposition.json` artifact (Gemini Pro's recommendation)

The work-agent's final action is to write
`docs/session-sets/<slug>/disposition.json`:

```json
{
  "status": "completed" | "failed" | "requires_review",
  "summary": "1–3 sentence narrative summary",
  "filesChanged": ["..."],
  "nextOrchestrator": { "engine", "provider", "model", "effort", "reason" } | null,
  "blockers": ["..."]
}
```

The orchestrator uses this file as the **unambiguous trigger** for
close-out. Missing file or `status != "completed"` means the
orchestrator does not initiate close-out; instead it routes the
appropriate follow-up (re-verification, human escalation). This
solves the "how does the orchestrator detect work-done?" reliability
problem by replacing inference with an explicit signal.

#### 5. Cost reporting becomes dual-sourced, not redirected

Original: switch `print_cost_report()` from `activity-log.json` to
`router-metrics.jsonl`. Revised (per both reviewers):

- **`router-metrics.jsonl` is canonical for routed-model spend** (auto-
  written by `record_call()`, accurate by construction).
- **`activity-log.json` is supplemental** — captures human-edited
  corrections, manual costs (paid APIs invoked outside the router,
  human-time annotations, anything that's not a `route()` call).
- **The cost report shows both sources, flags discrepancies, and
  states which total is authoritative for billing vs. narrative
  audit.**

This avoids the silent-data-loss failure mode if non-routed costs ever
exist or get added later.

#### 6. Tighten `nextOrchestrator` semantics beyond presence

Both reviewers flagged that schema validation alone is gameable
(syntactically valid but semantically empty `reason`). Revised:

- **Constrained `reason` field with a structured rubric.** Include
  required sub-fields like `reason.code` (enum:
  `continue-current-trajectory | switch-due-to-blocker |
  switch-due-to-cost | other`) and `reason.specifics` (free text,
  minimum 30 chars referencing concrete session metadata like remaining
  task type or unresolved provider-specific issue).
- **Cross-field validation:** if `reason.code = switch-due-to-blocker`,
  the `blockers` array in `disposition.json` must be non-empty.
- **Reviewability:** spot-check `reason.specifics` during routine
  review (not gated by code, but instrumented in the cost dashboard or
  similar).

#### 7. Harden the git invariants

Original gate checked `git status --porcelain` empty and
`git log @{u}..HEAD` empty. Both reviewers flagged that these proxies
break in legitimate edge cases:

- **`git status --porcelain` empty** can fail spuriously due to OS
  indexing, IDE file watchers, or external tooling touching the
  worktree. Mitigation: scope the check to a `--allowlist` of paths
  the close-out cares about, and skip a configurable list of
  known-innocuous patterns.
- **`git log @{u}..HEAD` empty** breaks under detached HEAD, missing
  upstream, protected-branch flows, rebased/force-push branches.
  Mitigation: explicitly check `git rev-parse --abbrev-ref @{u}`
  resolves; surface a precise error if not. Distinguish "no upstream
  configured" (configuration error) from "upstream exists, push
  rejected" (transient block, retry via reconciler).
- **`change-log.md exists`** is too weak as the final-session invariant
  (a stale file from a prior session would satisfy it). Strengthen to
  "change-log.md exists AND was modified in the current session"
  (filesystem mtime > session `startedAt`, or the file references the
  current session number).

#### 8. Reorder the rollout sequence

Original sequence: schema add → cost-report redirect → close_session
script → gate enforcement → doc collapse → fresh-agent turn.

Revised sequence (per GPT-5.4, who noted the original had gate
enforcement before recovery infrastructure, increasing risk during
rollout):

1. Add `nextOrchestrator` + lifecycle states to schema, with
   migration logic for old `session-state.json` files.
2. Implement `disposition.json` writing as part of the work-agent's
   close-out narrative (no enforcement yet).
3. Implement `close_session` (non-interactive default, `--interactive`
   flag, structured output).
4. Implement the **reconciler / sweeper**. This must precede gate
   enforcement so that any `closeout_blocked` sessions during rollout
   have an automatic recovery path.
5. Re-source `print_cost_report()` as dual-sourced.
6. Wire `mark_session_complete()` to run the gate (with `--force`
   transitional flag). At this point the system has the recovery
   mechanism (#4) so gate failures become recoverable, not stranding.
7. Move Step 8 content out of the workflow doc.
8. Wire orchestrator to route the fresh close-out turn (the
   optimization layer on top of the now-reliable foundation).

### What stays from the original proposal

- The mechanization direction (replace prose with script + gate) is
  the correct shape. Both reviewers explicitly endorsed this.
- The `nextOrchestrator` field as structured data (with the tightening
  in #6 above).
- `close_session` as the single entry point.
- The workflow doc collapse (Step 8 → one sentence + script `--help`),
  with the caveat that it must coincide with the orchestrator prompt
  injecting the close-out command — otherwise recall problem just moves.
- Fresh-agent turn for close-out — but as an optimization layer, not
  the primary control point.

### What this means for cost and timeline

The reshape adds:
- The reconciler / sweeper (~100–150 lines of Python + a scheduler
  decision: cron, systemd timer, or in-orchestrator loop).
- The lifecycle state migration (~50–100 lines + tests).
- The `disposition.json` schema and writer integration.
- The dual-sourced cost report.

Total new code estimate revised from 150–250 lines to **350–500 lines**.
Sequencing is more conservative (recovery before enforcement). The
scope is larger but the failure surface is materially smaller.

## Open questions (revised)

1. **Where does the reconciler run?** Options: (a) cron / Windows
   Scheduled Task on the developer's machine, (b) in-orchestrator
   sweeper loop that runs at the start of each new session, (c) a
   separate `python -m ai_router.sweep_sessions` command the human
   runs occasionally. Recommend (b) — runs without external scheduling
   and surfaces stranded sessions when the human is most likely to
   notice.

2. **Concurrent worktrees: lock or reject?** The shipping contract
   (resolved 2026-05-01, Set 9 Session 2 — doc-only path) is:

   - **Same-set close-out re-entry** is serialized by `close_lock.py`'s
     advisory lock at `<session-set-dir>/.close_session.lock`. Two
     `close_session` invocations on the same session-set folder
     cannot interleave their gate checks or state flips.
   - **Cross-set parallelism on the same `(repo, branch)`** is **not**
     prevented by an admission-time lock. It is governed by operator
     discipline and the deterministic close-out gate. Parallel session
     sets are expected to use distinct `session-set/<slug>` branches
     via the bare-repo + flat-worktree layout
     (`docs/planning/repo-worktree-layout.md`); when the
     parallel-set-on-same-branch case does occur, the gate's
     `check_pushed_to_remote` predicate refuses to mark the loser of
     the push race complete until they `git pull --rebase` and
     re-push.
   - The residual-race behavior is documented in
     `ai-router/docs/close-out.md` Section 6 (Troubleshooting →
     "Cross-set parallelism on the same `(repo, branch)`"). The
     gate's rejection-and-remediation response in the cross-set
     push-race scenario — the specific predicate this resolution
     relies on — is covered by `TestScenario7CrossSetParallelRejection`
     in `ai-router/tests/test_failure_injection.py`. (The downstream
     "`close_session` exits 1 without flipping lifecycle state"
     property of the gate flow is asserted elsewhere — see
     `test_mark_session_complete_gate.py` and the close-out
     integration tests — and is not re-asserted by Scenario 7.)

   **History — superseded recommendation.** The original draft of
   this question recommended *rejecting* parallel sessions on the same
   `(repo, branch)` via an admission-time advisory lock at
   `docs/session-sets/<slug>/.close_session.lock`, and documenting
   that parallel sessions on different worktrees were fine. The
   combined-design alignment audit
   (`docs/proposals/2026-04-30-combined-design-alignment-audit.md`
   §5.2, drift item D-1) flagged the implementation as narrower than
   that answer: the shipping lock only serializes same-set
   close-out re-entry, not session admission. Set 9 evaluated two
   corrective options — (a) widen the lock to cover `(repo, branch)`
   at session admission, or (b) revise the agreed answer to acknowledge
   that close-out-only serialization plus the gate is sufficient.
   The operator selected (b). The widen-the-lock path was rejected
   because the shipping operating model — parallel sessions on per-set
   worktree branches — makes the residual race rare in practice, and
   adding a new admission-time lock would introduce a new failure mode
   (a corrupt or stranded lock could block all sessions on a branch
   until the TTL elapsed). The audit's MATERIAL DRIFT verdict on D-1
   is satisfied by aligning the contract to the implementation rather
   than the reverse.

3. **`disposition.json` location and lifecycle.** Live in the session
   set directory? Cleaned up when status flips to `closed`? Or kept
   as audit trail forever? Recommend keep-forever — small file, useful
   for debugging.

4. **Schema migration for existing `session-state.json` files.** Old
   files have boolean status; new schema has enum. Migration script
   or lazy migration on read? Recommend lazy migration on read —
   simpler rollout, no batch script needed.

5. **Lifecycle ledger storage format.** Options: append to existing
   `session-state.json`, separate `session-events.jsonl`, or use the
   existing `activity-log.json` with a new entry type. Recommend
   `session-events.jsonl` per session set — append-only, easy to read,
   doesn't bloat session-state.json.

## Approximate cost of this proposal and review

- Sonnet 4.6 authoring (this session): not separately tracked
- Gemini Pro review: $0.0153, 35.2s, 1,207 output tokens
- GPT-5.4 review: $0.0677, 80.7s, 4,122 output tokens
- Total review cost: $0.083

Both reviewers strengthened the proposal materially. Estimated cost of
implementing the revised proposal: ~$50–150 in development sessions
(per the proposal's own framework) over an estimated 4–8 sessions.

---

## Appendix A: Gemini Pro review (verbatim)

> Saved at `C:\temp\review-closeout-gemini-pro.md` at runtime; preserved
> here for the document's self-contained record.

### Verdict
Recommend with modifications

### Reasoning
The proposal's core strategy—replacing procedural instructions with a
deterministic, mechanized script—is a robust solution to the stated
reliability problem. It correctly shifts responsibility for correctness
from a non-deterministic LLM to verifiable code. However, the
introduction of a new, separate "close-out" agent turn creates a
critical and under-specified failure point in the orchestration logic,
which must be hardened before implementation.

### Concerns

**Critical:**
- **Undefined orchestrator trigger for the close-out turn:** The
  proposal assumes the orchestrator can reliably detect when a work
  agent is "done." This is a critical failure point. A work agent can
  terminate due to success, a crash, a timeout, or a tool error; the
  orchestrator must be able to distinguish a successful completion
  from a failure before launching a process that will commit and push
  the (potentially broken) work.

**Major:**
- **Semantic compliance gaming:** The proposal correctly identifies
  the risk of agents "gaming" the `nextOrchestrator.reason` field but
  understates the likelihood. Without semantic checks, this field will
  likely fill with low-value, generic text (e.g., "To proceed with the
  next step"), defeating the purpose of capturing structured rationale.
- **Incomplete cost data:** Sourcing cost reports exclusively from
  `router-metrics.jsonl` assumes all billable actions are LLM calls.
  This change will omit any costs tracked in `activity-log.json`
  related to external tools, paid APIs, or manual human interventions,
  leading to inaccurate total cost accounting.

**Minor:**
- **Git operation race conditions:** If the system allows for parallel
  sessions operating on the same repository, the git state checks
  (`git status`, `git log @{u}..`) are not atomic and could lead to
  race conditions or incorrect validation if another process modifies
  the worktree or pushes changes concurrently.
- **Agent interaction model:** The proposal for an interactive script
  (`prompts for narrative fields`) may not be robust. LLM agent
  wrappers vary in their ability to handle interactive `stdin`/`stdout`
  sessions, which could lead to hangs or errors.

### Modifications suggested
- **Implement an explicit session disposition signal:** The work
  agent's final task should be to write a `disposition.json` file
  containing a definitive status (`status: "completed" | "failed" |
  "requires_review"`) and any required outputs (like the
  `nextOrchestrator` block). The orchestrator should use the presence
  and content of this file as the sole, unambiguous trigger for
  initiating the close-out turn, refusing to do so if the file
  indicates failure or is missing.
- **Make the `close_session` script non-interactive by default:** The
  script should take all necessary data via command-line flags or from
  a configuration file (e.g., `disposition.json`). This creates a more
  reliable interface for automation. An `--interactive` flag can be
  retained for manual human use.
- **Add a semantic validator to the gate:** For fields like
  `nextOrchestrator.reason`, the gate should perform a basic semantic
  check, such as rejecting submissions below a minimum character count
  or containing phrases from a generic-term blocklist.

### Failure modes flagged that the proposal underweights
- **Orchestrator failure between turns:** If the orchestrator process
  fails after the work agent completes but before launching the
  close-out agent, the session will be left in a "zombie" state—work
  done but not recorded as complete. The system needs a recovery
  mechanism, such as a startup process that scans for and reconciles
  zombie sessions.
- **Close-out agent failure:** The new close-out turn is itself a
  point of failure. If this turn fails (e.g., due to a provider API
  outage), the session is also left in a zombie state. The
  `close_session` script and the orchestrator's handling of this turn
  need their own robust retry and error-handling logic.
- **Working tree pollution:** The `git status --porcelain` check is
  brittle. It will fail if unrelated background processes (e.g., OS
  indexing, IDE file watchers) modify files in the repo. The check
  should be scoped to an expected set of paths or configured to ignore
  known-innocuous untracked files.

### Specific assumptions that may not hold
- **Assumption: The orchestrator can reliably infer task completion
  from process termination.** This is false. A process exit code is
  insufficient to distinguish successful completion from a
  state-corrupting crash. An explicit, transactional signal is
  required.
- **Assumption: `router-metrics.jsonl` is a complete superset of
  `activity-log.json` for cost purposes.** This is unlikely to be true
  if the workflow includes any non-LLM costs. The cost reporting
  source should be a union of both files until all cost sources are
  routed through the new mechanism.
- **Assumption: Removing Step 8 from the main workflow document will
  not harm compliance.** This holds only if the `close_session` script
  is fully non-interactive or if the agent's context window and
  reasoning capabilities are sufficient to recall the command and
  handle its prompts effectively at the end of a long session. The
  move to a non-interactive script (as suggested) mitigates this risk.

### One-paragraph alternative framing
No alternative framing — the proposal's shape is correct. The core
architectural decision to replace fragile, prose-based instructions
with a deterministic, self-documenting script that acts as a
validation gate is the right approach for this problem. The proposed
solution correctly identifies the source of unreliability and moves to
enforce correctness by construction. The necessary modifications are
focused on hardening the state-transition logic between workflow
steps, not on changing the fundamental design.

---

## Appendix B: GPT-5.4 review (verbatim)

> Saved at `C:\temp\review-closeout-gpt-5-4.md` at runtime; preserved
> here for the document's self-contained record.

### Verdict
Recommend with modifications

### Reasoning
The proposal is directionally right: replacing prose-only close-out
instructions with an executable close-out path is the correct
architectural move. The weak point is that it treats the fresh-agent
turn and the gate as if they are sufficient control points, when the
real reliability problem is lifecycle recovery after abnormal
termination and concurrent repo state changes. Without a reconciler,
clearer session-state transitions, and an explicit concurrency model,
this can turn "agents skip steps" into "valid sessions become stranded
and need stronger manual intervention."

### Concerns

**Critical:**
- The proposal overestimates the reliability of the fresh-agent
  close-out turn (component 6). If the work agent crashes, times out,
  refuses, hits max tokens, or the orchestrator misclassifies
  completion, the close-out turn never launches and there is no
  independent recovery path; the session can remain permanently
  `"in-progress"` despite verified work existing on disk.
- The gate in `mark_session_complete()` is not concurrency-safe for
  parallel sessions or shared repos/worktrees (component 1).
  `git status`, `git add/commit/push`, and `@{u}` checks can all race
  with other sessions or humans, so a session can pass prechecks and
  still push stale or conflicting state, or fail after partially
  completing side effects.
- The design conflates "session work is complete" with "all publishing
  side effects succeeded." A remote outage, branch protection rule,
  missing upstream, detached HEAD, required rebase, or push rejection
  can block state transition indefinitely even when the session's
  actual work and verification are done.

**Major:**
- The `nextOrchestrator` field (component 2) only validates presence,
  not decision quality. Agents can satisfy the schema with generic or
  circular reasons, so the system may trade omission for low-value
  compliance unless there is stronger semantic structure or
  reviewability.
- Re-sourcing `print_cost_report()` only from `router-metrics.jsonl`
  (component 4) may silently drop legitimate data if
  `activity-log.json` currently captures human corrections, non-routed
  calls, manual steps, or costs incurred outside `record_call()`.
  "Accurate by construction" is only true if the router is the sole
  metering surface.
- The gate still requires an `activity-log` entry while the cost
  report no longer depends on it (components 1 and 4). That keeps a
  flaky/manual artifact in the critical path without a clearly stated
  reason, which may preserve failure rather than remove it.
- Collapsing Step 8 in the main workflow doc (component 5) may hurt
  agents/orchestrators that preload only that doc at session start. If
  the orchestrator prompt does not explicitly inject "run `python -m
  ai_router.close_session`," the recall problem may just move location
  rather than disappear.
- `close_session` as an interactive script (component 3) assumes an
  interactive CLI and stable prompt-following. That is brittle for
  non-interactive runs, tool-only agents, or providers that handle
  prompt-driven data entry inconsistently.

**Minor:**
- `change-log.md exists` is too weak a final-session invariant
  (component 1). A stale file from a prior session would satisfy the
  gate even if the final-session summary was never updated.
- The schema-drift fix (component 7) addresses docs drift but not
  real-state migration. Adding `nextOrchestrator` without schema
  versioning/migration logic risks mixed old/new `session-state.json`
  files and awkward transition behavior.
- Sequencing is slightly backward: enforcing the gate before adding a
  recovery/reconciliation mechanism increases the chance of stranded
  sessions during rollout.

### Modifications suggested
- Add a durable reconciliation loop before relying on the fresh-agent
  turn: persist session lifecycle events (`work_started`,
  `verification_passed`, `closeout_requested`, `closeout_succeeded`,
  `closeout_failed`) and run a sweeper that retries close-out for any
  `verification_passed && !closeout_succeeded` session. The
  fresh-agent turn should be an optimization, not the only path.
- Split state more explicitly: `work_verified`, `closeout_pending`,
  `closeout_blocked`, `closed`. Do not force `mark_session_complete()`
  to represent both work completion and remote publication success;
  persist failed checks as machine-readable blockers instead of
  pushing users toward `--force`.
- Define a concurrency model: either require one session per
  repo/worktree/branch, or implement repo locking plus post-push
  revalidation and compare-and-swap writes to `session-state.json`. If
  parallel sessions are unsupported, fail fast and document that
  explicitly.
- Make `close_session` support non-interactive operation (`--json`,
  `--set-next-orchestrator`, `--reason-file`, etc.) and emit
  structured failure codes so the orchestrator can retry or escalate
  deterministically.
- Tighten `nextOrchestrator` semantics: use constrained reason codes
  or a rubric-backed template, and validate against current session
  metadata (e.g., unresolved provider-specific issue, required model
  class, remaining task type) so the field is harder to game.
- Keep cost accounting dual-sourced: router metrics as canonical
  routed-model spend, activity log as supplemental/manual adjustments.
  The report should show both, flag discrepancies, and state which
  totals are authoritative for billing vs. narrative audit.
- Reorder rollout: implement `close_session` + lifecycle states +
  reconciler first, then gate enforcement, then doc collapse, and only
  then the fresh-agent turn.

### Failure modes flagged that the proposal underweights
- The work agent completes edits and verification but ends abnormally
  before emitting the "done" signal; the orchestrator never spawns the
  close-out turn, so the repo may contain valid work while
  `session-state.json` remains `"in-progress"` indefinitely.
- Two sessions run in parallel on the same repo: session A passes the
  clean-tree check, session B commits/pushes first, then session A's
  push fails or rebases under it. A naive retry can produce duplicate
  commits, wrong cost/report context, or a close-out attached to the
  wrong repo state.
- The fresh close-out agent lacks the conversational context that
  motivated the next orchestrator choice and fills
  `nextOrchestrator.reason` with plausible but semantically empty
  text, passing the gate while degrading planning quality.
- `router-metrics.jsonl` is incomplete for a session because some
  model calls happened via direct CLI/provider use, or the process
  crashed before flushing metrics; the new cost report now looks
  authoritative while understating actual spend.

### Specific assumptions that may not hold
- The proposal assumes the orchestrator can reliably detect "work
  appears complete" well enough to trigger a fresh close-out turn. In
  practice, abnormal exits, partial outputs, verification retries, or
  ambiguous agent messages make that detection itself a reliability
  problem.
- The proposal assumes `git log @{u}..HEAD --oneline` is a robust
  proxy for "pushed to remote." That fails in detached HEAD states,
  missing upstream configuration, protected-branch flows, rebased
  branches, concurrent remote updates, and force-push scenarios.
- The proposal assumes `router-metrics.jsonl` is a complete source of
  truth. That is only true if every billable/model interaction in the
  workflow goes through `record_call()` and is durably written before
  termination.
- The proposal assumes a fresh low-effort close-out agent will improve
  reliability. It may instead introduce handoff loss,
  provider-specific prompt failures, and a second independent API
  surface that can fail after the work itself already succeeded.

### One-paragraph alternative framing
Treat close-out as a reconciled state machine, not an agent task. The
orchestrator should own a durable session ledger and move sessions
through machine states based on observable facts: verification passed,
git commit created, push acknowledged, recommendation captured,
notification sent. `close_session` then becomes a deterministic
reconciler that can be run by the work agent, a fresh agent, a human,
or a background sweeper with the same result. Under that framing,
LLMs only fill missing narrative fields; they do not control whether
the workflow advances. This reduces dependence on any single turn
completing cleanly and makes abnormal termination a recoverable
condition instead of a special-case failure.
