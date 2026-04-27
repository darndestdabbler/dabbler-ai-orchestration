"""Session-state file management.

Writes and updates ``session-state.json`` in a session-set folder so external
tools (the Session Set Explorer VS Code extension, ``find_active_session_set``,
``print_session_set_status``) can detect that a set is in-progress before the
first ``activity-log.json`` entry has been written.

The file is written once at the start of each session (overwriting any prior
contents) and updated once at the end to flip ``status`` from ``in-progress``
to ``complete``. The committed state at the end of session N reflects the
completed-and-verified state of session N; the start of session N+1 overwrites
it again.
"""

import json
import os
from datetime import datetime
from typing import Optional


SESSION_STATE_FILENAME = "session-state.json"
SCHEMA_VERSION = 1


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def _state_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, SESSION_STATE_FILENAME)


def register_session_start(
    session_set: str,
    session_number: int,
    total_sessions: Optional[int],
    orchestrator_engine: str,
    orchestrator_model: str,
    orchestrator_effort: str = "unknown",
    orchestrator_provider: Optional[str] = None,
) -> str:
    """Write ``session-state.json`` marking *session_number* as in-progress.

    Called at the start of every session. Overwrites any prior state file.
    Returns the absolute path to the written file.

    ``orchestrator_effort`` accepts ``"low"``, ``"medium"``, ``"high"``,
    ``"fast"``, ``"normal"``, or ``"unknown"`` — orchestrators that cannot
    introspect their own effort level pass ``"unknown"`` rather than guess.
    """
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(session_set.rstrip("/\\")),
        "currentSession": session_number,
        "totalSessions": total_sessions,
        "status": "in-progress",
        "startedAt": _now_iso(),
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": orchestrator_engine,
            "provider": orchestrator_provider,
            "model": orchestrator_model,
            "effort": orchestrator_effort,
        },
    }
    path = _state_path(session_set)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")

    # Propagate to activity-log.json. Historically, activity-log.json was
    # created with totalSessions=0 by the SessionLog constructor and was
    # never updated, so done sets ended up with totalSessions=0 in the log
    # even though the orchestrator knew the real total. The orchestrator
    # passes total_sessions on every register_session_start call, so this
    # is the natural sync point: if the activity log has 0/null and the
    # caller knows a real total, write it.
    if total_sessions and total_sessions > 0:
        _propagate_total_sessions(session_set, total_sessions)

    return path


def _propagate_total_sessions(session_set: str, total: int) -> None:
    """Update activity-log.json's totalSessions if it is missing or zero."""
    log_path = os.path.join(session_set, "activity-log.json")
    if not os.path.isfile(log_path):
        return
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return
    current = data.get("totalSessions") or 0
    if current > 0:
        return  # trust the existing value
    data["totalSessions"] = total
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def mark_session_complete(
    session_set: str,
    verification_verdict: Optional[str] = None,
) -> Optional[str]:
    """Flip ``session-state.json`` ``status`` to ``complete`` for the current session.

    Called at the end of Step 8, just before ``git commit``, so the committed
    file reflects the completed-and-verified state. Returns the path if
    updated, ``None`` if no state file existed.
    """
    path = _state_path(session_set)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    state["status"] = "complete"
    state["completedAt"] = _now_iso()
    if verification_verdict is not None:
        state["verificationVerdict"] = verification_verdict
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")

    # If the orchestrator just authored change-log.md (this is the last
    # session of the set) and the activity log's totalSessions is still
    # missing or zero, finalize it from the unique sessionNumbers
    # recorded in entries. Catches the "spec said 4-5 sessions; we ended
    # at 4" case where no earlier register_session_start had a definitive
    # total to propagate.
    if os.path.isfile(os.path.join(session_set, "change-log.md")):
        _finalize_total_sessions_from_entries(session_set)

    return path


def _finalize_total_sessions_from_entries(session_set: str) -> None:
    """If activity-log.json's totalSessions is missing or zero, set it to
    the count of unique sessionNumbers in entries. Idempotent.
    """
    log_path = os.path.join(session_set, "activity-log.json")
    if not os.path.isfile(log_path):
        return
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return
    current = data.get("totalSessions") or 0
    if current > 0:
        return
    sessions = {
        e.get("sessionNumber")
        for e in data.get("entries", [])
        if isinstance(e.get("sessionNumber"), int)
    }
    if not sessions:
        return
    data["totalSessions"] = len(sessions)
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def read_session_state(session_set_dir: str) -> Optional[dict]:
    """Return parsed ``session-state.json`` contents, or ``None`` if absent or unreadable."""
    path = _state_path(session_set_dir)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
