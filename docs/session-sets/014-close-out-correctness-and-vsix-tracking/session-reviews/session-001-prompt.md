# Cross-provider verification — Set 14 Session 1: Close-out workflow correctness

You are reviewing a session that landed two small Python correctness
fixes against the close-out workflow plus tests for both. Both fixes
unwind a recurring orchestrator papercut that every multi-session set
since Set 010 has hit and worked around manually. This is the first
session that lands the actual implementation.

The deliverable is small in code volume (~25 lines of production code,
~250 lines of tests across two files) but the correctness invariants
are load-bearing — every multi-session set going forward depends on
both fixes holding.

**Goal of the verification:** would the produced fixes survive into
production multi-session use? Specifically, does
`register_session_start` emit `work_started` exactly once per session
under normal *and* orchestrator-restart conditions, with the right
ordering relative to the snapshot write? Does `close_session`'s success
path flip the snapshot to `closed` cleanly and on the right branch
without breaking the existing `--repair` recovery path? And do the
tests assert behavior specifically enough that a regression would be
caught rather than absorbed?

---

## Spec excerpt for Session 1

The full spec is in `docs/session-sets/014-close-out-correctness-and-vsix-tracking/spec.md`. The relevant work blocks for Session 1 are (a)–(d):

- **(a)** `register_session_start` in `ai_router/session_state.py`
  appends a `work_started` event to `session-events.jsonl` for the
  session being registered. **Idempotent:** if a `work_started` event
  for that session number already exists in the ledger, do not append
  a second one (orchestrator-restart case). The snapshot write happens
  AFTER the event append — so a failed event leaves the snapshot
  un-flipped and the next call retries cleanly. This mirrors
  `mark_session_complete`'s ordering invariant (event before mutation).

