"""Append-only metrics ledger for the router.

One JSON object per line in ``router-metrics.jsonl`` — no wrapping array,
additive schema (new fields never break old lines), safe to stream with jq.
Writing is best-effort and never raises: metrics must never break a routed
call that already succeeded and was already paid for.

``cost_usd`` is billing-authoritative only on rows where
``billed_usage_unavailable`` is not true. Copilot-CLI rows carry
``cost_usd: null`` beside that flag — the spend is real, it just cannot be
priced here; it is recoverable through ``transport_session_id`` (the CLI
conversation id) via ``ai_router.seat_cost``. The report never presents
unpriced calls as ``$0.00``.
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
from typing import Optional

from .pricing import calculate_cost

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


def _session_set_name(session_set) -> Optional[str]:
    """Normalize a session-set identifier (slug, relative path, or absolute
    path) to the bare folder name, so per-set aggregation has one key and
    machine paths never leak into the log."""
    if not session_set:
        return None
    name = str(session_set).replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
    return name or None


def record_call(
    config: dict,
    *,
    call_type: str,                    # "route" | "verify"
    task_type: str,
    model: str,                        # registry alias (or catalog id on copilot)
    provider: str,
    tier: int,
    complexity_score: Optional[int],
    generation_params: dict,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Optional[float],         # None = not priced here, never 0.0
    elapsed_seconds: float,
    escalated: bool,
    stop_reason: str,
    session_set: Optional[str] = None,
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
        "session_set": _session_set_name(session_set),
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
        "tier": tier,
        "complexity_score": complexity_score,
        "effort": effort,
        "thinking_on": thinking_on,
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "cost_usd": round(float(cost_usd), 6) if cost_usd is not None else None,
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


def priced_and_unpriced(records: list) -> tuple[list, list]:
    """Split records into (billing-authoritative, not-priced-here). A row is
    unpriced when it carries ``billed_usage_unavailable: true`` or a null
    ``cost_usd`` — summing those in as zeros is how a report says $0.00 for
    a session that really spent money."""
    priced: list = []
    unpriced: list = []
    for record in records:
        if record.get("billed_usage_unavailable") is True or record.get(
            "cost_usd"
        ) is None:
            unpriced.append(record)
        else:
            priced.append(record)
    return priced, unpriced


def _priced_sum(records: list) -> float:
    priced, _ = priced_and_unpriced(records)
    return sum(r.get("cost_usd") or 0 for r in priced)


def _cost_cell(records: list, width: int = 8) -> str:
    """A cost cell that never presents unpriced calls as $0.0000: a group
    with nothing priced renders ``-``; a mixed group gets a ``+`` suffix."""
    priced, unpriced = priced_and_unpriced(records)
    if not priced:
        return f"{'-':>{width + 2}}"
    total = sum(r.get("cost_usd") or 0 for r in priced)
    return f"${total:>{width}.4f}" + ("+" if unpriced else " ")


def opus_equivalent_savings(records: list, config: dict) -> Optional[float]:
    """What the priced calls would have cost on the tier-3 assignment, minus
    what they actually cost. ``None`` when nothing is priced or no tier-3
    assignment exists."""
    priced, _ = priced_and_unpriced(records)
    if not priced:
        return None
    tier3_alias = (config.get("routing", {}).get("tier_assignments") or {}).get(3)
    tier3_entry = (config.get("models") or {}).get(tier3_alias)
    if not isinstance(tier3_entry, dict):
        return None
    baseline = sum(
        calculate_cost(
            r.get("input_tokens", 0) or 0, r.get("output_tokens", 0) or 0,
            tier3_entry,
        )
        for r in priced
    )
    return baseline - sum(r.get("cost_usd") or 0 for r in priced)


def print_metrics_report(config: dict) -> None:
    """Human-readable summary: totals, per-model / per-task / per-set spend,
    served-model mismatches, and Opus-equivalent savings."""
    records = load_metrics(config)
    if not records:
        print("(no metrics recorded yet -- router-metrics.jsonl is empty "
              "or missing)")
        return

    print("\n" + "=" * 68)
    print(f"AI ROUTER -- METRICS REPORT  ({len(records)} calls logged)")
    print("=" * 68)

    priced, unpriced = priced_and_unpriced(records)
    total_cost = sum(r.get("cost_usd") or 0 for r in priced)
    if priced:
        print(f"Routed cost (Direct APIs, priced):  ${total_cost:.4f} "
              f"over {len(priced)} call(s)")
    else:
        print("Routed cost (Direct APIs, priced):  none -- no call in this "
              "log was priced")
    if unpriced:
        with_id = sum(1 for r in unpriced if r.get("transport_session_id"))
        print(f"NOT PRICED HERE:                    {len(unpriced)} call(s) "
              "on a seat transport (billed_usage_unavailable)")
        print(f"                                    real spend in AI credits; "
              f"{with_id} carry the conversation id that prices them "
              "(python -m ai_router.seat_cost)")
    print(f"Total input tokens:   "
          f"{sum(r.get('input_tokens', 0) or 0 for r in records):,}")
    print(f"Total output tokens:  "
          f"{sum(r.get('output_tokens', 0) or 0 for r in records):,}")

    savings = opus_equivalent_savings(records, config)
    if savings is not None:
        print(f"Opus-equivalent savings (priced calls at the tier-3 rate "
              f"minus actual): ${savings:.4f}")

    mismatched = [r for r in records if r.get("served_model_mismatch")]
    if mismatched:
        grouped: dict[str, int] = {}
        for r in mismatched:
            key = f"{r.get('requested_model_id')} -> {r.get('served_model_id')}"
            grouped[key] = grouped.get(key, 0) + 1
        print("\n--- Requested vs served model ---")
        print("  A dated-snapshot pin is routine; a change of model FAMILY "
              "changes the price.")
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
    print(f"  {'model':<24} {'provider':<11} {'calls':>6} {'cost':>10} {'esc%':>6}")
    for m, s in sorted(
        by_model.items(), key=lambda kv: -_priced_sum(kv[1]["records"])
    ):
        calls = len(s["records"])
        esc_pct = (100.0 * s["escalated"] / calls) if calls else 0
        print(f"  {m:<24} {s['provider']:<11} {calls:>6} "
              f"{_cost_cell(s['records'])} {esc_pct:>5.1f}%")

    print("\n--- By task type ---")
    by_task: dict[str, list] = {}
    for r in records:
        by_task.setdefault(r.get("task_type", "?"), []).append(r)
    print(f"  {'task_type':<24} {'calls':>6} {'cost':>10}")
    for t, rows in sorted(by_task.items(), key=lambda kv: -_priced_sum(kv[1])):
        print(f"  {t:<24} {len(rows):>6} {_cost_cell(rows)}")

    sets: dict[str, list] = {}
    for r in records:
        ss = _session_set_name(r.get("session_set"))
        if ss:
            sets.setdefault(ss, []).append(r)
    if sets:
        print("\n--- By session set ---")
        print(f"  {'session_set':<40} {'calls':>6} {'cost':>10}")
        for ss, rows in sorted(sets.items()):
            print(f"  {ss:<40} {len(rows):>6} {_cost_cell(rows)}")

    if unpriced:
        print("\n  '-' means no call in that row was priced here; a trailing "
              "'+' means some were not.")
        print("  Neither is zero spend. Seat cost is measured by conversation "
              "id, not by this column.")
    print("=" * 68 + "\n")


def main() -> int:
    from .config import load_config

    print_metrics_report(load_config())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
