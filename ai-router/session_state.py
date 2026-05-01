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

Schema versions
---------------

- v1 (legacy): tracked progress via the binary ``status`` field
  (``"in-progress" | "complete"``). Did not carry per-session lifecycle
  granularity — work-verified vs closeout-pending vs closed all collapsed
  to ``"complete"``.
- v2 (current): adds ``lifecycleState`` from :class:`SessionLifecycleState`
  for explicit lifecycle granularity. Keeps ``status`` for backward
  compatibility with consumers (VS Code Session Set Explorer, dashboards)
  that have not yet been updated. New writes always set both. v1 files
  are migrated lazily on read — the in-memory dict gets ``schemaVersion``
  bumped and ``lifecycleState`` derived from ``status``; the file on disk
  is rewritten as v2 on the next ``register_session_start`` or
  ``mark_session_complete`` call.
"""

import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional, Tuple

import yaml


SESSION_STATE_FILENAME = "session-state.json"
SCHEMA_VERSION = 2


_logger = logging.getLogger("ai_router.session_state")
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
_logger.setLevel(logging.WARNING)
_logger.propagate = False


@dataclass(frozen=True)
class GateCheckFailure:
    """One failed gate check, surfaced through :class:`CloseoutGateFailure`.

    ``check`` is the gate predicate name (e.g. ``"working_tree_clean"``,
    ``"pushed_to_remote"``); ``remediation`` is a one-line hint the
    operator can act on. Mirrors :class:`close_session.GateResult` but
    is defined here so callers that catch the exception do not need to
    reach into ``close_session`` for the type.
    """

    check: str
    remediation: str


class CloseoutGateFailure(Exception):
    """Raised by :func:`mark_session_complete` when one or more gates fail.

    Carries the structured failure list on ``failures`` so callers can
    pretty-print remediations or filter by check name. The ``str()`` form
    is a human-readable summary suitable for logging or surfacing to the
    operator without further wrangling.

    Catch this exception, NOT ``Exception`` — the gate is the only path
    that surfaces this type, and catching it broadly would mask the
    structured failure information.
    """

    def __init__(self, failures: List[GateCheckFailure]) -> None:
        self.failures: List[GateCheckFailure] = list(failures)
        bullets = "\n".join(
            f"  - {f.check}: {f.remediation}" for f in self.failures
        ) or "  (no failures recorded)"
        super().__init__(
            f"close-out gate rejected {len(self.failures)} check(s):\n"
            f"{bullets}"
        )


class SessionLifecycleState(str, Enum):
    """Lifecycle stages a session passes through.

    Stored in ``session-state.json`` (v2+) under ``lifecycleState``. Values are
    the JSON-serialized form (the enum is a ``str`` subclass for that reason).

    - ``work_in_progress``: the session's primary work is underway. Set at
      ``register_session_start``.
    - ``work_verified``: cross-provider verification has produced a VERIFIED
      verdict for this session. Reserved for the close-out machinery
      (Set 3); not written by Set 1 mechanics.
    - ``closeout_pending``: verification has succeeded but the close-out
      script (commit / push / mark-complete / notify) has not yet run.
      Reserved for Set 3.
    - ``closeout_blocked``: close-out cannot proceed (e.g., unresolved
      Critical/Major issues, pending human UAT). Reserved for Set 3.
    - ``closed``: the session is fully complete — verified, committed,
      pushed, marked complete. Set at ``mark_session_complete``.
    """

    WORK_IN_PROGRESS = "work_in_progress"
    WORK_VERIFIED = "work_verified"
    CLOSEOUT_PENDING = "closeout_pending"
    CLOSEOUT_BLOCKED = "closeout_blocked"
    CLOSED = "closed"


# v1 status -> v2 lifecycle state. Only the two v1 status values exist; this
# mapping is the entire migration contract.
_V1_STATUS_TO_LIFECYCLE = {
    "in-progress": SessionLifecycleState.WORK_IN_PROGRESS,
    "complete": SessionLifecycleState.CLOSED,
}


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
        "lifecycleState": SessionLifecycleState.WORK_IN_PROGRESS.value,
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


def _flip_state_to_closed(
    session_set: str,
    verification_verdict: Optional[str] = None,
) -> Optional[str]:
    """Internal: flip ``session-state.json`` to closed without running the gate.

    Used by :func:`mark_session_complete` after the gate passes (or is
    bypassed via ``force=True``), and by ``close_session._run_repair``
    when it needs to catch up a snapshot to an events ledger that
    already records ``closeout_succeeded``. Callers that must enforce
    the gate use the public :func:`mark_session_complete` entry point.

    Returns the file path if it existed and was updated, ``None`` if no
    state file existed.
    """
    path = _state_path(session_set)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    # Migrate v1 → v2 in-memory before rewriting, so the on-disk file
    # comes out as v2 on the next write (per the schema migration contract).
    state = _migrate_v1_to_v2_inplace(state)
    state["status"] = "complete"
    state["lifecycleState"] = SessionLifecycleState.CLOSED.value
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


def mark_session_complete(
    session_set: str,
    verification_verdict: Optional[str] = None,
    *,
    force: bool = False,
) -> Optional[str]:
    """Run the close-out gate, then flip ``session-state.json`` to ``complete``.

    Called at the end of Step 8, just before ``git commit``, so the
    committed file reflects the completed-and-verified state. Returns
    the path if updated, ``None`` if no state file existed.

    Gate enforcement (Set 4 Session 3 wiring)
    -----------------------------------------
    Before flipping, the deterministic gate from Set 3 runs via
    :func:`close_session.run_gate_checks`. The contract:

    * **All gates pass** → flip the snapshot, append a
      ``closeout_succeeded`` event to ``session-events.jsonl`` (with
      ``forced=False``), return the path.
    * **One or more gates fail and ``force=False``** → raise
      :class:`CloseoutGateFailure` carrying the structured failure list.
      The snapshot is NOT flipped. No event is appended (the close-out
      didn't succeed, and emitting ``closeout_failed`` here would
      duplicate what a future ``close_session`` invocation would emit
      against the same set of failures).
    * **One or more gates fail and ``force=True``** → log a loud
      DEPRECATION warning, append ``closeout_succeeded`` with
      ``forced=True`` and the failed-check names, and proceed with the
      flip. The ``--force`` path is transitional and will be tightened
      in a future set; relying on it now incurs an audit-trail marker.

    The event-emission step is best-effort with respect to a missing
    session-set directory or a transient I/O hiccup: a write failure
    raises out of ``append_event`` and the flip itself does not happen,
    so the snapshot and the ledger never disagree on success.
    """
    if not os.path.isfile(_state_path(session_set)):
        return None

    state_before = read_session_state(session_set)
    session_number = (
        state_before.get("currentSession")
        if isinstance(state_before, dict)
        else None
    )
    if not isinstance(session_number, int):
        session_number = 0

    # Run the gate. Lazy import to avoid a top-level cycle: close_session
    # imports session_state for read_session_state and (in the repair
    # path) for _flip_state_to_closed.
    try:
        from close_session import run_gate_checks  # type: ignore[import-not-found]
    except ImportError:
        from .close_session import run_gate_checks  # type: ignore[no-redef]

    gate_results = run_gate_checks(session_set)
    failures = [
        GateCheckFailure(check=g.check, remediation=g.remediation)
        for g in gate_results
        if not g.passed
    ]

    if failures and not force:
        raise CloseoutGateFailure(failures)

    if failures and force:
        bullets = "; ".join(
            f"{f.check}: {f.remediation}" for f in failures
        )
        _logger.warning(
            "DEPRECATION: mark_session_complete(force=True) bypassed "
            "%d failing gate(s) on %s — %s. The --force / force=True "
            "path is transitional and will be tightened in a future set.",
            len(failures), session_set, bullets,
        )

    # Append the audit-trail event before the flip so that a failure
    # appending the event leaves the snapshot un-flipped — that way the
    # snapshot and the ledger never disagree on success. Lazy import
    # again to keep session_state import-light at module load time.
    try:
        from session_events import append_event  # type: ignore[import-not-found]
    except ImportError:
        from .session_events import append_event  # type: ignore[no-redef]

    event_fields = {
        "forced": bool(failures and force),
        "method": "snapshot_flip",
    }
    if failures and force:
        event_fields["failed_checks"] = [f.check for f in failures]
    if verification_verdict is not None:
        event_fields["verdict"] = verification_verdict
    if os.path.isdir(session_set):
        # session-events.jsonl lives under the session set; if the
        # directory doesn't exist we can't write the event. The flip
        # itself reads/writes session-state.json which we already
        # confirmed exists, so the flip is still safe to attempt.
        append_event(
            session_set,
            "closeout_succeeded",
            session_number,
            **event_fields,
        )

    return _flip_state_to_closed(session_set, verification_verdict)


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


def _migrate_v1_to_v2_inplace(state: dict) -> dict:
    """Transform a v1 state dict to v2 shape in-memory.

    No-op for dicts already at schemaVersion >= 2. v1 files that lack a
    recognized status value get ``lifecycleState=work_in_progress`` as a
    safe default — that mirrors what an orchestrator would have written had
    it been authoring a fresh start, and the next legitimate write (start
    or complete) corrects it.
    """
    schema_version = state.get("schemaVersion")
    if isinstance(schema_version, int) and schema_version >= SCHEMA_VERSION:
        return state
    if "lifecycleState" not in state:
        legacy_status = state.get("status")
        derived = _V1_STATUS_TO_LIFECYCLE.get(
            legacy_status, SessionLifecycleState.WORK_IN_PROGRESS
        )
        state["lifecycleState"] = derived.value
    state["schemaVersion"] = SCHEMA_VERSION
    return state


def read_session_state(session_set_dir: str) -> Optional[dict]:
    """Return parsed ``session-state.json`` contents, or ``None`` if absent or unreadable.

    Lazily migrates v1 files to v2 shape in the returned dict (does not
    rewrite the file — see module docstring).
    """
    path = _state_path(session_set_dir)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        return None
    if not isinstance(state, dict):
        return None
    return _migrate_v1_to_v2_inplace(state)


# ---------------------------------------------------------------------------
# Not-started synthesis and one-shot backfill (Set 7 Session 1)
# ---------------------------------------------------------------------------
#
# The invariant Set 7 establishes: every folder under ``docs/session-sets/``
# with a ``spec.md`` carries a ``session-state.json``, with ``status``
# always one of ``"not-started" | "in-progress" | "complete" | "cancelled"``
# (the last reserved for Set 8). Readers stop branching on file presence.
#
# Two writers land here:
#
# - :func:`synthesize_not_started_state` — writes the not-started shape for
#   a single folder. Idempotent: no-op if a state file already exists.
# - :func:`backfill_session_state_files` — walks all folders with a
#   ``spec.md``, infers status from current file presence (change-log →
#   complete; activity-log → in-progress; neither → not-started), and
#   writes the synthesized file. Existing state files are preserved
#   untouched (the spec is explicit on this — drift between fields like
#   ``status: "completed"`` vs ``"complete"`` is out of scope; Set 7's job
#   is making the file *exist* everywhere, not normalizing prior
#   contents).
#
# Both writers use a write-then-rename pattern (``os.replace``) so a
# concurrent reader hitting the same not-yet-synthesized folder during
# lazy-synthesis (Set 7 Session 2) sees either the absence or the
# complete file, never a partial one.

NOT_STARTED_STATUS = "not-started"
IN_PROGRESS_STATUS = "in-progress"
COMPLETE_STATUS = "complete"


def _atomic_write_json(path: str, payload: dict) -> None:
    """Write *payload* to *path* via a unique temp file + ``os.replace``.

    Same indentation and trailing-newline convention as the other writers
    in this module. The temp file is colocated with the destination so
    ``os.replace`` is a same-filesystem rename (cross-filesystem would
    fall back to copy+delete and lose atomicity).

    The temp filename is uniquified with PID + a short random suffix.
    A fixed ``path + ".tmp"`` would let two concurrent writers collide
    on the temp file itself: writer A opens for write, writer B
    truncates the same path mid-stream, writer A's ``os.replace`` moves
    a partial file. Per-call uniqueness avoids that without needing a
    cross-process lock.
    """
    directory = os.path.dirname(path) or "."
    base = os.path.basename(path)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{base}.",
        suffix=".tmp",
        dir=directory,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        # On any failure (write error, KeyboardInterrupt during the
        # critical section), best-effort remove the temp file so the
        # destination directory does not accumulate orphans across runs.
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise


def _read_total_sessions_from_spec(session_set_dir: str) -> Optional[int]:
    """Return ``totalSessions`` parsed from spec.md's Session Set Configuration block.

    Returns ``None`` if the spec is missing, unreadable, lacks the
    configuration block, or the block has no numeric ``totalSessions``
    field. Mirrors :func:`read_mode_config`'s tolerance for missing /
    legacy specs.
    """
    spec_path = os.path.join(session_set_dir, "spec.md")
    if not os.path.isfile(spec_path):
        return None
    try:
        with open(spec_path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    block = _extract_session_set_configuration_block(text) or {}
    value = block.get("totalSessions")
    if isinstance(value, int) and value > 0:
        return value
    return None


def _not_started_payload(session_set_dir: str) -> dict:
    """Return the canonical not-started ``session-state.json`` dict.

    All session-tracking fields are ``null``: no session has started, so
    there is no current session, no start time, no orchestrator. The
    ``totalSessions`` field is best-effort populated from the spec; it
    is the only field that has a meaningful value in this shape.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(session_set_dir.rstrip("/\\")),
        "currentSession": None,
        "totalSessions": _read_total_sessions_from_spec(session_set_dir),
        "status": NOT_STARTED_STATUS,
        "lifecycleState": None,
        "startedAt": None,
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": None,
    }


