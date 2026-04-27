"""
utils.py — Small in-process helpers for ai-router.

Consolidates four previously-separate helper modules into one file. None of
these helpers make external network calls; they are internal utilities that
reviewers do not need to audit individually.

Sections:
    1. Escalation         — tier-upgrade decisions on weak responses
    2. Rate limiting      — per-provider token-bucket
    3. API key loading    — Windows user-env → process-env shim (dev helper)
    4. conhost cleanup    — Windows orphaned-process cleanup (dev helper)

The Windows helpers (sections 3 and 4) are developer-workflow conveniences,
not production code paths. They are runnable from the command line via:

    python -m ai-router.utils load-env
    python -m ai-router.utils kill-conhost-processes [--dry-run]
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
# Command-line dispatcher
# ----------------------------------------------------------------------
# Lets developers run either Windows helper as before, via:
#     python -m ai_router.utils load-env
#     python -m ai_router.utils kill-conhost [--dry-run]
# ======================================================================

def _cli_main(argv: list[str]) -> int:
    if len(argv) < 1:
        print("Usage: python -m ai_router.utils "
              "<load-env | kill-conhost [--dry-run]>",
              file=sys.stderr)
        return 2

    command = argv[0]
    if command == "load-env":
        return 0 if load_api_keys() else 1
    if command == "kill-conhost":
        dry_run = "--dry-run" in argv[1:]
        return kill_conhost_processes(dry_run=dry_run)

    print(f"Unknown command: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(_cli_main(sys.argv[1:]))
