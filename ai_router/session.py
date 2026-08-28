"""Session lifecycle: start and close, one state machine over the v4 schema.

The boundary triad (refuse a second in-flight session, refuse re-opening a
closed one, refuse skipping ahead) is enforced at the CLI *and* at the
writer — the writer-level refusal is what stops a direct API caller from
silently demoting a completed session. All artifact writes go through the
sanctioned writers in ``writers.py``, which validate against the schema,
enforce the closed vocabularies, and record a content hash so an
out-of-band edit is detectable; this module owns the lifecycle FLOWS
(resolution, locking, boundary refusals, gates, CLI).

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
import shutil
import sys
import time
from pathlib import Path
from typing import Optional

from .evidence import (
    SessionsRootNotFoundError,
    repo_root_for,
    resolve_sessions_dir,
    run_git,
)
from .ledger import RUNS_DIRNAME
from .progress import (
    SessionStateInvariantError,
    STATUS_CANCELLED,
    STATUS_COMPLETE,
    STATUS_IN_PROGRESS,
    STATUS_NOT_STARTED,
    canonicalize_status,
    derived_view,
    is_logged_step,
    normalize_legacy_state,
    read_activity_log,
    read_raw_legacy_state,
    read_raw_session_state,
    session_display_number,
)
# Re-exported so the public surface stays importable from ai_router.session
# — callers address the lifecycle module; where a helper lives is an
# implementation detail.
from .writers import (  # noqa: F401
    DECIDERS,
    SCHEMA_VERSION,
    STEP_STATUSES,
    SanctionedWriteError,
    _cancelled_numbers,
    _completed_numbers,
    _now_iso,
    _now_iso_seconds,
    _on_disk_state,
    _validate_and_write_state,
    _write_text_lf,
    append_change_log_block,
    append_decision,
    build_orchestrator_block,
    declare_session_task,
    flip_state_to_closed,
    log_step,
    plan_step_key,
    read_task_declaration,
    record_project_plan,
    record_session_verification,
    register_session_start,
    seed_session_plan,
    session_is_releasable,
)

EXIT_OK = 0
EXIT_GATE_FAILED = 1
EXIT_USAGE = 2
EXIT_BOUNDARY = 3
EXIT_LOCK_CONTENTION = 5


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


def acquire_lock(sessions_dir, worker_id: Optional[str] = None) -> Path:
    """Atomic O_CREAT|O_EXCL create; one stale-reclaim retry. Raises
    :class:`LockContentionError` on a live holder."""
    path = Path(sessions_dir) / LOCK_FILENAME
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
    sessions_dir, worker_id=None, timeout_seconds: float = 30.0
) -> Path:
    deadline = time.monotonic() + timeout_seconds
    while True:
        try:
            return acquire_lock(sessions_dir, worker_id)
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

_SLUG_MARKER_LOOSE_RE = re.compile(
    r"\(\s*slug\s*:?\s*([^)]*)\)\s*$", re.IGNORECASE
)
_SLUG_MARKER_LITERAL_RE = re.compile(r"^\(slug: [a-z0-9-]+\)$")
_SLUG_OPEN_RE = re.compile(r"\(\s*slug\b", re.IGNORECASE)


class MalformedSlugError(ValueError):
    """A trailing parenthetical looked like an authored ``(slug: ...)``
    marker but was not the exact literal form -- refused at parse time
    rather than silently treated as absent, since a typo here would
    otherwise fall back to a different, unannounced identity."""


class DuplicateSlugError(ValueError):
    """Two sessions or two steps within one session declared the same
    authored slug -- refused rather than silently disambiguated, since a
    silently renamed slug breaks the one-identity promise across
    the session plan, activity-log.json and the plan's step_id."""


