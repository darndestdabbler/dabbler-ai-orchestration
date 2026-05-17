"""Session-state file management — Full-tier consumers only.

**Who uses this:** All Full-tier consumers. Manages the per-session-set
lifecycle snapshot (``session-state.json``) alongside the append-only events
ledger (``session-events.jsonl``). The snapshot is the consumer-readable cache;
the ledger is authoritative for close-out and repair.
**See also:** ``close_session.py`` (calls ``_flip_state_to_closed``);
``gate_checks.py`` (reads the state via ``read_session_state``).

---

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
- v2 (legacy): adds ``lifecycleState`` from :class:`SessionLifecycleState`
  for explicit lifecycle granularity. Keeps ``status`` for backward
  compatibility with consumers (VS Code Session Set Explorer, dashboards)
  that have not yet been updated. New writes always set both. v1 files
  are migrated lazily on read — the in-memory dict gets ``schemaVersion``
  bumped and ``lifecycleState`` derived from ``status``.
- v3 (current, Set 030): collapses the v2 progress triple
  (``currentSession`` / ``totalSessions`` / ``completedSessions``) into
  a single canonical ``sessions[]`` ledger. Per spec D5, writers
  emit BOTH the v3 ``sessions[]`` and the legacy triple derived from
  it; legacy fields are derivation outputs, never independently
  maintained. Per spec D6, writer-side invariant violations raise
  :class:`SessionStateInvariantError` (re-exported from
  :mod:`ai_router.progress`) — no silent recovery.
"""

import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Iterable, List, Literal, Optional, Tuple

import yaml

# Set 030 Session 2: re-export the v3 invariant validators and the
# exception class so writers in this module raise the same error type
# that the read-side progress.py validators raise. Callers that catch
# ``SessionStateInvariantError`` see one exception class regardless of
# which side (read or write) detected the violation.
try:
    from progress import (  # type: ignore[import-not-found]
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        synthesize_v3_from_v2,
        validate_invariants,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        synthesize_v3_from_v2,
        validate_invariants,
    )


SESSION_STATE_FILENAME = "session-state.json"
SCHEMA_VERSION = 3


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


# ---------------------------------------------------------------------------
# Set 030 Session 2: v3 dual-write helpers
# ---------------------------------------------------------------------------
#
# Per spec D5, every Full-tier writer emits BOTH the canonical
# ``sessions[]`` ledger AND the legacy progress triple
# (``currentSession`` / ``totalSessions`` / ``completedSessions``)
# derived from it. Legacy fields are output of derivation, never
# independently maintained.
#
# Three helpers below split the work:
#
# - :func:`_existing_sessions_records` reads any ``sessions[]`` already
#   present on disk (a previous v3 write) and returns it as
#   ``SessionRecord``s with ``title`` carried forward.
# - :func:`_build_sessions_array` is the single source of truth for the
#   v3 ledger shape. It composes prior-closed sessions (``complete``),
#   the in-flight session (``in-progress`` when present), and the
#   remaining sessions (``not-started``), filling titles from any prior
#   v3 ledger, then ``spec.md``, then the generic ``Session N``
#   fallback. It also handles the "extra closed sessions outside
#   sessions[]" case: an existing v3 file's titles are preserved when
#   the array is consistent with the requested transition.
# - :func:`_derive_legacy_fields` is the only path that materializes
#   the legacy triple. The same function runs on both writers
#   (``register_session_start`` and ``_flip_state_to_closed``) so the
#   parity invariant ("legacy fields always agree with ``sessions[]``")
#   holds by construction.


def _existing_sessions_records(state: Optional[dict]) -> List[SessionRecord]:
    """Return ``sessions[]`` as a list of records, or ``[]`` if absent.

    A previous v3 write on this set produced ``sessions[]`` already; the
    titles inside are the highest-fidelity source for the next writer's
    title column (regex extraction from ``spec.md`` is the fallback for
    sets that have never been through a v3 write). Returns ``[]`` for
    v1/v2-shaped or fresh state.

    Coercion is intentionally tolerant: a malformed prior ``sessions[]``
    on disk should not block a writer call. Records that fail basic
    type checks are dropped here; the validate_invariants() call later
    in :func:`_build_sessions_array` will fail loud if the resulting
    array is invalid.
    """
    if not isinstance(state, dict):
        return []
    raw = state.get("sessions")
    if not isinstance(raw, list):
        return []
    out: List[SessionRecord] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if type(number) is not int or number <= 0:
            continue
        title = entry.get("title")
        if not isinstance(title, str):
            title = f"Session {number}"
        raw_status = entry.get("status")
        status = canonicalize_status(raw_status) if isinstance(raw_status, str) else None
        if status not in (
            SESSION_STATUS_NOT_STARTED,
            SESSION_STATUS_IN_PROGRESS,
            SESSION_STATUS_COMPLETE,
        ):
            status = SESSION_STATUS_NOT_STARTED
        out.append(SessionRecord(number=number, title=title, status=status))
    return out


