"""Dual-sourced cost reporting for a session set.

``print_cost_report`` reads from both the canonical
``router-metrics.jsonl`` log (every routed/verifier/tiebreaker call is
auto-instrumented there) and the per-set ``activity-log.json`` (which
captures manual edits, non-routed costs, and anything the orchestrator
chose to record outside the router).

The two should agree, but they often won't:

  * Manual edits / non-routed work appear only in the activity log.
  * Calls that were routed but never written to the activity log appear
    only in the metrics log.

When they disagree by more than $0.01, the report prints a discrepancy
warning labeled with the direction of the gap so a human can
investigate. The metrics log is treated as canonical for billing; the
activity log is supplemental.

Set 026 Session 1 removed the outsource-last subscription-utilization
report (``_print_outsource_last_report``) along with the rest of the
queue-mediated daemon infrastructure. The remaining report is the
synchronous per-call cost summary.
"""

from __future__ import annotations

import datetime
import json
import os
from typing import Any, Optional

try:
    from session_log import SessionLog  # type: ignore[import-not-found]
except ImportError:
    from .session_log import SessionLog  # type: ignore[no-redef]


# Anything below this absolute USD threshold counts as "matching" for
# the purposes of the discrepancy warning. Set by spec.
_COST_DISCREPANCY_THRESHOLD_USD = 0.01

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_METRICS_PATH = os.path.join(_THIS_DIR, "router-metrics.jsonl")


#: Models whose HISTORICAL metrics rows were costed at a rate the provider was
#: not charging (Set 109 S4). The rows themselves are a ledger and are never
#: rewritten — a record of what was believed at the time is worth more than a
#: record silently improved after the fact — so the correction is published
#: here instead, and any report containing an affected model says so.
#:
#: ``factor`` is measured, not assumed: it is the ratio of true to reported
#: cost recomputed row by row from each row's own token counts under the rates
#: confirmed on 2026-08-04. It stops applying once a row is written under the
#: corrected registry, which is why each entry carries the moment the rate was
#: fixed — a row after it is already right.
#:
#: ``corrected_at`` is an INSTANT, not a date, and that is load-bearing: the
#: registry was corrected in the middle of 2026-08-04, so a date-granular
#: cutoff silently reclassified that morning's wrong-rate rows as already
#: fixed and dropped the disclosure for 254 of them. The instant is bounded by
#: the ledger itself — the last ``gpt-5-6`` row is 19:28:41Z and the first
#: ``gpt-5-6-luna`` row (an alias that could not exist before the fix) is
#: 20:17:23Z — so 20:00Z sits inside the gap and misclassifies nothing.
#: ``corrected_on`` remains the human-facing date shown in the note.
HISTORICAL_RATE_CORRECTIONS: dict[str, dict[str, Any]] = {
    "gpt-5-6": {
        "corrected_on": "2026-08-04",
        "corrected_at": "2026-08-04T20:00:00+00:00",
        "factor": 2.000,
        "reason": (
            "model_id 'gpt-5.6' is not an id OpenAI lists; it was served by "
            "gpt-5.6-sol at $5.00/$30.00 while the registry recorded "
            "$2.50/$15.00. The alias is retired and the entry is now "
            "gpt-5-6-sol."
        ),
    },
    "gpt-5-5": {
        "corrected_on": "2026-08-04",
        "corrected_at": "2026-08-04T20:00:00+00:00",
        "factor": 2.003,
        "reason": (
            "rates were copied from gpt-5.4 when the entry was added and "
            "never confirmed; OpenAI publishes $5.00/$30.00. One row exists, "
            "so the ledger impact is sub-cent."
        ),
    },
    "gemini-3-1-pro": {
        "corrected_on": "2026-08-04",
        "corrected_at": "2026-08-04T20:00:00+00:00",
        "factor": 1.503,
        "reason": (
            "rates were placeholders mirroring gemini-2.5-pro; Google "
            "publishes $2.00/$12.00 at <=200k and $4.00/$18.00 above."
        ),
    },
}