def split_slug_marker(text: str) -> tuple:
    """Split a trailing ``(slug: xxx)`` marker off a session heading or a
    step's own text. A session *set* already carries a short, hand-picked
    label beside its number in its own directory name (``NNN-slug``); this
    is the same model applied one level down, minus the restated ordinal
    -- the number staying the stable address, the slug staying the
    readable one. Returns ``(text, None)`` unchanged when nothing declares
    a marker, so a spec that names none parses exactly as it always has.
    Anything that merely *looks* like an attempted marker -- wrong case,
    a missing colon, an invalid slug charset, or a missing closing
    parenthesis -- raises :class:`MalformedSlugError` rather than being
    silently read as no marker at all."""
    stripped = text.rstrip()
    m = _SLUG_MARKER_LOOSE_RE.search(stripped)
    if m:
        if not _SLUG_MARKER_LITERAL_RE.match(m.group(0)):
            raise MalformedSlugError(
                f"slug-like marker {m.group(0)!r} is not the literal "
                "'(slug: xxx)' form with xxx matching [a-z0-9-]+"
            )
        return stripped[:m.start()].rstrip(), m.group(1).strip()
    # An opening "(slug" with no closing ")" anywhere after it is an
    # unclosed marker, not ordinary prose that happens to mention one.
    last_open = None
    for candidate in _SLUG_OPEN_RE.finditer(stripped):
        last_open = candidate
    if last_open is not None and ")" not in stripped[last_open.start():]:
        raise MalformedSlugError(
            f"slug-like marker {stripped[last_open.start():]!r} is "
            "missing its closing ')'"
        )
    return text, None


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
    """``[{"number", "title", "slug", "steps"}, ...]`` from the plan.
    ``slug`` is the session's authored ``(slug: xxx)`` marker, or ``None``
    when the heading declares none. Two sessions declaring the same slug
    is refused here, at parse time, rather than left for a later reader
    to resolve however it likes."""
    stripped = _strip_fenced_blocks(spec_text)
    matches = list(_SESSION_HEAD_RE.finditer(stripped))
    plans = []
    seen_slugs: dict = {}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(stripped)
        title, slug = split_slug_marker(m.group(3).strip())
        number = int(m.group(1))
        if slug is not None:
            if slug in seen_slugs:
                raise DuplicateSlugError(
                    f"session slug {slug!r} is declared by both session "
                    f"{seen_slugs[slug]} and session {number}"
                )
            seen_slugs[slug] = number
        plans.append({
            "number": number,
            "title": title,
            "slug": slug,
            "steps": parse_step_texts(stripped[m.end():end]),
        })
    return plans


