# Cross-provider verification — Set 14 Session 1 Round 2

You previously reviewed Session 1 of Set 014 (close-out workflow
correctness fixes for `register_session_start` event emission and
`close_session`'s success-path snapshot flip). Round 1 returned three
ISSUES_FOUND items, all of which the orchestrator has now addressed.

Your job for Round 2: confirm each Round 1 issue is fully resolved and
flag any new concerns introduced by the fixes.

---

## Round 1 issues (recap) and how Round 2 addresses each

### Issue 1 — Ordering invariant untested

> "`close_session`'s success-path ordering is correct in the shipped
> code, but no test pins the required `closeout_succeeded`-before-
> snapshot-flip invariant."

**Fix:** Added
`test_close_session_emits_closeout_succeeded_before_flip` to
`ai_router/tests/test_close_session_snapshot_flip.py`. The test
monkeypatches `close_session.append_event` so it raises *only* for
`event_type == "closeout_succeeded"` (other events emit normally —
specifically `closeout_requested`, which is needed for the flow to
reach the success-path code at all). After the simulated failure:

- `pytest.raises(RuntimeError, match="simulated closeout_succeeded")`
- `read_session_state(...)["lifecycleState"] == "work_in_progress"`
  (snapshot un-flipped)
- `read_session_state(...)["status"] == "in-progress"`
- `read_session_state(...)["completedAt"] is None`
- No `closeout_succeeded` event in the ledger
  (`not any(e.event_type == "closeout_succeeded" for e in events)`)

This pins the invariant: a future refactor that moved
`_flip_state_to_closed` ahead of the event append would fail this test
because the snapshot would be flipped to `closed` despite the event
having raised.

### Issue 2 — `forced=True` not propagated to `_flip_state_to_closed`

> "Forced close-out does not pass `forced=True` into
> `_flip_state_to_closed()`. The new success-path flip therefore leaves
> `session-state.json` without `forceClosed: true` on `--force`,
> despite the CLI/help/docstring text saying the next snapshot flip
> will record that forensic marker."

**Fix:** The success-path call was changed from

```python
flipped_path = _flip_state_to_closed(session_set_dir)
```

to

```python
flipped_path = _flip_state_to_closed(
    session_set_dir, forced=bool(args.force),
)
```

with an inline comment block explaining the contract:

```python
# ``forced=args.force`` propagates the forensic marker on the
# ``--force`` path (Set 9 Session 3, D-2): the success path's
# message above promises that ``session-state.json`` will record
# ``forceClosed=true`` on the next snapshot flip. Without this
# argument the snapshot would silently skip the marker and
# forensic walks of the events + snapshot pair would lose the
# bypass signal.
```

A new test
`test_close_session_force_path_records_force_closed_marker` exercises
the path end-to-end:

- Sets `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` (D-2 hard-scoping gate).
- Writes a `--reason-file` (also required by D-2).
- Calls `close_session.run(args)` with `force=True` and
  `reason_file=...` set on the args.
- Asserts `outcome.result == "succeeded"`.
- Asserts `session-state.json["forceClosed"] is True`.
- Asserts `lifecycleState == "closed"` and `status == "complete"`.

### Issue 3 — `None` branch from `_flip_state_to_closed` untested

> "The spec-required `None` branch from `_flip_state_to_closed()` is
> untested. The code does append a warning and keep close-out
> successful, but there is no regression test proving that behavior."

**Fix:** Added
`test_close_session_succeeds_when_state_file_missing` to the same
file. The test monkeypatches `session_state._flip_state_to_closed` to
return `None` on an otherwise-valid close-out, then asserts:

- `outcome.result == "succeeded"`
- A message containing `"no session-state.json found to flip"` is in
  `outcome.messages`

The test does not delete the actual state file — instead it
monkeypatches the helper directly so the gate's read of
`session-state.json` (if any) is unaffected. This isolates the
"helper returned None" branch from "no state file at all," matching
the production code's intent: the helper's `None` return is a soft
warning regardless of why.

---

## Test results after Round 1 fixes

The new file `ai_router/tests/test_close_session_snapshot_flip.py`
now has **6 tests, all passing**:

```
test_close_session_happy_path_flips_snapshot                   PASSED
test_close_session_emits_closeout_succeeded_before_flip        PASSED  (Round 2)
test_close_session_force_path_records_force_closed_marker      PASSED  (Round 2)
test_close_session_succeeds_when_state_file_missing            PASSED  (Round 2)
test_close_session_happy_path_no_repair_needed                 PASSED
test_close_session_multi_session_set_clean                     PASSED
```

The full Python test suite (`pytest --ignore=...test_restart_role.py`)
passes 690 tests. The two ignored tests in `test_restart_role.py` are
pre-existing daemon-PID-mismatch flakes unrelated to Set 014 (verified
by stashing Set 014 changes and re-running on `master` — same
failures).

---

## Verification probes for Round 2

1. **Issue 1 fix — ordering test correctness.** Does the new test
   actually pin the ordering invariant? Specifically: does the
   monkeypatched `append_event` correctly distinguish
   `closeout_succeeded` from other events (so `closeout_requested`
   still emits and the flow reaches the success path), and would a
   refactor that flipped the order be caught? Read the new test and
   confirm. Note: the test reads `args[1]` for the event_type because
   `_emit_event` calls `append_event(session_set_dir, event_type,
   session_number, **fields)` positionally for the first three
   arguments; this matches the actual call shape in
   `close_session._emit_event`.

2. **Issue 2 fix — forced contract.** Does
   `_flip_state_to_closed(session_set_dir, forced=bool(args.force))`
   correctly propagate the marker only on the `--force` path?
   Specifically: when `args.force` is `False` (normal close-out),
   `forced=False` is passed and `forceClosed` is NOT written
   (existing behavior). When `args.force` is `True`, `forced=True` is
   passed and `forceClosed: true` IS written. Confirm by reading
   `_flip_state_to_closed` in `session_state.py` (the `forced`
   parameter only writes the marker when `True`; otherwise leaves
   the field at its default).

3. **Issue 3 fix — None-branch coverage.** The test monkeypatches
   `session_state._flip_state_to_closed` rather than removing the
   state file. Does this faithfully exercise the "helper returned
   None" code path in `close_session.py`? Specifically: after the
   monkeypatch, the success-path code receives `None` from
   `_flip_state_to_closed` and takes the `else:` branch that appends
   the warning message. Confirm the test's assertion about the
   warning message text matches the production code's message
   verbatim (`"warning: no session-state.json found to flip; events
   ledger remains the canonical record"` — the assertion uses
   `in m` substring match on `"no session-state.json found to flip"`,
   which is unique to that branch).

4. **No new issues introduced.** Did the Issue 2 fix
   (`forced=bool(args.force)`) introduce any side effect on the
   normal (non-force) path? Specifically: when `args.force` is
   `False`, the value passed is `False`, which is the default
   `_flip_state_to_closed` already used pre-Round-1 — so the
   non-force behavior should be unchanged. Confirm by reading
   `_flip_state_to_closed`'s signature and the `forced` parameter's
   default value.

5. **Test reuse / fixture correctness.** The three new tests reuse
   the same `_build_repo_with_set` fixture as the original three.
   Are the fixtures' preconditions adequate for the new tests? In
   particular: does the `--force` test correctly handle the
   disposition.json absent case (since `--force` accepts a missing
   disposition per Set 9 Session 3 D-2)? Reading the test, no
   disposition is written — confirm this is the right shape, given
   that D-2's documented contract is "`--force` accepts a missing
   disposition."

6. **Full suite still passes.** Two pre-existing flakes were
   excluded; all 690 other tests pass after the Round 2 fixes. Are
   there any tests this work *should* have updated that the
   orchestrator missed?

If everything checks out, return `{"verdict":"VERIFIED","issues":[]}`.
Otherwise return `{"verdict":"ISSUES_FOUND","issues":[...]}` with one
entry per remaining issue (issue/location/fix structure).
