"""The run journal: the one authority for what happened in a repository.

``.dabbler/journal.jsonl`` is append-only, fsynced per append, and serialized
through ``.dabbler/journal.lock``. Every other view — the projection, the four
set documents, the Explorer tree — is a fold of this file and may be thrown
away and rebuilt at any time. Nothing here is ever hand-edited, and no caller
supplies a sequence or a timestamp: the writer stamps both under the lock, so
a clock a caller controls can never reorder the record.

Two failure shapes are deliberately distinguished. A torn final line is the
ordinary crash: the process died between writing bytes and writing the
newline, and the next writer repairs it. Invalid JSON or a sequence gap
anywhere earlier is corruption of a durable record, and every reader fails
closed on it rather than presenting a partial history as the truth.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import jsonschema

from .evidence import run_git
from .ledger import MACHINE_DIRNAME, RUNS_DIRNAME

SCHEMA_VERSION = 1

JOURNAL_FILENAME = "journal.jsonl"
LOCK_FILENAME = "journal.lock"
PROJECTION_FILENAME = "run-projection.json"
HEARTBEAT_FILENAME = "heartbeat.json"

# The lock is held for the duration of one append plus its projection write,
# which is milliseconds. A holder older than this died without releasing.
STALE_LOCK_TTL_SECONDS = 600
LOCK_WAIT_SECONDS = 30.0

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "run-event.schema.json"

ACTOR_AGENT = "agent"
ACTOR_OPERATOR = "operator"
ACTOR_FRAMEWORK = "framework"


class JournalError(RuntimeError):
    """Something is wrong with the journal itself."""


class JournalCorrupt(JournalError):
    """A durable record is unreadable. Never repaired automatically: a
    reader that guesses past this is inventing history."""


class LockContentionError(JournalError):
    pass


# --- Control root -----------------------------------------------------------

def control_root(start=None) -> str:
    """The main worktree's repository root — the one owner of ``.dabbler/``.

    Linked worktrees resolve to the same root, so a run prepared in a
    worktree writes to the same journal and the same run-id counter as the
    main tree. Git identifying no single main worktree is a refusal, not a
    guess at which of several roots is canonical.
    """
    origin = Path(start) if start is not None else Path.cwd()
    rc, out, err = run_git(origin, "worktree", "list", "--porcelain")
    if rc != 0:
        raise JournalError(
            f"cannot resolve the control root from {origin}: "
            f"git worktree list failed ({err or rc})"
        )
    roots = [
        line[len("worktree "):].strip()
        for line in out.splitlines()
        if line.startswith("worktree ")
    ]
    if not roots:
        raise JournalError(
            f"cannot resolve the control root from {origin}: git named no "
            "worktree"
        )
    return str(Path(roots[0]).resolve())


def repository_id(root) -> str:
    """``sha256:<hex>`` over the repository's root commit.

    Stable for the life of the repository and identical in every linked
    worktree, which is what makes one journal legitimately shared. A
    repository with no commits has no such identity and is refused rather
    than given a placeholder that would change under it later.
    """
    rc, out, _ = run_git(root, "rev-list", "--max-parents=0", "--all")
    commits = sorted(line.strip() for line in out.splitlines() if line.strip())
    if rc != 0 or not commits:
        raise JournalError(
            f"{root} has no commits, so it has no stable repository id. "
            "Make the initial commit before registering a run."
        )
    return "sha256:" + hashlib.sha256(commits[0].encode("utf-8")).hexdigest()


def worktree_id(path) -> str:
    """Absolute path, forward slashes — the same string on both platforms."""
    return str(Path(path).resolve()).replace("\\", "/")


def machine_dir(root) -> Path:
    return Path(root) / MACHINE_DIRNAME


def journal_path(root) -> Path:
    return machine_dir(root) / JOURNAL_FILENAME


def projection_path(root) -> Path:
    return machine_dir(root) / PROJECTION_FILENAME


def run_dir(root, run_id: str) -> Path:
    return Path(root) / RUNS_DIRNAME / run_id


# --- Time -------------------------------------------------------------------

def now_iso() -> str:
    """Local time with an explicit offset, milliseconds. Written only here:
    an event's clock belongs to the writer, never to its caller."""
    return (
        datetime.datetime.now()
        .astimezone()
        .isoformat(timespec="milliseconds")
    )


# --- The lock ---------------------------------------------------------------

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
    age = (datetime.datetime.now(acquired.tzinfo) - acquired).total_seconds()
    if age >= STALE_LOCK_TTL_SECONDS:
        return True
    return not _pid_running(pid)


