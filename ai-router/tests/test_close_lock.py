"""Tests for the Set 3 Session 2 concurrency lock.

Covers:

* Single-holder semantics — a second :func:`acquire_lock` call while
  the first handle is held raises :class:`LockContention`.
* Stale-lock reclaim by TTL — a lock with an ``acquired_at`` older
  than :data:`STALE_LOCK_TTL_SECONDS` is reclaimed with a warning.
* Stale-lock reclaim by dead PID — a lock whose recorded PID is no
  longer running is reclaimed with a warning.
* Release semantics — release of a lock the caller does not own is a
  no-op (no exception, no removal).
* :func:`close_session_lock` context manager — acquires on enter,
  releases on exit, propagates contention.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

import pytest

from close_lock import (
    LOCK_FILENAME,
    LockContention,
    LockHandle,
    STALE_LOCK_TTL_SECONDS,
    acquire_lock,
    close_session_lock,
    release_lock,
)


@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    d = tmp_path / "set"
    d.mkdir()
    return str(d)


def _read_lock_file(session_set_dir: str) -> dict:
    path = os.path.join(session_set_dir, LOCK_FILENAME)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_lock_file(session_set_dir: str, payload: dict) -> str:
    """Write a lock file directly (simulating a peer holder)."""
    path = os.path.join(session_set_dir, LOCK_FILENAME)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    return path


def test_acquire_creates_lock_file(session_set_dir):
    handle = acquire_lock(session_set_dir)
    assert os.path.isfile(handle.path)
    record = _read_lock_file(session_set_dir)
    assert record["pid"] == os.getpid()
    assert record["worker_id"] == handle.worker_id
    assert record["acquired_at"] == handle.acquired_at
    release_lock(handle)


def test_release_removes_lock_file(session_set_dir):
    handle = acquire_lock(session_set_dir)
    release_lock(handle)
    assert not os.path.isfile(handle.path)


def test_second_acquire_raises_lock_contention(session_set_dir):
    """Two acquires while one is live → LockContention."""
    first = acquire_lock(session_set_dir, worker_id="first")
    try:
        with pytest.raises(LockContention) as exc_info:
            acquire_lock(session_set_dir, worker_id="second")
        assert exc_info.value.record.get("worker_id") == "first"
    finally:
        release_lock(first)


def test_stale_lock_by_ttl_is_reclaimed(session_set_dir):
    """A lock older than TTL is reclaimed with a warning."""
    old_ts = (
        datetime.now().astimezone()
        - timedelta(seconds=STALE_LOCK_TTL_SECONDS + 60)
    ).isoformat()
    _write_lock_file(session_set_dir, {
        "pid": os.getpid(),  # alive PID — TTL alone should reclaim
        "worker_id": "ancient",
        "acquired_at": old_ts,
    })
    handle = acquire_lock(session_set_dir, worker_id="newcomer")
    try:
        assert any("reclaimed stale lock" in w for w in handle.warnings)
        record = _read_lock_file(session_set_dir)
        assert record["worker_id"] == "newcomer"
    finally:
        release_lock(handle)


def test_stale_lock_by_dead_pid_is_reclaimed(session_set_dir):
    """A lock whose PID is not running is reclaimed even within the TTL."""
    # Pick a PID extremely unlikely to be live. PID 999999 is well
    # outside the typical Windows / POSIX ranges; we accept the rare
    # case where this happens to be assigned by retrying the test.
    dead_pid = 999_999
    _write_lock_file(session_set_dir, {
        "pid": dead_pid,
        "worker_id": "ghost",
        "acquired_at": datetime.now().astimezone().isoformat(),
    })
    handle = acquire_lock(session_set_dir, worker_id="newcomer")
    try:
        assert any("reclaimed stale lock" in w for w in handle.warnings)
    finally:
        release_lock(handle)


def test_release_of_foreign_lock_is_noop(session_set_dir):
    """release_lock with a handle whose PID does not match the file is a no-op."""
    # A peer holds the lock.
    _write_lock_file(session_set_dir, {
        "pid": os.getpid() + 12345,
        "worker_id": "peer",
        "acquired_at": datetime.now().astimezone().isoformat(),
    })
    fake_handle = LockHandle(
        path=os.path.join(session_set_dir, LOCK_FILENAME),
        pid=os.getpid(),  # not the peer's PID
        worker_id="us",
        acquired_at="now",
    )
    release_lock(fake_handle)  # should not raise, should not remove
    assert os.path.isfile(fake_handle.path)
    record = _read_lock_file(session_set_dir)
    assert record["worker_id"] == "peer"


def test_release_when_file_already_gone_is_noop(session_set_dir):
    handle = acquire_lock(session_set_dir)
    os.unlink(handle.path)
    release_lock(handle)  # must not raise


def test_context_manager_acquires_and_releases(session_set_dir):
    with close_session_lock(session_set_dir) as handle:
        assert os.path.isfile(handle.path)
    assert not os.path.isfile(handle.path)


def test_context_manager_releases_on_exception(session_set_dir):
    with pytest.raises(RuntimeError):
        with close_session_lock(session_set_dir) as handle:
            assert os.path.isfile(handle.path)
            raise RuntimeError("boom")
    assert not os.path.isfile(handle.path)


def test_context_manager_propagates_contention(session_set_dir):
    held = acquire_lock(session_set_dir, worker_id="first")
    try:
        with pytest.raises(LockContention):
            with close_session_lock(session_set_dir, worker_id="second"):
                pytest.fail("should not enter the with block")
    finally:
        release_lock(held)
