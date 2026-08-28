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

import contextlib
import datetime
import hashlib
import json
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

import jsonschema

SCHEMA_VERSION = 2

# Every machine record is anchored to a git object — the repository's
# identity, a run's base commit, a candidate tree — so the one place that
# shells out to git lives here, at the bottom of the run core. Nothing above
# this module runs a git command by any other route.
MACHINE_DIRNAME = ".dabbler"
RUNS_DIRNAME = f"{MACHINE_DIRNAME}/runs"


def is_machine_state_path(path) -> bool:
    """True for anything under the router's own ``.dabbler/`` directory.

    The one place that decides what is *the record of* a session rather
    than *the work of* one. A round is appended after the tree snapshot it
    describes, so counting the ledger as session content makes every
    verified session look like it drifted the instant it was verified.

    It lives here, at the bottom of the run core, because both halves of
    the framework need the same answer and the run core may not import the
    half the cutover deletes.
    """
    normalized = str(path).replace("\\", "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return (
        normalized == MACHINE_DIRNAME
        or normalized.startswith(MACHINE_DIRNAME + "/")
    )

JOURNAL_FILENAME = "journal.jsonl"
LOCK_FILENAME = "journal.lock"
PROJECTION_FILENAME = "run-projection.json"
HEARTBEAT_FILENAME = "heartbeat.json"

# The lock is held for the duration of one append plus its projection write,
# which is milliseconds. A holder older than this died without releasing.
STALE_LOCK_TTL_SECONDS = 600
LOCK_WAIT_SECONDS = 30.0
# How long an unreadable lock is presumed to be one still being written.
# The gap between creating the file and writing the record is microseconds;
# anything older than this is genuinely abandoned.
LOCK_BIRTH_GRACE_SECONDS = 10.0

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


# --- Git plumbing -----------------------------------------------------------

def run_git(repo_root, *args, env=None) -> tuple:
    """``(rc, stdout, stderr)``; a missing git binary is ``rc=127``."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), *args],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", env=env,
        )
    except FileNotFoundError:
        return 127, "", "git not available on PATH"
    # stdout drops only the newline framing: porcelain status columns are
    # positional, and the first line may legitimately begin with a space.
    return result.returncode, result.stdout.strip("\n"), result.stderr.strip()


def run_git_bytes(repo_root, *args) -> tuple:
    """``(rc, stdout)``, stdout as the exact bytes git wrote.

    The text form strips newline framing and decodes, which is right for
    porcelain and fatal for content: a blob's bytes are what a hash is
    taken over. Same spawn, same failure mode, one place to instrument.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), *args], capture_output=True,
        )
    except (FileNotFoundError, OSError):
        return 127, b""
    return result.returncode, result.stdout


def repo_root_for(path) -> Optional[str]:
    rc, out, _ = run_git(Path(path), "rev-parse", "--show-toplevel")
    return out if rc == 0 and out else None


def snapshot_worktree_tree(repo_root) -> Optional[str]:
    """A tree object capturing tracked AND untracked non-ignored files,
    via a throwaway index — the real index and worktree are untouched.
    Both ends of a fix-delta diff must be snapshots like this one: a
    tree-vs-worktree diff reports an untracked file as deleted.

    The machine-side ``.dabbler/`` directory is dropped unconditionally,
    so the ledger cannot appear in a snapshot even in a repo that never
    got the ignore rule (or that committed the ledger before it did)."""
    fd, tmp_index = tempfile.mkstemp(prefix="dabbler-verify-index-")
    os.close(fd)
    os.unlink(tmp_index)  # let git create it
    env = dict(os.environ, GIT_INDEX_FILE=tmp_index)
    try:
        rc, _, _ = run_git(repo_root, "read-tree", "HEAD", env=env)
        if rc != 0:
            rc, _, _ = run_git(repo_root, "read-tree", "--empty", env=env)
            if rc != 0:
                return None
        rc, _, _ = run_git(repo_root, "add", "-A", env=env)
        if rc != 0:
            return None
        # After the add, so it also clears entries inherited from HEAD.
        # rc is ignored: --ignore-unmatch makes "nothing to drop" normal.
        run_git(
            repo_root, "rm", "--cached", "-r", "-f", "--ignore-unmatch",
            "-q", "--", MACHINE_DIRNAME, env=env,
        )
        rc, out, _ = run_git(repo_root, "write-tree", env=env)
        return out if rc == 0 and out else None
    finally:
        try:
            os.unlink(tmp_index)
        except OSError:
            pass


