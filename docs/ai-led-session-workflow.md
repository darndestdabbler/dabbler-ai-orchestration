# AI-Led Session-Set Workflow

> **This is the on-demand execution reference, not the per-session
> preload (Set 085).** The per-session operating doc is
> [`docs/session-constitution.md`](session-constitution.md) — it carries
> the happy path, the authority rules, and the pointer table into this
> document. Read the constitution before every session; open this file
> at its trigger moments — a rare procedural branch (UAT/E2E-gated sets,
> maxout, parallel worktrees, adjudication mechanics), router
> configuration, or the full Rules list.
>
> **New here?** Start with [`docs/quick-start.md`](quick-start.md) for a
> 5-minute orientation.

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

The before-every-session reading is the preload defined in
[`docs/session-constitution.md`](session-constitution.md): the
constitution itself, `docs/planning/project-guidance.md`, the active
`docs/planning/lessons-learned.md`, and the engine bootstrap file.
This document, `docs/session-state-schema.md`,
`ai_router/docs/close-out.md`, and
`docs/planning/session-set-authoring-guide.md` are consulted on demand
at their trigger moments (the authoring guide when authoring or
revising a spec). Do **not** read `docs/planning/lessons-archive.md`
at session start — the archive (Set 064) is the preserved, never-auto-
loaded tier; search it on demand with `python -m ai_router.guidance_search
--archive`. The guidance lifecycle these files follow (per-lesson metadata,
citation-at-close, archival triggers, ceilings, the preload manifest and
admission test) is documented canonically in
[`docs/guidance-lifecycle.md`](guidance-lifecycle.md).

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
  |-- reads session-constitution.md, project-guidance.md,
  |   and lessons-learned.md (the preload; Set 085)
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
  |-- MANDATORY (Set 083): end-of-session verification, every session
  |     |-- runs `python -m ai_router.verify_session` (no skip; the
  |     |   Set 068 routed-gate SKIP path is retired)
  |     |-- sends all work to a DIFFERENT AI provider
  |     |-- saves raw verifier output (never edited)
  |     +-- phased loop (Set 096): discovery (fan-out, lens per call)
  |         -> supplementary -> remediate once -> remediation-review on
  |         the fix delta (bounded and ENFORCED: <=2 discovery passes,
  |         <=2 review cycles, <=2 classic rounds; past a bound the CLI
  |         REFUSES without --operator-authorized-round)
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

> **"Tier" here means the BUDGET tier** — how verification calls are
> paid for. It is the only tier vocabulary left in this document:
> Set 112 deleted the adoption tier (`tier: full` vs
> `tier: lightweight`), so a project no longer chooses whether to
> verify, only how much it will spend doing so.

Every project declares an API-verification **budget
threshold** at project setup — a hand-authored
`ai_router/budget.yaml` (see `docs/budget-yaml-schema.md`; the
extension's Getting Started budget step that used to write it was
retired with the webview in Set 123 S3). The threshold is recorded in
`ai_router/budget.yaml` and governs which verification path the
project uses. Two tiers, with two sub-options under the zero tier:

| Tier | Threshold (`threshold_usd`) | `verification_method` |
|---|---|---|
| **`zero-budget`** | `0` | (a) **`manual-via-other-engine`** OR (b) **`skipped`** — operator picks |
| **non-zero budget** | `> 0` | `api`, bounded by `verification_nte_usd` |

The threshold and the chosen verification method are persisted in
`ai_router/budget.yaml` (see `docs/budget-yaml-schema.md` for the
canonical schema). The operator authors it and can edit it anytime to
change tier or method.

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
  (Set 123 S3 deleted the `Dabbler: Show Cost Dashboard` extension command
  with every other webview; `router-metrics.jsonl` is unchanged and this
  report reads it.)

> **`python -m ai_router.cost_report` no longer exists** (deleted in Set 119 S3 as unreachable). Nothing in
> the package called it, and on the Copilot CLI transport every routed
> call records `billed_usage_unavailable: true` with `cost_usd: 0.0`, so
> the per-session detail it printed was zeros. `report.py` and the
> extension dashboard remain.

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
| `disposition.json` | Structured close-out handoff for the just-finished session. Rewritten at each close-out; required before `close_session`. |
| `sN-verification.md` | Recommended root-level raw verifier output for session `N` (never edited). Additional rounds use `sN-verification-round-2.md`, `sN-verification-round-3.md`, etc. |
| `sN-issues.json` | Root-level machine-readable structured findings for a **findings-bearing** verification round (Set 055). Round 1 uses `sN-issues.json`; later findings-bearing retries use `sN-issues-round-2.json`, etc. Written only when the verdict is not `VERIFIED` — its presence means that round found issues. No runtime reader; never overwritten. See [`docs/session-issues-schema.md`](session-issues-schema.md). |
| `sN-close-reason.md` | Recommended root-level close-out / attestation narrative for session `N`. |
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
- Ends with cross-provider verification on **every session**
  (Set 083 — mandatory, no skip; see *Verification-surface policy* and
  Step 6), with the end-of-set path-aware critique + contract-test gate as
  additional surfaces
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

Every session ends with an independent verification step
(Set 083 — mandatory, no skip; between Sets 068 and 083 this was gated on a
diff predicate, and before Set 068 it was mandatory — the mandate is
restored). The orchestrator sends its work to a model from a **different AI
provider** than the one that did the work. This catches provider-specific
biases and blind spots:

- If the orchestrator is Claude and used Gemini for routing, verification
  goes to Opus or Sonnet (Anthropic)
- If the orchestrator is Codex/Gemini, verification goes to an Anthropic model
- The verifier's raw output is saved and never edited

### Verification-surface policy (Set 083 — MANDATORY, reversing the Set 068 DEMOTE)

> **Current policy (Set 083, operator decision).** Per-session
> cross-provider verification is **mandatory on every session**.
> The Set 068 routed-gate SKIP path is retired: the 2026-07-06 UAT incident
> showed the gating predicate's verdict is only as honest as the path list
> the policed actor feeds it, and a skip affordance presented to an engine
> will eventually be taken. The end-of-set path-aware critique and the
> contract-test gate remain **additional** surfaces; the only exception is
> the operator-declared zero-budget tier (`ai_router/budget.yaml`,
> `threshold_usd: 0`) — never an engine's per-session call. The Set 083
> verification-integrity close gate enforces this: a close with
> no corroborated verification verdict is hard-refused in both interactive
> and headless modes. The rest of this section is preserved as the
> historical record of the Set 068 DEMOTE experiment and its rationale.

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
  session-level triggers above (the module was deleted in Set 119 S3 as unreachable — see the transition
  guard below). The S4 consensus required it to be a
  **deterministic diff heuristic, not a per-session feeling** — so the only
  operator inputs are the three honestly-declared facts the diff cannot show
  (`--contract-uncovered`, `--high-blast`, `--post-failed-loop`), each of which
  can only **raise** the verdict to REQUIRED.

> **Transition guard — historical; the demotion has since been REVERSED
> (Set 083).** The S6 cut-over ran as described above from Set 068 until
> Set 083, when the operator restored mandatory per-session verification
> after a live incident demonstrated the gate's input-honesty flaw (see the
> current-policy note at the top of this section). `routed_gate.py` stayed
> importable for pre-083 scaffolds while always answering REQUIRED, and
> Set 119 S3 deleted it: nothing in the package called it, and a module
> whose only behaviour is to answer REQUIRED unconditionally is not a
> gate. There is nothing to configure and nothing to run.

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
Invoke from the command palette (the config editor that also offered it
was deleted in Set 123 S3). Prompts for a
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

