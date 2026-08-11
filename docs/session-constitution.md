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

## The session, start to stop (happy path)

Run every router CLI through the workspace venv
(`.venv/Scripts/python.exe` on Windows, `.venv/bin/python` on POSIX) —
`No module named ai_router` means a bare `python`, not missing keys.

- **0. Preload + keys.** Read the four preload files. On the **Direct
  APIs** transport (`transport.profile: api`), confirm the provider keys
  (`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`,
  `DABBLER_OPENAI_API_KEY`); a missing key → stop, tell the human. On the
  **Copilot CLI** transport a seat carries no provider keys by design —
  their absence is not an error and nothing warns about it.
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
  - **3.5:** append this session's `ai-assignment.md` block; record the
    next-orchestrator / next-set recommendations directly during the temporary
    verification-only policy window. Set 111 owns the next routing-policy
    revision, so do not expand outsourcing before that set decides it.
  - **4. Execute.** Do the plan's steps; log every step to
    `activity-log.json` (`log_step`) **using the spec's own step
    numbers** — `start_session` seeded the plan there as `pending`
    rows, and the key (else the number) is what reconciles a logged
    step to its planned one — and **post the step checklist**
    (`python -m ai_router.session_checklist`, `--markdown` for a chat
    surface) at each named transition: session start; before a
    long-running command and again once its run is **recorded**; after
    each verification round completes; every operator stop (post before
    the brief — the gate sees the post after the decision is journaled);
    and before close. Rendering it is what
    records it, and the `checklist_posted` close gate compares that
    record against the transitions your own records show — a session
    that never posted cannot close quietly. The active
    orchestrator owns implementation, architecture, analysis, documentation,
    and test authoring for the temporary policy window. Route only
    `session-verification`, which must use a different effective provider;
    own the mechanics (file edits, shell, git, and mechanical single-file
    edits under ~50 lines).
- **5. Build + test — targeted only.** Run the tests covering what you
  just changed; log the result. **Do not run a full suite here** — not
  even "just to see": Step 7 remediation is a code change, so it is
  invalidated in nearly every session. Set 112 S3 obeyed the old
  ordering into 15 runs and 186 minutes (Set 116 S3).
- **6. Verify (mandatory, every session).** Run the phased
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
  remediation sidecar), run `python -m ai_router.acceptance_harness
  --round <R>` (a finding auto-closes only when its unchanged criterion
  fails pre-fix and passes post-fix), then `--phase remediation-review`
  on the fix delta. Bounds and no-resurrection: *Recovery and escalation*
  below.
- **8. Close.** **First, if the set's `pathAwareCritique` is
  `advisory`/`required`, RUN the multi-provider path-aware critique now
  and remediate it** — it is code-changing and its artifact is gated at
  the set-terminal close. Then, after **every** code-changing stage is
  finished, fully run every
  expensive suite whose `covers` surfaces this session touched and
  record each (`python -m ai_router.run_of_record record --suite <s>
  --outcome passed --duration-seconds <n>`, required) or
  `test_run_fresh` refuses the close. All three layers are governed
  (Set 116 S3); `covers` is by path, so docs under `ai_router/` owe
  pytest. Recording does **not** stale the verification that just
  passed (Set 116 S2) — which makes this a last step, not a loop. Then
  author `disposition.json`
  (`verification_verdict` always; `next_orchestrator` on a mid-set
  completion; `uat` when the set declares `requiresUAT`), commit **and
  push**, run
  `python -m ai_router.close_session` for the set, and only after it
  succeeds fire the session-complete notification. Record instrumental
  lessons in `disposition.lessons_cited` and run `cite_lessons` in the
  final commit.
- **9. Last session only (post-notify).** Run the reorganization review
  of `project-guidance.md` / `lessons-learned.md` — "no changes
  recommended" is a valid outcome, skipping the review is not.
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
  `contractGate`) are written once at the first `start_session`.
- **Shared operational facts live in engine-agnostic docs** (`docs/`,
  package changelogs), never only in `CLAUDE.md` / `AGENTS.md` /
  `GEMINI.md` — the bootstrap files are entrypoints, not the record.
- **Verification artifacts are raw records.** `sN-verification*.md`,
  `sN-issues*.json`, and `path-aware-critique.json` are never edited
  after they are written; retries append sibling round files.

## State-mutation discipline — sanctioned writers only

- `start_session` and `close_session` are the only writers of
  `session-state.json` and the events ledger; cancel/restore goes
  through its own sanctioned writer. **Never freehand-edit state to declare
  progress** — that is mixed-mode drift; recover through the close-out
  doc's sanctioned repair path, not a hand edit. Open the schema doc
  when a state question arises.
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

