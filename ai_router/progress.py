"""The canonical session-state reader and the Work Explorer projection.

One reader for every consumer: gates, the CLI, and the VS Code extension
(which shells to ``python -m ai_router.progress --json <set-dir>`` and
renders the JSON — it re-implements nothing). Readers tolerate v2/v3 files
on disk via :func:`normalize_to_v4_shape`; writers only ever emit v4.

Three vocabularies, deliberately distinct:
- set/session lifecycle: ``not-started`` / ``in-progress`` / ``complete``
  (+ ``cancelled`` at set level only);
- step status (the activity-log record, rendered verbatim): ``pending`` /
  ``in-progress`` / ``complete`` / ``blocked`` plus tolerated drift;
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

SCHEMA_VERSION_V4 = 4

STATUS_NOT_STARTED = "not-started"
STATUS_IN_PROGRESS = "in-progress"
STATUS_COMPLETE = "complete"
STATUS_CANCELLED = "cancelled"

SESSION_STATUSES = (STATUS_NOT_STARTED, STATUS_IN_PROGRESS, STATUS_COMPLETE)
TOP_LEVEL_STATUSES = SESSION_STATUSES + (STATUS_CANCELLED,)

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


# --- Spec titles and title heal ---------------------------------------------

_SESSION_HEADING_RE = re.compile(
    r"^###\s+Session\s+(?P<number>\d+)(?:\s+of\s+\d+)?\s*:\s*(?P<title>.+?)\s*$",
    re.MULTILINE,
)
_GENERIC_TITLE_RE = re.compile(r"^Session\s+(?P<number>\d+)$")


def extract_session_titles_from_spec(spec_md_path) -> list:
    """``[(number, title), ...]`` sorted; empty on a missing or unreadable
    spec — titles are a nicety, never a gate."""
    try:
        text = Path(spec_md_path).read_text(encoding="utf-8")
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


def heal_title(stored_title, number: int, spec_titles: Optional[dict] = None):
    if not is_generic_title(stored_title, number):
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
        if type(number) is int and number > 0 and is_generic_title(
            entry.get("title"), number
        ):
            return True
    return False


def heal_generic_titles(sessions, spec_titles: dict) -> int:
    healed = 0
    for entry in sessions:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if type(number) is not int or number <= 0:
            continue
        replacement = heal_title(entry.get("title"), number, spec_titles)
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

    spec_titles = dict(extract_session_titles_from_spec(spec_md_path))
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


def normalize_to_v4_shape(
    state: dict, spec_md_path, spec_titles: Optional[dict] = None
) -> dict:
    """The one read shim: any historical shape in, the v4 read view out.
    Older files are normalized on read, never rewritten."""
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
            else dict(extract_session_titles_from_spec(spec_md_path))
        )
        if titles:
            heal_generic_titles(sessions_v4, titles)

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

def read_raw_session_state(set_dir) -> Optional[dict]:
    """The raw on-disk dict, or ``None`` when no usable state exists.
    ``PermissionError`` propagates — a locked file is not an absent one,
    and treating it as absent invites writers to clobber real state."""
    path = Path(set_dir) / "session-state.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


def read_session_state(set_dir) -> Optional[dict]:
    raw = read_raw_session_state(set_dir)
    if raw is None:
        return None
    try:
        return normalize_to_v4_shape(raw, Path(set_dir) / "spec.md")
    except (TypeError, ValueError):
        return raw


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


def validate_invariants(sessions, *, top_status, lifecycle_state=None) -> None:
    if lifecycle_state == "closed" and top_status not in (
        STATUS_COMPLETE, STATUS_CANCELLED,
    ):
        raise SessionStateInvariantError(
            8, f"lifecycleState 'closed' with top status {top_status!r}"
        )
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
    seen_open = False
    for s in sessions:
        if s.status != STATUS_COMPLETE:
            seen_open = True
        elif seen_open:
            raise SessionStateInvariantError(
                4, f"complete session {s.number} follows an open one"
            )
    if top_status is None:
        return
    if top_status not in TOP_LEVEL_STATUSES:
        raise SessionStateInvariantError(
            2, f"unknown top-level status {top_status!r}"
        )
    if top_status == STATUS_NOT_STARTED:
        if any(s.status != STATUS_NOT_STARTED for s in sessions):
            raise SessionStateInvariantError(
                5, "top status not-started but a session has begun"
            )
    elif top_status == STATUS_IN_PROGRESS:
        completed = [s for s in sessions if s.status == STATUS_COMPLETE]
        not_started = [s for s in sessions if s.status == STATUS_NOT_STARTED]
        between = bool(completed) and bool(not_started) and not in_progress
        if not in_progress and not between:
            raise SessionStateInvariantError(
                6, "top status in-progress needs one in-progress session "
                   "or a between-sessions state"
            )
    elif top_status == STATUS_COMPLETE:
        if any(s.status != STATUS_COMPLETE for s in sessions):
            raise SessionStateInvariantError(
                7, "top status complete but a session is not complete"
            )


def get_progress(state: dict) -> ProgressView:
    sessions = _parse_sessions(state.get("sessions"))
    validate_invariants(
        sessions,
        top_status=canonicalize_status(state.get("status")),
        lifecycle_state=state.get("lifecycleState"),
    )
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


def read_progress(state: dict, spec_md_path) -> ProgressView:
    return get_progress(normalize_to_v4_shape(state, spec_md_path))


# --- Step rows from activity-log.json ---------------------------------------

STATUS_BOXES = {
    "complete": "[x]", "done": "[x]",
    "in-progress": "[~]", "in_progress": "[~]", "started": "[~]",
    "pending": "[ ]", "not-started": "[ ]",
    "blocked": "[!]", "failed": "[!]",
}
UNKNOWN_BOX = "[?]"
_BOX_TO_STATE = {"[ ]": "pending", "[~]": "in-progress", "[x]": "complete",
                 "[!]": "blocked"}
_RECORD_ANSWERS_BOXES = {"[~]", "[!]"}
_UNSTARTED_STATUSES = {"pending", "not-started"}

# The four icon assets the extension ships; blocked/failed fold into
# cancelled ("this did not go well") and an unknown token falls back to
# not-started, while the CLI box for the same token is [?].
_ICON_KEYS = {
    "complete": "complete", "done": "complete",
    "in-progress": "in-progress", "in_progress": "in-progress",
    "started": "in-progress",
    "pending": "not-started", "not-started": "not-started",
    "blocked": "cancelled", "failed": "cancelled",
}


def _py_str(value) -> str:
    """Python's ``str(x or "")``: falsy values (0, False, None, "") read as
    absent. The TS renderer mirrors this coercion exactly."""
    return str(value) if value else ""


def step_state(status) -> str:
    box = STATUS_BOXES.get(_py_str(status).lower())
    return _BOX_TO_STATE.get(box, "unknown")


def step_icon_key(status) -> str:
    return _ICON_KEYS.get(_py_str(status).lower(), "not-started")


def read_activity_log(set_dir) -> Optional[dict]:
    path = Path(set_dir) / "activity-log.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


def is_logged_step(entry: dict) -> bool:
    """A real logged step carries no ``kind`` at all; plan rows and
    bookkeeping records always name theirs."""
    return not _py_str(entry.get("kind"))


def _collapse_by_step_key(entries: list) -> list:
    """Latest entry wins, at the first-seen position. Keyless entries get
    an anonymous bucket each so two unnamed steps stay two steps."""
    order: list = []
    latest: dict = {}
    for index, entry in enumerate(entries):
        key = _py_str(entry.get("stepKey")) or f"\0anon-{index}"
        if key not in latest:
            order.append(key)
        latest[key] = entry
    return [latest[k] for k in order]


def build_step_rows(set_dir, session_number: int) -> list:
    """Plan rows own position, logged steps own content: a logged step
    claims a planned row by exact stepKey, or failing that by stepNumber —
    keys are derived slugs an engine paraphrases, numbers are the stable
    address; unclaimed logged steps append; unclaimed planned rows stay
    as pending rows with the spec's words. Nothing is dropped either way."""
    log = read_activity_log(set_dir)
    if log is None:
        return []
    mine = [
        e for e in log.get("entries", [])
        if isinstance(e, dict) and e.get("sessionNumber") == session_number
    ]
    if not mine:
        return []
    plan = _collapse_by_step_key(
        [e for e in mine if _py_str(e.get("kind")) == "plan-step"]
    )
    real = _collapse_by_step_key([e for e in mine if is_logged_step(e)])

    if not plan:
        rows = [dict(e, isPlanned=False) for e in real]
    else:
        rows = [dict(e, isPlanned=True) for e in plan]
        claimed = set()
        by_key = {_py_str(r.get("stepKey")): i for i, r in enumerate(rows)}
        by_num = {
            r.get("stepNumber"): i for i, r in enumerate(rows)
            if isinstance(r.get("stepNumber"), int)
        }
        leftovers = []
        for entry in real:
            key = _py_str(entry.get("stepKey"))
            slot = by_key.get(key) if key else None
            if slot is None or slot in claimed:
                num = entry.get("stepNumber")
                slot = by_num.get(num) if isinstance(num, int) else None
            if slot is not None and slot not in claimed:
                rows[slot] = dict(entry, isPlanned=True)
                claimed.add(slot)
            else:
                leftovers.append(dict(entry, isPlanned=False))
        rows.extend(leftovers)

    return rows