def synthesize_not_started_state(session_set_dir: str) -> str:
    """Write a not-started ``session-state.json`` for *session_set_dir*.

    Idempotent: if a state file already exists, returns its path without
    touching it. The caller should not depend on the existing file
    matching the canonical not-started shape — it could be in-progress,
    complete, or carry pre-Set-7 drift. The contract is only "after this
    call, the file exists."

    Used at session-set bootstrap time when the caller knows the set
    truly has not started — a fresh wizard scaffold or a Session 1
    register call. Lazy-synth fallback paths in :func:`read_status` use
    :func:`ensure_session_state_file` instead so a legacy folder that
    slipped through backfill (activity-log present, no state file) is
    inferred as in-progress rather than regressed to not-started.

    Returns the absolute path to the file (existing or newly written).
    """
    path = _state_path(session_set_dir)
    if os.path.isfile(path):
        return path
    _atomic_write_json(path, _not_started_payload(session_set_dir))
    return path


def ensure_session_state_file(session_set_dir: str) -> str:
    """Idempotently write the inferred ``session-state.json`` for a folder.

    Differs from :func:`synthesize_not_started_state` in one critical
    way: when the file is absent, this function uses
    :func:`_backfill_payload` to infer the right shape from current
    file presence (``change-log.md`` → complete; ``activity-log.json``
    → in-progress; neither → not-started). That matches the one-shot
    backfill's behavior, so a legacy folder that slipped through Set 7
    Session 1's backfill is correctly classified the first time
    :func:`read_status` lazy-synthesizes it.

    Verifier round 2 (Set 7 / Session 2) flagged the regression: the
    earlier lazy-synth always wrote the not-started shape, which would
    misclassify a legacy folder with ``change-log.md`` as "not-started"
    on first read. This helper is the fix.

    Idempotent: existing files are returned untouched (preserves
    pre-Set-7 drift like ``status: "completed"``; the read boundary
    canonicalizes it). Returns the absolute path to the file.
    """
    path = _state_path(session_set_dir)
    if os.path.isfile(path):
        return path
    _atomic_write_json(path, _backfill_payload(session_set_dir))
    return path


