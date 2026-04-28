"""
utils.py — Small in-process helpers for ai-router.

Consolidates previously-separate helper modules into one file. None of these
helpers make external network calls; they are internal utilities that
reviewers do not need to audit individually.

Sections:
    1. Escalation         — tier-upgrade decisions on weak responses
    2. Rate limiting      — per-provider token-bucket
    3. API key loading    — Windows user-env → process-env shim (dev helper)
    4. conhost cleanup    — Windows orphaned-process cleanup (dev helper)
    5. Dev orphan cleanup — Windows broader orphan cleanup (dev helper)

The Windows helpers (sections 3, 4, and 5) are developer-workflow
conveniences, not production code paths. They are runnable from the
command line via:

    python -m ai_router.utils load-env
    python -m ai_router.utils kill-conhost [--dry-run]
    python -m ai_router.utils kill-stale-claude-polls [--dry-run] [--match-path PATTERN]
    python -m ai_router.utils kill-dotnet-build-servers [--dry-run]
    python -m ai_router.utils cleanup-dev-orphans [--dry-run] [--match-path PATTERN]
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

from .providers import APIResult


# ======================================================================
# 1. Escalation
# ----------------------------------------------------------------------
# Formerly ai-router/escalation.py.
# ======================================================================

def should_escalate(result: APIResult, config: dict) -> bool:
    """Check if a response indicates the model couldn't handle the task."""
    triggers = config["triggers"]

    if triggers.get("empty_response") and not result.content.strip():
        return True

    if triggers.get("max_tokens_hit") and result.stop_reason == "max_tokens":
        return True

    min_tokens = triggers.get("min_output_tokens", 30)
    if result.output_tokens < min_tokens:
        return True

    if triggers.get("refusal_detection"):
        lower = result.content.lower()
        for phrase in config.get("refusal_phrases", []):
            if phrase in lower:
                return True

    return False


def get_escalation_model(
    current_model: str,
    config: dict,
    escalation_count: int,
) -> str | None:
    """Return the next-tier model, or None if max escalations reached."""
    max_esc = config["escalation"]["max_escalations"]
    if escalation_count >= max_esc:
        return None

    current_tier = config["models"][current_model]["tier"]
    next_tier = current_tier + 1

    assignments = config["routing"]["tier_assignments"]
    if next_tier in assignments:
        return assignments[next_tier]

    return None


# ----------------------------------------------------------------------
# Truncation detection
#
# `stop_reason == "max_tokens"` is the authoritative provider signal but
# is NOT sufficient: gemini-pro has been observed to return
# `stop_reason: "end_turn"` on responses that visibly cut off mid-string
# (jet-sql-grammar-and-parser Session 4, 2026-04-27 — 11/24 tests
# generated, response ended with `var sql = "SELECT Reports`). The
# heuristic below catches that case via syntactic-completeness checks.
#
# The orchestrator should consult `RouteResult.truncated` before logging
# a routed call as successful. On truncation, halve the batch and retry
# or fall back in-conversation rather than retrying at the same size.
# ----------------------------------------------------------------------

def detect_truncation(content: str, stop_reason: str) -> bool:
    """Return True if *content* appears truncated.

    Two complementary signals:

    1. ``stop_reason == "max_tokens"`` — provider reports the output cap
       was hit. Authoritative.
    2. Syntactic-incompleteness heuristic — fires on any of:
         - odd count of triple-backtick fences (one is unclosed)
         - more ``{`` than ``}`` (open brace not closed)
         - more ``(`` than ``)`` is intentionally NOT checked, because
           prose containing parentheses produces too many false
           positives. Code-output truncation is reliably caught by the
           brace and fence checks.

    The heuristic is conservative: a clean prose response with no code
    blocks and balanced braces will not flag, even if it lacks a
    sentence-ending period (the bare-verdict case — separately solved
    by the structured-response-format lesson).
    """
    if stop_reason == "max_tokens":
        return True

    stripped = content.rstrip()
    if not stripped:
        return False  # empty response is a different failure mode

    if stripped.count("```") % 2 == 1:
        return True

    if stripped.count("{") > stripped.count("}"):
        return True

    return False


# ======================================================================
# 2. Rate limiting
# ----------------------------------------------------------------------
# Formerly ai-router/rate_limiter.py.
# ======================================================================

