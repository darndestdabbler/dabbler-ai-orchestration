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
import sys
import time
from pathlib import Path
from typing import Optional

from .evidence import repo_root_for, run_git
from .progress import (
    SessionStateInvariantError,
    STATUS_CANCELLED,
    STATUS_COMPLETE,
    STATUS_IN_PROGRESS,
    STATUS_NOT_STARTED,
    canonicalize_status,
    is_logged_step,
    normalize_to_v4_shape,
    read_activity_log,
    read_raw_session_state,
)
# Re-exported so the public surface stays importable from ai_router.session
# — callers address the lifecycle module; where a helper lives is an
# implementation detail.
from .writers import (  # noqa: F401
    CANCELLED_FILENAME,
    DECIDERS,
    RESTORED_FILENAME,
    SCHEMA_VERSION,
    STEP_STATUSES,
    SanctionedWriteError,
    _completed_numbers,
    _now_iso,
    _now_iso_seconds,
    _prepend_history_entry,
    _v4_on_disk_state,
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
    spec.md, activity-log.json and the plan's step_id."""


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
    """``[{"number", "title", "slug", "steps"}, ...]`` from spec.md.
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

        log = read_activity_log(set_path) or {}
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
                set_path, requested, "register",
                f"Registered session {requested} ({engine}).", "complete",
                step_number=reg.get("stepNumber"),
            )

        print(
            f"start: session {requested} of {set_path.name} registered "
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
        if read_task_declaration(set_path, requested) is None:
            # Step (a) of the lifecycle. Said here because the declaration
            # has to precede the work to mean anything -- a session that
            # declares itself releasable after building is a model deciding
            # in hindsight what may be published.
            print(
                f"This session has not declared its task list. Before the "
                f"edits:\n  python -m ai_router.session declare "
                f"--session-set-dir {set_path} \\\n"
                "      --task \"<what this session will do>\" "
                "--releasable|--not-releasable"
            )
        print(
            "Next, once the edits are made:\n"
            f"  python -m ai_router.affected --session-set-dir {set_path}\n"
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


def log(set_dir, *, step: str, status: str, note=None,
        session_number: Optional[int] = None) -> int:
    """Record one plan step's status. The step must resolve against the
    rows ``start`` seeded: an unresolvable key refuses rather than
    appending an orphan row nobody planned, and the closed status
    vocabulary is enforced here as well as at the writer."""
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"log: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    if status not in STEP_STATUSES:
        print(
            f"log: refused -- status must be one of "
            f"{', '.join(STEP_STATUSES)}; got {status!r}.", file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        lock = acquire_lock_with_timeout(
            set_path, worker_id=f"log_step/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"log: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        raw = read_raw_session_state(set_path)
        normalized = (
            normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
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
                f"{set_path}. Run `session start` first.", file=sys.stderr,
            )
            return EXIT_BOUNDARY

        activity = read_activity_log(set_path) or {}
        entries = [
            e for e in activity.get("entries", []) if isinstance(e, dict)
        ]
        plan_rows = _plan_rows_for(entries, target)
        if not plan_rows:
            print(
                f"log: refused -- session {target} of {set_path.name} has no "
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
                f"log: step {key} of session {target} is already {status} "
                "(noop)."
            )
            return EXIT_OK

        log_step(set_path, target, key, description, status,
                 step_number=row.get("stepNumber"))
        print(
            f"log: session {target} step {row.get('stepNumber')} "
            f"({key}) -> {status}."
        )
        return EXIT_OK
    finally:
        release_lock(lock)


# --- the two files ----------------------------------------------------------

def _resolve_target_session(set_path, session_number):
    """The session a decision or declaration belongs to: the one in
    flight, else the last closed one, else refuse."""
    if session_number is not None:
        return session_number
    raw = read_raw_session_state(set_path)
    normalized = (
        normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
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


def decision(set_dir, *, decider: str, headline: str, body=None,
             body_file=None, model=None, provider=None, decided_on=None,
             backfill_reason=None, session_number=None) -> int:
    """Append one decision to the log, at the moment it occurs."""
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"decision: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    target = _resolve_target_session(set_path, session_number)
    if target is None:
        print(
            f"decision: refused -- no session has been started under "
            f"{set_path}. Run `session start` first.", file=sys.stderr,
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
            set_path, worker_id=f"decision/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"decision: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        entry = append_decision(
            set_path, session_number=target, decider=decider,
            headline=headline, body=text, model=model, provider=provider,
            decided_on=decided_on, backfill_reason=backfill_reason,
        )
    except SanctionedWriteError as exc:
        print(f"decision: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(
        f"decision: {entry['decisionId']} recorded for session {target} "
        f"({entry['decider']})."
    )
    return EXIT_OK


def declare(set_dir, *, task=None, task_file=None, releasable=None,
            session_number=None) -> int:
    """Declare the session's task list and whether it may publish."""
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"declare: not a directory: {set_path}", file=sys.stderr)
        return EXIT_USAGE
    target = _resolve_target_session(set_path, session_number)
    if target is None:
        print(
            f"declare: refused -- no session has been started under "
            f"{set_path}. Run `session start` first.", file=sys.stderr,
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
            set_path, worker_id=f"declare/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"declare: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        declare_session_task(
            set_path, session_number=target, task=text,
            releasable=releasable,
        )
    except SanctionedWriteError as exc:
        print(f"declare: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(
        f"declare: session {target} declared; releasable="
        f"{'yes' if releasable else 'no'}."
    )
    return EXIT_OK


def plan(set_dir, *, body=None, body_file=None) -> int:
    """Record the plan prose the numbered session list hangs off."""
    set_path = Path(set_dir)
    if not set_path.is_dir():
        print(f"plan: not a directory: {set_path}", file=sys.stderr)
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
            set_path, worker_id=f"plan/{os.getpid()}"
        )
    except LockContentionError as exc:
        print(f"plan: refused -- lifecycle lock contention: {exc}",
              file=sys.stderr)
        return EXIT_LOCK_CONTENTION
    try:
        record_project_plan(set_path, text)
    except SanctionedWriteError as exc:
        print(f"plan: refused -- {exc}", file=sys.stderr)
        return EXIT_USAGE
    finally:
        release_lock(lock)
    print(f"plan: recorded; {set_path.name}/project-work-plan.md rewritten.")
    return EXIT_OK


