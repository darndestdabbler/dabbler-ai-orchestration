"""Session-events ledger — append-only lifecycle event log.

Each session set carries a ``session-events.jsonl`` file at its root that
mirrors the queue/state machinery as a human-auditable, git-trackable
log. One JSON object per line, written in append-only fashion. The file
is the prose-prose record that complements the structured
``session-state.json`` snapshot and the activity-log ``activity-log.json``
step trace.

Event types
-----------

Nine event types covering the per-session lifecycle:

- ``work_started`` — orchestrator registered the session as in-progress.
- ``verification_requested`` — orchestrator submitted work for
  cross-provider verification (synchronous API or queue-mediated).
- ``verification_claimed`` — a queue-mediated verifier picked up the
  request (queue path only; api path skips this event).
- ``verification_completed`` — verifier returned a verdict
  (``VERIFIED`` or ``ISSUES_FOUND``); does not by itself imply the work
  was accepted.
- ``verification_timed_out`` — queue-mediated verifier failed to
  return within its lease window.
- ``work_verified`` — orchestrator accepted a ``VERIFIED`` verdict and
  is ready to close the session out.
- ``closeout_requested`` — close-out script began the
  commit/push/notify ceremony (Set 3 wiring; emitted only by future
  close-out machinery).
- ``closeout_succeeded`` — close-out completed cleanly.
- ``closeout_failed`` — close-out hit an unrecoverable error
  (Critical/Major issue, push rejected, etc.).

Per-event fields
----------------

Every event carries the same three required keys:

- ``timestamp``: UTC ISO 8601 with a ``Z`` suffix (the on-disk format
  is normalized to UTC so cross-machine logs collate cleanly).
- ``session_number``: integer session number (1-indexed).
- ``event_type``: one of the strings above.

Plus arbitrary per-event payload fields supplied by the caller via
``**fields`` — e.g. ``verifier_model``, ``verdict``, ``issue_count``,
``failure_reason``. Unknown keys are accepted; the schema is
intentionally open so consumers (Set 3 close-out, dashboards) can
record context without bumping the format.

Append-only invariant
---------------------

``append_event`` opens the file in append mode and never rewrites
prior bytes. :func:`hash_existing_prefix` returns a SHA-256 of the
current contents so callers (and tests) can verify the prefix is
unchanged after a fresh append. This module never offers a public
"rewrite" or "delete" API; if a record needs to be corrected, append
a compensating event rather than mutate history.

Backfill
--------

Existing session sets pre-date this ledger. :func:`backfill_events_for_session_set`
reconstructs an event sequence from ``session-state.json`` and
``activity-log.json`` for any set lacking a ``session-events.jsonl``
file. The reconstruction is best-effort — malformed inputs result in a
warning and a skipped set rather than a failed backfill walk.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from .session_state import (  # type: ignore[import-not-found]
        SessionLifecycleState,
        SESSION_STATE_FILENAME,
        read_session_state,
    )
except ImportError:
    from session_state import (  # type: ignore[no-redef]
        SessionLifecycleState,
        SESSION_STATE_FILENAME,
        read_session_state,
    )


SESSION_EVENTS_FILENAME = "session-events.jsonl"

# Event types — exposed as a tuple so callers can validate without
# importing private constants.
EVENT_TYPES = (
    "work_started",
    "verification_requested",
    "verification_claimed",
    "verification_completed",
    "verification_timed_out",
    "work_verified",
    "closeout_requested",
    "closeout_succeeded",
    "closeout_failed",
)
_EVENT_TYPES_SET = frozenset(EVENT_TYPES)


_logger = logging.getLogger("ai_router.session_events")
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
_logger.setLevel(logging.INFO)
_logger.propagate = False


# ---------------------------------------------------------------------------
# Event dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Event:
    """Parsed event record.

    The on-disk shape is a flat JSON object; this dataclass exposes the
    three required fields plus a ``fields`` dict carrying any
    per-event-type extras (verdict, verifier_model, failure_reason,
    etc.). Frozen so callers cannot accidentally mutate a parsed event
    and feed it back to disk.
    """

    timestamp: str
    session_number: int
    event_type: str
    fields: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "timestamp": self.timestamp,
            "session_number": self.session_number,
            "event_type": self.event_type,
        }
        # Per-event fields are merged in flat — that's the on-disk shape
        # and what consumers expect when grepping the JSONL by jq.
        for k, v in self.fields.items():
            if k in ("timestamp", "session_number", "event_type"):
                # Caller supplied a key that conflicts with a required
                # one; the explicit field wins. (append_event also
                # rejects this case up front.)
                continue
            out[k] = v
        return out


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _events_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)


def _now_utc_iso() -> str:
    """Return a UTC ISO 8601 timestamp with a ``Z`` suffix.

    ``datetime.utcnow()`` is naive and ``isoformat()`` would produce
    ``2026-04-30T08:00:00`` (no zone). The append-only ledger needs an
    unambiguous timezone marker, hence ``Z``.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def append_event(
    session_set_dir: str,
    event_type: str,
    session_number: int,
    timestamp: Optional[str] = None,
    **fields: Any,
) -> Event:
    """Append one event to ``<session_set_dir>/session-events.jsonl``.

    Creates the file if it does not exist. Writes are append-mode +
    ``flush`` so an external reader sees the line as soon as the call
    returns. Returns the constructed :class:`Event`.

    ``timestamp`` defaults to "now in UTC". Callers that need to
    backfill a historical event pass an explicit ISO 8601 string.

    Raises :class:`ValueError` for an unknown ``event_type``. (Reserved
    keys ``timestamp``, ``session_number``, and ``event_type`` cannot
    appear in ``**fields`` because Python rejects the duplicate
    keyword at the call site.)
    """
    if event_type not in _EVENT_TYPES_SET:
        allowed = ", ".join(EVENT_TYPES)
        raise ValueError(
            f"event_type must be one of: {allowed} (got {event_type!r})"
        )
    if not isinstance(session_number, int) or isinstance(session_number, bool):
        raise ValueError(
            f"session_number must be an int (got {type(session_number).__name__})"
        )

    if not os.path.isdir(session_set_dir):
        raise FileNotFoundError(
            f"session_set_dir does not exist: {session_set_dir}"
        )

    ts = timestamp or _now_utc_iso()
    event = Event(
        timestamp=ts,
        session_number=session_number,
        event_type=event_type,
        fields=dict(fields),
    )
    line = json.dumps(event.to_dict(), sort_keys=False, ensure_ascii=False)

    path = _events_path(session_set_dir)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")
        f.flush()

    return event


