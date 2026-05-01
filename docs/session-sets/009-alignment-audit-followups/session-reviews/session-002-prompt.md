## Session under verification
Set 9 (`009-alignment-audit-followups`) Session 2 of 5 — drift item D-1 from the combined-design alignment audit. Audit document: `docs/proposals/2026-04-30-combined-design-alignment-audit.md` §5.2 (D-1 — `(repo, branch)` parallel-session exclusion is incomplete).

## Path selected
The spec offered two corrective options:
  (a) widen the lock to acquire at session admission and scope it to `(repo, branch)`, with a new `repo_branch_lock.py` module and an executable `TestScenario7CrossSetParallelRejection` test, OR
  (b) revise the agreed answer to acknowledge that close-out-only serialization is sufficient, document the residual race explicitly, and add an executable test that exercises the residual-race protection (the deterministic gate).

**The operator selected option (b) — the doc-only path** — at session start to keep the change small and avoid introducing a new admission-time lock that could itself fail. The audit explicitly accepts either path.

## Acceptance criteria for this session
- Either: a `(repo, branch)` lock exists, is acquired at session admission, and is exercised by an executable failure-injection test
- Or: the residual race is documented in close-out.md and the proposal's open-question answer is revised
(Operator selected the second alternative — the doc-only path.)

## Files changed (deliverables)

### 1. `docs/proposals/2026-04-29-session-close-out-reliability.md` — Open questions (revised) Q2 revised

Original Q2 recommended rejecting parallel sessions on the same `(repo, branch)` via an advisory lock. Revised text adds a Resolution (2026-05-01, Set 9 Session 2 — doc-only path) sub-section explaining the narrower shipping contract:

```markdown
Open questions (revised)

1. **Where does the reconciler run?** Options: (a) cron / Windows
   Scheduled Task on the developer's machine, (b) in-orchestrator
   sweeper loop that runs at the start of each new session, (c) a
   separate `python -m ai_router.sweep_sessions` command the human
   runs occasionally. Recommend (b) — runs without external scheduling
   and surfaces stranded sessions when the human is most likely to
   notice.

2. **Concurrent worktrees: lock or reject?** The current bare-repo +
   flat-worktree layout supports parallel session sets but the gate
   doesn't have a concurrency model. Recommend rejecting parallel
   sessions on the same `(repo, branch)` pair via an advisory lock
   file (`docs/session-sets/<slug>/.close_session.lock`). Document
   that parallel sessions on different worktrees are fine.

   **Resolution (2026-05-01, Set 9 Session 2 — doc-only path).** The
   shipping lock is narrower than this answer originally implied:
   `close_lock.py`'s advisory lock at
   `<session-set-dir>/.close_session.lock` serializes **same-set
   close-out re-entry** only. It does **not** scope to the
   `(repo, branch)` pair, and two session sets pointing at the same
   `(repo, branch)` can still race during the work phase.

   Set 9 evaluated two corrective options for drift item D-1
   (`docs/proposals/2026-04-30-combined-design-alignment-audit.md`
   §5.2): widen the lock to cover `(repo, branch)` at session
   admission, or revise the agreed answer and rely on the
   deterministic close-out gate as the residual safety net. The
   operator selected the **revise** path. The narrower contract is:

   - **Same-set re-entry serialization** is enforced by the close-out
     lock. Two `close_session` invocations on the same session-set
     folder cannot interleave their gate checks or state flips.
   - **Cross-set parallelism on the same `(repo, branch)`** is
     governed by operator discipline and the deterministic gate.
     Parallel session sets are expected to use distinct
     `session-set/<slug>` branches via the bare-repo + flat-worktree
     layout (`docs/planning/repo-worktree-layout.md`); when the
     parallel-set-on-same-branch case does occur, the gate's
     `check_pushed_to_remote` predicate refuses to mark the loser of
     the push race complete until they `git pull --rebase` and re-push.
   - The residual-race behavior is documented in
     `ai-router/docs/close-out.md` Section 6 (Troubleshooting →
     "Cross-set parallelism on the same `(repo, branch)`") and is
     covered by `TestScenario7CrossSetParallelRejection` in
     `ai-router/tests/test_failure_injection.py`.

   The widen-the-lock path was rejected because the shipping operating
   model — parallel sessions on per-set worktree branches — makes the
   residual race rare in practice, and adding a new admission-time
   lock would introduce a new failure mode (a corrupt or stranded lock
   could block all sessions on a branch until the TTL elapsed). The
   audit's MATERIAL DRIFT verdict on D-1 is satisfied by aligning the
   contract to the implementation rather than the reverse.

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


```