1. Session-set authoring scaffolds the file alongside `spec.md` with
   `status: "not-started"` — the decomposition prompt instructs the AI to
   write it. (Set 123 S3 retired the extension's "Generate Session-Set
   Prompt" command that used to carry that instruction; the obligation is
   unchanged and now rides the module-decomposition prompt and the
   authoring guide.) The full not-started shape is in
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
combination of orchestrators. The Work Explorer renders
multiple in-progress sets natively.

**Per-orchestrator declaration contract (T3).** Hooks pass only the
fields they can declare authoritatively:

- **Claude Code** — invokes `start_session --engine claude
  --provider anthropic`, recovering `model` / `effort` from the prior
  session's block when available (no `"unknown"` fallback). (Set 050's
  Claude-only `SessionStart` hook that automated this invocation was
  retired in Set 051 S3; the universal workflow already has every
  orchestrator run `start_session` at each boundary.)
- **Codex CLI / Gemini Code Assist / GitHub Copilot** — analogous;
  pass what you know, omit what you don't.

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

`start_session` writes the per-session orchestrator block
automatically when the in-progress session is registered; the
operator never edits it directly. The block stays attached to its
`sessions[i]` entry through close — `close_session` does not
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

**Set 045 Explorer surface is reverted.** The Work Explorer
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

- **Right-click in the Work Explorer.** The `Cancel Session
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

### The cancel-to-pause recipe (suspending a set blocked on a dependency)

Set 104 canonized a specific, recurring impasse: **a set that is
blocked on a fix which the one-active-set rule (D6) won't let another
set start to deliver.** Set 103's Session 2 (a live Copilot + Azure
DevOps walk) could not run until the Copilot CLI's 32 KiB argv ceiling
was fixed — but starting the dedicated fix set (Set 104) while 103 was
still `in-progress` would violate one-active-set. The set was blocking
its own fix.

The answer — locked by an operator-initiated cross-provider consult
(openai:gpt-5-6 + google:gemini-3-1-pro, `task_type: architecture`,
**aligned**;
`docs/session-sets/104-copilot-cli-large-prompt-handoff/authoring-consult-synthesis.md`)
— is **no new machinery.** The existing sanctioned cancel/restore writers
*are* the pause. This differs from the "not a pause for the day"
caveat above: that caveat rejects casually cancelling a *mid-session,
self-resumable* set. Cancel-to-pause is the opposite case — a genuine
**external** blocker (a dependency set / release / operator
precondition), suspended at a **session boundary**, with an objective
resume condition on the record.

**No `paused` schema enum (explicit decision record).** The consult was
unanimous against adding a first-class `"paused"` `status` value.
Older routers and extensions validate the status enum and reject
unknown values, so a new status has a cross-version blast radius
(schema, validators, the D6 drift guard, the CLI, and the Work
Explorer would all need coordinated changes, and writers could not
safely emit it until every consumer repo upgraded) — disproportionate
to a rare operation. Revisit a first-class status **only** if pauses
become frequent, long-lived, or hard to discover, and then in two
phases: ship readers / validators / guards / UI that understand
`paused` and treat it as non-active *first*, and release writers that
emit it only after the compatibility floor has moved.

**The recipe:**

- **Pause** = `session_lifecycle.cancel_session_set(dir, reason)` with a
  **structured reason string** — the reason *is* the contract:

  ```
  Paused, not abandoned: blocked by <set/issue>; resume when
  <objective, checkable condition>; owner: <who>; next session: <K>.
  ```

  Record the blocking dependency, an objective resume condition, the
  owner, and the intended next session (and the related fix set /
  release where applicable). The cancel writer prepends this to
  `CANCELLED.md` and captures `preCancelStatus`, so the pause is a
  durable, operator-readable audit entry.
- **Resume** = `session_lifecycle.restore_session_set(dir, reason)` —
  verified lossless: it round-trips `preCancelStatus` back to the
  status the set held before the pause and leaves every session entry
  untouched (a paused set's in-flight-vs-not sessions come back exactly
  as they were). `CANCELLED.md` becomes `RESTORED.md` (audit-only).
- **Legal only at a session boundary** — zero sessions `in-progress`.
  A mid-session emergency has ambiguous partial outputs and recovery
  semantics; use real cancellation / recovery for that, never pause.
- **Paused sets do not count against one-active-set.** The D6 drift
  guard counts only literal `"in-progress"`, and a paused set is
  `"cancelled"` on disk — so **any number** of sets may be paused at
  once; there is no cap. Because they are invisible to D6, the
  discipline that keeps them from being forgotten is human: **review
  the Cancelled bucket during set selection** and check each paused
  entry's resume condition.

Set 103's `CANCELLED.md`
(`docs/session-sets/103-copilot-ado-hello-world-tutorial/CANCELLED.md`)
is the first live worked example of this recipe — it names Set 104's
slug as its resume condition and is restored via `restore_session_set`
once router 0.34.0 (this set's deliverable) publishes.

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
orchestrator's own (model-derived) effective provider** — the Set 084
exclusion still applies, and a maxout that leaves no different-provider
verifier still yields `verification_unavailable` rather than a
same-provider pass. `session-verification` is always cross-provider —
that is the one constraint that survives any maxout.

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

1. Read the preload:
   [`docs/session-constitution.md`](session-constitution.md),
   `docs/planning/project-guidance.md`,
   `docs/planning/lessons-learned.md` (its **active** tier only — do
   **not** read `docs/planning/lessons-archive.md`, which is never
   auto-loaded; search it on demand with
   `python -m ai_router.guidance_search --archive`), and your engine
   bootstrap file (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`). The authoring
   guide, this document's reference sections, the schema doc, and the
   close-out doc are opened on demand at their trigger moments — see
   the constitution's pointer table.
2. Then load keys from the environment and confirm all required keys
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
keeps the Work Explorer's bucket transitions clean: the set
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

Run the CLI as the first action of the
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

`session-state.json` is the single source of truth for in-progress
detection by external tooling. It is updated again at Step 8 to flip
`completedSessions[]` (every close) and on the final session also
`status: "complete"` + `lifecycleState: "closed"`. Do not rely on
activity-log presence for in-progress signaling — `start_session` is
what makes the set visibly active.

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

> **`status` is a closed vocabulary (Set 120 S1).** Exactly one of
> `complete`, `in-progress`, `pending`, `blocked` — and exactly that
> spelling. `log_step` raises `InvalidStepStatusError` on anything else,
> including the near-misses readers happen to tolerate (`completed`,
> `done`, `Complete`) and prose written into the status field. Narrative
> belongs in `description`. Readers stay lenient about the history
> already on disk; the writer does not, because a token no reader can
> name renders the whole session as not-started (Set 119 S2).
>
> **`skipped` is deliberately not legal.** It has no box in the checklist
> reader, so a skipped step renders `[?]` — the corrupt-data glyph — in
> the CLI and as `not-started` in the Work Explorer, neither of which is
> what it means. Record a skip in the step's `description` until both
> readers learn the token (operator ruling, 2026-08-11). The ruling
> originally also cited the `<- here` marker, which such a step would
> steal from real work; that marker was removed from both languages
> later the same day (Sets 120 S3 and 115 S4), and the rest of the
> reasoning stands without it.

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

### Step 6: End-of-Session Verification (MANDATORY — Set 083)

**The orchestrator must not verify its own work.** The `route()` function
dispatches to a different AI provider for independent review.

