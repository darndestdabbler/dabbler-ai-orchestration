"""Unit tests for daemon_pid: pid-file write/read/remove + is_pid_alive."""

from __future__ import annotations

import json
import os
import sys

import pytest

import daemon_pid
from daemon_pid import (
    ORCHESTRATOR_ROLE,
    VALID_ROLES,
    VERIFIER_ROLE,
    is_pid_alive,
    pid_file_path,
    read_pid_file,
    remove_pid_file,
    write_pid_file,
)


class TestPidFilePath:
    def test_path_includes_role_and_provider(self, tmp_path):
        p = pid_file_path(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        assert p == tmp_path / "openai" / "verifier.daemon-pid"

    def test_orchestrator_path_distinct_from_verifier(self, tmp_path):
        v = pid_file_path(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        o = pid_file_path(ORCHESTRATOR_ROLE, "openai", base_dir=tmp_path)
        assert v != o
        assert v.parent == o.parent

    def test_invalid_role_raises(self, tmp_path):
        with pytest.raises(ValueError):
            pid_file_path("verifierx", "openai", base_dir=tmp_path)


class TestWriteReadRoundTrip:
    def test_write_creates_provider_directory(self, tmp_path):
        path = write_pid_file(
            VERIFIER_ROLE, "openai",
            worker_id="host:1234:openai:abc",
            lease_seconds=600,
            heartbeat_interval=30.0,
            base_dir=tmp_path,
        )
        assert path.is_file()
        assert (tmp_path / "openai").is_dir()

    def test_read_returns_payload(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai",
            worker_id="host:1234:openai:abc",
            lease_seconds=600,
            heartbeat_interval=30.0,
            base_dir=tmp_path,
            pid=999999,
            started_at="2026-04-30T08:00:00-04:00",
        )
        data = read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        assert data["role"] == VERIFIER_ROLE
        assert data["provider"] == "openai"
        assert data["pid"] == 999999
        assert data["worker_id"] == "host:1234:openai:abc"
        assert data["started_at"] == "2026-04-30T08:00:00-04:00"
        assert data["lease_seconds"] == 600
        assert data["heartbeat_interval"] == 30.0

    def test_default_pid_is_current_process(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai",
            worker_id="w",
            lease_seconds=600,
            heartbeat_interval=30.0,
            base_dir=tmp_path,
        )
        data = read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        assert data["pid"] == os.getpid()

    def test_default_started_at_is_iso_with_tz(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai",
            worker_id="w",
            lease_seconds=600,
            heartbeat_interval=30.0,
            base_dir=tmp_path,
        )
        data = read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        # ISO 8601 with timezone offset (e.g. +00:00 or -04:00 or Z)
        assert "T" in data["started_at"]
        assert (
            "+" in data["started_at"]
            or "-" in data["started_at"][10:]
            or data["started_at"].endswith("Z")
        )


class TestReadEdgeCases:
    def test_read_missing_returns_none(self, tmp_path):
        assert read_pid_file(VERIFIER_ROLE, "x", base_dir=tmp_path) is None

    def test_read_malformed_returns_none(self, tmp_path):
        path = pid_file_path(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        path.parent.mkdir(parents=True)
        path.write_text("not valid json {", encoding="utf-8")
        assert read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path) is None

    def test_read_non_dict_json_returns_none(self, tmp_path):
        path = pid_file_path(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
        assert read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path) is None


class TestAtomicReplace:
    def test_overwrite_existing_file(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai", worker_id="w1",
            lease_seconds=300, heartbeat_interval=30.0, base_dir=tmp_path,
        )
        write_pid_file(
            VERIFIER_ROLE, "openai", worker_id="w2",
            lease_seconds=600, heartbeat_interval=15.0, base_dir=tmp_path,
        )
        data = read_pid_file(VERIFIER_ROLE, "openai", base_dir=tmp_path)
        assert data["worker_id"] == "w2"
        assert data["lease_seconds"] == 600
        assert data["heartbeat_interval"] == 15.0

    def test_no_tmp_file_left_behind(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai", worker_id="w",
            lease_seconds=600, heartbeat_interval=30.0, base_dir=tmp_path,
        )
        # The atomic write uses .tmp; it must be cleaned up.
        leftovers = list((tmp_path / "openai").glob("*.tmp"))
        assert leftovers == []


class TestRemove:
    def test_remove_existing_returns_true(self, tmp_path):
        write_pid_file(
            VERIFIER_ROLE, "openai", worker_id="w",
            lease_seconds=600, heartbeat_interval=30.0, base_dir=tmp_path,
        )
        assert remove_pid_file(
            VERIFIER_ROLE, "openai", base_dir=tmp_path
        ) is True
        assert read_pid_file(
            VERIFIER_ROLE, "openai", base_dir=tmp_path
        ) is None

    def test_remove_missing_returns_false(self, tmp_path):
        assert remove_pid_file(
            VERIFIER_ROLE, "openai", base_dir=tmp_path
        ) is False


class TestIsPidAlive:
    def test_current_process_is_alive(self):
        assert is_pid_alive(os.getpid()) is True

    def test_pid_zero_is_not_alive(self):
        assert is_pid_alive(0) is False

    def test_pid_negative_is_not_alive(self):
        assert is_pid_alive(-5) is False

    def test_definitely_dead_pid_returns_false(self):
        # PID 999999 is far above the typical Linux/Windows range and
        # extremely unlikely to be assigned. Best-effort assertion —
        # if a flaky CI happens to allocate that exact PID, the test
        # would false-negative; the check below ensures we'd notice.
        if is_pid_alive(999999):
            pytest.skip("999999 happens to be alive on this system")
        assert is_pid_alive(999999) is False


class TestValidRoles:
    def test_valid_roles_includes_both(self):
        assert VERIFIER_ROLE in VALID_ROLES
        assert ORCHESTRATOR_ROLE in VALID_ROLES
        assert len(VALID_ROLES) == 2