def _mark_active_step(rows: list, in_flight: bool) -> None:
    """Derive the one 'active' row: display-only, never written back. Only
    when the session is in flight, no row already answers with [~]/[!],
    and the candidate's status is a token the table knows is unstarted."""
    for row in rows:
        row["isActive"] = False
    if not in_flight:
        return
    for row in rows:
        if STATUS_BOXES.get(_py_str(row.get("status")).lower()) in (
            _RECORD_ANSWERS_BOXES
        ):
            return
    for row in rows:
        if row.get("isPlanned") and _py_str(
            row.get("status")
        ).lower() in _UNSTARTED_STATUSES:
            row["isActive"] = True
            return


# --- The projection ---------------------------------------------------------

def build_projection(set_dir) -> dict:
    """Everything the Work Explorer renders for one set, in one pass.
    Computed fresh on every call — a cache would need a freshness protocol,
    and the v1 one (digests + stale states) cost more than recomputing."""
    set_path = Path(set_dir)
    slug = set_path.name
    raw = read_raw_session_state(set_path)

    invariant_violation = None
    if raw is None:
        # Spec-only folder: infer from file presence; consult the legacy
        # CANCELLED.md marker only when no usable state file exists.
        if (set_path / "CANCELLED.md").exists():
            status = STATUS_CANCELLED
        elif (set_path / "change-log.md").exists():
            status = STATUS_COMPLETE
        elif (set_path / "activity-log.json").exists():
            status = STATUS_IN_PROGRESS
        else:
            status = STATUS_NOT_STARTED
        state = {"sessionSetName": slug, "status": status, "sessions": []}
        normalized = dict(
            state, schemaVersion=None, currentSession=None,
            totalSessions=None, completedSessions=[], orchestrator=None,
            startedAt=None, completedAt=None, verificationVerdict=None,
            lifecycleState=None,
        )
    else:
        normalized = normalize_to_v4_shape(raw, set_path / "spec.md")
        try:
            get_progress(normalized)
        except SessionStateInvariantError as exc:
            invariant_violation = str(exc)
            # A stale mid-set "complete" must not briefly render Complete.
            if normalized.get("status") == STATUS_COMPLETE:
                normalized["status"] = STATUS_IN_PROGRESS

    status = normalized.get("status")
    icon_key = status if status in TOP_LEVEL_STATUSES else STATUS_NOT_STARTED
    sessions_out = []
    for entry in normalized.get("sessions") or []:
        number = entry.get("number")
        session_status = entry.get("status")
        in_flight = session_status == STATUS_IN_PROGRESS
        session_out = {
            "number": number,
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
            "steps": [],
        }
        if in_flight and isinstance(number, int):
            rows = build_step_rows(set_path, number)
            _mark_active_step(rows, in_flight=True)
            for position, row in enumerate(rows):
                raw_status = row.get("status")
                effective = (
                    "in-progress" if row.get("isActive") else raw_status
                )
                session_out["steps"].append({
                    "position": position,
                    "stepNumber": row.get("stepNumber"),
                    "stepKey": _py_str(row.get("stepKey")) or None,
                    "description": _py_str(row.get("description")),
                    "status": raw_status,
                    "state": step_state(effective),
                    "box": STATUS_BOXES.get(
                        _py_str(effective).lower(), UNKNOWN_BOX
                    ),
                    "iconKey": step_icon_key(effective),
                    "isPlanned": bool(row.get("isPlanned")),
                    "isActive": bool(row.get("isActive")),
                    # A plan row's dateTime is when the plan was seeded,
                    # not when the step started; only logged steps carry
                    # a real start.
                    "startedAt": (
                        row.get("dateTime") if is_logged_step(row) else None
                    ),
                })
        sessions_out.append(session_out)

    completed = normalized.get("completedSessions") or []
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now().astimezone().isoformat(),
        "set": {
            "slug": slug,
            "status": status,
            "iconKey": icon_key,
            "schemaVersionOnDisk": (raw or {}).get("schemaVersion"),
            "totalSessions": normalized.get("totalSessions"),
            "sessionsCompleted": len(completed),
            "currentSession": normalized.get("currentSession"),
            "verificationVerdict": normalized.get("verificationVerdict"),
            "forceClosed": bool(normalized.get("forceClosed")),
            "preCancelStatus": normalized.get("preCancelStatus"),
            "orchestrator": normalized.get("orchestrator"),
            "invariantViolation": invariant_violation,
        },
        "sessions": sessions_out,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.progress",
        description="Emit the Work Explorer projection for a session set.",
    )
    parser.add_argument("set_dir", help="session-set directory")
    parser.add_argument(
        "--json", action="store_true",
        help="emit the projection JSON (the only output mode)",
    )
    args = parser.parse_args(argv)
    set_path = Path(args.set_dir)
    if not set_path.is_dir():
        print(f"progress: not a directory: {set_path}", file=sys.stderr)
        return 2
    print(json.dumps(build_projection(set_path), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