class RateLimiter:
    """Simple token-bucket rate limiter per provider."""

    def __init__(self, requests_per_minute: int, tokens_per_minute: int):
        self.rpm = requests_per_minute
        self.tpm = tokens_per_minute
        self._request_times: list[float] = []
        self._lock = threading.Lock()

    def wait(self) -> None:
        """Block until a request slot is available."""
        with self._lock:
            now = time.time()
            window_start = now - 60.0

            # Purge old entries
            self._request_times = [
                t for t in self._request_times if t > window_start
            ]

            if len(self._request_times) >= self.rpm:
                # Wait until the oldest request exits the window
                sleep_until = self._request_times[0] + 60.0
                sleep_duration = sleep_until - now
                if sleep_duration > 0:
                    time.sleep(sleep_duration)

            self._request_times.append(time.time())


# ======================================================================
# 3. API key loading (Windows developer helper)
# ----------------------------------------------------------------------
# Formerly ai-router/utils/load_env.py.
#
# Reads user-scope Windows environment variables through PowerShell and
# copies them into the current process. This exists because Windows
# user-env vars do not automatically propagate into a bash/Claude Code
# subshell. Production deployments should source keys from the container
# or host environment — this helper is for local developer convenience.
# ======================================================================

_REQUIRED_KEYS = ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY")


def load_key(name: str) -> str | None:
    """Read a Windows user-scope environment variable via PowerShell."""
    result = subprocess.run(
        ["powershell", "-Command",
         f"[System.Environment]::GetEnvironmentVariable('{name}', 'User')"],
        capture_output=True, text=True,
    )
    value = result.stdout.strip()
    return value if value else None


def load_api_keys() -> bool:
    """Load provider API keys from Windows user env into os.environ.

    Loads ANTHROPIC_API_KEY, GEMINI_API_KEY, and OPENAI_API_KEY. Returns
    True if every key is present after loading. Prints a message for
    human-visible confirmation.
    """
    for key in _REQUIRED_KEYS:
        if not os.environ.get(key):
            value = load_key(key)
            if value:
                os.environ[key] = value

    missing = [k for k in _REQUIRED_KEYS if not os.environ.get(k)]
    if missing:
        print(f"ERROR: Still missing environment variables: {missing}",
              file=sys.stderr)
        return False

    print("API keys OK")
    return True


# ======================================================================
# 4. conhost cleanup (Windows developer helper)
# ----------------------------------------------------------------------
# Formerly ai-router/utils/kill_conhost.py.
#
# Terminates orphaned Console Window Host processes left behind by .NET
# test/build runners. Uses only tasklist + taskkill which ship with
# Windows — no external dependencies.
# ======================================================================

def find_pids(process_name: str) -> list[int]:
    """Return a list of PIDs for all running instances of process_name."""
    result = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {process_name}",
         "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
    )
    pids: list[int] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("INFO:"):
            continue
        # CSV format: "conhost.exe","1234","Console","1","5,316 K"
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) >= 2:
            try:
                pids.append(int(parts[1]))
            except ValueError:
                pass
    return pids


def kill_tree(pid: int, dry_run: bool = False) -> tuple[bool, str]:
    """Kill a process and its entire child tree using taskkill /F /T.

    Returns (success, message).
    """
    if dry_run:
        return True, f"[dry-run] would kill tree rooted at PID {pid}"

    result = subprocess.run(
        ["taskkill", "/F", "/T", "/PID", str(pid)],
        capture_output=True,
        text=True,
    )
    succeeded = result.returncode == 0
    output = (result.stdout + result.stderr).strip()
    return succeeded, output


def kill_conhost_processes(dry_run: bool = False) -> int:
    """Kill every orphaned conhost.exe process tree.

    Returns the process exit code (0 = success, 1 = Windows required or
    some kills failed). Prints human-readable progress to stdout.
    """
    if sys.platform != "win32":
        print("ERROR: kill_conhost is Windows-only (uses tasklist/taskkill).")
        return 1

    pids = find_pids("conhost.exe")

    if not pids:
        print("No conhost.exe processes found.")
        return 0

    print(f"Found {len(pids)} conhost.exe process(es): {pids}")
    if dry_run:
        print("Dry-run mode — no processes will be killed.\n")

    killed = 0
    failed = 0
    for pid in pids:
        ok, msg = kill_tree(pid, dry_run=dry_run)
        status = "OK" if ok else "FAILED"
        print(f"  PID {pid}: [{status}] {msg}")
        if ok:
            killed += 1
        else:
            failed += 1

    print(f"\nDone. {killed} tree(s) terminated, {failed} failed.")
    return 1 if failed else 0


