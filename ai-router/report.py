"""Manager-focused markdown report for AI router metrics.

Reads ``router-metrics.jsonl`` (the append-only call log) and produces a
markdown summary aimed at governance and management audiences. Output
goes to stdout by default, or to a file via ``--output``.

Companion to ``metrics.print_metrics_report()`` — that function prints a
text developer dump to stdout; this module produces a markdown report
structured around cost-efficiency and unreliability signals that matter
to reviewers and managers.

Design notes (see BATON v2 §3.3 for the design rationale):
  * "Savings vs Opus baseline": for every call, compute what it would
    have cost if routed to Opus (the most expensive tier) using the
    current YAML pricing. The ratio of actual total to that baseline
    is the governance-slide headline number.
  * Unreliability composite: mean of three independent rates —
    escalation rate, verifier rejection rate, and retry rate (proxied
    by tiebreaker calls). Each component is skipped if its denominator
    is zero. Action items fire when the composite exceeds 20%.
  * Sample-size warnings: per-task-type rows with fewer than 5 calls
    are marked ``n=N, too few`` rather than showing false-precision
    rates.

Usage:
  python -m ai_router.report                      # stdout
  python -m ai_router.report --output report.md   # write to file
  python -m ai_router.report --since 2026-04-01   # filter by date
  python -m ai_router.report --session-set NAME   # filter by set

Stdlib + PyYAML only (PyYAML is already a router dependency).
"""

from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path
from typing import Any, Iterable, Optional

from .config import load_config
from .metrics import load_metrics


# --- Constants ------------------------------------------------------------

UNRELIABILITY_THRESHOLD = 0.20
"""Per BATON v2 §3.3: unreliability above 20% auto-generates action items."""

MIN_SAMPLES_FOR_STATS = 5
"""Per-task-type cells with fewer records are flagged as too-few-to-trust."""

OUTLIER_COUNT = 3
"""Top-N outliers shown for expensive calls and unreliable task types."""

_OPUS_MODEL_KEY = "opus"
"""Key in router-config.yaml under ``models:`` used as the baseline tier."""


# --- Data loading ---------------------------------------------------------

def _canonicalize_session_set(value: Optional[str]) -> Optional[str]:
    """Normalize session_set path separators. Orchestrators on Windows
    log ``docs\\session-sets\\foo`` while Unix logs ``docs/session-sets/foo``;
    aggregating without canonicalizing double-counts the same set."""
    if not value:
        return value
    return value.replace("\\", "/")


def _parse_iso(ts: str) -> Optional[datetime.datetime]:
    """Parse ISO timestamp; return None if unparseable (don't crash on
    one bad row)."""
    try:
        return datetime.datetime.fromisoformat(ts)
    except (TypeError, ValueError):
        return None


def _filter_records(
    records: list[dict],
    *,
    since: Optional[datetime.date] = None,
    until: Optional[datetime.date] = None,
    session_set: Optional[str] = None,
) -> list[dict]:
    """Apply optional filters. Records with unparseable timestamps are
    kept (we'd rather show a suspicious row than drop it silently)."""
    canonical_filter = _canonicalize_session_set(session_set) if session_set else None
    out: list[dict] = []
    for r in records:
        if since or until:
            ts = _parse_iso(r.get("timestamp", ""))
            if ts is not None:
                ts_date = ts.date()
                if since and ts_date < since:
                    continue
                if until and ts_date > until:
                    continue
        if canonical_filter is not None:
            if _canonicalize_session_set(r.get("session_set")) != canonical_filter:
                continue
        out.append(r)
    return out


def _opus_pricing(config: dict) -> tuple[float, float]:
    """Return (input_cost_per_1m, output_cost_per_1m) for Opus from the
    YAML. Falls back to hardcoded $15/$75 if the model is missing from
    the config — the ratio is still meaningful, just explain the source
    in the report."""
    models = config.get("models", {}) or {}
    opus = models.get(_OPUS_MODEL_KEY, {}) or {}
    inp = opus.get("input_cost_per_1m")
    out = opus.get("output_cost_per_1m")
    if inp is None or out is None:
        return 15.00, 75.00
    return float(inp), float(out)