def _earliest_activity_log_timestamp(session_set_dir: str) -> Optional[str]:
    """Return the smallest ``dateTime`` string across activity-log entries.

    Used to backfill ``startedAt`` for in-progress sets that have an
    activity-log but no state file. ISO-8601 strings sort lexically in
    chronological order when the offset format is consistent (it is —
    every entry comes from :func:`_now_iso`), so a plain ``min`` works.

    Returns ``None`` if the log is missing, malformed, or has no entries
    with a ``dateTime`` string.
    """
    log_path = os.path.join(session_set_dir, "activity-log.json")
    if not os.path.isfile(log_path):
        return None
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        return None
    timestamps = [
        e["dateTime"]
        for e in entries
        if isinstance(e, dict) and isinstance(e.get("dateTime"), str)
    ]
    if not timestamps:
        return None
    return min(timestamps)


def _change_log_mtime_iso(session_set_dir: str) -> Optional[str]:
    """Return ``change-log.md``'s mtime as an ISO-8601 string, or ``None``.

    Best-effort approximation for ``completedAt`` on done sets that
    pre-date Set 7. The mtime reflects when the file was last written,
    which for change-logs is typically very close to actual close-out.
    Documented as approximate in :func:`backfill_session_state_files`'s
    docstring; consumers that need exact close-out timing should consult
    ``session-events.jsonl`` or the activity-log.
    """
    log_path = os.path.join(session_set_dir, "change-log.md")
    if not os.path.isfile(log_path):
        return None
    try:
        mtime = os.path.getmtime(log_path)
    except OSError:
        return None
    return datetime.fromtimestamp(mtime).astimezone().isoformat()