# ======================================================================
# 5. Dev orphan cleanup (Windows developer helper)
# ----------------------------------------------------------------------
# Broader orphan-process cleanup learned during the worktree-layout
# migration on 2026-04-28. Targets two recurring orphan classes that
# survive an "I closed the IDE" pass and block file-system operations:
#
#   - Stale Claude Code background bash polling loops. When a Claude
#     Code session exits while a background `bash -c "until [ -f ... ];
#     do sleep 5; done"` is still running (typical for parallel
#     session-set monitoring), the bash stays alive forever, polling
#     for a file that may no longer exist, and pins the cwd of
#     whatever directory it was spawned in. Diagnosed via cmdline
#     scan; the giveaway is `shell-snapshots/snapshot-bash-` plus
#     `until [` plus `do sleep`.
#   - Persistent .NET build server workers. `dotnet` leaves MSBuild
#     worker nodes (`/nodemode:1`) and `VBCSCompiler.exe` running
#     between builds for caching. They hold file handles in the
#     directories they last worked in. The canonical release is
#     `dotnet build-server shutdown`, which sends a graceful shutdown
#     and lets them respawn on next build.
#
# These compose with the existing kill_conhost helper (section 4) into
# a single `cleanup-dev-orphans` entry point. Each individual category
# is also runnable on its own.
#
# A `--match-path PATTERN` filter applies to the polling-loop case so
# the operator does not accidentally kill an unrelated bash session
# whose cmdline happens to contain `until`.
# ======================================================================

# Markers used to identify a stale Claude Code background polling loop.
# All three must appear in the cmdline of a bash.exe process.
_CLAUDE_POLL_MARKERS = (
    "shell-snapshots/snapshot-bash-",  # Claude Code shell-snapshot loader
    "until [",                          # the until-loop opener
    "do sleep",                         # the polling sleep
)


def _get_processes_with_cmdline(image_name: str) -> list[tuple[int, str]]:
    """Return [(pid, cmdline)] for every running process matching image_name.

    Uses PowerShell + Get-CimInstance because tasklist does not expose
    the command line. Filters at the WMI layer for speed.
    """
    if sys.platform != "win32":
        return []

    ps_script = (
        f"Get-CimInstance Win32_Process -Filter \"Name='{image_name}'\" "
        f"| ForEach-Object {{ \"$($_.ProcessId)`t$($_.CommandLine)\" }}"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
        capture_output=True, text=True,
    )
    rows: list[tuple[int, str]] = []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        pid_str, _, cmdline = line.partition("\t")
        try:
            rows.append((int(pid_str.strip()), cmdline))
        except ValueError:
            pass
    return rows


def find_stale_claude_polls(match_path: str | None = None) -> list[int]:
    """Return PIDs of bash.exe processes that look like orphan Claude polls.

    A process qualifies if its cmdline contains all of
    ``_CLAUDE_POLL_MARKERS`` (Claude Code shell snapshot + until-loop +
    sleep). If ``match_path`` is given, the cmdline must additionally
    contain that substring — useful to scope the kill to a specific
    repo or container.
    """
    pids: list[int] = []
    for pid, cmdline in _get_processes_with_cmdline("bash.exe"):
        if not all(m in cmdline for m in _CLAUDE_POLL_MARKERS):
            continue
        if match_path and match_path not in cmdline:
            continue
        pids.append(pid)
    return pids


def kill_stale_claude_polls(
    dry_run: bool = False,
    match_path: str | None = None,
) -> int:
    """Kill orphan Claude Code background bash polling loops.

    Returns process exit code. Prints progress to stdout.
    """
    if sys.platform != "win32":
        print("ERROR: kill-stale-claude-polls is Windows-only.")
        return 1

    pids = find_stale_claude_polls(match_path=match_path)
    if not pids:
        scope = f" matching {match_path!r}" if match_path else ""
        print(f"No stale Claude polling loops found{scope}.")
        return 0

    scope = f" (filtered by path={match_path!r})" if match_path else ""
    print(f"Found {len(pids)} stale Claude polling loop(s){scope}: {pids}")
    if dry_run:
        print("Dry-run mode — no processes will be killed.\n")

    killed = failed = 0
    for pid in pids:
        ok, msg = kill_tree(pid, dry_run=dry_run)
        status = "OK" if ok else "FAILED"
        print(f"  PID {pid}: [{status}] {msg}")
        if ok:
            killed += 1
        else:
            failed += 1

    print(f"\nDone. {killed} loop(s) terminated, {failed} failed.")
    return 1 if failed else 0


