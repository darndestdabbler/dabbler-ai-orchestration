# AI-Led Session-Set Workflow

> **New here?** Start with [`docs/quick-start.md`](quick-start.md) for a
> 5-minute orientation. Then return to this document for the full procedure.
>
> **Simple session shortcut:** if the active spec declares
> `requiresUAT: false` (the common case), you only need **Steps 0–10,
> the Rules list, and the Session Set Configuration table.** Jump to
> [§Step 0](#step-0-verify-api-keys-and-read-guidance).
> The UAT procedures and AI Router details below that marker are reference
> material for specific features — read them when they apply.

This document describes the orchestration pattern used to develop features in
this repository. An AI coding agent (Claude Code, Codex, or a Gemini-based
tool) acts as the **orchestrator**, executing a predefined session plan one
session at a time. A separate **AI Router** Python module routes reasoning
tasks to cheaper external models and enforces cross-provider verification.

This document is the single source of truth for the session-set workflow
itself — procedure, rules, router usage, verification, UAT handling, and
session-set close. `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` provide only
agent-specific bootstrap (API key export, router import snippet) and point
here for everything else. If a shared operational fact matters to future
orchestrators or humans, store it in an engine-agnostic doc like this one,
`docs/repository-reference.md`, `docs/planning/project-guidance.md`, or the
package changelogs — not only in one engine-specific bootstrap file.

The deterministic close-out path, gate checks, and reconciler hand-off
live in `ai_router/docs/close-out.md`.

The orchestrator can change from session to session at the human's discretion.
All three orchestrators follow the same workflow — only the instruction file
they read differs.

Read `docs/planning/project-guidance.md`,
`docs/planning/lessons-learned.md`, and
`docs/planning/session-set-authoring-guide.md` before every session and
before changing architecture, testing strategy, workflow assets, or
human-UAT conventions. Do **not** read `docs/planning/lessons-archive.md`
at session start — the archive (Set 064) is the preserved, never-auto-
loaded tier; search it on demand with `python -m ai_router.guidance_search
--archive`. The guidance lifecycle these files follow (per-lesson metadata,
citation-at-close, archival triggers, ceilings) is documented canonically
in [`docs/guidance-lifecycle.md`](guidance-lifecycle.md).

## Overview

```
Human
  |
  | "Start the next session [of <slug>]"             (sequential)
  | "Start the next parallel session of <slug>"      (worktree-isolated)
  | "<phrase> — maxout <engine>"                     (token-window override)
  v
Orchestrator (Claude / Codex / Gemini)
  |
  |-- reads instruction file (CLAUDE.md / AGENTS.md / GEMINI.md)
  |-- reads project-guidance.md, lessons-learned.md,
  |   and session-set-authoring-guide.md
  |   (NOT lessons-archive.md -- never auto-loaded; Set 064)
  |-- reads spec.md (incl. Session Set Configuration block)
  |   in the active session set
  |-- reads activity-log.json for prior progress
  |-- writes session-state.json (in-progress) for external tooling
  |
  |  For each step in the session plan:
  |    |-- file work: creates/edits files directly
  |    |-- reasoning: calls route() via ai_router Python module
  |    |     |-- router selects cheapest capable model
  |    |     |-- Gemini Flash (tier 1), Gemini Pro (tier 2),
  |    |     |   Sonnet (tier 2), or Opus (tier 3)
  |    |     +-- auto-verification for code-review/security-review
  |    |-- logs every step to activity-log.json
  |
  |-- runs repo build && test suite (TODO: set build command in
  |                                    CLAUDE.md / AGENTS.md / GEMINI.md)
  |
  |-- GATED (Set 068 DEMOTE): end-of-session verification
  |     |-- runs `python -m ai_router.routed_gate` on the session diff;
  |     |   runs the routed call only when the predicate trips
  |     |-- sends all work to a DIFFERENT AI provider
  |     |-- saves raw verifier output (never edited)
  |     +-- fixes issues if found (max 2 retries)
  |
  |-- on last session: generates change-log.md (part of the same commit)
  |-- prints cost report
  |-- commits and pushes
  |-- sends session-complete notification (if configured)
  |-- on last session ONLY (after notify, so the human is not blocking
  |                    the notification on answering proposals):
  |                    proposes reorganization candidates for
  |                    project-guidance.md / lessons-learned.md, then
  |                    commits and pushes any accepted changes separately
  +-- STOPS (one session per conversation)
```

## Cost-budgeted verification modes

> **Adoption tier vs. budget tier.** This section's tier vocabulary
> is the **budget tier** — a within-Full-adoption concept that
> governs how verification calls are paid for. The **adoption
> tier** (Lightweight vs. Full) is a different dimension chosen at
> project setup (see `docs/concepts/tier-model.md`). Lightweight-tier
> projects opt out of cross-provider verification and the
> `ai_router/` machinery entirely as part of choosing that tier —
> not as a cost-budgeted exception. Everything below applies only
> to Full-adoption projects.

Every Full-adoption project declares an API-verification **budget
threshold** at project setup — the Getting Started form's Full-tier
budget step (or a hand-authored file; see
`docs/budget-yaml-schema.md`). The threshold is recorded in
`ai_router/budget.yaml` and governs which verification path the
project uses. Two tiers, with two sub-options under the zero tier:

| Tier | Threshold (`threshold_usd`) | `verification_method` |
|---|---|---|
| **`zero-budget`** | `0` | (a) **`manual-via-other-engine`** OR (b) **`skipped`** — operator picks |
| **non-zero budget** | `> 0` | `api`, bounded by `verification_nte_usd` |

The threshold and the chosen verification method are persisted in
`ai_router/budget.yaml` (see `docs/budget-yaml-schema.md` for the
canonical schema). The Getting Started form writes this file once at
scaffold time; the operator can edit it anytime to change tier or
method.

**Compatibility rule for missing fields.** Older or hand-authored
`budget.yaml` files may omit fields added after their creation or use
the pre-migration vocabulary. The two defaults this doc depends on:
`verification_method` → `api` if absent (matches Rule 2's default);
scope → `per-project` if absent (cumulative spend). The full
legacy-compatibility table lives in `docs/budget-yaml-schema.md`.
Readers (current and future enforcement code) must apply those rules
rather than erroring on a missing field, so an older file continues
to work without manual migration.

### Interaction with Rule 2

Rule 2 in the [Rules section](#rules-apply-to-all-orchestrators)
below — **"Never skip verification"** — is the default for every
session and remains the default for every project that operates with
a non-zero budget.

The zero-budget tier introduces an **operator-authorized exception**
to Rule 2 via two paths, neither of which weakens the rule itself:

- **`verification_method: "manual-via-other-engine"`** — Rule 2 is
  satisfied by manual cross-provider review. The operator (human)
  performs the verification by handing the work to a different AI
  assistant + the verification template, then copying the verdict
  back. The template's stable public URL is
  `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/ai_router/prompt-templates/verification.md`
  (also reachable locally at `ai_router/prompt-templates/verification.md`
  in this canonical repo). For freshly-bootstrapped consumer projects
  that don't yet have `ai_router/` checked in, the URL is the
  authoritative source. The session orchestrator records this method
  in the session's `change-log.md`.
- **`verification_method: "skipped"`** — Rule 2 is explicitly
  bypassed. Every session's `change-log.md` records the skip with a
  reference to the project's `ai_router/budget.yaml`. This is the
  honest audit trail of "verification was opted out at the project
  level for explicit budget reasons." Sessions running under this
  setting do **not** route a `session-verification` task and do
  **not** invoke the cross-provider verifier.

Both paths are valid only when `ai_router/budget.yaml` declares the
zero-budget tier. A session running on a non-zero-budget project
that tries to skip verification or substitute manual review without
a corresponding `budget.yaml` declaration violates Rule 2.

### What this means at session execution time

The orchestrator at Step 6 (end-of-session verification) reads
`ai_router/budget.yaml` if present:

- **`verification_method: "api"`** — Step 6 runs as documented
  (`route(task_type="session-verification")` against a different
  provider, save raw output, handle issues).
- **`verification_method: "manual-via-other-engine"`** — Step 6
  pauses and prompts the human to perform the manual review. The
  orchestrator hands the human a copy of the work + the
  verification template; the human runs the review elsewhere; the
  human pastes the verdict back; the orchestrator continues.
- **`verification_method: "skipped"`** — Step 6 is explicitly
  bypassed. The session's `change-log.md` records the skip with a
  pointer to `ai_router/budget.yaml`.
- **`verification_nte_usd`** — the cumulative ceiling for API
  verification spend (defaults to `threshold_usd` if absent). At
  each session stop the orchestrator reports running spend against
  this ceiling. If the ceiling is reached mid-session, verification
  switches to `manual-via-other-engine` for that session rather
  than failing.

If `ai_router/budget.yaml` is absent (project has not yet recorded a
budget), the orchestrator treats the project as if
`verification_method: "api"` were set — Rule 2's default behavior.

### Spend monitoring

Set 013 ships the file format and the dialog that produces it. It
does **not** ship automated pre-call enforcement (warnings,
block-on-exceed). Operators monitor spend manually with:

- `python -m ai_router.report --since YYYY-MM-DD` — governance summary.
- `python -m ai_router.cost_report` — per-session detail.
- The `Dabbler: Show cost dashboard` extension command — live spend
  view.

Automated threshold-aware pre-call warnings + block-on-exceed
enforcement are planned for a follow-up set.

## Key Concepts

### Session Set

A session set is a planned body of work broken into sequential sessions. Each
session set lives in `docs/session-sets/<name>/` and contains:

| File | Purpose |
|---|---|
| `spec.md` | The full plan: goals, features, configuration block, and per-session step lists |
| `session-state.json` | Live status (current session, orchestrator metadata, latest verdict). Written at Step 1; flipped to `complete` at Step 8. See [`docs/session-state-schema.md`](session-state-schema.md) for the canonical field set, status values, and the alias map applied at the read boundary. |
| `session-events.jsonl` | Append-only lifecycle ledger emitted by `start_session` / `close_session`. |
| `ai-assignment.md` | Per-session ledger of cheapest-capable AI for each step + next-session recommendation. Authored on Session 1; appended each session. |
| `activity-log.json` | Machine-readable log of every step across all sessions |
| `disposition.json` | Structured close-out handoff for the just-finished session. Rewritten at each close-out; required before `close_session` on Full-tier sets. |
| `sN-verification.md` | Recommended root-level raw verifier output for session `N` (never edited). Additional rounds use `sN-verification-round-2.md`, `sN-verification-round-3.md`, etc. |
| `sN-issues.json` | Root-level machine-readable structured findings for a **findings-bearing** verification round (Set 055). Round 1 uses `sN-issues.json`; later findings-bearing retries use `sN-issues-round-2.json`, etc. Written only when the verdict is not `VERIFIED` — its presence means that round found issues. No runtime reader; never overwritten. See [`docs/session-issues-schema.md`](session-issues-schema.md). |
| `sN-close-reason.md` | Recommended root-level close-out / attestation narrative for session `N`. |
| `external-verification.md` | Manual verification record for Lightweight / `--no-router` flows. |
| `change-log.md` | Generated after the final session; marks the set as complete |
| `<name>-uat-checklist.json` | Per-set human-UAT checklist (only when `requiresUAT: true`) |
| `session-reviews/`, `issue-logs/` | Legacy compatibility directories created by older `SessionLog` helpers or one-off scripts. **Retired** — new orchestrator instructions must not depend on or recreate them. Structured findings now persist as the root-level `sN-issues.json` artifact above. |

Human-UAT sets use one checklist per session set, named after the set, rather
than re-running an earlier set's checklist. See
`docs/planning/project-guidance.md` → Conventions → Human UAT And Checklist
Editor.

### Session

One unit of work within a session set. Sessions are numbered (Session 1 of 5,
Session 2 of 5, etc.). Each session:

- Has a defined list of steps in `spec.md`
- Is executed by exactly one orchestrator in one conversation
- Ends with cross-provider verification **when the Set 068 routed-gate predicate
  trips on the session diff** (the DEMOTE cut-over; see *Verification-surface
  policy* and Step 6) — always run for a multi-file/coupling/contract change, and
  the end-of-set path-aware critique + contract-test gate remain the primary
  surface for the rest
- Produces a commit on completion

If a session creates or refreshes a checklist for later human UAT execution,
that pending human review becomes a blocker for downstream sessions unless the
human explicitly overrides it.

### AI Router

A Python module in `ai_router/` that routes reasoning tasks to external AI
models. The orchestrator calls `route()` instead of performing analysis,
review, or documentation itself. The router:

- Estimates task complexity (1-100 score)
- Selects the cheapest model capable of handling the complexity
- Escalates to a higher-tier model if the response is poor
- Auto-verifies certain task types using a different AI provider
- Tracks costs per session set

### Cross-Provider Verification

A session ends with an independent verification step **when the Set 068
routed-gate predicate trips on its diff** (the DEMOTE cut-over — see
*Verification-surface policy* immediately below; before Set 068 this ran on
every session). When it runs, the orchestrator sends its work to a model from a
**different AI provider** than the one that did the work. This catches
provider-specific biases and blind spots:

- If the orchestrator is Claude and used Gemini for routing, verification
  goes to Opus or Sonnet (Anthropic)
- If the orchestrator is Codex/Gemini, verification goes to an Anthropic model
- The verifier's raw output is saved and never edited

### Verification-surface policy (Set 068 — DEMOTE, cut over S6)

Set 067–068 ran two pre-registered experiments to settle whether the
every-session per-session routed verification above is the right **default**
verification surface, now that Sets 065–067 built a repository-reading
**path-aware critique** and Set 068 S5 adds a deterministic **contract-test /
CDC gate**. The finding: the *capability* case for routed-as-default is ruled
out (the lever is repository **context-access**, which path-aware provides and
snippet-fed routed structurally cannot; a second routed provider buys nothing),
and the *cadence* defense **does not hold** under the pre-registered rule — but
the cadence **mechanism is real**: routed catches **migrating cross-file
coupling defects at introduction**, a narrow residual value the end-of-set pass
does not match on that class.

On that evidence, cross-provider consensus + operator confirmation chose
**DEMOTE** (Set 068 S4 — full record in
[`docs/session-sets/068-cadence-study-and-contract-gate/routed-fate-decision.md`](session-sets/068-cadence-study-and-contract-gate/routed-fate-decision.md)).
The **target state**:

- **Primary surface:** the end-of-set path-aware critique + the S5 contract-test
  gate (deterministic floor for the ~95%-probeable bulk; agent reserved for the
  non-probeable residual).
- **Retained, gated:** per-session routed verification fires only when a
  **programmatic blast-radius / coupling predicate** over the session diff is true
  (multi-file/module changes, public API/schema/contract changes, cross-module
  refactors/moves/renames, build/CI/config changes, a changed surface with no
  contract test, or a high-blast-radius/post-failed-loop session). Small,
  single-file, probe-covered diffs bypass it. The predicate is implemented
  deterministically in `ai_router/routed_gate.py`
  (`evaluate_routed_gate` / `python -m ai_router.routed_gate`), building on the
  Set 066 blast-radius core predicate (`blast_radius.classify_paths`) plus the
  session-level triggers above. The S4 consensus required it to be a
  **deterministic diff heuristic, not a per-session feeling** — so the only
  operator inputs are the three honestly-declared facts the diff cannot show
  (`--contract-uncovered`, `--high-blast`, `--post-failed-loop`), each of which
  can only **raise** the verdict to REQUIRED.

> **Transition guard — CLEARED; the demotion is now in effect (S6).** The cut-over
> waited on the S5 contract-test gate being **live and stable**; that floor
> shipped in Set 068 S5, so S6 wired the predicate (`routed_gate.py`), flipped
> the workflow default (Step 6 is now gated, not mandatory), and flipped the
> `router-config.yaml` `verification:` anchor. Per-session routed verification is
> **gated, not gone** — a tripped predicate is the only path to a routed call,
> and the end-of-set path-aware critique + contract-test gate are the primary
> surface for the rest. RETIRE was rejected as premature and is reopenable later
> only on telemetry (`routed-fate-decision.md` §5).

### Significance flagging

End-of-session verification covers the *code* that landed. Significance
flagging covers the *decisions* — judgment calls the orchestrator (or
the operator) wants a second-engine read on at the next session start,
before any code is written.

There are two operator-facing surfaces. Both append to the active
session set's `decision-review-queue.jsonl`, an append-only ledger
that lives alongside `session-state.json` and `session-events.jsonl`
in the session-set folder.

**1. The command — `Dabbler: Flag Decision for Cross-Provider Review`.**
Invoke from the command palette (or the "Run command now..." button
in the config editor's Significance flagging section). Prompts for a
one-line reason; appends one JSON line:

```json
{"ts":"2026-05-16T12:00:00Z","reason":"<text>","source":"command","file":null,"line":null}
```

The command requires an in-progress session set. With no active set,
it surfaces an info notification and exits without writing.

**2. The annotation — `@dabbler:outsource-review("reason text")` in source code.**
The orchestrator can drop annotations inline when making a judgment
call that warrants confirmation. Both common comment styles are
recognized:

```python
# @dabbler:outsource-review("default tier feels too aggressive — confirm with Gemini")
```

```typescript
// @dabbler:outsource-review("debounce window: 500ms vs 1000ms — pick once we have telemetry")
```

`Dabbler: Scan Workspace for @dabbler:outsource-review Annotations`
walks the workspace's source files (extensions: ts/tsx/js/jsx/py/rb/
go/rs/java/cs/kt/swift/c/cc/cpp/h/hpp/sh/bash/zsh/ps1/yaml/yml/toml),
applies the regex, deduplicates against the existing queue (so the
same annotation does not double-append on a re-scan), and writes one
line per new finding:

```json
{"ts":"<ISO>","reason":"<captured>","source":"annotation","file":"src/foo.py","line":42}
```

Annotation honoring is gated by `decision_review.honor_annotations`
in `local-overrides.yaml` (default: true). Set it to `false` if the
project uses the annotation syntax for a different purpose; the
scanner becomes a no-op for that workspace.

**Queue handling at session start.** The orchestrator reads
`decision-review-queue.jsonl` as part of Step 1's planning checklist
(via `ai_router.decision_review_queue.read_queue`), surfaces each
entry for triage, and clears the queue (`clear_queue`) once the
entries are either addressed or rolled into the session's spec.
Entries that remain relevant after planning are typically addressed
in-session and re-flagged afterward if needed; the queue is a ledger
of intent, not a state machine.

### Session-Set Lifecycle and State File

Every session-set folder under `docs/session-sets/<slug>/` carries a
`session-state.json`. The file's `status` field is the canonical
public-facing answer to "what state is this set in?" — readers consult
it directly rather than inferring state from file presence.

**Canonical `status` values:**

```
"not-started"   — folder exists, no session has started
"in-progress"   — at least one session has started, no change-log yet
"complete"      — change-log.md present and close-out succeeded
"cancelled"     — operator paused or abandoned the set (see "Cancelling
                  and restoring a session set" below)
```

`status` is the coarse public-facing field. The v2 schema's
`lifecycleState` enum (`work_in_progress`, `work_verified`,
`closeout_pending`, `closeout_blocked`, `closed`) stays the close-out
machinery's internal granularity and is not a substitute for `status`.

**File invariant — `session-state.json` exists in every session-set
folder.** Three writers converge on this:

1. The extension's "Generate Session-Set Prompt" flow instructs the AI
   to scaffold the file alongside `spec.md` with `status:
   "not-started"`. The full not-started shape is in
   `docs/session-state-schema-example.md`.
2. `register_session_start()` overwrites the file at Step 1 of each
   session, flipping `status` to `in-progress` and populating
   `currentSession`, `startedAt`, and `orchestrator`.
3. The one-shot CLI `python -m ai_router.backfill_session_state` walks
   `docs/session-sets/` and synthesizes the file for any folder that
   slipped through. Run it once after pulling this repo into a
   consumer or after any hand-authored folder is created.

**Lazy-synthesis fallback.** Readers (`read_status` in Python,
`readStatus` in TypeScript) tolerate folders that slipped through
backfill. On a missing file, the reader infers the initial state from
legacy file presence (`change-log.md` → `complete`, `activity-log.json`
→ `in-progress`, neither → `not-started`) and writes that shape before
returning. This keeps the contract "readers always see a status"
without forcing users to run backfill — but the contract authors and
the scaffold paths assume the file is created up front.

**Hand-authored session-set folders** must include
`session-state.json` from creation. The lazy-synth fallback is a
robustness measure for legacy folders, not a license to skip the file
on new ones.

### Orchestrator identity and concurrency (post-Set-049)

Each `sessions[i]` entry in `session-state.json` carries its own
`orchestrator` block — a per-session record of who ran that session.
Set 049 ripped out the hard-coordination layer that Sets 033 / 036
built on top of this block. The current contract is much simpler:

**The orchestrator block is a record, not a check-out.** Four fields
(`engine`, `provider`, `model`, `effort`) with omit-null. A field the
caller cannot declare authoritatively is simply absent from the
on-disk block — no `null` values, no `"unknown"` placeholders. The
block stays attached to its `sessions[i]` entry forever; it's part
of the historical ledger. Nothing reads it to gate behavior.

**Within-set sequential is still enforced.** At most one in-progress
session per set at a time. `start_session` refuses a request that
would create a second in-flight session in the same set. There is
no holder-identity check on top of that — any caller can claim a
not-in-flight session, regardless of who ran the previous one.

**Across-set parallel is supported.** Two different session sets can
each have their own in-progress session at the same time, with any
combination of orchestrators. The Session Set Explorer renders
multiple in-progress sets natively.

**Per-orchestrator declaration contract (T3).** Hooks pass only the
fields they can declare authoritatively:

- **Claude Code** — invokes `start_session --engine claude
  --provider anthropic`, recovering `model` / `effort` from the prior
  session's block when available (no `"unknown"` fallback). (Set 050's
  Claude-only `SessionStart` hook that automated this invocation was
  retired in Set 051 S3; the universal workflow already has every
  orchestrator run `start_session` at each boundary.)
- **Codex CLI / Gemini Code Assist / GitHub Copilot / manual
  Lightweight** — analogous; pass what you know, omit what you
  don't.

**CLI backward compatibility (T2).**
`start_session --chat-session-id <id>` and any other vestigial
flag from the pre-049 surface is accepted by argparse and ignored
by the writer with a single stderr deprecation line per invocation:

```
start_session: --chat-session-id is no longer used (Set 049); ignoring
```

Consumer-repo hooks that still pass `--chat-session-id` keep working
without modification. The flag will be removed in a future major
release.

**`~/.dabbler/orchestrator-writer.log`** is retained as a generic
"start_session ran" audit appender. It no longer records holder
changes (there are none in the post-rip model); the log survives
as a post-hoc diagnosis surface and may be retired in a future
stability set.

**Tier symmetry.** On Full tier, `start_session` writes the
per-session orchestrator block automatically when the in-progress
session is registered; the operator never edits it directly. On
Lightweight tier, the operator (or path-aware agent) writes the
per-session block by hand at session start, following the same
4-field omit-null contract. In either case the block stays attached
to its `sessions[i]` entry through close — `close_session` does not
re-write or clear it.

**`writer-bypass` detector (D3) survives** in
`ai_router/writer_discipline.py` as a general writer-discipline check
— it fires when a state-file write isn't bracketed by an
events-ledger entry, catching out-of-band writes regardless of
which orchestrator did them. The Set 045 `bare-touch`,
`engine-mismatch`, and `stale-checkout-touch` detectors are retired.
(D3 was salvaged into the standalone `writer_discipline.py` module in
Set 051 S2 when the orphaned `ai_router/joiner/` subpackage — whose
only live caller, the Explorer harvest surface, was reverted in
Set 049 — was deleted.)

**Set 045 Explorer surface is reverted.** The Session Set Explorer
does not render orchestrator info, harvest-record badges, or
coordination-conflict pills (operator-locked P4). The `ai_router/joiner/`
log-harvest subpackage was removed entirely in Set 051 S2 (no live
caller remained after the Set 049 revert); only the D3 writer-discipline
check was salvaged.

See [`docs/session-state-schema.md § Writer Contract`](session-state-schema.md)
for the per-orchestrator declaration pattern and
[`docs/cross-repo-checkout-notice.md`](cross-repo-checkout-notice.md)
for the consumer-repo CLAUDE.md remediation instruction.

### Cancelling and restoring a session set

Cancellation is an operator action that takes a set out of the active
work pool without deleting it. The cancelled set keeps its full
history (`spec.md`, `activity-log.json`, existing verification artifacts
such as `sN-verification*.md` and `sN-issues*.json`, and any
`change-log.md` from a partial close-out) and can be restored at any
time.

**When to cancel:**

- The set was started in error (wrong slug, wrong scope, duplicates
  another set).
- Scope was rolled into another set mid-flight and the original is now
  redundant.
- The underlying requirement was withdrawn before the set finished.
- A partially-completed set has stalled and the operator wants it out
  of the active view without losing the artifacts.

**When NOT to cancel:**

- A set that finished its work successfully — that is what the
  close-out gate (Step 8) and the resulting `change-log.md` are for.
  Marking a successful set as cancelled drops it out of the Done
  group and obscures the history.
- A set that is mid-session and recoverable — cancellation is a
  human-visible state change, not a "pause for the day" affordance.
  If the next session can simply pick up where this one stopped,
  leave the set in-progress.

**How the operator triggers it:**

- **Right-click in the Session Set Explorer.** The `Cancel Session
  Set` action is visible on in-progress / not-started / complete
  items; `Restore Session Set` is visible on cancelled items. Both
  prompt for confirmation and offer an optional reason that is
  prepended to the on-disk history. The canonical writers
  (`cancelSessionSet` in
  `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts` and
  `cancel_session_set` in `ai_router/session_lifecycle.py`) flip
  `session-state.json`'s `status` to `"cancelled"` AND prepend an
  entry to `CANCELLED.md` in a single atomic boundary.
- **Edit `session-state.json` by hand.** Flip the top-level `status`
  to `"cancelled"` and (optionally) capture the prior value into a
  `preCancelStatus` field so a later restore can flip it back. The
  Cancelled bucket picks up the change on the next refresh. The
  matching `CANCELLED.md` audit entry is not strictly required for
  bucketing (the state file is the canonical signal post-Set-035),
  but **writing both is the canonical shape**: the markdown file is
  the durable, operator-readable record of what happened and when.
  Hand-flipping only the state file leaves the audit trail
  incomplete; hand-dropping only a `CANCELLED.md` does not flip the
  bucket (state-file-first wins; see "Detection precedence" below).

**Detection precedence** (Set 035, extending the Set 033 Session 2
H2 single-source-of-truth verdict): `session-state.json`'s `status`
field is the canonical signal. The extension's reader
(`readCancellationState` in `cancelLifecycle.ts`, wired through
`fileSystem.ts:readSessionSets`) resolves the bucket in this order:

1. `state.status === "cancelled"` → **Cancelled**.
2. `state.status` is a non-cancelled string → fall through to the
   normal status ladder (`"complete"` → Complete, `"in-progress"`
   → Active, otherwise → Not Started). A stray `CANCELLED.md`
   alongside a non-cancelled status is **not** consulted and does
   **not** flip the bucket — that is an operator-resolvable
   inconsistency, not a silent override.
3. No usable state file (missing, unparseable, or no `status`
   field — legacy v1 snapshots, hand-edited shapes, brand-new
   folders) AND `CANCELLED.md` is present on disk → **Cancelled**
   via the legacy file-presence fallback. A `console.warn` fires
   so a diagnostic trail exists if a state-file write bug ever
   masks a real cancellation behind an inconsistent status.

Do **not** infer state from file presence (`activity-log.json`,
`change-log.md`) — read `session-state.json` directly via the
shared `readSessionSets` / `get_progress` helpers.

**`RESTORED.md` is audit-only.** Once a cancelled set is restored,
`CANCELLED.md` is renamed to `RESTORED.md` and the file is kept
indefinitely as the toggle history. `RESTORED.md` is *not* a separate
state — the set falls back to whichever of complete / in-progress /
not-started its `session-state.json` indicates. Subsequent re-cancels
rename `RESTORED.md` back to `CANCELLED.md` and prepend a new entry,
so the file accumulates the full history across multiple toggles.

**Out of scope for cancellation:**

- Automatic cancellation triggered by router-side signals (e.g.
  "abandon set if no commits for 90 days"). Cancel/restore is a
  pure-operator action.
- Cancellation of an individual session within a set. Cancellation
  applies to whole session sets only.
---

## Setting Up a New Session Set

### 1. Create the Directory Structure

```
docs/session-sets/<name>/
  spec.md
```

Only `spec.md` is required up front. Runtime artifacts such as
`session-state.json`, `session-events.jsonl`, `activity-log.json`,
`disposition.json`, the per-session `sN-*.md` files, and `sN-issues.json`
(only when a verification round finds issues) appear as the first
session runs. Older `SessionLog` helpers may also create
`session-reviews/` and `issue-logs/`, but new instructions should treat
those directories as legacy compatibility, not required scaffolding.

### 2. Write spec.md

The spec defines the entire body of work. The full authoring guide
lives at `docs/planning/session-set-authoring-guide.md` (slug naming,
sizing, the configuration block, deliverables, anti-patterns,
templates). Read it before authoring or modifying a spec. Required
structure:

```markdown
# <Feature Name> Spec

> **Purpose:** One-sentence description
> **Created:** YYYY-MM-DD
> **Session Set:** `docs/session-sets/<name>/`
> **Prerequisite:** What must be done before starting
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: <estimate>
requiresUAT: false       # true only for sets with human-reviewed UI/UAT checklists
requiresE2E: false       # true only for sets shipping user-visible browser behavior
# Optional — only when requiresUAT: true:
# uatStyle: ad-hoc       # ad-hoc (default, non-web) | dsl (web/Playwright)
# uatScope: per-set      # per-session | per-set
# effort: normal         # low | normal | high
```

> Rationale: <one or two sentences justifying the flags>

---

## Project Overview

Describe the goals and deliverables.

## Feature 1: <Name>

### Scope
What's included.

### Standards
Rules and conventions.

---

## Sessions

### Session 1 of N: <Title>

**Steps:**
1. Step description
2. Step description (route documentation task)
3. Step description

**Creates:** List of files created
**Touches:** List of files modified
**Ends with:** Success criteria
**Progress keys:** `session-1/step-name`, `session-1/other-step`

---

### Session 2 of N: <Title>
...
```

Key rules for the spec:
- Each session must be completable in one conversation
- Steps should be specific and actionable
- "Creates" and "Touches" sections let subsequent sessions verify prerequisites
- Progress keys are used in `log.log_step()` for tracking

### 3. Configure the AI Router

The router is configured via `ai_router/router-config.yaml`. Prompt templates
and workflow utilities live under `ai_router/prompt-templates/` and
`ai_router/utils/`. Key sections:

**Models:** Define available models with tier, pricing, and context limits.
Each model may also declare `generation_params` controlling the API-level
reasoning knobs: `effort` and `thinking` for Anthropic (Sonnet/Opus), and
`thinking_budget` (Gemini 2.5) or `thinking_level` (Gemini 3.x) for Google.
These are sent on every call, so leaving `effort` unset on Sonnet 4.6
means the API defaults to `high` — which burns tokens unnecessarily on
simple tasks. Explicitly setting `effort: medium` (or lower per task
type) is the single biggest cost lever.

```yaml
models:
  gemini-flash:
    provider: google
    model_id: gemini-2.5-flash
    tier: 1
  gemini-pro:
    provider: google
    model_id: gemini-2.5-pro
    tier: 2
  sonnet:
    provider: anthropic
    model_id: claude-sonnet-4-6
    tier: 2
  opus:
    provider: anthropic
    model_id: claude-opus-4-6
    tier: 3
```

**Tier assignments:** Map complexity tiers to models.

```yaml
routing:
  tier1_max_complexity: 30    # score <= 30 -> tier 1
  tier2_max_complexity: 65    # score 31-65 -> tier 2
  tier_assignments:
    1: gemini-flash
    2: gemini-pro      # or sonnet -- see task_type_overrides
    3: opus
  task_type_overrides:
    code-review: sonnet   # force Sonnet for code review tasks
```

**Verification:** Verifier selection is rule-based. For each routed
call, `verification.py` picks a verifier that is from a different
provider than the generator, is enabled, is enabled as a verifier,
matches the generator's tier (or one tier higher), and — among the
survivors — has the cheapest output price. Every model entry carries
`is_enabled` (generator pool) and `is_enabled_as_verifier` (verifier
pool) flags; new models join with the verifier flag off and are
promoted only after calibration data supports it.

`preferred_pairings` is an optional advisory layer: if a listed
pairing survives the rules it is used, otherwise the rules decide. The
legacy key name `cross_provider_map` is still accepted for backward
compatibility with older branches.

```yaml
verification:
  preferred_pairings:
    sonnet:       gemini-pro
    gemini-flash: gpt-5-4-mini
    gemini-pro:   gpt-5-4-mini
    opus:         gpt-5-4
    gpt-5-4-mini: sonnet
    gpt-5-4:      opus
  auto_verify_task_types:
    - code-review
    - security-review
```

**Per-task-type parameter overrides:** `task_type_params` maps each task
type to per-model parameter overrides, layered on top of each model's
`generation_params`. This is where cheap tasks like `formatting` and
`summarization` get `effort: low` and `thinking_budget: 0`, while
`architecture` and `session-verification` get deeper reasoning.

```yaml
task_type_params:
  formatting:
    sonnet:       { effort: low, thinking: { enabled: false } }
    gemini-flash: { thinking_budget: 0 }
  session-verification:
    sonnet:       { effort: high, thinking: { enabled: true, type: adaptive } }
    gemini-pro:   { thinking_budget: -1 }
```

All tuning now lives in `router-config.yaml` as of the Session 2
consolidation. The prior runtime overlay file (`router-tuning.json`)
was removed; `metrics.enabled` and `delegation.always_route_task_types`
moved into the YAML under `metrics:` and `delegation:` respectively.
To adjust depth for a run, edit the YAML directly — there is no
separate overlay file.

Precedence (low → high): model-level `generation_params` →
`task_type_params` override.

### 4. Set Environment Variables

The router requires API keys as environment variables:

```
DABBLER_ANTHROPIC_API_KEY   (for Claude Sonnet/Opus)
DABBLER_GEMINI_API_KEY      (for Gemini Flash/Pro)
DABBLER_OPENAI_API_KEY      (for GPT-5.4 and GPT-5.4 Mini)
PUSHOVER_API_KEY    (optional, for end-of-session phone notifications)
PUSHOVER_USER_KEY   (optional, for end-of-session phone notifications)
```

On Windows, set these as User environment variables. The orchestrator
instruction files include the commands to export them into the shell. The
notification helper also falls back to the Windows User/Machine environment if
the current process environment does not already contain the Pushover keys.
The Dabbler-prefixed provider variables store the normal API key values issued
by Anthropic, Google, and OpenAI; Dabbler does not distribute separate provider
keys.

### 5. Create the Python Virtual Environment

```bash
python -m venv .venv
.venv/Scripts/pip install pyyaml google-genai anthropic httpx
```

The router uses `httpx` directly — it does NOT require the `openai`,
`anthropic`, or `google-genai` SDKs at runtime (those are listed for
compatibility with other tools in the repo). OpenAI calls go through
the Responses API via plain HTTP.

---

## Executing a Session

### Trigger Phrases

The human starts a session with one of these phrases:

- **`Start the next session.`** — sequential, in the current working tree.
  The orchestrator finds the active session set via
  `find_active_session_set()` and runs the next session there.
- **`Start the next session of <slug>.`** — sequential, in the current
  working tree, but pinned to the named session set rather than
  whichever set `find_active_session_set()` would have picked.
- **`Start the next parallel session of <slug>.`** — runs the session in
  an isolated git worktree on a `session-set/<slug>` branch. The
  worktree path depends on the repo's layout:
  - **Sibling-worktrees-folder layout (canonical as of 2026-05-05,** see
    `docs/planning/repo-worktree-layout.md`**):** worktree lives at
    `~/source/repos/<repo>-worktrees/<slug>/` — a subfolder of the
    `<repo>-worktrees/` sibling container; main checkout at
    `~/source/repos/<repo>/` is unchanged.
  - **Legacy sibling-worktree layout (Option A):** worktree lives at
    `~/source/repos/<repo>-<slug>/` as a top-level sibling of the
    main repo dir.
  - **Retired bare-repo + flat-worktree layout (Option D):** worktree
    lived at `<container>/<slug>` as a sibling of `<container>/main/`;
    repos still in this layout should migrate per the recipe in
    `docs/planning/repo-worktree-layout.md`.

  Multiple parallel sessions on different sets do not contend for the
  working tree. The set's last session merges `origin/main` back into
  the session-set branch (resolving conflicts), then merges into main
  and pushes. `router-metrics.jsonl` is the predictable merge-noise
  file — expect one reconciliation commit per completed parallel set.
  After merge, the worktree is removed (see Step 8 cleanup).

Any of these may be suffixed with **`— maxout <engine>`** (e.g.,
`Start the next session of role-administration. — maxout Claude`) to
override the `ai-assignment.md` recommendations for that session and
push routing to the named engine's frontier model. "maxout" upgrades
the tier and removes cost-saving caps; **it never eliminates the
cross-provider verification step or routes verification back to the
orchestrator's own provider.** `session-verification` is always
cross-provider — that is the one constraint that survives any maxout.

### Reading the Session Set Configuration

Every spec begins with a Session Set Configuration block declaring
`requiresUAT`, `requiresE2E`, `uatStyle`, and `uatScope`. The
orchestrator reads this block as part of Step 2 and uses it to
decide which UAT/E2E gates apply for the rest of the workflow. **The orchestrator does not
re-litigate these flags during a session.** If a spec declares
`requiresUAT: false`, the workflow does not invoke
`uat-plan-generation`, does not author a checklist, and does not
block notification on UAT review — even if the work touches a UI
surface. If the human believes the flags are wrong for this set, the
correction is to update the spec (and re-run the corresponding
Step 9 reorganization review at the end), not to override at runtime.

The When-UAT-Is-Required and When-E2E-Is-Required heuristics that
inform spec authors are documented in
`docs/planning/session-set-authoring-guide.md`. This doc owns
*execution-time* behavior gated by the spec; the authoring guide
owns *which spec flags to set in the first place.*

---

> **Reference material — skip if `requiresUAT: false`.**
> The sections below (UAT Checklist Rules, DSL-driven path, Ad-hoc path,
> When UAT Is Required) only apply when the active spec declares
> `requiresUAT: true`. If your set has `requiresUAT: false`, jump directly
> to [§Step 0](#step-0-verify-api-keys-and-read-guidance).

### UAT Checklist Rule (shared preamble)

> **Applies only when the active spec declares `requiresUAT: true`.**
> Sets with `requiresUAT: false` skip this rule entirely.

When a session set includes a human-executed UAT checklist:

- Each session set gets its own checklist named
  `<session-set-slug>-uat-checklist.json`, placed inside the session set's
  folder. Do not re-use or re-run a checklist from an earlier session set.
- The checklist JSON must match the schema from
  `https://github.com/darndestdabbler/uat-checklist-editor/blob/main/checklist-schema.json`
- The human runs it through
  `https://darndestdabbler.github.io/uat-checklist-editor/`
- Review results are saved inline in the checklist JSON
- Do not create a separate empty findings scaffold just to hold future human
  review results
- After a checklist is prepared and waiting on the human, do not start a new
  session that depends on or bypasses that review unless the human explicitly
  says to do so

Every spec with `requiresUAT: true` also declares `uatStyle: "dsl"`
or `uatStyle: "ad-hoc"` (defaulting to `"ad-hoc"` if omitted). The
two paths share this preamble and diverge on the mechanical-
verification gate the orchestrator enforces before notification.

### UAT Checklist Rule — DSL-driven (`uatStyle: "dsl"`)

> **Applies only when the active spec declares `requiresUAT: true`
> AND `uatStyle: "dsl"`.** This is the path for web/browser UIs
> whose checklist compiles to Playwright tests via the
> `dabbler-uat-dsl` repo.

Before a UAT checklist is committed and the human is notified, every
functional item in the checklist must have matching E2E test coverage.
This is the procedural form of the "human UAT is not the first line of
defense" principle in `docs/planning/project-guidance.md`. **The DSL
path requires `requiresE2E: true`** — without E2E coverage there is no
mechanical floor.

**Invalid combination.** A spec declaring `uatStyle: "dsl"` together
with `requiresE2E: false` is rejected at authoring time and at Step
2 of the workflow. The orchestrator surfaces this as a configuration
error and does not silently downgrade to ad-hoc — the author must
either set `requiresE2E: true` (committing to Playwright coverage)
or switch to `uatStyle: "ad-hoc"` (which has its own mechanical
floor and does not depend on E2E). Silent downgrade would let a
DSL-intent author ship a set whose Playwright suite is missing
without an explicit decision.

Specifically:

- Every checklist item with a functional expectation (route reached,
  control visible/enabled, data persisted, grid refreshed, error shown,
  etc.) must have a Playwright test that drives the same steps with the
  same parameters and asserts the same outcome.
- Items whose expectation is purely a judgment call (aesthetic, layout
  feel, copy quality) are flagged with `IsJudgmentItem: true` in the
  checklist JSON and must include a one-sentence justification. These
  are exempt from the matching-test requirement but should still have
  a sequence-reachability test so the human is rendering judgment on a
  verified-live UI rather than debugging exceptions.
- The `uat-coverage-review` task type (see Task Types table) is the
  mechanical check: given the checklist and the Playwright file, it
  returns `VERIFIED` only when every non-judgment item has a matching
  test. Any mismatch blocks the checklist handoff.

A DSL-path checklist shipped without this coverage is a
session-closeout defect and must be rebuilt before the human is
notified.

### UAT Checklist Rule — Ad-hoc (`uatStyle: "ad-hoc"`)

> **Applies only when the active spec declares `requiresUAT: true`
> AND `uatStyle: "ad-hoc"`** (the default when `uatStyle` is omitted).
> This is the path for non-web surfaces — CLI tools, native apps,
> Microsoft Access / COM-driven apps, IDE plugins, anything Playwright
> cannot drive.

The "human UAT is not the first line of defense" principle still
holds — the mechanism for enforcing it relaxes, the principle does
not. Before the checklist is committed and the human is notified,
**every non-judgment functional checklist item must declare one of**:

- **`ProgrammaticVerification: "<reference>"`** — a one-line
  reference to the unit test, component test, data-layer assert, or
  AI exploratory check that mechanically satisfies the item. Examples:
  `"bUnit: UsersGridTests.FiltersByRoleWhenAdminSelected"`,
  `"SqlAssert: AdminUser.Restrictions.LoopbackBlocked"`, or
  `"AI exploratory check 2026-05-11: drove FormX via COM, asserted dropdown set narrows correctly"`.
- **`NoProgrammaticPathReason: "<one-sentence justification>"`** —
  used when the item genuinely has no programmatic path (e.g., a
  Microsoft Access form whose rendering quirk can only be observed
  visually by a human operator). The justification must be specific:
  "Access subform layout cannot be inspected via COM" beats "no test
  possible."

Items flagged `IsJudgmentItem: true` carry the same meaning as on
the DSL path — purely aesthetic / copy / layout-feel judgments,
exempt from the mechanical-verification requirement.

The orchestrator validates that every non-judgment functional item
has one of the two fields populated **before** notifying the human.
A mismatch blocks notification. There is no
`uat-coverage-review` route on the ad-hoc path — the gate is local
to the orchestrator (no cross-provider review of a Playwright
suite, because there is no Playwright suite).

A checklist shipped without the verification floor is a
session-closeout defect and must be rebuilt before the human is
notified.

### When UAT Is Required (authoring-time decision)

> The full heuristic for whether a spec should declare `requiresUAT:
> true` (and which `uatStyle` to pick) lives in
> `docs/planning/session-set-authoring-guide.md` → *When UAT is
> required*. **Spec authors decide; the orchestrator obeys.** This
> section summarizes the rule for orchestrator reference.

A session set should declare `requiresUAT: true` whenever its work
changes the behavior of a UI surface or a service the UI talks to
directly: UI pages/components/nav/forms/grids/dialogs (e.g., Blazor, React,
elements, cross-page interaction patterns, API endpoints the UI
consumes, authorization rules the UI surfaces, browser-visible
workflows. Pure refactors, internal-only library/router/test/doc
work, and infrastructure changes typically declare `requiresUAT:
false`.

When the active spec declares `requiresUAT: true`, the author also
picks `uatStyle`:

- `uatStyle: "dsl"` — web/browser UI changes where the checklist
  compiles to Playwright via `dabbler-uat-dsl`. The DSL path
  requires `requiresE2E: true` too; the Playwright suite is the
  mechanical floor.
- `uatStyle: "ad-hoc"` — non-web UI (CLI, native, Access, COM-driven
  apps, IDE plugins, etc.) where Playwright is not applicable. Each
  functional item declares `ProgrammaticVerification` or
  `NoProgrammaticPathReason`.
- **Default when omitted:** `"ad-hoc"`. Per universal-core /
  gated-extensions: the lower-scaffolding path is the default; DSL
  is opted into explicitly.

Mixed surfaces (a set whose work spans web and non-web) should
split into sibling sessions or sibling sets — that is the cleanest
path. If splitting is genuinely impractical and the set must
combine surfaces into one checklist, declare `uatStyle: "ad-hoc"`
for the whole set: the DSL path requires Playwright parity for
every non-judgment functional item (no per-item exceptions), so
a single-`uatStyle: "dsl"` set cannot accommodate non-browser
items. The ad-hoc gate gracefully covers both surfaces in one
checklist: browser-driven items declare a `ProgrammaticVerification`
referencing the relevant Playwright test (if any exists); non-browser
items declare a `ProgrammaticVerification` referencing the unit /
component / data-layer / AI-exploratory check that satisfies them,
or a `NoProgrammaticPathReason` when no programmatic path applies.

When the active spec declares `requiresUAT: true`, the checklist is
built **during this session set** — not deferred to a later "UAT
session set." Deferring UAT across session sets breaks the
traceability between a change and its human sign-off.

When the active spec declares `requiresUAT: false`, the orchestrator
does not generate a checklist, does not invoke `uat-plan-generation`
or `uat-coverage-review`, and Rule #9 (pending UAT blocking) does not
apply.

When the spec declares `requiresE2E: true` but `requiresUAT: false`,
the rule degenerates to "behavioral changes ship with E2E coverage" —
the orchestrator confirms via test discovery that the new/changed
behavior has matching tests before notifying. No UAT checklist is
involved.

### Step 0: Verify API Keys And Read Guidance

Before doing anything else:

1. Read `docs/planning/project-guidance.md`
2. Read `docs/planning/lessons-learned.md` (its **active** tier only —
   do **not** read `docs/planning/lessons-archive.md`, which is never
   auto-loaded; search it on demand with
   `python -m ai_router.guidance_search --archive`)
3. Read `docs/planning/session-set-authoring-guide.md`
4. Then load keys from the environment and confirm all required keys
  are present (`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, and optionally `PUSHOVER_API_KEY` /
  `PUSHOVER_USER_KEY` if
   notifications are configured)

If keys are missing, stop and tell the human.

> **"No module named ai_router" is NOT a missing-keys problem.** Before
> stopping for "missing keys / missing router", confirm you are invoking
> the **venv interpreter**, not a bare `python`. A bare `python` often
> resolves to a system interpreter that has no `ai_router` installed; when
> a config-only `ai_router/` folder is in the cwd it shadows as an empty
> namespace package, so `python -m ai_router.<x>` fails with
> `No module named ai_router.<x>`. That is an *interpreter / installation*
> problem — the keys can be perfectly present. Always run the router CLIs
> through the workspace venv:
>
> ```bash
> # Windows
> .venv/Scripts/python.exe -m ai_router.<module> …
> # POSIX
> .venv/bin/python -m ai_router.<module> …
> ```
>
> Only stop-and-ask-the-human for missing keys once the **venv
> interpreter** confirms a key is genuinely absent (e.g. a key-presence
> check run with `.venv/Scripts/python.exe` reports it missing).

### Step 1: Identify the Active Session Set and Register Session Start

The `find_active_session_set()` function reads the `status` field in
each set's `session-state.json` (see **§ Session-Set Lifecycle and
State File** above):
- `status: "in-progress"` = active — pick this set (or the named slug)
- `status: "not-started"` = use this if no in-progress set exists
- `status: "complete"` or `status: "cancelled"` = skip

Do **not** infer state from file presence. The old heuristic
(`activity-log.json` present but no `change-log.md` = in-progress;
`CANCELLED.md` presence flips to skipped) is retired —
`session-state.json` is the canonical signal. The marker
fallback (described under "Cancelling and restoring a session
set" above) fires only when no usable state file exists, and is
not a routine path.

If the trigger phrase named a specific slug (e.g., "Start the next
session of `<slug>`"), use that slug directly rather than calling
`find_active_session_set()`. For a parallel-trigger phrase, switch
into the session-set worktree before proceeding —
`../<repo>-worktrees/<slug>` under the canonical sibling-worktrees-
folder layout, `../<repo>-<slug>` under the legacy sibling-worktree
layout, or `<container>/<slug>` for repos still on the retired bare-
repo + flat-worktree layout. See
`docs/planning/repo-worktree-layout.md`.

#### Schema-drift guard (Set 053 lifecycle advisory)

The schema-drift warning **rides the router CLI lifecycle**. Every
orchestrator (Claude, GitHub Copilot, Codex, a human) runs
`start_session` / `close_session` at every session boundary, on every
host (GitHub, Azure DevOps, none), so `summarize_drift` reaches everyone
with **no editor hook, no CI job, and no git hook** required:

1. `start_session` registers the session, then prints a one-line drift
   advisory to stderr after the boundary write.
2. `close_session` emits the same advisory as a soft note.

The advisory reads:

```
[dabbler] N session-set(s) below the current schema v4. Run: python -m ai_router.check_migrations --verbose
```

Clean repos produce no output. The advisory is **non-blocking and
fail-open**: a scan error is swallowed silently and the command's exit
status is never changed by drift.

If you see this message: run `python -m ai_router.check_migrations
--verbose` to see the exact sets and remediation steps. Old-schema sets
are still readable (the `normalize_to_v4_shape` shim handles v2/v3
transparently), so the warning is advisory — existing work is not at
risk. `check_migrations` remains the optional, richer manual tool, and
anyone who wants a hard CI gate can wire it in themselves — it is never
required. This is why the guard does not depend on which editor or CI
system a consumer happens to use.

> **Historical note (Set 050 → retired in Set 051 S3).** Set 050
> originally shipped this drift scan as a pure-JS step chained into a
> Claude-only `SessionStart` hook (installed via the
> `dabbler.installOrchestratorHook.claudeCode` command +
> `scripts/claude-session-start-invoker.js`). Set 053 moved the same
> advisory into the router lifecycle above, which fires for **every**
> orchestrator rather than Claude Code only — making the hook a
> redundant, divergence-prone duplicate. Set 051 S3 retired the hook,
> its installer command, and the invoker script. Operators who installed
> the hook should remove the dabbler `SessionStart` entries from
> `~/.claude/settings.json`; see
> [`docs/cross-repo-hook-retirement-notice.md`](cross-repo-hook-retirement-notice.md).

#### State first, work second (Set 022)

The orchestrator declares "session N is in flight" on disk **before
any other work in the session**. This is the prevention layer that
keeps the Session Set Explorer's bucket transitions clean: the set
moves to **In Progress** (or advances its fraction between sessions)
the moment the boundary write lands, not whenever the first
activity-log entry happens to flush. The v0.13.11 defensive guards
remain as recovery defense-in-depth; the start-of-session boundary
write is what keeps them from firing in normal operation.

The boundary write maintains the state invariant (see
[`docs/session-state-schema.md`](session-state-schema.md) for the
canonical statement):

```
currentSession not in completedSessions[]                  → currentSession is in flight
currentSession in completedSessions[] AND status="in-progress"  → between sessions
status = "complete"                                        → set done
```

Two tier-symmetric paths produce the same shape on disk:

**Full tier (router-driven).** Run the CLI as the first action of the
session, then proceed to Step 2:

```bash
.venv/Scripts/python.exe -m ai_router.start_session \
    --session-set-dir docs/session-sets/<slug> \
    --engine claude-code \
    --provider anthropic \
    --model claude-opus-4-7 \
    --effort medium
```

The CLI infers the next session via
`compute_effective_completed_sessions(<dir>)` (reads
`completedSessions[]`, falls back to the events ledger, then to the
legacy heuristic), writes `session-state.json` (`currentSession`,
`status: "in-progress"`, `lifecycleState: "work_in_progress"`,
`startedAt` if previously null, clears `completedAt` and
`verificationVerdict`), and appends one `work_started` event to
`session-events.jsonl`. The call is **idempotent** — re-running on the
same in-flight session is a no-op (the event ledger dedupes
`work_started` and the snapshot fields are already correct), so a
context-reset re-entry is safe. The CLI **refuses to skip ahead**
(`exit 3` boundary violation) if session N is still open and the
caller asks for N+1, and refuses to re-open a session already in
`completedSessions[]`. Activity-log writing stays as it was — the
first real work step adds the first entry; the CLI itself does not
touch `activity-log.json`.

Pseudo-code for the orchestrator's automation path:

```python
import subprocess, sys

session_set = "docs/session-sets/<slug>"
result = subprocess.run(
    [sys.executable, "-m", "ai_router.start_session",
     "--session-set-dir", session_set,
     "--engine", "claude-code",
     "--provider", "anthropic",
     "--model", "claude-opus-4-7",
     "--effort", "medium"],
    capture_output=True, text=True,
)
if result.returncode != 0:
    # Exit 2 = usage error; exit 3 = boundary violation (e.g., a
    # prior session is still open and must be closed first).
    raise SystemExit(result.stderr or result.stdout)
# Now proceed to Step 2 (read the spec) — state is in flight on disk.
```

**Lightweight tier (hand-maintained).** No router runs. The
orchestrator (or human) hand-writes the same fields to
`session-state.json` before any other work in the session:

```json
{
  "schemaVersion": 2,
  "sessionSetName": "<slug>",
  "currentSession": <N>,
  "totalSessions": <N_total>,
  "status": "in-progress",
  "lifecycleState": "work_in_progress",
  "startedAt": "<existing value, or now if null>",
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": {
    "engine": "<engine>",
    "provider": "<provider>",
    "model": "<model>",
    "effort": "<low|medium|high|unknown>"
  },
  "completedSessions": [<sessions closed so far, sorted, unique>]
}
```

The Lightweight branch has no events ledger; `completedSessions[]` is
the authoritative count signal and must be maintained by hand on
every session boundary. See `docs/session-state-schema.md` for the
required field shapes and the worked examples; the Lightweight tier
exists exactly so projects that opt out of the router still get
clean tree-view transitions.

`session-state.json` is the single source of truth for in-progress
detection by external tooling. It is updated again at Step 8 to flip
`completedSessions[]` (every close) and on the final session also
`status: "complete"` + `lifecycleState: "closed"`. Do not rely on
activity-log presence for in-progress signaling — `start_session`
(Full) or the hand-write above (Lightweight) is what makes the set
visibly active.

### Step 2: Read the Spec and the Configuration Block

Open `spec.md` and find:

1. **The Session Set Configuration block** — `requiresUAT`,
   `requiresE2E`, `uatScope`. Cache these values for the rest of the
   session. They govern which UAT/E2E gates apply at later steps.
2. **The plan for the current session number** — the Steps, Creates,
   Touches, Ends-with, and Progress-keys for this session.

If the spec is missing the configuration block (older sets), treat
all flags as `false` and proceed; the backfill script
(`tools/backfill_ai_assignment.py`) is responsible for inserting a
proposed config block on the next session start.

### Step 3: Verify Prerequisites

Confirm that files listed in prior sessions' "Creates" and "Touches" exist.

### Step 3.5: Author or Update `ai-assignment.md`

`ai-assignment.md` lives at the root of the session-set folder
alongside `spec.md`. It is a per-session ledger of the cheapest
capable AI for each step, plus a forward-looking recommendation for
the next session.

**Mandatory rule: the orchestrator never self-opines on which model
could have been cheaper.** Always route the analysis through
`route(task_type="analysis")` so the recommendation is independent
of the orchestrator's own model.

**On Session 1 of a new set:**

```python
result = route(
    content=spec_excerpt + "\n\n" + per_session_step_lists,
    task_type="analysis",
    context="Author ai-assignment.md per the schema in "
            "docs/ai-led-session-workflow.md Step 3.5.",
    session_set=str(SESSION_SET),
    session_number=next_session,
)
# write docs/session-sets/<slug>/ai-assignment.md
```

**On Sessions 2..N:** read the existing `ai-assignment.md`, append
the actuals for the prior session (orchestrator used, total routed
cost, deviations from recommendation, notes for next-session
calibration), and route a fresh recommendation for Session N+1.

**Schema (each session block):**

```markdown
## Session N: <Title>

### Recommended orchestrator
<engine> <model> @ effort=<low|medium|high|max>

### Rationale
<2 sentences — why this engine for this session's mix of work>

### Estimated routed cost
<qualitative — "low" / "moderate" / "high">

| Step | Action | Routing Decision |
|------|--------|------------------|
| ...  | ...    | ...              |

### Actuals (filled after the session)
- Orchestrator used: <engine + model + effort>
- Total routed cost: $X.XX
- Deviations from recommendation: <any>
- Notes for next-session calibration: <any>

**Next-session orchestrator recommendation (Session N+1):**
<engine> <model> @ effort=<...>
Rationale: <one sentence>
```

If the spec has the maxout suffix in play for this session, note that
in the actuals — the human's window-budget override is the reason
for any deviation from the recommendation.

### Step 4: Execute Each Step

For each step in the session plan:

**File work** — create or edit files directly:
```python
log.log_step(
    session_number=N,
    step_number=step_num,
    step_key="session-N/step-name",
    description="What was done",
    status="complete",
    api_calls=[]
)
```

**Reasoning tasks** — delegate to the router:
```python
from ai_router import route

result = route(
    content="<the text to analyze>",
    task_type="code-review",       # or documentation, analysis, etc.
    context="<optional background>",
    complexity_hint=None,          # optional 1-100 override
    session_set=str(SESSION_SET),  # enables per-set metrics grouping
    session_number=N,              # enables per-session metrics grouping
)

# Use result.content, then log:
log.log_step(N, step_num, "session-N/step-name", "description", "complete", [{
    "model": result.model_name,
    "taskType": "code-review",
    "inputTokens": result.input_tokens,
    "outputTokens": result.output_tokens,
    "costUsd": result.cost_usd
}])
```

During execution:

- if the human gives a decision or instruction that looks durable enough to
  guide future sessions or future projects, ask whether it should be added to
  `docs/planning/project-guidance.md`
- if a failure or avoidable friction suggests a reusable tactic, recommend an
  update to `docs/planning/lessons-learned.md`

### Step 5: Build and Test

```bash
dotnet build
dotnet test
```

Log the result with `log.log_step()`.

### Step 6: End-of-Session Verification (GATED — Set 068 DEMOTE)

**The orchestrator must not verify its own work.** The `route()` function
dispatches to a different AI provider for independent review.

> **Note (Set 068 DEMOTE — CUT OVER as of S6).** This step is no longer run on
> *every* session. The Set 068 S4 decision demoted per-session routed
> verification to a **blast-radius / coupling-gated** check (see
> *Verification-surface policy* under Key Concepts); the S5 contract-test gate —
> the deterministic replacement floor the transition guard waited on — is now
> live, so S6 executed the cut-over. **Run this step when, and only when, the
> deterministic gate trips on the session diff:**
>
> ```bash
> python -m ai_router.routed_gate $(git diff --name-only <base>...HEAD)
> # exit 0 = REQUIRED (run this step); exit 10 = may SKIP. Add
> # --contract-uncovered / --high-blast / --post-failed-loop to RAISE to
> # REQUIRED for the facts the diff cannot show (those flags only raise, never
> # lower). --json prints the verdict + the triggers that fired.
> ```
>
> The predicate fires on a multi-file/multi-module diff, a public
> API/schema/contract change, a cross-module refactor, a build/CI/config change,
> a surface with no contract probe, or a high-blast/post-failed-loop session
> (`ai_router/routed_gate.py`). A small, single-module, probe-covered diff
> bypasses the routed call — its safety net is the end-of-set path-aware critique
> + the contract-test gate. When the gate trips, run this step **exactly as
> written below**; record the gate verdict (and the triggers) in the session log
> either way, so a skipped routed call is an auditable decision, not a silent
> omission. The verifier still routes to a **different provider** than the
> orchestrator.

When this step terminates with a `VERIFIED` verdict and
`disposition.json` reports `status: "completed"`, the orchestration
layer routes a new turn with `task_type="session-close-out"` so the
close-out agent reads `ai_router/docs/close-out.md` at the moment
the instructions are needed. Hook failures (provider outage, transient
lock contention) are non-fatal; the reconciler sweeps stranded
sessions on the next orchestrator startup and re-runs close-out.

1. Collect all files created or modified during the session.
2. Build a verification prompt with: spec excerpt + file contents +
   build results. **The prompt must include the structured JSON
   response schema** (defined in
   `ai_router/prompt-templates/verification.md`) so the verifier
   returns `{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}`
   rather than a bare paragraph. Bare-paragraph verdicts have caused
   parser failures and silent ISSUES_FOUND-misclassified-as-VERIFIED
   regressions; the schema requirement closes that hole.
3. Execute:
   ```python
   result = route(
       content=verification_prompt,
       task_type="session-verification",
       complexity_hint=70,
       session_set=str(SESSION_SET),
       session_number=N,
   )
   review_path = SESSION_SET / f"s{N}-verification.md"
   review_path.write_text(result.content, encoding="utf-8")
   ```
4. **Never edit the saved review file.** If verification is retried,
   save each follow-up pass as a sibling root file such as
   `sN-verification-round-2.md`, not under `session-reviews/`.
5. **Persist the structured findings if the round is not `VERIFIED`.**
   The verifier also returns a structured `issues` list. When the
   verdict is `ISSUES_FOUND` (the list is non-empty), write that list to
   the root-level `sN-issues.json` artifact (round 1) or
   `sN-issues-round-<M>.json` (later findings-bearing retries) using the
   envelope in [`docs/session-issues-schema.md`](session-issues-schema.md).
   A `VERIFIED` round writes **no** issue file — the clean result is
   already preserved in `sN-verification.md`. This artifact has no
   runtime reader; it is durable persistence for later analysis only.
   Do not revive `issue-logs/`.
6. Log the verification step.
7. **Record the verdict in `disposition.json`.** Set
   `verification_verdict` to the verifier's `"VERIFIED"` or
   `"ISSUES_FOUND"` value before authoring the rest of the
   disposition. `close_session` reads this via `resolve_close_verdict()`
   and writes it to `session-state.json`'s per-session
   `verificationVerdict`. On the `api` path, `close_session` also has
   a backward-compat status-derived fallback for older dispositions
   that omit this field (`completed`→`"VERIFIED"`, `failed`→`"ISSUES_FOUND"`),
   but setting the field explicitly is the recommended practice and the
   only path that preserves the exact verifier token.

**Two-attempt verifier fallback.** If the first-choice verifier fails
at the HTTPS layer (provider outage, timeout, garbled response), the
router excludes that provider and re-picks once. The fallback call is
recorded in metrics with `verifier_fallback: true`. If the second
attempt also fails, follow the verifier-failure escalation ladder
(retry same provider once, fall back to remaining cross-provider
verifier, decompose the prompt, verify against description-of-work,
log a `Major` issue and proceed to commit). Do not skip commit just
because verification is provider-broken — the work is preserved in
git for human review and the next session can re-attempt.

#### Materiality and the re-verify loop discipline (Set 071)

The verifier runs at its **strongest adversarial framing** (devil's advocate,
assume the work is flawed — the Set 070 steelman-push framing the reviewer
templates carry, never to be weakened: **L-069-2**). Strong framing without a
materiality bar manufactures **Minor / false-positive** findings and the
re-verify loop then **churns rounds on them** (the canonical case: three rounds
spent on `pytest` vs `python -m pytest -v`, a distinction with no behavioural
difference). Set 071 adds a materiality bar to the templates (the "so what?"
gate) **and** the loop discipline below, so the loop keeps its real-defect
ceiling without spinning on nits. This discipline governs the re-verify loop on
**both** tiers — the routed `api` path (Step 7's *"Re-run verification (max 2
retries)"*) and the Lightweight Mode-B verify→remediate loop (its bounded-round
item points here).

1. **Blocking is severity-anchored — and is NOT the bare verdict token.** Decide
   whether a verification result opens / continues a remediation round with
   `ai_router.verification.is_blocking_verdict(verdict, issues)` (or
   `classify_blocking(...)` for the blocking-vs-nit split + a log reason), **not**
   by switching on the `VERIFIED` / `ISSUES_FOUND` token alone. A round is
   justified **only** by **≥1 Critical or Major** finding. A **Minor-only /
   nits-only** result is **effectively VERIFIED for the loop**: it is recorded
   (raw output in `sN-verification*.md`; nits noted) but opens **no** remediation
   round. The binary verdict grammar is preserved (no third token — Set 071
   operator decision, cross-provider-confirmed); blocking-ness is a derived,
   first-class predicate instead. The predicate is **surface-agnostic** — it
   consumes severity-bearing findings from either surface (the push surface via
   `parse_verification_response`, the path-aware pull surface via
   `pull_verifier.Finding`, which carries its own structured `severity`), so the
   same blocking decision governs both reviewer surfaces.
2. **Anti-laundering — when in doubt, escalate.** An `ISSUES_FOUND` result whose
   findings have **unknown / missing severity**, or that parsed to **no** findings,
   is treated as **blocking** by `is_blocking_verdict`. Materiality lowers the
   noise floor; it must never launder a real Major into an ignored Minor. The
   merge-impact anchor in the templates (Major = *would change a reasonable
   reviewer's merge decision*) plus the plausible-path-to-harm escalation are what
   keep the demotion honest.
3. **A round continues only on new or unresolved Critical/Major** — tracked by a
   **cross-round issue ledger**. Each blocking finding is given a stable
   `issueId`; each round, `reconcile_issue_ledger(prior_status, current_blocker_ids)`
   marks prior blockers `RESOLVED` (absent now) or `UNRESOLVED` (still present) and
   flags any **resurrection** — an id that was `RESOLVED` and reappears. **A
   settled point is never re-opened under fresh wording:** the orchestrator gives a
   rephrased-but-same point the **same** ledger id (so it is recognised as settled
   and the resurrection is refused), while a genuinely new finding gets a new id
   and faces the materiality gate on its own merits. The keying is on the stable
   id, not free text, so the no-reopen rule is deterministic; recognising that two
   differently-worded findings are the *same* point is the orchestrator's judgment.
4. **The bounded-round bound is unchanged; this only narrows what counts as a
   round-justifying finding.** The existing **1–2 automatic / 3+ human** rule still
   holds (and a human-stop disposition or an unfixed Critical/Major still stops to
   a human). Set 071 does not add rounds — it removes the *Minor-only* and
   *resurrected-nit* rounds that should never have opened.

#### Lightweight tier — verification (per-set; two modes)

When the set's spec.md declares `tier: "lightweight"` (Set 048 §3.6),
or `--no-router` mode is active via CLI flag / `DABBLER_NO_ROUTER=1`
env var, there is no metered router call to verify the work. Lightweight
verification is **per-set, not per-session** (Set 057 L1): it runs
**once, after the implementation (work) sessions complete**, never after
each work session. AI-led sets usually finish within a day or an hour, so
the rework risk of verifying once at the end is low, and per-set keeps the
state machine and the operator's burden small. Every Lightweight surface
below — both modes, the bounded-round rules, and the close-out gate —
follows the per-set rule consistently.

How verification happens is governed by one durable, opt-in choice,
**`verificationMode`** (Set 057 Q5):

| `verificationMode` | What it means |
|---|---|
| `out-of-band-or-none` (**default**) | Mode A below: copyable review prompts pasted into a second assistant, verdict recorded by hand in `external-verification.md`. Preserves the pre-Set-057 flow. |
| `dedicated-sessions` | Mode B below: a structured, blessed **verification session** on a different engine **or a different model provider** (Set 077), an optional **remediation session** when issues are found, a bounded re-verification loop, and a content-aware close-out gate. |

**Capturing the choice (once, at set start).** The durable record is a
single `activity-log.json` entry (`kind: "verification_mode"`), written
once at the start of the set — the same Set-048 `suggestion_disposition`
pattern, under its own `kind` so it never collides with the UAT/E2E
choice. Every later step reads it back via
`dedicated_verification.read_verification_mode(...)`. Three ways to set
it, in precedence order:

- `python -m ai_router.start_session … --verification-mode
  dedicated-sessions` — an explicit operator choice; always recorded.
- A `verificationMode:` field in spec.md's Session Set Configuration
  block — **seeds** the default and is recorded automatically at the
  first `start_session`, but only when no choice has been recorded yet
  (it never clobbers a later explicit choice).
- Nothing — the default `out-of-band-or-none` applies implicitly and
  nothing is recorded. The feature is strictly opt-in.

`verificationMode` is **not** a new persisted workflow field beyond that
log entry, and the workflow states below are **derived**, never stored
(Set 057 Q3; see "Derived workflow states").

**Sanctioned Mode A → Mode B transition (Set 062).** The capture above
is immutable — but a completed Mode-A set may still opt in to dedicated
verification through one blessed path:

```
python -m ai_router.change_verification_mode docs/session-sets/<slug>
```

The writer appends a **superseding** `kind: "verification_mode_change"`
record to `activity-log.json`, and the mode-resolution read path
(`dedicated_verification.read_verification_mode`) honors the latest
record of either kind — so the Q6 close-out gate, the seven-state
derivation, and the content-aware validator all follow the transition.
The locked rationale: **A→B is purely additive** — work sessions execute
identically under both modes; the mode only governs whether typed
sessions are appended afterward — so the transition does not violate the
reason the Set 057 capture is immutable, but it must be **recorded, not
snuck past** the capture (a spec-seed edit alone is ignored by Python
and honored only by the Explorer — exactly the silent drift the blessed
writer exists to prevent). The gates, all fail-loud and checked before
any write:

- the set is **Lightweight** (the mode machinery is inert on Full);
- the effective recorded mode is **`out-of-band-or-none`**;
- **no `type: verification`/`remediation` session** exists in the ledger;
- **no session is in flight**;
- the target is **`dedicated-sessions` only** — **B→A is refused**,
  always (the not-started spec-seed rewrite is the only sanctioned B→A
  surface, and only while no activity-log record exists).

The Session Set Explorer's `Set Up Dedicated Verification…` action on a
**completed** Mode-A row runs this writer (and only on writer success
aligns the spec seed and copies the verification kickoff prompt); on a
**not-started** row the same action rewrites the spec seed instead (no
durable record exists yet, so the seed is still the authority);
`in-progress` sets are deliberately excluded. After a sanctioned
transition, `start_session --type verification` works immediately —
the typed-session writers never read the mode record (audited
empirically in Set 062 S3; the record's runtime effect is the close
gate, the derived states, and the validator).

---

##### Mode A — `out-of-band-or-none`: copyable review prompts

This is the default and the pre-Set-057 Lightweight flow. Step 6 changes
shape as follows:

1. The orchestrator does NOT call `route(task_type="session-verification")`.
   `close_session --no-router` skips the routed call entirely and
   records `verificationVerdict: null` for the session (the verdict
   field is strictly for the pass/fail outcome; method provenance
   stays in `verification_method` and the attestation event).
2. Instead, the orchestrator triggers one of the copyable-review-prompt
   commands shipped in the Dabbler extension (Set 048 §3.2). Each places
   a path-reference prompt on the clipboard (naming the spec, activity
   log, and — if present — change log; NEVER file contents). The operator
   pastes it into a **different** AI assistant (Claude, a GPT-based tool,
   Gemini, Cline, Cursor) and gets back a free-form review verdict.

   **How to invoke them (this is the part that trips people up).** These
   commands are **not usable from the Command Palette** — the handlers
   no-op without a session-set row argument. Access them only via the
   Dabbler **"Session Sets"** view: click the **Dabbler AI Orchestration**
   icon in the Activity Bar (NOT the file Explorer), **right-click the
   set's row**, and pick from the **`Copy Prompt ▸`** submenu. The view is
   a webview, so the "right-click" surfaces a QuickPick dropdown rather
   than a native context menu. Which entry is offered depends on the set's
   lifecycle state:

   | `Copy Prompt ▸` entry | Command id | Available when |
   |---|---|---|
   | Evaluate Specification | `dabbler.copySpecReviewPrompt` | always |
   | Evaluate Most Recent Session | `dabbler.copySessionAccomplishmentsPrompt` | ≥1 session complete |
   | Evaluate Session Set | `dabbler.copySetAccomplishmentsPrompt` | **set status = `complete`** |
   | Start Next Session | `dabbler.copyStartNextSessionPrompt` | set in-flight |
   | Start New Parallel Session | `dabbler.copyStartNextParallelSessionPrompt` | set in-flight |

   So a **set-level** review prompt only appears once the whole set is
   `complete` — on Lightweight there is no `close_session` writer, so the
   orchestrator must hand-flip the final session's and the set's
   top-level `status` to `complete` first (the set row then shows N/N).
   Mid-set, use **Evaluate Most Recent Session** instead.

   - The reviewing assistant MUST be path-aware (it reads files
     itself rather than receiving them inline). Path-aware assistants
     include Claude Code, Codex, Cline, Cursor, and any agent with
     file-reading tools.
3. The operator pastes the verdict back into
   `docs/session-sets/<slug>/external-verification.md` for the audit
   trail. The Dabbler extension's `dabbler.openExternalVerificationDoc`
   Command Palette command opens or creates this file. The file is
   free-form text — no templated header.
4. `close_session --no-router` runs a soft gate on
   `external-verification.md`: if the file is absent and the session
   is in-progress, the close-out prints a warning and (in interactive
   mode) prompts `Continue closing session without verification
   artifact? [y/N]`. Non-interactive runs and `--accept-suggestions`
   force-bypass the prompt. The gate is **soft** — operator can
   answer "yes" and proceed.
5. Repo-specific review criteria embedded into the copyable prompt
   live at `docs/review-criteria/{spec,session,set}.md`. Each is
   optional; missing files fall back to the extension's default
   English instructions.

The Lightweight path preserves cross-provider verification at a cost
of operator time rather than dollars. It's the right tradeoff for
projects that already have a second AI subscription, for volunteer
or open-source work, or for repos where API spend is constrained.

---

##### Mode B — `dedicated-sessions`: typed verification & remediation

When `verificationMode == dedicated-sessions`, verification and any
remediation are run as **typed sessions** appended to the set's
`sessions[]` ledger — `type: verification` and `type: remediation`
(Set 057 Q2). The `type` field defaults to `work` and is absent on every
existing and Full-tier entry, so this is additive and
backward-compatible. Typed sessions are created **only** through the
blessed writers (never freehand), so their structure and placement are
identical every time, and a content-aware close-out gate confirms the
path actually ran (Set 057 L3).

**Typed sessions take their step list from this section, not from
spec.md.** The authored spec session count is fixed; verification and
remediation sessions are *runtime* additions beyond the plan, so they
have no `### Session N` heading to read. `start_session --type …` prints
an announcement banner pointing back here. The generic procedure for any
typed session is:

1. **Read the latest findings.** For a remediation session, read the most
   recent `sN-issues.json` (the envelope the verification session seeded).
   For a verification session, read the spec, the activity log, and the
   work produced since the last verified point.
2. **Do the typed work.** Verify (review the work and produce a verdict +
   structured findings) or remediate (resolve each open finding).
3. **Record the outcome** in the structured files (verdict on the
   session record; dispositions on the issues envelope), then close /
   hand off per the rules below.

**The flow.**

1. **Start the verification session — on a different engine or a
   different model provider.** After the work sessions are complete, run:

   ```
   python -m ai_router.start_session --session-set-dir docs/session-sets/<slug> \
       --type verification --engine <other-engine> --provider <other-provider>
   ```

   The blessed writer (`register_typed_session_start`) appends a
   `type: verification` entry, marks it in-progress, and grows the runtime
   `totalSessions` by one (Q1: structured files only — `spec.md` is never
   touched). The verification session **must differ from every
   implementation session by engine or by model provider** (Set 077 —
   cross-provider means *provider*, not IDE); the close-out gate enforces
   this, and `start_session --type verification` **refuses at start**
   (before any write) when the declared `(engine, provider)` pair could
   not possibly pass that gate, printing the sanctioned pattern below.

   **The sanctioned single-engine pattern (Copilot-locked shops).** A
   team whose every session runs under one IDE engine satisfies the
   cross-provider property by switching the *model provider*: open a
   **second chat with the model picker set to a different provider**
   than the one that did the work, and declare it honestly —
   `--engine copilot --provider openai` verifying work done under
   `--engine copilot --provider anthropic`. Same engine + same provider
   still fails. **Missing data fails closed:** a verification session
   with no recorded `--provider` cannot satisfy the provider arm, and
   work sessions recorded without `--provider` (all pre-Set-077 history)
   cannot anchor it either — for those legacy baselines the
   engine-difference arm is the only accepted path, so either verify on
   a different engine or record providers on the work sessions'
   per-session orchestrator blocks. Requires `dabbler-ai-router`
   >= 0.27.0 (older routers accept the doomed start silently and only
   the close gate catches it).

2. **Verify.** The verifier reviews the work and returns a verdict.
   - **VERIFIED** → there is nothing to remediate. Close the set: commit,
     then run `close_session` (Lightweight: `--no-router`). The Q6 gate
     (below) confirms a cross-provider (engine- or provider-differing)
     verification session is what is being closed, and the set finalizes.
   - **ISSUES_FOUND** → seed the findings envelope and hand off to a
     remediation session (step 3).

3. **Seed findings, then hand off to remediation.** Write the structured
   findings with `dedicated_verification.seed_issues_envelope(...)` (round
   1 → `s<N>-issues.json`; later rounds →
   `s<N>-issues-round-<M>.json`). On a verifier-created **open** issue the
   Lightweight flow requires `issueId`, `issueType`
   (`deterministic-defect | contingent-risk | standards-departure |
   missing-context`), and `verificationMethod` (`suggestedTestOrCheck` is
   optional; `description` is already required). Then perform the
   **hand-off close** through the blessed writer — never by hand-editing
   `session-state.json`:

   ```
   python -m ai_router.start_session --session-set-dir docs/session-sets/<slug> \
       --type remediation --handoff --handoff-verdict ISSUES_FOUND \
       --engine <work-engine> --provider <work-provider>
   ```

   `--handoff` (backed by `register_typed_session_handoff`) marks the
   verification session complete **and** opens the remediation session
   in-progress in one atomic write. This is required because a non-terminal
   verification close would otherwise leave `sessions[]` all-complete while
   the set is still in-progress — which the session-state invariant rejects,
   and which `close_session` would mis-read as a set-terminal close. Always
   use the writer (not a freehand edit): it is what keeps every typed
   session structurally identical and on a sanctioned path (Set 057 L3/Q1),
   and the same CLI is the engine-agnostic entry point for Copilot / Codex /
   Gemini flows that cannot import the Python helper.

4. **Remediate — evaluate the verification method first.** For each
   finding, the remediation session first checks the finding's
   `verificationMethod` / `suggestedTestOrCheck`: confirm the issue
   actually reproduces before changing code. Then resolve it and record a
   `resolution_status` from the locked enum (Set 057 Q2):

   | `resolution_status` | Closes the finding? |
   |---|---|
   | `fixed` | yes — code/doc changed; the fix must be **re-verified** |
   | `not-reproducible` | yes — terminal, no re-verify needed |
   | `accepted-risk` | yes — terminal |
   | `accepted-consequence` | yes — terminal |
   | `needs-more-context` | no — **stops to a human** |
   | `escalate-human` | no — **stops to a human** |
   | `advisory-disagreement` | no — a dispute; **stops to a human** (the orchestrator declined a finding; humans adjudicate — see "Disagreement With A Verifier Finding") |

   The enum is validator-enforced for spelling when present, but its
   semantics stay advisory — no runtime gate reads the value.

5. **Re-verify only after real changes, and keep later rounds narrow.**
   - If **anything was `fixed`**, hand off back to a new verification
     session (`start_session --type verification --handoff --engine
     <other-engine> --provider <other-provider>`, backed by
     `register_typed_session_handoff`; the same engine-or-provider rule
     and start-time refusal apply to the handoff) to
     re-verify the fixes. Re-verification rounds **stay narrow** — they
     confirm the specific fixes and look for regressions they introduce,
     not a fresh full review.
   - If **no finding was `fixed`** and every finding is terminally
     dispositioned (`not-reproducible` / `accepted-risk` /
     `accepted-consequence`), there is nothing to re-verify: close the set
     as dispositioned (commit + `close_session`).
   - Never re-verify when nothing changed — a re-verify with no fix is
     wasted work and muddies the round count.

6. **Bounded rounds (1–2 automatic, 3+ human).** The verify→remediate
   loop runs **at most two automatic rounds**. If a third verification
   round would be needed (issues still open after two rounds), or at any
   point a finding lands on a human-stop disposition
   (`escalate-human` / `needs-more-context` / `advisory-disagreement`) or
   a **Critical/Major finding is not fixed**, the workflow stops to a
   human (`awaiting-human`) rather than spinning further. The bounded loop
   guarantees the work never silently stops *and* never loops forever.
   **A Minor-only / nits-only verification round is non-blocking** — it does
   not count as a round-justifying result and opens no remediation round (see
   *Materiality and the re-verify loop discipline* under Step 6; this narrows
   what counts as a round, it does not change the 1–2/3+ bound).

7. **Tie-breaker — operator-initiated second opinion (Set 057 L4).** From
   `awaiting-human`, the operator (and only the operator) may invoke the
   existing Full-tier **`second-opinion`** resolution — route the disputed
   content to a tiebreaker model from a different provider via the
   `verification.settings.on_disagreement` / `tiebreaker_model`
   configuration in `router-config.yaml`. This is the same resolution
   documented under "Disagreement With A Verifier Finding" option (d); it
   is **not** a new machine state and is never triggered automatically.

**Derived workflow states (Set 057 Q3).** The set's position in this
workflow is **derived** from `sessions[]` + per-session
`verificationVerdict` + the latest `sN-issues.json` + the
`verificationMode` record — never persisted as a new field (the Set 047
derive-top-level rule). `dedicated_verification.derive_workflow_state(...)`
returns one of seven states:

| State | Meaning |
|---|---|
| `work-in-progress` | implementation sessions not all complete (or mode is opt-out) |
| `awaiting-verification` | work complete (or fixes made); a verification session is owed / running |
| `awaiting-remediation` | a verification round found open issues within the automatic-round budget |
| `awaiting-human` | human-stop disposition, unfixed Critical/Major, or the round budget is exhausted |
| `closed-verified` | the **latest session is a verification round** that returned VERIFIED, or one whose findings were all terminally dispositioned at the verification boundary |
| `closed-dispositioned` | the **latest session is a remediation round** in which no finding was `fixed` and every finding is terminally dispositioned (nothing left to re-verify) |
| `closed-no-verification` | the set closed under `out-of-band-or-none` (the dedicated machine did not run) |

The two `closed-*` dispositioned outcomes are distinguished by **which
session type is latest**: `closed-verified` is reached from a *verification*
session, `closed-dispositioned` from a *remediation* session — they are not
the same path under two names.

**Owed states are said out loud (Set 077).** Two surfaces derive from the
same ladder so they can never disagree with the gate:

- `start_session` prints a loud, **advisory** ASCII `PENDING VERIFICATION`
  banner at every work-session start (both tiers, no router config
  needed) when the set being started or a stalled Mode-B sibling derives
  to an `awaiting-*` state, or when the most recently completed set in
  the repo has no recorded verification — all session verdicts null and
  no recognizable work-scoped verdict in `external-verification.md`. A
  latest-round `WAIVED` (with its required reason) is a durable opt-out
  and is never nagged; bare absence always is. The banner names the exact
  next action and never blocks the start.
- The Session Set Explorer's row description carries the words
  `verification owed` / `remediation owed`, and the row's **Start Next
  Session** copy action auto-routes to the verification-kickoff or
  remediation-handoff prompt in those states instead of handing out a
  work-session prompt that `start_session` would refuse. The Explorer
  derives `verificationMode` from the durable activity-log record first
  (spec seed only as fallback), so a blessed A→B transition whose
  seed-alignment failed no longer leaves the UI contradicting the gate.

**Close-out gate (Set 057 Q6; extended Set 077).** When
`verificationMode == dedicated-sessions`, `close_session` runs the
content-aware close-time validator on the **set-terminal** close (the
close that finalizes the set). If it cannot confirm a verification
session ran that **differs from every implementation session by engine
or by model provider** (missing identity data fails closed — see the
sanctioned single-engine pattern in step 1 above), the gate:

- **hard-blocks in an interactive TTY** — refuses the close, prints the
  corrective action (run a verification session on another engine or
  provider; the message names both remedies, including re-attributing
  providers when the work sessions never recorded them), and
  exits `gate_failed`; and
- **soft-warns in non-TTY / headless** (or under `--accept-suggestions`)
  — prints a warning and proceeds.

This matches the soft posture of the `external-verification.md` gate while
strengthening the interactive path. It fires **only** on the set-terminal
close — a non-terminal work-session close is never blocked for "no
verification yet." The session being closed counts as the satisfying
verification when it is itself the cross-provider verification session
(the happy-path single-round terminal close). The `writer-bypass` (D3)
check in `ai_router/writer_discipline.py` is **unchanged** — it is
content-blind and inert on Lightweight (no events ledger), so it cannot
see session `type`; the blessed writers plus this validator are the entire
enforcement surface (Set 057 S1 Audit Lock → Concrete defect).

**Path-aware-critique close-out gate (Set 066).** A second content-aware
close-out gate, **tier-orthogonal** (it runs on Full *and* Lightweight).
It fires when the durable `pathAwareCritique` record — an `activity-log.json`
entry written **once at set start and immutable thereafter** (default
`none`, seeded from the spec's `pathAwareCritique: none | advisory |
required` field; see the authoring guide) — is `advisory` or `required`.
On the **set-terminal** close it confirms a valid **multi-provider**
`path-aware-critique.json` artifact exists at the session-set root (`>=2`
distinct providers, each carrying a non-empty summary or a finding with a
description; validated by `ai_router.path_aware_critique`). The gate also
checks **artifact identity** — the artifact's `sessionSetName` must match this
set and its `pathAwareCritique` must match the recorded policy level, so a
critique copied from another set (or labelled with a weaker level) does not
satisfy the gate — and surfaces a loud, non-blocking **warning** when
`activity-log.json` exists but is unreadable (so a corrupt log cannot silently
disarm a `required` set). Fail posture:

- `required` — **hard-blocks in an interactive TTY** (`gate_failed`,
  `failed_checks: ["path_aware_critique_gate"]`) and **soft-warns in
  non-TTY / headless** or under `--accept-suggestions`, mirroring the
  Set 057 Q6 split above;
- `advisory` — **always soft-warns** and never blocks;
- `none` — skips entirely (strictly opt-in; a set that declares nothing
  pays no gate, preserving the walk-away promise on both tiers).

The wiring is **net-new** on the Full-tier close path: the
dedicated-verification gate above gates on `verificationMode` and is
Lightweight-only, so this attribute could not reuse it (the Set 065
proposal's "reuse the dedicated gate" claim was a verified erratum). Like
the Q6 gate it fires only on the set-terminal close and is fail-open in the
non-block direction — any internal error never wedges close-out. The
blast-radius predicate (`python -m ai_router.blast_radius <paths…>`)
*recommends* a level (advisory only; the operator confirms).

**The end-of-set Path-Aware Critique stage (manual operator flow).** On a
set whose recorded `pathAwareCritique` is `advisory` or `required`, the
operator runs this stage **once per set, before the set-terminal
`close_session`** (its artifact is what the gate above checks):

1. **Recommend the level at set start.** Run `python -m
   ai_router.blast_radius <changed-or-planned-paths…>` to get the
   `P_set = any(P_task)` recommendation, confirm a level, and seed it in the
   spec's `pathAwareCritique` field (or pass `start_session
   --path-aware-critique <level>`). The choice is captured once and is
   immutable thereafter.
2. **Run the multi-provider critique (path-aware).** Open the repo in a
   **GitHub-Copilot** editor so each critic has real, path-aware workspace
   access (a Mode-2 *pull* review — the routed `route()` path cannot read the
   repo). Fill the reusable template
   [`ai_router/prompt-templates/path-aware-critique.md`](../ai_router/prompt-templates/path-aware-critique.md)
   with the set's slug, change summary, file list, and the load-bearing
   claims to check, then paste it **once under GPT-5.4 and once under
   Gemini-Pro** — two independent passes from clean contexts (`>= 2` distinct
   providers is the load-bearing property; the Set 065 010-vs-C3 split proved
   one provider is insufficient).
3. **Save the artifact raw.** Assemble the per-provider verdicts into
   `docs/session-sets/<slug>/path-aware-critique.json` per
   [`docs/path-aware-critique-schema.md`](path-aware-critique-schema.md) —
   one critique entry per provider, each content-non-trivial (a non-empty
   `summary` or a finding with a `description`). The artifact follows
   verification-artifact discipline: **raw, multi-provider, never edited after
   written**. A clean review still produces an artifact (its presence means
   *the critique ran*, unlike `sN-issues.json` whose presence means issues
   were found); never fabricate an entry to satisfy the gate.
4. **Remediate, then close.** Fold any real findings into the work (the
   orchestrator adjudicates per *Disagreement With A Verifier Finding* below),
   commit, and run `close_session`. On `required` the gate confirms the saved
   artifact is valid before allowing the set-terminal close; on `advisory` it
   only warns.

This is the **manual** flow today; the first-party tool-loop adapter that
would *produce* the critique programmatically is deferred to Set 067. It is
orthogonal to per-session routed verification (Step 6), which Set 066 leaves
unchanged — the path-aware critique is an end-of-set, whole-set surface, not a
per-session one.

### Step 7: Handle Verification Result

**VERIFIED:** Proceed to commit.

**ISSUES_FOUND — but check blocking-ness first (Set 071).** An `ISSUES_FOUND`
token does not by itself justify a remediation round. Run
`is_blocking_verdict(verdict, issues)` (see *Materiality and the re-verify loop
discipline* under Step 6): if the only findings are **Minor / nits**, the result
is **effectively VERIFIED** — record the nits, proceed to commit, and open **no**
remediation round. Only a **Critical/Major** (or unknown-severity) finding makes
the branch below apply.

**ISSUES_FOUND (blocking):**
1. Parse issues from the verifier's response.
2. Fix each issue. Update status to "fixed" or "deferred".
3. Record the findings and what happened to them in the current
  session's root artifacts. At minimum, keep the raw verifier output in
  `sN-verification*.md` and summarize fixed vs deferred items in
  `sN-close-reason.md` and `disposition.json`. Persist the structured
  issue list to the root-level `sN-issues.json` (or
  `sN-issues-round-<M>.json`) artifact per
  [`docs/session-issues-schema.md`](session-issues-schema.md); you may
  append advisory `resolution_*` annotations to each issue as you fix or
  defer it, but those annotations are convenience metadata only — the
  prose in `sN-verification*.md` and `sN-close-reason.md` remains the
  canonical record. There is no required `issue-logs/` directory in the
  current workflow.
4. Re-run verification (max 2 retries) — **only when the round is blocking**
   (≥1 Critical/Major; a Minor-only round is not re-run). Track each blocking
   finding in the cross-round issue ledger so a settled point is not resurrected
   under fresh wording (see *Materiality and the re-verify loop discipline* under
   Step 6). Use `complexity_hint=85` if any issue is Major or Critical.

#### Disagreement With A Verifier Finding

If the orchestrator disagrees with a specific finding rather than
accepting it, the orchestrator does **not** dismiss the finding on its
own authority and does **not** appeal to another AI provider for a
consensus vote. The authority model is: verifiers flag, humans
adjudicate.

Most orchestrator-vs-verifier disagreements turn out to be context
problems rather than who-is-right problems. The common failure modes
are:

- **Context gap** — the verifier flagged something that's actually
  handled elsewhere in code the verifier wasn't shown. Most common case.
- **Genuine split** — the verifier and orchestrator both have the same
  context and disagree on the call.
- **Orchestrator error** — the orchestrator is wrong and should accept
  the finding.

When the orchestrator wants to challenge a finding it must present to
the human:

1. **The exact finding** (verbatim from the saved review file).
2. **The dismissal reason** — why the orchestrator believes the finding
   does not apply.
3. **The context that went to the verifier** — the list of files and
   excerpts included in the verification prompt.
4. **Self-assessment of context** — whether relevant context may have
   been missing or whether the verifier may have been distracted by
   irrelevant material.

The human then chooses one of four options:

- **(a) Accept verifier finding** — treat as an issue and fix.
- **(b) Accept orchestrator's dismissal** — close without changes.
- **(c) Re-verify with reshaped context** — same verifier, adjusted
  input (add missing files, trim irrelevant ones). Resolves the
  context-gap case cleanly.
- **(d) Second opinion from a different provider** — route the same
  content to a tiebreaker model from a different provider than the
  original verifier. This reuses the existing
  `verification.settings.on_disagreement` / `tiebreaker_model`
  configuration in `router-config.yaml`; no new code path is required.

Whichever option the human picks, log the disagreement so the ratio
is visible in the manager report over time. The router exposes
`record_adjudication` for this — it writes one JSON line to
`router-metrics.jsonl` alongside the route/verify records so the same
report pass aggregates all of it:

```python
from ai_router import record_adjudication

record_adjudication(
    config,                         # already loaded router config
    task_type="architecture",       # same task_type as the verify call
    cause="context-gap",            # context-gap | genuine-split | orchestrator-error
    resolution="reverify-reshaped", # accept-finding | accept-dismissal
                                    # | reverify-reshaped | second-opinion
    session_set=str(SESSION_SET),
    session_number=N,
    generator_model=route_result.model_name,
    verifier_model=route_result.verification.verifier_model,
    finding_summary="<one-line summary of the finding>",
    dismissal_reason="<why the orchestrator challenged it>",
)
```

The `resolution` values map to the four human options above
((a)=accept-finding, (b)=accept-dismissal, (c)=reverify-reshaped,
(d)=second-opinion). Unrecognized values are accepted but prefixed
with `unknown:` in the log so ad-hoc strings do not silently fail
to aggregate.

The distribution matters for tuning. If most disagreements resolve via
(c), the signal is that the orchestrator needs better context-selection
guidance rather than more verifiers. If (d) is common, the generator
and verifier pairing may be mismatched for this kind of work. The
manager report (`report.py`) aggregates these by cause and resolution
in its "Verifier findings & adjudication" section.

### Step 8: Close Out the Session

When session work is verified complete, the orchestrator (or the
fresh close-out turn agent) **authors `disposition.json`, commits
and pushes the work, then runs the close-out CLI through the workspace
venv interpreter** (`.venv/Scripts/python.exe -m ai_router.close_session`
on Windows, `.venv/bin/python -m ai_router.close_session` on POSIX —
never a bare `python`, which may resolve to a system interpreter without
`ai_router`), **then fires the session-complete notification** in that
order. The
close-out script is the **sole synchronization barrier** between
session work and the session being marked complete: it runs
deterministic gate checks (including `check_pushed_to_remote`,
which enforces that the push already landed), waits on
verification, emits ledger events, and writes idempotent state
(cost report sourcing, `ai-assignment.md` actuals, next-orchestrator
recommendation every session, change-log generation on the last
session, `mark_session_complete`). It does **not** run git commit /
push / notification — those are the caller's responsibility,
ordered around the close-out call. See `ai_router/docs/close-out.md`
Section 1 ("Ownership of commit / push / notification") for the
full contract and rationale.

**Authoring `disposition.json`.** The disposition is the structured
per-session outcome record the gate validates (`disposition_present`)
and the close-out machinery consumes. Schema:
[`docs/disposition-schema.md`](disposition-schema.md) (or the
`Disposition` dataclass in
[`ai_router/disposition.py`](../ai_router/disposition.py)). The gate
enforces that the file exists; the dataclass validator
(`validate_disposition`) enforces its shape. **`next_orchestrator`,
`blockers`, and `verification_verdict` are the most-frequently-missed
fields.** `next_orchestrator` is required when `status == "completed"`
AND the closing session is not the final session of the set (a mid-set
completion without a recommended pickup point is a structural bug);
`blockers` must be non-empty when
`next_orchestrator.reason.code == "switch-due-to-blocker"`;
`verification_verdict` must be set to `"VERIFIED"` or `"ISSUES_FOUND"`
(see Step 6 item 6 above) so `close_session` can persist it to
`session-state.json`. Skipping `next_orchestrator` or
`verification_verdict` is the most common cause of a first-attempt
close-out failure for orchestrators new to the workflow. The
`--force` flag bypasses the gate but is hard-scoped to
incident-recovery use only — do not reach for it as a shortcut
around authoring the disposition.

**A deliberately remote-less repo is not an incident — use local-only,
not `--force`.** When a repo has no git remote *by design* (and never
will), the close-out push gate would otherwise fail every session. The
sanctioned fix is the `.dabbler/local-only` marker, set with
`python -m ai_router.local_only --enable`: while no remote is configured,
`check_pushed_to_remote` passes-with-note instead of failing, and the
other four gates still apply. The marker can never mask a real
forgot-to-push (if a remote exists it is ignored). See
`ai_router/docs/close-out.md` → *Section 6 — The sanctioned local-only
close path* for the full behavior matrix and CLI.

Notification ordering matters: the caller fires the session-complete
Pushover notification (`send_session_complete_notification` in
`ai_router/notifications.py`) **after** `close_session` returns
`succeeded` and **before** Step 9's reorganization review, so the
human is not blocking the "session complete" signal while they think
about proposals. Do not fire the notification when the gate failed —
notifying about a half-closed session corrupts the human's mental
model of what is or isn't done.

**Do not skip `close_session` for "quick" sessions.** Every session
in a Full-tier set must close through `close_session` so the events
ledger (`session-events.jsonl`) stays authoritative. Hand-authoring
`session-state.json` to declare a session complete without running
the gate produces mixed-mode drift: the snapshot says complete but
the ledger has no `closeout_succeeded` event for that session, the
cost dashboard misses the session's spend, and consumers (the Session
Set Explorer extension v0.13.11+) downgrade the bucket to In Progress
because the ledger is the authoritative signal. If a set is going to
be hand-maintained, commit it to Lightweight tier from the start —
don't mix modes mid-set. Recovery for an already-drifted set: see
`ai_router/docs/close-out.md` § "Mixed-mode drift" — run
`close_session --repair --apply` to backfill the missing events.

#### Symmetric close protocol (Set 022)

Every close — non-final and final — appends `currentSession` to
`completedSessions[]` (sorted, unique). Only the **final** close also
flips `status` to `"complete"` and `lifecycleState` to `"closed"`. The
final branch is reached when, after appending `currentSession`,
`len(completedSessions) == totalSessions`. This is the symmetric
counterpart to the [§State first, work second](#step-1-identify-the-active-session-set-and-register-session-start)
boundary write at Step 1 and the same invariant the Session Set
Explorer reads to bucket sets correctly.

| Field                   | Non-final close                              | Final close                                  |
|-------------------------|----------------------------------------------|----------------------------------------------|
| `completedSessions[]`   | append `currentSession` (sorted, unique)     | append `currentSession` (sorted, unique)     |
| `currentSession`        | unchanged (= just-closed session)            | unchanged (= `totalSessions`)                |
| `status`                | `"in-progress"`                              | `"complete"`                                 |
| `lifecycleState`        | `"work_in_progress"`                         | `"closed"`                                   |
| `completedAt`           | unchanged (null)                             | now                                          |
| Events ledger (Full)    | `closeout_requested` + `closeout_succeeded`  | `closeout_requested` + `closeout_succeeded`  |

**Full tier.** `close_session` runs this protocol automatically —
`_flip_state_to_closed` appends `currentSession` on every close via
`compute_effective_completed_sessions` (which also backfills the
array from the events ledger if it was empty on a legacy set).
**Lightweight tier.** The orchestrator hand-writes the same field
changes per the table above.

Final-session detection deliberately uses
`len(completedSessions) == totalSessions` post-append, with
`change-log.md` presence as a belt-and-suspenders signal — both must
indicate final session for the `status: "complete"` flip. This pairs
with the v0.13.11 extension guard that downgrades a bucket if the
ledger and snapshot disagree, so a drifted set never displays as
Done by accident.

#### Last session only — worktree and branch cleanup

When the session being closed is the **last** session of the set AND the
set ran in a parallel worktree (i.e., the trigger phrase was "Start the
next parallel session of …"), clean up the worktree and the
session-set branch after the merge-and-push completes:

```bash
# from inside the container root (one level up from the worktree)
git worktree remove <slug>
git branch -d session-set/<slug>
git push origin --delete session-set/<slug>
```

A worktree is a tool for in-flight work, not a record of past work.
The merged commits live on `main` and on the remote forever — the
worktree directory and the branch are scaffolding the set has outgrown.

If `git worktree remove` refuses due to untracked or modified files,
**stop and inspect** what's there before forcing — those are usually
either session-time scratch (safe to discard) or genuine uncommitted
work the human needs to decide on. Don't `--force` blindly.

For sequential-trigger sessions (no parallel worktree was created),
this step is a no-op — the work happened in the main worktree and
there is nothing to remove.

The sibling-worktrees-folder layout that makes this cleanup natural
is documented in `docs/planning/repo-worktree-layout.md`.

### Step 9: Last Session Only — Reorganization Proposals (Post-Notify)

**Non-last sessions skip this step and proceed to Step 10.**

On the last session, AFTER notifying in Step 8, review
`docs/planning/project-guidance.md` and `docs/planning/lessons-learned.md`
and propose any reorganization that this session set's experience
justifies. This step is run after notify because it blocks on a human
response; the human should already have received the completion
notification and can answer on their own schedule.

Candidate moves include:

- **Lesson → Convention.** A lesson in `lessons-learned.md` that has been
  applied as the right call in **at least two different contexts** (different
  session sets, features, or problem areas) is a promotion candidate. A
  single repeat is not enough — wait for the second context.
- **Lesson → Principle.** A lesson that has proven itself strategic in ≥2
  contexts and is broader than a specific pattern may be promoted directly
  to Principles. Rare — most promotions go to Conventions first.
- **Convention → Principle.** A convention whose rationale has become
  clearly strategic (not just a rule, but a reason the rule exists).
- **Principle → Convention.** A principle that turns out to be a specific
  rule rather than durable strategy.
- **Relocation within a file.** Moving an item to a more fitting section.
- **Active → Archive (Set 064).** A lesson is an **archival** candidate —
  orthogonal to promotion — when **any** of: it is superseded
  (`superseded-by` set), encoded into live automation (`encoded-in` names a
  test/lint/guard/template), its subsystem was retired, or it has had no
  `last-used-set` activity for the disuse window (default 20 sets,
  `guidance.disuse_window_sets`) **and** is not referenced by active
  guidance. Move accepted candidates (full text) to
  `docs/planning/lessons-archive.md`; never delete. Promotion is **not** a
  precondition for staying active, and disuse alone (without the
  "unreferenced" half) is **not** sufficient.
- **Staleness flag.** An item whose driving context is gone may be flagged
  for the human as an Active → Archive candidate — but do not delete. Only
  move, with a note about why.

Procedure:

1. Scan both files and identify candidates with reasoning.
2. Present each candidate to the human, one at a time:
   - What is moving (text or pointer)
   - From where, to where
   - Why (which two-or-more contexts justify the move; or why the current
     classification is wrong)
3. Human accepts or rejects each proposal.
4. Apply accepted proposals. **Never delete content — only move.** If the
   destination already contains equivalent guidance, collapse by reference
   rather than duplicate.
5. If no candidates qualify, output exactly:
   > No reorganization changes recommended for `project-guidance.md` or
   > `lessons-learned.md`.
6. If any proposal was accepted, commit and push those changes in a
   **separate follow-up commit**:
   ```bash
   git add docs/planning/project-guidance.md docs/planning/lessons-learned.md
   git commit -m "Session set <name>: Step 9 reorganization (<summary>)"
   git push
   ```
   If no proposal was accepted, no additional commit is needed.

This step is mandatory even when the output is "no changes recommended" —
the review itself is the checkpoint.

### Step 10: Stop

Report: session number, verification verdict, deferred issues (if any),
cost summary, and sessions remaining.

If the session produced or refreshed a human-UAT checklist that still needs
the human to run it, the stop message must also:

- clearly identify the checklist path
- point the human to the checklist editor URL
- state that work is waiting on the human review
- keep any optional parallel suggestions low-risk and clearly optional

**Do not start the next session. Wait for the human.**

---

## Orchestrator Instruction Files

Each AI coding agent reads a different instruction file. All three instruct
the orchestrator to follow this same workflow.

| Agent | Instruction File | Global Config |
|---|---|---|
| Claude Code | `CLAUDE.md` (repo root) | `~/.claude/CLAUDE.md` |
| Codex (OpenAI) and GitHub Copilot | `AGENTS.md` (repo root) | `~/.codex/instructions.md` (Codex); Copilot reads project file |
| Gemini Code Assistant | `GEMINI.md` (repo root) | Varies by tool |

The human chooses which agent to use for each session. The agent reads its
own instruction file. Each instruction file keeps only agent-specific
bootstrap (API key export syntax, router import snippet) and points here
for the full workflow and rules.

### What Goes in the Instruction File

Each agent-specific file should contain:

1. **Project overview** — what the repo is, package structure
2. **Pointer to `docs/planning/project-guidance.md`**
3. **Pointer to `docs/planning/lessons-learned.md`**
4. **Pointer to this workflow doc** for the full procedure and rules
5. **AI router import snippet** — how to load the `ai_router` module
6. **API key export commands** — platform-specific commands to load keys
7. **Build and test commands**
8. **Solution structure**

The instruction file **should not** duplicate the per-step procedure, the
rules list, the UAT checklist rule, or the reorganization-proposal rule —
those live here, and duplication creates drift.

### Switching Orchestrators Between Sessions

The workflow is designed so that any orchestrator can pick up where another
left off. The `activity-log.json` and `spec.md` provide all the state needed.
The orchestrator:

1. Reads the activity log to find the next session number
2. Reads the spec to find that session's plan
3. Checks prerequisites from prior sessions
4. Executes — regardless of which agent ran previous sessions

Each `sessions[i].orchestrator` block records the orchestrator that
ran that specific session (engine/provider/model/effort, omit-null).
The next session's `start_session` populates its own per-session
block — there is no special "handoff" path and nothing reads the
prior block to gate behavior. See
"Orchestrator identity and concurrency (post-Set-049)" above for the
full contract.

---

## AI Router Details

### Importing the Router

The package is installed via `pip install -e .` from the repo root
(or `pip install dabbler-ai-router` once the package is published to
PyPI), and imports directly:

```python
from ai_router import route
```

The previous `importlib.util.spec_from_file_location` shim, required
when the package directory used a hyphenated name, is no
longer needed.

On Windows, use `.venv/Scripts/python.exe` to run Python.

#### Full tier via the GitHub Copilot CLI (Set 078)

Full-tier projects normally dispatch every call over a direct provider
HTTPS API (`transport.profile: api` in `router-config.yaml`, the default).
Shops whose staff hold only a GitHub Copilot seat — no `DABBLER_*` provider
key is possible under corporate policy — can instead set
`transport.profile: copilot-cli`, which routes every call through the
Copilot CLI's headless mode while every other Full-tier mechanic (task
typing, tiering, cross-provider verification, metrics) stays unchanged. It
is an *indirect* Full tier with explicitly degraded guarantees (asserted,
not confirmed, provider provenance; no locally meterable billing) — see
[`docs/concepts/tier-model.md`](concepts/tier-model.md) → *The Full tier
seat-profile option* for the full trade-off, activation steps, and evidence
basis before adopting it.

### Task Types

| Task Type | Base Complexity | Typical Model |
|---|---|---|
| `formatting` | 10 | Gemini Flash |
| `summarization` | 20 | Gemini Flash |
| `documentation` | 25 | Gemini Flash/Pro |
| `test-generation` | 35 | Gemini Pro |
| `code-review` | 40 | Sonnet (if overridden) or Gemini Pro |
| `analysis` | 55 | Gemini Pro |
| `refactoring` | 65 | Gemini Pro |
| `uat-plan-generation` | 70 | Opus |
| `uat-coverage-review` | 70 | Opus |
| `session-verification` | 70 | Opus |
| `security-review` | 75 | Opus |
| `architecture` | 80 | Opus |
| `planning` | 70 | Opus |

`uat-plan-generation` produces the structured UAT checklist (numbered
steps, verifications, test data) for a session set. `uat-coverage-review`
verifies that every functional checklist item has a matching E2E step
with the same action, parameters, and verifications. Both are
auto-verified cross-provider — they are the checks that prevent the
"UAT as first line of defense" failure mode, so they get high-effort
settings in `router-config.yaml`.

### Model Tiers and Pricing

| Tier | Model | Provider | Input $/1M | Output $/1M | Use Case |
|---|---|---|---|---|---|
| 1 | Gemini Flash | Google | $0.15 | $0.60 | Simple formatting, boilerplate |
| 2 | Gemini Pro | Google | $1.25 | $10.00 | Documentation, medium analysis |
| 2 | Sonnet | Anthropic | $3.00 | $15.00 | Code review, when Anthropic quality matters |
| 2 | GPT-5.4 Mini | OpenAI | $0.75 | $4.50 | Cross-provider verification of Gemini output |
| 3 | Opus | Anthropic | $15.00 | $75.00 | Architecture, security, verification |
| 3 | GPT-5.4 | OpenAI | $2.50 | $15.00 | Frontier verification of Opus output |

### Escalation

If a model produces an empty, truncated, or suspiciously short response, the
router automatically escalates to the next tier (up to 2 escalations).

### Cross-Provider Verification

For auto-verified task types (code-review, security-review, and any
others listed in `verification.auto_verify_task_types`), the router
sends the initial response to a verifier from a different provider.
Verifier selection is rule-based: a candidate must be from a different
provider than the generator, be in the enabled model pool
(`is_enabled: true`), be trusted for verification
(`is_enabled_as_verifier: true`), and match the generator's tier or be
one tier higher. Among survivors, the cheapest output price wins.

With three providers (Anthropic, Google, OpenAI), this rotates so every
provider acts as both generator and verifier. The advisory
`verification.preferred_pairings` map in `router-config.yaml` is
consulted as a tiebreaker against the rule-qualified candidate set: if
the listed pairing survives, it is used; otherwise the rules decide.
The current preferences:

- Sonnet (Anthropic) output → verified by Gemini Pro (Google)
- Gemini Flash/Pro (Google) output → verified by GPT-5.4 Mini (OpenAI)
- Opus (Anthropic) output → verified by GPT-5.4 (OpenAI)
- GPT-5.4 Mini (OpenAI) output → verified by Sonnet (Anthropic)
- GPT-5.4 (OpenAI) output → verified by Opus (Anthropic)

If the first-choice verifier fails at the HTTPS layer (provider
outage, timeout), the router excludes that provider and re-picks once.
The fallback call is recorded in the metrics log with
`verifier_fallback: true` and the failed provider name, so the audit
trail reflects the verifier that actually ran.

Swapping or retiring a model requires editing only its entry under
`models:` in the YAML. The rules recompute the verifier choice from
whatever pool remains, so there is no pairing table to maintain.

### When To Use The Router

- Code review → `route(code, task_type="code-review")` ← auto-verified
- Security review → `route(code, task_type="security-review")` ← auto-verified
- Documentation → `route(code, task_type="documentation")`
- Analysis → `route(question, task_type="analysis")`
- Test generation → `route(code, task_type="test-generation")`

Do NOT route file creation, shell commands, or anything needing the
filesystem.

---

## Metrics and Observability

Every routed call, verifier call, and tiebreaker call is appended to a
global log at `ai_router/router-metrics.jsonl`. The log is append-only
JSON lines (one record per line). It spans all session sets — it is
NOT per-session-set — so cross-project trends can be analyzed.

### What gets logged

For each call: timestamp, session set, session number, call type
(route/verify/tiebreaker), task type, model, provider, tier,
complexity score, effort / thinking setting, input and output tokens,
cost, elapsed time, escalation flag, stop reason. Verifier calls
additionally log the verdict (VERIFIED / ISSUES_FOUND) and issue count.

### Reading the log

Call `print_metrics_report()` for a terminal summary:

```python
from ai_router import print_metrics_report
print_metrics_report()
```

The report groups by model, task type, verifier, and session set,
showing call counts, costs, escalation rates, and verifier pass rates.

For deeper analysis, read the JSONL file directly. The human or an
orchestrator can hand the file to a reasoning model and ask
questions like *"which task types are escalating most?"* or *"is GPT-5.4
a stricter or looser verifier than Opus?"* — the records carry enough
context to answer those without additional instrumentation.

### Manager Report

For a governance-oriented markdown summary rather than the developer
text dump, run `report.py`:

```bash
# Print to stdout
python -m ai_router.report

# Write to a file
python -m ai_router.report --output docs/reports/router-2026-Q2.md

# Filter by date range or session set
python -m ai_router.report --since 2026-04-01 --until 2026-04-30
python -m ai_router.report --session-set docs/session-sets/reports-pdf-layout
```

The report contains:

- **Headline** — total calls, total spend, and the ratio of actual spend
  to an Opus-only baseline (what the same token volume would have cost
  if every call had gone to Opus). The savings percentage is the
  governance-slide headline.
- **Per-task-type summary** — primary model, average cost per call,
  escalation rate, verifier rejection rate, retry rate, and a composite
  unreliability rate. Rows with fewer than 5 calls are flagged as
  too-few-to-rate rather than shown with false precision.
- **Outliers** — top 3 most expensive individual calls and top 3 task
  types by unreliability.
- **Auto-generated action items** — one bullet per task type whose
  composite unreliability exceeds 20%, naming the specific component(s)
  driving the signal.

Unreliability is the mean of three independent rates: escalation rate,
verifier rejection rate (`ISSUES_FOUND` verdicts), and retry rate
(tiebreaker calls divided by verify calls). Components with a zero
denominator are omitted rather than counted as zero.

The developer-oriented `print_metrics_report()` above is unchanged —
both views coexist. Use `report.py` for reviewers and managers; use
`print_metrics_report()` for in-session debugging.

### Threading session info

When the orchestrator calls `route()`, it should pass `session_set`
and `session_number` so the metrics can be grouped by session:

```python
result = route(
    content=prompt,
    task_type="code-review",
    session_set=str(SESSION_SET),
    session_number=next_session,
)
```

These kwargs are optional — if omitted, the metric still records but
without session-level grouping.

### Disabling metrics

Set `metrics.enabled: false` in `router-config.yaml` to stop writing.
The log is append-only; rotate or archive manually when it gets large
(expect ~100 bytes per call, so thousands of calls per megabyte).

---

## Delegation Discipline

The orchestrator's job is to plan, sequence, and dispatch — not to do
every piece of reasoning itself. Orchestrators tend to hoard work
because calling themselves "feels faster." In practice that means paying
the orchestrator's premium model rate for tasks a Gemini Flash or
Sonnet call at low effort would handle just as well.

The following discipline applies to every session.

### Default: Route Reasoning, Own Mechanics

The orchestrator does these **directly**, without calling `route()`:

- Reading the spec and the activity log
- Creating, editing, renaming, or deleting files
- Running shell commands (build, test, git, Docker)
- Dispatching work to `route()` and logging the result
- Single-file edits under ~50 lines that are mechanical (renames,
  imports, formatting, trivial boilerplate the spec dictates verbatim)
- Interpreting errors enough to decide which task to route next

The orchestrator **always** routes these through `route()`, never
performs them itself:

- Code review
- Security review
- Architecture decisions, pattern selection, design proposals
- Analysis of existing code or test results beyond a surface read
- Documentation writing (change logs, READMEs, doc comments on
  non-trivial APIs)
- Test generation beyond one-off smoke tests
- Session verification (the cross-provider check at end of session)
- Any task that requires producing more than ~50 lines of reasoned
  output

### The "I'll just do this directly" trap

When the orchestrator catches itself thinking *"this is easy, I'll
handle it myself and save the API call,"* that is a signal to route,
not a reason to proceed. The orchestrator is not cheap — its own
token rate for reasoning work is the highest in the system. Routing
a task to Gemini Flash or low-effort Sonnet is almost always the
cheaper and more auditable choice, because the routed call's cost
and output are logged.

The one valid reason to skip `route()` and do the work directly is
when the task genuinely meets all three criteria from the "directly"
list above: mechanical, single-file, under ~50 lines. If any of
those is in doubt, route it.

### How the router already keeps itself cheap

The orchestrator does not pick the model or the effort level. Those
come from `router-config.yaml`:

- The router estimates complexity and picks the cheapest capable tier
- `task_type_params` sets per-task effort/thinking defaults (low for
  formatting, high for verification)
- For code-review/security-review/architecture, a second provider
  auto-verifies — independently, without the orchestrator asking
- Escalation kicks in automatically if a tier-1 response looks
  truncated or refuses

The orchestrator's only job is to pick the right `task_type` when
calling `route()`. Everything else — model selection, effort, thinking
depth, verification — the router handles. Passing the wrong
`task_type` (e.g., tagging an architecture decision as `documentation`)
undercuts the tuning, so this matters.

### Thresholds (human-tunable)

The thresholds above (~50 lines, single file) live in
`router-config.yaml` under `delegation.direct_work_max_lines` and
`delegation.direct_work_max_files`. The human can adjust these per
project. The `delegation.always_route_task_types` list in the same
file is the authoritative list of task types the orchestrator must
never handle directly.

---

## Decision-time consensus

`delegation.always_route_task_types` covers **task** delegation —
which kinds of work the orchestrator must route to the router rather
than perform itself. Decision-time consensus is the parallel
mechanism for **in-session decisions** — design / architecture /
process questions the orchestrator hits mid-session, the kind that
historically surfaced as `AskUserQuestion` prompts to the operator.
When the `delegation.decision_consensus.enabled` flag is `true`, the
orchestrator first routes eligible questions to a configured pair of
engines in parallel, synthesizes their responses, and only falls back
to `AskUserQuestion` if the engines disagree materially or the
synthesis hinges on information neither engine has.

The behavior is **opt-out by default** (`enabled: false`). Every
existing repo's `AskUserQuestion`-first behavior is preserved until an
operator explicitly flips the flag in their `router-config.yaml`.

### When to consult the engines (decision tree)

1. **Is this a human-only question?** Some decisions are
   operator-only by their nature. Skip consensus and go straight to
   `AskUserQuestion`. Examples:
   - Business priority ("ship now vs. polish first")
   - Taste calls the operator owns ("which name reads better")
   - Irreversible or high-blast-radius actions (force-push, drop
     table, delete branch, publish to PyPI)
   - Anything that asks the operator to commit time or money
2. **Is the category in `decision_consensus.categories`?** If not,
   `AskUserQuestion` is still the path. The category whitelist is the
   declarative gate that keeps the consult mechanism scoped to
   questions where engines reliably converge.
3. **Route the question to both engines in parallel.** Use
   `ai_router.query()` once per engine (V1 has no `consensus()`
   helper; orchestrator manages the two calls itself). Pass the same
   prompt verbatim; do not nudge either engine toward a preferred
   answer.
4. **Synthesize the two responses into ONE concrete recommendation.**
   The orchestrator's job is judgment, not just relay. Write the
   recommendation as a single sentence that the next step in the
   session can act on directly.
5. **Apply the synthesis OR fall back per `unresolved_action`.** When
   the engines converge and the synthesis is concrete, apply it. When
   they disagree materially (different architectural sides, different
   file-layout proposals) or the synthesis depends on information
   neither engine has (operator-specific deadline, internal policy),
   honor `unresolved_action`:
   - `ask_user` (default, recommended) — surface the synthesized
     conflict to the operator via `AskUserQuestion` with both
     positions clearly stated.
   - `proceed_with_orchestrator_judgment` — the orchestrator picks a
     side and records it in the journal with `applied: true` and a
     reasoned `chosen_recommendation_summary`. Reserved for
     power-user setups that have accepted the autonomy trade.
6. **Write one journal record per call.** Whether the synthesis was
   applied or punted to the operator, every consensus call appends
   one line to `journal_path`. The journal is the audit trail; a
   skipped write is a missing decision.

### Prompt-framing discipline

Engine consensus is only as good as the prompts that elicit it.
The same model, given the same data with different framing, can
return opposite verdicts on the same question. This was observed
empirically on 2026-05-22: two Gemini Pro calls reviewing the same
launch-adapter roadmap reached opposite conclusions on whether the
chat-interface sets should ship, because one prompt asked "is this
high value and low risk?" and the other asked "evaluate the design
as proposed, not some hypothetical greenfield alternative." Both
verdicts were coherent given their framings — but the framings
drove the outcome more than the underlying evidence. Two practices
mitigate this.

#### 1. Bias-cautions preamble (always on)

Prepend a short cautions block to every consensus prompt. The
canonical text:

> *Bias cautions: This prompt was authored by an AI agent that may
> have an opinion on the answer. Its framing may inadvertently
> constrain you to in-scope refinements when the right answer is
> to question the scope. The work being reviewed may be presented
> as further along than it should be. Before answering as posed,
> briefly check whether this is the right question. If a different
> question would be more useful, answer that one too.*

This is the cheapest intervention and dominates the cost-benefit
analysis. It should be on by default for every consensus call,
regardless of category.

#### 2. Devil's-advocate two-pass pattern (high-leverage decisions only)

For genuinely contested decisions — typically those where the
first pass surfaced material disagreement, or where the
architectural commitment is large enough that one wrong framing
locks in significant rework — run two passes:

- **Pass A** — the natural prompt the orchestrator wants to ask.
- **Pass B** — an auto-generated counter-prompt that steelmans a
  **specific** contrarian hypothesis (e.g., "argue that the
  proposed launch-adapter approach is dominated by a
  log-harvesting alternative; what would make that obviously
  true?"). Not "be contrarian" — that produces theatrically
  negative reviews that look insightful but waste budget.

Then synthesize across both passes. Cost is roughly 2× per
decision, but it prevents a single framing from dominating. The
journal entry should carry both prompts and both verdicts.

#### When to use which

| Situation | Preamble | Devil's-advocate |
|---|---|---|
| Routine consensus call (mechanical category) | Yes | No |
| Architecturally significant question | Yes | Yes if budget allows |
| First-pass returns material disagreement | Yes | Yes (refute one side's reasoning) |
| Decision binds a long-lived contract | Yes | Yes |
| Reviewing a roadmap or session-set sequence | Yes | Yes |

The preamble is always on. The devil's-advocate pass is scoped to
high-leverage decisions where the framing-bias cost would outweigh
the routing cost.

### Eligible (V1) vs. human-only categories — examples

The four V1 categories are intentionally **mechanical** — placement,
layout, scoping. They are the highest-convergence questions, where
engines reliably reach the same answer because the choice is
structural rather than aesthetic.

| Category | Engine-eligible examples | Human-only escalation |
|---|---|---|
| `refactor-placement` | "Where should this helper live — `utils.py` or a new `parsers/` module?" | "Should we refactor at all, or ship this as-is?" |
| `file-layout` | "One file per provider, or one file with sections?" | "Should we adopt the company-wide src layout?" |
| `scoping` | "Is this change spec-scoped, or does it belong in a follow-on session?" | "Should we cut scope to make Friday's deadline?" |
| `spec-clarification` | "The spec says `X`; given the surrounding context, does it mean X1 or X2?" | "The spec says X; do we want X or Y?" |

V1.5 and V2 categories (`testing-strategy`, `api-surface`, `design`,
`architecture`) are accepted at load time so a consumer repo can opt
them in without a schema bump — but the V1 default keeps them off
because the orchestrator's track record of engine-converging on
those categories is not yet established.

### Journal format

Each consensus call appends one JSON object to `journal_path`
(default `ai_router/consensus-decisions.jsonl`). The format mirrors
`router-metrics.jsonl` — append-only JSONL, one record per call,
git-tracked by default so the audit trail follows the repo.

```jsonc
{
  "timestamp": "2026-05-19T14:03:21.456-04:00",
  "session_set": "031-delegation-consensus-config",
  "session_number": 1,
  "category": "refactor-placement",
  "question_summary": "Where to strip the VBA Attribute VB_* header?",
  "question_hash": "sha256:9f3a…",
  "engines": ["openai:gpt-5-4", "google:gemini-pro"],
  "agreement_level": "aligned",
  "chosen_recommendation_summary": "Shared module-body loader (B); audit every production call site",
  "applied": true,
  "fallback_action": null,
  "fallback_reason": null,
  "input_tokens_total": 2206,
  "output_tokens_total": 4768,
  "cost_usd": 0.0618
}
```

When `journal_full_payloads_dir` is set (default
`ai_router/consensus-decisions`), each consensus call also writes a
Markdown sibling file `<timestamp>-<hash6>.md` containing the prompt,
both engine responses verbatim, and the synthesized recommendation.
The directory is gitignored — full payloads stay local while the
per-line summary travels with the repo. Set
`journal_full_payloads_dir: null` in `router-config.yaml` to skip
full-payload capture entirely.

The `agreement_level` field is one of `aligned`, `partial`,
`conflict`, or `degraded`. `fallback_action` is `null` when the
synthesis was applied; otherwise it records which branch of
`unresolved_action` ran (`ask_user` or `orchestrator_judgment`).

### Opt-in path

1. Edit `router-config.yaml` and set
   `delegation.decision_consensus.enabled: true`.
2. Optionally trim or extend `categories` and `engines` (defaults
   work out of the box for a Claude orchestrator with the standard
   GPT + Gemini consult pair).
3. Add `ai_router/consensus-decisions/` to the consumer repo's
   `.gitignore` if the canonical one is not already inherited. The
   per-line JSONL itself stays committed.

There is no migration required for existing journal files — the file
is created on first write. Operators who want to disable the
behavior re-set `enabled: false`; the schema accepts the block in
either state.

### Limits of consensus

Engine consensus is not the same as ground truth. Both engines can
converge on a wrong answer — particularly on questions whose answer
depends on local context the engines have not been shown. Four
guardrails apply:

- **Human-only categories.** The decision tree's step 1 is the
  bright line: business priority, taste, irreversibility, time/money
  commitments are not consensus-eligible regardless of what the
  flags allow.
- **Synthesis discipline.** The orchestrator's job is to read both
  responses and write ONE concrete recommendation, not to relay
  "Engine A says X, Engine B says Y, what do you want?". A relay is
  a failed consensus call — fall back to `unresolved_action`
  instead.
- **Framing-bias mitigation.** Same engine + same data + different
  prompt framing can yield opposite verdicts; see
  *Prompt-framing discipline* above. The bias-cautions preamble is
  the always-on mitigation. The devil's-advocate two-pass pattern
  is the high-leverage mitigation. Apply the appropriate one.
- **Auditable journal.** Every consensus call appends a record. The
  operator can review `consensus-decisions.jsonl` at any time, grep
  for `applied: true` to see what shipped without their prompt, and
  pull the full payload from the sibling Markdown file if they want
  to second-guess a synthesis after the fact.

---

## Rules (Apply to All Orchestrators)

This is the authoritative rules list. Instruction files (`CLAUDE.md`,
`AGENTS.md`, `GEMINI.md`) reference this section rather than duplicating it.

1. **One session only.** Never execute more than the assigned session.
2. **Never skip verification.** Every session must be independently verified
   by a different AI provider via `route(task_type="session-verification")`.
   `session-verification` ALWAYS routes — this is the one constraint that
   survives any maxout suffix or orchestrator-model-matches-routing-target
   shortcut.
3. **Never edit session review files.** They are the verifier's raw output.
4. **Log every step** via `log.log_step()` — including build, test, and
   verification.
5. **Delegate reasoning** to `route()`. See the Delegation Discipline
   section above for the full criteria. In short: code review, security
   review, analysis, architecture, documentation, test generation, and
   session verification always go through `route()`. Do the work yourself
   only for mechanical, single-file edits under ~50 lines.
6. **Do not commit with unresolved Critical/Major issues.** Inform the human.
7. **The human controls orchestrator choice.** Any session can use any agent.
8. **Before every session, read all required-reading files.**
   `docs/planning/project-guidance.md`,
   `docs/planning/lessons-learned.md`, and
   `docs/planning/session-set-authoring-guide.md` are mandatory
   pre-session context. `docs/planning/lessons-archive.md` is **not** —
   it is the never-auto-loaded archive tier (Set 064), searched on demand
   via `python -m ai_router.guidance_search --archive`.
9. **Treat pending human UAT as blocking** *(applies only when the active
   spec declares `requiresUAT: true`).* Do not start downstream sessions
   on top of a checklist the human has not yet reviewed unless the human
   explicitly overrides the pause.
10. **One UAT checklist per session set** *(applies only when the active
    spec declares `requiresUAT: true`).* Name it
    `<session-set-slug>-uat-checklist.json` and keep human results inline.
11. **UAT mechanical-verification floor** *(applies only when the active
    spec declares `requiresUAT: true`).* The mechanism depends on
    `uatStyle`:
    - **11a. DSL-driven (`uatStyle: "dsl"`)** — also requires
      `requiresE2E: true`. Every functional checklist item must have
      matching Playwright coverage and pass `uat-coverage-review`
      before the checklist is committed and the human is notified.
      Judgment items (`IsJudgmentItem: true`) are exempt from
      matching-test parity but still require sequence-reachability
      coverage. See §"UAT Checklist Rule — DSL-driven" above.
    - **11b. Ad-hoc (`uatStyle: "ad-hoc"`, the default)** — every
      non-judgment functional checklist item must declare either a
      `ProgrammaticVerification` reference (unit/component/data-layer
      test or AI exploratory check) or a `NoProgrammaticPathReason`
      (one-sentence justification). The orchestrator validates this
      before notifying. See §"UAT Checklist Rule — Ad-hoc" above.
12. **Share screenshots during UI and E2E work when practical.**
13. **Escalate durable new guidance.** If the human gives an instruction that
    looks like a future principle or convention, ask whether it should be
    added to `docs/planning/project-guidance.md`.
14. **Recommend lessons learned after failures.** When a failure suggests a
    reusable tactic, propose an update to `docs/planning/lessons-learned.md`.
15. **Run the Step 9 reorganization review on the last session of every
    set, after the notify.** Output "no changes recommended" if nothing
    qualifies — but do the review. Apply any accepted proposals in a
    separate follow-up commit so the session-complete notification is
    never held up by the human reviewing proposals.
16. **Register session start before the first activity-log entry.** Run
    `python -m ai_router.start_session` (Full tier) at Step 1 so
    external tooling (VS Code Session Set Explorer, dashboards) sees
    the set as in-progress immediately. `close_session` handles the
    flip to `complete` at Step 8, including reading
    `verification_verdict` from `disposition.json` and persisting it to
    `session-state.json`'s per-session `verificationVerdict`.
17. **Author `ai-assignment.md` and the next-orchestrator /
    next-session-set recommendations via routed analysis — never
    self-opine.** The orchestrator's own opinion of which model could
    have been cheaper is the precise thing the routed analysis is
    designed to displace.
18. **Obey the spec's Session Set Configuration block at runtime.** Do
    not re-litigate `requiresUAT` / `requiresE2E` (or any future flag
    the block grows) during a session. The When-UAT-Is-Required and
    When-E2E-Is-Required heuristics are authoring-time decisions
    documented in `docs/planning/session-set-authoring-guide.md`.
    Specs that omit the block entirely are treated as all-flags-false
    — the universal core of the workflow runs and every gated rule
    skips silently. If a flag is wrong, correct it in the spec and
    revisit at the Step 9 reorganization review.