def extract_spec_excerpt(spec_text: str, session_number: int) -> str:
    """The one session's slice of the plan, falling back to the whole
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


_SET_CONFIG_RE = re.compile(
    r"^##\s+Session\s+Set\s+Configuration\s*$.*?^```(?:yaml|yml)?\s*$"
    r"(?P<body>.*?)^```\s*$",
    re.MULTILINE | re.DOTALL | re.IGNORECASE,
)


def parse_set_config(spec_text: str) -> dict:
    """The ``Session Set Configuration`` fenced YAML block as a mapping.

    Absent, unfenced, unparseable, or non-mapping content all yield ``{}``:
    the block is optional, and a spec that predates a key must keep
    working. Callers treat an unresolvable value as "not declared" and
    stay on their default path — never as a licence to guess."""
    match = _SET_CONFIG_RE.search(spec_text or "")
    if not match:
        return {}
    try:
        import yaml

        doc = yaml.safe_load(match.group("body"))
    except Exception:
        return {}
    return doc if isinstance(doc, dict) else {}


# --- start ------------------------------------------------------------------

def _discovery_warnings() -> list:
    """Stale-record warnings for the session about to start.

    Registration is the last moment before the work that a refresh may
    legitimately happen, and the first moment at which it may not: discovery
    runs between sessions, so the signal belongs here and the refresh does
    not. It warns and names the invocation; it never blocks, and it never
    refreshes. A staleness check that could fail a registration would be a
    maintenance signal capable of causing an outage, which is how maintenance
    signals get suppressed -- so any failure reading it leaves the session
    unblocked and silent.
    """
    try:
        from .config import load_config
        from .discovery import freshness_warnings

        return freshness_warnings(load_config())
    except Exception:
        return []


def start(
    sessions_dir, *, engine: str, provider=None, model=None, effort=None,
    session_number: Optional[int] = None, total_sessions=None,
) -> int:
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"start: not a directory: {sessions_path}", file=sys.stderr)
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
            sessions_path, worker_id=f"start_session/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"start: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        raw = read_raw_session_state(sessions_path)
        normalized = (
            derived_view(raw) if raw else None
        )
        completed = sorted(_completed_numbers(normalized))
        cancelled = _cancelled_numbers(normalized)
        current = (normalized or {}).get("currentSession")

        # A cancelled session is settled work, not a hole in the sequence:
        # the next session steps over it, and "next" is the first one still
        # available to run rather than one past the highest closed number.
        def _next_available(after: int) -> int:
            candidate = after
            while candidate in cancelled:
                candidate += 1
            return candidate

        requested = session_number
        if requested is None:
            requested = current if current is not None else _next_available(
                (max(completed) + 1) if completed else 1
            )

        # The boundary triad.
        if current is not None and requested != current:
            print(
                f"start: refused -- session {session_display_number(current)} is "
                f"still in flight "
                f"(completedSessions={completed}). Close session "
                f"{session_display_number(current)} before starting session "
                f"{session_display_number(requested)}.", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if requested in set(completed):
            print(
                f"start: refused -- session {session_display_number(requested)} is "
                f"already closed "
                f"(completedSessions={completed}). Sessions are never "
                "re-opened.", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if requested in cancelled:
            print(
                f"start: refused -- session {session_display_number(requested)} is "
                f"cancelled. "
                "Starting it would erase the cancellation and the reason "
                f"for it; restore it first: python -m ai_router.session "
                f"restore {requested}", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if current is None:
            expected = _next_available(
                (max(completed) + 1) if completed else 1
            )
            if requested != expected:
                print(
                    f"start: refused -- session {session_display_number(requested)} is "
                    f"not the next "
                    f"sequential session (expected {expected}; "
                    f"completedSessions={completed}). Close the intervening "
                    "sessions first.", file=sys.stderr,
                )
                return EXIT_BOUNDARY

        state = register_session_start(
            sessions_path, requested, engine=engine, provider=provider,
            model=model, effort=effort, total_sessions=total_sessions,
        )
        seeded = seed_session_plan(
            sessions_path, requested,
            total_sessions=len(state.get("sessions") or []),
        )

        log = read_activity_log(sessions_path) or {}
        mine = [
            e for e in log.get("entries", [])
            if isinstance(e, dict) and e.get("sessionNumber") == requested
        ]
        plan_rows = [e for e in mine if e.get("kind") == "plan-step"]
        logged_keys = {e.get("stepKey") for e in mine if is_logged_step(e)}
        # This call IS the register step; the machine records what it did
        # rather than asking the engine to report it (and pick a key).
        reg = next(
            (r for r in plan_rows if r.get("stepKey") == "register"), None
        )
        if reg is not None and "register" not in logged_keys:
            log_step(
                sessions_path, requested, "register",
                f"Registered session {requested} ({engine}).", "complete",
                step_number=reg.get("stepNumber"),
            )

        print(
            f"start: session {session_display_number(requested)} of "
            f"{sessions_path.name} registered "
            f"({engine}); {seeded} plan step(s) seeded."
        )
        for line in _discovery_warnings():
            print(line)
        if plan_rows:
            # The engine cannot guess these derived slugs; a step logged
            # under any other key (and no stepNumber) lands as a NEW row
            # instead of ticking the planned one.
            print(
                "plan steps -- log each with this stepKey (or at least "
                "its stepNumber) to tick the planned row:"
            )
            for r in plan_rows:
                print(f"  {r.get('stepNumber')}. {r.get('stepKey')}")
        if read_task_declaration(sessions_path, requested) is None:
            # Step (a) of the lifecycle. Said here because the declaration
            # has to precede the work to mean anything -- a session that
            # declares itself releasable after building is a model deciding
            # in hindsight what may be published.
            print(
                f"This session has not declared its task list. Before the "
                f"edits:\n  python -m ai_router.session declare "
                f"--sessions-dir {sessions_path} \\\n"
                "      --task \"<what this session will do>\" "
                "--releasable|--not-releasable"
            )
        print(
            "Next, once the edits are made:\n"
            f"  python -m ai_router.affected --sessions-dir {sessions_path}\n"
            "It prints the tests this change makes necessary and the exact "
            "command to run. The complete suite is not accepted before "
            "verification -- it is the run of record, and it comes after the "
            "final verified tree."
        )
        return EXIT_OK
    finally:
        release_lock(lock)


# --- log --------------------------------------------------------------------

def _plan_rows_for(entries, session_number: int) -> list:
    return [
        e for e in entries
        if isinstance(e, dict) and e.get("sessionNumber") == session_number
        and e.get("kind") == "plan-step"
    ]


def _resolve_plan_row(step: str, plan_rows: list):
    """The planned row *step* addresses, by exact stepKey or by stepNumber.
    Exact only: a near-miss that resolved by similarity would tick a row
    the caller did not mean, which is worse than refusing."""
    token = (step or "").strip()
    if not token:
        return None
    for row in plan_rows:
        if row.get("stepKey") == token:
            return row
    if token.isdigit():
        number = int(token)
        for row in plan_rows:
            if row.get("stepNumber") == number:
                return row
    return None


def log(sessions_dir, *, step: str, status: str, note=None,
        session_number: Optional[int] = None) -> int:
    """Record one plan step's status. The step must resolve against the
    rows ``start`` seeded: an unresolvable key refuses rather than
    appending an orphan row nobody planned, and the closed status
    vocabulary is enforced here as well as at the writer."""
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"log: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    if status not in STEP_STATUSES:
        print(
            f"log: refused -- status must be one of "
            f"{', '.join(STEP_STATUSES)}; got {status!r}.", file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        lock = acquire_lock_with_timeout(
            sessions_path, worker_id=f"log_step/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"log: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        raw = read_raw_session_state(sessions_path)
        normalized = (
            derived_view(raw) if raw else None
        )
        target = session_number
        if target is None:
            current = (normalized or {}).get("currentSession")
            completed = sorted(_completed_numbers(normalized))
            # The close-out step is logged after `close`, when nothing is
            # in flight; the last closed session is still the right home
            # for it.
            target = current if current is not None else (
                max(completed) if completed else None
            )
        if target is None:
            print(
                f"log: refused -- no session has been started under "
                f"{sessions_path}. Run `session start` first.", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        activity = read_activity_log(sessions_path) or {}
        entries = [
            e for e in activity.get("entries", []) if isinstance(e, dict)
        ]
        plan_rows = _plan_rows_for(entries, target)
        if not plan_rows:
            print(
                f"log: refused -- session {session_display_number(target)} of "
                f"{sessions_path.name} has no "
                "seeded plan rows to log against. Run `session start` "
                "first.", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        row = _resolve_plan_row(step, plan_rows)
        if row is None:
            known = "\n".join(
                f"  {r.get('stepNumber')}. {r.get('stepKey')}"
                for r in plan_rows
            )
            print(
                f"log: refused -- {step!r} is not a plan step of session "
                f"{target}. Use one of these stepKeys or its number "
                f"(no orphan row was written):\n{known}", file=sys.stderr,
            )
            return EXIT_USAGE

        key = row.get("stepKey")
        description = note if note else (row.get("description") or key)
        prior = [
            e for e in entries
            if e.get("sessionNumber") == target and e.get("stepKey") == key
            and is_logged_step(e)
        ]
        if (prior and prior[-1].get("status") == status
                and (prior[-1].get("description") or "") == description):
            print(
                f"log: step {key} of session {session_display_number(target)} is "
                f"already {status} "
                "(noop)."
            )
            return EXIT_OK

        log_step(sessions_path, target, key, description, status,
                 step_number=row.get("stepNumber"))
        print(
            f"log: session {session_display_number(target)} step "
            f"{row.get('stepNumber')} "
            f"({key}) -> {status}."
        )
        return EXIT_OK
    finally:
        release_lock(lock)


# --- the two files ----------------------------------------------------------

def _resolve_target_session(sessions_path, session_number):
    """The session a decision or declaration belongs to: the one in
    flight, else the last closed one, else refuse."""
    if session_number is not None:
        return session_number
    raw = read_raw_session_state(sessions_path)
    normalized = (
        derived_view(raw) if raw else None
    )
    current = (normalized or {}).get("currentSession")
    if current is not None:
        return current
    completed = sorted(_completed_numbers(normalized))
    return max(completed) if completed else None


def _read_body(text, path):
    """Prose arrives inline or from a file (``-`` is stdin), because a
    decision that fits on a command line is usually not one."""
    if text is not None:
        return text
    if path is None:
        raise SanctionedWriteError("supply the text inline or from a file")
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def decision(sessions_dir, *, decider: str, headline: str, body=None,
             body_file=None, model=None, provider=None, decided_on=None,
             backfill_reason=None, session_number=None) -> int:
    """Append one decision to the log, at the moment it occurs."""
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"decision: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    target = _resolve_target_session(sessions_path, session_number)
    if target is None:
        print(
            f"decision: refused -- no session has been started under "
            f"{sessions_path}. Run `session start` first.", file=sys.stderr,
        )
        return EXIT_BOUNDARY
    try:
        text = _read_body(body, body_file)
    except (OSError, UnicodeError) as exc:
        print(f"decision: cannot read body -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    except SanctionedWriteError as exc:
        print(f"decision: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock_with_timeout(
            sessions_path, worker_id=f"decision/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"decision: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        entry = append_decision(
            sessions_path, session_number=target, decider=decider,
            headline=headline, body=text, model=model, provider=provider,
            decided_on=decided_on, backfill_reason=backfill_reason,
        )
    except SanctionedWriteError as exc:
        print(f"decision: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(
        f"decision: {entry['decisionId']} recorded for session "
        f"{session_display_number(target)} "
        f"({entry['decider']})."
    )
    return EXIT_OK


def declare(sessions_dir, *, task=None, task_file=None, releasable=None,
            session_number=None) -> int:
    """Declare the session's task list and whether it may publish."""
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"declare: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    target = _resolve_target_session(sessions_path, session_number)
    if target is None:
        print(
            f"declare: refused -- no session has been started under "
            f"{sessions_path}. Run `session start` first.", file=sys.stderr,
        )
        return EXIT_BOUNDARY
    try:
        text = _read_body(task, task_file)
    except (OSError, UnicodeError) as exc:
        print(f"declare: cannot read task -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    except SanctionedWriteError as exc:
        print(f"declare: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock_with_timeout(
            sessions_path, worker_id=f"declare/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"declare: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        declare_session_task(
            sessions_path, session_number=target, task=text,
            releasable=releasable,
        )
    except SanctionedWriteError as exc:
        print(f"declare: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(
        f"declare: session {session_display_number(target)} declared; releasable="
        f"{'yes' if releasable else 'no'}."
    )
    return EXIT_OK


def plan(sessions_dir, *, body=None, body_file=None) -> int:
    """Record the plan prose the numbered session list hangs off."""
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"plan: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        text = _read_body(body, body_file)
    except (OSError, UnicodeError) as exc:
        print(f"plan: cannot read body -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    except SanctionedWriteError as exc:
        print(f"plan: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock_with_timeout(
            sessions_path, worker_id=f"plan/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"plan: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        record_project_plan(sessions_path, text)
    except SanctionedWriteError as exc:
        print(f"plan: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(f"plan: recorded; {sessions_path.name}/project-work-plan.md rewritten.")
    return EXIT_OK


# --- close ------------------------------------------------------------------

def _local_only(repo_root) -> bool:
    return os.path.isfile(os.path.join(repo_root, ".dabbler", "local-only"))


def close(sessions_dir, *, dry_run: bool = False, forced: bool = False) -> int:
    from .gates import SET_BOOKKEEPING_COMMIT_BASENAMES, run_gates
    from .ledger import latest_round

    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"close: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(sessions_path, worker_id=f"close_session/{os.getpid()}")
    except LockContentionError as exc:
        print(f"close: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(sessions_path)
        normalized = (
            derived_view(raw) if raw else None
        )
        current = (normalized or {}).get("currentSession")
        if current is None:
            status = (normalized or {}).get("status")
            if status == STATUS_COMPLETE:
                print("close: already closed (noop).")
                return EXIT_OK
            print(
                f"close: refused -- no session is in flight under "
                f"{sessions_path} (status={status!r}).", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        results = run_gates(sessions_path, forced=forced)
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

        repo_root = repo_root_for(sessions_path)
        verdict = None
        if repo_root:
            row = latest_round(repo_root, current)
            if row:
                verdict = row.get("verdict")

        flip_state_to_closed(sessions_path, verdict=verdict, forced=forced)
        print(f"close: session {session_display_number(current)} of "
              f"{sessions_path.name} closed"
              + (f" ({verdict})" if verdict else "") + ".")

        if repo_root:
            bookkeeping = [
                str(sessions_path / name)
                for name in SET_BOOKKEEPING_COMMIT_BASENAMES
                if (sessions_path / name).is_file()
            ]
            if bookkeeping:
                run_git(repo_root, "add", "--", *bookkeeping)
            rc, _, err = run_git(
                repo_root, "commit", "-m",
                f"Close session {current} of {sessions_path.name}",
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


# --- migrate (a set-scoped repository, carried forward exactly once) ---------

_MIGRATED_FILES = (
    ("activity-log.json", "activity-log.json"),
    ("change-log.md", "change-log.md"),
    ("decisions-log.md", "decisions-log.md"),
    ("project-work-plan.md", "project-work-plan.md"),
    ("spec.md", "session-plan.md"),
)


def _v5_sessions_from_legacy(normalized: dict) -> list:
    """The legacy ledger as v5 session records.

    A cancelled set becomes cancelled sessions. That is the only honest
    reading: the set said this work would not run, and after the collapse
    there is nowhere but the session to say so.
    """
    set_cancelled = (
        canonicalize_status(normalized.get("status")) == STATUS_CANCELLED
    )
    sessions = []
    for entry in normalized.get("sessions") or []:
        record = {
            "number": entry.get("number"),
            "title": entry.get("title") or f"Session {entry.get('number')}",
            "status": canonicalize_status(entry.get("status")),
        }
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict", "verification", "type"):
            if entry.get(key) is not None:
                record[key] = entry[key]
        record.setdefault("startedAt", None)
        record.setdefault("completedAt", None)
        record.setdefault("orchestrator", None)
        record.setdefault("verificationVerdict", None)
        if set_cancelled and record["status"] != STATUS_COMPLETE:
            record["preCancelStatus"] = record["status"]
            record["status"] = STATUS_CANCELLED
        sessions.append(record)
    return sessions


def migrate(legacy_set_dir, sessions_dir, *, dry_run: bool = False) -> int:
    """Carry one set-scoped directory forward into the repository's
    sessions root.

    Run once, and refused once the root carries a record: a second
    migration would fold a second set's numbering over the first, and two
    sets' session 3 are not the same session. Everything it writes it
    writes through the sanctioned writer, so the state-writes ledger
    covers the migrated file exactly as it covers a registration.
    """
    legacy = Path(legacy_set_dir)
    sessions_path = Path(sessions_dir)
    if not legacy.is_dir():
        print(f"migrate: not a directory: {legacy}", file=sys.stderr)
        return EXIT_USAGE
    raw = read_raw_legacy_state(legacy)
    if raw is None:
        print(f"migrate: no session-state.json under {legacy}",
              file=sys.stderr)
        return EXIT_USAGE
    if read_raw_session_state(sessions_path) is not None:
        print(
            f"migrate: refused -- {sessions_path} already carries a session "
            "record. A repository is migrated once; a second set folded "
            "over the first would renumber work that is already closed.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    normalized = normalize_legacy_state(raw, legacy / "spec.md")
    sessions = _v5_sessions_from_legacy(normalized)
    if not sessions:
        print(f"migrate: {legacy} declares no sessions", file=sys.stderr)
        return EXIT_USAGE
    state = {"schemaVersion": SCHEMA_VERSION, "sessions": sessions}
    if "forceClosed" in raw:
        state["forceClosed"] = raw["forceClosed"]

    repo_root = repo_root_for(sessions_path.parent) or repo_root_for(legacy)
    runs_from = (
        Path(repo_root) / RUNS_DIRNAME / legacy.name if repo_root else None
    )
    moves = [
        (legacy / src, sessions_path / dst)
        for src, dst in _MIGRATED_FILES if (legacy / src).is_file()
    ]

    if dry_run:
        print(json.dumps({
            "sessions": len(sessions),
            "files": [str(dst.relative_to(sessions_path)) for _, dst in moves],
            "runs": str(runs_from) if runs_from and runs_from.is_dir() else None,
        }, indent=2))
        return EXIT_OK

    sessions_path.mkdir(parents=True, exist_ok=True)
    for src, dst in moves:
        shutil.copy2(src, dst)
    # The ledger moves with the sessions it describes: rounds recorded
    # under the old address are the same rounds, and leaving them behind
    # would make every migrated session look unverified.
    if runs_from is not None and runs_from.is_dir():
        runs_to = Path(repo_root) / RUNS_DIRNAME
        for entry in runs_from.iterdir():
            target = runs_to / entry.name
            if target.exists():
                continue
            shutil.move(str(entry), str(target))
        try:
            runs_from.rmdir()
        except OSError:
            pass
    try:
        _validate_and_write_state(sessions_path, state)
    except SessionStateInvariantError as exc:
        print(f"migrate: refused -- {exc}", file=sys.stderr)
        return EXIT_GATE_FAILED
    print(json.dumps({
        "sessions": len(sessions),
        "sessionsDir": str(sessions_path),
    }))
    return EXIT_OK


# --- cancel / restore --------------------------------------------------------

_RESTORABLE_STATUSES = (STATUS_NOT_STARTED, STATUS_IN_PROGRESS,
                        STATUS_COMPLETE)


def _session_record(state: dict, number: int):
    for record in state.get("sessions") or []:
        if isinstance(record, dict) and record.get("number") == number:
            return record
    return None


def cancel(sessions_dir, session_number: int, *, reason: str,
           force: bool = False) -> int:
    """Cancel one session. A repository has no set to cancel, so what is
    cancelled is the piece of work, and the reason rides on the session
    record rather than in a marker file beside it."""
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"cancel: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(sessions_path, worker_id=f"cancel/{os.getpid()}")
    except LockContentionError as exc:
        print(f"cancel: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(sessions_path)
        if raw is None:
            print(f"cancel: no session record under {sessions_path}",
                  file=sys.stderr)
            return EXIT_USAGE
        state = _on_disk_state(sessions_path, raw)
        record = _session_record(state, session_number)
        if record is None:
            print(f"cancel: no session {session_display_number(session_number)} "
                  "on record",
                  file=sys.stderr)
            return EXIT_USAGE
        prior = canonicalize_status(record.get("status"))
        if prior == STATUS_CANCELLED:
            print(f"cancel: session {session_display_number(session_number)} is "
                  "already cancelled",
                  file=sys.stderr)
            return EXIT_BOUNDARY
        if prior == STATUS_IN_PROGRESS and not force:
            print(
                f"cancel: refused -- session {session_display_number(session_number)} "
                f"is in flight. "
                "Close it first, or pass --force.",
                file=sys.stderr,
            )
            return EXIT_BOUNDARY
        if prior in _RESTORABLE_STATUSES:
            record["preCancelStatus"] = prior
        record["status"] = STATUS_CANCELLED
        record["cancelledReason"] = reason
        record["cancelledAt"] = _now_iso_seconds()
        try:
            _validate_and_write_state(sessions_path, state)
        except SessionStateInvariantError as exc:
            print(f"cancel: refused -- {exc}", file=sys.stderr)
            return EXIT_GATE_FAILED
        print(json.dumps({
            "session": session_number, "status": STATUS_CANCELLED,
        }))
        return EXIT_OK
    finally:
        release_lock(lock)


def restore(sessions_dir, session_number: int, *, reason: str = "") -> int:
    sessions_path = Path(sessions_dir)
    if not sessions_path.is_dir():
        print(f"restore: not a directory: {sessions_path}", file=sys.stderr)
        return EXIT_USAGE
    try:
        lock = acquire_lock(sessions_path, worker_id=f"restore/{os.getpid()}")
    except LockContentionError as exc:
        print(f"restore: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    try:
        raw = read_raw_session_state(sessions_path)
        if raw is None:
            print(f"restore: no session record under {sessions_path}",
                  file=sys.stderr)
            return EXIT_USAGE
        state = _on_disk_state(sessions_path, raw)
        record = _session_record(state, session_number)
        if record is None:
            print(f"restore: no session {session_display_number(session_number)} "
                  "on record",
                  file=sys.stderr)
            return EXIT_USAGE
        if canonicalize_status(record.get("status")) != STATUS_CANCELLED:
            print(
                f"restore: refused -- session "
                f"{session_display_number(session_number)} is not "
                "cancelled; there is nothing to restore.", file=sys.stderr,
            )
            return EXIT_BOUNDARY
        prior = record.pop("preCancelStatus", None)
        if prior not in _RESTORABLE_STATUSES:
            prior = STATUS_NOT_STARTED
        record["status"] = prior
        record.pop("cancelledReason", None)
        record.pop("cancelledAt", None)
        if reason:
            record["restoredReason"] = reason
        try:
            _validate_and_write_state(sessions_path, state)
        except SessionStateInvariantError as exc:
            print(f"restore: refused -- {exc}", file=sys.stderr)
            return EXIT_GATE_FAILED
        print(json.dumps({"session": session_number, "status": prior}))
        return EXIT_OK
    finally:
        release_lock(lock)


# --- CLI --------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_router.session")
    sub = parser.add_subparsers(dest="command", required=True)

    def with_root(p):
        # Not a selector. A repository has one sessions root, so this only
        # exists for a caller standing outside the tree.
        p.add_argument("--sessions-dir",
                       help="the repository's sessions root; derived from "
                            "the working directory when omitted")
        return p

    p_start = with_root(sub.add_parser("start", help="register a session start"))
    p_start.add_argument("--engine", required=True)
    p_start.add_argument("--provider")
    p_start.add_argument("--model")
    p_start.add_argument("--effort")
    p_start.add_argument("--session-number", type=int)
    p_start.add_argument("--total-sessions", type=int)

    p_log = with_root(sub.add_parser(
        "log", help="record a plan step's status in activity-log.json"
    ))
    p_log.add_argument("--step", required=True,
                       help="the plan row's stepKey, or its stepNumber")
    p_log.add_argument("--status", required=True, choices=list(STEP_STATUSES))
    p_log.add_argument("--note",
                       help="description to record instead of the plan's "
                            "wording for the step")
    p_log.add_argument("--session-number", type=int,
                       help="defaults to the in-flight session, or the last "
                            "closed one when none is in flight")

    p_decision = with_root(sub.add_parser(
        "decision", help="append a decision to decisions-log.md"
    ))
    p_decision.add_argument("--decider", required=True, choices=list(DECIDERS),
                            help="who made it")
    p_decision.add_argument("--headline", required=True,
                            help="what was decided, in one line")
    body_src = p_decision.add_mutually_exclusive_group(required=True)
    body_src.add_argument("--body", help="why, inline")
    body_src.add_argument("--body-file", help="why, from a file ('-'=stdin)")
    p_decision.add_argument("--model", help="the deciding model, if any")
    p_decision.add_argument("--provider", help="its vendor, if any")
    p_decision.add_argument("--decided-on",
                            help="ISO date; only with --backfill-reason")
    p_decision.add_argument("--backfill-reason",
                            help="why this is a transcription rather than a "
                                 "live append; required with --decided-on")
    p_decision.add_argument("--session-number", type=int)

    p_declare = with_root(sub.add_parser(
        "declare", help="declare the session's task list and releasability"
    ))
    task_src = p_declare.add_mutually_exclusive_group(required=True)
    task_src.add_argument("--task", help="what this session will do")
    task_src.add_argument("--task-file", help="the same, from a file")
    rel = p_declare.add_mutually_exclusive_group(required=True)
    rel.add_argument("--releasable", dest="releasable", action="store_true",
                     help="this session may publish a package")
    rel.add_argument("--not-releasable", dest="releasable",
                     action="store_false", help="it may not")
    p_declare.add_argument("--session-number", type=int)

    p_plan = with_root(sub.add_parser(
        "plan", help="record the plan prose in project-work-plan.md"
    ))
    plan_src = p_plan.add_mutually_exclusive_group(required=True)
    plan_src.add_argument("--body", help="the plan, inline")
    plan_src.add_argument("--body-file", help="the plan, from a file")

    p_close = with_root(sub.add_parser(
        "close", help="run gates and close the session"
    ))
    p_close.add_argument("--dry-run", action="store_true",
                         help="run the gates read-only and print the rows")
    p_close.add_argument("--force", action="store_true",
                         help="bypass bookkeeping gates, never evidence; "
                              "stamps forceClosed")

    p_cancel = with_root(sub.add_parser("cancel", help="cancel one session"))
    p_cancel.add_argument("session_number", type=int)
    p_cancel.add_argument("--reason", required=True,
                          help="recorded on the session")
    p_cancel.add_argument("--force", action="store_true",
                          help="cancel even while the session is in flight")

    p_restore = with_root(sub.add_parser(
        "restore", help="restore a cancelled session"
    ))
    p_restore.add_argument("session_number", type=int)
    p_restore.add_argument("--reason", default="",
                           help="recorded on the session")

    p_migrate = with_root(sub.add_parser(
        "migrate", help="fold a legacy session-set directory into the "
                        "repository's sessions root"
    ))
    p_migrate.add_argument("legacy_set_dir",
                           help="the docs/session-sets/<NNN-slug> directory "
                                "to carry forward")
    p_migrate.add_argument("--dry-run", action="store_true",
                           help="report what would move and write nothing")

    args = parser.parse_args(argv)
    try:
        sessions_dir = resolve_sessions_dir(args.sessions_dir)
    except SessionsRootNotFoundError as exc:
        print(f"session: {exc}", file=sys.stderr)
        return EXIT_USAGE

    if args.command == "migrate":
        return migrate(args.legacy_set_dir, sessions_dir, dry_run=args.dry_run)
    if args.command == "start":
        return start(
            sessions_dir, engine=args.engine, provider=args.provider,
            model=args.model, effort=args.effort,
            session_number=args.session_number,
            total_sessions=args.total_sessions,
        )
    if args.command == "cancel":
        return cancel(sessions_dir, args.session_number, reason=args.reason,
                      force=args.force)
    if args.command == "restore":
        return restore(sessions_dir, args.session_number, reason=args.reason)
    if args.command == "log":
        return log(
            sessions_dir, step=args.step, status=args.status, note=args.note,
            session_number=args.session_number,
        )
    if args.command == "decision":
        return decision(
            sessions_dir, decider=args.decider, headline=args.headline,
            body=args.body, body_file=args.body_file, model=args.model,
            provider=args.provider, decided_on=args.decided_on,
            backfill_reason=args.backfill_reason,
            session_number=args.session_number,
        )
    if args.command == "declare":
        return declare(
            sessions_dir, task=args.task, task_file=args.task_file,
            releasable=args.releasable, session_number=args.session_number,
        )
    if args.command == "plan":
        return plan(sessions_dir, body=args.body, body_file=args.body_file)
    return close(sessions_dir, dry_run=args.dry_run, forced=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