> **Note (Set 083 — MANDATORY, reversing the Set 068 DEMOTE).** This step
> runs on **every session, with no skip**. The Set 068 routed-gate
> SKIP path is retired by operator decision after the 2026-07-06 UAT
> incident: the gating predicate's verdict was only as honest as the path
> list the policed actor fed it (an empty argument list evaluated as a
> zero-file diff and printed SKIP), and a skip affordance presented to an
> engine will eventually be taken. `python -m ai_router.routed_gate`
> answered REQUIRED unconditionally after that decision and was deleted in Set 119 S3 as unreachable; there
> is no skip path and no gate to run. The end-of-set
> path-aware critique + the contract-test gate remain **additional**
> surfaces, not substitutes. The only exception is operator-declared, never
> per-session: the zero-budget tier in `ai_router/budget.yaml`
> (`threshold_usd: 0`). The verifier always routes to a **different
> provider** than the orchestrator, and the Set 083 verification-integrity
> close gate hard-refuses a close with no corroborated verdict.

When this step terminates with a `VERIFIED` verdict and
`disposition.json` reports `status: "completed"`, the orchestration
layer routes a new turn with `task_type="session-close-out"` so the
close-out agent reads `ai_router/docs/close-out.md` at the moment
the instructions are needed. Hook failures (provider outage, transient
lock contention) are non-fatal; the reconciler sweeps stranded
sessions on the next orchestrator startup and re-runs close-out.

The canonical path is the first-class CLI:

```bash
.venv/Scripts/python.exe -m ai_router.verify_session \
   --session-set-dir docs/session-sets/<slug>
# POSIX: .venv/bin/python -m ai_router.verify_session ...
```

`verify_session` resolves the in-progress session number, assembles the
evidence bundle (spec excerpt, `git status --short`, the complete diff, and
the configured generated-bundle exclusions), auto-assembles the cross-round
issue ledger from prior rounds' `sN-issues*.json` + the orchestrator's
`sN-remediation-round-<R>.md` settlement sidecars (Set 096 — settled vs
unresolved split by settlement evidence, fail-closed), fills
`ai_router/prompt-templates/verification.md` (which carries the
consequence-graded severity rubric), routes
`task_type="session-verification"` to a different provider, writes the raw
`sN-verification*.md` artifact before printing, writes
`sN-issues*.json` when the round bears findings, classifies blockingness with
`is_blocking_verdict`, and patches `disposition.json` with
`verification_method: "api"` plus the verifier's exact verdict token.

#### The phased loop (Set 096) — the default Step 6/7 procedure

Set 095 measured why the classic find→fix→re-verify loop churns: reviewers
are **salience-limited, not context-limited** — each pass returns the most
salient handful of technically-real findings, each fix reshuffles salience
(17 non-converging rounds / 39 fresh Majors under the ungraded prompt), and
~1/3 of later findings were defects in remediation-added content. The Set
096 S1 fan-out experiment measured the fix at the finding level: K
same-state discovery calls return largely **disjoint** finding sets
(same-model pairwise Jaccard 0.13–0.31), so the harvest is fanned out up
front and remediation is reviewed against the fix delta, where churn cannot
compound. Run Step 6 as phases (`--phase`), not undifferentiated rounds:

1. **`--phase discovery`** (INITIAL_DISCOVERY) — the exhaustive harvest:
   all severities, coverage-over-salience framing, fanned out
   `verification.discovery.fan_out` ways (default 2 — the S1-measured
   sizing: ~81% of the observable finding pool vs ~50% for one call) over
   the SAME evidence bundle, merged into ONE round envelope (per-issue
   `discoveryCall` + `discoveryLens`). **Set 111 S1: the K calls are
   differently FRAMED, not identical.** Call 1 reads under the
   `spec-conformance` lens (plan → diff: unmet deliverables, silent scope
   changes, docs that no longer match the code); call 2 under the
   `failure-scenario` lens (code → the ways it breaks: error paths,
   partial failure, concurrency, platform/encoding, cleanup, untrusted
   input); K>2 cycles the list. Same K, same cost, same loop position,
   same merge — only the direction of the read differs, so the clean-run
   fast path and the cost-scales-with-badness incentive are untouched
   (this is the only surviving residue of the discarded parallel-lens
   proposal). Neither lens narrows scope, and the severity rubric is
   unchanged — discovery raises coverage, never severity. The round also
   records a `discoveryBaselineTree` working-tree snapshot the later
   fix-delta review diffs from.
2. **`--phase supplementary`** (SUPPLEMENTARY_DISCOVERY) — **only when
   discovery found Critical/Major, and BEFORE any remediation**: a
   completeness-critic pass over the SAME evidence, fed the prior
   findings with a do-not-re-report instruction (prompt decorrelation —
   the S1-measured default). `verification.discovery.provider_diversity:
   cross-provider` additionally *prefers* a third provider family for
   this pass (a preference: it degrades loudly to the base
   orchestrator-only exclusion when nothing survives). A clean discovery
   round skips this phase entirely.
3. **Remediate once, against the merged finding set** — every
   Critical/Major from both passes, graded by the consequence rubric;
   write the `sN-remediation-round-<R>.md` settlement sidecar(s). Minors
   are recorded, never re-rounded.
4. **`python -m ai_router.acceptance_harness --round <R>`** (Set 111 S2)
   — run the verifier's own acceptance criteria for round `R` against the
   pre-fix and fixed trees. See *Acceptance criteria and the harness*
   below. Optional in the sense that the round still works without it;
   skipping it just means every finding arrives at step 5 as an open
   question.
5. **`--phase remediation-review`** — the reviewer's evidence is the
   **fix delta only** (a tree-to-tree diff from the discovery baseline to
   the current working tree) plus the auto-assembled ledger and, when the
   harness ran, its results; per-finding verdicts `fix-accepted /
   fix-rejected / accepted-with-modification`; **new defects are
   admissible only within the fix hunks** (out-of-delta observations are
   NITS at most).

**Bounded totals (routed `api` path), ENFORCED since Set 111 S1:** at
most **2 discovery passes** (the initial + one supplementary), at most
**2 remediation-review cycles**, and at most **2 classic no-`--phase`
rounds**; past any bound the loop **suspends to the operator for
adjudication** — it does not keep opening rounds. These numbers are not
new; what is new is that `verify_session` **refuses** the round that
would pass one, before any metered call, instead of printing an advisory
line after it. The bounds had been advisory-only and were exceeded in
practice (one session ran 13 verification calls over 379 minutes *after*
the cap shipped), which is why enforcement — not a different number —
was the fix.

**One budget, every route (Set 116 S2).** Enforcement originally lived
only in the `verify_session` CLI, so the **close backstop** — which runs
the same verification in-process during a close — resolved a round and
routed with no bound at all. Router metrics show it reaching rounds
**5–10** (Set 111 S2), **5–12** (Set 112 S3) and **5–7** (Set 114 S1):
unauthorized, absent from `sN-rounds.jsonl`, and invisible to the very
arithmetic that was supposed to be capping them. A backstop round now
evaluates the same bound through the same function before any metered
call, and — carrying no `--phase` — consumes the **classic** budget like
any other unphased round. At the cap it **refuses** and names the two
exits that already exist (`close_session --manual-verify`, or the
operator authorizing one more round through `verify_session`); the close
blocks rather than buying another round. Every backstop round is
appended to `sN-rounds.jsonl` like any other, tagged with a `source` of
`close_session_backstop`, so the ledger is the true count instead of
something to be reconstructed from router metrics afterwards. The order
matters: the bound is checked **after** the settling-evidence skip, so a
session that ran a long loop and then verified clean still closes — the
budget bites only when a close has no settling evidence *and* the loop is
already spent.

The discovery **fan-out** is the third route, and it was already inside
this budget: its K parallel calls are one round (the `-fanout-<k>`
siblings are outside `resolve_round`'s scan, and one `round-completed`
record is written per round), so widening K never costs extra budget.
That property is now asserted rather than merely true.