def _backfill_payload(session_set_dir: str) -> dict:
    """Choose the right ``session-state.json`` shape for an existing folder.

    Inference rules (spec, Session 1 deliverables):
    - ``change-log.md`` exists → status=complete, lifecycleState=closed,
      ``completedAt`` from the change-log's mtime (best-effort).
    - else ``activity-log.json`` exists → status=in-progress,
      lifecycleState=work_in_progress, ``startedAt`` from the earliest
      log entry's timestamp.
    - else → not-started shape.

    The orchestrator block is always ``null`` in backfilled files; the
    activity log carries per-step model info for anyone who needs to
    recover that history. (Risk noted in spec.)
    """
    base = _not_started_payload(session_set_dir)

    if os.path.isfile(os.path.join(session_set_dir, "change-log.md")):
        base["status"] = COMPLETE_STATUS
        base["lifecycleState"] = SessionLifecycleState.CLOSED.value
        base["completedAt"] = _change_log_mtime_iso(session_set_dir)
        return base

    if os.path.isfile(os.path.join(session_set_dir, "activity-log.json")):
        base["status"] = IN_PROGRESS_STATUS
        base["lifecycleState"] = SessionLifecycleState.WORK_IN_PROGRESS.value
        base["startedAt"] = _earliest_activity_log_timestamp(session_set_dir)
        return base

    return base