# --- Aggregation ----------------------------------------------------------

def _opus_equivalent_cost(
    record: dict, opus_in: float, opus_out: float
) -> float:
    """What this call would have cost at Opus pricing."""
    it = int(record.get("input_tokens") or 0)
    ot = int(record.get("output_tokens") or 0)
    return (it * opus_in + ot * opus_out) / 1_000_000.0


def _totals(
    records: list[dict], opus_in: float, opus_out: float
) -> dict[str, Any]:
    """Overall totals including the Opus-baseline ratio."""
    total_cost = 0.0
    opus_baseline = 0.0
    for r in records:
        total_cost += float(r.get("cost_usd") or 0.0)
        opus_baseline += _opus_equivalent_cost(r, opus_in, opus_out)

    ratio = (total_cost / opus_baseline) if opus_baseline > 0 else None
    savings_pct = ((1.0 - ratio) * 100.0) if ratio is not None else None

    # Period
    timestamps = [_parse_iso(r.get("timestamp", "")) for r in records]
    timestamps = [t for t in timestamps if t is not None]
    period_start = min(timestamps).date() if timestamps else None
    period_end = max(timestamps).date() if timestamps else None

    return {
        "calls": len(records),
        "total_cost": total_cost,
        "opus_baseline_cost": opus_baseline,
        "ratio": ratio,  # actual / opus baseline
        "savings_pct": savings_pct,  # 1 - ratio, as percent
        "period_start": period_start,
        "period_end": period_end,
    }


def _unreliability_components(task_records: list[dict]) -> dict[str, Any]:
    """Compute the three component rates for unreliability plus the
    composite. Returns rates as fractions in [0, 1]; None if the
    denominator is zero for that component."""
    route_calls = [r for r in task_records if r.get("call_type") == "route"]
    verify_calls = [r for r in task_records if r.get("call_type") == "verify"]
    tiebreaker_calls = [r for r in task_records if r.get("call_type") == "tiebreaker"]

    # Escalation rate: of route calls for this task, how many escalated?
    n_route = len(route_calls)
    n_escalated = sum(1 for r in route_calls if r.get("escalated"))
    escalation_rate = (n_escalated / n_route) if n_route else None

    # Rejection rate: of verify calls for this task, how many ISSUES_FOUND?
    n_verify = len(verify_calls)
    n_issues = sum(
        1 for r in verify_calls if r.get("verdict") == "ISSUES_FOUND"
    )
    rejection_rate = (n_issues / n_verify) if n_verify else None

    # Retry rate: tiebreaker calls fire only when verification triggers
    # re-route. We use tiebreakers / verifies as a proxy for the fraction
    # of verifications that required a second opinion round.
    retry_rate = (len(tiebreaker_calls) / n_verify) if n_verify else None

    # Composite: mean of available components.
    parts = [r for r in (escalation_rate, rejection_rate, retry_rate)
             if r is not None]
    composite = (sum(parts) / len(parts)) if parts else None

    return {
        "escalation_rate": escalation_rate,
        "rejection_rate": rejection_rate,
        "retry_rate": retry_rate,
        "composite": composite,
        "n_route": n_route,
        "n_verify": n_verify,
        "n_tiebreaker": len(tiebreaker_calls),
        "n_total": len(task_records),
    }