def _uncorrected_cost(rec: dict, model: str) -> float:
    """The part of *rec*'s cost that predates *model*'s rate correction.

    Set 109 S4, round-2 finding: an earlier draft multiplied a model's WHOLE
    aggregate by its factor, so a `gpt-5-5` call made after the registry was
    fixed — priced correctly, from a confirmed rate — was still reported as
    understated 2x. The note claimed "rows dated before <date>" while the
    arithmetic used every row, and `gpt-5-5` / `gemini-3-1-pro` are live
    aliases that will keep accruing correct rows. A disclosure that overstates
    is the same defect as the one it discloses, pointing the other way.

    The comparison is against an INSTANT, not a date. The registry was
    corrected mid-afternoon, so a date-granular cutoff classified that
    morning's 254 wrong-rate ``gpt-5-6`` rows as already fixed and dropped
    their disclosure entirely — the same overstate/understate error one step
    to the left.

    A row with no readable timestamp counts as pre-correction: the ledger's
    uncorrected rows are the ones that predate this machinery, so an
    unparseable stamp is far likelier to be old than new, and over-disclosing
    a cent is better than silently dropping a correction.
    """
    correction = HISTORICAL_RATE_CORRECTIONS.get(model)
    if not correction:
        return 0.0
    cost = float(rec.get("cost_usd") or 0.0)
    raw = rec.get("timestamp")
    if not isinstance(raw, str):
        return cost
    try:
        stamped = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return cost
    cutoff = datetime.datetime.fromisoformat(correction["corrected_at"])
    if stamped.tzinfo is None:
        # A naive stamp cannot be ordered against an aware cutoff. Reading it
        # as UTC matches how every writer in this repo records time, and the
        # fallback if that is ever wrong is to over-disclose, not to hide.
        stamped = stamped.replace(tzinfo=datetime.timezone.utc)
    return cost if stamped < cutoff else 0.0


def historical_correction_notes(by_model: dict) -> list:
    """Disclosure lines for every affected model present in *by_model*.

    Empty when a report contains none of them, and empty for a model whose
    rows are ALL post-correction — so a report that needs no caveat carries
    none, and a caveat that appears is about money that is actually
    misreported.
    """
    notes = []
    for model, correction in sorted(HISTORICAL_RATE_CORRECTIONS.items()):
        data = by_model.get(model)
        if not data:
            continue
        reported = float(data.get("cost") or 0.0)
        affected = float(data.get("uncorrected_cost") or 0.0)
        if affected <= 0.0:
            # The model appears, but every row here was priced from the
            # corrected registry. Nothing to disclose.
            continue
        scope = (
            "all of it"
            if abs(affected - reported) < 1e-9
            else f"${affected:.4f} of the ${reported:.4f}"
        )
        # Round-3 nit: this said "rows dated before <date>" while the
        # arithmetic used an instant partway through that date, so same-day
        # morning rows were counted by a sentence that excluded them. Naming
        # the instant is the fix -- prose disagreeing with the computation
        # beside it is the defect this whole disclosure exists to correct.
        cutoff = correction["corrected_at"].replace("+00:00", " UTC")
        notes.append(
            f"{model}: rows recorded before the {cutoff} correction are "
            f"UNDERSTATED by about {correction['factor']:.3g}x -- {scope} "
            f"shown here, so ~${affected * correction['factor']:.4f} rather "
            f"than ${affected:.4f} for that portion. "
            f"{correction['reason']}"
        )
    return notes


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
    """
    if not record_value:
        return False
    rec_canon = _canonicalize_session_set_path(record_value) or ""
    # Windows drive-letter case: a row written with ``C:\...`` must match
    # a target passed as ``c:\...`` (normcase is a no-op on POSIX).
    if os.path.normcase(rec_canon) == os.path.normcase(target_canon):
        return True
    if target_basename:
        rec_base = os.path.basename(rec_canon)
        if os.path.normcase(rec_base) == os.path.normcase(target_basename):
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
          "local_invocation_calls": int,
          "billed_usage_unavailable_calls": int,
        }

    Adjudication records have zero cost so they are counted in
    ``total_calls`` but contribute nothing to ``total_cost``; the
    intent of this report is "what did this session set spend",
    which is the cost-bearing fields.

    ``local_invocation_calls`` / ``billed_usage_unavailable_calls`` (Set 078
    S3) count calls made through the ``copilot-cli`` transport profile —
    additive fields on the metrics record (absent/null on every "api"
    record). These calls always contribute ``$0.00`` to ``total_cost``
    because their spend is genuinely not billing-authoritative (design lock
    "honest non-accounting"), never because the report fabricated a zero —
    the caller renders them as a separate unbilled-invocation count instead
    of folding them silently into "total cost".
    """
    target_canon = _canonicalize_session_set_path(session_set_dir) or ""
    target_basename = os.path.basename(target_canon)

    path = _resolve_metrics_path()
    present = os.path.isfile(path)

    total_cost = 0.0
    total_calls = 0
    by_model: dict[str, dict[str, Any]] = {}
    local_invocation_calls = 0
    billed_usage_unavailable_calls = 0

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
                        model, {"calls": 0, "cost": 0.0,
                                "uncorrected_cost": 0.0}
                    )
                    slot["calls"] += 1
                    slot["cost"] += cost
                    # Set 109 S4: carried per model so the disclosure can
                    # scope itself to the rows it actually applies to. Zero
                    # for every model with no recorded rate correction.
                    slot["uncorrected_cost"] = slot.get(
                        "uncorrected_cost", 0.0
                    ) + _uncorrected_cost(rec, model)
                    if rec.get("transport") == "copilot-cli":
                        local_invocation_calls += 1
                    if rec.get("billed_usage_unavailable"):
                        billed_usage_unavailable_calls += 1
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
        "local_invocation_calls": local_invocation_calls,
        "billed_usage_unavailable_calls": billed_usage_unavailable_calls,
    }