### 2. `ai-router/docs/close-out.md` Section 6 — new troubleshooting entry on cross-set parallelism

```markdown
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
cat docs/session-sets/<slug>/.close.lock
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
The behavior is exercised by
`TestScenario7CrossSetParallelRejection` in
`ai-router/tests/test_failure_injection.py`.

If the parallel-on-same-branch pattern becomes routine rather than
incidental, reopen the question — a `(repo, branch)`-scoped advisory
lock acquired at session admission is a viable add-on (see drift item
D-1 in `docs/proposals/2026-04-30-combined-design-alignment-audit.md`
§5.2 for the original corrective options). The current contract
deliberately does not include one because the new failure mode it
introduces (a corrupt or stranded admission lock blocking all sessions
on a branch until the TTL elapses) is judged worse than the
rare-but-loud push race the gate already catches.

```

### 3. `ai-router/tests/test_failure_injection.py` — new `TestScenario7CrossSetParallelRejection`

```python
# Scenario 7: Cross-set parallel rejection on the same (repo, branch)
# ==========================================================================

class TestScenario7CrossSetParallelRejection:
    """Two sets racing on the same ``(repo, branch)`` — gate catches the loser.

    The combined-design alignment audit
    (``docs/proposals/2026-04-30-combined-design-alignment-audit.md`` §5.2,
    drift item D-1) flagged that the close-session lock only serializes
    same-set re-entry. Set 9 Session 2 resolved D-1 via the audit's
    accepted alternative (b): revise the contract to match the
    implementation and rely on the deterministic close-out gate as the
    residual safety net for cross-set parallelism on the same branch.
    See ``ai-router/docs/close-out.md`` Section 6 ("Cross-set parallelism
    on the same `(repo, branch)`") for the canonical operator-facing
    statement.

    This scenario is the executable proof the audit required: when two
    session sets commit work on the same branch and one pushes first,
    the loser's ``check_pushed_to_remote`` refuses with a clear
    non-fast-forward / pull-rebase remediation rather than silently
    allowing both sets to mark themselves complete.
    """

    def test_loser_of_push_race_gate_fails_loud(self, tmp_path: Path):
        from gate_checks import check_pushed_to_remote

        def _git(cwd: Path, *args: str) -> None:
            proc = subprocess.run(
                ["git", *args],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            if proc.returncode != 0:
                raise RuntimeError(
                    f"git {' '.join(args)} (cwd={cwd}) failed: "
                    f"{proc.stderr.strip() or proc.stdout.strip()}"
                )

        # A bare remote that both clones will push to. The race is
        # decided by whichever clone's push reaches the bare remote
        # first; the second push must be non-fast-forward.
        bare = tmp_path / "origin.git"
        bare.mkdir()
        _git(bare, "init", "--bare", "-b", "main")

        # Two clones share the same (repo, branch) just as two parallel
        # sessions on the same machine would. Seed a baseline from
        # clone-a, then sync clone-b from the now-populated remote.
        clone_a = tmp_path / "clone-a"
        clone_b = tmp_path / "clone-b"
        for clone in (clone_a, clone_b):
            _git(tmp_path, "clone", str(bare), str(clone))
            _git(clone, "config", "user.email", "test@example.invalid")
            _git(clone, "config", "user.name", "Test")
            _git(clone, "config", "commit.gpgsign", "false")

        (clone_a / "README.md").write_text("baseline\n", encoding="utf-8")
        _git(clone_a, "add", "README.md")
        _git(clone_a, "commit", "-m", "baseline")
        _git(clone_a, "push", "-u", "origin", "main")

        _git(clone_b, "fetch", "origin")
        _git(clone_b, "checkout", "-B", "main", "origin/main")

        # Each clone hosts its own session set. Both commit work on
        # main; A pushes first, simulating A winning the race.
        set_a_dir = clone_a / "docs" / "session-sets" / "set-a"
        set_a_dir.mkdir(parents=True)
        (set_a_dir / "spec.md").write_text("# set a\n", encoding="utf-8")
        (set_a_dir / "marker.txt").write_text("a\n", encoding="utf-8")
        _git(clone_a, "add", "-A")
        _git(clone_a, "commit", "-m", "set A work")
        _git(clone_a, "push", "origin", "main")

        set_b_dir = clone_b / "docs" / "session-sets" / "set-b"
        set_b_dir.mkdir(parents=True)
        (set_b_dir / "spec.md").write_text("# set b\n", encoding="utf-8")
        (set_b_dir / "marker.txt").write_text("b\n", encoding="utf-8")
        _git(clone_b, "add", "-A")
        _git(clone_b, "commit", "-m", "set B work")

        # B is now ahead of origin/main with a divergent commit while
        # the remote already holds A's commit. B's gate must refuse
        # close-out with a non-fast-forward / rebase remediation —
        # this is the residual-race protection the doc-only D-1
        # resolution depends on.
        passed, remediation = check_pushed_to_remote(str(set_b_dir), None)
        assert not passed, (
            "the deterministic gate is the residual safety net for the "
            "cross-set parallel race; the loser's gate must NOT silently "
            "report success"
        )
        lower = remediation.lower()
        assert (
            "non-fast-forward" in lower
            or "rebase" in lower
            or "rejected" in lower
        ), (
            "the loser of a cross-set push race needs operator-actionable "
            f"guidance pointing at a rebase/pull workflow; got: {remediation!r}"
        )

        # Sanity: A's gate, which won the push race, is in the clean
        # state (head == upstream) and passes.
        passed_a, _ = check_pushed_to_remote(str(set_a_dir), None)
        assert passed_a, (
            "the winner of the cross-set push race should pass the gate "
            "cleanly; only the loser is meant to be rejected"
        )


# ==========================================================================

```