def _per_task_type(records: list[dict]) -> list[dict]:
    """One row per task_type with cost, primary model, and unreliability.
    Sorted by total cost descending."""
    by_task: dict[str, list[dict]] = {}
    for r in records:
        t = r.get("task_type") or "(unknown)"
        by_task.setdefault(t, []).append(r)

    rows: list[dict] = []
    for task, task_records in by_task.items():
        total_cost = sum(float(r.get("cost_usd") or 0.0) for r in task_records)
        route_calls = [r for r in task_records if r.get("call_type") == "route"]
        avg_cost = (total_cost / len(task_records)) if task_records else 0.0

        # Primary model = model handling the most route calls for this task.
        # Fall back to most frequent model across all call types if no routes.
        pool = route_calls if route_calls else task_records
        model_counts: dict[str, int] = {}
        for r in pool:
            m = r.get("model") or "?"
            model_counts[m] = model_counts.get(m, 0) + 1
        primary_model = (
            max(model_counts.items(), key=lambda kv: kv[1])[0]
            if model_counts else "—"
        )

        rel = _unreliability_components(task_records)
        rows.append({
            "task_type": task,
            "calls": len(task_records),
            "primary_model": primary_model,
            "total_cost": total_cost,
            "avg_cost": avg_cost,
            **rel,
        })

    rows.sort(key=lambda r: r["total_cost"], reverse=True)
    return rows


def _outliers_expensive(records: list[dict]) -> list[dict]:
    """Top N most expensive individual calls."""
    ranked = sorted(
        records,
        key=lambda r: float(r.get("cost_usd") or 0.0),
        reverse=True,
    )
    return ranked[:OUTLIER_COUNT]


def _outliers_unreliable(task_rows: list[dict]) -> list[dict]:
    """Top N task types by unreliability composite. Excludes rows where
    composite is None (no denominators) or sample size is too small."""
    eligible = [
        r for r in task_rows
        if r.get("composite") is not None
        and r["calls"] >= MIN_SAMPLES_FOR_STATS
    ]
    eligible.sort(key=lambda r: r["composite"], reverse=True)
    return eligible[:OUTLIER_COUNT]


def _action_items(task_rows: list[dict]) -> list[str]:
    """One action item per task type with composite > threshold and
    enough samples to trust. Explains which component(s) drove it."""
    items: list[str] = []
    for row in task_rows:
        comp = row.get("composite")
        if comp is None or row["calls"] < MIN_SAMPLES_FOR_STATS:
            continue
        if comp < UNRELIABILITY_THRESHOLD:
            continue

        # Identify which component(s) exceeded the threshold — that tells
        # the manager where to look.
        drivers: list[str] = []
        if (row.get("escalation_rate") or 0) >= UNRELIABILITY_THRESHOLD:
            drivers.append(
                f"escalation at {row['escalation_rate'] * 100:.0f}%"
            )
        if (row.get("rejection_rate") or 0) >= UNRELIABILITY_THRESHOLD:
            drivers.append(
                f"verifier rejection at {row['rejection_rate'] * 100:.0f}%"
            )
        if (row.get("retry_rate") or 0) >= UNRELIABILITY_THRESHOLD:
            drivers.append(
                f"retry rate at {row['retry_rate'] * 100:.0f}%"
            )

        reason = "; ".join(drivers) if drivers else (
            f"composite at {comp * 100:.0f}%"
        )
        items.append(
            f"`{row['task_type']}` — unreliability {comp * 100:.0f}% "
            f"({reason}). Consider raising its base tier or tightening "
            f"its prompt template."
        )
    return items


def _verifier_robustness_stats(records: list[dict]) -> dict[str, Any]:
    """Aggregate the Session-9 verifier-selection observability signals
    (verifier_fallback, preferred_verifier_skipped). Both are null on
    historical records predating Session 9, which is fine — they just
    don't contribute to the numerator."""
    verify = [r for r in records if r.get("call_type") == "verify"]
    n_verify = len(verify)
    n_fallback = sum(1 for r in verify if r.get("verifier_fallback"))
    fallback_from: dict[str, int] = {}
    for r in verify:
        if r.get("verifier_fallback"):
            p = r.get("fallback_from_provider") or "?"
            fallback_from[p] = fallback_from.get(p, 0) + 1

    skipped: dict[tuple, int] = {}
    for r in verify:
        pvs = r.get("preferred_verifier_skipped")
        if not pvs:
            continue
        # Stored as a two-element list [model, reason] in the JSONL.
        try:
            key = (pvs[0], pvs[1])
        except (IndexError, TypeError):
            continue
        skipped[key] = skipped.get(key, 0) + 1

    return {
        "n_verify": n_verify,
        "n_fallback": n_fallback,
        "fallback_rate": (n_fallback / n_verify) if n_verify else None,
        "fallback_from": fallback_from,                # provider -> count
        "preferred_skipped": skipped,                  # (model, reason) -> count
    }