Only **findings-bearing** rounds consume a budget, with one exception the
loop's own record had to be extended to see: a clean round ends the loop
on its own, and a `--wording-only` re-verify re-collects the verdict
FORMAT of a round that already happened, so neither is a cycle — but a
**clean `supplementary` round whose prior discovery blockers still
stand** *is* the second discovery pass (the loop continues to
remediation) and it writes no findings envelope. The bound therefore
counts the union of the per-session round ledger `sN-rounds.jsonl`
(every completed round's phase, verdict and `endedLoop`) and the findings
envelopes, by round number — so sessions predating the ledger keep their
enforcement and no round is counted twice. The classic path is bounded on
**any** prior consuming round, so dropping `--phase` at the phased bound
is not a one-flag bypass.

Passing a bound requires the **operator's** recorded authorization —
never the orchestrator's own:

```
python -m ai_router.verify_session --session-set-dir <set> [--phase ...] \
    --operator-authorized-round "<the operator's reason>"
```

The flag alone is not an authorization: its value must be non-empty (the
same contract as `close_session --manual-verify`), and it is appended to
the same `sN-rounds.jsonl` ledger — append-only, written *before* the
metered call it authorizes, so an authorization the operator actually
gave survives a provider failure. Remember what an adjudication settles:
it licenses the **stop**, not the truth. A finding waived at the bound is
an owed residual with a named owner, never argued down to nothing.

The severity gate is unchanged and is now structural in the CLI's exit
path: only a Critical/Major (or unknown-severity) finding opens or
continues any phase, and a **Minor-only round is named as such and
directed straight to close** — the CLI offers the `close_session` command
and no re-run command at all. The operator's round-cap authority stands —
persisting past an operator cap requires a material Critical/Major,
nothing less. Invoking `verify_session` **without `--phase` keeps the
classic single-call behavior** (compat), subject to the same severity
gate and the same enforced max-2-rounds rule.

#### Acceptance criteria and the harness (Set 111 S2)

Re-verification is an **open** prompt — *"look at this again"* — which is
why a salience-limited reviewer keeps returning fresh findings, and why
the orchestrator ended up deciding when its own fix was adequate and
writing its own falsifier (self-marking). An acceptance criterion is a
**closed** question, written by the verifier at finding time, in the same
Issue block as the finding:

```
  - Acceptance criterion: `<one command>`      (or)  JUDGMENT - <one sentence>
  - Acceptance expectation: exit 0, output contains "..."
```

It lands in the round envelope as the optional per-issue `acceptance`
block (`docs/session-issues-schema.md` → *Acceptance criteria*), parsed
tolerantly: an absent or malformed criterion never changes blocking
classification.

**A criterion is not evidence until it discriminates.** The harness runs
each **unchanged** criterion twice — against the round's
`discoveryBaselineTree` (pre-fix) and a fresh snapshot of the working
tree (fixed) — and a finding **auto-closes only when the criterion fails
before and passes after**:

```
python -m ai_router.acceptance_harness --session-set-dir <set> --round <R>
```

Every other outcome leaves the finding blocking and judgment-based, which
is the fail-closed direction:

| Outcome | Meaning |
|---|---|
| `auto-closed` | Failed pre-fix, passed post-fix. The only closing outcome. |
| `not-discriminating` | **Already passed pre-fix** — vacuous; passing after proves nothing. |
| `still-failing` | The fix does not satisfy the verifier's own condition. |
| `test-asset-modified` | The remediation edited a test asset the criterion names — the person being judged moved the ruler. |
| `runner-not-attributable` | The criterion invokes a **test runner**. A runner's result depends on both the product code and every test asset it collects, neither of which is knowable from the command line, so a pass cannot be attributed to the fix. Never run, never closes. |
| `criterion-changed` | The criterion in the envelope does not match the one the **verifier wrote** in the round's raw artifact. |
| `criterion-unbound` | The raw verification artifact could not be read, or carries no criterion for this finding — so there is no verifier-authored source to bind to. |
| `baseline-mismatch` | The only pre-fix tree available belongs to an **earlier round** than the one that raised the finding. Only discovery-family rounds record a baseline, so a remediation-review round's criteria have no sound "before" tree; a fails-before there would not be attributable to the fix. |
| `refused-unsafe` | Carries a shell operator, names a shell or fetch tool, or is empty/untokenizable. |
| `judgment` / `no-criterion` | Never executed; settled by the review as before. |
| `error` | Timeout or spawn failure — not evidence either way. |

Results are written to `sN-acceptance-round-<R>.json` (loop bookkeeping,
excluded from the work-diff freshness binding like the envelopes it
annotates) and are read back into the remediation-review's framing, where
criteria-closed findings arrive **with both runs' evidence attached**.

**Scope, and why a test runner can never close a finding.** A criterion
that names paths is judged on those subtrees. A criterion that invokes a
**test runner** — `pytest`, `go test`, `npm test`, `vitest`, … — is
**never attributable and never auto-closes**, whatever the run does: its
result depends on both the product code and every test asset it collects,
and the harness can determine neither from the command line.

Set 111 S2 established this the hard way — **six consecutive verification
rounds each found a different spelling** a narrower rule missed: `pytest`
with no path, a targeted file versus the `conftest.py` it loads, `./`
versus the literal `"."`, `tests/fixtures/` reached through an ancestor,
`go test ./...` with `*_test.go` unrecognised, and colocated snapshot
files. Every fix was correct and every one was followed by another
spelling, because *"what counts as a test asset"* is an open-ended
classification problem across every ecosystem. The rule was replaced
rather than extended a seventh time. The practical cost is nil: every
runner criterion this machinery has seen was invalidated anyway. **A
probe that drives product code by path is the criterion that closes** —
which is what the template now tells verifiers to write.

**Containment — verifier-authored shell is untrusted input.** Criteria
never run in the live working tree. Each criterion gets its **own fresh
pair** of disposable git worktrees checked out from the captured tree
objects (a shared pair let one criterion's writes rewrite the tree the
next was judged against), with **no shell** (shell operators are refused,
not interpreted; a shell or fetch tool as `argv[0]` is refused too), a
**credential-stripped process environment**, a wall-clock timeout, and
cleanup on every path including errors.

**It is containment, not a sandbox — and the docs must not claim
otherwise.** The harness does not block the network; on Windows a child
can still read User/Machine-scope environment variables and OS credential
stores whatever was stripped from its own environment; and the disposable
checkout is only the child's **working directory**, not a filesystem
confinement — an **absolute-path** write, or a reach into the main
checkout through the shared git directory, is not prevented. What is
actually true, narrowly: a criterion's ordinary **relative** reads and
writes land in a throwaway checkout rather than your working tree, it
cannot silently use a shell, and it cannot inherit your keys through the
process environment. Nothing stronger. Read the criteria in a round's raw
artifact as code.

**Two further limits, stated because they bound what a pass proves.**
Criteria run under the harness's own interpreter — so a venv or bare
`python` in `argv[0]` is rewritten to it, which is what makes the
documented `.venv/Scripts/python.exe` form work at all inside a checkout
where `.venv/` is gitignored. That interpreter has the project installed
**editable against the main checkout**, so a criterion that *imports* the
installed package measures the main tree, not the disposable one:
criteria must exercise the checkout **by path**.

**What this does NOT do.** Baseline discrimination proves a criterion is
*related* to the defect; it does not prove it is *sufficient*, and no
adequacy checker is built (proposal §10 Q2/Q3 — deliberately unresolved).
That is why **exactly one `remediation-review` is retained**: Set 109 S4
is the measured counterexample — a fix satisfied its finding's reasonable
criterion cleanly and left an adjacent end-of-set deliverable unmet, a
property of *what the fix broke* that no criterion written at finding
time could anticipate. Coverage is unchanged: every ledger id still gets
its `Fix verdict:` line every cycle (the Set 096 S2 round-11 operator
decision — an exemption forfeits the regression check). What changes is
that a criteria-closed id costs one line instead of a re-derivation, so
the round's attention goes to what the fixes **broke** and what the
criteria **missed**.

#### Identity, dynamic exclusion, the stamp, and the close backstop (Set 084)

The "different provider" above is now resolved and enforced by machinery, not
by a static config pin or the orchestrator's own labels:

- **Identity is the underlying model (F1).** The verifier that must *differ*
  from the orchestrator is chosen against the orchestrator's **effective
  provider**, derived by registry lookup on the session's `model` field
  (`ai_router/orchestrator_identity.py`), never the free-text `provider` seat
  label. Multi-provider engines (`github-copilot`, `copilot`) must therefore
  pass `--model` at `start_session` (refused otherwise); `identityProvenance`
  (`direct` / `asserted`) records how identity was established.
- **Dynamic exclusion (F2).** `verify_session` (and a bare
  `route(task_type="session-verification")` given session context) passes that
  effective provider as `exclude_providers`, so verifier selection can never
  land on the orchestrator's own provider. The old static
  `session-verification:` model pin in `router-config.yaml` is demoted to a
  preference that cannot override the exclusion. When the exclusion leaves **no
  different-provider verifier** (e.g. a single-family Copilot catalog), the
  outcome is **`verification_unavailable`** — a hard blocked state, no verdict
  written, resolvable only by the operator-attested `--manual-verify` path.
- **Only stamped evidence corroborates (F3).** The verification metrics row is
  stamped (`source: "verify_session_cli"` or `"close_session_backstop"`,
  evidence hash, canonical template id + normalized hash, verifier/orchestrator
  identities, artifact path + byte-exact hash, package version, and the
  verdict). The Set 083 close gate accepts **only** a row with a valid,
  internally consistent stamp — a bare `route()` row no longer corroborates a
  close. The stamp is **drift/affordance control, not cryptography**.
- **The close backstop.** On a close with no valid stamped evidence,
  `close_session` does not merely refuse — it **runs the verification itself,
  in-process**, through the same exclusion machinery, then proceeds on
  `VERIFIED` / refuses with the findings on blocking `ISSUES_FOUND` / blocks on
  `verification_unavailable`. The orchestrator no longer holds the last word;
  `verify_session` remains the sanctioned way to **pre-empt** the backstop with
  an iterative remediation round. Full contract:
  [`ai_router/docs/close-out.md`](../ai_router/docs/close-out.md) → Section 3
  step 6b and step 7.

Manual `route()` composition is a fallback only, for environments where the
CLI cannot run. If you use the fallback, you must reproduce the CLI contract:

1. Collect all files created or modified during the session.
2. Build a verification prompt with: spec excerpt + `git status --short` +
  complete diff + build results. **The prompt must include the structured
  JSON response schema** (defined in
  `ai_router/prompt-templates/verification.md`) so the verifier returns
  `{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}` rather than a
  bare paragraph.
3. Execute `route(content=..., task_type="session-verification", ...)`, then
  write `result.content` to `sN-verification*.md` **before** displaying or
  logging it.
4. **Never edit the saved review file.** If verification is retried, save each
  follow-up pass as a sibling root file such as `sN-verification-round-2.md`,
  not under `session-reviews/`.
5. **Persist the structured findings if the round is not `VERIFIED`.** When the
  verdict is `ISSUES_FOUND`, write the issue list to `sN-issues.json` or
  `sN-issues-round-<M>.json` using
  [`docs/session-issues-schema.md`](session-issues-schema.md). A `VERIFIED`
  round writes no issue file.
6. Log the verification step.
7. **Record the verdict in `disposition.json`.** Set `verification_method` to
  `"api"` and `verification_verdict` to the verifier's `"VERIFIED"` or
  `"ISSUES_FOUND"` token. `close_session` reads this via
  `resolve_close_verdict()` and writes it to `session-state.json`'s
  per-session `verificationVerdict`. The Set 083 verification-integrity gate
  then corroborates the claimed verdict against a cross-provider
  `session-verification` metrics row and the raw verification artifact.

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
ceiling without spinning on nits. This discipline governs the routed re-verify
loop (Step 7's *"Re-run verification (max 2 retries)"*).

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
2a. **The doc-only cap (Set 119 S1) — the one exception, and it is
   path-derived.** Every finding now carries `evidencePaths`: the
   repo-relative paths the verifier actually read, mandatory in the
   templates on a Critical/Major finding, parsed from the `Evidence
   paths:` line on the push surface and the `evidencePaths` array of
   `submit_verdict` on the pull surface. A finding whose cited paths are
   **all documentation prose** (`.md` / `.markdown` / `.rst` / `.txt`) is
   recorded at **Minor** and opens **no** round — `is_blocking_issue`
   applies it at the one shared chokepoint, so both surfaces inherit it
   identically, and `classify_blocking` reports the demoted findings in
   `doc_capped_issues` and names the count in its `reason`. This is an
   **operator-attested verification reduction** (Set 119 S1
   `decisions.jsonl`, `authority=human` / `rubric_line=verification-reduction`),
   authorized on the measurement that 520 of 572 findings in this repo's
   history are Major and that Set 116 S3 spent 13 routed calls / $4.75 on
   rounds whose every Critical/Major concerned the wording of one markdown
   doc — two of the three *created by fixing the previous one*. Three
   properties keep it from being rule 2 running in reverse: **doc-ness is
   derived from paths, never self-declared** (a verifier's `category` or
   prose claim changes nothing); **absence is not doc-ness** (a finding
   citing no paths is unchanged — unknown still blocks, so an uncited
   blocking finding is not cheaper); and **behaviour-bearing markdown is
   not documentation** (`ai_router/prompt-templates/**` are the verifier's
   own instructions, so a defect there keeps its declared severity).
3. **A round continues only on new or unresolved Critical/Major** — tracked by
   the **cross-round issue ledger**, which is machinery since Set 096:
   `verify_session` auto-assembles it from prior rounds' immutable
   `sN-issues*.json` envelopes plus the orchestrator's
   `sN-remediation-round-<R>.md` settlement sidecars and prepends it to the
   prompt. **No-resurrection framing must be earned:** a prior finding renders
   as SETTLED only with settlement evidence (a settling per-issue
   `resolution_status`, or a non-empty remediation-note sidecar for the
   round); everything else renders UNRESOLVED with an instruction to
   re-evaluate it — re-raising an unsettled point is not resurrection, and
   the ledger never suppresses an unremediated defect. **A settled point is
   never re-opened under fresh wording.** (`reconcile_issue_ledger` remains
   the id-keyed reconciliation helper for callers that track stable
   `issueId`s across rounds; recognising that two differently-worded
   findings are the *same* point is the orchestrator's judgment.)
4. **Bounded totals (Set 096 restructure; ENFORCED since Set 111 S1).**
   On the phased path the bound is **≤2 discovery passes and ≤2
   remediation-review cycles**; on the classic (no `--phase`) path it is
   **≤2 rounds**, counted over any prior consuming round so the
   phased bound cannot be sidestepped by dropping the flag. A round
   consumes its budget unless it ENDED the loop, read from the
   per-session round ledger `sN-rounds.jsonl` unioned with the findings
   envelopes. Past a bound
   the loop **suspends to the operator for adjudication** and
   `verify_session` **refuses the round** unless the operator's
   `--operator-authorized-round "<reason>"` attestation is supplied (and
   recorded in that same ledger). A human-stop
   disposition or an unfixed Critical/Major still stops to a human, and
   the operator's round-cap authority stands. Set 071 removed the
   *Minor-only* and *resurrected-nit* rounds that should never have
   opened — Set 111 S1 made that structural, so a Minor-only round's
   printed next action is the close command and nothing else; Set 096
   moves the harvest up front so remediation is reviewed once, against
   the fix delta, where churn cannot compound.

**Path-aware-critique close-out gate (Set 066).** A content-aware
close-out gate that fires when the durable `pathAwareCritique` record — an `activity-log.json`
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
  non-TTY / headless** or under `--accept-suggestions`;
- `advisory` — **always soft-warns** and never blocks;
- `none` — skips entirely (strictly opt-in; a set that declares nothing
  pays no gate, preserving the walk-away promise).

It fires only on the set-terminal close and is fail-open in the
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
1. **Complete the harvest before touching anything** (phased path): when
   the blocking round was `--phase discovery`, run `--phase supplementary`
   FIRST — before any remediation — so the fix set is planned once,
   against the merged findings, and later review scopes to one fix delta.
2. Parse issues from the verifier's response (`verify_session` already
   merged and persisted them to `sN-issues*.json`).
3. Fix each Critical/Major. Update status to "fixed" or "deferred", and
   write the `sN-remediation-round-<R>.md` settlement sidecar — the
   auto-assembled ledger treats a status-less finding as settled only
   when the round has a non-empty sidecar. Minors are recorded, never
   re-rounded.
4. Record the findings and what happened to them in the current
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
5. Run the acceptance harness for the findings-bearing round(s) —
   `python -m ai_router.acceptance_harness --session-set-dir <set>
   --round <R>` — so the fix-checking that CAN be settled by execution is
   settled before a model is asked. A finding auto-closes only when its
   unchanged criterion **fails pre-fix and passes post-fix**; everything
   else stays blocking and judgment-based (see *Acceptance criteria and
   the harness* under Step 6).
6. Re-verify — **only when the round is blocking** (≥1 Critical/Major; a
   Minor-only round is not re-run, and the CLI now says so and offers
   only the close command). On the phased path this is
   `--phase remediation-review` (the fix delta + the auto-assembled
   ledger + the harness results; **at most 2 cycles**, ENFORCED — the
   third is refused without the operator's `--operator-authorized-round`
   attestation — then operator adjudication). On the classic path, a
   plain re-run (max 2 rounds, enforced the same way). The
   auto-assembled ledger keeps a settled point from being resurrected
   under fresh wording (see *Materiality and the re-verify loop
   discipline* under Step 6). Phased rounds default to
   `complexity_hint=85`; pass it explicitly on a classic re-verify after
   Critical/Major fixes.

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
verification — and on a close that arrives without valid
stamped verification evidence, **runs the verification itself
in-process (the Set 084 close backstop)** before the gate chain,
blocking on `verification_unavailable` and never passing an
unverified close (see `ai_router/docs/close-out.md` Section 3 step
6b) — emits ledger events, and writes idempotent state
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

**Find out before you close — `close_preflight` (Set 119 S2).** Close-out
is not slow (median 0.1 min); it **fails** — 122 of 295 measured sessions
failed at least once, mean 1.6 attempts, max 9, every one of them an
obligation nobody knew they had until a gate refused. Run

```bash
.venv/Scripts/python.exe -m ai_router.close_preflight \
    --session-set-dir docs/session-sets/<slug>
```

at any point in a session to see every obligation in one pass — met and
unmet, blocking and advisory — each with the predicate's own remediation
and the action that satisfies it. It has **no side effects and makes no
routed call**, so it is safe to run repeatedly, including while a close
holds the lock.

It **reports; it never refuses.** The blocking/advisory split is read
from `gate_checks.is_blocking_check` and every verdict comes from calling
the predicate `close_session` calls, so it can neither refuse something
the close allows nor miss a demotion. It is not a gate and adds none.

Its one addition beyond the gate chain is a **cost warning**: it answers
"would the verification backstop fire?" — 79 of 214 recorded
check-failures, each spending a routed call *at close time* — by walking
`close_backstop.decide_backstop`, whose every branch is a read. A close
that would buy a round is reported as expensive, not as blocked (a
backstop round returning VERIFIED closes fine); the sanctioned response
is to run `verify_session` yourself first, where the findings can be
iterated on instead of met inside a close. Full contract:
[`ai_router/docs/close-out.md`](../ai_router/docs/close-out.md) →
Section 1, *Finding out early*.

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
must close through `close_session` so the events
ledger (`session-events.jsonl`) stays authoritative. Hand-authoring
`session-state.json` to declare a session complete without running
the gate produces mixed-mode drift: the snapshot says complete but
the ledger has no `closeout_succeeded` event for that session, the
spend report misses the session's cost, and consumers (the Work
Explorer extension) downgrade the bucket to In Progress
because the ledger is the authoritative signal. Recovery for an
already-drifted set: see
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
| Events ledger           | `closeout_requested` + `closeout_succeeded`  | `closeout_requested` + `closeout_succeeded`  |

`close_session` runs this protocol automatically —
`_flip_state_to_closed` appends `currentSession` on every close via
`compute_effective_completed_sessions` (which also backfills the
array from the events ledger if it was empty on a legacy set).

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
2. **Pointer to `docs/session-constitution.md`** — the per-session
   operating doc (Set 085)
3. **Pointer to `docs/planning/project-guidance.md`**
4. **Pointer to `docs/planning/lessons-learned.md`**
5. **Pointer to this workflow doc** as the on-demand execution
   reference
6. **AI router import snippet** — how to load the `ai_router` module
7. **API key export commands** — platform-specific commands to load keys
8. **Build and test commands**
9. **Solution structure**

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

#### Routing through the GitHub Copilot CLI (Set 078)

Projects normally dispatch every call over a direct provider HTTPS API
(`transport.profile: api` in `router-config.yaml`, the default).
Shops whose staff hold only a GitHub Copilot seat — no `DABBLER_*` provider
key is possible under corporate policy — can instead set
`transport.profile: copilot-cli`, which routes every call through the
Copilot CLI's headless mode while every other mechanic (task
typing, tiering, cross-provider verification, metrics) stays unchanged.
The guarantees are explicitly degraded (asserted, not confirmed, provider
provenance; no locally meterable billing), and the seat must serve **at
least two provider families** or verification has nothing to cross to —
`python -m ai_router.copilot_preflight` reports which case a seat is in.
This is the option that replaced the Lightweight tier for keyless shops
(Set 112); the setup checklist is
[`docs/copilot-seat-setup-checklist.md`](copilot-seat-setup-checklist.md).

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

