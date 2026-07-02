"""Set 077 S4 (S1 bundle F) — session_state robustness regression tests.

Covers the writer-hardening class landed in Session 4:

- the API writer refuses to re-open a session already in
  ``completedSessions`` (the CLI already refused; the direct helper
  silently demoted the closed session back to in-progress);
- ``_finalize_total_sessions_from_entries`` uses ``max`` of the entry
  session numbers, not ``len`` (a session that logged nothing must not
  shrink the total);
- ``_atomic_write_json`` retries ``os.replace`` on Windows
  ``PermissionError`` (held-file transients) before propagating;
- ``read_raw_session_state`` propagates ``PermissionError`` instead of
  silently treating an unreadable-but-present file as absent.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import session_state
from progress import SessionStateInvariantError
from session_state import (
    _atomic_write_json,
    _finalize_total_sessions_from_entries,
    read_raw_session_state,
    register_session_start,
)


SPEC = """\
# Test set

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
```
"""


@pytest.fixture
def set_dir(tmp_path: Path) -> str:
    d = tmp_path / "077-robustness"
    d.mkdir()
    (d / "spec.md").write_text(SPEC, encoding="utf-8")
    return str(d)


# ---------- writer-level re-open refusal ----------


def test_register_refuses_reopening_completed_session(set_dir: str) -> None:
    register_session_start(
        session_set=set_dir,
        session_number=1,
        total_sessions=3,
        orchestrator_engine="claude-code",
    )
    # Hand-flip session 1 to complete the way _flip_state_to_closed
    # would (mid-set close): status complete, top status in-progress.
    state = json.loads(
        (Path(set_dir) / "session-state.json").read_text(encoding="utf-8")
    )
    state["sessions"][0]["status"] = "complete"
    state["sessions"][0]["completedAt"] = "2026-07-02T08:00:00-04:00"
    (Path(set_dir) / "session-state.json").write_text(
        json.dumps(state, indent=2) + "\n", encoding="utf-8"
    )

    with pytest.raises(SessionStateInvariantError) as excinfo:
        register_session_start(
            session_set=set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
        )
    assert "already in completedSessions" in str(excinfo.value)

    # The refusal left the on-disk record untouched — session 1 keeps
    # its close-out record.
    after = json.loads(
        (Path(set_dir) / "session-state.json").read_text(encoding="utf-8")
    )
    assert after["sessions"][0]["status"] == "complete"
    assert after["sessions"][0]["completedAt"] is not None


def test_register_next_session_still_works_after_close(set_dir: str) -> None:
    register_session_start(
        session_set=set_dir,
        session_number=1,
        total_sessions=3,
        orchestrator_engine="claude-code",
    )
    state = json.loads(
        (Path(set_dir) / "session-state.json").read_text(encoding="utf-8")
    )
    state["sessions"][0]["status"] = "complete"
    (Path(set_dir) / "session-state.json").write_text(
        json.dumps(state, indent=2) + "\n", encoding="utf-8"
    )
    # Starting session 2 (not in completedSessions) is unaffected.
    register_session_start(
        session_set=set_dir,
        session_number=2,
        total_sessions=3,
        orchestrator_engine="claude-code",
    )
    after = json.loads(
        (Path(set_dir) / "session-state.json").read_text(encoding="utf-8")
    )
    assert after["sessions"][1]["status"] == "in-progress"


# ---------- _finalize uses max, not len ----------


def test_finalize_total_sessions_uses_max_not_len(set_dir: str) -> None:
    """Entries covering sessions {1, 3} mean 3 sessions, not 2 — a
    session that logged nothing must not shrink the recorded total."""
    log = {
        "totalSessions": 0,
        "entries": [
            {"sessionNumber": 1, "description": "one"},
            {"sessionNumber": 3, "description": "three"},
        ],
    }
    log_path = Path(set_dir) / "activity-log.json"
    log_path.write_text(json.dumps(log), encoding="utf-8")

    _finalize_total_sessions_from_entries(set_dir)

    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert data["totalSessions"] == 3


# ---------- _atomic_write_json PermissionError retry ----------


def test_atomic_write_retries_transient_permission_error(
    tmp_path: Path, monkeypatch
) -> None:
    """The first two os.replace attempts fail with PermissionError (a
    held destination on Windows); the third succeeds."""
    target = tmp_path / "state.json"
    real_replace = os.replace
    attempts = {"n": 0}

    def flaky_replace(src, dst):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise PermissionError("held by another process")
        real_replace(src, dst)

    monkeypatch.setattr(session_state.os, "replace", flaky_replace)
    monkeypatch.setattr(session_state.time, "sleep", lambda _s: None)

    _atomic_write_json(str(target), {"ok": True})

    assert attempts["n"] == 3
    assert json.loads(target.read_text(encoding="utf-8")) == {"ok": True}


def test_atomic_write_propagates_persistent_permission_error(
    tmp_path: Path, monkeypatch
) -> None:
    """A PermissionError that survives all retries propagates, and the
    temp file is cleaned up."""

    def always_denied(_src, _dst):
        raise PermissionError("permanently held")

    monkeypatch.setattr(session_state.os, "replace", always_denied)
    monkeypatch.setattr(session_state.time, "sleep", lambda _s: None)

    with pytest.raises(PermissionError):
        _atomic_write_json(str(tmp_path / "state.json"), {"ok": True})

    leftovers = [p for p in tmp_path.iterdir() if p.suffix == ".tmp"]
    assert leftovers == []


# ---------- read_raw_session_state exception narrowing ----------


def test_read_raw_propagates_permission_error(set_dir: str, monkeypatch) -> None:
    (Path(set_dir) / "session-state.json").write_text("{}", encoding="utf-8")

    import builtins

    real_open = builtins.open

    def denying_open(path, *a, **kw):
        if str(path).endswith("session-state.json"):
            raise PermissionError("ACL denies read")
        return real_open(path, *a, **kw)

    monkeypatch.setattr(builtins, "open", denying_open)

    with pytest.raises(PermissionError):
        read_raw_session_state(set_dir)


def test_read_raw_returns_none_for_corrupt_json(set_dir: str) -> None:
    (Path(set_dir) / "session-state.json").write_text(
        "{not json", encoding="utf-8"
    )
    assert read_raw_session_state(set_dir) is None
