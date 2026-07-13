# Session Constitution

> **Purpose:** The per-session operating doc for the AI-led session-set
> workflow: the happy path, the authority rules, and per-step pointers
> into the on-demand references. This file replaces the full workflow
> doc in the session-start preload (Set 085); the demoted docs stay
> canonical for their domains and are opened at their trigger moments.
> **Preload budget:** this file is capped at 4,000 tokens by the
> `guidance.preload` manifest — at ceiling, adding prose requires
> removing prose.

## Required reading — the whole preload

Before every session, read exactly:

1. This file.
2. `docs/planning/project-guidance.md` — principles and conventions.
3. `docs/planning/lessons-learned.md` — the **active** lessons tier.
4. Your engine bootstrap file (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`).

Nothing else is preload. Do **not** auto-load
`docs/planning/lessons-archive.md` (search it on demand:
`python -m ai_router.guidance_search --archive`). The workflow doc,
schema doc, close-out doc, and authoring guide are **on-demand
references** — authoritative for their domains, opened at the trigger
moments in the per-step pointer table at the end of this file.

## The session, start to stop (happy path, Full tier)

Run every router CLI through the workspace venv
(`.venv/Scripts/python.exe` on Windows, `.venv/bin/python` on POSIX) —
`No module named ai_router` means a bare `python`, not missing keys.

- **0. Preload + keys.** Read the four preload files; confirm the
  provider keys (`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`,
  `DABBLER_OPENAI_API_KEY`) are present. Missing key → stop, tell the
  human.
- **1. Register first, work second.** Resolve the active set by reading
  each set's `session-state.json` `status` (never infer from file
  presence), then, as the first on-disk action, run
  `python -m ai_router.start_session` with the set dir and your
  engine/provider (multi-provider engines also pass `--model`). The
  call is idempotent — safe after a context reset. Triage
  `decision-review-queue.jsonl` if it has entries.
- **2. Read the spec.** Cache the Session Set Configuration block and
  this session's plan (Steps / Creates / Touches / Ends-with /
  Progress keys). The flags govern the rest of the session — obey them
  at runtime, never re-litigate them mid-session; a wrong flag is fixed
  in the spec and surfaced at Step 9.
- **3. Prerequisites.** Confirm prior sessions' Creates/Touches exist.
  **3.5:** append this session's `ai-assignment.md` block; produce the
  next-orchestrator / next-set recommendations via
  `route(task_type="analysis")` — never self-opine on model choice.
- **4. Execute.** Do the plan's steps; log every step to
  `activity-log.json` (`log_step`). Delegate reasoning through
  `route()` (code review, security review, architecture, analysis,
  documentation, test generation); own the mechanics (file edits,
  shell, git, and mechanical single-file edits under ~50 lines).
- **5. Build + test.** Run the repo's suite; log the result.
- **6. Verify (mandatory, every Full-tier session).** Run the phased
  loop: `python -m ai_router.verify_session --phase discovery` for the
  set (fan-out sized by config; all severities). It routes the evidence
  to a **different-provider** verifier and writes the raw round
  artifacts. There is no skip — verification is machine-enforced at
  close, and running `verify_session` yourself is the sanctioned way to
  iterate before that enforcement fires.
- **7. Handle the verdict by blocking-ness, not the bare token.** Only
  a Critical/Major (or unknown-severity) finding continues the loop; a
  Minor-only round is effectively VERIFIED — record the nits and
  proceed. On a blocking discovery round: run `--phase supplementary`
  BEFORE remediating, fix the merged blockers once (write the per-round
  remediation sidecar), then `--phase remediation-review` on the fix
  delta. Bounds and no-resurrection: *Recovery and escalation* below.
- **8. Close.** Author `disposition.json`
  (`verification_verdict` always; `next_orchestrator` on a mid-set
  completion), commit **and push**, run
  `python -m ai_router.close_session` for the set, and only after it
  succeeds fire the session-complete notification. Record instrumental
  lessons in `disposition.lessons_cited` and run `cite_lessons` in the
  final commit.
- **9. Last session only (post-notify).** Run the reorganization review
  of `project-guidance.md` / `lessons-learned.md` — "no changes
  recommended" is a valid outcome, skipping the review is not. If the
  set's recorded `pathAwareCritique` policy is `advisory`/`required`,
  the multi-provider path-aware critique stage runs before the
  set-terminal close.
- **10. Stop.** Report verdict, deferred issues, cost, sessions
  remaining. One session per conversation; the human starts the next.

## Source of truth and conflict resolution

- **One canonical doc per domain** (the pointer table below). When two
  surfaces disagree, the domain owner wins; treat the loser as a stale
  echo and fix **every** echo in the same pass — a consistency fix is
  global, not point-local.
- **`session-state.json` is the single source of truth** for set/session
  progress and in-flight detection. File presence
  (`activity-log.json`, `change-log.md`, markers) is never a state
  signal.
- **The spec's configuration block, as captured at set start, is
  immutable at runtime.** Gate policy records (`pathAwareCritique`,
  `verificationMode`) are written once at the first `start_session`.
- **Shared operational facts live in engine-agnostic docs** (`docs/`,
  package changelogs), never only in `CLAUDE.md` / `AGENTS.md` /
  `GEMINI.md` — the bootstrap files are entrypoints, not the record.
- **Verification artifacts are raw records.** `sN-verification*.md`,
  `sN-issues*.json`, and `path-aware-critique.json` are never edited
  after they are written; retries append sibling round files.

## State-mutation discipline — blessed writers only

- `start_session` and `close_session` are the only writers of
  `session-state.json` and the events ledger on Full tier. Typed
  verification/remediation sessions, mode transitions, and
  cancel/restore go through their blessed writers. **Never
  freehand-edit state to declare progress** — that is mixed-mode drift;
  recover through the close-out doc's sanctioned repair path, not a
  hand edit.
- Lightweight tier hand-maintains the same v4 shape under the same
  invariants — open the schema doc when a state question arises.
- Guidance files: never delete a lesson — archival moves text to
  `lessons-archive.md`, operator-reviewed. Machine-stamped overhead
  headers change only via `guidance_report --write-headers`.

## Irreversible actions — operator approval required

Human-only, every time; never consensus-eligible, never self-authorized:

- Publishing to a registry (PyPI, VS Code Marketplace) or pushing tags.
- Force-push; deleting branches, non-empty worktrees, or files the
  session did not create.
- `close_session --force` (incident recovery only, never a shortcut).
- Raising any preload or guidance ceiling — ceilings ratchet down only;
  a raise is an operator config edit with a stated reason.
- Deleting guidance content (archive instead) or editing a saved
  verification artifact (never allowed at all).
- Spending beyond the declared verification budget, or anything that
  commits the operator's time or money.

## Definition of done

- **Full tier:** the session plan's Ends-with is satisfied; suite
  green; a non-blocking cross-provider verdict (VERIFIED or Minor-only)
  is recorded; `disposition.json` is complete; the work is committed
  and pushed; `close_session` succeeded; the notification fired after
  success (never on a failed gate). The final session additionally
  produces `change-log.md`, the Step 9 review, and — when armed — the
  path-aware critique artifact.
- **Lightweight tier:** same CLIs and state shape with `--no-router`;
  zero metered API calls; verification is **per-set** per the recorded
  `verificationMode`; close through the same gate.

## Recovery and escalation

- **Close gate failure** → open `ai_router/docs/close-out.md` (common
  failures, drift repair, the local-only path for deliberately
  remote-less repos). Missing `disposition.json` fields are the usual
  first-attempt cause.
- **Blocking findings** → complete the harvest, fix once, review the fix
  delta. **Bounded totals: at most 2 discovery passes and 2
  remediation-review cycles** (classic no-`--phase` path: 2 automatic
  rounds). Past a bound the loop **suspends** — it does not keep opening
  rounds:
  - **No Critical/Major after the cap** (only Minor, or *unrated*/
    unknown-severity nits remain) → treat as **Minor-only / effectively
    VERIFIED**, record the residual as adjudicated-minor, and stop.
    Unknown-severity is *not* a licence to grind: a verifier that keeps
    surfacing fresh unrated nits each round is edge-case exhaustion, and
    chasing it burns money and time for no correctness gain (operator
    rule, Set 086). Persisting past the cap requires a **material
    Critical/Major**, nothing less.
  - **An unfixed Critical/Major, or a Critical/Major the orchestrator
    disputes** → stop to the human: either get a **third-provider
    opinion** or have the **operator adjudicate**. Never re-round a
    disputed finding.
  A settled point never reopens under fresh wording — the auto-assembled
  cross-round ledger carries settled vs unresolved; a remediated round
  earns settlement via its remediation-note sidecar.
- **Disagreement with a finding** → verifiers flag, humans adjudicate.
  Present the exact finding, the dismissal reason, the context the
  verifier saw, and a self-assessment; the human picks accept / dismiss
  / re-verify reshaped / second opinion; log the adjudication.
- **Provider failure** → the router retries and falls back once on its
  own; if verification stays provider-broken, follow the escalation
  ladder and still commit — work is preserved in git for human review.
  `verification_unavailable` is a hard block resolvable only by the
  operator-attested manual path.
- **Scope doubt** → surface to the operator (or Step 9) rather than
  unilaterally expanding or cutting scope.

## Per-step pointers into the on-demand references

Open the named reference at the step's trigger moment — not before.

| Step | Open on demand | When |
|---|---|---|
| 0 | `docs/quick-start.md` | First-time orientation only — never per session |
| 1 | `docs/ai-led-session-workflow.md` | Trigger-phrase variants: parallel worktrees, maxout, typed Lightweight sessions |
| 1 | `docs/planning/repo-worktree-layout.md` | Worktree layout, migration, drift recovery |
| 2 | `docs/planning/session-set-authoring-guide.md` | Authoring or revising a spec (flag semantics, sizing, slugs) |
| 2 | `docs/ai-led-session-workflow.md` | The set declares `requiresUAT` / `requiresE2E` — the gated UAT/E2E procedures |
| 3.5–4 | `docs/ai-led-session-workflow.md` | Router config, task types, delegation thresholds, decision-time consensus |
| 6–7 | `docs/ai-led-session-workflow.md` | Verification mechanics: materiality / loop discipline detail, adjudication options, Lightweight modes |
| 8 | `ai_router/docs/close-out.md` | Close failure, stranded session, mixed-mode drift, manual-flag matrix |
| 8 | `docs/disposition-schema.md` | Authoring `disposition.json` |
| 9 | `docs/guidance-lifecycle.md` | Citation, archival, ceilings, the preload admission test |
| 9 | `docs/ai-led-session-workflow.md` | Path-aware critique stage mechanics; Step 9 procedure detail |
| any | `docs/session-state-schema.md` | Any `session-state.json` question (shape, invariants, hand-edit recipe) |
| any | `python -m ai_router.guidance_search --archive` | A lesson that might exist but is not in the active tier |
| any | `docs/guidance-slimming-playbook.md` (Set 085 S3) | Slimming an over-budget guidance corpus in another repo |