def get_costs(session_set_dir: str) -> dict:
    """Return a dual-sourced cost summary for ``session_set_dir``.

    Backward-compatible: every key the old activity-log-only summary
    returned is still present at the top level — ``total_calls``,
    ``total_cost``, ``by_model``, ``sessions_completed``,
    ``sessions_remaining``. These continue to reflect the **activity
    log** so existing callers see no behavior change.

    Additional keys:

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
    # would always make ``activity_log_present`` look True.
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

    return summary


def _build_json_output(session_set_dir: str, summary: dict) -> dict:
    """Stable JSON projection of the dual-sourced summary. Floats
    rounded to 6 decimal places so successive runs on the same data
    produce stable diffs."""
    routed = summary["routed_canonical"]
    activity = summary["activity_supplemental"]
    return {
        # Set 109 S4: the same disclosure the text report prints, so a
        # programmatic consumer cannot read a corrected-away total as clean.
        "historical_rate_corrections": historical_correction_notes(
            summary["routed_canonical"]["by_model"]
        ),
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
            "local_invocation_calls": routed.get("local_invocation_calls", 0),
            "billed_usage_unavailable_calls": routed.get(
                "billed_usage_unavailable_calls", 0
            ),
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
    }


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
    corrections = historical_correction_notes(routed["by_model"])
    if corrections:
        print()
        print("  [!] HISTORICAL RATE CORRECTION (Set 109) -- the figures "
              "above are as recorded,")
        print("      and for these models what was recorded was wrong:")
        for line in corrections:
            print(f"      {line}")
        print("      The raw rows are a ledger and were deliberately not "
              "rewritten. Full")
        print("      reconciliation: docs/session-sets/"
              "109-model-registry-and-pricing-truth/")
        print("      s4-cost-reconciliation.md")
    if routed.get("local_invocation_calls"):
        # Set 078 S3: never fold these into "total cost" as if $0.00 meant
        # free — they are unbilled because the copilot-cli transport has no
        # dollar/token cost signal at all (honest non-accounting), not
        # because nothing happened. "Recorded", not "invocations": a failed
        # dispatch still consumes the invocation breaker's count but is
        # never written to metrics (session-verification finding), so this
        # total is a floor on real CLI spawns, not an exact count of them.
        print(f"  Recorded copilot-cli calls (unbilled): "
              f"{routed['local_invocation_calls']} of {routed['total_calls']} "
              f"calls -- cost not tracked (copilot-cli transport profile)")
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
