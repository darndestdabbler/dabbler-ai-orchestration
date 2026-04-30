"""``role_status`` — report the state of running role daemons.

Usage::

    python -m ai_router.role_status                    # all providers
    python -m ai_router.role_status --provider openai  # one provider
    python ai-router/role_status.py                    # script form
    python ai-router/role_status.py --json             # machine-readable

What it reports
---------------
For each ``provider-queues/<provider>/`` directory:

* Verifier daemon and orchestrator daemon presence (via pid files)
* Whether each daemon's PID is alive (``alive``), missing (``stopped``),
  or stale (pid file exists but process is gone — ``stale``)
* Worker id, started_at, lease_seconds, heartbeat_interval (from pid file)
* Currently-claimed messages by this worker_id, and the most recent
  ``last_heartbeat_at`` across them
* Queue counts by state (new / claimed / completed / failed / timed_out)
* Stale-worker detection: a worker is *unhealthy* if it has at least one
  claimed message whose last heartbeat is older than ``2 * lease_seconds``
  (per spec: "if a worker hasn't heartbeated in 2x lease window, mark it
  stale"). The follow-up ``reclaim_expired`` call rolls the message back
  on the next claim cycle, so this surface is informational — the
  recovery action is automatic.

Exit codes
----------
* ``0`` — report rendered (regardless of daemon health).
* Non-zero only on argument parse errors.

The command never modifies state.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from queue_db import (  # type: ignore[import-not-found]
        DEFAULT_BASE_DIR,
        QueueDB,
    )
    from daemon_pid import (  # type: ignore[import-not-found]
        ORCHESTRATOR_ROLE,
        VALID_ROLES,
        VERIFIER_ROLE,
        is_pid_alive,
        read_pid_file,
    )
except ImportError:
    from .queue_db import (  # type: ignore[no-redef]
        DEFAULT_BASE_DIR,
        QueueDB,
    )
    from .daemon_pid import (  # type: ignore[no-redef]
        ORCHESTRATOR_ROLE,
        VALID_ROLES,
        VERIFIER_ROLE,
        is_pid_alive,
        read_pid_file,
    )


# Multiplier for the "stale worker" heuristic. The spec says "if a worker
# hasn't heartbeated in 2x lease window, mark it stale". 2.0 is the
# documented value; tests assert against this constant.
STALE_HEARTBEAT_MULTIPLIER = 2.0


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # fromisoformat is tolerant of timezone-aware strings on Python
        # 3.11+. The pid-file writer always emits a tz-aware ISO string;
        # queue heartbeats use _utc_now (UTC) so both branches are tz-aware.
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _list_providers(base_dir: str) -> list[str]:
    """Return the list of provider directories under ``base_dir``.

    A "provider directory" is any subdirectory containing either a
    ``queue.db`` file or a daemon-pid file. Directories that match
    neither are ignored — base_dir may also house ad-hoc artifacts
    (e.g., tests' temporary subfolders).
    """
    if not os.path.isdir(base_dir):
        return []
    out: list[str] = []
    for name in sorted(os.listdir(base_dir)):
        path = Path(base_dir) / name
        if not path.is_dir():
            continue
        has_queue = (path / "queue.db").is_file()
        has_pid = any(
            (path / f"{role}.daemon-pid").is_file() for role in VALID_ROLES
        )
        if has_queue or has_pid:
            out.append(name)
    return out


def _claimed_by_worker(
    queue_db_path: Path, worker_id: str
) -> tuple[list[dict], Optional[str]]:
    """Return (rows-claimed-by-worker, latest_last_heartbeat_at).

    Each row is a dict with id, task_type, claimed_at, lease_expires_at,
    last_heartbeat_at, attempts. Reading directly via sqlite3 avoids
    instantiating a QueueDB just to query — and lets us read across
    arbitrary providers without re-creating connections per provider.
    """
    if not queue_db_path.is_file():
        return [], None
    try:
        conn = sqlite3.connect(str(queue_db_path), timeout=5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, task_type, claimed_at, lease_expires_at,
                   last_heartbeat_at, attempts
              FROM messages
             WHERE state = 'claimed' AND claimed_by = ?
             ORDER BY claimed_at ASC
            """,
            (worker_id,),
        ).fetchall()
    except sqlite3.Error:
        return [], None
    finally:
        try:
            conn.close()  # type: ignore[possibly-unbound]
        except Exception:  # noqa: BLE001
            pass

    out: list[dict] = []
    latest_hb: Optional[str] = None
    for row in rows:
        d = dict(row)
        out.append(d)
        hb = d.get("last_heartbeat_at")
        if hb and (latest_hb is None or hb > latest_hb):
            latest_hb = hb
    return out, latest_hb


def _detect_health(
    pid_data: Optional[dict],
    latest_heartbeat: Optional[str],
) -> str:
    """Return one of: ``stopped`` / ``stale`` / ``unhealthy`` / ``alive``.

    * ``stopped`` — pid file is missing.
    * ``stale``   — pid file exists but the process is gone (was killed
      without a graceful shutdown).
    * ``unhealthy`` — process is alive but has at least one claimed
      message whose last heartbeat is older than
      ``STALE_HEARTBEAT_MULTIPLIER * lease_seconds`` (or is NULL with a
      claim older than the same threshold).
    * ``alive`` — process is running and heartbeats are current.
    """
    if pid_data is None:
        return "stopped"
    pid = pid_data.get("pid")
    if not isinstance(pid, int) or not is_pid_alive(pid):
        return "stale"
    if latest_heartbeat is None:
        return "alive"
    last_hb = _parse_iso(latest_heartbeat)
    if last_hb is None:
        return "alive"
    lease = pid_data.get("lease_seconds")
    if not isinstance(lease, (int, float)) or lease <= 0:
        return "alive"
    threshold = lease * STALE_HEARTBEAT_MULTIPLIER
    age = (datetime.now(timezone.utc) - last_hb).total_seconds()
    if age > threshold:
        return "unhealthy"
    return "alive"


