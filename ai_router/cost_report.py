"""Dual-sourced cost reporting for a session set.

Set 004 / Session 1 re-sources ``print_cost_report`` so it reads from
both the canonical ``router-metrics.jsonl`` log (every routed/verifier/
tiebreaker call is auto-instrumented there) and the per-set
``activity-log.json`` (which captures manual edits, non-routed costs,
and anything the orchestrator chose to record outside the router).

The two should agree, but they often won't:

  * Manual edits / non-routed work appear only in the activity log.
  * Calls that were routed but never written to the activity log appear
    only in the metrics log.

When they disagree by more than $0.01, the report prints a discrepancy
warning labeled with the direction of the gap so a human can
investigate. The metrics log is treated as canonical for billing; the
activity log is supplemental.

Lives in its own module (rather than ``ai_router/__init__.py``) so the
unit tests can import it under the test conftest's ``ai_router/``
sys.path entry without pulling in the full router surface (which
requires API keys at import time).
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

try:
    from session_log import SessionLog  # type: ignore[import-not-found]
    from session_state import read_mode_config  # type: ignore[import-not-found]
    from capacity import (  # type: ignore[import-not-found]
        DEFAULT_LOOKBACK_MINUTES,
        read_capacity_summary,
    )
except ImportError:
    from .session_log import SessionLog  # type: ignore[no-redef]
    from .session_state import read_mode_config  # type: ignore[no-redef]
    from .capacity import (  # type: ignore[no-redef]
        DEFAULT_LOOKBACK_MINUTES,
        read_capacity_summary,
    )


# Anything below this absolute USD threshold counts as "matching" for
# the purposes of the discrepancy warning. Set by spec.
_COST_DISCREPANCY_THRESHOLD_USD = 0.01

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_METRICS_PATH = os.path.join(_THIS_DIR, "router-metrics.jsonl")

# The Anthropic Claude Pro subscription resets in 5-hour rolling
# windows. The other subscription providers (ChatGPT Plus, Gemini
# Advanced) use other window shapes. We use 5 hours as the display
# default because the heaviest user (orchestrator role on Claude Pro)
# is the one for whom this signal is most actionable; consumers on
# other providers should read the utilization summary as
# "completions over the last 5 hours" without ascribing throttle
# meaning to it. See module/capacity.py for the heartbeat-only
# framing that this report inherits.
SUBSCRIPTION_WINDOW_MINUTES = 5 * 60

# Default base directory for the per-provider capacity-signal logs.
# Mirrors the daemon defaults; overridable via env for tests.
_DEFAULT_QUEUES_BASE_DIR = "provider-queues"


def _canonicalize_session_set_path(value: Optional[str]) -> Optional[str]:
    """Normalize a session_set identifier to forward slashes.

    router-metrics.jsonl entries are written by whichever orchestrator
    routed the call; Windows orchestrators record
    ``docs\\session-sets\\foo`` while Unix records
    ``docs/session-sets/foo``. Aggregating without canonicalizing
    double-counts the same set. Mirrors
    ``report._canonicalize_session_set``.
    """
    if not value:
        return value
    return value.replace("\\", "/")


def _resolve_metrics_path() -> str:
    """Return the path to ``router-metrics.jsonl``.

    Honors ``AI_ROUTER_METRICS_PATH`` so tests can redirect to a
    fixture file without loading the full router config (which
    requires API keys). Mirrors the resolution logic in
    ``metrics._log_path``.
    """
    override = os.environ.get("AI_ROUTER_METRICS_PATH")
    if override:
        return override
    return _DEFAULT_METRICS_PATH


def _matches_session_set(record_value: Optional[str],
                         target_canon: str,
                         target_basename: str) -> bool:
    """True if a metrics record's ``session_set`` field refers to the
    session set identified by ``target_canon`` / ``target_basename``.

    Match strategy:

    1. Exact canonicalized match — covers the case where the record
       was written with the same path the caller now passes.
    2. Basename match — covers the common case where the orchestrator
       called ``route(..., session_set="docs/session-sets/foo")`` at
       route time but a downstream caller passes an absolute path
       (e.g. ``C:/.../foo``) or a different-relative form to
       ``get_costs``. Session-set basenames are unique by convention
       (every session set lives at ``docs/session-sets/<unique-slug>``
       in this repo), so basename matching is safe in practice.

    The assumption that basenames are unique is intentional. If a
    consumer repo ever needs to track session sets across multiple
    parent directories where basenames could collide, this matcher
    needs to be tightened — see the discussion in cost_report.py's
    cross-provider review for Set 004 / Session 1.
    """
    if not record_value:
        return False
    rec_canon = _canonicalize_session_set_path(record_value) or ""
    if rec_canon == target_canon:
        return True
    if target_basename:
        rec_base = os.path.basename(rec_canon)
        if rec_base == target_basename:
            return True
    return False


def _load_routed_metrics_for_session_set(session_set_dir: str) -> dict:
    """Aggregate routed-model spend for ``session_set_dir`` from the
    canonical ``router-metrics.jsonl``.

    Returned shape:

        {
          "total_cost": float,
          "total_calls": int,
          "by_model": {model: {"calls": int, "cost": float}, ...},
          "metrics_path": str,
          "metrics_file_present": bool,
        }

    Adjudication records have zero cost so they are counted in
    ``total_calls`` but contribute nothing to ``total_cost``; the
    intent of this report is "what did this session set spend",
    which is the cost-bearing fields.
    """
    target_canon = _canonicalize_session_set_path(session_set_dir) or ""
    target_basename = os.path.basename(target_canon)

    path = _resolve_metrics_path()
    present = os.path.isfile(path)

    total_cost = 0.0
    total_calls = 0
    by_model: dict[str, dict[str, Any]] = {}

    if present:
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not _matches_session_set(
                        rec.get("session_set"),
                        target_canon,
                        target_basename,
                    ):
                        continue
                    cost = float(rec.get("cost_usd") or 0.0)
                    model = rec.get("model") or "?"
                    total_cost += cost
                    total_calls += 1
                    slot = by_model.setdefault(
                        model, {"calls": 0, "cost": 0.0}
                    )
                    slot["calls"] += 1
                    slot["cost"] += cost
        except OSError:
            # If we can't read the file, treat it as missing rather
            # than crashing the cost report.
            present = False

    return {
        "total_cost": total_cost,
        "total_calls": total_calls,
        "by_model": by_model,
        "metrics_path": path,
        "metrics_file_present": present,
    }


def get_costs(session_set_dir: str) -> dict:
    """Return a dual-sourced cost summary for ``session_set_dir``.

    Backward-compatible: every key the old activity-log-only summary
    returned is still present at the top level — ``total_calls``,
    ``total_cost``, ``by_model``, ``sessions_completed``,
    ``sessions_remaining``. These continue to reflect the **activity
    log** so existing callers see no behavior change.

    New keys added in Set 004 / Session 1 — dual-sourcing:

        ``routed_canonical``: totals from ``router-metrics.jsonl``
            filtered by ``session_set`` (canonical billing-grade).

        ``activity_supplemental``: totals from per-set
            ``activity-log.json`` (manual edits, non-routed costs).

        ``delta_usd``: ``activity_supplemental.total_cost`` minus
            ``routed_canonical.total_cost``. Positive means the
            activity log claims more spend than the metrics log.

        ``discrepancy``: ``abs(delta_usd) > 0.01``.

    The activity-log totals remain at the top level for compatibility;
    the same numbers are also under ``activity_supplemental`` for
    callers that prefer the explicit naming.
    """
    # Probe presence BEFORE constructing SessionLog: the constructor
    # creates an empty activity-log.json when one is missing, which
    # would always make ``activity_log_present`` look True. The
    # cross-provider review caught this — a missing activity log is
    # a real diagnostic state we want surfaced to the operator.
    activity_path = os.path.join(session_set_dir, "activity-log.json")
    activity_present = os.path.isfile(activity_path)

    log = SessionLog(session_set_dir)
    activity = log.get_cost_summary()

    routed = _load_routed_metrics_for_session_set(session_set_dir)

    activity_supplemental = {
        "total_cost": activity["total_cost"],
        "total_calls": activity["total_calls"],
        "by_model": activity["by_model"],
        "activity_log_present": activity_present,
    }

    delta = activity["total_cost"] - routed["total_cost"]
    discrepancy = abs(delta) > _COST_DISCREPANCY_THRESHOLD_USD

    summary = dict(activity)  # backward-compat shape
    summary["routed_canonical"] = routed
    summary["activity_supplemental"] = activity_supplemental
    summary["delta_usd"] = delta
    summary["discrepancy"] = discrepancy

    # Mode-aware: when the session set is outsource-last, attach a
    # subscription-utilization summary for the orchestrator role's
    # provider. The orchestrator role on outsource-last is the
    # subscription model — that's the side whose burn we care about.
    # Failures to read mode (e.g., spec.md missing) leave the field
    # absent rather than crash; outsource-first sets simply don't
    # carry this key.
    try:
        mode = read_mode_config(session_set_dir)
    except Exception:  # noqa: BLE001
        mode = None
    if (
        mode is not None
        and mode.outsource_mode == "last"
        and mode.orchestrator_role
    ):
        summary["outsource_mode"] = "last"
        summary["subscription_utilization"] = (
            _build_subscription_utilization(mode.orchestrator_role)
        )
    elif mode is not None:
        summary["outsource_mode"] = mode.outsource_mode

    return summary


def _resolve_queues_base_dir() -> str:
    """Path to ``provider-queues/``. Honors ``AI_ROUTER_QUEUES_BASE_DIR``
    so tests can redirect to a fixture directory without spinning up
    real daemons.
    """
    return os.environ.get(
        "AI_ROUTER_QUEUES_BASE_DIR", _DEFAULT_QUEUES_BASE_DIR
    )


def _build_subscription_utilization(
    orchestrator_provider: str,
    *,
    base_dir: Optional[str] = None,
    window_minutes: int = SUBSCRIPTION_WINDOW_MINUTES,
    rate_lookback_minutes: int = DEFAULT_LOOKBACK_MINUTES,
) -> dict:
    """Build a subscription-utilization summary for an outsource-last
    session set's orchestrator provider.

    Two reads are performed against
    ``provider-queues/<orchestrator_provider>/capacity_signal.jsonl``:

      * ``window_summary`` — completions and tokens over the
        subscription's natural window (5h for Claude Pro). This is the
        "sessions completed in the current 5-hour window" line.
      * ``rate_summary`` — completions and tokens over a shorter
        lookback (default 60 min). The token-burn-rate line uses this
        so a heavy 5-hour window doesn't dilute a "right now" rate.

    Both values are observed-only — no throttling, headroom, or
    capacity prediction is implied. The framing comes through into
    the printed report verbatim.
    """
    base = base_dir or _resolve_queues_base_dir()

    window_summary = read_capacity_summary(
        orchestrator_provider,
        lookback_minutes=window_minutes,
        base_dir=base,
    )
    rate_summary = read_capacity_summary(
        orchestrator_provider,
        lookback_minutes=rate_lookback_minutes,
        base_dir=base,
    )

    rate_minutes = rate_summary.lookback_minutes
    rate_tokens_per_min: Optional[float] = None
    if rate_minutes > 0:
        rate_tokens_per_min = rate_summary.tokens_in_window / rate_minutes

    return {
        "provider": orchestrator_provider,
        "subscription_window_minutes": window_summary.lookback_minutes,
        "completions_in_subscription_window": (
            window_summary.completions_in_window
        ),
        "tokens_in_subscription_window": window_summary.tokens_in_window,
        "rate_lookback_minutes": rate_minutes,
        "tokens_in_rate_lookback": rate_summary.tokens_in_window,
        "tokens_per_minute": rate_tokens_per_min,
        "last_completion_at": window_summary.last_completion_at,
        "time_since_last_seconds": window_summary.time_since_last_seconds,
        "signal_file_present": window_summary.signal_file_present,
    }


def _build_json_output(session_set_dir: str, summary: dict) -> dict:
    """Stable JSON projection of the dual-sourced summary. Floats
    rounded to 6 decimal places so successive runs on the same data
    produce stable diffs."""
    routed = summary["routed_canonical"]
    activity = summary["activity_supplemental"]
    return {
        "session_set": session_set_dir,
        "sessions_completed": summary["sessions_completed"],
        "sessions_remaining": summary["sessions_remaining"],
        "routed_canonical": {
            "total_cost": round(routed["total_cost"], 6),
            "total_calls": routed["total_calls"],
            "by_model": {
                m: {"calls": d["calls"], "cost": round(d["cost"], 6)}
                for m, d in routed["by_model"].items()
            },
            "metrics_file_present": routed["metrics_file_present"],
        },
        "activity_supplemental": {
            "total_cost": round(activity["total_cost"], 6),
            "total_calls": activity["total_calls"],
            "by_model": {
                m: {"calls": d["calls"], "cost": round(d["cost"], 6)}
                for m, d in activity["by_model"].items()
            },
            "activity_log_present": activity["activity_log_present"],
        },
        "delta_usd": round(summary["delta_usd"], 6),
        "discrepancy": summary["discrepancy"],
        "outsource_mode": summary.get("outsource_mode"),
        "subscription_utilization": _round_utilization(
            summary.get("subscription_utilization")
        ),
    }


def _round_utilization(util: Optional[dict]) -> Optional[dict]:
    """Round utilization floats to 6 dp so JSON diffs are stable.

    ``None`` passes through — outsource-first session sets simply
    omit the field.
    """
    if util is None:
        return None
    out = dict(util)
    rate = out.get("tokens_per_minute")
    if rate is not None:
        out["tokens_per_minute"] = round(rate, 6)
    tsls = out.get("time_since_last_seconds")
    if tsls is not None:
        out["time_since_last_seconds"] = round(tsls, 6)
    return out


def print_cost_report(session_set_dir: str, format: str = "text") -> None:
    """Print a dual-sourced cost report for a session set.

    Two totals are shown side-by-side:

      * **Routed-model spend (canonical)** — sourced from
        ``router-metrics.jsonl`` filtered by ``session_set``. Every
        routed/verifier/tiebreaker call writes a record automatically;
        this is the billing-grade source.
      * **Activity-log adjustments (supplemental)** — sourced from the
        per-set ``activity-log.json``. Captures manual edits,
        non-routed costs, and anything the orchestrator chose to log
        outside of the auto-instrumented router calls.

    When the two disagree by more than $0.01 a clear warning is
    printed indicating the direction of the discrepancy.
    ``format='json'`` emits the structured summary (the same shape
    ``get_costs`` returns, rounded for stable diffs) for programmatic
    consumers.
    """
    if format not in ("text", "json"):
        raise ValueError(
            f"format must be 'text' or 'json' (got {format!r})"
        )

    summary = get_costs(session_set_dir)

    if format == "json":
        print(json.dumps(
            _build_json_output(session_set_dir, summary),
            indent=2, sort_keys=True,
        ))
        return

    if summary.get("outsource_mode") == "last":
        _print_outsource_last_report(session_set_dir, summary)
        return

    log = SessionLog(session_set_dir)
    routed = summary["routed_canonical"]
    activity = summary["activity_supplemental"]

    print("\n" + "=" * 60)
    print("AI ROUTER — COST REPORT")
    print(f"Session Set: {log._data['sessionSetName']}")
    print("=" * 60)
    print(f"Sessions completed: {summary['sessions_completed']} "
          f"of {log.total_sessions}")
    print(f"Sessions remaining: {summary['sessions_remaining']}")
    print()
    print("Routed-model spend (canonical):")
    if not routed["metrics_file_present"]:
        print("  (router-metrics.jsonl not found at "
              f"{routed['metrics_path']} — totals are zero)")
    print(f"  Total routed API calls: {routed['total_calls']}")
    print(f"  Total cost:             ${routed['total_cost']:.4f}")
    if routed["by_model"]:
        print("  By model:")
        for model, data in routed["by_model"].items():
            print(f"    {model:20s}  {data['calls']:3d} calls"
                  f"  ${data['cost']:.4f}")
    print()
    print("Activity-log adjustments (supplemental):")
    if not activity["activity_log_present"]:
        print("  (activity-log.json not found — totals are zero)")
    print(f"  Total logged calls:     {activity['total_calls']}")
    print(f"  Total cost:             ${activity['total_cost']:.4f}")
    if activity["by_model"]:
        print("  By model:")
        for model, data in activity["by_model"].items():
            print(f"    {model:20s}  {data['calls']:3d} calls"
                  f"  ${data['cost']:.4f}")
    print()

    delta = summary["delta_usd"]
    if summary["discrepancy"]:
        if delta > 0:
            direction = (
                "Activity log claims MORE than router-metrics "
                "(activity-log records manual/human costs the metrics "
                "log doesn't see, OR the metrics log lost records)."
            )
        else:
            direction = (
                "Activity log claims LESS than router-metrics "
                "(routed calls were made that the orchestrator never "
                "logged to the activity log — investigate)."
            )
        print("WARNING: cost discrepancy detected.")
        print(f"  Delta (activity - canonical): ${delta:+.4f}")
        print(f"  {direction}")
        print()

    print("=" * 60 + "\n")


def _format_minutes_ago(seconds: Optional[float]) -> str:
    """Render ``time_since_last_seconds`` as a short human label."""
    if seconds is None:
        return "never (no completions recorded)"
    minutes = seconds / 60.0
    if minutes < 1.0:
        return f"{seconds:.0f} seconds ago"
    if minutes < 60.0:
        return f"{minutes:.1f} minutes ago"
    hours = minutes / 60.0
    return f"{hours:.1f} hours ago"


def _print_outsource_last_report(session_set_dir: str, summary: dict) -> None:
    """Render the outsource-last (subscription-utilization) cost report.

    Replaces the USD-based report with utilization metrics. Framing
    is explicitly observational — every numeric field is something
    that already happened, not a prediction. The block ends with the
    heartbeat-only caveat so a reader who reaches for the throttle
    interpretation gets a friction at exactly the wrong moment.

    The activity-log adjustments block is still rendered below the
    utilization block: when the orchestrator chooses to record
    non-routed costs (manual edits etc.) into the activity log they
    are still real money, even on a subscription set, and we don't
    want them silently dropped.
    """
    log = SessionLog(session_set_dir)
    util = summary.get("subscription_utilization") or {}
    activity = summary["activity_supplemental"]
    routed = summary["routed_canonical"]

    print("\n" + "=" * 60)
    print("AI ROUTER — COST REPORT (outsource-last; subscription utilization)")
    print(f"Session Set: {log._data['sessionSetName']}")
    print("=" * 60)
    print(f"Sessions completed: {summary['sessions_completed']} "
          f"of {log.total_sessions}")
    print(f"Sessions remaining: {summary['sessions_remaining']}")
    print()
    print(f"Orchestrator role provider: {util.get('provider', '?')}")

    if not util.get("signal_file_present"):
        print("  (capacity_signal.jsonl not found — no role-loop "
              "completions have been recorded yet for this provider)")
        print()

    window_min = util.get("subscription_window_minutes") or 0
    window_hours = window_min / 60.0 if window_min else 0.0
    rate_min = util.get("rate_lookback_minutes") or 0
    print(
        f"Sessions completed in current "
        f"{window_hours:.1f}-hour window: "
        f"{util.get('completions_in_subscription_window', 0)}"
    )
    rate = util.get("tokens_per_minute")
    rate_str = f"{rate:.1f}" if rate is not None else "n/a"
    print(
        f"Token burn rate: {rate_str} tokens/min over last "
        f"{rate_min} min"
    )
    print(
        f"Last activity: "
        f"{_format_minutes_ago(util.get('time_since_last_seconds'))}"
    )
    print()
    print(
        "NOTE: this is a backward-looking heartbeat, not a routing or "
        "capacity prediction. Subscription providers may throttle "
        "without prior warning; treat the numbers above strictly as "
        "'what already happened' and consult the provider's own "
        "dashboard for live limits."
    )
    print()

    # Even on outsource-last sets, manual / non-routed activity-log
    # entries are still real spend — surface them so they don't go
    # silently unreported. ``routed_canonical`` is also surfaced for
    # the cross-provider verifier-call costs that show up in the
    # metrics log even when the orchestrator is on a subscription.
    print("Routed-model spend (canonical):")
    if not routed["metrics_file_present"]:
        print("  (router-metrics.jsonl not found at "
              f"{routed['metrics_path']} — totals are zero)")
    print(f"  Total routed API calls: {routed['total_calls']}")
    print(f"  Total cost:             ${routed['total_cost']:.4f}")
    print()
    print("Activity-log adjustments (supplemental):")
    if not activity["activity_log_present"]:
        print("  (activity-log.json not found — totals are zero)")
    print(f"  Total logged calls:     {activity['total_calls']}")
    print(f"  Total cost:             ${activity['total_cost']:.4f}")
    print()
    print("=" * 60 + "\n")