def _planned_backfill_paths(base_dir: str) -> List[str]:
    """Return session-set directories that need a ``session-state.json``.

    Internal helper used by :func:`backfill_session_state_files` and by
    the ``--dry-run`` path of the CLI. Walks immediate children of
    *base_dir* and returns those that have a ``spec.md`` but no
    ``session-state.json``. Existing state files signal "leave alone"
    even if they carry pre-Set-7 drift; normalization is out of scope
    (see :func:`backfill_session_state_files` docstring).

    Returns ``[]`` if *base_dir* does not exist (consumer repos may not
    have laid out the directory yet — that is a valid no-op).
    """
    if not os.path.isdir(base_dir):
        return []

    paths: List[str] = []
    for entry in sorted(os.listdir(base_dir)):
        sub = os.path.join(base_dir, entry)
        if not os.path.isdir(sub):
            continue
        if not os.path.isfile(os.path.join(sub, "spec.md")):
            continue
        if os.path.isfile(_state_path(sub)):
            continue
        paths.append(sub)
    return paths


StatusValue = Literal["not-started", "in-progress", "complete", "cancelled"]


# Tolerant aliases for ``status`` values that drifted in pre-Set-7 files.
# The spec is explicit that the backfill leaves existing files untouched
# ("normalizing field-value drift is out of scope; Set 7's invariant is
# *existence*, not field-value normalization"). Without tolerant reads,
# every consumer that switches to ``read_status`` would regress on those
# files — so the canonicalization happens at the read boundary instead
# of via a one-shot rewrite. New writers always emit the canonical form,
# so this map is a transitional concession that shrinks over time.
_STATUS_ALIASES = {
    "completed": "complete",  # observed in pre-Set-7 sets 005, 006
    "done": "complete",
}


def _canonicalize_status(raw: str) -> str:
    """Map a raw ``status`` value to the canonical Set-7 form.

    Unknown values pass through unchanged — a future status (e.g.
    ``"cancelled"`` from Set 8) added before this code knows about it
    should still surface to callers rather than being silently
    rewritten to ``"not-started"``. The downstream type accepts any
    string; only the four canonical values trigger consumer logic.
    """
    return _STATUS_ALIASES.get(raw, raw)


def _load_canonical_status(path: str) -> str:
    """JSON-load *path*, validate, and canonicalize the ``status`` field.

    Shared between :func:`read_status`'s file-present branch and its
    post-synthesis re-read so the validation and canonicalization
    contracts apply uniformly. Without this, a race where another
    process creates the file after the initial existence check could
    return a raw aliased value (``"completed"`` instead of
    ``"complete"``) or a ``KeyError`` instead of the documented
    ``ValueError`` for a missing-status field.

    Raises ``json.JSONDecodeError`` on malformed JSON, ``ValueError``
    on a non-dict top-level value or a missing/non-string ``status``.
    """
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    if not isinstance(state, dict):
        raise ValueError(
            f"{path}: session-state.json must contain a JSON object"
        )
    status = state.get("status")
    if not isinstance(status, str):
        raise ValueError(
            f"{path}: session-state.json missing string 'status' field"
        )
    return _canonicalize_status(status)