def _adjudication_stats(records: list[dict]) -> dict[str, Any]:
    """Aggregate adjudication records against their matching verify
    records. 'Adoption rate' = fraction of ISSUES_FOUND verdicts that
    a human ultimately accepted (resolution = accept-finding). The
    remaining resolutions are dismissals (accept-dismissal), reshapes
    (reverify-reshaped), or tiebreakers (second-opinion). None of
    those four are precisely 'adopted without change', but
    accept-finding is the cleanest adopt signal and is what
    governance cares about."""
    adj = [r for r in records if r.get("call_type") == "adjudication"]
    verify = [r for r in records if r.get("call_type") == "verify"]

    n_adj = len(adj)
    n_issues = sum(1 for r in verify if r.get("verdict") == "ISSUES_FOUND")

    by_resolution: dict[str, int] = {}
    by_cause: dict[str, int] = {}
    by_task: dict[str, dict[str, int]] = {}
    for r in adj:
        res = r.get("resolution") or "?"
        cse = r.get("cause") or "?"
        task = r.get("task_type") or "?"
        by_resolution[res] = by_resolution.get(res, 0) + 1
        by_cause[cse] = by_cause.get(cse, 0) + 1
        slot = by_task.setdefault(task, {})
        slot[res] = slot.get(res, 0) + 1

    n_adopted = by_resolution.get("accept-finding", 0)
    # Adoption rate is against the count of ISSUES_FOUND verdicts, not
    # against the count of adjudications. Adjudications are only
    # written when the orchestrator chose to challenge a finding;
    # unchallenged findings were adopted by default.
    adopted_of_issues = (
        (n_issues - (n_adj - n_adopted)) / n_issues if n_issues else None
    )
    # Equivalently: fraction of ISSUES_FOUND that were NOT dismissed.

    return {
        "n_issues_found": n_issues,
        "n_adjudications": n_adj,
        "n_adopted_after_challenge": n_adopted,
        "adopted_of_issues_rate": adopted_of_issues,
        "by_resolution": by_resolution,
        "by_cause": by_cause,
        "by_task": by_task,
    }


# --- Formatting -----------------------------------------------------------

def _fmt_pct(rate: Optional[float]) -> str:
    if rate is None:
        return "—"
    return f"{rate * 100:.1f}%"


def _fmt_money(v: float) -> str:
    return f"${v:,.4f}"


def _fmt_date(d: Optional[datetime.date]) -> str:
    return d.isoformat() if d else "—"


def _render_header(
    totals: dict[str, Any], opus_in: float, opus_out: float
) -> list[str]:
    lines: list[str] = ["# AI Router — Manager Report", ""]
    lines.append(
        f"Period: **{_fmt_date(totals['period_start'])}** to "
        f"**{_fmt_date(totals['period_end'])}**"
    )
    lines.append(
        f"Generated: {datetime.date.today().isoformat()}"
    )
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append(f"- **Total routed calls**: {totals['calls']:,}")
    lines.append(
        f"- **Total spend**: {_fmt_money(totals['total_cost'])}"
    )
    lines.append(
        f"- **Opus-only baseline** (hypothetical): "
        f"{_fmt_money(totals['opus_baseline_cost'])} "
        f"(at ${opus_in:.2f} in / ${opus_out:.2f} out per 1M tokens)"
    )
    if totals["ratio"] is not None:
        lines.append(
            f"- **Ratio of actual to Opus baseline**: "
            f"{totals['ratio'] * 100:.1f}% "
            f"(**{totals['savings_pct']:.1f}% savings** from tiered routing)"
        )
    else:
        lines.append(
            "- **Ratio of actual to Opus baseline**: n/a (no token data)"
        )
    # Verifier availability: how often the first-choice verifier
    # failed at the HTTPS layer and the router fell back to a
    # different provider. Populated by Session 9's try/except path.
    rob = totals.get("robustness") or {}
    if rob.get("n_verify"):
        rate = rob.get("fallback_rate")
        if rate is not None and rob.get("n_fallback"):
            parts = ", ".join(
                f"{prov}: {n}" for prov, n in sorted(
                    rob["fallback_from"].items(), key=lambda kv: -kv[1]
                )
            )
            lines.append(
                f"- **Verifier fallback rate**: {rate * 100:.1f}% "
                f"({rob['n_fallback']} of {rob['n_verify']} verify calls "
                f"fell back after the first-choice provider failed — {parts})"
            )
        else:
            lines.append(
                f"- **Verifier fallback rate**: 0.0% "
                f"({rob['n_verify']} verify calls, no fallbacks)"
            )
    lines.append("")
    return lines