### 4. `docs/session-sets/009-alignment-audit-followups/ai-assignment.md` — Session 2 block appended (with Session 1 actuals)

```markdown
## Session 2: D-1 — `(repo, branch)` parallel-session exclusion

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Operator selected the **doc-only path** at session start (audit-accepted
alternative b): revise the contract instead of widening the lock. The
work surface narrowed to two doc edits (proposal Q2 + close-out.md
Section 6) and one new executable failure-injection test that proves
the deterministic gate catches the cross-set push race loudly. Opus
high-effort is still the right call — careful wording on the contract
revision matters because future audits will re-check it — but the
session is materially smaller than the widen-the-lock path Session 1
projected. The new test exercises real `git` subprocesses, so it must
slot cleanly into the existing `test_failure_injection.py` style.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (audit D-1 detail, proposal Q2, close-out.md §6, existing failure-injection scenarios, gate_checks API) | Direct (orchestrator) |
| 2 | Register Session 2 start | Direct (file-write helper, no API call) |
| 3 | Append this Session 2 block to ai-assignment.md (with Session 1 actuals + cost) | Direct (router suspended per operator) |
| 4 | Revise proposal "Open questions (revised)" Q2 with the doc-only resolution | Direct (mechanical edit) |
| 5 | Add Section 6 entry to ai-router/docs/close-out.md describing the cross-set residual race | Direct (mechanical edit) |
| 6 | Add `TestScenario7CrossSetParallelRejection` to test_failure_injection.py | Direct (test under ~80 lines, mechanical from existing scenarios) |
| 7 | Run full pytest suite | Direct (shell command) |
| 8 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 9 | Commit, push, run `close_session.py`, send notification | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high
- Total routed cost: TBD at close-out (verification call only)
- Deviations from recommendation: ai-assignment authoring and
  next-session recommendation produced directly rather than via
  `route(task_type="analysis")`, per the standing operator
  cost-containment rule. The path-decision (widen-lock vs doc-only)
  was surfaced to the operator rather than routed for analysis,
  also under the same constraint. No other deviations.
- Notes for next-session calibration: Session 3 (D-2, `--force` flag
  resolution) is mostly small mechanical edits across `close_session.py`,
  `close-out.md`, `session_state.py` (verdict enum or analogous field),
  the VS Code Session Set Explorer (forensic badge), and a new test.
  Workload is similar to Session 1's mix; same orchestrator/effort
  tier is appropriate.

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-7 @ effort=high
Rationale: D-2's surface spans Python (close_session args + ledger
event), TypeScript (Session Set Explorer badge for force-closed
sessions), docs, and a new test. Multi-language + careful contract
wording on a security-relevant flag — Opus high-effort is the right
match.

```