def read_status(session_set_dir: str) -> str:
    """Return the canonical ``status`` for *session_set_dir*.

    Single entry point for every "what state is this set in?" reader.
    Returns one of ``"not-started" | "in-progress" | "complete" |
    "cancelled"`` (the last reserved for Set 8 but already accepted by
    the type annotation). The value is read directly from
    ``session-state.json`` rather than re-derived from file presence.

    Lazy-synthesis fallback: if the folder has a ``spec.md`` but no
    ``session-state.json`` (e.g., a human-authored folder that never
    ran the backfill, or a consumer repo that has not yet picked up
    Set 7), this function calls :func:`ensure_session_state_file`,
    which infers the right initial status from current file presence
    (``change-log.md`` → ``"complete"``; ``activity-log.json`` →
    ``"in-progress"``; neither → ``"not-started"``) — same rules as
    the one-shot backfill. The function then re-reads so the returned
    value matches what is now on disk. The atomic-write pattern in
    :func:`_atomic_write_json` makes concurrent fallback synthesis
    benign — both writers produce the same shape and the last
    ``os.replace`` wins.

    Folders without a ``spec.md`` are not session sets; callers should
    filter these out before calling. Passing one in returns
    ``"not-started"`` (the synthesizer writes the file with
    ``totalSessions`` left as ``None``); the behavior is benign but
    unintended, so the caller-side filter is the contract.

    Parse errors propagate. The spec's risk section is explicit: "the
    fallback only triggers on file-absent, never on parse-error."
    A malformed ``session-state.json`` raises ``json.JSONDecodeError``
    so the caller sees the corruption rather than having it silently
    overwritten with the not-started shape. A present-but-non-dict
    or present-but-no-string-status is structurally malformed and
    raises ``ValueError`` for the same reason. Both branches funnel
    through :func:`_load_canonical_status` so the contract holds even
    if a concurrent writer creates the file between the existence
    check and the re-read.
    """
    path = _state_path(session_set_dir)
    if os.path.isfile(path):
        return _load_canonical_status(path)

    # File absent. Synthesize via :func:`ensure_session_state_file`,
    # which infers the right initial status from current file presence
    # (change-log → complete; activity-log → in-progress; neither →
    # not-started) — a legacy folder that slipped through Set 7
    # Session 1's backfill is correctly classified rather than
    # regressed to not-started. Then re-read through
    # :func:`_load_canonical_status` so validation and alias
    # canonicalization apply uniformly under races (a parallel writer
    # could land any valid status value between our existence check
    # and re-read).
    ensure_session_state_file(session_set_dir)
    return _load_canonical_status(path)


def backfill_session_state_files(
    base_dir: str = "docs/session-sets",
) -> int:
    """Walk *base_dir* and synthesize ``session-state.json`` where missing.

    For each immediate subdirectory of *base_dir* that contains a
    ``spec.md``:

    - If ``session-state.json`` already exists, leave it untouched. (The
      file may carry pre-Set-7 drift such as ``status: "completed"`` vs
      the canonical ``"complete"``; normalizing that is out of scope —
      Set 7's invariant is *existence*, not field-value normalization.)
    - Otherwise infer status from current file presence and write the
      synthesized file via :func:`_backfill_payload`.

    Returns the count of session-state files synthesized. Non-recursive
    — only direct children of *base_dir* are considered, matching the
    layout convention that every session-set folder is one directory
    level under ``docs/session-sets/``.

    Callers that need the affected paths (e.g., the CLI's per-line
    output, audit tooling for the lazy-synth fallback) should use
    :func:`_planned_backfill_paths` before invoking this function — the
    plan list before a write is the same as the list of folders this
    function actually wrote, since synthesis only fails on I/O errors
    that propagate out.
    """
    paths = _planned_backfill_paths(base_dir)
    for sub in paths:
        _atomic_write_json(_state_path(sub), _backfill_payload(sub))
    return len(paths)


# ---------------------------------------------------------------------------
# Next-orchestrator rubric
# ---------------------------------------------------------------------------

NextOrchestratorReasonCode = Literal[
    "continue-current-trajectory",
    "switch-due-to-blocker",
    "switch-due-to-cost",
    "other",
]

NEXT_ORCHESTRATOR_REASON_CODES = {
    "continue-current-trajectory",
    "switch-due-to-blocker",
    "switch-due-to-cost",
    "other",
}

NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN = 30


@dataclass
class NextOrchestratorReason:
    """Why the next session should run on a particular orchestrator.

    ``code`` is one of :data:`NEXT_ORCHESTRATOR_REASON_CODES`. ``specifics``
    is free-form prose explaining the call (≥ 30 chars to force a real
    sentence rather than ``"n/a"`` or one-word boilerplate).

    The ``code`` annotation is a ``Literal`` typed alias rather than ``str`` so
    static type checkers reject unknown codes at construction time. Runtime
    validation in :func:`validate_next_orchestrator` is the source of truth
    when the value originates from JSON (where the type hint can't help).
    """

    code: NextOrchestratorReasonCode
    specifics: str


@dataclass
class NextOrchestrator:
    """Recommendation for which orchestrator runs the next session.

    Mirrors the ``orchestrator`` block in ``session-state.json`` plus a
    structured reason. Validate via :func:`validate_next_orchestrator`
    before persisting.
    """

    engine: str
    provider: str
    model: str
    effort: str
    reason: NextOrchestratorReason


def _is_nonempty_str(value: object) -> bool:
    return isinstance(value, str) and value.strip() != ""


