"""The canonical session reader and the Work Explorer projection.

One reader for every consumer: gates, the CLI, and the VS Code extension
(which shells to ``python -m ai_router.progress --json`` and renders the
JSON — it re-implements nothing). The live path reads v5 only;
:func:`normalize_legacy_state` exists for the migration, which is the last
reader a v4 file ever gets.

Three vocabularies, deliberately distinct:
- session lifecycle: ``not-started`` / ``in-progress`` / ``complete`` /
  ``cancelled``;
- task state, folded from the execution record: ``pending`` /
  ``in flight`` / ``done``, and no fourth -- a step was opened, or
  closed, or neither;
- the icon key the extension maps to its four SVG assets: ``complete`` /
  ``in-progress`` / ``not-started`` / ``cancelled``.
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .evidence import (
    ACTIVITY_LOG_FILENAME,
    SESSION_PLAN_FILENAME,
    STATE_FILENAME,
    repo_root_from_sessions_dir,
)

SCHEMA_VERSION_V4 = 4
SCHEMA_VERSION = 5

STATUS_NOT_STARTED = "not-started"
STATUS_IN_PROGRESS = "in-progress"
STATUS_COMPLETE = "complete"
STATUS_CANCELLED = "cancelled"

SESSION_STATUSES = (STATUS_NOT_STARTED, STATUS_IN_PROGRESS,
                    STATUS_COMPLETE, STATUS_CANCELLED)
# A session that is cancelled or complete is closed; the rest are open.
CLOSED_STATUSES = (STATUS_COMPLETE, STATUS_CANCELLED)

# The complete alias map. None stays None; unknown values pass through for
# the validators to reject — canonicalization never invents a status.
_STATUS_ALIASES = {"completed": STATUS_COMPLETE, "done": STATUS_COMPLETE}


def canonicalize_status(value):
    if value is None:
        return None
    return _STATUS_ALIASES.get(value, value)


class SessionStateInvariantError(ValueError):
    def __init__(self, rule: int, message: str):
        super().__init__(f"[v4 invariant rule {rule}] {message}")
        self.rule = rule


# --- How a session number is WRITTEN ----------------------------------------

SESSION_NUMBER_WIDTH = 3


def session_display_number(number) -> str:
    """``15`` -> ``"015"``: the three-digit, zero-padded shape staff read
    session numbers in.

    The ONE owner of that padding. The CLI's human output calls it, and
    the projection carries its result to the extension, so a tree row, a
    status line and a terminal message cannot disagree about how a
    session is named. Presentation only: the plan's ``### Session N:``
    headings, ``sessions.json``'s ``number``, the ``.dabbler/runs/s<N>/``
    ledger and every ``--session`` argument keep the plain integer, and
    nothing parses a padded string back into one.

    A number wider than the pad is not truncated to fit it, and a value
    that is not a positive integer is rendered as-is rather than
    invented into one.
    """
    if type(number) is not int or number <= 0:
        return str(number)
    return str(number).zfill(SESSION_NUMBER_WIDTH)


# --- Spec titles and title heal ---------------------------------------------

_SESSION_HEADING_RE = re.compile(
    r"^###\s+Session\s+(?P<number>\d+)(?:\s+of\s+\d+)?\s*:\s*(?P<title>.+?)\s*$",
    re.MULTILINE,
)
_GENERIC_TITLE_RE = re.compile(r"^Session\s+(?P<number>\d+)$")


def extract_session_titles_from_plan(plan_path) -> list:
    """``[(number, title), ...]`` sorted; empty on a missing or unreadable
    spec — titles are a nicety, never a gate."""
    try:
        text = Path(plan_path).read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return []
    pairs = [
        (int(m.group("number")), m.group("title").strip())
        for m in _SESSION_HEADING_RE.finditer(text)
    ]
    return sorted(pairs)


def is_generic_title(title, number: int) -> bool:
    """A title that carries no information: missing, blank, or exactly
    ``Session <its own number>``. ``Session 5`` stored on session 3 is
    drift or operator words — never healed."""
    if not isinstance(title, str) or not title.strip():
        return True
    m = _GENERIC_TITLE_RE.match(title.strip())
    return bool(m) and int(m.group("number")) == number


# The metadata that makes a session record a statement about something
# that happened, rather than a placeholder for something that has not.
_HISTORY_KEYS = ("startedAt", "completedAt", "verificationVerdict",
                 "orchestrator", "verification")


def session_has_history(entry) -> bool:
    """Whether the record says anything about this session having run.

    A session is historyless when it is still ``not-started`` and carries
    no start, no close, no verdict and no orchestrator. Anything else —
    in flight, complete, cancelled, or merely stamped — is history.
    """
    if not isinstance(entry, dict):
        return False
    if canonicalize_status(entry.get("status")) not in (None, STATUS_NOT_STARTED):
        return True
    return any(entry.get(key) for key in _HISTORY_KEYS)


def heal_title(
    stored_title, number: int, spec_titles: Optional[dict] = None,
    *, has_history: bool = True,
):
    """The title a session record should carry.

    Two cases where the plan wins over what is stored. A **generic**
    title (blank, or ``Session <n>``) carries no information, so any plan
    title beats it. A **historyless** session — not started, never
    stamped — has no claim of its own to protect: re-cutting a plan moves
    sessions between numbers, and the title left behind at a number
    describes whatever used to sit there. Once a session has run, its
    stored title is what actually happened and the plan does not get to
    rewrite it.
    """
    if not is_generic_title(stored_title, number) and has_history:
        return stored_title
    spec_title = (spec_titles or {}).get(number)
    if spec_title:
        return spec_title
    if isinstance(stored_title, str) and stored_title.strip():
        return stored_title
    return None


def needs_title_heal(sessions) -> bool:
    for entry in sessions:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if type(number) is not int or number <= 0:
            continue
        if is_generic_title(entry.get("title"), number):
            return True
        if not session_has_history(entry):
            return True
    return False


def heal_stale_titles(sessions, spec_titles: dict) -> int:
    healed = 0
    for entry in sessions:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if type(number) is not int or number <= 0:
            continue
        replacement = heal_title(
            entry.get("title"), number, spec_titles,
            has_history=session_has_history(entry),
        )
        if replacement is not None and replacement != entry.get("title"):
            entry["title"] = replacement
            healed += 1
    return healed


# --- v2/v3 -> v4 normalization ----------------------------------------------

def _strict_positive_int(value) -> bool:
    return type(value) is int and value > 0


def synthesize_v3_from_v2(state: dict, spec_md_path) -> dict:
    """Build ``sessions[]`` for a v2-shaped file (bare counters, no ledger).
    ``currentSession`` is deliberately excluded from the count derivation —
    including it once inflated a plan-less set to 0/1."""
    completed = [
        n for n in (state.get("completedSessions") or [])
        if _strict_positive_int(n)
    ]
    current = state.get("currentSession")
    current = current if _strict_positive_int(current) else None
    total = state.get("totalSessions")
    total = total if _strict_positive_int(total) else 0

    spec_titles = dict(extract_session_titles_from_plan(spec_md_path))
    count = max([total] + [n for n in spec_titles] + completed, default=0)

    top_status = canonicalize_status(state.get("status"))
    sessions = []
    for n in range(1, count + 1):
        if n in completed:
            status = STATUS_COMPLETE
        elif current == n and top_status == STATUS_IN_PROGRESS:
            status = STATUS_IN_PROGRESS
        else:
            status = STATUS_NOT_STARTED
        sessions.append({
            "number": n,
            "title": spec_titles.get(n) or f"Session {n}",
            "status": status,
        })

    out = dict(state)
    out["sessions"] = sessions
    out["schemaVersion"] = 3
    if top_status != state.get("status"):
        out["status"] = top_status
    return out


_PER_SESSION_METADATA = ("startedAt", "completedAt", "orchestrator",
                         "verificationVerdict")


def normalize_legacy_state(
    state: dict, spec_md_path, spec_titles: Optional[dict] = None
) -> dict:
    """The migration's reader: any pre-v5 shape in, the v4 read view out.

    Nothing on the live path calls this. It exists so a repository still
    holding set-scoped state can be carried forward exactly once, which is
    the only moment a v4 file is read."""
    sessions_present = state.get("sessions") is not None
    if not sessions_present:
        state = synthesize_v3_from_v2(state, spec_md_path)

    schema_version_in = state.get("schemaVersion")
    is_v4_input = (
        isinstance(schema_version_in, int)
        and schema_version_in >= SCHEMA_VERSION_V4
    )

    sessions_v4 = []
    for entry in state.get("sessions") or []:
        if not isinstance(entry, dict):
            sessions_v4.append({"number": None, "title": None, "status": None})
            continue
        sv4 = dict(entry)
        sv4["status"] = canonicalize_status(sv4.get("status"))
        for key in _PER_SESSION_METADATA:
            sv4.setdefault(key, None)
        sessions_v4.append(sv4)

    if needs_title_heal(sessions_v4):
        titles = (
            spec_titles if spec_titles is not None
            else dict(extract_session_titles_from_plan(spec_md_path))
        )
        if titles:
            heal_stale_titles(sessions_v4, titles)

    top_status = canonicalize_status(state.get("status"))

    if not is_v4_input:
        # Promote v3's single-valued top-level lifecycle metadata onto the
        # sessions it belongs to.
        in_progress = next(
            (s for s in sessions_v4 if s.get("status") == STATUS_IN_PROGRESS),
            None,
        )
        completed = [
            s for s in sessions_v4 if s.get("status") == STATUS_COMPLETE
        ]
        last_completed = completed[-1] if completed else None
        if in_progress is not None:
            for src, dst in (("orchestrator", "orchestrator"),
                             ("startedAt", "startedAt")):
                if in_progress.get(dst) is None and state.get(src) is not None:
                    in_progress[dst] = state[src]
        if last_completed is not None:
            for src in ("completedAt", "verificationVerdict"):
                if last_completed.get(src) is None and state.get(src) is not None:
                    last_completed[src] = state[src]
            if in_progress is None:
                # A between-sessions v3 snapshot must not lose these.
                for src in ("orchestrator", "startedAt"):
                    if last_completed.get(src) is None and state.get(src) is not None:
                        last_completed[src] = state[src]

    current_session = next(
        (s["number"] for s in sessions_v4
         if s.get("status") == STATUS_IN_PROGRESS),
        None,
    )
    completed_numbers = [
        s["number"] for s in sessions_v4
        if s.get("status") == STATUS_COMPLETE and isinstance(s.get("number"), int)
    ]
    total = len(sessions_v4)
    if not sessions_present and total == 0:
        total = None

    def _from_in_progress(key):
        for s in sessions_v4:
            if s.get("status") == STATUS_IN_PROGRESS:
                return s.get(key)
        return None

    started_at = _from_in_progress("startedAt")
    if started_at is None:
        for s in reversed(sessions_v4):
            if s.get("status") == STATUS_COMPLETE and s.get("startedAt"):
                started_at = s["startedAt"]
                break
    orchestrator = _from_in_progress("orchestrator")
    last_completed_entry = next(
        (s for s in reversed(sessions_v4)
         if s.get("status") == STATUS_COMPLETE),
        None,
    )
    completed_at = (
        last_completed_entry.get("completedAt")
        if last_completed_entry is not None and top_status == STATUS_COMPLETE
        else None
    )
    verdict = (
        last_completed_entry.get("verificationVerdict")
        if last_completed_entry is not None else None
    )

    if not sessions_v4 and top_status == STATUS_IN_PROGRESS:
        # Plan-less carve-out: top-level passthroughs stand in.
        orchestrator = orchestrator or state.get("orchestrator")
        started_at = started_at or state.get("startedAt")

    lifecycle = state.get("lifecycleState")
    if lifecycle is None:
        lifecycle = {
            STATUS_IN_PROGRESS: "work_in_progress",
            STATUS_COMPLETE: "closed",
        }.get(top_status)

    out = {
        "schemaVersion": SCHEMA_VERSION_V4,
        "sessionSetName": state.get("sessionSetName"),
        "status": top_status,
        "sessions": sessions_v4,
        "currentSession": current_session,
        "totalSessions": total,
        "completedSessions": completed_numbers,
        "orchestrator": orchestrator,
        "startedAt": started_at,
        "completedAt": completed_at,
        "verificationVerdict": verdict,
        "lifecycleState": lifecycle,
    }
    for passthrough in ("preCancelStatus", "forceClosed", "nextOrchestrator"):
        if passthrough in state:
            out[passthrough] = state[passthrough]
    return out


# --- Reading state files ----------------------------------------------------

def read_raw_legacy_state(set_dir) -> Optional[dict]:
    """The migration's reader for a set-scoped ``session-state.json``.
    Nothing else reads this file: after the migration it does not exist."""
    path = Path(set_dir) / "session-state.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


#: Source of the sessions in a projection. ``ledger`` is the machine-written
#: record; ``plan`` is a repository that has been set up and never run, whose
#: sessions are the ones its plan declares.
SOURCE_LEDGER = "ledger"
SOURCE_PLAN = "plan"


def ledger_exists(sessions_dir) -> bool:
    """Whether the machine has written this repository's record.

    The distinction the projection turns on: a MISSING ledger is a
    repository nothing has run in yet, and an unreadable one is a fault.
    Reading the plan in the first case is rendering a declaration; doing
    it in the second would replace a broken record with a cheerful guess.
    """
    return (Path(sessions_dir) / STATE_FILENAME).is_file()


def sessions_from_plan(sessions_dir) -> list:
    """The sessions a set-up-but-never-run repository declares, as ledger
    entries would look before anything ran.

    Bootstrap scaffolds two of them -- author the project plan, then break
    it into numbered sessions -- and until the first ``session start``
    they exist only in the plan. Rendering them is what makes project
    setup visible to a repository that is not this one; nothing here
    writes, so the ledger still begins at registration.
    """
    return [
        {"number": number, "title": title, "status": STATUS_NOT_STARTED}
        for number, title in extract_session_titles_from_plan(
            Path(sessions_dir) / SESSION_PLAN_FILENAME
        )
    ]


def read_raw_session_state(sessions_dir) -> Optional[dict]:
    """The raw on-disk dict, or ``None`` when no usable state exists.
    ``PermissionError`` propagates — a locked file is not an absent one,
    and treating it as absent invites writers to clobber real state."""
    path = Path(sessions_dir) / STATE_FILENAME
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


def read_session_state(sessions_dir) -> Optional[dict]:
    """The v5 record with the derived fields every caller asks for. The
    derived keys are computed, never stored: a stored ``currentSession``
    is a second place for the answer to be wrong."""
    raw = read_raw_session_state(sessions_dir)
    if raw is None:
        return None
    return derived_view(raw)


def derived_view(state: dict) -> dict:
    """The record plus the answers that follow from it."""
    sessions = [s for s in state.get("sessions") or [] if isinstance(s, dict)]
    for entry in sessions:
        entry["status"] = canonicalize_status(entry.get("status"))
        for key in _PER_SESSION_METADATA:
            entry.setdefault(key, None)
    current = next(
        (s.get("number") for s in sessions
         if s.get("status") == STATUS_IN_PROGRESS), None
    )
    completed = [
        s["number"] for s in sessions
        if s.get("status") == STATUS_COMPLETE and isinstance(s.get("number"), int)
    ]
    last_completed = next(
        (s for s in reversed(sessions)
         if s.get("status") == STATUS_COMPLETE), None
    )
    in_flight = next(
        (s for s in sessions if s.get("status") == STATUS_IN_PROGRESS), None
    )
    source = in_flight if in_flight is not None else last_completed
    out = dict(state)
    out.update({
        "schemaVersion": state.get("schemaVersion"),
        "sessions": sessions,
        "currentSession": current,
        "totalSessions": len(sessions),
        "completedSessions": completed,
        "orchestrator": (source or {}).get("orchestrator"),
        "startedAt": (source or {}).get("startedAt"),
        "completedAt": (last_completed or {}).get("completedAt"),
        "verificationVerdict": (
            (last_completed or {}).get("verificationVerdict")
        ),
        "lifecycleState": (
            "work_in_progress" if current is not None else "closed"
        ),
    })
    return out


# --- Progress view and invariants -------------------------------------------

@dataclass(frozen=True)
class SessionRecord:
    number: object
    title: str
    status: object


@dataclass(frozen=True)
class ProgressView:
    sessions: tuple
    total_sessions: int
    completed_sessions: tuple
    current_session: Optional[int]
    next_session: Optional[int]
    is_between_sessions: bool


def _parse_sessions(raw) -> list:
    if not isinstance(raw, list):
        raise SessionStateInvariantError(1, "sessions must be a list")
    records = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise SessionStateInvariantError(
                2, f"session entry must be an object, got {entry!r}"
            )
        if "number" not in entry or "status" not in entry:
            raise SessionStateInvariantError(
                2, f"session entry needs number and status: {entry!r}"
            )
        status = canonicalize_status(entry["status"]) or entry["status"]
        records.append(SessionRecord(
            number=entry["number"],
            title=entry.get("title") or f"Session {entry['number']}",
            status=status,
        ))
    return records


def validate_invariants(sessions, *, lifecycle_state=None) -> None:
    if not sessions:
        raise SessionStateInvariantError(1, "sessions[] is empty")
    numbers = []
    for s in sessions:
        if type(s.number) is not int or s.number <= 0:
            raise SessionStateInvariantError(
                2, f"session number must be a positive int, got {s.number!r}"
            )
        if s.status not in SESSION_STATUSES:
            raise SessionStateInvariantError(
                2, f"session {s.number} has unknown status {s.status!r}"
            )
        numbers.append(s.number)
    if sorted(numbers) != list(range(1, len(numbers) + 1)):
        raise SessionStateInvariantError(
            2, f"session numbers must be contiguous from 1, got {numbers}"
        )
    in_progress = [s for s in sessions if s.status == STATUS_IN_PROGRESS]
    if len(in_progress) > 1:
        raise SessionStateInvariantError(
            3, f"more than one in-progress session: "
               f"{[s.number for s in in_progress]}"
        )
    if lifecycle_state == "closed" and in_progress:
        raise SessionStateInvariantError(
            8, f"lifecycleState 'closed' with session {in_progress[0].number} "
               "in flight"
        )
    # Work is done in order: a closed session never sits behind an open one.
    # Cancelled counts as closed — it is a session that will not run, not one
    # still waiting its turn.
    seen_open = False
    for s in sessions:
        if s.status not in CLOSED_STATUSES:
            seen_open = True
        elif seen_open and s.status == STATUS_COMPLETE:
            raise SessionStateInvariantError(
                4, f"complete session {s.number} follows an open one"
            )


def get_progress(state: dict) -> ProgressView:
    sessions = _parse_sessions(state.get("sessions"))
    validate_invariants(sessions, lifecycle_state=state.get("lifecycleState"))
    completed = tuple(
        s.number for s in sessions if s.status == STATUS_COMPLETE
    )
    current = next(
        (s.number for s in sessions if s.status == STATUS_IN_PROGRESS), None
    )
    nxt = next(
        (s.number for s in sessions if s.status == STATUS_NOT_STARTED), None
    )
    return ProgressView(
        sessions=tuple(sessions),
        total_sessions=len(sessions),
        completed_sessions=completed,
        current_session=current,
        next_session=nxt,
        is_between_sessions=(
            current is None and len(completed) >= 1 and nxt is not None
        ),
    )


# --- Task rows from the enforced execution record ----------------------------
#
# A task row's identity and order come from the session's approved plan;
# its state comes from ``step-execution.jsonl``. Neither is read from
# ``activity-log.json``: that layer is written only when an engine
# remembers to call ``session log``, so it drifts silently, and a task
# level built on it shows narration rather than what happened. The
# execution record cannot drift the same way -- a step is opened against
# a declared plan step, its close is earned against deterministic
# evidence, and a pre-commit hook refuses a commit while one is open.

STEP_STATE_PENDING = "pending"
STEP_STATE_IN_FLIGHT = "in flight"
STEP_STATE_DONE = "done"


def _py_str(value) -> str:
    """Python's ``str(x or "")``: falsy values (0, False, None, "") read as
    absent. The TS renderer mirrors this coercion exactly."""
    return str(value) if value else ""


def read_activity_log(sessions_dir) -> Optional[dict]:
    path = Path(sessions_dir) / ACTIVITY_LOG_FILENAME
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


def is_logged_step(entry: dict) -> bool:
    """A real logged step carries no ``kind`` at all; plan rows and
    bookkeeping records always name theirs."""
    return not _py_str(entry.get("kind"))


class TaskRowsRefused(RuntimeError):
    """The plan or the execution record could not be read. A refusal is
    not a skip: a framework that cannot tell which step is open must say
    so, never render the last row it could read as if it were current."""


def build_task_rows(repo_root, session_number: int) -> list:
    """The session's approved-plan steps, in plan order, each folded
    against the execution record.

    The invariant that at most one step is open is the fold's, not this
    function's: ``ledger.open_step`` returns the last ``opened`` row with
    no ``closed`` row after it, and there is nothing here to disagree
    with it. Two rows in flight would be a defect in that fold rather
    than a state this record can hold.

    Raises :class:`TaskRowsRefused` when either artifact is unreadable.
    A session with no plan at all has no tasks and is not a refusal --
    the lifecycle does not require one.
    """
    from . import ledger
    from .approved_plan import (
        PLAN_FILENAME,
        PlanIntegrityError,
        effective_plan,
        read_plan,
    )

    run_dir = ledger.session_run_dir(repo_root, session_number)
    if not (run_dir / PLAN_FILENAME).exists():
        return []
    try:
        plan = effective_plan(read_plan(run_dir))
    except (PlanIntegrityError, ValueError, OSError, UnicodeError) as exc:
        raise TaskRowsRefused(f"approved plan: {exc}") from exc
    try:
        events = ledger.read_step_events(repo_root, session_number)
        open_row = ledger.open_step(repo_root, session_number)
        closed = set(ledger.closed_step_ids(repo_root, session_number))
    except ledger.LedgerError as exc:
        raise TaskRowsRefused(f"execution record: {exc}") from exc

    opened_at = {}
    for event in events:
        if event["event"] == ledger.STEP_EVENT_OPENED:
            opened_at[event["step_id"]] = event.get("recorded_at")
    open_id = open_row["step_id"] if open_row else None

    rows = []
    for position, step in enumerate(plan.get("steps") or []):
        step_id = step.get("step_id")
        if step_id in closed:
            state, icon = STEP_STATE_DONE, STATUS_COMPLETE
        elif step_id == open_id:
            state, icon = STEP_STATE_IN_FLIGHT, STATUS_IN_PROGRESS
        else:
            state, icon = STEP_STATE_PENDING, STATUS_NOT_STARTED
        rows.append({
            "position": position,
            "stepId": step_id,
            "intent": _py_str(step.get("intent")),
            "state": state,
            "iconKey": icon,
            "isOpen": step_id == open_id,
            "startedAt": opened_at.get(step_id),
        })
    return rows


# --- The projection ---------------------------------------------------------

def build_projection(sessions_dir) -> dict:
    """Everything the Work Explorer renders for this repository, in one
    pass. Computed fresh on every call — a cache would need a freshness
    protocol, and the v1 one (digests + stale states) cost more than
    recomputing."""
    sessions_path = Path(sessions_dir)
    # The task level lives under the repository root, not the sessions
    # root: `.dabbler/runs/s<N>/`. The inverse of the one rule that places
    # the sessions root is `evidence.repo_root_from_sessions_dir`.
    repo_root = repo_root_from_sessions_dir(sessions_path)
    raw = read_raw_session_state(sessions_path)

    # A repository that has been set up and never run has no ledger, and its
    # sessions are the ones its plan declares. Keyed on the file being
    # ABSENT rather than on the read returning None: an unreadable ledger
    # comes back None too, and answering that with the plan would report a
    # fresh repository where there is a broken record.
    source = SOURCE_LEDGER
    if raw is None and not ledger_exists(sessions_path):
        planned = sessions_from_plan(sessions_path)
        if planned:
            source = SOURCE_PLAN
            raw = {"schemaVersion": None, "sessions": planned}

    invariant_violation = None
    if raw is None:
        view = derived_view({"schemaVersion": None, "sessions": []})
        if ledger_exists(sessions_path):
            # The file is there and did not parse. Rendering that as an
            # empty repository says the same thing as a repository with
            # no sessions, and the operator would have no reason to look
            # at the one file that needs looking at.
            invariant_violation = (
                f"{STATE_FILENAME} is present but could not be read; no "
                "sessions can be listed until it parses"
            )
    else:
        view = derived_view(raw)
        try:
            get_progress(view)
        except SessionStateInvariantError as exc:
            invariant_violation = str(exc)

    # Render the plan's title for a session that has none of its own. The
    # ledger is written at registration, so a plan re-cut between two
    # registrations leaves the moved sessions carrying whatever used to sit
    # at their numbers; the next `session start` writes the same correction
    # this render is making. `view` is a fresh parse of the file on every
    # call, so healing it here changes nothing on disk.
    if needs_title_heal(view.get("sessions") or []):
        titles = dict(
            extract_session_titles_from_plan(sessions_path / SESSION_PLAN_FILENAME)
        )
        if titles:
            heal_stale_titles(view["sessions"], titles)

    sessions_out = []
    for entry in view.get("sessions") or []:
        number = entry.get("number")
        session_status = entry.get("status")
        in_flight = session_status == STATUS_IN_PROGRESS
        session_out = {
            "number": number,
            # The name, beside the number. The extension renders this
            # rather than padding for itself, so the padding rule has one
            # owner across both languages.
            "displayNumber": session_display_number(number),
            "title": entry.get("title") or f"Session {number}",
            "status": session_status,
            "iconKey": (
                session_status if session_status in SESSION_STATUSES
                else STATUS_NOT_STARTED
            ),
            "inFlight": in_flight,
            "startedAt": entry.get("startedAt"),
            "completedAt": entry.get("completedAt"),
            "verificationVerdict": entry.get("verificationVerdict"),
            "tasks": [],
            "tasksRefused": None,
        }
        if in_flight and isinstance(number, int):
            try:
                session_out["tasks"] = build_task_rows(repo_root, number)
            except TaskRowsRefused as exc:
                session_out["tasksRefused"] = str(exc)
        sessions_out.append(session_out)

    return {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now().astimezone().isoformat(),
        "repository": {
            # Where these sessions came from, so the view can say that
            # nothing has run here rather than implying that it has.
            "sessionsSource": source,
            "schemaVersionOnDisk": (raw or {}).get("schemaVersion"),
            "totalSessions": view.get("totalSessions"),
            "sessionsCompleted": len(view.get("completedSessions") or []),
            "currentSession": view.get("currentSession"),
            "forceClosed": bool(view.get("forceClosed")),
            "orchestrator": view.get("orchestrator"),
            "invariantViolation": invariant_violation,
        },
        "sessions": sessions_out,
    }


def main(argv=None) -> int:
    from .evidence import SessionsRootNotFoundError, resolve_sessions_dir

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.progress",
        description="Emit the Work Explorer projection for this repository.",
    )
    parser.add_argument("--sessions-dir",
                        help="the repository's sessions root; derived from "
                             "the working directory when omitted")
    parser.add_argument(
        "--json", action="store_true",
        help="emit the projection JSON (the only output mode)",
    )
    args = parser.parse_args(argv)
    try:
        sessions_path = Path(resolve_sessions_dir(args.sessions_dir))
    except SessionsRootNotFoundError as exc:
        print(f"progress: {exc}", file=sys.stderr)
        return 2
    if not sessions_path.is_dir():
        print(f"progress: not a directory: {sessions_path}", file=sys.stderr)
        return 2
    print(json.dumps(build_projection(sessions_path), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