def _render_task_type_table(task_rows: list[dict]) -> list[str]:
    lines = ["## Per-task-type summary", ""]
    if not task_rows:
        lines.append("*No task-type data.*")
        lines.append("")
        return lines

    lines.append(
        "| Task type | Calls | Primary model | Avg $/call | "
        "Esc % | Rej % | Retry % | Unreliability |"
    )
    lines.append(
        "|---|---:|---|---:|---:|---:|---:|---:|"
    )
    for row in task_rows:
        if row["calls"] < MIN_SAMPLES_FOR_STATS:
            # Render but flag the row
            marker = f"{row['calls']} ⚠️"
            unreliability_cell = f"n={row['calls']}, too few"
        else:
            marker = str(row["calls"])
            unreliability_cell = _fmt_pct(row["composite"])

        lines.append(
            f"| `{row['task_type']}` | {marker} | "
            f"`{row['primary_model']}` | "
            f"{_fmt_money(row['avg_cost'])} | "
            f"{_fmt_pct(row['escalation_rate'])} | "
            f"{_fmt_pct(row['rejection_rate'])} | "
            f"{_fmt_pct(row['retry_rate'])} | "
            f"{unreliability_cell} |"
        )
    lines.append("")
    lines.append(
        f"_Unreliability = mean of escalation rate, verifier rejection "
        f"rate (ISSUES_FOUND verdicts), and retry rate (tiebreaker / "
        f"verify ratio). Cells with fewer than {MIN_SAMPLES_FOR_STATS} "
        f"calls are flagged rather than rated._"
    )
    lines.append("")
    return lines


def _render_outliers(
    expensive: list[dict], unreliable: list[dict]
) -> list[str]:
    lines = ["## Outliers", ""]
    lines.append(f"### Top {OUTLIER_COUNT} most expensive individual calls")
    lines.append("")
    if not expensive:
        lines.append("*No calls.*")
    else:
        lines.append("| Rank | Cost | Model | Task type | Session set | Timestamp |")
        lines.append("|---:|---:|---|---|---|---|")
        for i, r in enumerate(expensive, start=1):
            ss = _canonicalize_session_set(r.get("session_set")) or "—"
            # Trim long session-set paths for table readability
            if len(ss) > 40:
                ss = "…" + ss[-39:]
            lines.append(
                f"| {i} | {_fmt_money(float(r.get('cost_usd') or 0.0))} "
                f"| `{r.get('model') or '—'}` "
                f"| `{r.get('task_type') or '—'}` "
                f"| {ss} "
                f"| {r.get('timestamp', '—')[:19]} |"
            )
    lines.append("")

    lines.append(
        f"### Top {OUTLIER_COUNT} task types by unreliability "
        f"(min {MIN_SAMPLES_FOR_STATS} calls)"
    )
    lines.append("")
    if not unreliable:
        lines.append(
            "*No task types with enough samples to rank by unreliability.*"
        )
    else:
        lines.append("| Rank | Task type | Unreliability | Calls | Esc % | Rej % | Retry % |")
        lines.append("|---:|---|---:|---:|---:|---:|---:|")
        for i, row in enumerate(unreliable, start=1):
            lines.append(
                f"| {i} | `{row['task_type']}` "
                f"| {_fmt_pct(row['composite'])} "
                f"| {row['calls']} "
                f"| {_fmt_pct(row['escalation_rate'])} "
                f"| {_fmt_pct(row['rejection_rate'])} "
                f"| {_fmt_pct(row['retry_rate'])} |"
            )
    lines.append("")
    return lines


