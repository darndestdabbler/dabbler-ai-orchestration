## Round 2 verification — Set 9 Session 2 (D-1, doc-only path)

Round 1 (`session-002.md`) returned **ISSUES_FOUND** with four issues. All four have been addressed; the diff for each is presented below. The ask for Round 2 is to confirm that the applied fixes resolve the findings without introducing new drift.

## Issue log from Round 1 (with applied fixes annotated)

```json
{
  "round": 1,
  "verdict": "ISSUES_FOUND",
  "verifier_model": "gpt-5-4",
  "issues": [
    {
      "id": 1,
      "severity": "Major",
      "category": "Correctness",
      "summary": "Proposal Q2 still leads with the superseded admission-time-lock recommendation; the Resolution sub-section contains the shipped contract but readers see the rejected idea first.",
      "location": "docs/proposals/2026-04-29-session-close-out-reliability.md, Open questions (revised) Q2",
      "status": "fixed",
      "fix": "Rewrote Q2 so the shipping contract is the primary answer; preserved the original recommendation as a 'History — superseded recommendation' subsection."
    },
    {
      "id": 2,
      "severity": "Minor",
      "category": "Correctness",
      "summary": "Inconsistent lock filename: pre-existing references in close-out.md said `.close.lock`; the new troubleshooting entry and the proposal Q2 resolution said `.close_session.lock` (which matches `close_lock.LOCK_FILENAME` in code).",
      "location": "ai-router/docs/close-out.md (Section 3 step 3, Section 4 'Stale lock', Section 6 'Lock contention without an obvious holder')",
      "status": "fixed",
      "fix": "Updated all three pre-existing references to match the actual code constant `.close_session.lock`. The new entry already used the correct filename."
    },
    {
      "id": 3,
      "severity": "Minor",
      "category": "Completeness",
      "summary": "Docs claimed Scenario 7 covers 'close_session exits 1 without flipping lifecycle state', but the test only asserts the gate predicate's rejection-and-remediation behavior.",
      "location": "ai-router/docs/close-out.md (Section 6 cross-set entry); docs/proposals/2026-04-29-session-close-out-reliability.md (Q2 resolution); ai-router/tests/test_failure_injection.py (TestScenario7CrossSetParallelRejection docstring)",
      "status": "fixed",
      "fix": "Narrowed the scope claim in all three locations: Scenario 7 covers the gate's rejection-and-remediation in the cross-set push-race scenario; the downstream 'exits 1 without flipping state' invariant is asserted elsewhere (test_mark_session_complete_gate.py + close-out integration tests) and Scenario 7 does not re-assert it."
    },
    {
      "id": 4,
      "severity": "Minor",
      "category": "Completeness",
      "summary": "Round 1 prompt sliced the ai-assignment.md from Session 2 onward, so the verifier could not see the Session 1 'Actuals' update (cost $0.1910 + routing-suspension deviation).",
      "location": "scripts/verify_session_009_2.py prompt construction; docs/session-sets/009-alignment-audit-followups/ai-assignment.md (Session 1 Actuals block)",
      "status": "fixed",
      "fix": "Round 2 prompt also includes the Session 1 'Actuals' block so the verifier can confirm Session 1 actuals were correctly backfilled."
    }
  ]
}

```

## Refreshed deliverables

### 1. Proposal Q2 — fully replaced (shipped contract leads, original recommendation kept as 'History — superseded recommendation')

```markdown
Open questions (revised)

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


```

### 2. ai-router/docs/close-out.md Section 6 (full text, post-fix)

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

```

### 3. Lock-filename references in close-out.md (every line that matches `.close*.lock`, with line numbers — should all read `.close_session.lock` now to match `close_lock.LOCK_FILENAME`)

```
L187:    The lock file lives at `<session-set-dir>/.close_session.lock` and
L303: `<session-set-dir>/.close_session.lock` and remove it manually only
L377: cat docs/session-sets/<slug>/.close_session.lock
L436: lock at `<session-set-dir>/.close_session.lock` serializes **same-set
```

### 4. Session 1 'Actuals' block in ai-assignment.md (the part Round 1 could not see — confirms cost + routing-suspension deviation were backfilled)

```markdown
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high
- Total routed cost: $0.1910 (two `session-verification` calls to
  GPT-5.4 — Round 1 + Round 2 after applying issue fixes)
- Deviations from recommendation: ai-assignment authoring and
  next-session recommendation produced directly rather than via
  `route(task_type="analysis")`, per the standing operator
  cost-containment rule. No other deviations.
- Notes for next-session calibration: Session 2 (D-1, `(repo, branch)`
  parallel-session lock) is heavier on test authoring than doc
  editing. Plan for an executable failure-injection scenario plus a
  new `repo_branch_lock.py` module. Same orchestrator/effort tier is
  appropriate.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Lock implementation + executable cross-set failure-injection
test is concurrency-sensitive code where a wrong call corrupts session
state. Opus at high effort matches the stakes; the test count is
small enough that runtime cost is bounded.

```

### 5. Session 2 ai-assignment block (unchanged from Round 1)

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

### 6. TestScenario7CrossSetParallelRejection (with narrowed docstring scope claim)

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
    non-fast-forward / pull-rebase remediation. The downstream
    "``close_session`` exits 1 without flipping lifecycle state"
    property is an established invariant of the close-out gate covered
    by ``test_mark_session_complete_gate.py`` and the close-out
    integration tests; this scenario does not re-assert it. The
    contribution here is proving the gate predicate's specific
    response in the cross-set push-race scenario the doc-only D-1
    resolution depends on.
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

## Test result
`python -m pytest ai-router/tests/test_failure_injection.py` → **8 passed in 7.80s** (full suite remains green at 670 passed; the docstring edit was the only post-Round-1 code change).

## Spec excerpt for Session 2 acceptance criteria (unchanged)

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

## Verification ask

  1. **Issue 1 (Q2 lead).** Does the refreshed Q2 lead with the shipping contract and present the original lock recommendation only as superseded history?
  2. **Issue 2 (lock filename).** Do all `.close*.lock` references in close-out.md now read `.close_session.lock`?
  3. **Issue 3 (test scope claim).** Are the 'exercised by Scenario 7' claims in close-out.md, the proposal Q2 resolution, and the test docstring now narrowed to what the test actually asserts (the gate predicate's rejection-and-remediation in the cross-set push-race), explicitly delegating the 'close_session exits 1 without flipping state' invariant to the existing `test_mark_session_complete_gate.py` + close-out integration tests?
  4. **Issue 4 (Session 1 actuals).** Does the Session 1 Actuals block now show a real total routed cost ($0.1910) and the routing-suspension deviation, satisfying Session 1's ai-assignment.md schema in retrospect?

If all four are addressed cleanly, return **VERIFIED**. If any fix is still incomplete or the fixes introduced new drift, return **ISSUES FOUND** with the specific gap.