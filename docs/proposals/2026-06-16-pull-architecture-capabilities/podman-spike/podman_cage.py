"""Podman feasibility-spike harness (pre-Set-069). NOT production code.

Proves the mechanics of the model-authored-execution cage the proposal adopts:
a probe runs confined in a **rootless Podman container** -- network-denied,
read-only repo mount, writable tmpfs scratch, dropped caps, hard wall-clock
timeout -- and the **raw** exit code + stdout/stderr come back, with the
container torn down on every path. This is `run_test_sandbox`'s sibling: the
isolation mechanism is `podman run` instead of `git worktree add`. It graduates
into `ai_router/` only after a GREEN spike (proposal sec 3.6).

Design invariants mirrored from run_test_sandbox:
- The harness builds the argv; a model would only ever supply the probe argv /
  typed template args, never `podman` flags (token-frugal, bounded surface).
- shell=False always; raw output captured verbatim (deterministic servant).
- Teardown is crash-safe: `--rm` + a `--name`-keyed `podman rm -f` on timeout.

Cross-platform: shells out to the `podman` CLI, so it runs on Windows (via the
WSL2-backed `podman machine`) and on Linux CI alike.
"""
from __future__ import annotations

import dataclasses
import subprocess
import time
import uuid
from pathlib import Path
from typing import List, Optional, Sequence


@dataclasses.dataclass(frozen=True)
class ProbeResult:
    ran: bool
    exit_code: Optional[int]      # None if killed (timeout) or never ran
    timed_out: bool
    stdout: str
    stderr: str
    wall_seconds: float
    container_removed: bool       # True iff no container with our name survives
    argv: tuple                   # the full podman argv actually run (provenance)
    error: Optional[str] = None   # raw setup/teardown error, else None


def podman_available() -> Optional[str]:
    """Return the `podman version` line, or None if podman is not usable."""
    try:
        r = subprocess.run(["podman", "version", "--format", "{{.Client.Version}}"],
                           capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _container_exists(name: str) -> bool:
    try:
        r = subprocess.run(["podman", "ps", "-a", "--filter", f"name=^{name}$",
                            "--format", "{{.Names}}"],
                           capture_output=True, text=True, timeout=30)
        return name in r.stdout.split()
    except (OSError, subprocess.SubprocessError):
        return False


def run_probe_in_container(
    image: str,
    probe_argv: Sequence[str],
    *,
    repo_root: Path,
    timeout_seconds: float = 30.0,
    memory: str = "512m",
    pids_limit: int = 256,
    cpus: str = "2",
    output_byte_cap: int = 60_000,
) -> ProbeResult:
    """Run ``probe_argv`` inside a locked-down, disposable Podman container.

    Containment flags (the whole point of the spike):
      --network=none          no network at all
      --read-only             read-only container rootfs
      -v <repo>:/repo:ro      repo snapshot mounted READ-ONLY
      --tmpfs /scratch:rw     the only writable place (ephemeral)
      --cap-drop=ALL          drop all Linux capabilities
      --security-opt=no-new-privileges
      --memory / --pids-limit / --cpus   resource caps
      --rm                    auto-remove on exit (teardown)
    """
    repo_root = Path(repo_root).resolve()
    name = f"pull-spike-{uuid.uuid4().hex[:12]}"
    argv: List[str] = [
        "podman", "run", "--rm", "--name", name,
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        f"--memory={memory}",
        f"--pids-limit={pids_limit}",
        f"--cpus={cpus}",
        "--tmpfs", "/scratch:rw,size=64m,mode=1777",
        "-v", f"{repo_root}:/repo:ro",
        "-w", "/scratch",
        image,
        *[str(a) for a in probe_argv],
    ]

    started = time.monotonic()
    timed_out = False
    exit_code: Optional[int] = None
    out = err = ""
    setup_err: Optional[str] = None
    try:
        proc = subprocess.run(argv, capture_output=True, text=True,
                              timeout=timeout_seconds)
        exit_code = proc.returncode
        out = proc.stdout or ""
        err = proc.stderr or ""
    except subprocess.TimeoutExpired as te:
        timed_out = True
        out = (te.stdout or b"").decode("utf-8", "replace") if isinstance(te.stdout, bytes) else (te.stdout or "")
        err = (te.stderr or b"").decode("utf-8", "replace") if isinstance(te.stderr, bytes) else (te.stderr or "")
        # crash-safe teardown: the timed-out container is force-removed by name.
        try:
            subprocess.run(["podman", "rm", "-f", name],
                          capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError) as exc:
            setup_err = f"force-remove after timeout failed: {exc}"
    except (OSError, subprocess.SubprocessError) as exc:
        setup_err = f"podman run failed to launch: {exc}"
    wall = time.monotonic() - started

    # Output cap (raw head slice, ASCII marker -- mirrors run_test_sandbox).
    def _cap(s: str) -> str:
        b = s.encode("utf-8", "replace")
        if len(b) <= output_byte_cap:
            return s
        return b[:output_byte_cap].decode("utf-8", "replace") + \
            f"\n[... elided {len(b) - output_byte_cap} bytes ...]"

    removed = not _container_exists(name)
    return ProbeResult(
        ran=(exit_code is not None or timed_out),
        exit_code=exit_code,
        timed_out=timed_out,
        stdout=_cap(out),
        stderr=_cap(err),
        wall_seconds=round(wall, 3),
        container_removed=removed,
        argv=tuple(argv),
        error=setup_err,
    )