class journal_lock:
    """Atomic ``O_CREAT|O_EXCL`` create with one stale reclaim, waiting up to
    :data:`LOCK_WAIT_SECONDS` for a live holder. Appends are frequent and
    short, so contention is normal and waiting is right; a holder that died
    mid-append is reclaimed rather than blocking the repository forever."""

    def __init__(self, root, wait_seconds: float = LOCK_WAIT_SECONDS):
        self.path = machine_dir(root) / LOCK_FILENAME
        self.wait_seconds = wait_seconds

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        record = json.dumps(
            {"pid": os.getpid(), "acquired_at": now_iso()}, indent=2
        ) + "\n"
        deadline = time.monotonic() + self.wait_seconds
        reclaimed = False
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(record)
                return self
            except FileExistsError:
                if not reclaimed and _lock_is_stale(self.path):
                    reclaimed = True
                    try:
                        self.path.unlink()
                    except OSError:
                        pass
                    continue
                if time.monotonic() >= deadline:
                    raise LockContentionError(
                        f"another writer holds {self.path}"
                    )
                time.sleep(0.02)

    def __exit__(self, *exc):
        try:
            self.path.unlink()
        except OSError:
            pass
        return False


# --- Schema -----------------------------------------------------------------

_schema_cache: dict = {}


def event_schema() -> dict:
    if "event" not in _schema_cache:
        _schema_cache["event"] = json.loads(
            _SCHEMA_PATH.read_text(encoding="utf-8")
        )
    return _schema_cache["event"]


def validate_event(event: dict, source: str = "<memory>") -> dict:
    """Fail closed on an unknown schema version before anything else: a
    future envelope must never be coerced into this one's shape."""
    version = event.get("schema_version") if isinstance(event, dict) else None
    if version != SCHEMA_VERSION:
        raise JournalCorrupt(
            f"{source}: run event declares schema_version {version!r}; this "
            f"router understands {SCHEMA_VERSION}. Upgrade the router rather "
            "than reading it as the current shape."
        )
    schema = event_schema()
    try:
        jsonschema.validate(event, schema)
    except jsonschema.ValidationError as exc:
        detail = _payload_detail(event, exc)
        raise JournalCorrupt(
            f"{source}: run event {event.get('event_type')!r} failed schema "
            f"validation: {detail}"
        ) from exc
    return event


def _payload_detail(event: dict, exc) -> str:
    """``oneOf`` reports only that nothing matched. Re-validate the payload
    against the one variant the event_type names, so the message points at
    the field that is actually wrong."""
    schema = event_schema()
    for variant in schema.get("oneOf", []):
        const = (
            variant.get("properties", {}).get("event_type", {}).get("const")
        )
        if const != event.get("event_type"):
            continue
        ref = variant["properties"]["payload"]["$ref"].rsplit("/", 1)[-1]
        sub = dict(schema["$defs"][ref])
        sub["$defs"] = schema["$defs"]
        try:
            jsonschema.validate(event.get("payload"), sub)
        except jsonschema.ValidationError as inner:
            location = "/".join(str(p) for p in inner.absolute_path) or "(payload)"
            return f"payload/{location}: {inner.message}"
        break
    location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
    return f"{location}: {exc.message}"


# --- Reading ----------------------------------------------------------------

def _split_records(raw: bytes, source: str):
    """``(records, repair)`` for the raw journal bytes.

    *repair* is ``None``, ``("newline", offset)`` for a complete final object
    that never got its newline, or ``("truncate", offset)`` for a torn final
    line. Only the final line may be unreadable; anything earlier is
    corruption and raises.
    """
    if not raw:
        return [], None
    trailing_newline = raw.endswith(b"\n")
    segments = raw.split(b"\n")
    if trailing_newline:
        segments = segments[:-1]

    records, offset = [], 0
    for index, segment in enumerate(segments):
        is_last = index == len(segments) - 1
        try:
            record = json.loads(segment.decode("utf-8"))
            if not isinstance(record, dict):
                raise ValueError("not a JSON object")
        except (ValueError, UnicodeDecodeError) as exc:
            if not is_last:
                raise JournalCorrupt(
                    f"{source}: line {index + 1} is not a valid journal "
                    f"record ({exc}). Only a torn final line is repairable; "
                    "a damaged earlier record is not recoverable here."
                ) from exc
            return records, ("truncate", offset)
        records.append(record)
        offset += len(segment) + 1

    if not trailing_newline:
        # A complete object whose newline never landed: keep it, and the
        # next writer terminates it before appending after it.
        return records, ("newline", offset - 1)
    return records, None


def _check_sequences(records: list, source: str) -> None:
    for index, record in enumerate(records):
        expected = index + 1
        actual = record.get("sequence")
        if actual != expected:
            raise JournalCorrupt(
                f"{source}: sequence {actual!r} at position {expected}; the "
                "journal is gap-free by construction, so a mismatch is a "
                "damaged or edited record."
            )


