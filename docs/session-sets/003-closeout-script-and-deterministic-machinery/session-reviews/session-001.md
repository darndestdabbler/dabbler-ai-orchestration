# Verification Round 1

VERDICT: ISSUES FOUND

I have reviewed the submission for Session 1 of Set 003. The overall structure is sound, the seams for future sessions are well-defined, and the core logic for idempotency, flag parsing, and structured output meets the specification. The issues found are a deviation from the spec regarding one of the CLI flags and two minor gaps in test coverage.

### Spec Deviations

**Issue** â†’ The `--reason-file` flag is specified as a deliverable for this session ("read narrative fields from a file") but is not implemented. The flag is parsed by `argparse` but is never used within the script's logic.
**Location** â†’ `ai-router/close_session.py`, `run()` function
**Fix** â†’ Implement the logic to read the file specified by `--reason-file`. The contents should be passed to `_emit_event` and included in the payload for the `closeout_requested` event. This ensures the narrative is captured in the audit trail as intended by the spec.

Example:
```python
# In run()
closeout_reason = None
if args.reason_file:
    try:
        with open(args.reason_file, "r", encoding="utf-8") as f:
            closeout_reason = f.read()
    except IOError as e:
        outcome.result = "invalid_invocation"
        outcome.messages.append(f"could not read --reason-file: {e}")
        return outcome

# In the call to _emit_event("closeout_requested", ...)
_emit_event(
    session_set_dir,
    "closeout_requested",
    outcome.session_number,
    outcome,
    force=args.force,
    manual_verify=args.manual_verify,
    reason=closeout_reason,  # Add the reason to the event payload
)
```

### Test Coverage

**Issue** â†’ The `closeout_failed` event emission path is not tested. The logic exists in `run()` but is unreachable because the stubbed gate checks always pass.
**Location** â†’ `ai-router/tests/test_close_session_skeleton.py`
**Fix** â†’ Add a test that mocks `_run_gate_checks` to return a failing `GateResult`. Assert that the outcome is `gate_failed`, the exit code is 1, and that both `closeout_requested` and `closeout_failed` events are emitted to the event ledger.

```python
# Example test structure
from unittest.mock import patch

def test_gate_failure_emits_closeout_failed_event(started_with_disposition):
    """A gate failure correctly emits closeout_failed and exits 1."""
    failing_gate_result = [GateResult("working_tree_clean", False, "unstaged files")]
    with patch(
        "close_session._run_gate_checks", return_value=failing_gate_result
    ) as mock_gate_checks:
        args = _ns(session_set_dir=started_with_disposition)
        outcome = run(args)

    assert outcome.result == "gate_failed"
    assert outcome.exit_code == 1
    assert "closeout_requested" in outcome.events_emitted
    assert "closeout_failed" in outcome.events_emitted
    
    events_on_disk = [e.event_type for e in read_events(started_with_disposition)]
    assert "closeout_failed" in events_on_disk
```

**Issue** â†’ The fallback logic in `_emit_event` that defaults a missing `session_number` to `0` is not covered by a test.
**Location** â†’ `ai-router/tests/test_close_session_skeleton.py`
**Fix** â†’ Add a test case using a fixture for a session set directory that contains `disposition.json` but is missing `session-state.json`. Run `close_session` and assert that the events written to `session-events.jsonl` are associated with session number `0`.

```python
# Example fixture and test
@pytest.fixture
def session_set_no_state_file(session_set_dir: str) -> str:
    """A session set with a disposition but no session-state.json."""
    disp = Disposition(status="completed", ...)
    write_disposition(session_set_dir, disp)
    # Explicitly do not call register_session_start
    return session_set_dir

def test_event_emission_with_no_session_state_file(session_set_no_state_file):
    """Events should be logged against session 0 if session-state is missing."""
    args = _ns(session_set_dir=session_set_no_state_file)
    run(args)
    
    events = read_events(session_set_no_state_file)
    assert len(events) == 2 # requested, succeeded
    assert all(e.session_number == 0 for e in events)
```

---

# Verification Round 2

VERDICT: VERIFIED

All three issues identified in Round 1 have been addressed.

1.  **`--reason-file` flag:** The implementation in `close_session.py` now correctly reads the specified file, handles I/O errors by returning `invalid_invocation`, and includes the file's contents in the `closeout_requested` event payload. The corresponding test `test_reason_file_text_lands_in_closeout_requested_event` and `test_unreadable_reason_file_returns_invalid_invocation` confirm this behavior. The fix is complete.
2.  **`closeout_failed` test coverage:** The new test `test_gate_failure_emits_closeout_failed_event` successfully mocks a gate failure, verifies the `gate_failed` outcome and exit code 1, and asserts that both `closeout_requested` and `closeout_failed` events are emitted to the ledger. This test fully addresses the coverage gap.
3.  **`session_number=0` fallback test coverage:** The new test `test_events_emitted_with_session_zero_when_state_file_absent` correctly simulates the absence of `session-state.json`, runs the close-out flow, and asserts that the resulting events in the ledger are correctly attributed to session `0`. This test fully addresses the coverage gap.

No new issues were found in the submitted patches.
