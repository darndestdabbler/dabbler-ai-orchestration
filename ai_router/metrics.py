"""Append-only metrics ledger for the router.

One JSON object per line in ``router-metrics.jsonl`` — no wrapping array,
additive schema (new fields never break old lines), safe to stream with jq.
Writing is best-effort and never raises: metrics must never break a routed
call that already succeeded and was already paid for.

**Tokens are recorded and dollars are not computed.** Reconciliation happens
out of band, against the vendor's own console: a repository names its own API
key per provider, so the join between these token counts and the vendor's
dollars is the key itself. Seat spend is not attributable per session and is
not estimated — ``billed_usage_unavailable`` marks the rows a seat transport
produced, and ``transport_session_id`` (the CLI conversation id) is what
``ai_router.seat_cost`` prices them by.
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
from typing import Optional

_THIS_DIR = Path(__file__).parent


def _log_path(config: dict) -> Path:
    """``AI_ROUTER_METRICS_PATH`` env var > alongside the loaded config file
    > the package directory."""
    metrics_cfg = config.get("metrics", {}) or {}
    filename = metrics_cfg.get("log_filename", "router-metrics.jsonl")

    override = os.environ.get("AI_ROUTER_METRICS_PATH")
    if override:
        return Path(override)
    config_path = config.get("_config_path")
    if config_path:
        return Path(config_path).parent / filename
    return _THIS_DIR / filename


def _metrics_enabled(config: dict) -> bool:
    return bool((config.get("metrics", {}) or {}).get("enabled", True))


def record_call(
    config: dict,
    *,
    call_type: str,                    # "route" | "verify"
    task_type: str,
    model: str,                        # registry alias (or catalog id on copilot)
    provider: str,
    generation_params: dict,
    input_tokens: int,
    output_tokens: int,
    elapsed_seconds: float,
    escalated: bool,
    stop_reason: str,
    session_number: Optional[int] = None,
    requested_model_id: Optional[str] = None,
    served_model_id: Optional[str] = None,
    transport: Optional[str] = None,
    billed_usage_unavailable: Optional[bool] = None,
    transport_session_id: Optional[str] = None,
    verifier_of: Optional[str] = None,
    verdict: Optional[str] = None,
    issue_count: Optional[int] = None,
) -> None:
    """Append one record. Never raises — a write failure (disk full,
    permissions) skips silently rather than breaking the routed call."""
    if not _metrics_enabled(config):
        return

    effort = None
    thinking_on = False
    generation_params = generation_params or {}
    if provider == "anthropic":
        effort = generation_params.get("effort")
        thinking_on = bool(
            (generation_params.get("thinking") or {}).get("enabled")
        )
    elif provider == "google":
        effort = generation_params.get("thinking_level")
        budget = generation_params.get("thinking_budget")
        thinking_on = (effort is not None) or (
            budget is not None and budget != 0
        )
    elif provider == "openai":
        effort = generation_params.get("reasoning_effort")
        thinking_on = effort not in (None, "none", "minimal")

    record = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "session_number": session_number,
        "call_type": call_type,
        "task_type": task_type,
        "model": model,
        "requested_model_id": requested_model_id,
        "served_model_id": served_model_id,
        # Tri-state: True/False only when BOTH ids are known, else null —
        # an absent id does not establish that the provider served what was
        # asked for.
        "served_model_mismatch": (
            (requested_model_id != served_model_id)
            if (requested_model_id and served_model_id)
            else None
        ),
        "provider": provider,
        "effort": effort,
        "thinking_on": thinking_on,
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "elapsed_seconds": round(float(elapsed_seconds), 3),
        "escalated": bool(escalated),
        "stop_reason": stop_reason,
        "transport": transport,
        "billed_usage_unavailable": billed_usage_unavailable,
        "transport_session_id": transport_session_id,
        "verifier_of": verifier_of,
        "verdict": verdict,
        "issue_count": issue_count,
    }

    try:
        path = _log_path(config)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass


def load_metrics(config: dict) -> list[dict]:
    """Read every record; unparseable lines are skipped. Empty list when
    the file is missing."""
    path = _log_path(config)
    if not path.exists():
        return []
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                records.append(obj)
    return records


def _seat_rows(records: list) -> list:
    """Rows a seat transport produced. Their spend is real and is not
    attributable here — ``transport_session_id`` is what prices them."""
    return [
        r for r in records if r.get("billed_usage_unavailable") is True
    ]


def print_metrics_report(config: dict) -> None:
    """Human-readable summary: token totals, per-model / per-task / per-set
    volume, and served-model mismatches."""
    records = load_metrics(config)
    if not records:
        print("(no metrics recorded yet -- router-metrics.jsonl is empty "
              "or missing)")
        return

    def _tokens(rows: list) -> int:
        return sum(
            (r.get("input_tokens", 0) or 0) + (r.get("output_tokens", 0) or 0)
            for r in rows
        )

    print("\n" + "=" * 68)
    print(f"AI ROUTER -- METRICS REPORT  ({len(records)} calls logged)")
    print("=" * 68)

    print(f"Total input tokens:   "
          f"{sum(r.get('input_tokens', 0) or 0 for r in records):,}")
    print(f"Total output tokens:  "
          f"{sum(r.get('output_tokens', 0) or 0 for r in records):,}")

    seat = _seat_rows(records)
    if seat:
        with_id = sum(1 for r in seat if r.get("transport_session_id"))
        print(f"On a seat transport:                {len(seat)} call(s) "
              "(billed_usage_unavailable)")
        print(f"                                    real spend in AI credits; "
              f"{with_id} carry the conversation id that prices them "
              "(python -m ai_router.seat_cost)")

    mismatched = [r for r in records if r.get("served_model_mismatch")]
    if mismatched:
        grouped: dict[str, int] = {}
        for r in mismatched:
            key = f"{r.get('requested_model_id')} -> {r.get('served_model_id')}"
            grouped[key] = grouped.get(key, 0) + 1
        print("\n--- Requested vs served model ---")
        print("  A dated-snapshot pin is routine; a change of model FAMILY "
              "is a different model answering.")
        for key, count in sorted(grouped.items(), key=lambda kv: -kv[1]):
            print(f"      {count:>5}x  {key}")

    print("\n--- By model ---")
    by_model: dict[str, dict] = {}
    for r in records:
        m = r.get("model", "?")
        slot = by_model.setdefault(
            m, {"records": [], "escalated": 0, "provider": r.get("provider", "?")}
        )
        slot["records"].append(r)
        if r.get("escalated"):
            slot["escalated"] += 1
    print(f"  {'model':<24} {'provider':<11} {'calls':>6} {'tokens':>12} {'esc%':>6}")
    for m, s in sorted(
        by_model.items(), key=lambda kv: -_tokens(kv[1]["records"])
    ):
        calls = len(s["records"])
        esc_pct = (100.0 * s["escalated"] / calls) if calls else 0
        print(f"  {m:<24} {s['provider']:<11} {calls:>6} "
              f"{_tokens(s['records']):>12,} {esc_pct:>5.1f}%")

    print("\n--- By task type ---")
    by_task: dict[str, list] = {}
    for r in records:
        by_task.setdefault(r.get("task_type", "?"), []).append(r)
    print(f"  {'task_type':<24} {'calls':>6} {'tokens':>12}")
    for t, rows in sorted(by_task.items(), key=lambda kv: -_tokens(kv[1])):
        print(f"  {t:<24} {len(rows):>6} {_tokens(rows):>12,}")

    sessions: dict[int, list] = {}
    for r in records:
        number = r.get("session_number")
        if isinstance(number, int):
            sessions.setdefault(number, []).append(r)
    if sessions:
        print("\n--- By session ---")
        print(f"  {'session':<40} {'calls':>6} {'tokens':>12}")
        for number, rows in sorted(sessions.items()):
            label = f"session {number}"
            print(f"  {label:<40} {len(rows):>6} {_tokens(rows):>12,}")

    print("=" * 68 + "\n")


def main() -> int:
    from .config import load_config

    print_metrics_report(load_config())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