### Temporary verification-only policy (Set 110 S4 through Set 112)

The operator has narrowed outsourcing for the current queue. The active
orchestrating agent owns implementation, architecture decisions, analysis,
documentation, test authoring, and close-out mechanics. The only task routed
through the AI Router is `session-verification`, and it must be verified by a
different effective provider. Set 111 owns the next revision of these routing
rules; Set 112 follows that decision while removing the Lightweight tier.

This temporary policy is represented by `routing.outsourcing_mode:
verification-only` and the one-entry `delegation.always_route_task_types`
list in `ai_router/router-config.yaml`. Do not infer a broader delegation
requirement from the general guidance below during this queue window.

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

Under the repository's normal policy, the orchestrator **always** routes
these through `route()`, never performs them itself:

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

## Decision rights — the rubric

> **Canonical.** This section is the authority on **who decides what**
> during a session. Proposal §11 of
> [`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`](proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md)
> is the decision record; Set 111 Session 3 canonized it here and encoded
> it in `ai_router/decision_journal.py`. *Decision-time consensus* below
> is no longer a parallel mechanism with its own eligibility split — it is
> **tiebreak 5** of this rubric.

### Route by authority, not by judgment load

Operator-gated adjudication assumes an operator who can responsibly
decide. In an AI-led workflow the operator usually **lacks the surfaced
context**, and most operators will not rebuild it — so a stop that asks
them to adjudicate a judgment call is not a safety measure, it is a
context transfer they did not ask for and cannot afford.