def changed_paths_between(repo_root, tree_a: str, tree_b: str) -> Optional[list]:
    """Repo-relative paths differing between two trees, or ``None`` on git
    failure (callers fail closed)."""
    rc, out, _ = run_git(
        repo_root, "diff", "--name-only", "-z", "--no-ext-diff",
        tree_a, tree_b,
    )
    if rc != 0:
        return None
    return [p for p in out.split("\0") if p]


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


_repository_id_cache: dict = {}


def repository_id(root) -> str:
    """``sha256:<hex>`` over the repository's root commit.

    Stable for the life of the repository and identical in every linked
    worktree, which is what makes one journal legitimately shared. A
    repository with no commits has no such identity and is refused rather
    than given a placeholder that would change under it later.

    Cached per root for the life of the process: it cannot change while the
    process runs, and it sits on the append path, where shelling out to git
    once per event is the difference between an append and a fork.
    """
    key = str(root)
    if key in _repository_id_cache:
        return _repository_id_cache[key]
    rc, out, _ = run_git(root, "rev-list", "--max-parents=0", "--all")
    commits = sorted(line.strip() for line in out.splitlines() if line.strip())
    if rc != 0 or not commits:
        raise JournalError(
            f"{root} has no commits, so it has no stable repository id. "
            "Make the initial commit before registering a run."
        )
    identity = "sha256:" + hashlib.sha256(
        commits[0].encode("utf-8")
    ).hexdigest()
    _repository_id_cache[key] = identity
    return identity


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


