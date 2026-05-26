"""Normalized progress view over ``session-state.json`` — schema v3 + v2 read.

The canonical reader path for session-set progress state. Every consumer
(close-out gates, the Session Set Explorer, the reconciler, repair
tooling) MUST go through :func:`get_progress` rather than reading the
legacy progress triple (``currentSession`` / ``totalSessions`` /
``completedSessions``) directly. The read-side v2 normalization
synthesizes a v3-shaped ``sessions[]`` from a v2 snapshot so callers
never branch on schema version.

Background: Set 030 (the proposal at
``docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md``)
collapses the v2 progress triple into a single canonical
``sessions[]`` ledger. This module is Session 1 of that migration: it
ships the helper, the v2 synthesizer, and the 8 invariant validators
that every later session depends on. Writer changes ship in Session 2;
reader migration in Session 3.

Schema cross-reference: ``docs/session-state-schema.md`` is the
authoritative documentation. Keep them in sync.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Tuple


SCHEMA_VERSION_V3 = 3

SESSION_STATUS_NOT_STARTED = "not-started"
SESSION_STATUS_IN_PROGRESS = "in-progress"
SESSION_STATUS_COMPLETE = "complete"
SESSION_STATUS_CANCELLED = "cancelled"

# Session-level statuses accepted by validators. NOTE: ``cancelled`` is
# deliberately excluded — per the proposal at
# ``docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md``
# (and decision D11/D12 in the spec), per-session cancellation is
# reserved for a future schema. Set 030 only exercises set-level
# cancellation (``CANCELLED.md`` filename marker plus top-level
# ``status: "cancelled"``). Re-introduce ``"cancelled"`` here once a
# future spec defines how cancelled sessions interact with rules 4-7.
SESSION_STATUSES = (
    SESSION_STATUS_NOT_STARTED,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_COMPLETE,
)

# Top-level statuses keep ``cancelled`` because set-level cancellation
# is a first-class state today (filename-marker driven).
TOP_LEVEL_STATUSES = (
    SESSION_STATUS_NOT_STARTED,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_COMPLETE,
    SESSION_STATUS_CANCELLED,
)

LIFECYCLE_STATE_WORK_IN_PROGRESS = "work_in_progress"
LIFECYCLE_STATE_CLOSED = "closed"

# Tolerated on read, canonicalized to ``complete``. Mirrors the v2
# alias map in ``session_state.py`` and the extension's
# ``STATUS_ALIASES`` so a hand-written file with a past-participle
# token never trips the validators.
_STATUS_ALIASES = {
    "completed": SESSION_STATUS_COMPLETE,
    "done": SESSION_STATUS_COMPLETE,
}


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class SessionStateInvariantError(ValueError):
    """Raised when a session-state object violates one of the 8 v3 invariants.

    The error message names the invariant rule number and includes an
    actionable hint. Read-side validators (this module) raise it; the
    write-side enforcement in Session 2's ``register_session_start`` /
    ``close_session`` will raise the same type so callers can catch one
    exception class regardless of which side detected the violation.
    """

    def __init__(self, rule: int, message: str) -> None:
        self.rule = rule
        super().__init__(f"[v3 invariant rule {rule}] {message}")


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SessionRecord:
    """One session entry in the v3 ``sessions[]`` ledger."""

    number: int
    title: str
    status: str

    def to_dict(self) -> dict:
        return {"number": self.number, "title": self.title, "status": self.status}


@dataclass(frozen=True)
class ProgressView:
    """Normalized progress view returned by :func:`get_progress`.

    ``sessions`` is the canonical ledger. Every other field is derived
    from it; readers may pick the field that best fits their UI without
    re-deriving themselves.
    """

    sessions: Tuple[SessionRecord, ...]
    total_sessions: int
    completed_sessions: Tuple[int, ...]
    current_session: Optional[int]
    next_session: Optional[int]
    is_between_sessions: bool

    def to_dict(self) -> dict:
        return {
            "sessions": [s.to_dict() for s in self.sessions],
            "totalSessions": self.total_sessions,
            "completedSessions": list(self.completed_sessions),
            "currentSession": self.current_session,
            "nextSession": self.next_session,
            "isBetweenSessions": self.is_between_sessions,
        }


# ---------------------------------------------------------------------------
# Status canonicalization
# ---------------------------------------------------------------------------


def canonicalize_status(value: Optional[str]) -> Optional[str]:
    """Map known aliases (``done``/``completed``) to canonical tokens.

    Returns ``None`` unchanged. Unknown non-None values are returned
    as-is; the invariant validators decide whether to reject them.
    """
    if value is None:
        return None
    return _STATUS_ALIASES.get(value, value)


# ---------------------------------------------------------------------------
# Spec.md title extraction (regex-first; AI fallback lives in Session 5)
# ---------------------------------------------------------------------------


# Matches headings like:
#   ### Session 1 of 5: Schema doc + get_progress() helper + v2-read synthesizer
# The "of N" segment is captured but not used — the title regex is
# permissive about it (some legacy specs omit it). Extra trailing
# whitespace and Markdown decorations are stripped by the caller.
_SESSION_HEADING_RE = re.compile(
    r"^###\s+Session\s+(?P<number>\d+)(?:\s+of\s+\d+)?\s*:\s*(?P<title>.+?)\s*$",
    re.MULTILINE,
)


def extract_session_titles_from_spec(spec_md_path: Path) -> List[Tuple[int, str]]:
    """Parse ``spec.md`` for ``### Session K of N: <title>`` headings.

    Returns ``[(number, title), ...]`` sorted by ``number``. Returns an
    empty list if the file is missing, unreadable, or contains no
    matching headings. Callers should fall back to generic
    ``"Session N"`` labels when this returns empty.
    """
    try:
        text = Path(spec_md_path).read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return []
    out: List[Tuple[int, str]] = []
    for m in _SESSION_HEADING_RE.finditer(text):
        number = int(m.group("number"))
        title = m.group("title").strip()
        out.append((number, title))
    out.sort(key=lambda t: t[0])
    return out


# ---------------------------------------------------------------------------
# v2 -> v3 read-time synthesis
# ---------------------------------------------------------------------------


def synthesize_v3_from_v2(state: dict, spec_md_path: Path) -> dict:
    """Synthesize a v3-shaped state from a v2 snapshot.

    Pure function: returns a NEW dict, does not mutate ``state``. The
    returned dict carries ``schemaVersion: 3`` and a derived
    ``sessions[]``; the original legacy fields are preserved on the
    returned dict so callers that still read them during the migration
    window see a consistent picture.

    Per memory ``feedback_default_not_started_evidence_to_escalate``:
    every session defaults to ``"not-started"``. We only escalate to
    ``"complete"`` when the v2 ``completedSessions[]`` array lists the
    number, and to ``"in-progress"`` when ``currentSession`` is set
    AND the top-level status is ``"in-progress"`` AND the session is
    not already complete.
    """
    if state is None:
        raise TypeError("synthesize_v3_from_v2: state is None")

    # Strict-int filtering: Python treats bool as int (isinstance(True, int)
    # is True; 1 == True; 1.0 == 1). A v2 file with currentSession: true or
    # completedSessions: [true] / [1.0] would otherwise silently escalate
    # session 1 to in-progress / complete. Reject those at the boundary
    # rather than papering over them.
    def _strict_positive_int(v):
        return type(v) is int and v > 0

    legacy_current_raw = state.get("currentSession")
    legacy_current = legacy_current_raw if _strict_positive_int(legacy_current_raw) else None
    legacy_total_raw = state.get("totalSessions")
    legacy_total = legacy_total_raw if _strict_positive_int(legacy_total_raw) else 0
    legacy_completed_raw = state.get("completedSessions") or []
    legacy_completed = [n for n in legacy_completed_raw if _strict_positive_int(n)]
    top_status_raw = state.get("status")
    top_status = canonicalize_status(top_status_raw)

    titles = extract_session_titles_from_spec(spec_md_path)
    titles_by_number = {n: t for n, t in titles}

    # Figure out the session count: prefer the explicit totalSessions,
    # else the largest known number from spec/legacy ledger, else 0.
    #
    # Set 046 Session 2: ``legacy_current`` is intentionally excluded
    # from the candidate set. Including it inflated the synthesized
    # total to 1 for the plan-less in-progress shape the Set 046 writer
    # produces (``totalSessions: null``, ``currentSession: 1``,
    # ``completedSessions: []``, no ``sessions[]``) — which made the
    # Explorer render ``0/1`` instead of the intended ``0/?``. The
    # remaining candidates (explicit ``totalSessions``, spec.md
    # headings, closed-session numbers) are all evidence the operator
    # has committed to a plan; ``currentSession`` alone is not.
    candidates = [legacy_total]
    candidates.extend(titles_by_number.keys())
    candidates.extend(legacy_completed)
    total = max(candidates) if candidates else 0

    sessions: List[dict] = []
    for n in range(1, total + 1):
        title = titles_by_number.get(n, f"Session {n}")
        if n in legacy_completed:
            status = SESSION_STATUS_COMPLETE
        elif (
            legacy_current is not None
            and legacy_current == n
            and top_status == SESSION_STATUS_IN_PROGRESS
            and n not in legacy_completed
        ):
            status = SESSION_STATUS_IN_PROGRESS
        else:
            # Default-to-not-started (per memory
            # `feedback_default_not_started_evidence_to_escalate`).
            # Earlier versions force-promoted every session to complete
            # when top-level status was complete, but that contradicts
            # "fail loud, never silently recover": a v2 file with
            # top-level=complete and completedSessions=[] is internally
            # inconsistent, and the synthesizer should expose that
            # contradiction (via invariant rule 7) rather than coerce
            # it into a "valid" shape.
            status = SESSION_STATUS_NOT_STARTED
        sessions.append({"number": n, "title": title, "status": status})

    synthesized = dict(state)
    synthesized["schemaVersion"] = SCHEMA_VERSION_V3
    synthesized["sessions"] = sessions
    if top_status is not None and top_status != top_status_raw:
        synthesized["status"] = top_status
    return synthesized


# ---------------------------------------------------------------------------
# get_progress: the one reader path
# ---------------------------------------------------------------------------


def read_progress(state: dict, spec_md_path: Path) -> ProgressView:
    """Single reader entry point for any session-state.json shape.

    This is the canonical reader path application code (close-out
    gates, the Session Set Explorer, the reconciler, repair logic)
    MUST use under D13. Branches v2/v3 internally so callers never
    touch the legacy ``currentSession`` / ``totalSessions`` /
    ``completedSessions`` triple directly.

    For v3 inputs (``sessions[]`` present), calls :func:`get_progress`
    directly. For v2 inputs, runs :func:`synthesize_v3_from_v2` first,
    then validates through ``get_progress``. The ``spec_md_path`` is
    only consulted on the v2 branch — pass any path on v3 inputs;
    missing/unreadable spec.md just falls back to ``"Session N"`` titles.

    Raises :class:`SessionStateInvariantError` on invariant violation.
    Application readers that want defensive fallback (e.g. degrade to
    in-progress rather than throw) should wrap the call in try/except.
    """
    if state is None:
        raise TypeError("read_progress: state is None")
    if state.get("sessions") is not None:
        return get_progress(state)
    return get_progress(synthesize_v3_from_v2(state, spec_md_path))


def get_progress(state: dict) -> ProgressView:
    """Return a normalized progress view over ``state``.

    Accepts a v3 state (with ``sessions[]``) directly. For v2 inputs,
    callers must first run :func:`synthesize_v3_from_v2` with the
    set's ``spec.md`` path — this keeps the helper pure and free of
    filesystem coupling. Application readers should prefer
    :func:`read_progress` (which branches v2/v3 internally) over
    calling this directly.

    Validates the 8 v3 invariants and raises
    :class:`SessionStateInvariantError` on violation. Readers that
    want to be forgiving can catch and downgrade.
    """
    if state is None:
        raise TypeError("get_progress: state is None")

    raw_sessions = state.get("sessions")
    if raw_sessions is None:
        raise SessionStateInvariantError(
            1,
            "sessions[] is missing; synthesize v3 from v2 first or pass a v3 state",
        )

    sessions = _parse_sessions(raw_sessions)
    top_status = canonicalize_status(state.get("status"))
    lifecycle_state = state.get("lifecycleState")

    validate_invariants(sessions, top_status=top_status, lifecycle_state=lifecycle_state)

    completed_numbers: List[int] = [
        s.number for s in sessions if s.status == SESSION_STATUS_COMPLETE
    ]
    in_progress = [s for s in sessions if s.status == SESSION_STATUS_IN_PROGRESS]
    current = in_progress[0].number if in_progress else None

    not_started = [s for s in sessions if s.status == SESSION_STATUS_NOT_STARTED]
    next_session = not_started[0].number if not_started else None

    is_between = (
        current is None
        and len(completed_numbers) >= 1
        and next_session is not None
    )

    return ProgressView(
        sessions=tuple(sessions),
        total_sessions=len(sessions),
        completed_sessions=tuple(completed_numbers),
        current_session=current,
        next_session=next_session,
        is_between_sessions=is_between,
    )


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------


def validate_invariants(
    sessions: List[SessionRecord],
    *,
    top_status: Optional[str],
    lifecycle_state: Optional[str],
) -> None:
    """Enforce the 8 v3 invariants. Raise on first violation.

    Rule numbers track the spec at
    ``docs/session-sets/030-session-state-v3-sessions-ledger/spec.md``
    so error messages and tests stay aligned with the canonical
    reference.
    """
    # Rule 1: sessions[] required and non-empty for any set with a plan.
    if not sessions:
        raise SessionStateInvariantError(1, "sessions[] must be non-empty")

    # Rule 2: numbers are positive ints, unique, contiguous starting at 1
    # (per spec D12: "Skipped sessions: Not supported in v3 ... Strict
    # sequential invariant"). Earlier drafts only checked "ascending",
    # which silently accepted broken ledgers like [1, 3].
    seen: set = set()
    expected = 1
    for s in sessions:
        if type(s.number) is not int:
            raise SessionStateInvariantError(
                2,
                f"session number must be an int (not bool/float/str); "
                f"got {s.number!r} of type {type(s.number).__name__}",
            )
        if s.number <= 0:
            raise SessionStateInvariantError(
                2, f"session number must be positive, got {s.number}"
            )
        if s.number in seen:
            raise SessionStateInvariantError(
                2, f"duplicate session number: {s.number}"
            )
        if s.number != expected:
            raise SessionStateInvariantError(
                2,
                f"session numbers must be contiguous starting at 1; "
                f"expected {expected} next, got {s.number}",
            )
        seen.add(s.number)
        expected = s.number + 1
        if s.status not in SESSION_STATUSES:
            raise SessionStateInvariantError(
                2,
                f"session {s.number} has unknown status {s.status!r}; "
                f"expected one of {SESSION_STATUSES}",
            )

    # Rule 3: at most one in-progress.
    in_progress = [s for s in sessions if s.status == SESSION_STATUS_IN_PROGRESS]
    if len(in_progress) > 1:
        nums = ", ".join(str(s.number) for s in in_progress)
        raise SessionStateInvariantError(
            3, f"only one session may be in-progress at a time; found: {nums}"
        )

    # Rule 4: no complete after a not-started/in-progress (sequential).
    # Walk the array; once we see a not-started or in-progress session,
    # no later session may be complete. (Cancelled is neutral here —
    # session-level cancellation is reserved for a future schema.)
    blocker_number: Optional[int] = None
    blocker_status: Optional[str] = None
    for s in sessions:
        if s.status in (SESSION_STATUS_NOT_STARTED, SESSION_STATUS_IN_PROGRESS):
            if blocker_number is None:
                blocker_number = s.number
                blocker_status = s.status
        elif s.status == SESSION_STATUS_COMPLETE and blocker_number is not None:
            raise SessionStateInvariantError(
                4,
                f"session {s.number} is complete but earlier session "
                f"{blocker_number} is {blocker_status!r}; complete "
                "sessions must form a contiguous prefix",
            )

    # Rule 8 ALWAYS applies — even when top_status is None — because
    # a state with ``lifecycleState: "closed"`` and missing top-level
    # status is internally inconsistent regardless of whether the
    # caller wants to validate the rest of the top-level rules.
    if lifecycle_state == LIFECYCLE_STATE_CLOSED:
        if top_status not in (SESSION_STATUS_COMPLETE, SESSION_STATUS_CANCELLED):
            raise SessionStateInvariantError(
                8,
                f"lifecycleState 'closed' requires status 'complete' or "
                f"'cancelled', got {top_status!r}",
            )

    # Top-level rules 5-7 are only checked when top_status is provided
    # — raw helper callers may want to validate sessions[] alone (e.g.,
    # the migrator's "is this sessions[] structurally valid?" probe).
    if top_status is None:
        return

    if top_status not in TOP_LEVEL_STATUSES:
        # Unknown top-level status is a shape/enum error, not a violation
        # of rules 5/6/7 specifically. Use rule 2 (the structural rule)
        # so callers reading the rule number get an accurate signal.
        raise SessionStateInvariantError(
            2,
            f"top-level status must be one of {TOP_LEVEL_STATUSES}, "
            f"got {top_status!r}",
        )

    # Rule 5: status not-started → every session not-started.
    if top_status == SESSION_STATUS_NOT_STARTED:
        offenders = [s.number for s in sessions if s.status != SESSION_STATUS_NOT_STARTED]
        if offenders:
            raise SessionStateInvariantError(
                5,
                f"top-level status 'not-started' but sessions {offenders} "
                "are not 'not-started'",
            )

    # Rule 7: status complete → every session complete.
    if top_status == SESSION_STATUS_COMPLETE:
        offenders = [s.number for s in sessions if s.status != SESSION_STATUS_COMPLETE]
        if offenders:
            raise SessionStateInvariantError(
                7,
                f"top-level status 'complete' but sessions {offenders} "
                "are not 'complete'",
            )

    # Rule 6: status in-progress → exactly one in-progress session OR
    # between-sessions (>=1 complete, >=1 not-started, no in-progress).
    if top_status == SESSION_STATUS_IN_PROGRESS:
        completed_count = sum(1 for s in sessions if s.status == SESSION_STATUS_COMPLETE)
        not_started_count = sum(1 for s in sessions if s.status == SESSION_STATUS_NOT_STARTED)
        in_progress_count = len(in_progress)
        if in_progress_count == 1:
            pass  # OK: an active session
        elif (
            in_progress_count == 0
            and completed_count >= 1
            and not_started_count >= 1
        ):
            pass  # OK: between sessions
        else:
            raise SessionStateInvariantError(
                6,
                "top-level status 'in-progress' requires either exactly one "
                "in-progress session or a between-sessions state (>=1 "
                f"complete, >=1 not-started, 0 in-progress); got "
                f"in_progress={in_progress_count}, complete={completed_count}, "
                f"not_started={not_started_count}",
            )

    # Rule 8 is hoisted above the top_status None-guard so it always
    # fires even when validating sessions[] in isolation; no duplicate
    # check needed here.


def _parse_sessions(raw: Iterable) -> List[SessionRecord]:
    """Coerce a raw ``sessions`` list into ``SessionRecord``s.

    Raises ``SessionStateInvariantError(rule=2)`` for structural
    problems (missing keys, wrong types) so the caller sees a single
    exception class for every shape violation.
    """
    if not isinstance(raw, list):
        raise SessionStateInvariantError(
            1, f"sessions[] must be a list, got {type(raw).__name__}"
        )
    out: List[SessionRecord] = []
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise SessionStateInvariantError(
                2, f"sessions[{i}] must be an object, got {type(entry).__name__}"
            )
        if "number" not in entry:
            raise SessionStateInvariantError(
                2, f"sessions[{i}] missing required key 'number'"
            )
        if "status" not in entry:
            raise SessionStateInvariantError(
                2, f"sessions[{i}] missing required key 'status'"
            )
        out.append(
            SessionRecord(
                number=entry["number"],
                title=entry.get("title", f"Session {entry['number']}"),
                status=canonicalize_status(entry["status"]) or entry["status"],
            )
        )
    return out


__all__ = [
    "SCHEMA_VERSION_V3",
    "SESSION_STATUS_NOT_STARTED",
    "SESSION_STATUS_IN_PROGRESS",
    "SESSION_STATUS_COMPLETE",
    "SESSION_STATUS_CANCELLED",
    "SESSION_STATUSES",
    "TOP_LEVEL_STATUSES",
    "LIFECYCLE_STATE_WORK_IN_PROGRESS",
    "LIFECYCLE_STATE_CLOSED",
    "SessionStateInvariantError",
    "SessionRecord",
    "ProgressView",
    "canonicalize_status",
    "extract_session_titles_from_spec",
    "synthesize_v3_from_v2",
    "read_progress",
    "get_progress",
    "validate_invariants",
]