def read_events(root, *, after: Optional[int] = None, run_id=None,
                validate: bool = True) -> list:
    """Every readable event, in sequence order.

    A torn final line is ignored (the writer repairs it). *after* returns the
    contiguous suffix beginning at ``after + 1``; *run_id* filters after the
    contiguity check, so a filter can never hide a gap.
    """
    path = journal_path(root)
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return []
    records, _ = _split_records(raw, str(path))
    _check_sequences(records, str(path))
    if validate:
        for record in records:
            validate_event(record, str(path))
    if after is not None:
        records = [r for r in records if r["sequence"] > after]
    if run_id is not None:
        records = [r for r in records if r["run_id"] == run_id]
    return records


def tail_sequence(root) -> int:
    """The last stored sequence, or 0 for an empty/absent journal."""
    events = read_events(root, validate=False)
    return events[-1]["sequence"] if events else 0


# --- Writing ----------------------------------------------------------------

def _fsync_dir(path: Path) -> None:
    if os.name == "nt":
        return  # no directory fsync on Windows; the file fsync is the durability point
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _repair_and_append(path: Path, line: bytes, repair) -> None:
    with open(path, "r+b" if path.exists() else "w+b") as handle:
        if repair is not None:
            kind, offset = repair
            if kind == "truncate":
                handle.truncate(offset)
            else:  # a complete object missing only its newline
                handle.truncate(offset)
                handle.seek(offset)
                handle.write(b"\n")
            handle.flush()
            os.fsync(handle.fileno())
        handle.seek(0, os.SEEK_END)
        handle.write(line)
        handle.flush()
        os.fsync(handle.fileno())


def append(
    root,
    *,
    event_type: str,
    run_id: str,
    attempt: int,
    actor: dict,
    summary: str,
    payload: dict,
    artifact_refs=(),
    locked: bool = False,
) -> dict:
    """Stamp, validate, and durably append one event; return it.

    *locked* declares the caller already holds :class:`journal_lock` — the
    multi-event operations (create+start, guidance+resume) append under one
    lock so a reader can never observe half of them.
    """
    if locked:
        return _append_locked(
            root, event_type, run_id, attempt, actor, summary, payload,
            artifact_refs,
        )
    with journal_lock(root):
        return _append_locked(
            root, event_type, run_id, attempt, actor, summary, payload,
            artifact_refs,
        )


def _append_locked(root, event_type, run_id, attempt, actor, summary,
                   payload, artifact_refs) -> dict:
    path = journal_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        raw = b""
    records, repair = _split_records(raw, str(path))
    _check_sequences(records, str(path))

    event = {
        "schema_version": SCHEMA_VERSION,
        "sequence": len(records) + 1,
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "occurred_at": now_iso(),
        "repository_id": repository_id(root),
        "worktree_id": worktree_id(Path.cwd()),
        "run_id": run_id,
        "attempt": int(attempt),
        "actor": dict(actor),
        "summary": summary[:200],
        "artifact_refs": list(artifact_refs),
        "payload": payload,
    }
    validate_event(event, str(path))
    line = (
        json.dumps(event, ensure_ascii=False, sort_keys=True,
                   separators=(",", ":"))
        + "\n"
    ).encode("utf-8")
    _repair_and_append(path, line, repair)
    _fsync_dir(path.parent)
    return event


def actor(kind: str, id_: str, provider=None) -> dict:
    return {"kind": kind, "id": id_, "provider": provider}


# --- Atomic replace ---------------------------------------------------------

def atomic_write_json(path: Path, data: dict) -> None:
    """Temp file plus rename, so a reader sees the old document or the new
    one and never a half-written middle."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    body = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False)
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(body + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


# --- Heartbeat (§8.3) -------------------------------------------------------

def heartbeat_path(root, run_id: str) -> Path:
    return run_dir(root, run_id) / HEARTBEAT_FILENAME


def write_heartbeat(root, run_id: str, owner_id: str) -> None:
    """Liveness for a process that owns a real execution handle. Proves the
    owner is alive, never that it is making progress — progress is
    checkpoints and check events."""
    atomic_write_json(heartbeat_path(root, run_id), {
        "run_id": run_id,
        "owner_id": owner_id,
        "pid": os.getpid(),
        "beat_at": now_iso(),
    })


def read_heartbeat(root, run_id: str) -> Optional[dict]:
    try:
        return json.loads(
            heartbeat_path(root, run_id).read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        return None


def heartbeat_owner_alive(record) -> bool:
    """A heartbeat whose owner process is gone is a stopped heartbeat, not a
    live one — the file outlives the process that wrote it."""
    if not isinstance(record, dict):
        return False
    try:
        return _pid_running(int(record["pid"]))
    except (KeyError, TypeError, ValueError):
        return False


def clear_heartbeat(root, run_id: str) -> None:
    try:
        heartbeat_path(root, run_id).unlink()
    except OSError:
        pass