def validate_next_orchestrator(
    candidate: object,
) -> Tuple[bool, List[str]]:
    """Return ``(passed, errors)`` for a NextOrchestrator-shaped value.

    Accepts either a :class:`NextOrchestrator` instance or an equivalent
    dict (the latter is the form encountered when reading from JSON).

    Errors are agent-readable strings — short enough to surface in a
    verifier prompt without further wrangling.
    """
    errors: List[str] = []

    if isinstance(candidate, NextOrchestrator):
        data = {
            "engine": candidate.engine,
            "provider": candidate.provider,
            "model": candidate.model,
            "effort": candidate.effort,
            "reason": (
                {
                    "code": candidate.reason.code,
                    "specifics": candidate.reason.specifics,
                }
                if isinstance(candidate.reason, NextOrchestratorReason)
                else candidate.reason
            ),
        }
    elif isinstance(candidate, dict):
        data = candidate
    else:
        return False, [
            "next_orchestrator must be a NextOrchestrator or dict, "
            f"got {type(candidate).__name__}"
        ]

    for field_name in ("engine", "provider", "model", "effort"):
        if not _is_nonempty_str(data.get(field_name)):
            errors.append(f"{field_name} must be a non-empty string")

    reason = data.get("reason")
    if reason is None:
        errors.append("reason is required")
    elif not isinstance(reason, dict):
        errors.append("reason must be an object with code + specifics")
    else:
        code = reason.get("code")
        if not _is_nonempty_str(code):
            errors.append("reason.code must be a non-empty string")
        elif code not in NEXT_ORCHESTRATOR_REASON_CODES:
            allowed = ", ".join(sorted(NEXT_ORCHESTRATOR_REASON_CODES))
            errors.append(
                f"reason.code must be one of: {allowed} (got {code!r})"
            )

        specifics = reason.get("specifics")
        if not isinstance(specifics, str):
            errors.append("reason.specifics must be a string")
        elif len(specifics.strip()) < NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN:
            errors.append(
                f"reason.specifics must be at least "
                f"{NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN} chars "
                f"(got {len(specifics.strip())})"
            )

    return (len(errors) == 0), errors


# ---------------------------------------------------------------------------
# Mode config (parsed from spec.md "Session Set Configuration" block)
# ---------------------------------------------------------------------------

OUTSOURCE_MODES = {"first", "last"}
ROLE_VALUES = {"claude", "openai", "gemini"}
DEFAULT_OUTSOURCE_MODE = "first"


@dataclass
class ModeConfig:
    """Mode-aware configuration declared in spec.md's Session Set Configuration block.

    - ``outsource_mode``: ``"first"`` (default; orchestrator is a frontier
      model, verification routes to a cheaper outsourced model) or
      ``"last"`` (orchestrator and verifier roles swap; the cheap model
      drives, the frontier model verifies).
    - ``orchestrator_role`` / ``verifier_role``: only meaningful when
      ``outsource_mode == "last"``. Identifies which provider drives and
      which verifies. ``None`` when not declared.
    """

    outsource_mode: str = DEFAULT_OUTSOURCE_MODE
    orchestrator_role: Optional[str] = None
    verifier_role: Optional[str] = None


