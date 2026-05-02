"""Unit tests for role_status: collection, health detection, rendering."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

import role_status
from daemon_pid import (
    ORCHESTRATOR_ROLE,
    VERIFIER_ROLE,
    pid_file_path,
    write_pid_file,
)
from queue_db import QueueDB
from role_status import (
    STALE_HEARTBEAT_MULTIPLIER,
    collect_status,
    render_json,
    render_text,
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _make_pid_file(tmp_path, role, provider, *, pid=None, worker_id="w-1",
                   lease=600, heartbeat=30.0):
    return write_pid_file(
        role, provider,
        worker_id=worker_id,
        lease_seconds=lease,
        heartbeat_interval=heartbeat,
        base_dir=tmp_path,
        pid=pid if pid is not None else os.getpid(),
    )


def _enqueue_and_claim(tmp_path, provider, worker_id):
    """Enqueue a fresh message and claim it for ``worker_id``.

    Returns the message id. Used to simulate a "currently working"
    daemon for the role_status assertions.
    """
    queue = QueueDB(provider=provider, base_dir=tmp_path)
    queue.enqueue(
        from_provider="openai",
        task_type="verification",
        payload={"x": 1},
        idempotency_key=f"k-{provider}-{worker_id}",
    )
    msg = queue.claim(worker_id, lease_seconds=600)
    assert msg is not None
    return msg.id


# --------------------------------------------------------------------------
# collect_status
# --------------------------------------------------------------------------

class TestEmpty:
    def test_no_base_dir_yields_empty(self, tmp_path):
        rows = collect_status(base_dir=str(tmp_path / "missing"))
        assert rows == []

    def test_empty_base_dir_yields_empty(self, tmp_path):
        rows = collect_status(base_dir=str(tmp_path))
        assert rows == []


class TestProviderDiscovery:
    def test_directory_with_queue_db_discovered(self, tmp_path):
        # Creating a QueueDB initializes the schema → queue.db file present.
        QueueDB(provider="openai", base_dir=tmp_path)
        rows = collect_status(base_dir=str(tmp_path))
        # Both roles for the discovered provider show as 'stopped'
        # because no pid files exist.
        providers = {r["provider"] for r in rows}
        assert providers == {"openai"}
        roles = {r["role"] for r in rows}
        assert roles == {VERIFIER_ROLE, ORCHESTRATOR_ROLE}
        assert all(r["health"] == "stopped" for r in rows)

    def test_directory_without_queue_or_pid_skipped(self, tmp_path):
        (tmp_path / "scratch").mkdir()
        rows = collect_status(base_dir=str(tmp_path))
        assert rows == []

    def test_provider_filter_restricts_results(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        QueueDB(provider="claude", base_dir=tmp_path)
        rows = collect_status(base_dir=str(tmp_path), providers=["claude"])
        providers = {r["provider"] for r in rows}
        assert providers == {"claude"}


# --------------------------------------------------------------------------
# Health detection
# --------------------------------------------------------------------------

class TestHealthDetection:
    def test_alive_when_pid_running_and_no_claims(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai")
        rows = collect_status(base_dir=str(tmp_path))
        verifier_row = next(
            r for r in rows
            if r["role"] == VERIFIER_ROLE and r["provider"] == "openai"
        )
        assert verifier_row["health"] == "alive"

    def test_alive_with_fresh_heartbeat(self, tmp_path):
        worker_id = "host:1:openai:fresh"
        msg_id = _enqueue_and_claim(tmp_path, "openai", worker_id)
        QueueDB(provider="openai", base_dir=tmp_path).heartbeat(
            msg_id, worker_id, lease_seconds=600
        )
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai", worker_id=worker_id)
        rows = collect_status(base_dir=str(tmp_path))
        verifier_row = next(
            r for r in rows
            if r["role"] == VERIFIER_ROLE and r["provider"] == "openai"
        )
        assert verifier_row["health"] == "alive"
        assert len(verifier_row["claimed_messages"]) == 1
        assert verifier_row["latest_heartbeat"] is not None

    def test_stale_when_pid_dead(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        # Use a deliberately implausible PID. The skip below covers the
        # 1-in-65535 case where it happens to be alive.
        if role_status.is_pid_alive(999998):
            pytest.skip("999998 alive on this host")
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai", pid=999998)
        rows = collect_status(base_dir=str(tmp_path))
        verifier_row = next(
            r for r in rows
            if r["role"] == VERIFIER_ROLE and r["provider"] == "openai"
        )
        assert verifier_row["health"] == "stale"

    def test_stopped_when_no_pid_file(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        rows = collect_status(base_dir=str(tmp_path))
        assert all(r["health"] == "stopped" for r in rows)

    def test_unhealthy_when_heartbeat_age_exceeds_threshold(
        self, tmp_path, monkeypatch
    ):
        worker_id = "host:1:openai:slow"
        _make_pid_file(
            tmp_path, VERIFIER_ROLE, "openai",
            worker_id=worker_id, lease=10,
        )
        # Enqueue + claim, then monkey-patch _claimed_by_worker to return
        # a heartbeat that is older than 2 * lease_seconds (= 20s).
        msg_id = _enqueue_and_claim(tmp_path, "openai", worker_id)
        QueueDB(provider="openai", base_dir=tmp_path).heartbeat(
            msg_id, worker_id, lease_seconds=10
        )

        # Time-travel by patching _parse_iso to subtract 60 seconds.
        original_parse = role_status._parse_iso

        def _shifted(value):
            dt = original_parse(value)
            if dt is None:
                return None
            return dt - timedelta(seconds=60)

        monkeypatch.setattr(role_status, "_parse_iso", _shifted)

        rows = collect_status(base_dir=str(tmp_path))
        verifier_row = next(
            r for r in rows
            if r["role"] == VERIFIER_ROLE and r["provider"] == "openai"
        )
        assert verifier_row["health"] == "unhealthy"


# --------------------------------------------------------------------------
# Queue counts and claimed messages
# --------------------------------------------------------------------------

class TestQueueCounts:
    def test_counts_reflect_queue_state(self, tmp_path):
        queue = QueueDB(provider="openai", base_dir=tmp_path)
        queue.enqueue(
            from_provider="claude", task_type="verification",
            payload={"a": 1}, idempotency_key="k1",
        )
        queue.enqueue(
            from_provider="claude", task_type="verification",
            payload={"a": 2}, idempotency_key="k2",
        )
        rows = collect_status(base_dir=str(tmp_path))
        for r in rows:
            assert r["queue_counts"].get("new", 0) == 2

    def test_claimed_messages_filtered_to_worker_id(self, tmp_path):
        worker_a = "host:1:openai:aaaaaaaa"
        worker_b = "host:2:openai:bbbbbbbb"
        # Enqueue two; claim each by a different worker.
        queue = QueueDB(provider="openai", base_dir=tmp_path)
        queue.enqueue(
            from_provider="claude", task_type="verification",
            payload={"a": 1}, idempotency_key="k1",
        )
        queue.enqueue(
            from_provider="claude", task_type="verification",
            payload={"a": 2}, idempotency_key="k2",
        )
        m1 = queue.claim(worker_a, lease_seconds=600)
        m2 = queue.claim(worker_b, lease_seconds=600)
        assert m1 and m2

        _make_pid_file(
            tmp_path, VERIFIER_ROLE, "openai", worker_id=worker_a
        )
        rows = collect_status(base_dir=str(tmp_path))
        v_row = next(
            r for r in rows
            if r["role"] == VERIFIER_ROLE and r["provider"] == "openai"
        )
        assert len(v_row["claimed_messages"]) == 1
        assert v_row["claimed_messages"][0]["id"] == m1.id


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

class TestRendering:
    def test_render_text_empty_message(self):
        assert "no role daemons" in render_text([])

    def test_render_text_ascii_only(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai")
        rows = collect_status(base_dir=str(tmp_path))
        text = render_text(rows)
        # ASCII-only — Windows cp1252 console requirement (lessons-learned).
        text.encode("ascii")
        assert "openai/verifier" in text

    def test_render_json_is_valid_json(self, tmp_path):
        QueueDB(provider="openai", base_dir=tmp_path)
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai")
        rows = collect_status(base_dir=str(tmp_path))
        parsed = json.loads(render_json(rows))
        assert isinstance(parsed, list)
        assert len(parsed) >= 1


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

class TestCli:
    def test_main_runs_with_empty_base_dir(self, tmp_path, capsys):
        rc = role_status.main(["--base-dir", str(tmp_path)])
        assert rc == 0
        captured = capsys.readouterr()
        assert "no role daemons" in captured.out

    def test_main_json_flag(self, tmp_path, capsys):
        QueueDB(provider="openai", base_dir=tmp_path)
        _make_pid_file(tmp_path, VERIFIER_ROLE, "openai")
        rc = role_status.main(["--base-dir", str(tmp_path), "--json"])
        assert rc == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out)
        assert any(r["provider"] == "openai" for r in parsed)


class TestStaleMultiplier:
    def test_constant_is_two(self):
        # The spec says "if a worker hasn't heartbeated in 2x lease window,
        # mark it stale". This test pins the constant so a future PR
        # cannot quietly weaken the threshold.
        assert STALE_HEARTBEAT_MULTIPLIER == 2.0