## Decision rights — route by authority, not judgment load

Judgment-shaped calls (spec-vs-reality conflicts, waiver adjudications,
severity disputes, placement/layout/scoping) are **yours**, resolved by
ordered tiebreaks: goal over letter → prefer reversible → simpler code
/ fewer tests → defer to an existing gate → cross-provider consensus →
human. "This is hard" is not a routing signal. Four classes stay human:
external or hard-to-reverse consequences, underivable value trade-offs,
accountability sign-offs, and **anything that reduces verification**
(hard carve-out — never self-authorized; `decision_journal` refuses to
write it). Journal every call to the per-set `decisions.jsonl` via
`python -m ai_router.decision_journal` — the operator is an **auditor**,
not a gate. Every operator stop is an **education-mode brief**: where
the set stands / the question in one sentence / options with
consequences / recommendation with confidence / the default on no
answer. Batch briefs; never trickle. Full rubric:
`docs/ai-led-session-workflow.md` → *Decision rights*.

## Definition of done

The session plan's Ends-with is satisfied; suite green; a non-blocking
cross-provider verdict (VERIFIED or Minor-only) is recorded;
`disposition.json` is complete; the work is committed and pushed;
`close_session` succeeded; the notification fired after success (never
on a failed gate). The final session additionally produces
`change-log.md`, the Step 9 review, and — when armed — the path-aware
critique artifact.

## Recovery and escalation

- **Close gate failure** → open `ai_router/docs/close-out.md` (common
  failures, drift repair, the local-only path for deliberately
  remote-less repos). Missing `disposition.json` fields are the usual
  first-attempt cause.
- **Blocking findings** → complete the harvest, fix once, review the fix
  delta. **Bounded totals, machine-ENFORCED: at most 2 discovery passes
  and 2 remediation-review cycles** (classic no-`--phase` path: 2
  rounds). Past a bound `verify_session` **refuses the round** — the loop
  suspends, it does not keep opening rounds. The **close backstop** is
  under the same budget (Set 116 S2): it evaluates the bound before its
  metered call, refuses at the cap, and ledgers every round it runs, so
  `sN-rounds.jsonl` is the true count.
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
  Only the **operator** may pass a bound, via
  `--operator-authorized-round "<reason>"` (non-empty; appended to
  `sN-rounds.jsonl`) — never the orchestrator's own
  authority. An adjudication settles the STOP, not the truth: a finding
  waived at the bound is an owed residual with a named owner.
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
| 1 | `docs/ai-led-session-workflow.md` | Trigger-phrase variants: parallel worktrees, maxout |
| 1 | `docs/planning/repo-worktree-layout.md` | Worktree layout, migration, drift recovery |
| 2 | `docs/planning/session-set-authoring-guide.md` | Authoring or revising a spec (flag semantics, **session-size cap**, slugs) |
| 2 | `docs/ai-led-session-workflow.md` | The set declares `requiresUAT` / `requiresE2E` — the gated UAT/E2E procedures |
| 4 | `docs/planning/session-set-authoring-guide.md` | The step-checklist cadence: what a transition is, the post ledger, the `checklist_posted` gate |
| 5, 8 | `docs/planning/session-set-authoring-guide.md` | The test-run policy and the run-of-record freshness gate || 7, 8 | `docs/planning/session-set-authoring-guide.md` | The guided-look UAT format, `npm run walk`, and the `disposition.uat` close gate |
| 3.5–4 | `docs/ai-led-session-workflow.md` | Router config, task types, delegation thresholds, the decision-rights rubric, education-mode briefs, decision-time consensus |
| 6–7 | `docs/ai-led-session-workflow.md` | Verification mechanics: materiality / loop discipline detail, adjudication options |
| 8 | `ai_router/docs/close-out.md` | Preflight BEFORE close (`close_preflight`); close failure, stranded session, drift, flags |
| 8 | `docs/disposition-schema.md` | Authoring `disposition.json` |
| 9 | `docs/guidance-lifecycle.md` | Citation, archival, ceilings, the preload admission test |
| 9 | `docs/ai-led-session-workflow.md` | Path-aware critique stage mechanics; Step 9 procedure detail |
| any | `docs/session-state-schema.md` | Any `session-state.json` question (shape, invariants, hand-edit recipe) |
| any | `python -m ai_router.guidance_search --archive` | A lesson that might exist but is not in the active tier |
| any | `docs/guidance-slimming-playbook.md` (Set 085 S3) | Slimming an over-budget guidance corpus in another repo |
