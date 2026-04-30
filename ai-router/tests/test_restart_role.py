"""Unit + subprocess tests for restart_role."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

import restart_role
from daemon_pid import (
    ORCHESTRATOR_ROLE,
    VERIFIER_ROLE,
    pid_file_path,
    read_pid_file,
    write_pid_file,
)
from restart_role import (
    DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
    SHUTDOWN_POLL_INTERVAL_SECONDS,
    restart,
    send_shutdown_signal,
    spawn_replacement,
    wait_for_shutdown,
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _write(tmp_path, role, provider, *, pid, worker_id="w-1",
           lease=600, heartbeat=30.0):
    return write_pid_file(
        role, provider,
        worker_id=worker_id,
        lease_seconds=lease,
        heartbeat_interval=heartbeat,
        base_dir=tmp_path,
        pid=pid,
    )


# --------------------------------------------------------------------------
# send_shutdown_signal
# --------------------------------------------------------------------------

class TestSendShutdownSignal:
    def test_pid_zero_returns_false(self):
        assert send_shutdown_signal(0) is False

    def test_dead_pid_returns_false(self):
        if restart_role.is_pid_alive(999998):
            pytest.skip("999998 alive on this host")
        assert send_shutdown_signal(999998) is False


# --------------------------------------------------------------------------
# wait_for_shutdown
# --------------------------------------------------------------------------

class TestWaitForShutdown:
    def test_returns_true_when_pid_file_disappears(self, tmp_path):
        path = _write(tmp_path, VERIFIER_ROLE, "openai", pid=os.getpid())
        # Remove the file in a thread after a short delay.
        import threading

        def _delete():
            time.sleep(0.05)
            path.unlink(missing_ok=True)

        threading.Thread(target=_delete, daemon=True).start()
        ok = wait_for_shutdown(
            os.getpid(), path,
            timeout_seconds=2.0,
            poll_interval_seconds=0.02,
        )
        assert ok is True

    def test_returns_true_when_process_dies_even_if_file_remains(self, tmp_path):
        # Use a definitely-dead pid; the wait should immediately succeed.
        if restart_role.is_pid_alive(999998):
            pytest.skip("999998 alive on this host")
        path = _write(tmp_path, VERIFIER_ROLE, "openai", pid=999998)
        ok = wait_for_shutdown(
            999998, path,
            timeout_seconds=1.0,
            poll_interval_seconds=0.02,
        )
        assert ok is True

    def test_returns_false_on_timeout(self, tmp_path):
        path = _write(tmp_path, VERIFIER_ROLE, "openai", pid=os.getpid())
        # PID is alive (us) and pid file exists — wait should time out.
        ok = wait_for_shutdown(
            os.getpid(), path,
            timeout_seconds=0.2,
            poll_interval_seconds=0.05,
        )
        assert ok is False


# --------------------------------------------------------------------------
# restart() programmatic entry point
# --------------------------------------------------------------------------

class TestRestartFunction:
    def test_no_pid_file_returns_1(self, tmp_path, capsys):
        rc = restart(VERIFIER_ROLE, "openai", base_dir=str(tmp_path))
        assert rc == 1
        captured = capsys.readouterr()
        assert "no pid file" in captured.err

    def test_stale_pid_file_removed_and_returns_1(self, tmp_path):
        if restart_role.is_pid_alive(999998):
            pytest.skip("999998 alive on this host")
        _write(tmp_path, VERIFIER_ROLE, "openai", pid=999998)
        rc = restart(VERIFIER_ROLE, "openai", base_dir=str(tmp_path))
        assert rc == 1
        # Stale file is removed.
        assert read_pid_file(
            VERIFIER_ROLE, "openai", base_dir=str(tmp_path)
        ) is None

    def test_invalid_role_raises(self, tmp_path):
        with pytest.raises(ValueError):
            restart("fluffer", "openai", base_dir=str(tmp_path))

    def test_no_pid_with_start_spawns_anyway(self, tmp_path, monkeypatch):
        # When --start is set and there is no prior pid file, the helper
        # should still spawn a replacement (the operator wants a daemon
        # running regardless of prior state).
        spawned = {}

        def _fake_spawn(role, provider, base_dir, **kwargs):
            spawned["role"] = role
            spawned["provider"] = provider

            class _P:
                pid = 1
            return _P()

        monkeypatch.setattr(restart_role, "spawn_replacement", _fake_spawn)
        rc = restart(
            VERIFIER_ROLE, "openai",
            base_dir=str(tmp_path),
            start=True,
        )
        assert rc == 0
        assert spawned == {"role": VERIFIER_ROLE, "provider": "openai"}


# --------------------------------------------------------------------------
# Integration: real daemon subprocess gets shut down by restart()
# --------------------------------------------------------------------------

class TestRestartAgainstRealDaemon:
    """Spawns a verifier_role daemon as a real subprocess, then runs
    restart() and asserts the daemon exited and the pid file was removed.

    Cross-platform: we spawn the daemon with CREATE_NEW_PROCESS_GROUP /
    start_new_session so SIGTERM / CTRL_BREAK can terminate just the
    daemon without affecting the test runner.
    """

    def _spawn_daemon(self, tmp_path, role):
        repo_root = Path(__file__).resolve().parents[2]
        ai_router_dir = repo_root / "ai-router"
        module_path = ai_router_dir / f"{role}_role.py"
        env = os.environ.copy()
        # Ensure the daemon's import discipline finds queue_db.py.
        env["PYTHONPATH"] = str(ai_router_dir) + os.pathsep + env.get(
            "PYTHONPATH", ""
        )
        creationflags = 0
        start_new_session = False
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            start_new_session = True
        proc = subprocess.Popen(
            [
                sys.executable,
                str(module_path),
                "--provider", "openai",
                "--base-dir", str(tmp_path),
                "--poll-interval", "0.1",
                "--lease-seconds", "60",
                "--heartbeat-interval", "0.5",
            ],
            env=env,
            creationflags=creationflags,
            start_new_session=start_new_session,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait for the daemon to write the pid file.
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if read_pid_file(role, "openai", base_dir=str(tmp_path)):
                break
            time.sleep(0.1)
        else:
            proc.kill()
            pytest.fail(
                "daemon never wrote pid file within 5s of subprocess start"
            )
        return proc

    def _ensure_terminated(self, proc, timeout=5.0):
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2.0)

    def test_restart_signals_daemon_and_clears_pid_file(self, tmp_path):
        proc = self._spawn_daemon(tmp_path, VERIFIER_ROLE)
        try:
            data = read_pid_file(
                VERIFIER_ROLE, "openai", base_dir=str(tmp_path)
            )
            assert data is not None
            assert data["pid"] == proc.pid

            rc = restart(
                VERIFIER_ROLE, "openai",
                base_dir=str(tmp_path),
                shutdown_timeout=10.0,
            )
            assert rc == 0
            # Daemon should be gone and pid file removed by its own
            # finally block.
            assert read_pid_file(
                VERIFIER_ROLE, "openai", base_dir=str(tmp_path)
            ) is None
            self._ensure_terminated(proc)
            assert proc.returncode is not None
        finally:
            self._ensure_terminated(proc)

    def test_restart_orchestrator_daemon(self, tmp_path):
        proc = self._spawn_daemon(tmp_path, ORCHESTRATOR_ROLE)
        try:
            data = read_pid_file(
                ORCHESTRATOR_ROLE, "openai", base_dir=str(tmp_path)
            )
            assert data is not None and data["pid"] == proc.pid
            rc = restart(
                ORCHESTRATOR_ROLE, "openai",
                base_dir=str(tmp_path),
                shutdown_timeout=10.0,
            )
            assert rc == 0
            assert read_pid_file(
                ORCHESTRATOR_ROLE, "openai", base_dir=str(tmp_path)
            ) is None
            self._ensure_terminated(proc)
        finally:
            self._ensure_terminated(proc)


# --------------------------------------------------------------------------
# CLI argparser
# --------------------------------------------------------------------------

class TestCliArgparser:
    def test_role_required(self, tmp_path):
        with pytest.raises(SystemExit):
            restart_role.main([
                "--provider", "openai",
                "--base-dir", str(tmp_path),
            ])

    def test_role_validated(self, tmp_path):
        with pytest.raises(SystemExit):
            restart_role.main([
                "--role", "no-such-role",
                "--provider", "openai",
                "--base-dir", str(tmp_path),
            ])

    def test_main_returns_1_when_no_pid_file(self, tmp_path):
        rc = restart_role.main([
            "--role", VERIFIER_ROLE,
            "--provider", "openai",
            "--base-dir", str(tmp_path),
        ])
        assert rc == 1
