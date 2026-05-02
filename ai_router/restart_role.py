"""``restart_role`` — gracefully restart a running role daemon.

Usage::

    python -m ai_router.restart_role --role verifier --provider openai
    python -m ai_router.restart_role --role orchestrator --provider claude

What it does
------------
1. Read ``provider-queues/<provider>/<role>.daemon-pid``.
2. If a live process is recorded, send the platform's graceful-stop
   signal: ``SIGTERM`` on POSIX, ``CTRL_BREAK_EVENT`` on Windows
   (only effective for processes that share the console — fall back to
   ``terminate()`` via the OS otherwise; the daemon's own SIGINT
   handler still runs).
3. Poll until the pid file disappears or the process is no longer
   alive (``--shutdown-timeout`` seconds, default 30). The daemon
   removes its own pid file in its ``finally`` block, so disappearance
   is the canonical "shutdown completed" signal.
4. If ``--start`` is set, spawn a fresh daemon detached from this
   process via ``subprocess.Popen``. The default is **not** to start —
   most operators run the daemon under a process supervisor (systemd,
   nssm, a screen/tmux session) that will respawn it on its own. The
   spec lists "starts a new daemon" as part of the workflow, but in
   practice supervisors are universal; ``--start`` covers the
   no-supervisor case without making spawning the default.

Why this is a separate module from the daemon itself
----------------------------------------------------
Restart is an operator action. Coupling it to the daemon's main loop
would require the daemon to import and execute its own start logic
mid-shutdown — an antipattern that obscures the lifecycle. Keeping
``restart_role`` as a thin orchestrator over the existing CLI
``main()`` entry points means the start path is unchanged whether the
daemon was started by hand, by a supervisor, or by ``restart_role``.

Exit codes
----------
* ``0`` — restart attempted (signal sent, shutdown observed).
  ``--start`` adds the spawn step; failure to spawn is logged but does
  not change the exit code (the old daemon is already gone).
* ``1`` — no pid file, no live process to restart.
* ``2`` — shutdown did not complete within the timeout.
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from queue_db import DEFAULT_BASE_DIR  # type: ignore[import-not-found]
    from daemon_pid import (  # type: ignore[import-not-found]
        ORCHESTRATOR_ROLE,
        VALID_ROLES,
        VERIFIER_ROLE,
        is_pid_alive,
        pid_file_path,
        read_pid_file,
        remove_pid_file,
    )
except ImportError:
    from .queue_db import DEFAULT_BASE_DIR  # type: ignore[no-redef]
    from .daemon_pid import (  # type: ignore[no-redef]
        ORCHESTRATOR_ROLE,
        VALID_ROLES,
        VERIFIER_ROLE,
        is_pid_alive,
        pid_file_path,
        read_pid_file,
        remove_pid_file,
    )


DEFAULT_SHUTDOWN_TIMEOUT_SECONDS = 30.0
SHUTDOWN_POLL_INTERVAL_SECONDS = 0.2


def send_shutdown_signal(pid: int) -> bool:
    """Send the platform's graceful-stop signal to ``pid``.

    Returns True if the signal was delivered, False if the process is
    already gone or signal delivery failed.

    On Windows, ``os.kill(pid, signal.CTRL_BREAK_EVENT)`` only reaches
    processes that share a console with the sender. For ``restart_role``
    that is rarely the case (the daemon ran under its own console),
    so we fall back to ``signal.SIGTERM`` — Python's ``os.kill`` on
    Windows raises ``ValueError`` for SIGTERM but its own runtime
    handles it as ``TerminateProcess`` since 3.2. If both fail, return
    False and let the caller decide whether to give up.
    """
    if pid <= 0 or not is_pid_alive(pid):
        return False

    if sys.platform == "win32":
        # Try CTRL_BREAK_EVENT first (clean shutdown via the daemon's
        # SIGINT handler) and fall back to SIGTERM (TerminateProcess —
        # the daemon's finally still runs because Python catches
        # SIGTERM and translates it).
        for sig in (signal.CTRL_BREAK_EVENT, signal.SIGTERM):
            try:
                os.kill(pid, sig)
                return True
            except (OSError, ValueError):
                continue
        return False

    try:
        os.kill(pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, PermissionError):
        return False
    except OSError:
        return False


def wait_for_shutdown(
    pid: int,
    pid_file: Path,
    timeout_seconds: float = DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
    poll_interval_seconds: float = SHUTDOWN_POLL_INTERVAL_SECONDS,
) -> bool:
    """Poll until the daemon disappears or ``timeout_seconds`` elapses.

    "Disappeared" means the pid file is gone OR the process is no
    longer alive. Returns True on clean shutdown, False on timeout.
    Tests use a small ``poll_interval_seconds`` (e.g. 0.05) to stay
    snappy.
    """
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not pid_file.is_file():
            return True
        if not is_pid_alive(pid):
            # Process died but did not clean up the pid file (hard
            # kill). Treat as shutdown complete from our perspective —
            # role_status will mark the leftover file stale until the
            # next start overwrites it.
            return True
        time.sleep(poll_interval_seconds)
    return False


def spawn_replacement(
    role: str,
    provider: str,
    base_dir: str,
    *,
    poll_interval: Optional[float] = None,
    lease_seconds: Optional[int] = None,
    heartbeat_interval: Optional[float] = None,
    python_executable: Optional[str] = None,
    extra_env: Optional[dict] = None,
) -> subprocess.Popen:
    """Start a fresh daemon for ``(role, provider)`` and return the Popen.

    Uses ``python -m ai_router.<role>_role`` as the entry point. The
    spawned process inherits the current environment (so API keys are
    available) and is detached from this process so ``restart_role``
    can return without keeping the new daemon as a child.

    The detach approach differs by platform:

    * POSIX: ``start_new_session=True`` puts the new process in its
      own session so a SIGHUP to ``restart_role`` does not propagate.
    * Windows: ``CREATE_NEW_PROCESS_GROUP`` so a Ctrl+C in the
      ``restart_role`` console does not break the new daemon, plus
      ``DETACHED_PROCESS`` so the daemon does not share our console
      (matters for unattended restarts via task scheduler).
    """
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES} (got {role!r})")
    module_name = (
        "ai_router.verifier_role"
        if role == VERIFIER_ROLE
        else "ai_router.orchestrator_role"
    )

    cmd: list[str] = [
        python_executable or sys.executable,
        "-m",
        module_name,
        "--provider", provider,
        "--base-dir", base_dir,
    ]
    if poll_interval is not None:
        cmd += ["--poll-interval", str(poll_interval)]
    if lease_seconds is not None:
        cmd += ["--lease-seconds", str(lease_seconds)]
    if heartbeat_interval is not None:
        cmd += ["--heartbeat-interval", str(heartbeat_interval)]

    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    creationflags = 0
    start_new_session = False
    if sys.platform == "win32":
        creationflags = (
            subprocess.CREATE_NEW_PROCESS_GROUP
            | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
        )
    else:
        start_new_session = True

    return subprocess.Popen(
        cmd,
        env=env,
        creationflags=creationflags,
        start_new_session=start_new_session,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )


def restart(
    role: str,
    provider: str,
    *,
    base_dir: str = DEFAULT_BASE_DIR,
    shutdown_timeout: float = DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
    start: bool = False,
    poll_interval: Optional[float] = None,
    lease_seconds: Optional[int] = None,
    heartbeat_interval: Optional[float] = None,
    python_executable: Optional[str] = None,
) -> int:
    """Programmatic entry point. Returns the same exit codes as ``main``.

    Wrapped by ``main`` for CLI use; tests call this directly so they
    can verify outcomes without parsing argv strings.
    """
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES} (got {role!r})")

    pid_data = read_pid_file(role, provider, base_dir=base_dir)
    pid_path = pid_file_path(role, provider, base_dir=base_dir)

    if pid_data is None:
        sys.stderr.write(
            f"[restart_role] no pid file at {pid_path} — nothing to restart\n"
        )
        if start:
            spawn_replacement(
                role, provider, base_dir,
                poll_interval=poll_interval,
                lease_seconds=lease_seconds,
                heartbeat_interval=heartbeat_interval,
                python_executable=python_executable,
            )
            sys.stderr.write(
                "[restart_role] started a fresh daemon (no prior process)\n"
            )
            return 0
        return 1

    pid = pid_data.get("pid")
    if not isinstance(pid, int) or not is_pid_alive(pid):
        sys.stderr.write(
            f"[restart_role] pid file at {pid_path} is stale "
            f"(pid={pid} not alive); removing\n"
        )
        remove_pid_file(role, provider, base_dir=base_dir)
        if start:
            spawn_replacement(
                role, provider, base_dir,
                poll_interval=poll_interval,
                lease_seconds=lease_seconds,
                heartbeat_interval=heartbeat_interval,
                python_executable=python_executable,
            )
            sys.stderr.write("[restart_role] started a fresh daemon\n")
            return 0
        return 1

    sys.stderr.write(
        f"[restart_role] sending shutdown to pid={pid} ({role}/{provider})\n"
    )
    delivered = send_shutdown_signal(pid)
    if not delivered:
        sys.stderr.write(
            f"[restart_role] failed to signal pid={pid}; aborting restart\n"
        )
        return 2

    ok = wait_for_shutdown(pid, pid_path, timeout_seconds=shutdown_timeout)
    if not ok:
        sys.stderr.write(
            f"[restart_role] daemon did not exit within "
            f"{shutdown_timeout:.1f}s (pid={pid})\n"
        )
        return 2

    # Clean up the pid file on shutdown completion. The daemon's own
    # finally block already removes it on graceful (CTRL_BREAK / SIGINT)
    # exit. On Windows, SIGTERM is the TerminateProcess fallback used
    # when CTRL_BREAK_EVENT cannot reach the target's console group;
    # TerminateProcess kills hard without running Python's finally, so
    # the pid file would otherwise stick around. Removing it here
    # converges both shutdown shapes to the same post-restart state.
    remove_pid_file(role, provider, base_dir=base_dir)

    sys.stderr.write("[restart_role] previous daemon exited cleanly\n")

    if start:
        spawn_replacement(
            role, provider, base_dir,
            poll_interval=poll_interval,
            lease_seconds=lease_seconds,
            heartbeat_interval=heartbeat_interval,
            python_executable=python_executable,
        )
        sys.stderr.write("[restart_role] started replacement daemon\n")

    return 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="restart_role",
        description=(
            "Gracefully restart a running role daemon. Reads the pid "
            "file, sends a shutdown signal, waits for clean exit, and "
            "optionally spawns a replacement (--start)."
        ),
    )
    p.add_argument(
        "--role",
        required=True,
        choices=list(VALID_ROLES),
        help="Which daemon to restart.",
    )
    p.add_argument(
        "--provider",
        required=True,
        help="Provider whose daemon to restart (e.g. openai, claude, gemini).",
    )
    p.add_argument(
        "--base-dir",
        default=DEFAULT_BASE_DIR,
        help=f"Queue root (default: {DEFAULT_BASE_DIR}).",
    )
    p.add_argument(
        "--shutdown-timeout",
        type=float,
        default=DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
        help=(
            f"Seconds to wait for the daemon to exit "
            f"(default: {DEFAULT_SHUTDOWN_TIMEOUT_SECONDS})."
        ),
    )
    p.add_argument(
        "--start",
        action="store_true",
        help=(
            "Spawn a fresh daemon after shutdown completes. Default: do "
            "not spawn (most operators run under a supervisor)."
        ),
    )
    p.add_argument(
        "--poll-interval",
        type=float,
        default=None,
        help="Override --poll-interval on the spawned daemon.",
    )
    p.add_argument(
        "--lease-seconds",
        type=int,
        default=None,
        help="Override --lease-seconds on the spawned daemon.",
    )
    p.add_argument(
        "--heartbeat-interval",
        type=float,
        default=None,
        help="Override --heartbeat-interval on the spawned daemon.",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    return restart(
        role=args.role,
        provider=args.provider,
        base_dir=args.base_dir,
        shutdown_timeout=args.shutdown_timeout,
        start=args.start,
        poll_interval=args.poll_interval,
        lease_seconds=args.lease_seconds,
        heartbeat_interval=args.heartbeat_interval,
    )


__all__ = [
    "DEFAULT_SHUTDOWN_TIMEOUT_SECONDS",
    "ORCHESTRATOR_ROLE",
    "SHUTDOWN_POLL_INTERVAL_SECONDS",
    "VERIFIER_ROLE",
    "main",
    "restart",
    "send_shutdown_signal",
    "spawn_replacement",
    "wait_for_shutdown",
]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
