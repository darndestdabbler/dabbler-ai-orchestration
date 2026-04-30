"""Tests for ai-router/queue_db.py — Session 1 of session set 001."""

import subprocess
import sqlite3
import sys
import textwrap
import threading
from pathlib import Path

import pytest

import queue_db  # type: ignore[import-not-found]
from queue_db import (  # type: ignore[import-not-found]
    ConcurrencyError,
    DuplicateIdempotencyKeyError,
    QueueDB,
    QueueMessage,
)

AI_ROUTER_DIR = Path(queue_db.__file__).resolve().parent


@pytest.fixture
def qdb(tmp_path: Path) -> QueueDB:
    return QueueDB(provider="claude", base_dir=tmp_path / "provider-queues")


def _expire_lease(db_path: Path, message_id: str) -> None:
    """Test helper: forcibly age a claim's lease into the past."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE messages SET lease_expires_at = ? WHERE id = ?",
            ("1970-01-01T00:00:00+00:00", message_id),
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------
# enqueue
# --------------------------------------------------------------------------

def test_enqueue_returns_uuid_and_persists_state_new(qdb: QueueDB):
    mid = qdb.enqueue(
        from_provider="codex",
        task_type="session-verification",
        payload={"session": 1, "files": ["a.py"]},
        idempotency_key="set001-s1-codex-1",
    )
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "new"
    assert msg.from_provider == "codex"
    assert msg.to_provider == "claude"
    assert msg.payload == {"session": 1, "files": ["a.py"]}
    assert msg.attempts == 0
    assert msg.max_attempts == 3
    assert msg.claimed_by is None and msg.lease_expires_at is None


def test_enqueue_duplicate_idempotency_key_raises(qdb: QueueDB):
    first = qdb.enqueue("codex", "t", {"x": 1}, "dupe-key")
    with pytest.raises(DuplicateIdempotencyKeyError) as excinfo:
        qdb.enqueue("codex", "t", {"x": 999}, "dupe-key")
    # exception carries the original message id for enqueue-or-fetch callers
    assert excinfo.value.existing_id == first
    assert excinfo.value.idempotency_key == "dupe-key"
    # original payload preserved; second enqueue did not overwrite
    msg = qdb.get_message(first)
    assert msg is not None
    assert msg.payload == {"x": 1}


def test_enqueue_threads_session_metadata(qdb: QueueDB):
    mid = qdb.enqueue(
        "codex", "t", {}, "k1",
        session_set="docs/session-sets/foo",
        session_number=3,
    )
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.session_set == "docs/session-sets/foo"
    assert msg.session_number == 3


# --------------------------------------------------------------------------
# claim
# --------------------------------------------------------------------------

def test_claim_returns_oldest_new_message(qdb: QueueDB):
    a = qdb.enqueue("codex", "t", {"n": 1}, "a")
    b = qdb.enqueue("codex", "t", {"n": 2}, "b")
    claimed = qdb.claim("worker-1")
    assert claimed is not None
    assert claimed.id == a
    assert claimed.state == "claimed"
    assert claimed.claimed_by == "worker-1"
    assert claimed.lease_expires_at is not None
    # second claim picks up the second message
    second = qdb.claim("worker-1")
    assert second is not None and second.id == b


def test_claim_on_empty_queue_returns_none(qdb: QueueDB):
    assert qdb.claim("worker-1") is None


def test_double_claim_only_one_winner(qdb: QueueDB):
    qdb.enqueue("codex", "t", {}, "k1")
    results: list = []

    def worker(name: str):
        results.append(qdb.claim(f"worker-{name}"))

    threads = [threading.Thread(target=worker, args=(str(i),)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    successes = [r for r in results if r is not None]
    losses = [r for r in results if r is None]
    assert len(successes) == 1
    assert len(losses) == 1


def test_concurrent_claim_across_processes_only_one_winner(tmp_path: Path):
    """Multi-process race: spawn N OS processes that all attempt claim()
    on the same queue.db at (approximately) the same instant. Exactly
    one must win.

    The test uses a wall-clock release barrier: each subprocess opens
    the QueueDB up front, then busy-waits on ``time.time()`` until a
    shared release timestamp 1.0s in the future before calling
    ``claim()``. This forces real contention rather than serial
    completion, which would trivially pass with one winner regardless
    of locking semantics.
    """
    import time as _time

    base = tmp_path / "provider-queues"
    qdb = QueueDB(provider="claude", base_dir=base)
    qdb.enqueue("codex", "t", {}, "k1")

    helper = tmp_path / "claim_helper.py"
    helper.write_text(
        textwrap.dedent(f"""
            import sys, time
            sys.path.insert(0, {repr(str(AI_ROUTER_DIR))})
            import queue_db
            # Open the DB up-front so connection setup is not part of the race.
            q = queue_db.QueueDB(provider="claude", base_dir={repr(str(base))})
            worker_id = sys.argv[1]
            release_at = float(sys.argv[2])
            while time.time() < release_at:
                pass  # busy-wait so all workers release inside the same ms
            m = q.claim(worker_id)
            print("WON" if m else "LOST")
        """),
        encoding="utf-8",
    )

    n = 4
    release_at = _time.time() + 1.0
    procs = [
        subprocess.Popen(
            [sys.executable, str(helper), f"worker-{i}", f"{release_at:.6f}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for i in range(n)
    ]
    outcomes = []
    for p in procs:
        out, err = p.communicate(timeout=30)
        assert p.returncode == 0, (
            f"subprocess exited {p.returncode}: stdout={out!r} stderr={err!r}"
        )
        outcomes.append(out.strip())

    wins = [o for o in outcomes if o == "WON"]
    losses = [o for o in outcomes if o == "LOST"]
    assert len(wins) == 1, (
        f"expected exactly 1 winner across {n} processes, got {wins}; outcomes={outcomes}"
    )
    assert len(losses) == n - 1


# --------------------------------------------------------------------------
# heartbeat
# --------------------------------------------------------------------------

def test_heartbeat_extends_lease(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    claimed = qdb.claim("worker-1", lease_seconds=30)
    assert claimed is not None
    initial_lease = claimed.lease_expires_at
    qdb.heartbeat(mid, "worker-1", lease_seconds=600)
    after = qdb.get_message(mid)
    assert after is not None
    assert after.lease_expires_at is not None
    assert after.lease_expires_at > (initial_lease or "")
    assert after.last_heartbeat_at is not None


def test_claim_leaves_last_heartbeat_at_null_until_first_heartbeat(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    claimed = qdb.claim("worker-1")
    assert claimed is not None
    # right after claim, lease is set but no heartbeat has been seen yet
    assert claimed.last_heartbeat_at is None
    after_claim = qdb.get_message(mid)
    assert after_claim is not None
    assert after_claim.last_heartbeat_at is None
    # first heartbeat populates it
    qdb.heartbeat(mid, "worker-1")
    after_heartbeat = qdb.get_message(mid)
    assert after_heartbeat is not None
    assert after_heartbeat.last_heartbeat_at is not None


def test_heartbeat_rejects_wrong_worker(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    with pytest.raises(ConcurrencyError):
        qdb.heartbeat(mid, "worker-2")


def test_heartbeat_rejects_after_completion(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    qdb.complete(mid, "worker-1", {"ok": True})
    with pytest.raises(ConcurrencyError):
        qdb.heartbeat(mid, "worker-1")


# --------------------------------------------------------------------------
# complete
# --------------------------------------------------------------------------

def test_complete_transitions_to_completed(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    transitioned = qdb.complete(mid, "worker-1", {"verdict": "VERIFIED"})
    assert transitioned is True
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "completed"
    assert msg.result == {"verdict": "VERIFIED"}
    assert msg.completed_at is not None


def test_complete_is_idempotent_on_already_completed(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    qdb.complete(mid, "worker-1", {"v": 1})
    again = qdb.complete(mid, "worker-1", {"v": 2})
    assert again is False
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.result == {"v": 1}  # original result is preserved


def test_complete_rejects_wrong_worker(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    with pytest.raises(ConcurrencyError):
        qdb.complete(mid, "worker-2", {"ok": True})


def test_complete_unknown_message_raises(qdb: QueueDB):
    with pytest.raises(ConcurrencyError):
        qdb.complete("00000000-0000-0000-0000-000000000000", "worker-1", {})


# --------------------------------------------------------------------------
# fail (with and without retry)
# --------------------------------------------------------------------------

def test_fail_with_retry_returns_to_new(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=3)
    qdb.claim("worker-1")
    outcome = qdb.fail(mid, "worker-1", "transient http error")
    assert outcome == "new"
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "new"
    assert msg.attempts == 1
    assert msg.failure_reason == "transient http error"
    assert msg.claimed_by is None and msg.lease_expires_at is None
    # eligible to be claimed again
    again = qdb.claim("worker-1")
    assert again is not None and again.id == mid
    assert again.attempts == 1


def test_fail_at_max_attempts_terminates(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=1)
    qdb.claim("worker-1")
    outcome = qdb.fail(mid, "worker-1", "permanent error")
    assert outcome == "failed"
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "failed"
    assert msg.attempts == 1
    assert msg.failure_reason == "permanent error"
    assert msg.completed_at is not None


def test_fail_rejects_wrong_worker(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    with pytest.raises(ConcurrencyError):
        qdb.fail(mid, "worker-2", "nope")


# --------------------------------------------------------------------------
# reclaim_expired
# --------------------------------------------------------------------------

def test_reclaim_expired_returns_to_new_when_attempts_remain(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=3)
    qdb.claim("worker-1")
    _expire_lease(qdb.db_path, mid)
    count = qdb.reclaim_expired()
    assert count == 1
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "new"
    assert msg.attempts == 1
    assert msg.claimed_by is None
    assert msg.failure_reason == "lease expired without heartbeat"


def test_reclaim_expired_terminates_at_max_attempts(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=1)
    qdb.claim("worker-1")
    _expire_lease(qdb.db_path, mid)
    count = qdb.reclaim_expired()
    assert count == 1
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "timed_out"
    assert msg.attempts == 1
    assert msg.completed_at is not None


def test_reclaim_expired_ignores_active_claims(qdb: QueueDB):
    qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1", lease_seconds=600)
    assert qdb.reclaim_expired() == 0


def test_reclaim_then_claim_recovers_work(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=3)
    qdb.claim("worker-1")
    _expire_lease(qdb.db_path, mid)
    qdb.reclaim_expired()
    recovered = qdb.claim("worker-2")
    assert recovered is not None
    assert recovered.id == mid
    assert recovered.claimed_by == "worker-2"
    assert recovered.attempts == 1


# --------------------------------------------------------------------------
# misc
# --------------------------------------------------------------------------

def test_count_by_state(qdb: QueueDB):
    a = qdb.enqueue("codex", "t", {}, "a")
    qdb.enqueue("codex", "t", {}, "b")
    qdb.claim("worker-1")  # claims a
    qdb.complete(a, "worker-1", {"ok": True})
    counts = qdb.count_by_state()
    assert counts.get("new") == 1
    assert counts.get("completed") == 1


@pytest.mark.parametrize(
    "bad_name",
    [
        "",        # empty
        ".",       # current dir
        "..",      # parent dir — would escape base_dir
        "../evil", # explicit traversal
        "bad/name",
        "bad\\name",
        "with space",
        "with:colon",
        "with;semi",
        "with$dollar",
    ],
)
def test_invalid_provider_name_rejected(tmp_path: Path, bad_name: str):
    with pytest.raises(ValueError):
        QueueDB(provider=bad_name, base_dir=tmp_path)


@pytest.mark.parametrize(
    "good_name",
    ["claude", "codex", "gpt-5-4", "gemini_pro", "abc123", "A-B_c-1"],
)
def test_valid_provider_names_accepted(tmp_path: Path, good_name: str):
    qdb = QueueDB(provider=good_name, base_dir=tmp_path)
    assert qdb.provider == good_name
    assert qdb.db_path.parent.name == good_name


def test_wal_mode_enabled_on_first_open(tmp_path: Path):
    qdb = QueueDB(provider="claude", base_dir=tmp_path)
    conn = sqlite3.connect(qdb.db_path)
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        conn.close()
    assert mode.lower() == "wal"


def test_synchronous_not_downgraded_below_full(tmp_path: Path):
    """The queue is the canonical record of in-flight work, so durability
    against OS crashes and power loss must not be downgraded.

    SQLite's PRAGMA synchronous returns 0..3 for OFF/NORMAL/FULL/EXTRA.
    FULL=2 is the default and the floor for this queue.
    """
    qdb = QueueDB(provider="claude", base_dir=tmp_path)
    conn = sqlite3.connect(qdb.db_path)
    try:
        level = conn.execute("PRAGMA synchronous").fetchone()[0]
    finally:
        conn.close()
    assert level >= 2, (
        f"PRAGMA synchronous downgraded to {level} "
        "(0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA); queue durability requires >= FULL"
    )