So the question is never *"is this hard?"* — it is **"whose authority or
preferences does this need?"** Difficulty is not a routing signal. A
genuinely hard call the AI has more context on stays with the AI; a
trivial call that spends the operator's money does not.

This also passes the **capability-scaling test**: a rubric executed by
models improves as models improve, whereas an operator gate is a fixed
bottleneck that does not.

### Human-required (four classes, no exceptions)

| Class | `rubric_line` | What it covers |
|---|---|---|
| External or hard-to-reverse consequence | `external-consequence` | Publishing to a registry, pushing tags, spending money, deleting anything **beyond version control's undo horizon**, force-push |
| Underivable value trade-off | `value-trade-off` | Business priority, taste, what the operator's staff will tolerate — the answer depends on what the operator *wants*, not on what is *true* |
| Accountability sign-off | `accountability-sign-off` | Someone must be accountable for the sign-off itself (UAT attestation, release approval) |
| **Reduces verification** | `verification-reduction` | **The hard carve-out.** See below |

The **verification carve-out** is absolute: decisions that reduce
verification stay outside AI authority, always. The agent never authors
its own permission — that is the no-skip mandate stated as a decision
right. It is checked **first**, so a decision that is both
verification-reducing and externally consequential records the carve-out
as the firing line: it is the one that can never be delegated back.