def kill_dotnet_build_servers(dry_run: bool = False) -> int:
    """Gracefully shut down all .NET build servers (MSBuild + Roslyn + Razor).

    Wraps `dotnet build-server shutdown`. Servers respawn automatically on
    the next dotnet build invocation, so this is non-destructive — it
    just releases any file handles and worker nodes the build infrastructure
    is holding. Returns process exit code.
    """
    if dry_run:
        print("[dry-run] would run: dotnet build-server shutdown")
        return 0

    try:
        result = subprocess.run(
            ["dotnet", "build-server", "shutdown"],
            capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError:
        print("ERROR: dotnet not found in PATH.", file=sys.stderr)
        return 1
    except subprocess.TimeoutExpired:
        print("ERROR: dotnet build-server shutdown timed out after 60s.",
              file=sys.stderr)
        return 1

    output = (result.stdout + result.stderr).strip()
    if output:
        print(output)
    return result.returncode


def cleanup_dev_orphans(
    dry_run: bool = False,
    match_path: str | None = None,
) -> int:
    """Run all dev-orphan cleanup categories in sequence.

    Order: build servers → stale Claude polls → conhost. Build servers
    first because shutting them down can release downstream conhosts;
    polls before conhost for the same reason. Returns the worst exit
    code from any category (1 if any failed, 0 if all clean).
    """
    if sys.platform != "win32":
        print("ERROR: cleanup-dev-orphans is Windows-only.")
        return 1

    print("=== dotnet build servers ===")
    rc1 = kill_dotnet_build_servers(dry_run=dry_run)
    print()

    print("=== stale Claude Code polling loops ===")
    rc2 = kill_stale_claude_polls(dry_run=dry_run, match_path=match_path)
    print()

    print("=== orphan conhost.exe ===")
    rc3 = kill_conhost_processes(dry_run=dry_run)

    return max(rc1, rc2, rc3)


# ======================================================================
# Command-line dispatcher
# ----------------------------------------------------------------------
# Lets developers run any Windows helper from the command line:
#     python -m ai_router.utils load-env
#     python -m ai_router.utils kill-conhost [--dry-run]
#     python -m ai_router.utils kill-stale-claude-polls [--dry-run] [--match-path PATTERN]
#     python -m ai_router.utils kill-dotnet-build-servers [--dry-run]
#     python -m ai_router.utils cleanup-dev-orphans [--dry-run] [--match-path PATTERN]
# ======================================================================

_USAGE = (
    "Usage: python -m ai_router.utils <command> [options]\n"
    "Commands:\n"
    "  load-env\n"
    "  kill-conhost [--dry-run]\n"
    "  kill-stale-claude-polls [--dry-run] [--match-path PATTERN]\n"
    "  kill-dotnet-build-servers [--dry-run]\n"
    "  cleanup-dev-orphans [--dry-run] [--match-path PATTERN]"
)


def _extract_match_path(argv: list[str]) -> str | None:
    """Extract --match-path PATTERN from argv. Returns None if absent."""
    if "--match-path" not in argv:
        return None
    idx = argv.index("--match-path")
    if idx + 1 >= len(argv):
        return None
    return argv[idx + 1]


def _cli_main(argv: list[str]) -> int:
    if len(argv) < 1:
        print(_USAGE, file=sys.stderr)
        return 2

    command = argv[0]
    rest = argv[1:]
    dry_run = "--dry-run" in rest

    if command == "load-env":
        return 0 if load_api_keys() else 1
    if command == "kill-conhost":
        return kill_conhost_processes(dry_run=dry_run)
    if command == "kill-stale-claude-polls":
        return kill_stale_claude_polls(
            dry_run=dry_run,
            match_path=_extract_match_path(rest),
        )
    if command == "kill-dotnet-build-servers":
        return kill_dotnet_build_servers(dry_run=dry_run)
    if command == "cleanup-dev-orphans":
        return cleanup_dev_orphans(
            dry_run=dry_run,
            match_path=_extract_match_path(rest),
        )

    print(f"Unknown command: {command}\n\n{_USAGE}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(_cli_main(sys.argv[1:]))