# --- close ------------------------------------------------------------------

def _local_only(repo_root) -> bool:
    return os.path.isfile(os.path.join(repo_root, ".dabbler", "local-only"))


def close(set_dir, *, dry_run: bool = False, forced: bool = False) -> int:
    from .gates import SET_BOOKKEEPING_COMMIT_BASENAMES, run_gates
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
            bookkeeping = [
                str(set_path / name)
                for name in SET_BOOKKEEPING_COMMIT_BASENAMES
                if (set_path / name).is_file()
            ]
            if bookkeeping:
                run_git(repo_root, "add", "--", *bookkeeping)
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

_RESTORABLE_STATUSES = (STATUS_NOT_STARTED, STATUS_IN_PROGRESS,
                        STATUS_COMPLETE)


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

    p_log = sub.add_parser(
        "log", help="record a plan step's status in activity-log.json"
    )
    p_log.add_argument("--session-set-dir", required=True)
    p_log.add_argument("--step", required=True,
                       help="the plan row's stepKey, or its stepNumber")
    p_log.add_argument("--status", required=True, choices=list(STEP_STATUSES))
    p_log.add_argument("--note",
                       help="description to record instead of the spec's "
                            "wording for the step")
    p_log.add_argument("--session-number", type=int,
                       help="defaults to the in-flight session, or the last "
                            "closed one when none is in flight")

    p_decision = sub.add_parser(
        "decision", help="append a decision to decisions-log.md"
    )
    p_decision.add_argument("--session-set-dir", required=True)
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

    p_declare = sub.add_parser(
        "declare", help="declare the session's task list and releasability"
    )
    p_declare.add_argument("--session-set-dir", required=True)
    task_src = p_declare.add_mutually_exclusive_group(required=True)
    task_src.add_argument("--task", help="what this session will do")
    task_src.add_argument("--task-file", help="the same, from a file")
    rel = p_declare.add_mutually_exclusive_group(required=True)
    rel.add_argument("--releasable", dest="releasable", action="store_true",
                     help="this session may publish a package")
    rel.add_argument("--not-releasable", dest="releasable",
                     action="store_false", help="it may not")
    p_declare.add_argument("--session-number", type=int)

    p_plan = sub.add_parser(
        "plan", help="record the plan prose in project-work-plan.md"
    )
    p_plan.add_argument("--session-set-dir", required=True)
    plan_src = p_plan.add_mutually_exclusive_group(required=True)
    plan_src.add_argument("--body", help="the plan, inline")
    plan_src.add_argument("--body-file", help="the plan, from a file")

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
    if args.command == "log":
        return log(
            set_dir, step=args.step, status=args.status, note=args.note,
            session_number=args.session_number,
        )
    if args.command == "decision":
        return decision(
            set_dir, decider=args.decider, headline=args.headline,
            body=args.body, body_file=args.body_file, model=args.model,
            provider=args.provider, decided_on=args.decided_on,
            backfill_reason=args.backfill_reason,
            session_number=args.session_number,
        )
    if args.command == "declare":
        return declare(
            set_dir, task=args.task, task_file=args.task_file,
            releasable=args.releasable, session_number=args.session_number,
        )
    if args.command == "plan":
        return plan(set_dir, body=args.body, body_file=args.body_file)
    return close(set_dir, dry_run=args.dry_run, forced=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
