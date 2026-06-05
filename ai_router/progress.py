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
# Set 047 Session 2: v4 schema constant. v4 derives top-level state
# (currentSession, totalSessions, completedSessions, orchestrator,
# startedAt, completedAt, verificationVerdict, lifecycleState) from a
# per-session sessions[] ledger where each entry gains its own
# startedAt / completedAt / orchestrator / verificationVerdict fields.
# The Session-2 reader-first shim (:func:`normalize_to_v4_shape`)
# accepts v1/v2/v3/v4 input and returns a normalized v4 read-view dict
# with BOTH per-session metadata AND derived top-level fields so
# existing readers (which still consume top-level fields) work
# transparently against v4 writes from Sessions 4-5.
SCHEMA_VERSION_V4 = 4

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

# Set 057: per-session ``type`` field. Default ``work``; absent/``work``
# for every existing and Full-tier entry. ``verification`` and
# ``remediation`` entries are appended at runtime by the blessed writer
# (``register_typed_session_start``) for the Lightweight dedicated-
# verification flow — they are NOT authored in spec.md. The field is
# additive and backward-compatible: a missing ``type`` is interpreted as
# ``work`` everywhere. Only non-``work`` types are persisted on disk so
# historical and Full-tier ledgers are untouched.
SESSION_TYPE_WORK = "work"
SESSION_TYPE_VERIFICATION = "verification"
SESSION_TYPE_REMEDIATION = "remediation"
SESSION_TYPES = (
    SESSION_TYPE_WORK,
    SESSION_TYPE_VERIFICATION,
    SESSION_TYPE_REMEDIATION,
)

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
# v3/v4 -> v4 read-time normalization (Set 047 Session 2)
# ---------------------------------------------------------------------------


# v4 per-session metadata keys promoted/derived by the normalize shim.
# Centralized so the Python and TypeScript implementations stay in
# lockstep on which fields move from top-level to per-session in v4.
_V4_PER_SESSION_KEYS = (
    "startedAt",
    "completedAt",
    "orchestrator",
    "verificationVerdict",
)