## Test result
`python -m pytest ai-router/tests` → **670 passed in 57.06s** (669 pre-existing + 1 new Scenario 7).

## Spec excerpt for Session 2
```markdown
 — `(repo, branch)` parallel-session exclusion

**Goal:** Either widen the lock to enforce single-session ownership of
`(repo, branch)` at session admission, or document the residual race
explicitly. Either path requires an executable test.

**Recommended path (widen the lock):**
- Add `ai-router/repo_branch_lock.py` that acquires an advisory lock
  scoped to `<git-common-dir>/.dabbler-session.lock` (so it covers all
  worktrees of the same bare repo) keyed by current branch
- Lock acquired at session admission (when `register_start` step in
  `activity-log.json` is recorded), released on close-out succeed or on
  `closeout_failed` after operator acknowledgment
- Lock contents: session-set name, session number, PID, acquired_at
- Stale-lock reclaim: same TTL + PID check as `close_lock.py`
- Update `gate_checks.check_working_tree_clean` and
  `check_pushed_to_remote` to reference the lock holder if a race is
  detected
- New executable test in `test_failure_injection.py`:
  `TestScenario7CrossSetParallelRejection` — two session sets
  attempting to open work on the same `(repo, branch)` simultaneously;
  exactly one acquires the lock; the other receives a
  `RepoBranchLocked` exception with a clear message

**Alternative path (document residual race):** If the human decides the
multi-set parallel case is rare enough to not justify the lock,
document the residual race in `ai-router/docs/close-out.md` Section 6
(Troubleshooting) and revise the original proposal §3 + v2 plan
"Open question Q2" to reflect the narrower scope.

**Acceptance:**
- Either: a `(repo, branch)` lock exists, is acquired at session
  admission, and is exercised by an executable failure-injection test
- Or: the residual race is documented in close-out.md and the
  proposal's open-question answer is revised


```

## Workflow ordering note
Workflow Step 6 (verification) is mode-aware; this set runs outsource-first and we are routing the verification synchronously.

## Verification ask
Evaluate whether the four deliverables together satisfy the spec's Session 2 acceptance criteria for the doc-only alternative. Specifically:

  1. Is the residual race **documented clearly** in close-out.md Section 6 (operator-actionable, names the gate predicate, names the test, points at the audit drift item)?
  2. Is the original proposal's Q2 answer **revised** to match the shipping contract (no longer claims an admission-time (repo, branch) lock; explains why; cross-references the doc and the test)?
  3. Does `TestScenario7CrossSetParallelRejection` actually exercise the residual-race protection — i.e., does it create a real cross-set push race against a real bare remote, and does it assert that the loser's `check_pushed_to_remote` returns a clear non-fast-forward / rebase remediation?
  4. Does the ai-assignment.md Session 2 block correctly record Session 1 actuals (cost, deviations) and document the routing-suspension deviation for Session 2?

Flag any consistency drift between the four files (e.g., one naming a path the others don't; the test asserting a remediation message that close-out.md doesn't actually quote).