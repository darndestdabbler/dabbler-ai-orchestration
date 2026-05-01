# `close_session` — Close-Out Reference

Canonical operational reference for the close-out script. This is the
single source of truth: `python -m ai_router.close_session --help`
echoes Section 2 of this document verbatim, and Step 8 of
`docs/ai-led-session-workflow.md` collapses to one paragraph that
points here.

Contents:

- [Section 1 — When close-out runs](#section-1--when-close-out-runs)
- [Section 2 — How to run close-out](#section-2--how-to-run-close-out)
- [Section 3 — What the script does](#section-3--what-the-script-does)
- [Section 4 — Common failures and remediation](#section-4--common-failures-and-remediation)
- [Section 5 — Manual close-out flags](#section-5--manual-close-out-flags)
- [Section 6 — Troubleshooting](#section-6--troubleshooting)

---

## Section 1 — When close-out runs

Close-out is the **sole synchronization barrier** between session work
and the session being marked complete. It runs once per session, after
all of the following are true:

1. The session's work agent has produced a `disposition.json` whose
   `status` field is `"completed"` (see
   `docs/session-state-schema-example.md` for the full schema).
2. End-of-session verification (Step 6) has reached a terminal state.
   "Terminal" is mode-dependent:
   - **`outsourceMode: first`** — the synchronous `verify()` call
     returned a verdict (`VERIFIED` or `ISSUES_FOUND`), and any
     ISSUES_FOUND retries are exhausted.
   - **`outsourceMode: last`** — the queued verification job has
     reached `completed`, `failed`, or `timed_out` in `queue.db`.
3. **The orchestrator (or its fresh close-out turn — see Set 006
   Session 2) has already committed and pushed the session's work.**
   See "Ownership of commit / push / notification" below for why this
   is a precondition rather than something close-out does itself.

If any of these is not true, close-out refuses to run and emits a gate
failure with concrete remediation instead of producing a half-closed
session. The script is idempotent: running it twice on a session that
is already `complete` exits 0 with `result: "noop_already_closed"` and
no events emitted.

The orchestration layer routes to close-out differently per mode.
**Outsource-first** invokes it as a fresh routed turn after work
verification terminates, so the close-out agent encounters
`ai-router/docs/close-out.md` (this file) at the moment the
instructions are needed — which sidesteps the GPT-5.4-flagged risk that
collapsing Step 8 in the workflow doc could lower agent compliance.
**Outsource-last** has the orchestrator daemon self-invoke
`close_session` directly: it already has queue context and fresh-turn
routing would be a wasted API call.

### Ownership of commit / push / notification

Close-out's responsibilities are deliberately narrow:

- Lifecycle gate checks (`gate_checks.GATE_CHECKS`)
- Verification-wait (queue mode) / verification-result inspection (api
  mode)
- Idempotent state writes (`mark_session_complete`, ledger events,
  `change-log.md` and the next-orchestrator recommendation in
  `ai-assignment.md`)

Close-out **does not** run `git commit`, `git push`, or
`send_session_complete_notification`. Those are the
**orchestrator's** (or the fresh close-out turn agent's)
responsibility, and they straddle the close-out call:

- **`git commit` and `git push`** run **before** invoking
  `close_session`. The boundary is enforced by
  `gate_checks.check_pushed_to_remote`: a session whose work was not
  pushed fails the gate at Section 3 step 7 and never reaches the
  state flip — so the gate guarantees the precondition rather than
  performing it.
- **`send_session_complete_notification(...)`** (from
  `ai-router/notifications.py`) runs **after** `close_session`
  returns `succeeded`. Firing it before close-out succeeds would
  notify the human about a session that may still gate-fail; firing
  it from inside `close_session` would re-introduce the
  side-effect-as-state-flip coupling that GPT-5.4 flagged in the
  original proposal review (§5 of
  `docs/proposals/2026-04-30-combined-design-alignment-audit.md`,
  drift item D-3).

This is a deliberate revision to the original close-out reliability
proposal (`docs/proposals/2026-04-29-session-close-out-reliability.md`
§3, items 4 and 6), which named close-out as the holder of commit,
push, and notification. The revision is documented in that proposal's
post-implementation revision section. Future audits should treat the
revised contract — close-out owns the gate; the caller owns the side
effects — as canonical.

---

## Section 2 — How to run close-out

```
python -m ai_router.close_session [--session-set-dir PATH] [options]
```

Default invocation:

```bash
.venv/Scripts/python.exe -m ai_router.close_session \
    --session-set-dir docs/session-sets/<slug>
```

Exit codes:

- `0` — close-out succeeded (gates passed; verifications terminal),
  or the session was already closed (idempotent no-op).
- `1` — gate failure (one or more deterministic gates rejected).
- `2` — invalid invocation (incompatible flags; missing
  `disposition.json` outside `--force` / `--repair`).
- `3` — lock contention (another close-out is running on the same
  session set).
- `4` — timeout waiting on queued verification.
- `5` — repair drift detected and not applied (`--repair` without
  `--apply`).

JSON output (`--json`) shape — stable across exit codes so callers
parse it without branching on success:

```json
{
  "result": "succeeded | noop_already_closed | gate_failed | invalid_invocation | lock_contention | verification_timeout | repair_drift",
  "exit_code": 0,
  "session_set_dir": "<absolute path>",
  "session_number": 3,
  "messages": ["<human-readable line>", "..."],
  "gate_results": [
    {"check": "<name>", "passed": true, "remediation": ""}
  ],
  "verification": {
    "method": "api | queue | manual | skipped",
    "message_ids": ["<id>"],
    "wait_outcome": "completed | failed | timed_out"
  },
  "events_emitted": ["closeout_requested", "closeout_succeeded"]
}
```

Flag summary:

| Flag | Purpose |
|---|---|
| `--session-set-dir PATH` | Path to the session set directory. Defaults to active session set in CWD. |
| `--json` | Emit a single JSON object on stdout instead of human-readable lines. |
| `--interactive` | Opt in to interactive prompts. Default is non-interactive — never blocks on stdin. |
| `--force` | Bypass all gate checks. **Hard-scoped to incident recovery only**: requires `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` in the environment AND `--reason-file`. Emits `closeout_force_used` to the events ledger and writes `forceClosed: true` to `session-state.json`. See Section 5. |
| `--allow-empty-commit` | Permit close-out for a session that produced no commits. |
| `--reason-file PATH` | File containing narrative fields (close-out reason, manual-verify attestation). |
| `--manual-verify` | Skip queue verification blocking; treat verifications as completed by human attestation (bootstrapping window only). Requires `--interactive` or `--reason-file`. |
| `--repair` | Diagnostic mode: walk the session set's state and report drift. |
| `--apply` | When combined with `--repair`, apply corrections to detected drift. |
| `--timeout MINUTES` | Maximum minutes to wait for queued verifications to reach a terminal state (default 60). |

Flag combination rules (validated up front; failure exits 2):

- `--force` is bypass-everything; it is incompatible with
  `--interactive`, `--manual-verify`, and `--repair`. Pick one bypass
  at a time so the audit trail stays unambiguous.
- **`--force` is hard-scoped to incident recovery** (Set 9 Session 3,
  D-2). On top of the compatibility rules above, two additional gates
  fire: the environment must export `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`,
  AND a `--reason-file` must be supplied with a non-empty narrative.
  Both rejections exit 2 before any state is touched. See Section 5.
- `--apply` requires `--repair`. Using it alone is almost certainly a
  typo and fails loudly.
- `--manual-verify` requires either `--interactive` or `--reason-file`.
  An operator who genuinely has nothing to say can put a one-line
  reason in a file; silent bypass is refused so the audit trail stays
  honest.
- `--timeout` must be positive.

---

## Section 3 — What the script does

Close-out runs in this order. Each phase is fail-fast: a phase that
rejects emits its `closeout_failed` event with a remediation string and
returns the corresponding exit code without touching downstream state.

1. **Parse and validate args.** Combination rules above. Failure → 2.
2. **Resolve session-set directory** — explicit `--session-set-dir`,
   else discover from CWD via `find_active_session_set`.
3. **Acquire close lock** (`ai_router.close_lock.close_session_lock`).
   The lock file lives at `<session-set-dir>/.close_session.lock` and
   stores `pid`, `worker_id`, and `acquired_at`. A stale lock (dead PID, or
   acquired more than the stale-window ago) is reaped automatically.
   A live lock fails closed with exit 3.
4. **Idempotency check.** Read `session-state.json`. If the current
   session's lifecycle state is already `complete`, exit 0 with
   `noop_already_closed` — emit nothing, write nothing, release the
   lock cleanly.
5. **Read `disposition.json`** (`ai_router.disposition.read_disposition`).
   Must exist with `status: "completed"`. Missing or non-`completed`
   → gate failure unless `--force` or `--repair` is set.
6. **Emit `closeout_requested`** to `session-events.jsonl`.
7. **Run deterministic gate checks** (`ai_router.gate_checks`):
   - `check_working_tree_clean` — `git status` is clean (or only
     ignored patterns remain). Catches "agent forgot to commit".
   - `check_pushed_to_remote` — local HEAD has been pushed to the
     remote tracking branch. Catches "committed but never pushed".
   - `check_activity_log_entry` — the current session has an
     `activity-log.json` entry whose `session_number` matches.
   - `check_next_orchestrator_present` — every session except the
     last has a routed next-orchestrator recommendation. Catches
     drift from the workflow's "always route, never self-opine" rule.
   - `check_change_log_fresh` — last-session-only: the change log was
     updated in the same commit window (timestamp within tolerance).
   Each gate returns `(passed: bool, remediation: str)`. The first
   failing gate stops the phase; the script emits `closeout_failed`
   with the remediation and exits 1.
8. **Wait for verification to terminate** (mode-dependent, bounded by
   `--timeout`):
   - **API mode** (`outsourceMode: first`) — verification is already
     synchronous; this is a no-op flagged as `method: "api"`.
   - **Queue mode** (`outsourceMode: last`) — poll `queue.db` for the
     verifier's response message. Terminal states: `completed`,
     `failed`, `timed_out`. Non-terminal after `--timeout` minutes →
     exit 4.
   - **Manual mode** (`--manual-verify`) — record the attestation
     text from stdin or `--reason-file` and proceed. Method
     `"manual"`.
9. **Idempotent writes.** Each of these is safe to retry:
   - `mark_session_complete(session_set, verification_verdict, ...)` —
     flips `session-state.json` from `in-progress` to `complete` and
     records the verdict + `completedAt` ISO timestamp.
   - Append the next-orchestrator recommendation to `ai-assignment.md`
     (every session except the last).
   - Last session only: write `change-log.md` and append the
     next-session-set recommendation.
10. **Emit `closeout_succeeded`** to `session-events.jsonl`,
    release the lock, exit 0.

The caller (orchestrator or fresh close-out turn agent) fires
`send_session_complete_notification(...)` from `ai-router/notifications.py`
**after** `close_session` returns `succeeded`. The script does not
perform the notification itself — see Section 1 "Ownership of commit
/ push / notification" for the rationale and `git` precondition.
Notification failure is non-fatal: the work is preserved in git
regardless and the human can re-fire the notification by hand if
needed.

The cost report (`print_cost_report(SESSION_SET)`) prints during
the close-out turn before step 9. It reads `router-metrics.jsonl` for
this session set and is dual-sourced (Set 4 Session 1) — both per-call
metrics and provider-side aggregation cross-check each other.

---

## Section 4 — Common failures and remediation

Close-out is designed so every failure mode produces a single concrete
remediation string in `messages` (and in `gate_results[].remediation`
for gate failures). The patterns below are the ones operators have
hit during Sets 1–5; new patterns should be added here as the failure
inventory grows.

**Uncommitted files in working tree** — `check_working_tree_clean`
fails with the list of dirty paths. The agent typically forgot to
`git add` a generated file, or a tool wrote to a temp file inside the
repo. Remediation: `git status` to see what's there, `git add` and
re-commit if intentional, `git restore` if scratch. Then re-run
close-out.

**Push rejected (non-fast-forward)** — `check_pushed_to_remote` shows
the local HEAD is ahead of `origin/<branch>` *and* a `git push`
attempt would be rejected. Remediation: `git fetch && git rebase
origin/<branch>` (or `git pull --rebase`), resolve conflicts if any,
push again, re-run close-out. Do not `--force` push to shared branches.

**Missing `nextOrchestrator` recommendation** —
`check_next_orchestrator_present` fails on a non-last session because
the orchestrator forgot to route the recommendation. Remediation: route
it now (`route(content=..., task_type="analysis")`), append to
`ai-assignment.md`, commit, push, re-run close-out. The check enforces
"always route, never self-opine"; do not satisfy it by hand-writing
the recommendation.

**Queue verification timeout (outsource-last)** — exit 4 with
`wait_outcome: "timed_out"`. The verifier daemon is offline, slow, or
crashed. First check `python -m ai_router.role_status` and
`python -m ai_router.heartbeat_status`. If the verifier is down,
restart it (`python -m ai_router.restart_role --role verifier
--provider <name> --start`) and re-run close-out — the job is still in
the queue and the verifier will pick it up. If the verifier is alive
but stuck on a single message, inspect with
`python -m ai_router.queue_status get-payload --message-id <id>` and
either let it finish or `mark_failed` it (then re-enqueue).

**Disposition file missing** — exit 2 with `invalid_invocation`. The
work agent never produced `disposition.json`, which usually means the
session crashed mid-step or the agent ran a partial close-out by
hand. Do not bypass with `--force` reflexively. Investigate first:
read `activity-log.json` to see how far the session got, decide
whether the work is genuinely complete, then either resume the session
(re-run) or run `--repair` to inspect drift.

**Stale lock** — exit 3 with `lock_contention`, but the lock holder
PID is dead. The lock file should be reaped automatically on the next
attempt; if it isn't (clock skew, exotic kill paths), inspect
`<session-set-dir>/.close_session.lock` and remove it manually only
after confirming no other close-out is running.

**Manual-verify silent bypass refused** — exit 2 with the validation
message `"--manual-verify requires either --interactive ... or
--reason-file ..."`. By design: an operator who skips queue
verification must record *why* somewhere durable. Either add
`--interactive` (prompted on stdin) or write a one-line reason to a
file and pass `--reason-file <path>`.

---

## Section 5 — Manual close-out flags

Three flags exist for cases where the deterministic close-out path
cannot run. Each leaves a distinct, audit-able trail.

**`--interactive`** — opts in to stdin prompts. Without it, the
script never blocks on input; the orchestrator's automation path runs
in the default non-interactive mode. Use this when an operator is
running close-out from a terminal and wants to confirm sensitive
actions.

**`--force`** — bypass all gate checks. **Hard-scoped to incident
recovery only** (Set 9 Session 3, drift item D-2 in
`docs/proposals/2026-04-30-combined-design-alignment-audit.md`). The
flag is rejected by default; opting in requires both:

- **Environment gate.** Export `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` in
  the shell that runs `close_session`. A normal terminal session does
  not have this set, so an accidental `--force` invocation during
  day-to-day operation fails fast with a clear `invalid_invocation`
  message before any state is touched.
- **Reason file.** Pass `--reason-file <path>` to a non-empty
  narrative explaining the incident. The file's contents become the
  payload of the `closeout_force_used` event in
  `session-events.jsonl`, so a forensic walk of the ledger always
  answers "why was the gate bypassed?" without requiring a separate
  paper trail.

When both gates pass, close-out:

- emits a loud `WARNING` line to stderr (operator can't miss it,
  even in `--json` mode where stdout is JSON);
- appends a `closeout_force_used` event to `session-events.jsonl`
  with the reason as a payload field;
- writes `forceClosed: true` to `session-state.json` so the VS Code
  Session Set Explorer surfaces a `[FORCED]` description badge on
  the affected set's row.

The badge persists until the session set is restarted from scratch —
that's the point. A force-closed set stays visibly force-closed in
the explorer view so reviewers triaging incidents can spot it
immediately.

`mark_session_complete(force=True)` (the function-level entry point)
does not consult the env-var gate — it trusts callers (tests, the
repair path) to use `force=True` deliberately. The CLI's
`--force` is the operator-facing entry point and carries the gates;
the function-level path is for internal use only and is exercised by
`test_mark_session_complete_gate.py`.

**`--manual-verify`** — skip queue verification blocking and record a
human attestation that verification happened out of band. Designed for
the bootstrapping window when outsource-last is being stood up and
verifier daemons are not yet reliable. Requires `--interactive` or
`--reason-file` so the attestation lands in the audit trail. Method
`"manual"` is recorded in the JSON output and the
`closeout_succeeded` event payload.

**`--repair`** — diagnostic mode. Walks the session set's state
(`session-state.json`, `activity-log.json`, `session-events.jsonl`,
`disposition.json`, `queue.db` rows) and reports drift between them
without touching anything. Add `--apply` to actually fix detectable
drift (e.g., a `session-events.jsonl` missing a `closeout_succeeded`
event for a session whose `session-state.json` says `complete`).
`--repair` without `--apply` exits 5 if drift is found, so it's safe
to script as a pre-flight check.

---

## Section 6 — Troubleshooting

**Stranded sessions.** A session is "stranded" when `session-state.json`
says `in-progress` but no further events have been written in a long
time and no daemon is processing it. The reconciler
(`ai_router.reconciler`, registered as a sweeper hook by
`register_sweeper_hook` at orchestrator startup — see Set 3 Session 3)
sweeps stranded sessions periodically and either re-attempts
close-out (if the session looks complete) or files a diagnostic
record (if it does not). To inspect manually:

```bash
.venv/Scripts/python.exe -m ai_router.reconciler --dry-run \
    --session-set docs/session-sets/<slug>
```

The reconciler emits `format_summary(...)` output describing what it
would do. If the dry-run looks right, drop `--dry-run` to apply.

**Lock contention without an obvious holder.** If `--repair` shows a
lock file but `pid_file_path` does not point to a live daemon,
something killed the previous close-out hard. Read the lock file:

```bash
cat docs/session-sets/<slug>/.close_session.lock
```

The `acquired_at` field plus the stale-window constant in
`close_lock.py` tell you whether the lock should already have been
reaped. If the lock is genuinely stale and reaping is failing,
remove the file by hand — but only after confirming no other
close-out is running and no daemon process owns the PID.

**Reconciler behavior at orchestrator startup.** The reconciler's
sweeper hook runs once at orchestrator-role daemon startup and then
on a schedule. The startup pass catches sessions stranded across a
restart; the schedule catches sessions that strand mid-run. Both
re-use the same `_evaluate_one(session_set_dir, ...)` predicate so
the two paths cannot disagree about what "stranded" means.

**Queue-state debugging.** When a session looks fine to the
orchestrator but close-out won't terminate, the queue is the usual
culprit:

```bash
.venv/Scripts/python.exe -m ai_router.queue_status \
    --provider <name> --base-dir provider-queues
```

This shows pending / claimed / completed / failed counts plus the
oldest claimed message and the worker that has it. Combine with
`heartbeat_status` to see if the worker is actually alive:

```bash
.venv/Scripts/python.exe -m ai_router.heartbeat_status \
    --base-dir provider-queues --lookback-minutes 30
```

If a message is claimed by a dead worker, the lease will expire and
the next verifier poll will re-claim it. If the lease is long and the
operator wants to short-circuit, use
`python -m ai_router.queue_status mark_failed --message-id <id>` and
re-enqueue the verification.

**Verifier daemon down (outsource-last).** Restart it via:

```bash
.venv/Scripts/python.exe -m ai_router.restart_role \
    --role verifier --provider <name> --start
```

`restart_role` reads the pid file, sends a graceful shutdown signal,
waits for clean exit, then optionally spawns a replacement
(`--start`). Without `--start` the operator is responsible for
spawning a new daemon — the default fits supervisor-managed
deployments where a process manager handles respawn.

**Outsource-last set-up and recovery.** For day-to-day operation of
two-CLI / outsource-last sessions, including verifier-daemon restart,
orchestrator-CLI context reset, and subscription-window fatigue
diagnostics, see `ai-router/docs/two-cli-workflow.md`.

**Cross-set parallelism on the same `(repo, branch)`.** The close-out
lock at `<session-set-dir>/.close_session.lock` serializes **same-set
close-out re-entry** only. It does not scope to the `(repo, branch)`
pair, so two session sets pointing at the same branch can still race
during their work phase. The shipping operating model assumes parallel
sessions use distinct `session-set/<slug>` branches via the bare-repo
+ flat-worktree layout (see `docs/planning/repo-worktree-layout.md`),
which makes the cross-set-on-same-branch case rare; when it does
occur, the deterministic gate is the residual safety net rather than
admission-time exclusion.

Concretely, if two sets racing on the same branch both commit and one
pushes first, the loser's `git push` would be rejected non-fast-forward.
`check_pushed_to_remote` surfaces that rejection verbatim with a
`run: git pull --rebase` (or equivalent) remediation, and `close_session`
exits 1 (gate failure) without flipping the lifecycle state. The loser
rebases onto the winner's commit, re-pushes, and re-runs close-out.
The gate's rejection-and-remediation behavior on the loser of the
push race is exercised directly by
`TestScenario7CrossSetParallelRejection` in
`ai-router/tests/test_failure_injection.py`. The downstream
"`close_session` exits 1 without flipping lifecycle state" property is
not asserted by Scenario 7 itself — it is an established invariant of
the close-out flow already covered by the gate-failure tests in
`test_mark_session_complete_gate.py` and the close-out integration
tests; Scenario 7 proves the gate's response in the
specific cross-set push-race scenario.

If the parallel-on-same-branch pattern becomes routine rather than
incidental, reopen the question — a `(repo, branch)`-scoped advisory
lock acquired at session admission is a viable add-on (see drift item
D-1 in `docs/proposals/2026-04-30-combined-design-alignment-audit.md`
§5.2 for the original corrective options). The current contract
deliberately does not include one because the new failure mode it
introduces (a corrupt or stranded admission lock blocking all sessions
on a branch until the TTL elapses) is judged worse than the
rare-but-loud push race the gate already catches.