def _spec_titles_for_set(session_set_dir: str) -> dict:
    """Return ``{number: title}`` parsed from the set's ``spec.md``.

    Empty dict if the spec is absent or has no parseable session
    headings. Backfill helper for sets that have never been through a
    v3 write — :func:`_build_sessions_array` consults this when an
    incoming ``sessions[]`` has no entry for a given number.
    """
    spec_path = Path(session_set_dir) / "spec.md"
    return {n: t for n, t in extract_session_titles_from_spec(spec_path)}


def _build_sessions_array(
    session_set_dir: str,
    *,
    total: int,
    completed_numbers: Iterable[int] = (),
    in_progress_number: Optional[int] = None,
    prior_state: Optional[dict] = None,
) -> List[dict]:
    """Construct the v3 ``sessions[]`` ledger as a list of plain dicts.

    Title resolution order, per record:

    1. The existing v3 ``sessions[]`` on disk (carries forward across
       boundary writes).
    2. ``spec.md`` regex extraction (the canonical authoring source).
    3. ``Session N`` fallback (always available).

    Status assignment, per record at position ``k`` (1..total):

    - ``in_progress_number == k`` → ``in-progress``
    - ``k in completed_numbers`` → ``complete``
    - otherwise → ``not-started``

    Raises :class:`SessionStateInvariantError` if the resulting array
    would violate any of the 8 invariants. The writer's fail-loud
    contract (spec D6) — no silent recovery — means the writer's
    in-process check happens here, BEFORE any file is written.
    """
    if not isinstance(total, int) or total <= 0:
        raise SessionStateInvariantError(
            1,
            f"_build_sessions_array: total must be a positive int, got {total!r}",
        )

    # Fail loud (spec D6) on any number outside ``[1, total]``. Silent
    # truncation would let callers produce a "looks valid" sessions[]
    # by quietly dropping bogus inputs — e.g., starting session 3
    # against total=2 would write a between-sessions snapshot with
    # currentSession=None, hiding the off-by-one. Rule 2 is the
    # appropriate rule number (positive ints, contiguous from 1, in
    # range).
    if in_progress_number is not None:
        if (
            type(in_progress_number) is not int
            or in_progress_number < 1
            or in_progress_number > total
        ):
            raise SessionStateInvariantError(
                2,
                f"in_progress_number must be an int in [1, {total}], "
                f"got {in_progress_number!r}",
            )
    completed_set: set = set()
    for n in completed_numbers:
        if type(n) is not int or n < 1 or n > total:
            raise SessionStateInvariantError(
                2,
                f"completed_numbers entries must be ints in [1, {total}], "
                f"got {n!r}",
            )
        completed_set.add(n)

    existing = {r.number: r for r in _existing_sessions_records(prior_state)}
    spec_titles = _spec_titles_for_set(session_set_dir)

    out: List[dict] = []
    for k in range(1, total + 1):
        if existing.get(k) is not None:
            title = existing[k].title
        elif k in spec_titles:
            title = spec_titles[k]
        else:
            title = f"Session {k}"

        if in_progress_number is not None and k == in_progress_number:
            status = SESSION_STATUS_IN_PROGRESS
        elif k in completed_set:
            status = SESSION_STATUS_COMPLETE
        else:
            status = SESSION_STATUS_NOT_STARTED
        out.append({"number": k, "title": title, "status": status})

    return out


def _derive_legacy_fields(
    sessions: List[dict],
) -> Tuple[Optional[int], int, List[int]]:
    """Return ``(current_session, total_sessions, completed_sessions)``.

    The legacy triple is always derived from ``sessions[]``, never
    independently maintained. ``current_session`` is the single
    in-progress session's number, or ``None`` when no session is
    in-flight (between-sessions or complete). ``completed_sessions``
    is sorted ascending.
    """
    current: Optional[int] = None
    completed: List[int] = []
    for entry in sessions:
        num = entry["number"]
        status = entry["status"]
        if status == SESSION_STATUS_IN_PROGRESS:
            current = num
        elif status == SESSION_STATUS_COMPLETE:
            completed.append(num)
    completed.sort()
    return current, len(sessions), completed