def normalize_to_v4_shape(state: dict, spec_md_path: Path) -> dict:
    """Return *state* in canonical v4 read-view shape.

    Accepts v1/v2/v3/v4 input. Returns a NEW dict; does NOT mutate the
    input. The returned dict carries:

    - ``schemaVersion: 4``
    - ``sessionSetName`` (preserved)
    - ``sessions[]`` with v4 per-session metadata (each entry gains
      ``startedAt`` / ``completedAt`` / ``orchestrator`` /
      ``verificationVerdict`` defaulted to ``None`` when absent)
    - ``status`` (canonicalized)
    - **Derived legacy top-level fields** (``currentSession``,
      ``totalSessions``, ``completedSessions``, ``orchestrator``,
      ``startedAt``, ``completedAt``, ``verificationVerdict``,
      ``lifecycleState``) so existing readers that still consume the
      top-level fields work transparently against v4 writes.

    The TWO directions of derivation:

    - **v3 input → v4**: top-level ``orchestrator`` / ``startedAt`` /
      ``completedAt`` / ``verificationVerdict`` are promoted to the
      in-progress session (or, if none, the most-recently-completed
      session) so per-session metadata is populated. The top-level
      fields are then re-derived from the per-session ones (no-op on
      pure v3 input; gives the same observable shape).
    - **v4 input → v4**: per-session metadata is preserved; top-level
      fields are derived FROM the per-session metadata (in-progress
      session's orchestrator/startedAt wins; most-recently-completed
      session's completedAt/verificationVerdict wins). This is what
      lets a v3-era reader consume a v4 file unchanged.

    This is the canonical reader path for Sessions 4-5 (writer flip)
    forward: every reader (gate_checks, the Explorer's readSessionSets,
    cancellation reader, reconciler) goes through this shim so the
    write side and the read side can evolve independently.

    Per the Session-1 audit verdict (Group A1): the shim is the
    reader-first phase; the migrator (Session 3) and the writer flip
    (Sessions 4-5) both depend on this contract.
    """
    if state is None:
        raise TypeError("normalize_to_v4_shape: state is None")

    # Set 047 Session 4: track whether the on-disk state had a
    # sessions[] array at all. The plan-less carve-out
    # (totalSessions unknown, no plan committed yet) writes a state
    # file with no sessions[] key. The derived totalSessions for
    # such a file is ``None`` (not ``0``) so the Explorer's
    # ``fractionFor()`` renders ``0/?`` instead of ``0/0`` — the
    # Set 046 Session 2 fix carries through to v4.
    sessions_present_in_input = state.get("sessions") is not None

    # Step 1: ensure sessions[] is present (synthesize from v2 if missing).
    # synthesize_v3_from_v2 returns a NEW dict; for v3/v4 inputs we make
    # our own shallow copy so we can mutate without touching the caller's
    # dict.
    if not sessions_present_in_input:
        v3_state = synthesize_v3_from_v2(state, spec_md_path)
    else:
        v3_state = dict(state)

    raw_sessions = v3_state.get("sessions") or []
    if not isinstance(raw_sessions, list):
        raise SessionStateInvariantError(
            1,
            f"sessions[] must be a list, got {type(raw_sessions).__name__}",
        )

    # Step 2: build v4 per-session records. Each entry gets the v4
    # metadata fields defaulted to None when absent so downstream code
    # can rely on key presence. We copy each entry rather than
    # mutating in-place.
    sessions_v4: List[dict] = []
    for entry in raw_sessions:
        if not isinstance(entry, dict):
            # Defer to validator's SessionStateInvariantError; this
            # branch shouldn't normally fire because get_progress would
            # have rejected earlier. Be permissive here so callers can
            # validate at their own layer.
            sessions_v4.append({"number": None, "title": None, "status": None})
            continue
        sv4 = dict(entry)
        # Canonicalize per-session status BEFORE downstream derivation
        # reads it. Aliased values (``"completed"`` / ``"done"``) must
        # collapse to ``"complete"`` here so the promotion and the
        # legacy-top-level derivation below match those entries
        # against ``SESSION_STATUS_COMPLETE``. Without this, a v3/v4
        # file authored with the alias form would bypass the
        # derivation entirely (a hand-edited "completed" session would
        # not appear in derived ``completedSessions[]``).
        sv4["status"] = canonicalize_status(sv4.get("status"))
        for k in _V4_PER_SESSION_KEYS:
            sv4.setdefault(k, None)
        sessions_v4.append(sv4)

    schema_version_in = state.get("schemaVersion")
    is_v4_input = (
        isinstance(schema_version_in, int) and schema_version_in >= SCHEMA_VERSION_V4
    )

    # Step 3: on non-v4 input, promote top-level fields to per-session
    # records that don't already carry the metadata. v4 inputs skip
    # promotion because their per-session fields are authoritative.
    if not is_v4_input:
        top_orchestrator = state.get("orchestrator")
        top_started = state.get("startedAt")
        top_completed = state.get("completedAt")
        top_verdict = state.get("verificationVerdict")

        in_progress = [
            s for s in sessions_v4 if s.get("status") == SESSION_STATUS_IN_PROGRESS
        ]
        completed = [
            s for s in sessions_v4 if s.get("status") == SESSION_STATUS_COMPLETE
        ]

        if in_progress:
            tgt = in_progress[0]
            if tgt.get("orchestrator") is None and top_orchestrator is not None:
                tgt["orchestrator"] = top_orchestrator
            if tgt.get("startedAt") is None and top_started is not None:
                tgt["startedAt"] = top_started

        if completed:
            last_completed = completed[-1]
            if last_completed.get("completedAt") is None and top_completed is not None:
                last_completed["completedAt"] = top_completed
            if (
                last_completed.get("verificationVerdict") is None
                and top_verdict is not None
            ):
                last_completed["verificationVerdict"] = top_verdict
            # When no in-progress session, the orchestrator block on a
            # v3 close-out snapshot belongs with the most recent
            # completed session (the orchestrator that closed it).
            # Same goes for ``startedAt`` — without this branch, a
            # between-sessions or all-complete snapshot would lose the
            # top-level ``startedAt`` entirely (no in-progress session
            # to receive it, and the v4 derivation step has nowhere to
            # re-discover it).
            if not in_progress:
                if last_completed.get("orchestrator") is None and top_orchestrator is not None:
                    last_completed["orchestrator"] = top_orchestrator
                if last_completed.get("startedAt") is None and top_started is not None:
                    last_completed["startedAt"] = top_started

    # Step 4: derive legacy top-level fields from the per-session
    # ledger. This is the v4 reader contract — top-level fields are
    # DERIVED, never independently maintained.
    completed_numbers = [
        s["number"]
        for s in sessions_v4
        if s.get("status") == SESSION_STATUS_COMPLETE and isinstance(s.get("number"), int)
    ]
    in_progress_list = [
        s for s in sessions_v4 if s.get("status") == SESSION_STATUS_IN_PROGRESS
    ]
    current_session = (
        in_progress_list[0]["number"]
        if in_progress_list and isinstance(in_progress_list[0].get("number"), int)
        else None
    )

    derived_orchestrator = None
    derived_started = None
    derived_completed = None
    derived_verdict = None

    if in_progress_list:
        derived_orchestrator = in_progress_list[0].get("orchestrator")
        derived_started = in_progress_list[0].get("startedAt")

    completed_v4 = [
        s for s in sessions_v4 if s.get("status") == SESSION_STATUS_COMPLETE
    ]
    if completed_v4:
        last_completed = completed_v4[-1]
        derived_verdict = last_completed.get("verificationVerdict")
        # Set 047 Session 4: do NOT fall back to last_completed's
        # orchestrator for the derived top-level field. Under v3 the
        # H1/H3 check-in semantic was "close clears the top-level
        # orchestrator block" — the absence of a block signaled "no
        # current holder". Under v4 the per-session orchestrator on
        # closed sessions is a historical record; the shim preserves
        # the same operator-visible behavior by deriving top-level
        # orchestrator only from the IN-PROGRESS session. Between
        # sessions (no in-progress), derived_orchestrator stays
        # ``None`` — matching the v3 close-out clear. Consumers that
        # want the historical "who closed session N" read it from
        # sessions[N-1].orchestrator directly.
        if derived_started is None:
            # Prefer the most-recently-completed session's startedAt
            # over the earliest session's. Earlier draft scanned
            # `sessions_v4` from the start, which on a v4 between-
            # sessions snapshot would return session 1's startedAt
            # (typically the set's open time, not the active session
            # boundary). Scanning completed sessions in reverse gives
            # the most current boundary timestamp.
            for s in reversed(completed_v4):
                if s.get("startedAt"):
                    derived_started = s["startedAt"]
                    break

    canonical_top_status = canonicalize_status(state.get("status"))

    # Set 047 Session 4: under v3 the top-level ``completedAt`` was
    # the SET completion timestamp (only written on the last-session
    # close; left None on mid-set closes). The shim preserves the
    # same semantic: derive top-level completedAt from the
    # last-completed session's completedAt ONLY when the SET status
    # is ``complete``. Mid-set closes (status=in-progress with one
    # session done) keep top-level completedAt=None even though the
    # last_completed session has a per-session completedAt timestamp.
    if canonical_top_status == SESSION_STATUS_COMPLETE and completed_v4:
        derived_completed = completed_v4[-1].get("completedAt")

    # Set 047 Session 4: v4 plan-less carve-out fallback. The writer
    # for a plan-less in-progress set (no totalSessions, no sessions[]
    # — typical of stub sets created before the operator commits a
    # plan) keeps the orchestrator + startedAt at the top level
    # because there is no per-session record to attach them to. The
    # shim's normal v4 derivation produces ``None`` here (no in-
    # progress session in sessions_v4 → no derived orchestrator); use
    # the top-level values as the final fallback so callers consuming
    # the derived view still see an attribution for in-flight plan-
    # less work. This branch is a no-op for canonical v4 input where
    # sessions[] is the source of truth — the per-session orchestrator
    # is already set.
    if (
        derived_orchestrator is None
        and not sessions_v4
        and canonical_top_status == SESSION_STATUS_IN_PROGRESS
    ):
        top_orch = state.get("orchestrator")
        if isinstance(top_orch, dict):
            derived_orchestrator = top_orch
    if (
        derived_started is None
        and not sessions_v4
        and canonical_top_status == SESSION_STATUS_IN_PROGRESS
    ):
        top_started = state.get("startedAt")
        if isinstance(top_started, str) and top_started:
            derived_started = top_started

    # Set 047 Session 4: derive lifecycleState from the canonical
    # status when the top-level field is absent (v4 input drops the
    # field; the spec moves lifecycle sub-states to the events
    # ledger). The two-value mapping below covers the only sub-states
    # the writer ever produced via this field (work_in_progress at
    # register; closed at last-session close); cancellation and not-
    # started both surface as ``None`` for lifecycle. Tests that want
    # the finer sub-states (closeout_pending / closeout_blocked /
    # work_verified) read the events ledger directly.
    derived_lifecycle = state.get("lifecycleState")
    if derived_lifecycle is None:
        if canonical_top_status == SESSION_STATUS_IN_PROGRESS:
            derived_lifecycle = LIFECYCLE_STATE_WORK_IN_PROGRESS
        elif canonical_top_status == SESSION_STATUS_COMPLETE:
            derived_lifecycle = LIFECYCLE_STATE_CLOSED

    # Set 047 Session 4 plan-less carve-out: when the on-disk input
    # had no sessions[] AND the synthesizer couldn't derive one,
    # surface totalSessions as ``None`` rather than ``0`` so callers
    # consuming the derived view see "plan unknown" (the operator-
    # facing ``0/?`` signal Set 046 Session 2 introduced).
    derived_total_sessions = len(sessions_v4)
    if not sessions_present_in_input and not sessions_v4:
        derived_total_sessions = None

    out: dict = {
        "schemaVersion": SCHEMA_VERSION_V4,
        "sessionSetName": state.get("sessionSetName"),
        "sessions": sessions_v4,
        "status": canonical_top_status,
        "currentSession": current_session,
        "totalSessions": derived_total_sessions,
        "completedSessions": completed_numbers,
        "orchestrator": derived_orchestrator,
        "startedAt": derived_started,
        "completedAt": derived_completed,
        "verificationVerdict": derived_verdict,
        "lifecycleState": derived_lifecycle,
    }
    # Preserve passthrough fields that callers (cancellation reader,
    # forceClosed display, Set 035 preCancelStatus) still consume from
    # the top level. These are NOT derived from sessions[]; they ride
    # along as opaque values until a future schema folds them in too.
    for passthrough_key in ("preCancelStatus", "forceClosed"):
        if passthrough_key in state:
            out[passthrough_key] = state[passthrough_key]
    return out


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

    Set 047 Session 2: routed through :func:`normalize_to_v4_shape` so
    a v4-shaped file (sessions[] entries carrying per-session
    startedAt / completedAt / orchestrator / verificationVerdict)
    reads identically to a v3 file. The normalize shim is invoked
    even for v3 inputs so the v4 per-session enrichment is available
    to any consumer that fetches the normalized dict directly.
    """
    if state is None:
        raise TypeError("read_progress: state is None")
    normalized = normalize_to_v4_shape(state, spec_md_path)
    return get_progress(normalized)


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
    "SCHEMA_VERSION_V4",
    "SESSION_STATUS_NOT_STARTED",
    "SESSION_STATUS_IN_PROGRESS",
    "SESSION_STATUS_COMPLETE",
    "SESSION_STATUS_CANCELLED",
    "SESSION_STATUSES",
    "TOP_LEVEL_STATUSES",
    "LIFECYCLE_STATE_WORK_IN_PROGRESS",
    "LIFECYCLE_STATE_CLOSED",
    "SESSION_TYPE_WORK",
    "SESSION_TYPE_VERIFICATION",
    "SESSION_TYPE_REMEDIATION",
    "SESSION_TYPES",
    "SessionStateInvariantError",
    "SessionRecord",
    "ProgressView",
    "canonicalize_status",
    "extract_session_titles_from_spec",
    "synthesize_v3_from_v2",
    "normalize_to_v4_shape",
    "read_progress",
    "get_progress",
    "validate_invariants",
]