def _extract_session_set_configuration_block(spec_text: str) -> Optional[dict]:
    """Find the YAML config block that follows ``## Session Set Configuration``.

    Tolerates the heading at any indentation level and accepts an ATX
    heading at any depth. Search is bounded to the section between the
    Configuration heading and the next markdown heading or horizontal
    rule, so a YAML fence belonging to a later section can never be
    misread as the configuration. A leading UTF-8 BOM is stripped so a
    BOM-prefixed spec parses normally.

    Returns the parsed YAML mapping, or ``None`` if the block is absent
    or malformed.
    """
    spec_text = spec_text.lstrip("﻿")
    heading_pattern = re.compile(
        r"^\s*#{1,6}\s+Session\s+Set\s+Configuration\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    match = heading_pattern.search(spec_text)
    if not match:
        return None

    after_heading = spec_text[match.end():]

    # Prefer a YAML-labeled fence over an unlabeled one. If both exist
    # in the configuration section, the labeled fence is unambiguously
    # the configuration; an unlabeled fence is accepted only as a
    # fallback (e.g., for older specs that omitted the label).
    yaml_fence_pattern = re.compile(
        r"```ya?ml\s*\n(.*?)\n```",
        re.DOTALL,
    )
    any_fence_pattern = re.compile(
        r"```[^\n]*\n(.*?)\n```",
        re.DOTALL,
    )
    fence_match = (
        yaml_fence_pattern.search(after_heading)
        or any_fence_pattern.search(after_heading)
    )

    # Section terminator: the next markdown heading or horizontal rule
    # at the start of a line. Computed against the unbounded
    # ``after_heading`` so we can compare its position to the fence
    # position. (A terminator pattern can legitimately appear *inside*
    # a fenced YAML body — e.g. a YAML comment line ``# foo`` or a
    # YAML document separator ``---`` — so it must not be used to bound
    # the search before fence detection.)
    terminator_match = re.search(
        r"\n\s*(?:---\s*\n|#{1,6}\s)",
        after_heading,
    )

    if fence_match and (
        terminator_match is None
        or fence_match.start() < terminator_match.start()
    ):
        # The fence opens before any next-section signal, so it is the
        # configuration block. The fence body itself is delimited by
        # ``` ``` ``` so internal ``#`` comments and ``---`` separators
        # are safe.
        body = fence_match.group(1)
    else:
        # No fence in this section (or the section ends before any fence
        # opens). Treat the bounded section as raw YAML.
        section = (
            after_heading[: terminator_match.start()]
            if terminator_match
            else after_heading
        )
        body = section

    try:
        parsed = yaml.safe_load(body)
    except yaml.YAMLError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def parse_mode_config(spec_text: str) -> ModeConfig:
    """Parse a :class:`ModeConfig` from raw spec.md text.

    Missing fields fall back to defaults: ``outsource_mode`` defaults to
    ``"first"``, role fields default to ``None``. Values present in the
    spec are preserved as-is (no coercion to default), so invalid
    configurations surface as validation errors via
    :func:`validate_mode_config` rather than being silently masked.

    A spec without a ``Session Set Configuration`` block parses to
    ``ModeConfig()`` — this is the legacy / pre-block path and is valid
    by definition.
    """
    block = _extract_session_set_configuration_block(spec_text) or {}

    outsource_mode = block.get("outsourceMode", DEFAULT_OUTSOURCE_MODE)

    def _role(key: str) -> Optional[str]:
        value = block.get(key)
        if value is None:
            return None
        if isinstance(value, str):
            return value
        # Non-string values (numbers, lists, etc.) are not valid roles.
        # Coerce to a marker string that ``validate_mode_config`` will
        # reject explicitly, rather than dropping it to None silently.
        return str(value)

    return ModeConfig(
        outsource_mode=outsource_mode,
        orchestrator_role=_role("orchestratorRole"),
        verifier_role=_role("verifierRole"),
    )


def read_mode_config(session_set_dir: str) -> ModeConfig:
    """Read and parse the mode config from ``<session_set_dir>/spec.md``.

    A missing spec.md or a missing Session Set Configuration block
    yields the default ``ModeConfig`` rather than an error — older sets
    that pre-date the block are valid by definition (treated as
    ``outsourceMode: first``, no roles).
    """
    spec_path = os.path.join(session_set_dir, "spec.md")
    if not os.path.isfile(spec_path):
        return ModeConfig()
    try:
        with open(spec_path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return ModeConfig()
    return parse_mode_config(text)


def validate_mode_config(
    config: ModeConfig,
) -> Tuple[bool, List[str]]:
    """Validate cross-field rules for a :class:`ModeConfig`.

    - ``outsource_mode`` must be one of the known values.
    - When ``outsource_mode == "last"``, both ``orchestrator_role`` and
      ``verifier_role`` are required and must differ (otherwise the
      generator and verifier are the same provider, defeating
      cross-provider verification).
    - When ``outsource_mode == "first"``, role fields are ignored — they
      may be present without raising, but they have no effect.
    """
    errors: List[str] = []

    if config.outsource_mode not in OUTSOURCE_MODES:
        allowed = ", ".join(sorted(OUTSOURCE_MODES))
        errors.append(
            f"outsource_mode must be one of: {allowed} "
            f"(got {config.outsource_mode!r})"
        )

    if config.outsource_mode == "last":
        if config.orchestrator_role is None:
            errors.append(
                "orchestrator_role is required when outsource_mode == 'last'"
            )
        elif config.orchestrator_role not in ROLE_VALUES:
            allowed = ", ".join(sorted(ROLE_VALUES))
            errors.append(
                f"orchestrator_role must be one of: {allowed} "
                f"(got {config.orchestrator_role!r})"
            )

        if config.verifier_role is None:
            errors.append(
                "verifier_role is required when outsource_mode == 'last'"
            )
        elif config.verifier_role not in ROLE_VALUES:
            allowed = ", ".join(sorted(ROLE_VALUES))
            errors.append(
                f"verifier_role must be one of: {allowed} "
                f"(got {config.verifier_role!r})"
            )

        if (
            config.orchestrator_role is not None
            and config.verifier_role is not None
            and config.orchestrator_role == config.verifier_role
        ):
            errors.append(
                "orchestrator_role and verifier_role must differ "
                "(cross-provider verification would collapse otherwise)"
            )

    return (len(errors) == 0), errors