def _validate_sessions_or_raise(
    sessions: List[dict],
    *,
    top_status: Optional[str],
    lifecycle_state: Optional[str],
) -> None:
    """Convert a list-of-dicts ``sessions`` into records, then validate.

    Writer-side wrapper around :func:`progress.validate_invariants` so
    callers in this module can pass plain dicts (the on-disk shape) and
    get a fail-loud :class:`SessionStateInvariantError` on any rule
    violation. The conversion preserves the structural-error rule
    numbers from ``progress._parse_sessions``.
    """
    records: List[SessionRecord] = []
    for entry in sessions:
        records.append(
            SessionRecord(
                number=entry["number"],
                title=entry.get("title", f"Session {entry['number']}"),
                status=entry["status"],
            )
        )
    validate_invariants(
        records,
        top_status=top_status,
        lifecycle_state=lifecycle_state,
    )


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

    Events emission
    ---------------
    After validating the prospective sessions[] (spec D6: fail loud
    before any file is written), this function appends a
    ``work_started`` event to ``session-events.jsonl`` for
    *session_number*, THEN writes the snapshot. The append is
    idempotent: if a ``work_started`` event for this session number
    is already in the ledger, no second event is appended (covers
    the orchestrator-restart case where ``register_session_start``
    is called twice on the same session). The append happens
    **before** the snapshot write so that an event-write failure
    leaves the snapshot un-flipped — same ordering invariant as
    :func:`mark_session_complete` (event is the audit trail,
    snapshot is the consumer-readable cache; if the snapshot is
    missing on the next call, idempotency dedupes the event and the
    retry succeeds cleanly). The append is best-effort with respect
    to a missing session-set directory: if the directory does not
    exist, the event is skipped (the snapshot write below will
    raise ``FileNotFoundError`` for the same reason, so the skip
    never hides a recoverable case).

    Set 030 Session 2 reordered the steps so the writer-side
    invariant check runs FIRST. The previous v2 ordering (event,
    then snapshot) trusted the caller to pass valid arguments;
    under D6 a bad call would have appended a work_started event
    before raising, leaving the events ledger ahead of the
    snapshot. The new ordering — build sessions[], validate, emit
    event, write snapshot — keeps both files in lockstep on every
    failure path.
    """
    # Preserve completedSessions[] across the snapshot rewrite (Set 022
    # invariant: the array is the progress ledger and survives session
    # boundaries). For pre-Set-022 sets without the array on disk,
    # compute_effective_completed_sessions backfills from the events
    # ledger so the very first start_session call after the upgrade
    # heals the snapshot. The backfill is intentionally same-tier as
    # the close_session writer's backfill — both use the same helper.
    prior_completed: List[int] = []
    existing = read_session_state(session_set)
    if isinstance(existing, dict):
        prior_completed = compute_effective_completed_sessions(session_set)

    # Set 030 Session 2: build the v3 sessions[] ledger first; the
    # legacy triple is derived from it. The session count is the
    # caller's ``total_sessions``, falling back to the existing state's
    # value, then to the largest known number across prior_completed +
    # session_number + spec.md headings. The order matters: writer
    # callers (the start_session CLI) always pass the spec-known
    # ``totalSessions`` so the first branch wins on every legitimate
    # invocation; the fallbacks protect the very rare case where a
    # caller doesn't have the total at hand.
    effective_total = total_sessions
    if not (isinstance(effective_total, int) and effective_total > 0):
        if isinstance(existing, dict):
            prior_total = existing.get("totalSessions")
            if isinstance(prior_total, int) and prior_total > 0:
                effective_total = prior_total
    if not (isinstance(effective_total, int) and effective_total > 0):
        spec_titles = _spec_titles_for_set(session_set)
        max_spec_number = max(spec_titles.keys()) if spec_titles else 0
        max_completed = max(prior_completed) if prior_completed else 0
        effective_total = max(max_spec_number, max_completed, session_number)
    # Spec D6 fail-loud: if the caller-supplied (or
    # backfilled-from-existing) total is smaller than the session
    # number being started or any prior-closed session, the input
    # is incoherent — the CLI's boundary checks should have caught
    # it upstream, and silently stretching the total here would
    # mask the upstream bug. Surface it instead. The
    # _build_sessions_array call below would also raise on the
    # same condition (in_progress_number > total), but this earlier
    # check produces a clearer error message that names both
    # values.
    if session_number > effective_total:
        raise SessionStateInvariantError(
            2,
            f"session_number {session_number} exceeds total_sessions "
            f"{effective_total}; the CLI's boundary check should have "
            "refused this. If you are calling the Python helper "
            "directly, pass a total_sessions that covers your "
            "session_number, or update the spec.md totalSessions "
            "field first.",
        )
    if prior_completed and max(prior_completed) > effective_total:
        raise SessionStateInvariantError(
            2,
            f"prior completedSessions contains {max(prior_completed)} "
            f"which exceeds total_sessions {effective_total}; "
            "totalSessions on disk is inconsistent with the closed-set "
            "history. Run close_session --repair or update the spec.md "
            "totalSessions field.",
        )

    # in_progress is session_number unless it's already in
    # prior_completed (which would violate rule 4 — the writer must
    # refuse, since the start_session CLI's boundary gate should have
    # caught this earlier).
    sessions = _build_sessions_array(
        session_set,
        total=effective_total,
        completed_numbers=prior_completed,
        in_progress_number=session_number,
        prior_state=existing,
    )

    # Writer-side invariant enforcement (spec D6, fail loud).
    # Validation happens BEFORE any file is written or any event is
    # appended, so a violation leaves both the on-disk snapshot and
    # the events ledger in their previous (consistent) state.
    _validate_sessions_or_raise(
        sessions,
        top_status=SESSION_STATUS_IN_PROGRESS,
        lifecycle_state=SessionLifecycleState.WORK_IN_PROGRESS.value,
    )

    # Validation passed — now append the work_started event (the
    # audit trail) and write the snapshot (the consumer-readable
    # cache). Event-before-snapshot ordering means an event-write
    # failure leaves the snapshot un-flipped; idempotency on the
    # event ledger covers the orchestrator-restart case.
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
        prior_events = read_events(session_set)
        already_emitted = any(
            ev.event_type == "work_started"
            and ev.session_number == session_number
            for ev in prior_events
        )
        if not already_emitted:
            append_event(session_set, "work_started", session_number)

    derived_current, derived_total, derived_completed = _derive_legacy_fields(sessions)

    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(session_set.rstrip("/\\")),
        "sessions": sessions,
        # Dual-write legacy triple per spec D5. Always derived from
        # ``sessions[]`` by :func:`_derive_legacy_fields`; never
        # independently maintained.
        "currentSession": derived_current,
        "totalSessions": derived_total,
        "completedSessions": derived_completed,
        "status": SESSION_STATUS_IN_PROGRESS,
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


def compute_effective_completed_sessions(session_set_dir: str) -> List[int]:
    """Return the authoritative sorted list of closed session numbers.

    Read order, first non-empty result wins:

    1. ``completedSessions[]`` from ``session-state.json`` — the
       Set-022 invariant: this array is the progress ledger and is
       maintained on every session close.
    2. Distinct ``closeout_succeeded`` event session numbers from
       ``session-events.jsonl`` — Full-tier fallback for sets that
       pre-date Set 022. Set 022's writer changes use this branch to
       *backfill* the array on the next boundary write, so this branch
       only fires once per legacy set.
    3. ``currentSession - 1`` heuristic — last-resort legacy
       reconstruction (currentSession reflects "the session in flight
       *or* just closed"; on a pre-events-ledger set with no other
       signal, sessions 1..currentSession-1 are presumed done). Emits
       a WARNING to stderr because the resulting list is conjectural;
       callers should treat the next boundary write as the
       authoritative correction point.

    Returns a sorted list of unique session integers. Empty list when
    the set has produced no signal at all (e.g., the not-started shape
    with ``currentSession: null``).

    Used by :func:`_flip_state_to_closed` to maintain
    ``completedSessions[]`` and by the ``start_session`` CLI to infer
    "what session is next?" without depending on the snapshot's
    ``currentSession`` field being correct (mixed-mode drift could
    have left it stale).
    """
    state = read_session_state(session_set_dir) or {}

    def _valid_session_number(x: object) -> bool:
        return (
            isinstance(x, int)
            and not isinstance(x, bool)
            and x > 0
        )

    completed = state.get("completedSessions")
    if isinstance(completed, list):
        ints = sorted({c for c in completed if _valid_session_number(c)})
        if ints:
            return ints

    # Lazy import to avoid the session_events ↔ session_state cycle
    # (session_events imports SessionLifecycleState from this module).
    try:
        from session_events import read_events  # type: ignore[import-not-found]
    except ImportError:
        from .session_events import read_events  # type: ignore[no-redef]
    events = read_events(session_set_dir)
    closeouts = sorted({
        ev.session_number for ev in events
        if ev.event_type == "closeout_succeeded"
        and _valid_session_number(ev.session_number)
    })
    if closeouts:
        return closeouts

    current = state.get("currentSession")
    if isinstance(current, int) and not isinstance(current, bool) and current > 1:
        _logger.warning(
            "compute_effective_completed_sessions: %s has no "
            "completedSessions[] and no closeout_succeeded events; "
            "falling back to currentSession-1 heuristic "
            "(presuming sessions 1..%d closed). The next boundary "
            "write will backfill completedSessions[] with this list.",
            session_set_dir, current - 1,
        )
        return list(range(1, current))

    return []


def _flip_state_to_closed(
    session_set: str,
    verification_verdict: Optional[str] = None,
    *,
    forced: bool = False,
) -> Optional[str]:
    """Internal: flip ``session-state.json`` to closed without running the gate.

    Used by :func:`mark_session_complete` after the gate passes (or is
    bypassed via ``force=True``), and by ``close_session._run_repair``
    when it needs to catch up a snapshot to an events ledger that
    already records ``closeout_succeeded``. Callers that must enforce
    the gate use the public :func:`mark_session_complete` entry point.

    When ``forced`` is True, write ``forceClosed: True`` to the
    snapshot (Set 9 Session 3, D-2). The flag is the forensic marker
    the VS Code Session Set Explorer reads to surface a ``[FORCED]``
    badge so reviewers can spot emergency-bypass close-outs at a
    glance. Repair-driven flips leave the flag at its default
    (``False``) — the snapshot is being resynced to a ledger event
    that may pre-date the hard-scoping change, so repair never claims
    forensic authority over close-outs it did not perform.

    Returns the file path if it existed and was updated, ``None`` if no
    state file existed.
    """
    path = _state_path(session_set)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    # Migrate v1 → v2 in-memory before rewriting, so the on-disk file
    # comes out as at least v2 on the next write (per the schema
    # migration contract). The v3 promotion (with sessions[] backfill)
    # happens below.
    state = _migrate_v1_to_v2_inplace(state)

    # Set 022 / Set 030 Session 2: maintain completedSessions[] AND
    # sessions[] on every close. The legacy helper
    # ``compute_effective_completed_sessions`` is the canonical signal
    # for "what sessions are already closed"; we then append the
    # currentSession to that set, build the new v3 sessions[] (with
    # the close applied), and let :func:`_derive_legacy_fields`
    # produce the legacy triple from the result. Single source of
    # truth → no parity drift between v3 and legacy.
    current_session = state.get("currentSession")

    effective_completed_before = compute_effective_completed_sessions(session_set)
    if (
        isinstance(current_session, int)
        and not isinstance(current_session, bool)
    ):
        # Idempotency: re-running close on an already-closed session
        # is a no-op for the completed set (it's already a member).
        new_completed = sorted(set(effective_completed_before) | {current_session})
    else:
        new_completed = sorted(set(effective_completed_before))

    # Final-session detection (Set 022): the canonical signal is
    # ``len(new_completed) == totalSessions``. change-log.md presence
    # remains a belt-and-suspenders check — both must indicate "done"
    # before the set flips to complete, so a stray hand-written
    # change-log doesn't promote a mid-set close to a set-done flip,
    # and a missing change-log doesn't let the math alone flip a set
    # the orchestrator hasn't actually wrapped up. ``forced=True``
    # still short-circuits to last-session because incident recovery
    # is explicit operator intent (close-out.md, "--force is
    # hard-scoped to incident recovery").
    #
    # Set 030 Session 2: totalSessions MUST be resolvable. When the
    # on-disk value is missing/zero, we backfill from spec.md +
    # ledger + existing sessions[] data. If even that lands on zero,
    # raise SessionStateInvariantError rather than fall through to
    # an unvalidated legacy-only write — the previous v2 fallback
    # silently produced a snapshot that no v3 reader could parse.
    total_sessions = state.get("totalSessions")
    if not (
        isinstance(total_sessions, int)
        and not isinstance(total_sessions, bool)
        and total_sessions > 0
    ):
        spec_titles = _spec_titles_for_set(session_set)
        max_spec = max(spec_titles.keys()) if spec_titles else 0
        max_closed = max(new_completed) if new_completed else 0
        existing_records = _existing_sessions_records(state)
        max_existing = max(
            (r.number for r in existing_records), default=0
        )
        total_sessions = max(max_spec, max_closed, max_existing)
    if not (isinstance(total_sessions, int) and total_sessions > 0):
        raise SessionStateInvariantError(
            1,
            f"cannot determine totalSessions for {session_set!r}: no "
            "value on disk, no spec.md headings, no closed sessions, "
            "no existing sessions[]. Provide totalSessions via the "
            "spec.md config block or via prior writer state.",
        )

    sessions_done = len(new_completed) == total_sessions
    change_log_present = os.path.isfile(
        os.path.join(session_set, "change-log.md")
    )
    is_last_session = forced or (sessions_done and change_log_present)

    # Build the v3 sessions[] reflecting the post-close state.
    #
    # Two paths diverge on ``forced``:
    #
    # 1. Natural close (forced=False), whether mid-set or last
    #    session: ``completed_for_array = new_completed``. The
    #    invariant validator then enforces rule 7 (top-status
    #    complete ⟹ every session complete). For natural
    #    last-session, ``new_completed`` must already cover every
    #    session — sessions_done is True by definition, which means
    #    len(new_completed) == total_sessions, and the values are
    #    sorted+unique from compute_effective_completed_sessions,
    #    so the array is contiguous 1..total. No silent promotion.
    #    If the math fails (e.g., a hand-edited snapshot with gaps
    #    in completedSessions), the validator surfaces it rather
    #    than masking with a forced-style promotion.
    #
    # 2. Forced incident-recovery close (forced=True): operator
    #    intent per close-out.md Section 5 is "the SET is done."
    #    Promote every session in the ledger to ``complete``. The
    #    ``forceClosed: true`` marker on the snapshot plus the
    #    ``closeout_force_used`` event in ``session-events.jsonl``
    #    preserve the forensic trail of which session triggered
    #    the force.
    if forced:
        completed_for_array = list(range(1, total_sessions + 1))
        top_status_after = SESSION_STATUS_COMPLETE
        lifecycle_after = SessionLifecycleState.CLOSED.value
    elif is_last_session:
        # Natural last-session close: every session must already be
        # in new_completed. Use new_completed as-is so the validator
        # catches any inconsistency rather than papering over it.
        completed_for_array = new_completed
        top_status_after = SESSION_STATUS_COMPLETE
        lifecycle_after = SessionLifecycleState.CLOSED.value
    else:
        completed_for_array = new_completed
        top_status_after = SESSION_STATUS_IN_PROGRESS
        lifecycle_after = SessionLifecycleState.WORK_IN_PROGRESS.value

    sessions = _build_sessions_array(
        session_set,
        total=total_sessions,
        completed_numbers=completed_for_array,
        in_progress_number=None,
        prior_state=state,
    )
    state["sessions"] = sessions

    # Writer-side invariant enforcement (spec D6, fail loud). For
    # natural last-session close this is the asserter: if
    # new_completed had a gap (e.g., [1, 3] for a 3-session set
    # with sessions_done somehow True via hand-edit), rule 7 will
    # raise here BEFORE the snapshot is rewritten.
    _validate_sessions_or_raise(
        sessions,
        top_status=top_status_after,
        lifecycle_state=lifecycle_after,
    )

    # Derive legacy triple from the v3 ledger; this is the only
    # path that materializes those fields.
    derived_current, derived_total, derived_completed = _derive_legacy_fields(
        sessions
    )
    state["currentSession"] = derived_current
    state["totalSessions"] = derived_total
    state["completedSessions"] = derived_completed

    state["schemaVersion"] = SCHEMA_VERSION
    if is_last_session:
        state["status"] = SESSION_STATUS_COMPLETE
        state["lifecycleState"] = SessionLifecycleState.CLOSED.value
        state["completedAt"] = _now_iso()
    if verification_verdict is not None:
        state["verificationVerdict"] = verification_verdict
    if forced:
        state["forceClosed"] = True
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")

    # On the last session, finalize activity-log totalSessions from
    # unique sessionNumbers if it's still missing or zero. Catches the
    # "spec said 4-5 sessions; we ended at 4" case where no earlier
    # register_session_start had a definitive total to propagate.
    if is_last_session:
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
      WARNING, append ``closeout_succeeded`` with ``forced=True`` and
      the failed-check names, append the forensic
      ``closeout_force_used`` event (Set 9 Session 3, D-2), and
      proceed with the flip. The ``forceClosed: true`` marker is
      written to ``session-state.json`` so the VS Code Session Set
      Explorer surfaces a ``[FORCED]`` badge on the affected set.
      ``force=True`` is hard-scoped to incident-recovery use only;
      callers that route through the CLI also need
      ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1``. The function-level
      contract here trusts callers (tests, the repair path) to use
      ``force=True`` deliberately.

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
            "WARNING: mark_session_complete(force=True) bypassed "
            "%d failing gate(s) on %s — %s. --force / force=True is "
            "hard-scoped to incident-recovery only (Set 9 Session 3, "
            "D-2); session-state.json will record forceClosed=true "
            "and a closeout_force_used event will be appended.",
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
        # Forensic marker (Set 9 Session 3, D-2): the dedicated
        # ``closeout_force_used`` event makes emergency-bypass
        # close-outs cleanly greppable from the events ledger without
        # requiring callers to walk every ``closeout_succeeded``
        # payload's ``forced`` field. Emit only when ``force=True``
        # actually mattered (gates would have failed without it) — a
        # ``force=True`` invocation against a passing gate adds no
        # forensic value because the close-out would have succeeded
        # either way. Same idempotency story as ``closeout_succeeded``
        # above: the flip below is what marks the session closed, so
        # if this append raises mid-flight the snapshot stays
        # un-flipped and the ledger and snapshot never disagree.
        if failures and force:
            append_event(
                session_set,
                "closeout_force_used",
                session_number,
                method="snapshot_flip",
                failed_checks=[f.check for f in failures],
            )

    return _flip_state_to_closed(
        session_set,
        verification_verdict,
        forced=bool(failures and force),
    )


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

    No-op for dicts already at schemaVersion >= 2 (the v2 -> v3
    promotion happens at write time in :func:`register_session_start`
    and :func:`_flip_state_to_closed`; readers that need a
    fully-synthesized v3 view go through
    :func:`ai_router.progress.synthesize_v3_from_v2`). v1 files that
    lack a recognized status value get
    ``lifecycleState=work_in_progress`` as a safe default — that
    mirrors what an orchestrator would have written had it been
    authoring a fresh start, and the next legitimate write (start or
    complete) corrects it.

    Set 030 Session 2 left this function unchanged in behavior — it
    still only fills the v1 -> v2 gap. The gate uses the literal ``2``
    rather than :data:`SCHEMA_VERSION` (now 3) so a v2 file on disk
    passes through this function unchanged; the v3 promotion is the
    writer's job, not the reader's, and a "partial" in-memory v3 with
    ``schemaVersion: 3`` but no ``sessions[]`` would be confusing.
    """
    schema_version = state.get("schemaVersion")
    if isinstance(schema_version, int) and schema_version >= 2:
        return state
    if "lifecycleState" not in state:
        legacy_status = state.get("status")
        derived = _V1_STATUS_TO_LIFECYCLE.get(
            legacy_status, SessionLifecycleState.WORK_IN_PROGRESS
        )
        state["lifecycleState"] = derived.value
    state["schemaVersion"] = 2
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
    ``totalSessions`` field is best-effort populated from the spec.

    Set 030 Session 2: when ``totalSessions`` is known from the spec,
    the payload also carries a v3 ``sessions[]`` array — every entry
    ``not-started``, titles from ``spec.md`` headings when present, the
    ``Session N`` fallback otherwise. When ``totalSessions`` is
    unknown (no spec config block, or a spec without a numeric
    ``totalSessions`` field), ``sessions[]`` is left absent — a
    not-started shape without a known plan is one of the few cases v3
    invariant rule 1 explicitly allows (the rule guards "any set with
    a known plan"). The next legitimate write (register_session_start)
    will materialize ``sessions[]`` when the total is known.
    """
    total = _read_total_sessions_from_spec(session_set_dir)
    payload: dict = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(session_set_dir.rstrip("/\\")),
        "currentSession": None,
        "totalSessions": total,
        "status": NOT_STARTED_STATUS,
        "lifecycleState": None,
        "startedAt": None,
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": None,
    }
    if isinstance(total, int) and total > 0:
        sessions = _build_sessions_array(
            session_set_dir,
            total=total,
            completed_numbers=(),
            in_progress_number=None,
            prior_state=None,
        )
        # The not-started shape always passes invariants by
        # construction (every session not-started, top-status
        # not-started, no lifecycle), but run the validator anyway so
        # a malformed spec.md is caught here rather than at the first
        # read.
        _validate_sessions_or_raise(
            sessions,
            top_status=SESSION_STATUS_NOT_STARTED,
            lifecycle_state=None,
        )
        payload["sessions"] = sessions
        # Derived legacy fields. completedSessions is always an empty
        # list for the not-started shape; currentSession stays None
        # (no in-flight session) per Decision D5's dual-write rule.
        payload["completedSessions"] = []
    return payload


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

    Set 030 Session 2: the not-started base already includes the v3
    ``sessions[]`` array when ``totalSessions`` is known (see
    :func:`_not_started_payload`). For backfilled-complete and
    backfilled-in-progress shapes we promote individual sessions in
    that array to match the inferred state — see the per-branch
    logic below. The activity-log branch cannot reliably tell *which*
    session is in flight (the file is a step-level log, not a session
    ledger), so it conservatively promotes session 1 to in-progress;
    the next legitimate writer call corrects the array with full
    information.
    """
    base = _not_started_payload(session_set_dir)

    if os.path.isfile(os.path.join(session_set_dir, "change-log.md")):
        # Round-A fix (Set 030 Session 3): only escalate to
        # status=complete when sessions[] is populated. Without it,
        # the snapshot would violate rule 1 (sessions[] required for
        # any set with a known plan) AND rule 7 (top-status complete
        # requires every session complete) — readProgress would
        # reject the file we just wrote. When sessions[] is absent
        # (totalSessions unknown from spec.md), preserve operator
        # intent via the file presence itself and leave the snapshot
        # at the not-started shape; the next boundary write with a
        # plan will re-promote.
        if not isinstance(base.get("sessions"), list):
            return base
        base["status"] = COMPLETE_STATUS
        base["lifecycleState"] = SessionLifecycleState.CLOSED.value
        base["completedAt"] = _change_log_mtime_iso(session_set_dir)
        # Promote every session in the ledger to complete (rule 7).
        for entry in base["sessions"]:
            entry["status"] = SESSION_STATUS_COMPLETE
        _validate_sessions_or_raise(
            base["sessions"],
            top_status=SESSION_STATUS_COMPLETE,
            lifecycle_state=SessionLifecycleState.CLOSED.value,
        )
        _, _, derived_completed = _derive_legacy_fields(base["sessions"])
        base["completedSessions"] = derived_completed
        return base

    if os.path.isfile(os.path.join(session_set_dir, "activity-log.json")):
        # Round-A fix (Set 030 Session 3): same as the change-log
        # branch above — only escalate to in-progress when sessions[]
        # is populated. Without it, rule 1 and rule 6 would reject
        # the snapshot on read.
        if not isinstance(base.get("sessions"), list) or not base["sessions"]:
            return base
        base["status"] = IN_PROGRESS_STATUS
        base["lifecycleState"] = SessionLifecycleState.WORK_IN_PROGRESS.value
        base["startedAt"] = _earliest_activity_log_timestamp(session_set_dir)
        # Conservatively promote session 1 to in-progress (rule 6
        # allows exactly one in-progress session; session 1 is the
        # safest assumption for a legacy folder).
        base["sessions"][0]["status"] = SESSION_STATUS_IN_PROGRESS
        _validate_sessions_or_raise(
            base["sessions"],
            top_status=SESSION_STATUS_IN_PROGRESS,
            lifecycle_state=SessionLifecycleState.WORK_IN_PROGRESS.value,
        )
        derived_current, _, derived_completed = _derive_legacy_fields(
            base["sessions"]
        )
        base["currentSession"] = derived_current
        base["completedSessions"] = derived_completed
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
# Session Set Configuration parser
# ---------------------------------------------------------------------------
#
# Set 026 Session 1 removed the queue-mediated daemon infrastructure.
# The mode-config dataclass, the OUTSOURCE_MODES / ROLE_VALUES /
# DEFAULT_OUTSOURCE_MODE constants, parse_mode_config, read_mode_config,
# and validate_mode_config are gone. The block-extractor below survives
# because :func:`_read_total_sessions_from_spec` uses it to pull
# ``totalSessions`` from the same YAML block; it is the only field
# still consumed at the Python layer.


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


# parse_mode_config / read_mode_config / validate_mode_config were
# removed by Set 026 Session 1. The remaining consumer of the block
# extractor above is ``_read_total_sessions_from_spec``, which reads
# only the numeric ``totalSessions`` field.
