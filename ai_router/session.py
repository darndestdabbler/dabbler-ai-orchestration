"""Session lifecycle: start and close, one state machine over the v4 schema.

The boundary triad (refuse a second in-flight session, refuse re-opening a
closed one, refuse skipping ahead) is enforced at the CLI *and* at the
writer — the writer-level refusal is what stops a direct API caller from
silently demoting a completed session. All session-state writes go through
the sanctioned writers here, which validate against the schema, enforce the
closed verdict vocabulary, and record a content hash so an out-of-band edit
is detectable.

``close`` runs the five gates, flips the state, then commits and pushes its
own bookkeeping. ``close --dry-run`` runs the gates read-only and prints
the rows — the whole preflight story in one flag.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import jsonschema

from .evidence import record_state_write, repo_root_for, run_git
from .progress import (
    SessionStateInvariantError,
    STATUS_CANCELLED,
    STATUS_COMPLETE,
    STATUS_IN_PROGRESS,
    STATUS_NOT_STARTED,
    TOP_LEVEL_STATUSES,
    canonicalize_status,
    extract_session_titles_from_spec,
    get_progress,
    normalize_to_v4_shape,
    read_raw_session_state,
)
from .verdict import validate_session_verdict

EXIT_OK = 0
EXIT_GATE_FAILED = 1
EXIT_USAGE = 2
EXIT_BOUNDARY = 3
EXIT_LOCK_CONTENTION = 5

SCHEMA_VERSION = 4
_STATE_SCHEMA_PATH = Path(__file__).parent / "schemas" / "session-state.schema.json"
_state_schema_cache: dict | None = None

STEP_STATUSES = ("pending", "in-progress", "complete", "blocked")


def _state_schema() -> dict:
    global _state_schema_cache
    if _state_schema_cache is None:
        _state_schema_cache = json.loads(
            _STATE_SCHEMA_PATH.read_text(encoding="utf-8")
        )
    return _state_schema_cache


def _now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat()


# --- Set resolution (bare numbers -> directories) ---------------------------

SESSION_SETS_DIRNAME = "session-sets"
_PREFIX_RE = re.compile(r"^(\d+)-")


class SetNotFoundError(ValueError):
    pass


class SetCollisionError(ValueError):
    pass


def default_scan_root() -> str:
    return os.path.join(os.getcwd(), "docs", SESSION_SETS_DIRNAME)


def resolve_session_set_dir(value: str, scan_root: Optional[str] = None) -> str:
    """An all-digits value is a set-number handle resolved against the scan
    root (zero-padding normalized by int()); anything else passes through
    verbatim. No fuzzy matching — a nearest-match nudge toward the wrong
    set is worse than an error."""
    if not str(value).isdigit():
        return str(value)
    number = int(value)
    root = scan_root or default_scan_root()
    matches = []
    try:
        names = sorted(os.listdir(root))
    except OSError:
        names = []
    for name in names:
        if name.startswith("_"):
            continue
        if not os.path.isdir(os.path.join(root, name)):
            continue
        m = _PREFIX_RE.match(name)
        if m and int(m.group(1)) == number:
            matches.append(name)
    if not matches:
        available = sorted({
            int(m.group(1))
            for name in names
            if (m := _PREFIX_RE.match(name))
        })
        raise SetNotFoundError(
            f"no session set with number {number} under {root}. "
            f"Available numbers: "
            f"{', '.join(str(n) for n in available) or '(none)'}."
        )
    if len(matches) > 1:
        raise SetCollisionError(
            f"number {number} is ambiguous under {root}: it matches "
            f"{matches}. Two session sets must not share a numeric prefix; "
            "rename one before addressing by number."
        )
    return os.path.join(root, matches[0])


# --- The lifecycle lock ------------------------------------------------------

LOCK_FILENAME = ".lifecycle.lock"
STALE_LOCK_TTL_SECONDS = 600


class LockContentionError(RuntimeError):
    pass


def _pid_running(pid: int) -> bool:
    if os.name == "nt":
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid
        )
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return True  # unknown -> conservatively alive
            return code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return True
    return True


def _lock_is_stale(path: Path) -> bool:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        acquired = datetime.datetime.fromisoformat(record["acquired_at"])
        pid = int(record["pid"])
    except (OSError, ValueError, KeyError, TypeError):
        return True
    age = (
        datetime.datetime.now(acquired.tzinfo) - acquired
    ).total_seconds()
    if age >= STALE_LOCK_TTL_SECONDS:
        return True
    return not _pid_running(pid)


def acquire_lock(set_dir, worker_id: Optional[str] = None) -> Path:
    """Atomic O_CREAT|O_EXCL create; one stale-reclaim retry. Raises
    :class:`LockContentionError` on a live holder."""
    path = Path(set_dir) / LOCK_FILENAME
    record = json.dumps({
        "pid": os.getpid(),
        "worker_id": worker_id or f"lifecycle/{os.getpid()}",
        "acquired_at": _now_iso(),
    }, indent=2) + "\n"
    for attempt in (1, 2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(record)
            return path
        except FileExistsError:
            if attempt == 1 and _lock_is_stale(path):
                try:
                    path.unlink()
                except OSError:
                    pass
                continue
            raise LockContentionError(
                f"another lifecycle operation holds {path}"
            )
    raise LockContentionError(f"could not acquire {path}")


def acquire_lock_with_timeout(
    set_dir, worker_id=None, timeout_seconds: float = 30.0
) -> Path:
    deadline = time.monotonic() + timeout_seconds
    while True:
        try:
            return acquire_lock(set_dir, worker_id)
        except LockContentionError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.25)


def release_lock(lock_path: Path) -> None:
    try:
        Path(lock_path).unlink()
    except OSError:
        pass


# --- Spec parsing: sessions and their steps ---------------------------------

_SESSION_HEAD_RE = re.compile(
    r"^###\s+Session\s+(\d+)(?:\s+of\s+(\d+))?\s*:\s*(.+?)\s*$", re.MULTILINE
)
_LIST_MARKER_RE = re.compile(r"^([ \t]*)(\d+\.)([ \t]+)(?=\S)")
_ANY_MARKER_RE = re.compile(r"^([ \t]*)(\d+\.|[-*+])([ \t]+)(?=\S)")
_FENCE_RE = re.compile(r"^\s*(?:```|~~~)")
_MAX_TOP_LEVEL_INDENT = 3
_TAB_WIDTH = 4


def _strip_fenced_blocks(text: str) -> str:
    """Blank out fenced code blocks preserving line count and offsets, so
    heading positions relative to steps are unchanged."""
    out = []
    in_fence = False
    for line in text.splitlines(keepends=True):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            out.append("\n" if line.endswith("\n") else "")
        elif in_fence:
            out.append("\n" if line.endswith("\n") else "")
        else:
            out.append(line)
    return "".join(out)


def _expand(indent: str) -> int:
    return len(indent.replace("\t", " " * _TAB_WIDTH))


def parse_step_texts(segment: str) -> list:
    """Top-level ordered-list items in a session segment, each collapsed to
    one line. Depth is resolved by tracking open list items' content
    columns — a marker indented at or past the innermost open item's
    content column is nested, not a step. A non-marker line in column 0
    ends the list; the ``**Creates:**`` trailer never joins a step."""
    lines = segment.splitlines()
    stack: list = []  # content columns of open list items
    starts: list = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        m = _ANY_MARKER_RE.match(line)
        if m is None:
            if not line[:1].isspace():
                stack.clear()
            continue
        indent = _expand(m.group(1))
        while stack and indent < stack[-1]:
            stack.pop()
        nested = bool(stack) and indent >= stack[-1]
        content_col = indent + len(m.group(2)) + len(m.group(3))
        if not nested:
            if indent > _MAX_TOP_LEVEL_INDENT:
                continue  # indented code block, not a step
            if _LIST_MARKER_RE.match(line):
                starts.append(index)
            stack.clear()
        stack.append(content_col)

    steps = []
    for pos, start in enumerate(starts):
        end = starts[pos + 1] if pos + 1 < len(starts) else len(lines)
        body_lines = [lines[start]]
        for line in lines[start + 1:end]:
            if line.strip() and not line[:1].isspace():
                break  # column-0 prose (the Creates/Touches trailer) ends it
            body_lines.append(line)
        body = "\n".join(body_lines)
        body = re.sub(r"^\s*\d+\.\s*", "", body)
        steps.append(re.sub(r"\s+", " ", body).strip())
    return [s for s in steps if s]


def parse_session_plans(spec_text: str) -> list:
    """``[{"number", "title", "steps"}, ...]`` from spec.md."""
    stripped = _strip_fenced_blocks(spec_text)
    matches = list(_SESSION_HEAD_RE.finditer(stripped))
    plans = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(stripped)
        plans.append({
            "number": int(m.group(1)),
            "title": m.group(3).strip(),
            "steps": parse_step_texts(stripped[m.end():end]),
        })
    return plans


def extract_spec_excerpt(spec_text: str, session_number: int) -> str:
    """The one session's slice of spec.md, falling back to the whole spec
    when no heading matches."""
    matches = list(_SESSION_HEAD_RE.finditer(spec_text))
    for i, m in enumerate(matches):
        if int(m.group(1)) == session_number:
            end = (
                matches[i + 1].start() if i + 1 < len(matches)
                else len(spec_text)
            )
            return spec_text[m.start():end].strip()
    return spec_text.strip()


# --- Sanctioned writers ------------------------------------------------------

def _atomic_write_json(path: Path, payload: dict) -> None:
    fd, tmp = tempfile.mkstemp(
        prefix=path.name + ".", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        for attempt in range(3):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 2:
                    raise
                time.sleep(0.05)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def build_orchestrator_block(
    engine: str, provider=None, model=None, effort=None
) -> dict:
    """Omit-null: missing keys are valid, null placeholders are not.
    identityProvenance is derived from the engine, never a free choice."""
    from .identity import classify_identity_provenance

    block = {"engine": engine}
    for key, value in (("provider", provider), ("model", model),
                       ("effort", effort)):
        if isinstance(value, str) and value.strip():
            block[key] = value.strip()
    provenance = classify_identity_provenance(engine)
    if provenance:
        block["identityProvenance"] = provenance
    return block


def _validate_and_write_state(set_dir, state: dict) -> None:
    try:
        jsonschema.validate(state, _state_schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise SessionStateInvariantError(
            2, f"refusing to write invalid session-state at {location}: "
               f"{exc.message}"
        ) from exc
    if "sessions" in state:
        get_progress(state)  # invariants, fail loud before I/O
    _atomic_write_json(Path(set_dir) / "session-state.json", state)
    record_state_write(set_dir)


def _build_sessions_array(
    total: int, completed, in_progress_number, prior_sessions, spec_titles
) -> list:
    prior_by_number = {
        s.get("number"): s for s in (prior_sessions or [])
        if isinstance(s, dict)
    }
    sessions = []
    for n in range(1, total + 1):
        prior = prior_by_number.get(n, {})
        title = prior.get("title")
        from .progress import heal_title
        title = heal_title(title, n, spec_titles) or f"Session {n}"
        if n == in_progress_number:
            status = STATUS_IN_PROGRESS
        elif n in completed:
            status = STATUS_COMPLETE
        else:
            status = STATUS_NOT_STARTED
        record = {"number": n, "title": title, "status": status}
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict"):
            if prior.get(key) is not None:
                record[key] = prior[key]
        record.setdefault("startedAt", None)
        record.setdefault("completedAt", None)
        record.setdefault("orchestrator", None)
        record.setdefault("verificationVerdict", None)
        if prior.get("type") in ("verification", "remediation"):
            record["type"] = prior["type"]
        sessions.append(record)
    return sessions


def _completed_numbers(state: Optional[dict]) -> set:
    if not state:
        return set()
    return {
        s.get("number") for s in state.get("sessions") or []
        if isinstance(s, dict) and s.get("status") == STATUS_COMPLETE
        and isinstance(s.get("number"), int)
    }


def register_session_start(
    set_dir, session_number: int, *, engine: str, provider=None,
    model=None, effort=None, total_sessions: Optional[int] = None,
) -> dict:
    """The one writer for a session start. Re-opening a closed session is
    refused HERE, not only at the CLI — a direct API caller must hit the
    same wall."""
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    normalized = (
        normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
    )
    completed = _completed_numbers(normalized)
    if session_number in completed:
        raise SessionStateInvariantError(
            4,
            f"register_session_start refused: session {session_number} is "
            f"already in completedSessions {sorted(completed)!r}. "
            "Re-opening a closed session would erase its close-out record; "
            "start the next session instead."
        )

    spec_titles = dict(
        extract_session_titles_from_spec(set_path / "spec.md")
    )
    total = total_sessions or 0
    if not total and normalized:
        total = len(normalized.get("sessions") or [])
    if not total and spec_titles:
        total = max(spec_titles)
    if not total:
        total = max([session_number] + sorted(completed), default=1)

    prior_sessions = (normalized or {}).get("sessions")
    sessions = _build_sessions_array(
        total, completed, session_number, prior_sessions, spec_titles
    )
    now = _now_iso()
    for record in sessions:
        if record["number"] == session_number:
            record["startedAt"] = record.get("startedAt") or now
            record["completedAt"] = None
            record["orchestrator"] = build_orchestrator_block(
                engine, provider, model, effort
            )
            record["verificationVerdict"] = None

    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": set_path.name,
        "status": STATUS_IN_PROGRESS,
        "sessions": sessions,
    }
    for passthrough in ("forceClosed", "preCancelStatus"):
        if raw and passthrough in raw:
            state[passthrough] = raw[passthrough]
    _validate_and_write_state(set_path, state)
    return state


def record_session_verification(
    set_dir, session_number: int, verdict: str, summary: Optional[dict] = None
) -> None:
    """Stamp the final verdict (closed vocabulary, exact allowlist) and an
    additive verification summary onto the session record."""
    verdict = validate_session_verdict(str(verdict).strip().upper())
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    if not raw or not isinstance(raw.get("sessions"), list):
        raise SessionStateInvariantError(
            1, f"no writable v4 session-state under {set_dir}"
        )
    hit = False
    for record in raw["sessions"]:
        if isinstance(record, dict) and record.get("number") == session_number:
            record["verificationVerdict"] = verdict
            if summary:
                record["verification"] = summary
            hit = True
    if not hit:
        raise SessionStateInvariantError(
            2, f"session {session_number} not present in {set_dir}"
        )
    _validate_and_write_state(set_path, raw)


def flip_state_to_closed(
    set_dir, *, verdict=None, forced: bool = False
) -> dict:
    """Close the in-flight session: complete it, stamp the verdict, and
    flip the set to complete when it was the last session (or when forced,
    which promotes every session — a forensic marker, not a shortcut)."""
    if verdict is not None:
        verdict = validate_session_verdict(str(verdict).strip().upper())
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    normalized = (
        normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
    )
    if not normalized:
        raise SessionStateInvariantError(
            1, f"no readable session-state under {set_dir}"
        )
    current = normalized.get("currentSession")
    if current is None:
        raise SessionStateInvariantError(
            3, f"no session is in flight under {set_dir}"
        )
    completed = _completed_numbers(normalized) | {current}
    sessions = normalized.get("sessions") or []
    total = len(sessions)
    now = _now_iso()
    new_sessions = []
    for record in sessions:
        record = dict(record)
        if record.get("number") == current:
            record["status"] = STATUS_COMPLETE
            record["completedAt"] = now
            if verdict is not None:
                record["verificationVerdict"] = verdict
        elif forced and record.get("status") != STATUS_COMPLETE:
            record["status"] = STATUS_COMPLETE
            if record.get("completedAt") is None:
                record["completedAt"] = now
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict"):
            record.setdefault(key, None)
        new_sessions.append(record)

    all_done = forced or len(completed) == total
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": set_path.name,
        "status": STATUS_COMPLETE if all_done else STATUS_IN_PROGRESS,
        "sessions": new_sessions,
    }
    if forced:
        state["forceClosed"] = True
    elif raw and "forceClosed" in raw:
        state["forceClosed"] = raw["forceClosed"]
    if raw and "preCancelStatus" in raw:
        state["preCancelStatus"] = raw["preCancelStatus"]
    _validate_and_write_state(set_path, state)
    return state


# --- activity-log.json (seed once, log steps) --------------------------------

_PLAN_KEY_MAX_WORDS = 6
_PLAN_KEY_MAX_CHARS = 48


def plan_step_key(text: str, ordinal: int) -> str:
    head = re.split(r"[.:;]", text, maxsplit=1)[0]
    head = re.sub(r"[*`_]", "", head).lower()
    words = re.split(r"[^a-z0-9]+", head)
    key = "-".join(w for w in words if w)[:_PLAN_KEY_MAX_CHARS].strip("-")
    key = "-".join(key.split("-")[:_PLAN_KEY_MAX_WORDS])
    return key or f"step-{ordinal}"


def _read_or_create_activity_log(set_dir, total_sessions=None) -> dict:
    path = Path(set_dir) / "activity-log.json"
    try:
        log = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(log, dict):
            return log
    except (OSError, json.JSONDecodeError, UnicodeError):
        pass
    return {
        "sessionSetName": Path(set_dir).name,
        "createdDate": _now_iso(),
        "totalSessions": total_sessions or 0,
        "entries": [],
    }


def _write_activity_log(set_dir, log: dict) -> None:
    _atomic_write_json(Path(set_dir) / "activity-log.json", log)


def seed_session_plan(set_dir, session_number: int, total_sessions=None) -> int:
    """Seed spec steps as plan rows — once per session, never re-applied.
    A spec edited mid-flight shows new work only when it is logged."""
    spec_path = Path(set_dir) / "spec.md"
    try:
        spec_text = spec_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return 0
    plan = next(
        (p for p in parse_session_plans(spec_text)
         if p["number"] == session_number),
        None,
    )
    if plan is None or not plan["steps"]:
        return 0
    log = _read_or_create_activity_log(set_dir, total_sessions)
    entries = log.setdefault("entries", [])
    if any(
        isinstance(e, dict) and e.get("sessionNumber") == session_number
        and e.get("kind") == "plan-step"
        for e in entries
    ):
        return 0
    now = _now_iso()
    seen_keys: set = set()
    for ordinal, text in enumerate(plan["steps"], start=1):
        key = plan_step_key(text, ordinal)
        if key in seen_keys:
            key = f"{key}-{ordinal}"
        seen_keys.add(key)
        entries.append({
            "sessionNumber": session_number,
            "stepNumber": ordinal,
            "stepKey": key,
            "dateTime": now,
            "description": text,
            "status": "pending",
            "kind": "plan-step",
        })
    _write_activity_log(set_dir, log)
    return len(plan["steps"])


def log_step(
    set_dir, session_number: int, step_key: str, description: str,
    status: str, step_number=None,
) -> None:
    """Closed step vocabulary at the writer; drifted synonyms are read-
    tolerated but never written."""
    if status not in STEP_STATUSES:
        raise ValueError(
            f"step status must be one of {STEP_STATUSES}, got {status!r}"
        )
    log = _read_or_create_activity_log(set_dir)
    log.setdefault("entries", []).append({
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": step_key,
        "dateTime": _now_iso(),
        "description": description,
        "status": status,
    })
    _write_activity_log(set_dir, log)


def append_change_log_block(set_dir, text: str) -> None:
    path = Path(set_dir) / "change-log.md"
    existing = ""
    try:
        existing = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        pass
    with open(path, "w", encoding="utf-8", newline="") as f:
        if existing:
            f.write(existing.rstrip("\n") + "\n\n" + text.rstrip("\n") + "\n")
        else:
            f.write(text.rstrip("\n") + "\n")


# --- start ------------------------------------------------------------------

def start(
    set_dir, *, engine: str, provider=None, model=None, effort=None,
    session_number: Optional[int] = None, total_sessions=None,
) -> int:
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"start: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE

    from .identity import IdentityResolutionError, resolve_orchestrator_identity
    try:
        resolve_orchestrator_identity(
            build_orchestrator_block(engine, provider, model, effort)
        )
    except IdentityResolutionError as exc:
        print(f"start: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE

    try:
        lock = acquire_lock_with_timeout(
            set_path, worker_id=f"start_session/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"start: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        raw = read_raw_session_state(set_path)
        normalized = (
            normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
        )
        completed = sorted(_completed_numbers(normalized))
        current = (normalized or {}).get("currentSession")

        requested = session_number
        if requested is None:
            requested = current if current is not None else (
                (max(completed) + 1) if completed else 1
            )

        # The boundary triad.
        if current is not None and requested != current:
            print(
                f"start: refused -- session {current} is still in flight "
                f"(completedSessions={completed}). Close session {current} "
                f"before starting session {requested}.", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if requested in set(completed):
            print(
                f"start: refused -- session {requested} is already closed "
                f"(completedSessions={completed}). Sessions are never "
                "re-opened.", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if current is None:
            expected = (max(completed) + 1) if completed else 1
            if requested != expected:
                print(
                    f"start: refused -- session {requested} is not the next "
                    f"sequential session (expected {expected}; "
                    f"completedSessions={completed}). Close the intervening "
                    "sessions first.", file=sys.stderr,
                )
                return EXIT_BOUNDARY

        state = register_session_start(
            set_path, requested, engine=engine, provider=provider,
            model=model, effort=effort, total_sessions=total_sessions,
        )
        seeded = seed_session_plan(
            set_path, requested,
            total_sessions=len(state.get("sessions") or []),
        )
        print(
            f"start: session {requested} of {set_path.name} registered "
            f"({engine}); {seeded} plan step(s) seeded."
        )
        return EXIT_OK
    finally:
        release_lock(lock)


# --- close ------------------------------------------------------------------

def _local_only(repo_root) -> bool:
    return os.path.isfile(os.path.join(repo_root, ".dabbler", "local-only"))


def close(set_dir, *, dry_run: bool = False, forced: bool = False) -> int:
    from .gates import run_gates
    from .ledger import latest_round

    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"close: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(set_path, worker_id=f"close_session/{os.getpid()}")
    except LockContentionError as exc:
        print(f"close: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(set_path)
        normalized = (
            normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
        )
        current = (normalized or {}).get("currentSession")
        if current is None:
            status = (normalized or {}).get("status")
            if status == STATUS_COMPLETE:
                print("close: already closed (noop).")
                return EXIT_OK
            print(
                f"close: refused -- no session is in flight under "
                f"{set_path} (status={status!r}).", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        results = run_gates(set_path, forced=forced)
        width = max(len(r.name) for r in results)
        for r in results:
            mark = "PASS" if r.passed else "FAIL"
            line = f"  {r.name:<{width}}  {mark}"
            if r.remediation:
                line += f"  {r.remediation}"
            print(line)
        failed = [r for r in results if not r.passed]
        if dry_run:
            print(
                f"close --dry-run: {len(results) - len(failed)}/"
                f"{len(results)} gates pass; nothing written."
            )
            return EXIT_OK if not failed else EXIT_GATE_FAILED
        if failed:
            print(
                f"close: refused -- {len(failed)} gate(s) failed.",
                file=sys.stderr,
            )
            return EXIT_GATE_FAILED

        repo_root = repo_root_for(set_path)
        verdict = None
        if repo_root:
            row = latest_round(repo_root, set_path.name, current)
            if row:
                verdict = row.get("verdict")

        flip_state_to_closed(set_path, verdict=verdict, forced=forced)
        print(f"close: session {current} of {set_path.name} closed"
              + (f" ({verdict})" if verdict else "") + ".")

        if repo_root:
            run_git(repo_root, "add", "--", str(set_path))
            rc, _, err = run_git(
                repo_root, "commit", "-m",
                f"Close session {current} of {set_path.name}",
            )
            if rc != 0 and "nothing to commit" not in err.lower():
                print(f"close: state flipped but commit failed: {err}",
                      file=sys.stderr)
                return EXIT_GATE_FAILED
            if not _local_only(repo_root):
                rc, _, err = run_git(repo_root, "push")
                if rc != 0:
                    print(
                        f"close: state flipped and committed but push "
                        f"failed: {err}. Run `git push` manually.",
                        file=sys.stderr,
                    )
                    return EXIT_GATE_FAILED
        return EXIT_OK
    finally:
        release_lock(lock)


# --- cancel / restore --------------------------------------------------------

CANCELLED_FILENAME = "CANCELLED.md"
RESTORED_FILENAME = "RESTORED.md"
_CANCEL_HISTORY_HEADER = "# Cancellation history"

_RESTORABLE_STATUSES = (STATUS_NOT_STARTED, STATUS_IN_PROGRESS,
                        STATUS_COMPLETE)


def _now_iso_seconds() -> str:
    """Second precision with timezone — the marker-file timestamp shape
    legacy readers parse."""
    return (
        datetime.datetime.now().astimezone().replace(microsecond=0)
        .isoformat()
    )


def _prepend_history_entry(existing, verb: str, reason: str,
                           when: str) -> str:
    """New entry above prior ones, one accumulated history per marker file.
    Malformed prior content (manual edits) is preserved verbatim below a
    fresh header — filename presence is the signal that must survive."""
    entry = f"{verb} on {when}\n{reason}\n\n"
    if existing is None:
        return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}"
    if existing.startswith(_CANCEL_HISTORY_HEADER):
        tail = existing[len(_CANCEL_HISTORY_HEADER):].lstrip("\n")
        return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}{tail}"
    return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}{existing}"


def _write_text_lf(path: Path, content: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)


def _v4_on_disk_state(set_path: Path, raw: dict) -> dict:
    """Project any historical on-disk shape to the canonical v4 write
    shape: ledger normalized, derived top-level keys dropped, the plan-less
    carve-out and passthrough keys preserved."""
    normalized = normalize_to_v4_shape(raw, set_path / "spec.md")
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": normalized.get("sessionSetName") or set_path.name,
        "status": canonicalize_status(normalized.get("status")),
    }
    normalized_sessions = normalized.get("sessions")
    if isinstance(raw.get("sessions"), list) or normalized_sessions:
        state["sessions"] = normalized_sessions or []
    else:
        for key in ("startedAt", "orchestrator"):  # plan-less carve-out
            if raw.get(key) is not None:
                state[key] = raw[key]
    for key in ("forceClosed", "nextOrchestrator"):
        if key in raw:
            state[key] = raw[key]
    if "preCancelStatus" in raw:
        pre = canonicalize_status(raw["preCancelStatus"])
        # A drifted value is dropped, not written: restore then falls back
        # to ledger derivation instead of trusting a token nothing owns.
        if pre is None or pre in TOP_LEVEL_STATUSES:
            state["preCancelStatus"] = pre
    return state


def _infer_status_from_files(set_path: Path) -> str:
    """File-presence inference for sets with no usable state file — the
    same rules build_projection applies on read."""
    if (set_path / "change-log.md").is_file():
        return STATUS_COMPLETE
    if (set_path / "activity-log.json").is_file():
        return STATUS_IN_PROGRESS
    return STATUS_NOT_STARTED


def _derive_pre_cancel_status(normalized: dict) -> str:
    """Ledger-derived fallback when preCancelStatus is absent: any complete
    sessions -> in-progress if incomplete sessions remain else complete;
    none complete -> not-started."""
    statuses = [
        s.get("status") for s in (normalized or {}).get("sessions") or []
        if isinstance(s, dict)
    ]
    complete = [s for s in statuses if s == STATUS_COMPLETE]
    if not complete:
        return STATUS_NOT_STARTED
    if len(complete) < len(statuses):
        return STATUS_IN_PROGRESS
    return STATUS_COMPLETE


def cancel(set_dir, *, reason: str, force: bool = False) -> int:
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"cancel: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(set_path, worker_id=f"cancel/{os.getpid()}")
    except LockContentionError as exc:
        print(f"cancel: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(set_path)
        normalized = (
            normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
        )
        current = (normalized or {}).get("currentSession")
        if current is not None and not force:
            print(
                f"cancel: refused -- session {current} of {set_path.name} "
                "is in flight. Close it first, or pass --force.",
                file=sys.stderr,
            )
            return EXIT_BOUNDARY

        if raw is not None:
            state = _v4_on_disk_state(set_path, raw)
            prior = state.get("status")
            # A re-cancel keeps the original preCancelStatus: overwriting
            # it with "cancelled" would lose the status a restore returns to.
            if prior in _RESTORABLE_STATUSES:
                state["preCancelStatus"] = prior
            state["status"] = STATUS_CANCELLED
        else:
            state = {
                "schemaVersion": SCHEMA_VERSION,
                "sessionSetName": set_path.name,
                "status": STATUS_CANCELLED,
                "preCancelStatus": _infer_status_from_files(set_path),
            }
        try:
            _validate_and_write_state(set_path, state)
        except SessionStateInvariantError as exc:
            print(f"cancel: refused -- {exc}", file=sys.stderr)
            return EXIT_GATE_FAILED

        # Marker file second: the state file is authoritative for v2
        # readers; the marker is the audit trail legacy readers and humans
        # consult. History accumulates in one file, so an earlier restore's
        # RESTORED.md is renamed back before the new entry is prepended.
        cancelled_path = set_path / CANCELLED_FILENAME
        restored_path = set_path / RESTORED_FILENAME
        if restored_path.is_file() and not cancelled_path.is_file():
            os.replace(restored_path, cancelled_path)
        existing = None
        if cancelled_path.is_file():
            existing = cancelled_path.read_text(encoding="utf-8")
        _write_text_lf(cancelled_path, _prepend_history_entry(
            existing, "Cancelled", reason, _now_iso_seconds()
        ))
        print(json.dumps({
            "status": STATUS_CANCELLED,
            "sessionSetName": state["sessionSetName"],
        }))
        return EXIT_OK
    finally:
        release_lock(lock)


def restore(set_dir, *, reason: str = "") -> int:
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"restore: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(set_path, worker_id=f"restore/{os.getpid()}")
    except LockContentionError as exc:
        print(f"restore: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(set_path)
        cancelled_path = set_path / CANCELLED_FILENAME
        is_cancelled = (
            canonicalize_status(raw.get("status")) == STATUS_CANCELLED
            if raw is not None else cancelled_path.is_file()
        )
        if not is_cancelled:
            print(
                f"restore: refused -- {set_path.name} is not cancelled; "
                "there is nothing to restore.", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        # Marker rename first (history preserved under RESTORED.md), state
        # write second, CANCELLED.md removal last — a crash mid-way leaves
        # the set still looking cancelled, and restore is re-runnable.
        marker_history = None
        if cancelled_path.is_file():
            marker_history = cancelled_path.read_text(encoding="utf-8")
            _write_text_lf(set_path / RESTORED_FILENAME,
                           _prepend_history_entry(
                               marker_history, "Restored", reason,
                               _now_iso_seconds(),
                           ))

        if raw is not None:
            state = _v4_on_disk_state(set_path, raw)
            prior = state.pop("preCancelStatus", None)
            if prior not in _RESTORABLE_STATUSES:
                prior = _derive_pre_cancel_status(
                    normalize_to_v4_shape(raw, set_path / "spec.md")
                )
            state["status"] = prior
            try:
                _validate_and_write_state(set_path, state)
            except SessionStateInvariantError as exc:
                print(f"restore: refused -- {exc}", file=sys.stderr)
                return EXIT_GATE_FAILED
            restored_status = prior
        else:
            restored_status = _infer_status_from_files(set_path)

        try:
            cancelled_path.unlink()
        except OSError:
            pass
        print(json.dumps({
            "status": restored_status,
            "sessionSetName": set_path.name,
        }))
        return EXIT_OK
    finally:
        release_lock(lock)


# --- CLI --------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_router.session")
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start", help="register a session start")
    p_start.add_argument("--session-set-dir", required=True,
                         help="directory, slug, or bare set number")
    p_start.add_argument("--engine", required=True)
    p_start.add_argument("--provider")
    p_start.add_argument("--model")
    p_start.add_argument("--effort")
    p_start.add_argument("--session-number", type=int)
    p_start.add_argument("--total-sessions", type=int)

    p_close = sub.add_parser("close", help="run gates and close the session")
    p_close.add_argument("--session-set-dir", required=True)
    p_close.add_argument("--dry-run", action="store_true",
                         help="run the gates read-only and print the rows")
    p_close.add_argument("--force", action="store_true",
                         help="bypass bookkeeping gates, never evidence; "
                              "stamps forceClosed")

    p_cancel = sub.add_parser("cancel", help="cancel a session set")
    p_cancel.add_argument("set_dir",
                          help="directory, slug, or bare set number")
    p_cancel.add_argument("--reason", required=True,
                          help="recorded in CANCELLED.md")
    p_cancel.add_argument("--force", action="store_true",
                          help="cancel even with a session in flight")

    p_restore = sub.add_parser(
        "restore", help="restore a cancelled session set"
    )
    p_restore.add_argument("set_dir",
                           help="directory, slug, or bare set number")
    p_restore.add_argument("--reason", default="",
                           help="recorded in RESTORED.md")

    args = parser.parse_args(argv)
    target = getattr(args, "session_set_dir", None) or args.set_dir
    try:
        set_dir = resolve_session_set_dir(target)
    except (SetNotFoundError, SetCollisionError) as exc:
        print(f"session: {exc}", file=sys.stderr)
        return EXIT_USAGE

    if args.command == "start":
        return start(
            set_dir, engine=args.engine, provider=args.provider,
            model=args.model, effort=args.effort,
            session_number=args.session_number,
            total_sessions=args.total_sessions,
        )
    if args.command == "cancel":
        return cancel(set_dir, reason=args.reason, force=args.force)
    if args.command == "restore":
        return restore(set_dir, reason=args.reason)
    return close(set_dir, dry_run=args.dry_run, forced=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
