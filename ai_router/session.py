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
    RESTORED_FILENAME,
    SCHEMA_VERSION,
    STEP_STATUSES,
    _completed_numbers,
    _now_iso,
    _now_iso_seconds,
    _prepend_history_entry,
    _v4_on_disk_state,
    _validate_and_write_state,
    _write_text_lf,
    append_change_log_block,
    build_orchestrator_block,
    flip_state_to_closed,
    log_step,
    plan_step_key,
    record_session_verification,
    register_session_start,
    seed_session_plan,
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
    return close(set_dir, dry_run=args.dry_run, forced=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