def read_events(session_set_dir: str) -> List[Event]:
    """Return parsed events from ``session-events.jsonl``.

    Empty list if the file is absent. Malformed lines are skipped with
    a warning so a single corrupted record does not poison the entire
    history (a hand-edit gone wrong should be debuggable, not fatal).
    """
    path = _events_path(session_set_dir)
    if not os.path.isfile(path):
        return []
    out: List[Event] = []
    with open(path, "r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            text = raw.strip()
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                _logger.warning(
                    "session-events.jsonl line %d: invalid JSON (%s) — skipping",
                    lineno, exc,
                )
                continue
            if not isinstance(obj, dict):
                _logger.warning(
                    "session-events.jsonl line %d: not a JSON object — skipping",
                    lineno,
                )
                continue
            ts = obj.get("timestamp")
            sn = obj.get("session_number")
            et = obj.get("event_type")
            if not isinstance(ts, str) or not isinstance(sn, int) or not isinstance(et, str):
                _logger.warning(
                    "session-events.jsonl line %d: missing required fields — skipping",
                    lineno,
                )
                continue
            extra = {
                k: v for k, v in obj.items()
                if k not in ("timestamp", "session_number", "event_type")
            }
            out.append(Event(
                timestamp=ts,
                session_number=sn,
                event_type=et,
                fields=extra,
            ))
    return out


def hash_existing_prefix(session_set_dir: str) -> str:
    """SHA-256 of the current ``session-events.jsonl`` contents.

    Returns the hash of an empty bytes object if the file is absent.
    Useful for the append-only invariant check: snapshot the hash
    before an append, re-hash the same byte range after, confirm
    equal. The full-file hash will of course differ — callers wanting
    "did a new line land?" should compare lengths or read the tail.
    """
    path = _events_path(session_set_dir)
    h = hashlib.sha256()
    if os.path.isfile(path):
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Lifecycle state derivation
# ---------------------------------------------------------------------------

def current_lifecycle_state(
    events: List[Event],
) -> Optional[SessionLifecycleState]:
    """Derive the most recent session's lifecycle state from *events*.

    Returns ``None`` for an empty event log (the "not-started" case;
    :class:`SessionLifecycleState` has no member for that since
    "started" is the precondition for having any session at all).

    The derivation looks at the highest session number present and
    walks its events in order, advancing through the lifecycle:

    - ``work_started`` → ``work_in_progress``
    - ``verification_completed`` with ``verdict == "VERIFIED"`` or an
      explicit ``work_verified`` event → ``work_verified``
    - ``closeout_requested`` → ``closeout_pending``
    - ``closeout_failed`` → ``closeout_blocked``
    - ``closeout_succeeded`` → ``closed``

    A ``verification_completed`` whose verdict is not ``VERIFIED``
    (e.g. ``ISSUES_FOUND``) does not advance the state — the session
    stays ``work_in_progress`` until either the orchestrator emits
    ``work_verified`` or another ``verification_completed`` lands with
    a passing verdict. ``verification_timed_out`` and
    ``verification_claimed`` are observability-only — they do not
    change the state.

    Set 7 Session 2 note: the spec lists this function's "coarse-status
    reads" among the readers to collapse to ``read_status``. This
    function does not have any coarse-status reads — its entire
    derivation operates on the events list passed by the caller. The
    "lifecycle event reads keep their existing logic" carve-out in
    the spec covers the entire body. The collapse is a no-op: there
    is no coarse-status read here to remove.
    """
    if not events:
        return None

    by_session: Dict[int, List[Event]] = {}
    for ev in events:
        by_session.setdefault(ev.session_number, []).append(ev)
    if not by_session:
        return None

    most_recent = max(by_session.keys())
    session_events = by_session[most_recent]

    state: Optional[SessionLifecycleState] = None
    for ev in session_events:
        et = ev.event_type
        if et == "work_started":
            state = SessionLifecycleState.WORK_IN_PROGRESS
        elif et == "verification_completed":
            if ev.fields.get("verdict") == "VERIFIED":
                state = SessionLifecycleState.WORK_VERIFIED
            # Non-VERIFIED outcomes leave the state alone.
        elif et == "work_verified":
            state = SessionLifecycleState.WORK_VERIFIED
        elif et == "closeout_requested":
            state = SessionLifecycleState.CLOSEOUT_PENDING
        elif et == "closeout_failed":
            state = SessionLifecycleState.CLOSEOUT_BLOCKED
        elif et == "closeout_succeeded":
            state = SessionLifecycleState.CLOSED
        # verification_requested / verification_claimed /
        # verification_timed_out are observability-only.
    return state


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def _read_activity_log(session_set_dir: str) -> Optional[dict]:
    path = os.path.join(session_set_dir, "activity-log.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _normalize_iso(ts: Optional[str]) -> str:
    """Best-effort normalize an ISO timestamp to UTC with ``Z`` suffix.

    Falls back to "now in UTC" if *ts* cannot be parsed. This is only
    used for backfill, where preserving the original timestamp matters
    more than absolute precision — we want activity-log timestamps to
    survive into the events file even if they carry a ``-04:00``
    offset rather than a ``Z``.
    """
    if not ts:
        return _now_utc_iso()
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        return _now_utc_iso()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _reconstruct_events_from_activity(
    activity_log: dict,
    state: Optional[dict],
    has_changelog: bool,
) -> List[Event]:
    """Build a synthetic event list from activity-log + session-state.

    Strategy: for each session number present in ``entries``, emit
    ``work_started`` at the earliest timestamp. For every step whose
    ``stepKey`` contains ``"verify"`` and whose ``routedApiCalls``
    includes a ``session-verification`` task type, emit
    ``verification_requested`` followed by ``verification_completed``
    (verdict unknown from the log alone — recorded as
    ``verdict: "unknown"``). On the highest-numbered session, if the
    set has a ``change-log.md``, emit ``work_verified`` →
    ``closeout_requested`` → ``closeout_succeeded`` so the lifecycle
    derivation lands at ``closed``. If no change-log is present and
    the session-state lifecycleState is ``work_verified`` or later,
    emit a synthetic ``work_verified`` event to reflect that.

    Verdicts in the original activity log were not stored as a
    machine-readable field (the verifier output goes to
    ``session-reviews/session-NNN.md``). The backfill therefore marks
    verdict as ``unknown`` for historical events and lets the optional
    closeout-event sequence (driven by change-log presence) carry the
    "succeeded" signal.
    """
    entries = activity_log.get("entries") or []
    if not isinstance(entries, list) or not entries:
        return []

    by_session: Dict[int, List[dict]] = {}
    for e in entries:
        if not isinstance(e, dict):
            continue
        sn = e.get("sessionNumber")
        if not isinstance(sn, int):
            continue
        by_session.setdefault(sn, []).append(e)
    if not by_session:
        return []

    out: List[Event] = []
    session_numbers = sorted(by_session.keys())
    highest = session_numbers[-1]

    for sn in session_numbers:
        sess_entries = by_session[sn]
        # Sort by dateTime so the synthetic events come out in the
        # order they were originally logged — even if the source list
        # was assembled out of order.
        sess_entries.sort(key=lambda e: e.get("dateTime", ""))

        first_ts = sess_entries[0].get("dateTime")
        out.append(Event(
            timestamp=_normalize_iso(first_ts),
            session_number=sn,
            event_type="work_started",
            fields={"backfilled": True},
        ))

        for entry in sess_entries:
            step_key = entry.get("stepKey", "") or ""
            if "verify" not in step_key:
                continue
            calls = entry.get("routedApiCalls") or []
            if not any(
                isinstance(c, dict)
                and c.get("taskType") == "session-verification"
                for c in calls
            ):
                continue
            ts = _normalize_iso(entry.get("dateTime"))
            verifier_model = next(
                (c.get("model") for c in calls
                 if isinstance(c, dict)
                 and c.get("taskType") == "session-verification"),
                None,
            )
            out.append(Event(
                timestamp=ts,
                session_number=sn,
                event_type="verification_requested",
                fields={
                    "backfilled": True,
                    "verifier_model": verifier_model,
                    "step_key": step_key,
                },
            ))
            out.append(Event(
                timestamp=ts,
                session_number=sn,
                event_type="verification_completed",
                fields={
                    "backfilled": True,
                    "verifier_model": verifier_model,
                    # Activity log doesn't preserve a machine-readable
                    # verdict — the raw verifier output lives in
                    # session-reviews/. We use "unknown" rather than
                    # "VERIFIED" so the lifecycle derivation does not
                    # incorrectly advance to work_verified for
                    # ISSUES_FOUND rounds in the historical log.
                    "verdict": "unknown",
                    "step_key": step_key,
                },
            ))

    # Closeout signal for the highest session: if the set has a
    # change-log, the close-out clearly succeeded historically. Emit
    # the trio so the derived state lands at closed. Otherwise, fall
    # back to the session-state lifecycleState.
    last_ts = _normalize_iso(by_session[highest][-1].get("dateTime"))
    if has_changelog:
        out.extend([
            Event(last_ts, highest, "work_verified", {"backfilled": True}),
            Event(last_ts, highest, "closeout_requested", {"backfilled": True}),
            Event(last_ts, highest, "closeout_succeeded", {"backfilled": True}),
        ])
    else:
        # No change-log → set is in-progress. If the saved
        # session-state.json says the latest session is
        # work_verified or further along, reflect that with a
        # synthetic event.
        lifecycle = (state or {}).get("lifecycleState")
        if lifecycle in (
            SessionLifecycleState.WORK_VERIFIED.value,
            SessionLifecycleState.CLOSEOUT_PENDING.value,
            SessionLifecycleState.CLOSEOUT_BLOCKED.value,
            SessionLifecycleState.CLOSED.value,
        ):
            out.append(Event(
                last_ts, highest, "work_verified", {"backfilled": True},
            ))
        if lifecycle == SessionLifecycleState.CLOSEOUT_PENDING.value:
            out.append(Event(
                last_ts, highest, "closeout_requested", {"backfilled": True},
            ))
        elif lifecycle == SessionLifecycleState.CLOSEOUT_BLOCKED.value:
            out.extend([
                Event(last_ts, highest, "closeout_requested", {"backfilled": True}),
                Event(last_ts, highest, "closeout_failed", {"backfilled": True}),
            ])
        elif lifecycle == SessionLifecycleState.CLOSED.value:
            out.extend([
                Event(last_ts, highest, "closeout_requested", {"backfilled": True}),
                Event(last_ts, highest, "closeout_succeeded", {"backfilled": True}),
            ])

    return out


def backfill_events_for_session_set(
    session_set_dir: str,
    overwrite: bool = False,
) -> Optional[str]:
    """Reconstruct ``session-events.jsonl`` for a single session set.

    Returns the path written, or ``None`` if the set was skipped
    (already has a ledger and ``overwrite`` is False, or no
    activity-log to reconstruct from). When ``overwrite`` is True, an
    existing ledger is rewritten — use only for backfill testing or
    forced regeneration; production backfill should leave existing
    ledgers untouched.

    Best-effort: malformed activity-log or session-state files cause
    a warning and a skip rather than a raise. Sets with neither file
    are left alone (they predate even the activity-log convention or
    are not really session sets at all).
    """
    if not os.path.isdir(session_set_dir):
        _logger.warning(
            "backfill: %s is not a directory — skipping", session_set_dir
        )
        return None

    events_path = _events_path(session_set_dir)
    if os.path.isfile(events_path) and not overwrite:
        return None

    activity = _read_activity_log(session_set_dir)
    if activity is None:
        # No activity log → nothing to reconstruct from. Quiet return;
        # this is the common case for not-yet-started sets.
        return None

    state = read_session_state(session_set_dir)
    has_changelog = os.path.isfile(
        os.path.join(session_set_dir, "change-log.md")
    )

    events = _reconstruct_events_from_activity(activity, state, has_changelog)
    if not events:
        _logger.warning(
            "backfill: %s has activity-log but no reconstructable "
            "events — skipping", session_set_dir,
        )
        return None

    # Atomic write: a partial backfill would be worse than no
    # backfill, so write to a sibling temp and os.replace.
    tmp = f"{events_path}.tmp.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        for ev in events:
            f.write(json.dumps(ev.to_dict(), ensure_ascii=False) + "\n")
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp, events_path)
    return events_path


def backfill_all_session_sets(
    base_dir: str = "docs/session-sets",
    overwrite: bool = False,
) -> Dict[str, Optional[str]]:
    """Walk *base_dir* and backfill every set lacking a ledger.

    Returns a dict mapping each session-set directory to either the
    written ledger path (on success) or ``None`` (skipped — already
    has a ledger or no activity log to reconstruct from).
    """
    results: Dict[str, Optional[str]] = {}
    if not os.path.isdir(base_dir):
        return results
    for name in sorted(os.listdir(base_dir)):
        path = os.path.join(base_dir, name)
        if not os.path.isdir(path):
            continue
        if not os.path.isfile(os.path.join(path, "spec.md")):
            continue
        results[path] = backfill_events_for_session_set(
            path, overwrite=overwrite
        )
    return results