Verification-reducing decisions include lowering or waiving a loop bound,
narrowing the fan-out, dropping a phase, relaxing an enforced gate,
`close_session --force`, `--manual-verify`, and same-provider
verification. `ai_router.decision_journal.record_decision` **refuses to
write** an AI-authority record whose `verification_effect` is `reduces`;
the operator's own record additionally requires a non-empty
`operator_attestation`.

### Everything judgment-shaped is AI-decidable

Spec-vs-reality conflicts, waiver adjudications, severity disputes,
refactor placement, file layout, scoping, test-shape choices — all of it
is the orchestrator's call, resolved by the **ordered tiebreaks**. Apply
them in order and record the **first line that decides**:

| # | `rubric_line` | The tiebreak |
|---|---|---|
| 1 | `goal-over-letter` | The spec's **goal** over its unmeetable **letter** |
| 2 | `prefer-reversible` | Prefer the reversible option |
| 3 | `simpler-code` | Tied → the option that makes the code simpler: fewer branches, fewer tests needed to hold it true |
| 4 | `defer-to-existing-gate` | Prefer deferring evidence to an **existing later gate** over inventing a new one |
| 5 | `cross-provider-consensus` | Still tied → cross-provider consensus (*Decision-time consensus*, below) |
| 6 | `escalate-to-human` | Consensus splits → the human, as an **education-mode brief** |

Ordering matters. Tiebreak 3 is reached only when 1 and 2 did not
decide — "the simpler option" never overrides a correctness or
reversibility argument, it breaks a genuine tie between options that are
otherwise equally good.

### The human is an auditor, not a gate

Every AI-made call is **journaled** for after-the-fact operator audit.
That is what makes the delegation safe: the operator is not asked to
pre-approve judgment calls, they are given a reviewable record of them.

- **Artifact:** `<session-set-dir>/decisions.jsonl`, append-only, one
  JSON object per decision, git-tracked so the trail travels with the
  repo.
- **Sanctioned writer:** `ai_router/decision_journal.py`. Nothing else
  writes the file — a hand-appended line is the decision-rights
  equivalent of a freehand state edit.
- **Every record carries** the question, the decision, the `authority`,
  the **`rubric_line` that fired**, the **options considered** (each with
  its consequence and reversibility), the overall `reversibility`, and
  the declared `verification_effect` (`none` / `strengthens` /
  `reduces` — mandatory, no default).
- **UX-preference deferrals** are journaled with `uat_decide: true` at
  the moment they are deferred, so the UAT walk's *Decide* section can be
  assembled from
  `python -m ai_router.decision_journal --session-set-dir <dir> --uat-decide-only`
  instead of reconstructed from memory at the end of the set.

```bash
# The rubric lines the journal accepts (reads nothing from disk):
.venv/Scripts/python.exe -m ai_router.decision_journal --rubric

# Read a set's journal; --uat-decide-only filters to the UAT Decide items:
.venv/Scripts/python.exe -m ai_router.decision_journal \
    --session-set-dir docs/session-sets/<slug>

# Append one decision (JSON object; '-' reads stdin). Exit 5 = REFUSED.
.venv/Scripts/python.exe -m ai_router.decision_journal \
    --session-set-dir docs/session-sets/<slug> --append-json -
```

`decisions.jsonl` is listed in
`verification_stamp.WORK_DIFF_SET_BOOKKEEPING`, so journaling an
adjudication **after** a verification round does not stale that round's
evidence — necessary, because the rubric makes waiver adjudications
AI-decidable and those happen after the round by definition, and a stale
stamp sends the close backstop into a fresh, unbounded metered round.

**Freshness-exemption is not evidence-exclusion**, and the two must not
be confused — this session's own supplementary round caught the author
conflating them:

- *Freshness* asks "did the reviewed work change after the stamp?" A
  record **about** the work can be exempt, because the code and doc
  changes the decision produced bind the diff on their own.
- *Evidence* asks "what should the verifier read?" The AI-authority
  decision record is exactly what a reviewer should see. Suppressing it
  would be a **verification reduction**, which no orchestrator may
  self-authorize.

So the journal is freshness-exempt but stays **visible** in a `--phase`
round's evidence: `verification_stamp.EVIDENCE_VISIBLE_BOOKKEEPING`
names it, and `PHASED_EVIDENCE_SET_EXCLUDES` (what the evidence bundle
actually excludes) is derived from the freshness list minus those
entries, so the two cannot drift on any shared entry.

### What this does not change

- **Cross-provider exclusion and ground-truth anchoring are exempt**
  from simplification (capability-scaling test). No rubric line can trade
  them away.
- **The irreversible-actions list** in
  [`docs/session-constitution.md`](session-constitution.md) → *Irreversible
  actions* is the same bright line as the `external-consequence` and
  `verification-reduction` classes above, phrased as actions rather than
  decisions. When the two surfaces are read together, the constitution's
  list wins on *what is irreversible*; this section wins on *how a
  decision is routed and recorded*.
- **An adjudication settles the stop, not the truth.** A finding waived
  at a bound is an owed residual with a named owner — journal it as such.

---

## Education-mode briefs (every operator stop)

When the rubric routes a decision to the human — a human-required class,
or tiebreak 6 — the ask runs in **education mode**. This format is
**required** for any operator stop, whether it is surfaced through
`AskUserQuestion`, a CLI prompt, or prose in the session transcript.

The reason is the same one that motivates the rubric: the operator has
not been watching. A question that assumes shared context produces either
a rubber stamp or a stall, and both are worse than no question.

**The canonical five parts, in this order:**

1. **Where the set stands** — one or two sentences. Which set, which
   session, what has landed, what is blocked on this answer.
2. **The question, in one sentence.** If it does not fit in one
   sentence, it is more than one question — split it.
3. **The options, each with its likely consequence and cost.** Name what
   happens if it is chosen, including what it forecloses. Two to four
   options; if there is only one, this is a notification, not a question.
4. **A recommendation, with confidence.** State which option you would
   take and how sure you are. Withholding a recommendation to seem
   neutral pushes the context-rebuilding work back onto the operator,
   which is the failure this format exists to prevent.
5. **The default on no answer.** What happens if the operator does not
   reply — including "the session stops here", which is a legitimate
   default and must be stated when it is the true one.

**Worked example:**