- **(b)** `close_session.py`'s success path (the existing
  `_run_main_flow` / `_finalize_success` path that already emits
  `closeout_succeeded`) calls `_flip_state_to_closed` after the
  `closeout_succeeded` event is appended. This is the long-deferred
  Set 4 wiring promised at line 35 of `close_session.py`'s module
  docstring. Use the gate-bypass `_flip_state_to_closed` (matching the
  `--repair` case-2 path's choice) rather than the public
  `mark_session_complete`, since the events ledger already records
  closeout_succeeded for this session. Lazy-import (matches existing
  `--repair` case-2 import pattern). If the flip helper returns `None`
  (no state file), surface a warning message but do not fail close-out.

- **(c)** Tests for both new behaviors:
  - `test_register_session_start_emits_work_started`: append-on-first-call
  - `test_register_session_start_idempotent_on_repeat`: no double-emit
  - `test_register_session_start_total_sessions_still_propagates`: regression guard
  - `test_close_session_happy_path_flips_snapshot`: one-session set, snapshot flips without `--repair`
  - `test_close_session_multi_session_set_clean`: 2-session set end-to-end with no manual workarounds

- **(d)** Docstring touch-ups:
  - `register_session_start`'s docstring mentions the new event-emission behavior.
  - `close_session.py` line 35 — replace "This script does not yet wire
    into mark_session_complete. Set 4 adds that wiring." with a current
    description.

---

## What the session actually shipped

### Production code changes

**`ai_router/session_state.py`** — `register_session_start`:

A new event-emission block was added at the *top* of the function
(before the snapshot write):

```python
# Append the work_started event before the snapshot write so a
# failed event leaves the snapshot un-flipped (mirrors the ordering
# in mark_session_complete). Lazy import to avoid a top-level cycle:
# session_events imports from session_state at module load.
if os.path.isdir(session_set):
    try:
        from session_events import (  # type: ignore[import-not-found]
            append_event,
            read_events,
        )
    except ImportError:
        from .session_events import (  # type: ignore[no-redef]
            append_event,
            read_events,
        )
    existing = read_events(session_set)
    already_emitted = any(
        ev.event_type == "work_started"
        and ev.session_number == session_number
        for ev in existing
    )
    if not already_emitted:
        append_event(session_set, "work_started", session_number)
```

The remainder of the function (snapshot dict construction, file write,
`_propagate_total_sessions`) is unchanged. Docstring updated with an
"Events emission" section describing the behavior, the idempotency
contract, and the ordering invariant relative to the snapshot write.

**`ai_router/close_session.py`** — success path (around the existing
`closeout_succeeded` emission, ~line 1595):

After `closeout_succeeded` is appended, a new flip block was added
*before* the `return outcome` and *inside* the `try:` block (so the
existing `release_lock` in `finally:` still runs):

```python
# Flip session-state.json to complete/closed via the gate-bypass
# internal helper. Mirrors the ``--repair --apply`` case-2 path
# (lines ~1045–1075): the events ledger already records
# closeout_succeeded for this session, so re-running the gate
# via mark_session_complete would either redundantly validate
# or fail on transient drift the gate would surface. The flip
# is a snapshot resync, not a gate decision. Lazy-import to
# avoid a top-level cycle (session_state imports close_session
# in mark_session_complete's gate-running branch).
try:
    from session_state import _flip_state_to_closed  # type: ignore[import-not-found]
except ImportError:
    from .session_state import _flip_state_to_closed  # type: ignore[no-redef]
flipped_path = _flip_state_to_closed(session_set_dir)
if flipped_path is not None:
    outcome.messages.append(
        "flipped session-state.json to complete/closed via "
        "_flip_state_to_closed"
    )
else:
    # No state file to flip — surface a warning but do not
    # fail close-out. The events ledger is the canonical
    # record; the snapshot is the consumer-readable cache.
    outcome.messages.append(
        "warning: no session-state.json found to flip; "
        "events ledger remains the canonical record"
    )
return outcome
```

The line-35 module-docstring forward-reference was rewritten to point
at the now-implemented flip:

```
Snapshot-flip on success lives in :func:`session_state._flip_state_to_closed`,
called from this script's success path after ``closeout_succeeded`` is
appended to the events ledger. The choice of the gate-bypass internal
flip helper (rather than the public :func:`mark_session_complete`)
mirrors the ``--repair --apply`` case-2 path: by the time we flip, the
events ledger already records the close-out as succeeded, so re-running
the gate via ``mark_session_complete`` would either redundantly validate
or fail on transient drift the gate would surface...
```

### Test changes

**`ai_router/tests/test_session_state_v2.py`** — extends
`TestRegisterSessionStartV2` with four new tests:

1. `test_register_session_start_emits_work_started` — fresh session set,
   call `register_session_start(session_number=1)`, assert
   `read_events(...)` contains exactly one `work_started` event with
   `session_number=1` and `event_type=="work_started"`.

2. `test_register_session_start_idempotent_on_repeat` — call
   `register_session_start` twice with the same `session_number=1`,
   assert `read_events(...)` filtered to `work_started` events for
   session 1 still has exactly one entry.

3. `test_register_session_start_total_sessions_still_propagates` —
   pre-create `activity-log.json` with `totalSessions=0`, call
   `register_session_start(total_sessions=7)`, assert the activity log
   now has `totalSessions=7` (regression guard for the existing
   `_propagate_total_sessions` behavior).

4. `test_register_session_start_emits_event_before_snapshot_write` —
   monkey-patches `session_events.append_event` to raise; calls
   `register_session_start`; asserts `RuntimeError` propagates AND the
   snapshot file was NOT created (proves the event was attempted before
   the snapshot write).

**`ai_router/tests/test_close_session_snapshot_flip.py`** (new file) —
three integration tests against a real-git-repo + bare-remote fixture
(no monkey-patched gates):

5. `test_close_session_happy_path_flips_snapshot` — one-session set,
   disposition + change-log + commit + push, run `close_session`,
   assert `result == "succeeded"` and `read_session_state(...)` has
   `lifecycleState=="closed"` / `status=="complete"` / `completedAt is
   not None`. Also asserts an outcome message names
   `_flip_state_to_closed` explicitly. Asserts the events ledger has
   `closeout_succeeded` and `current_lifecycle_state` returns `CLOSED`.

6. `test_close_session_happy_path_no_repair_needed` — same setup as #5,
   then runs `close_session --repair --apply` after the main close.
   Asserts result is either `noop_already_closed` (idempotency
   short-circuit) or `succeeded` with "no drift detected" in messages.
   This proves the main success path now flips the snapshot itself
   (rather than leaving drift for `--repair` to fix).

7. `test_close_session_multi_session_set_clean` — 2-session set
   end-to-end: session 1 close-out flips snapshot to closed; session 2
   `register_session_start` auto-emits `work_started` for session 2
   (asserted: exactly one such event); session 2 close-out flips
   snapshot back to closed; session 2 `closeout_succeeded` appears in
   the ledger exactly once. No manual `append_event` calls and no
   `--repair` invocations were used. The regression test for Set 013's
   papercut.

**`ai_router/tests/test_mark_session_complete_gate.py`** — one minimal
test update to `test_failure_emits_no_event`. The original assertion
`events == []` was over-strict given Set 014's new behavior: the
fixture's `register_session_start` call now emits `work_started`. The
assertion was narrowed to filter out `work_started` and check that no
*closeout* events landed (which is the test's actual intent — that
`mark_session_complete`'s failure path emits no events). The added
inline comment names Set 014 (a) as the reason.

### Test results

Full pytest run (`.venv/Scripts/python.exe -m pytest`) passes 698
tests. There are 2 pre-existing flaky failures in
`test_restart_role.py::TestRestartAgainstRealDaemon` (Windows daemon
PID-mismatch race), confirmed by stashing the Set 014 changes and
running on `master`: same failures occur, unrelated to this work.

The Set 014 tests run cleanly:

- `test_session_state_v2.py::TestRegisterSessionStartV2::test_register_session_start_emits_work_started` PASS
- `test_session_state_v2.py::TestRegisterSessionStartV2::test_register_session_start_idempotent_on_repeat` PASS
- `test_session_state_v2.py::TestRegisterSessionStartV2::test_register_session_start_total_sessions_still_propagates` PASS
- `test_session_state_v2.py::TestRegisterSessionStartV2::test_register_session_start_emits_event_before_snapshot_write` PASS
- `test_close_session_snapshot_flip.py::test_close_session_happy_path_flips_snapshot` PASS
- `test_close_session_snapshot_flip.py::test_close_session_happy_path_no_repair_needed` PASS
- `test_close_session_snapshot_flip.py::test_close_session_multi_session_set_clean` PASS

### Files touched

- `ai_router/session_state.py` — modified `register_session_start` (event-emission block + docstring update)
- `ai_router/close_session.py` — modified success path (flip block) + module docstring (line 35 replacement)
- `ai_router/tests/test_session_state_v2.py` — added four new tests
- `ai_router/tests/test_close_session_snapshot_flip.py` — new file, three tests
- `ai_router/tests/test_mark_session_complete_gate.py` — narrowed one assertion in `test_failure_emits_no_event` (filter out work_started)
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/ai-assignment.md` — Session 1 block authored
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-state.json` — flipped to in-progress (registration)
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-events.jsonl` — `work_started` event for session 1 (manually appended at session start, since the fix lands within Session 1 itself; documented in spec Risks section)

---

## Verification probes

Please review each of the following and report any concerns:

1. **`register_session_start` event-emission idempotency.** The fix
   reads existing events and skips the append if a matching
   `work_started` event already exists. Is the matching predicate
   correct (`event_type == "work_started" and session_number == N`)?
   Could the predicate match the wrong event under any reasonable
   reading of the events ledger (e.g., a session N that recycled a
   number)? Note: session numbers do not recycle within a set; the
   spec explicitly says new sets start at 1 and increment.

2. **`register_session_start` ordering — event before snapshot.** The
   spec's Risks section is explicit about the invariant: event before
   mutation, mirroring `mark_session_complete`. The implementation
   places the event-emission block *before* the snapshot dict
   construction and `open(path, "w")` call. Is the order correct as
   shipped? Is the new test
   `test_register_session_start_emits_event_before_snapshot_write`
   actually exercising the right invariant — i.e., does the
   monkey-patched failure prove the snapshot was un-flipped because of
   the failed event, rather than for some other reason?

3. **`register_session_start` `os.path.isdir` guard.** The fix uses
   `if os.path.isdir(session_set):` to gate the event emission, then
   the existing snapshot write follows unconditionally. If the
   directory does not exist, the event is silently skipped and the
   snapshot write fails with `FileNotFoundError` — same as before
   Set 014. Is this the intended best-effort behavior? The spec step 4
   names this as "the same `os.path.isdir` guard the existing
   `mark_session_complete` event-emission uses." Does the
   implementation match that precedent?

4. **`close_session` success-path flip — correct branch.** The flip
   is added immediately after the `closeout_succeeded` emit on the
   "succeeded" branch. Is this the correct branch — that is, is the
   flip *not* triggered on `closeout_failed` paths, `verification_timeout`
   paths, `gate_failed` paths, or `verification_failed` paths? Read
   the surrounding code (the `return outcome` statements on the
   failure branches above the success branch) and confirm those
   branches return *before* the new flip block.

5. **`close_session` lazy-import correctness.** The import uses the
   same try/except pattern as the existing `--repair` case-2 path
   (`from session_state import _flip_state_to_closed` / `from
   .session_state import _flip_state_to_closed`). Does the pattern
   match across both invocation paths (`python -m ai_router.close_session`
   and the test harness's `import close_session` from `ai_router/`
   on `sys.path`)? Are both paths exercised by the test suite?

6. **`close_session` `None`-return handling.** The flip helper
   returns `None` if there is no state file to flip. The new code
   appends a warning message but does NOT fail close-out. Is this the
   right behavior given that the events ledger is the canonical
   record? Does the test suite cover this branch (a session set with
   no `session-state.json`)?

7. **Test coverage specificity.** Are the assertions in the five new
   tests specific enough to catch regressions, rather than incidental?
   Specifically: do they assert exact event counts, correct session
   numbers, the right event types, the right `lifecycleState` /
   `status` values? Does the multi-session-set test exercise both
   fixes end-to-end as the spec promises?

8. **Docstring updates are accurate post-fix.** The
   `register_session_start` docstring now has an "Events emission"
   section. Is its description accurate w.r.t. the actual code? In
   particular, does it correctly state the ordering (event-before-snapshot)
   and the idempotency contract? Does the `close_session.py` line-35
   replacement correctly describe the new behavior, or does it
   create a new stale forward-reference?

9. **Idempotency / repair-path interaction.** With the main path now
   flipping the snapshot, does `--repair --apply` case-2 (events say
   closed but state has not caught up) still work for legitimate
   recovery cases (e.g., a crash mid-flip leaves the same drift)?
   The relevant code is around lines 1046–1075 in `close_session.py`
   — confirm it remains intact after the success-path edit. Does
   `test_repair_detects_event_says_closed_but_state_lagging` (in
   `test_close_session_session4.py`) still pass with the change?

10. **Anything else the spec called out.** The Session 1 spec lists
    five verification probes (event-emission correctness, success-path
    flip correctness, test coverage, docstring updates, repair-path
    interaction). Confirm each is covered above and flag any
    additional concerns specific to those probes.

Return your verdict in the standard JSON shape:

```json
{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}
```