def _render_adjudications(
    adj: dict[str, Any], rob: dict[str, Any]
) -> list[str]:
    """Session 9 addition. Surfaces verifier findings adopted vs.
    dismissed, plus preferred-pairing skip reasons. Omitted entirely
    when there are no verify calls in the filtered window (e.g., an
    early-days report) since the signals would be vacuous."""
    if not rob.get("n_verify"):
        return []

    lines = ["## Verifier findings & adjudication", ""]
    n_issues = adj.get("n_issues_found") or 0
    n_adj = adj.get("n_adjudications") or 0

    if n_issues == 0:
        lines.append(
            "*No ISSUES_FOUND verdicts in this window — "
            "no adjudication activity to report.*"
        )
        lines.append("")
    else:
        dismissed = adj.get("by_resolution", {}).get("accept-dismissal", 0)
        reshaped = adj.get("by_resolution", {}).get("reverify-reshaped", 0)
        second_op = adj.get("by_resolution", {}).get("second-opinion", 0)
        accepted_after = adj.get("n_adopted_after_challenge", 0)
        # Findings adopted without challenge = total issues minus
        # total adjudications (every challenge generates one record).
        adopted_without_challenge = max(n_issues - n_adj, 0)

        lines.append(
            f"- **Verifier findings (ISSUES_FOUND)**: {n_issues:,}"
        )
        lines.append(
            f"- **Adopted without challenge**: "
            f"{adopted_without_challenge:,} "
            f"({(adopted_without_challenge / n_issues) * 100:.1f}%)"
        )
        lines.append(
            f"- **Challenged by orchestrator**: {n_adj:,} "
            f"({(n_adj / n_issues) * 100:.1f}%)"
        )
        if n_adj:
            lines.append(
                f"    - Accept finding after challenge: {accepted_after}"
            )
            lines.append(
                f"    - Accept dismissal: {dismissed}"
            )
            lines.append(
                f"    - Reverify with reshaped context: {reshaped}"
            )
            lines.append(
                f"    - Second opinion from different provider: {second_op}"
            )
            # If most challenges resolve via reshape, the signal is that
            # the orchestrator needs better context-selection guidance,
            # per the workflow-doc note in Step 7.
            if reshaped and reshaped >= max(dismissed, accepted_after):
                lines.append("")
                lines.append(
                    "*Most challenges resolved by reshaping context — "
                    "the orchestrator may benefit from clearer guidance "
                    "on which files to include in verification prompts.*"
                )
        lines.append("")

        # By-cause breakdown — useful for diagnosing where the
        # orchestrator-verifier friction lives.
        causes = adj.get("by_cause", {})
        if causes:
            lines.append("### Challenge causes")
            lines.append("")
            lines.append("| Cause | Count |")
            lines.append("|---|---:|")
            for c in ("context-gap", "genuine-split", "orchestrator-error"):
                if c in causes:
                    lines.append(f"| `{c}` | {causes[c]} |")
            for c, n in sorted(
                causes.items(), key=lambda kv: -kv[1]
            ):
                if c not in (
                    "context-gap", "genuine-split", "orchestrator-error"
                ):
                    lines.append(f"| `{c}` | {n} |")
            lines.append("")

    # Preferred-pairing skips: populated whenever rule-based selection
    # rejected a pairing listed in preferred_pairings. This surfaces
    # config drift (e.g., a preferred pairing points at a model whose
    # is_enabled_as_verifier flag was flipped off).
    skipped = rob.get("preferred_skipped") or {}
    if skipped:
        lines.append("### Preferred pairings skipped by rules")
        lines.append("")
        lines.append(
            "*Rule-based verifier selection rejected the listed "
            "preferred pairing and picked a different verifier. "
            "Expected when deliberately retiring a model's verifier "
            "role; investigate otherwise.*"
        )
        lines.append("")
        lines.append("| Skipped model | Reason | Count |")
        lines.append("|---|---|---:|")
        for (model, reason), n in sorted(
            skipped.items(), key=lambda kv: -kv[1]
        ):
            lines.append(f"| `{model}` | `{reason}` | {n} |")
        lines.append("")

    return lines