def collect_status(
    base_dir: str = DEFAULT_BASE_DIR,
    providers: Optional[Iterable[str]] = None,
) -> list[dict]:
    """Return one report row per (provider, role) with a queue or pid file.

    Each row contains the pid-file payload (if present), the list of
    messages currently claimed by the worker, the latest heartbeat
    timestamp across them, queue counts by state, and a derived
    ``health`` string. Pure data — the renderer formats it.
    """
    rows: list[dict] = []
    discovered = list(providers) if providers else _list_providers(base_dir)

    for provider in discovered:
        provider_dir = Path(base_dir) / provider
        queue_db_path = provider_dir / "queue.db"

        # Queue counts (provider-level, not per-role) come from the
        # canonical QueueDB so unfamiliar tests that pre-create the DB
        # via QueueDB still get the same numbers role_status reports.
        try:
            counts = QueueDB(provider=provider, base_dir=base_dir).count_by_state()
        except Exception:  # noqa: BLE001
            counts = {}

        for role in VALID_ROLES:
            pid_data = read_pid_file(role, provider, base_dir=base_dir)
            worker_id = pid_data.get("worker_id") if pid_data else None
            claimed: list[dict] = []
            latest_hb: Optional[str] = None
            if worker_id:
                claimed, latest_hb = _claimed_by_worker(
                    queue_db_path, worker_id
                )
            health = _detect_health(pid_data, latest_hb)

            # If neither a pid file nor any queue DB exists for this
            # role, skip — nothing to report on.
            if pid_data is None and not queue_db_path.is_file():
                continue

            rows.append({
                "provider": provider,
                "role": role,
                "health": health,
                "pid_file": pid_data,
                "claimed_messages": claimed,
                "latest_heartbeat": latest_hb,
                "queue_counts": counts,
            })

    return rows


def render_text(rows: list[dict]) -> str:
    """Format the collected rows as an ASCII-only terminal report.

    Matches the style of ``print_session_set_status`` (lessons-learned
    "ASCII-Only Glyphs In Cross-Platform Terminal Output") so a
    Windows ``cp1252`` console will not crash mid-report.
    """
    if not rows:
        return "(no role daemons found)\n"

    health_glyph = {
        "alive":     "[+]",
        "alive*":    "[+]",
        "unhealthy": "[!]",
        "stale":     "[x]",
        "stopped":   "[ ]",
    }

    out: list[str] = []
    out.append("=" * 72)
    out.append("ROLE-DAEMON STATUS")
    out.append("=" * 72)
    for row in rows:
        glyph = health_glyph.get(row["health"], "[?]")
        provider = row["provider"]
        role = row["role"]
        pid_data = row["pid_file"]
        claimed = row["claimed_messages"]
        latest_hb = row["latest_heartbeat"]
        counts = row["queue_counts"]

        out.append(f"{glyph} {provider}/{role}: {row['health']}")
        if pid_data:
            out.append(
                f"    pid={pid_data.get('pid')} "
                f"worker_id={pid_data.get('worker_id')} "
                f"started_at={pid_data.get('started_at')}"
            )
            out.append(
                f"    lease_seconds={pid_data.get('lease_seconds')} "
                f"heartbeat_interval={pid_data.get('heartbeat_interval')}"
            )
        else:
            out.append("    pid file not present")

        out.append(
            f"    claimed_by_worker={len(claimed)} "
            f"latest_heartbeat={latest_hb or '-'}"
        )
        if claimed:
            for c in claimed[:5]:
                out.append(
                    f"      - id={c['id'][:8]}.. task={c['task_type']} "
                    f"claimed_at={c['claimed_at']} "
                    f"lease_expires_at={c['lease_expires_at']} "
                    f"last_heartbeat_at={c['last_heartbeat_at'] or '-'} "
                    f"attempts={c['attempts']}"
                )
            if len(claimed) > 5:
                out.append(f"      ... and {len(claimed) - 5} more")

        if counts:
            counts_str = ", ".join(
                f"{state}={n}" for state, n in sorted(counts.items())
            )
            out.append(f"    queue: {counts_str}")
        out.append("")

    out.append("=" * 72)
    return "\n".join(out) + "\n"


def render_json(rows: list[dict]) -> str:
    """Machine-readable JSON form of ``collect_status``."""
    return json.dumps(rows, indent=2, sort_keys=True, default=str)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="role_status",
        description=(
            "Report the state of running verifier_role and "
            "orchestrator_role daemons. Surfaces stale workers and "
            "unhealthy heartbeats but never modifies state."
        ),
    )
    p.add_argument(
        "--provider",
        action="append",
        help=(
            "Restrict to one or more providers. May be repeated. "
            "Default: report every provider with a queue or pid file."
        ),
    )
    p.add_argument(
        "--base-dir",
        default=DEFAULT_BASE_DIR,
        help=f"Queue root (default: {DEFAULT_BASE_DIR}).",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of the human-readable report.",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    rows = collect_status(base_dir=args.base_dir, providers=args.provider)
    output = render_json(rows) if args.json else render_text(rows)
    sys.stdout.write(output)
    if not output.endswith("\n"):
        sys.stdout.write("\n")
    return 0


__all__ = [
    "ORCHESTRATOR_ROLE",
    "STALE_HEARTBEAT_MULTIPLIER",
    "VERIFIER_ROLE",
    "collect_status",
    "main",
    "render_json",
    "render_text",
]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