> **Where the set stands.** Set 111 S3 (decision rights) is complete
> except for the journal's placement in the verification stamp's
> bookkeeping list. Everything else is committed.
>
> **The question.** Should `decisions.jsonl` count as loop bookkeeping
> (excluded from a `--phase` round's evidence) or as session work?
>
> **Options.** (a) Bookkeeping — journaling an adjudication after a round
> cannot stale the evidence, but a phased verifier never reviews the
> journal. (b) Session work — the verifier reviews it, but any
> post-round adjudication stales the stamp and blocks the close on a
> loop bounded at two cycles.
>
> **Recommendation.** (a), high confidence — the journal's reader is the
> operator, and (b) makes the sanctioned adjudication flow unusable.
>
> **Default on no answer.** (a) ships; the trade-off is recorded in the
> journal and in the disposition, so reversing it later is a one-line
> change.

**Batch, do not trickle.** When several decisions are owed at once — the
artifact-necessity pass is the canonical case — present them as one
batched brief with a table, not as a sequence of individual prompts. A
trickle of questions is the ceremony this workflow is trying to remove.

**Do not argue an answer down.** The operator's call settles the stop.
If the orchestrator believes the decision is wrong on the merits, that is
an owed residual to record — not a re-ask under fresh wording.

---

## Decision-time consensus

`delegation.always_route_task_types` covers **task** delegation —
which kinds of work the orchestrator must route to the router rather
than perform itself. Decision-time consensus is **tiebreak 5 of the
decision-rights rubric** above: the mechanism the orchestrator reaches
for when an AI-decidable question is still tied after tiebreaks 1–4.
When the `delegation.decision_consensus.enabled` flag is `true`, the
orchestrator routes the question to a configured pair of engines in
parallel, synthesizes their responses, and escalates to the human
(tiebreak 6, as an education-mode brief) only if the engines disagree
materially or the synthesis hinges on information neither engine has.

The behavior is **opt-out by default** (`enabled: false`). Every
existing repo's `AskUserQuestion`-first behavior is preserved until an
operator explicitly flips the flag in their `router-config.yaml`.

### When to consult the engines (decision tree)

1. **Does the rubric route this to the human?** Apply *Decision rights*
   above first. If any of the four human-required classes fires —
   `external-consequence`, `value-trade-off`,
   `accountability-sign-off`, or the `verification-reduction`
   carve-out — skip consensus entirely and write an education-mode
   brief. Consensus is not a way to launder a human-authority decision
   into an AI-authority one: two engines agreeing that a bound should be
   lowered does not make it the orchestrator's call.
2. **Did tiebreaks 1–4 already decide?** If they did, decide, journal
   the firing line, and move on. Consulting engines on a question the
   rubric has already answered is spend without a decision attached —
   and on the `copilot-cli` transport that spend is real but recorded as
   `$0.0000`, so no automated guard will stop you.
3. **Is the category in `decision_consensus.categories`?** If not,
   resolve it under tiebreak 6 (education-mode brief). The category
   whitelist scopes the consult to question shapes where engines
   reliably converge; it is a **cost** control on tiebreak 5, not a
   second authority split.
4. **Route the question to both engines in parallel.** Use
   `ai_router.query()` once per engine (V1 has no `consensus()`
   helper; orchestrator manages the two calls itself). Pass the same
   prompt verbatim; do not nudge either engine toward a preferred
   answer.
5. **Synthesize the two responses into ONE concrete recommendation.**
   The orchestrator's job is judgment, not just relay. Write the
   recommendation as a single sentence that the next step in the
   session can act on directly.
6. **Apply the synthesis OR fall back per `unresolved_action`.** When
   the engines converge and the synthesis is concrete, apply it and
   journal it with `rubric_line: cross-provider-consensus`. When
   they disagree materially (different architectural sides, different
   file-layout proposals) or the synthesis depends on information
   neither engine has (operator-specific deadline, internal policy),
   honor `unresolved_action`:
   - `ask_user` (default, recommended) — tiebreak 6: surface the
     synthesized conflict to the operator as an **education-mode
     brief** with both positions stated, and journal it with
     `rubric_line: escalate-to-human`.
   - `proceed_with_orchestrator_judgment` — the orchestrator picks a
     side and records it in the journal with `applied: true` and a
     reasoned `chosen_recommendation_summary`. Reserved for
     power-user setups that have accepted the autonomy trade.
7. **Write one journal record per call.** Whether the synthesis was
   applied or punted to the operator, every consensus call appends
   one line to `journal_path`. The journal is the audit trail; a
   skipped write is a missing decision.

Two journals, deliberately: `consensus-decisions.jsonl` records the
**consult** (which engines, what they said, what it cost), while the
per-set `decisions.jsonl` records the **decision** (which rubric line
fired, what was chosen). A consensus-resolved decision writes both — the
decision record's `consensus` field carries the pointer.

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

### Eligible (V1) vs. rubric-escalated categories — examples

The four V1 categories are intentionally **mechanical** — placement,
layout, scoping. They are the highest-convergence questions, where
engines reliably reach the same answer because the choice is
structural rather than aesthetic.

The right-hand column is **not** a second human-only split — it is the
same *Decision rights* rubric applied to a neighbouring question. Each
escalated example fires a named human class; the class is given so the
mapping is checkable rather than intuitive.

| Category | Engine-eligible (tiebreak 5) | Rubric-escalated, and why |
|---|---|---|
| `refactor-placement` | "Where should this helper live — `utils.py` or a new `parsers/` module?" | "Should we refactor at all, or ship this as-is?" → `value-trade-off` when it trades the operator's schedule; otherwise it is AI-decidable at tiebreak 3 |
| `file-layout` | "One file per provider, or one file with sections?" | "Should we adopt the company-wide src layout?" → `value-trade-off` (an org preference, not a derivable fact) |
| `scoping` | "Is this change spec-scoped, or does it belong in a follow-on session?" | "Should we cut scope to make Friday's deadline?" → `value-trade-off` |
| `spec-clarification` | "The spec says `X`; given the surrounding context, does it mean X1 or X2?" | "The spec says X; do we want X or Y?" → `value-trade-off` |
| *(never eligible)* | — | "Can we run one discovery pass instead of two?" → `verification-reduction`. Engine agreement is irrelevant; this is the hard carve-out |

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

- **The rubric's human classes.** The decision tree's step 1 is the
  bright line: `external-consequence`, `value-trade-off`,
  `accountability-sign-off` and the `verification-reduction` carve-out
  are not consensus-eligible regardless of what the flags allow. Two
  engines agreeing does not create authority neither of them has.
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
2. **Never skip verification.** Every session must be independently
   verified by a **different-provider** verifier via
   `python -m ai_router.verify_session` (the orchestrator's model-derived
   effective provider is excluded; a bare `route()` fallback must reproduce the
   same contract and stamp). You cannot skip it — reach close-out unverified and
   `close_session` runs the verification itself (the Set 084 backstop).
   `session-verification` ALWAYS routes cross-provider — this is the one
   constraint that survives any maxout suffix or
   orchestrator-model-matches-routing-target shortcut.
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
8. **Before every session, read the preload.**
   `docs/session-constitution.md`,
   `docs/planning/project-guidance.md`, and
   `docs/planning/lessons-learned.md` (plus the engine bootstrap file)
   are mandatory pre-session context (Set 085).
   `docs/planning/lessons-archive.md` is **not** — it is the
   never-auto-loaded archive tier (Set 064), searched on demand via
   `python -m ai_router.guidance_search --archive` — and the authoring
   guide is read when authoring or revising a spec, not before every
   session.
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
    `python -m ai_router.start_session` at Step 1 so
    external tooling (VS Code Work Explorer, dashboards) sees
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