def _render_action_items(items: list[str]) -> list[str]:
    lines = ["## Auto-generated action items", ""]
    if not items:
        lines.append(
            f"*No task types exceed the {UNRELIABILITY_THRESHOLD * 100:.0f}% "
            f"unreliability threshold with enough samples to trust.*"
        )
    else:
        for item in items:
            lines.append(f"- {item}")
    lines.append("")
    return lines


# --- Top-level orchestration ---------------------------------------------

def generate_report(
    config: dict,
    *,
    since: Optional[datetime.date] = None,
    until: Optional[datetime.date] = None,
    session_set: Optional[str] = None,
) -> str:
    """Produce the full markdown report as a string.

    Args:
        config: Loaded router-config.yaml dict.
        since:  Optional inclusive start date.
        until:  Optional inclusive end date.
        session_set: Optional session_set filter (compared after
            path-separator canonicalization).
    """
    raw = load_metrics(config)
    if not raw:
        return (
            "# AI Router — Manager Report\n\n"
            "*No metrics recorded yet — `router-metrics.jsonl` is "
            "empty or missing.*\n"
        )

    records = _filter_records(
        raw, since=since, until=until, session_set=session_set,
    )
    if not records:
        return (
            "# AI Router — Manager Report\n\n"
            f"*No metrics match the requested filters "
            f"(since={since}, until={until}, session_set={session_set!r}).*\n"
        )

    opus_in, opus_out = _opus_pricing(config)
    totals = _totals(records, opus_in, opus_out)
    rob = _verifier_robustness_stats(records)
    totals["robustness"] = rob
    adj = _adjudication_stats(records)
    task_rows = _per_task_type(records)
    expensive = _outliers_expensive(records)
    unreliable = _outliers_unreliable(task_rows)
    items = _action_items(task_rows)

    lines: list[str] = []
    lines.extend(_render_header(totals, opus_in, opus_out))
    lines.extend(_render_task_type_table(task_rows))
    lines.extend(_render_outliers(expensive, unreliable))
    lines.extend(_render_adjudications(adj, rob))
    lines.extend(_render_action_items(items))
    return "\n".join(lines)


def _parse_date(s: str) -> datetime.date:
    """argparse type for YYYY-MM-DD."""
    try:
        return datetime.date.fromisoformat(s)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"expected YYYY-MM-DD, got {s!r}"
        ) from exc


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.report",
        description=(
            "Generate a manager-focused markdown report from "
            "router-metrics.jsonl."
        ),
    )
    parser.add_argument(
        "--output", "-o", type=Path, default=None,
        help="Write report to this file. Default: stdout.",
    )
    parser.add_argument(
        "--since", type=_parse_date, default=None,
        help="Include only records on or after this date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--until", type=_parse_date, default=None,
        help="Include only records on or before this date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--session-set", default=None,
        help="Filter to a specific session_set path.",
    )
    parser.add_argument(
        "--config", type=Path, default=None,
        help="Path to router-config.yaml. Default: resolved by config.load_config.",
    )
    args = parser.parse_args(argv)

    config = load_config(str(args.config) if args.config else None)
    report = generate_report(
        config,
        since=args.since,
        until=args.until,
        session_set=args.session_set,
    )

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")
        print(f"Wrote report to {args.output}", file=sys.stderr)
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