def _read_lock(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _lock_is_stale(path: Path) -> bool:
    """Whether the lock at *path* may be reclaimed.

    An unreadable lock is the delicate case. It is almost always a lock
    being born — the holder created the file and has not yet written its
    record — and reclaiming that one is how two writers end up believing
    they both hold it. So an unreadable lock is stale only once it is older
    than :data:`LOCK_BIRTH_GRACE_SECONDS`, which is orders of magnitude
    longer than the microseconds between create and write.
    """
    record = _read_lock(path)
    if record is None:
        try:
            age = time.time() - path.stat().st_mtime
        except OSError:
            return False  # it vanished; the next create decides
        return age >= LOCK_BIRTH_GRACE_SECONDS
    try:
        acquired = datetime.datetime.fromisoformat(record["acquired_at"])
        pid = int(record["pid"])
    except (KeyError, TypeError, ValueError):
        return True
    age = (datetime.datetime.now(acquired.tzinfo) - acquired).total_seconds()
    if age >= STALE_LOCK_TTL_SECONDS:
        return True
    return not _pid_running(pid)


class journal_lock:
    """Atomic ``O_CREAT|O_EXCL`` create with stale reclaim, waiting up to
    :data:`LOCK_WAIT_SECONDS` for a live holder. Appends are frequent and
    short, so contention is normal and waiting is right; a holder that died
    mid-append is reclaimed rather than blocking the repository forever.

    Every holder writes a token nobody else can produce, and releases the
    lock only while that token is still the one on disk. Reclaiming a lock
    is therefore safe even if the reclaim was wrong: the process whose lock
    was taken away cannot delete its successor's, so the mutex still holds
    one owner at a time rather than silently admitting two.
    """

    def __init__(self, root, wait_seconds: float = LOCK_WAIT_SECONDS):
        self.path = machine_dir(root) / LOCK_FILENAME
        self.wait_seconds = wait_seconds
        self.token = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        token = f"{os.getpid()}:{uuid.uuid4()}"
        record = json.dumps({
            "pid": os.getpid(), "token": token, "acquired_at": now_iso(),
        }, indent=2) + "\n"
        deadline = time.monotonic() + self.wait_seconds
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            except FileExistsError:
                if _lock_is_stale(self.path):
                    self._release(_read_lock(self.path))
                    if time.monotonic() >= deadline:
                        raise LockContentionError(
                            f"{self.path} could not be reclaimed"
                        )
                    continue
                if time.monotonic() >= deadline:
                    raise LockContentionError(
                        f"another writer holds {self.path}"
                    )
                time.sleep(0.02)
                continue
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(record)
                handle.flush()
                os.fsync(handle.fileno())
            self.token = token
            return self

    def _release(self, expected) -> None:
        """Unlink only while the lock on disk is still the one *expected*
        describes. A holder that was reclaimed out from under itself leaves
        the new holder's lock alone."""
        current = _read_lock(self.path)
        if current is not None and expected is not None:
            if current.get("token") != expected.get("token"):
                return
        try:
            self.path.unlink()
        except OSError:
            pass

    def __exit__(self, *exc):
        if self.token is not None:
            self._release({"token": self.token})
            self.token = None
        return False


# --- Schema -----------------------------------------------------------------

_schema_cache: dict = {}
_validator_cache: dict = {}

_ENVELOPE = "__envelope__"


def event_schema() -> dict:
    if "event" not in _schema_cache:
        _schema_cache["event"] = json.loads(
            _SCHEMA_PATH.read_text(encoding="utf-8")
        )
    return _schema_cache["event"]


def _validators() -> dict:
    """One compiled validator for the envelope and one per event type.

    Equivalent to the schema file's closed ``oneOf`` — every branch is keyed
    by a distinct ``event_type`` const, so dispatching on that field first
    picks exactly the branch ``oneOf`` would have — but it evaluates one
    branch instead of nineteen, and compiles the schema once for the process
    instead of once per event. The journal is validated on every read, so
    this is the difference between a projection rebuild costing seconds and
    costing minutes.
    """
    if _validator_cache:
        return _validator_cache
    schema = event_schema()
    envelope = json.loads(json.dumps({
        key: value for key, value in schema.items() if key != "oneOf"
    }))
    envelope["properties"]["payload"] = {"type": "object"}
    envelope.pop("$defs", None)
    envelope["$defs"] = schema["$defs"]
    _validator_cache[_ENVELOPE] = jsonschema.Draft202012Validator(envelope)
    for variant in schema["oneOf"]:
        const = variant["properties"]["event_type"]["const"]
        ref = variant["properties"]["payload"]["$ref"].rsplit("/", 1)[-1]
        sub = dict(schema["$defs"][ref])
        sub["$defs"] = schema["$defs"]
        _validator_cache[const] = jsonschema.Draft202012Validator(sub)
    return _validator_cache


def validate_event(event: dict, source: str = "<memory>") -> dict:
    """Fail closed on an unknown schema version before anything else: a
    future envelope must never be coerced into this one's shape."""
    version = event.get("schema_version") if isinstance(event, dict) else None
    if version != SCHEMA_VERSION:
        # Which direction the mismatch runs in is the whole of the advice.
        # Version 1 carried a set level -- `set_slug` on run.created, and
        # `target` plus `set_slug` on the organization events -- and the
        # payload schemas are closed, so a v1 journal cannot be read as a v2
        # one without silently dropping the identity it was addressed by.
        # It is refused here by name rather than failing later as an
        # unexplained additionalProperties error.
        if isinstance(version, int) and version < SCHEMA_VERSION:
            raise JournalCorrupt(
                f"{source}: run event declares schema_version {version!r}, "
                f"which predates the collapse of session sets (this router "
                f"writes {SCHEMA_VERSION}). read_events() reads such a "
                "journal forward through upgrade_v1_records(); this "
                "validator speaks only the current shape, so an event "
                "reaching it unupgraded is a caller that skipped that step."
            )
        raise JournalCorrupt(
            f"{source}: run event declares schema_version {version!r}; this "
            f"router understands {SCHEMA_VERSION}. Upgrade the router rather "
            "than reading it as the current shape."
        )
    validators = _validators()
    error = next(iter(validators[_ENVELOPE].iter_errors(event)), None)
    if error is None:
        payload_validator = validators.get(event["event_type"])
        error = next(
            iter(payload_validator.iter_errors(event.get("payload"))), None
        )
        if error is not None:
            location = "/".join(str(p) for p in error.absolute_path)
            raise JournalCorrupt(
                f"{source}: run event {event['event_type']!r} failed schema "
                f"validation: payload/{location or '(payload)'}: "
                f"{error.message}"
            )
        return event
    location = "/".join(str(p) for p in error.absolute_path) or "(root)"
    raise JournalCorrupt(
        f"{source}: run event {event.get('event_type')!r} failed schema "
        f"validation: {location}: {error.message}"
    )


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


# --- Reading a pre-collapse journal -----------------------------------------
#
# Version 1 addressed runs by set slug. The collapse made a repository hold
# sessions rather than sets of sessions, so those records are read forward
# here rather than rejected: the journal is durable history and a router
# upgrade must not strand it. The upgrade is in memory only -- the bytes on
# disk keep saying exactly what their writer wrote, and a later append
# simply writes version 2 beside them.

V1_SCHEMA_VERSION = 1


def _v1_active_set(records: list):
    """The set whose sessions are this repository's sessions now.

    The newest ``run.created`` names it: a collapse folds the set that was
    still running, and the one still running is the one most recently
    started. Deterministic from the journal alone, so two readers of the
    same file always agree.
    """
    newest = None
    for record in records:
        if record.get("event_type") != "run.created":
            continue
        payload = record.get("payload")
        if not isinstance(payload, dict) or not payload.get("set_slug"):
            continue
        if newest is None or record.get("sequence", 0) > newest[0]:
            newest = (record.get("sequence", 0), payload["set_slug"])
    return newest[1] if newest else None


def upgrade_v1_records(records: list, source: str) -> list:
    """Version 1 events read forward into the version 2 shape.

    Nothing is refused and nothing is merged. One set is the active one and
    its session numbers are already the repository's, so its records simply
    lose ``set_slug``. Every other set is history: its records keep their
    identity as ``legacy_set`` and the projection never joins them to a
    plan session, because that set numbered its sessions from 1 and so does
    this repository -- attributing them to a current session would silently
    merge two histories, and dropping them would strand real runs.

    A set-level cancellation or restoration is always legacy, whichever set
    it names. It acted on a thing that is no longer a concept, so it has no
    session to be read as; it stays readable as a fact about a retired set.
    """
    active = _v1_active_set(records)
    upgraded = []
    for record in records:
        row = dict(record)
        if row.get("schema_version") != V1_SCHEMA_VERSION:
            upgraded.append(row)
            continue
        payload = dict(row.get("payload") or {})
        slug = payload.pop("set_slug", None)
        event_type = row.get("event_type") or ""
        if event_type.startswith("organization."):
            set_level = payload.pop("target", None) == "set"
            if set_level:
                payload.pop("session_number", None)
            if slug and (set_level or slug != active):
                payload["legacy_set"] = slug
        elif slug and slug != active:
            payload["legacy_set"] = slug
        row["payload"] = payload
        row["schema_version"] = SCHEMA_VERSION
        upgraded.append(row)
    return upgraded


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
    if any(r.get("schema_version") == V1_SCHEMA_VERSION for r in records):
        # Before validation, because the v1 shape cannot pass the v2 schema.
        records = upgrade_v1_records(records, str(path))
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


class _Batch:
    """One or more appends over a single read of the journal.

    The journal is read, repaired, and sequence-checked once when the batch
    opens; every append after that extends the in-memory record and the file
    together. ``events`` is therefore the complete, current journal without
    a second read — which matters because the projection is rewritten after
    every append and would otherwise re-read and re-validate the whole file
    each time.
    """

    def __init__(self, root):
        self.root = root
        self.path = journal_path(root)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            raw = b""
        self.events, self._repair = _split_records(raw, str(self.path))
        _check_sequences(self.events, str(self.path))
        for record in self.events:
            validate_event(record, str(self.path))
        self.appended: list = []

    def append(self, *, event_type: str, run_id: str, attempt: int,
               actor: dict, summary: str, payload: dict,
               artifact_refs=()) -> dict:
        event = {
            "schema_version": SCHEMA_VERSION,
            "sequence": len(self.events) + 1,
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "occurred_at": now_iso(),
            "repository_id": repository_id(self.root),
            "worktree_id": worktree_id(Path.cwd()),
            "run_id": run_id,
            "attempt": int(attempt),
            "actor": dict(actor),
            "summary": summary[:200],
            "artifact_refs": list(artifact_refs),
            "payload": payload,
        }
        validate_event(event, str(self.path))
        line = (
            json.dumps(event, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"))
            + "\n"
        ).encode("utf-8")
        _repair_and_append(self.path, line, self._repair)
        self._repair = None
        _fsync_dir(self.path.parent)
        self.events.append(event)
        self.appended.append(event)
        return event


@contextlib.contextmanager
def batch(root, *, lock: bool = True):
    """A :class:`_Batch` under the journal lock.

    ``lock=False`` is for a caller that already holds it — the compound
    operations that must read their preconditions and append their events
    without another writer in between.
    """
    if lock:
        with journal_lock(root):
            yield _Batch(root)
    else:
        yield _Batch(root)


def append(root, **spec) -> dict:
    """Stamp, validate, and durably append one event; return it."""
    with batch(root) as writer:
        return writer.append(**spec)


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
