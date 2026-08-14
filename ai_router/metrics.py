"""Append-only metrics log for the AI router.

Writes one JSON line per routed call to ai_router/router-metrics.jsonl
(global, cross-session-set). The log is deliberately simple:
  - one record per line, no wrapping array
  - additive schema — new fields can be added without breaking old lines
  - safe to read with `tail -f` or stream-process with jq

Schema per line:
  {
    "timestamp":        ISO8601 string (UTC)
    "session_set":      str or null
    "session_number":   int or null
    "call_type":        "route" | "verify" | "tiebreaker" | "adjudication"
    "task_type":        str
    "model":            str  (the generator or verifier — the registry ALIAS,
                              e.g. "gpt-5-6", not the id put on the wire)
    "provider":         "anthropic" | "google" | "openai"
    # Set 109 S1 — requested-vs-served model truth. Both null on every
    # historical row and on any caller that does not supply them.
    "requested_model_id": str or null
         the registry entry's model_id, i.e. the string actually sent to the
         provider ("gpt-5.6"). Recorded because "model" above is the local
         alias: without this column a row cannot be compared to what the
         provider served except by joining against a version of
         router-config.yaml that has since been edited.
    "served_model_id":  str or null
         the id the provider says it served, from the response body
         (Anthropic/OpenAI "model", Google "modelVersion"). null means the
         provider did not report one — distinct from "served something else".
    "served_model_mismatch": bool or null
         true when the two ids above are both present and differ — the
         provider served something other than what was asked for. null (not
         false) when either id is absent, because "we did not capture it" is
         not "they matched". Computed at write time from the two columns, so
         a reader never has to know the comparison rule. Read it as a
         POINTER, not an alarm: OpenAI pins a dated snapshot on ordinary
         calls ("gpt-5.4-mini" -> "gpt-5.4-mini-2026-03-17"), which is a true
         mismatch and entirely routine. The costly kind is a change of
         FAMILY ("gpt-5.6" -> "gpt-5.6-sol"), which this column surfaces for
         inspection alongside the ids that let you tell the two apart.
    "tier":             int
    "complexity_score": int or null
    "effort":           str or null   (Anthropic effort or OpenAI reasoning.effort)
    "thinking_on":      bool          (Anthropic adaptive / Gemini dynamic / OpenAI reasoning)
    "input_tokens":     int
    "output_tokens":    int
    "cost_usd":         float
    "elapsed_seconds":  float
    "escalated":        bool
    "stop_reason":      str
    # For verifier calls only:
    "verifier_of":      str or null   (the generator model this call verified)
    "verdict":          str or null   ("VERIFIED" or "ISSUES_FOUND")
    "issue_count":      int or null
    # Verifier-selection observability (Session 9):
    "verifier_fallback":         bool or null
         true when the first verifier call failed at the HTTPS layer
         and _run_verification re-picked a different provider
    "fallback_from_provider":    str or null
         the provider that failed, when verifier_fallback is true
    "preferred_verifier_skipped": [str, str] or null
         [skipped_model, reason] when preferred_pairings named a model
         the rule-based selection rejected (e.g., not_enabled_as_verifier)
    # Set 078 S3 — honest seat accounting for the copilot-cli transport
    # profile. All four are null on every "api"-profile record (historical
    # and current alike) -- additive, never required by an existing reader.
    "transport":                  str or null  ("api" | "copilot-cli")
    "local_invocations":          int or null   (running CLI-spawn count
         for this process at the time of this call; never a billed count)
    "attempts":                   int or null   (dispatch attempts this
         call made; always 1 today -- the transport never retries
         internally, design lock Section 4)
    "billed_usage_unavailable":   bool or null  (true whenever cost_usd
         is not billing-authoritative for this record -- always true for
         "copilot-cli" records, always null/absent for "api" ones)
    # Set 130 S2 — the join key that makes a copilot-cli row's real cost
    # recoverable. Null on every historical row and on every api-profile
    # row, which reads as "not captured" rather than a false claim.
    "transport_session_id":       str or null
         the CONVERSATION id the transport reported for this call's child
         process -- the Copilot CLI result event's "sessionId", which
         cli_transport already captures into transport_metadata and which
         had nowhere to land until now. Named for the transport, not
         bare "session_id", because "session_set" / "session_number"
         above are the WORKFLOW session and the two are unrelated
         numbers. It is the primary key of
         ~/.copilot/session-store.db's assistant_usage_events, so a row
         carrying it can be priced exactly by ai_router/seat_cost.py
         (the "routed_seat" component); a row without it can only be
         attributed by wall clock, which cannot attribute at all --
         see ai_router/docs/seat-cost.md section 5.3. Null on the api
         profile is correct and permanent: that path's cost_usd is
         already authoritative and no child conversation exists.
    # Set 084 S2 (F3) -- the verification-evidence stamp (one key per
    # verification_stamp.STAMP_FIELDS entry -- that tuple is the
    # authoritative field list). All are null on every historical row
    # and on every row a sanctioned producer (verify_session / the
    # close backstop) did not write. The close gate accepts ONLY rows
    # whose stamp is present and internally consistent; a bare route()
    # row no longer corroborates a close. A stamped row's "verdict"
    # lands on the shared verdict column above (same meaning as on
    # verify-call rows). Field semantics: ai_router/verification_stamp.py.
    "source":                          str or null
    "evidence_sha256":                 str or null
    "template_id":                     str or null
    "template_sha256":                 str or null
    "verifier_model":                  str or null
    "orchestrator_effective_provider": str or null
    "artifact_path":                   str or null
    "artifact_sha256":                 str or null
    "package_version":                 str or null
    "evidence_base":                   str or null
    "work_diff_sha256":                str or null
  }

Adjudication records (call_type = "adjudication") are written by
record_adjudication() when a human resolves a verifier-finding
dispute under Step 7 of the session workflow. They share the
timestamp/session_set/session_number fields above but use a different
payload (see record_adjudication for the schema).

Analysis is done by reading the file; no query layer is needed for the
data volumes this workflow produces. See print_metrics_report().

Set 130 S3 -- what ``cost_usd`` is a measurement OF
---------------------------------------------------
``cost_usd`` is billing-authoritative only on rows where
``billed_usage_unavailable`` is not true. On a ``copilot-cli`` row it is a
placeholder beside a flag that says as much, and the spend is real:
Set 118 Session 1's five routed rounds recorded ``$0.0000`` here and
consumed 866.4 AI credits ($8.66). ``print_metrics_report`` therefore
reports the priced calls as priced, names the unpriced ones instead of
adding them in as zeros, and renders ``-`` rather than ``$0.0000`` for a
group with nothing priced in it. The seat measurement lives in
``ai_router/seat_cost.py`` and is keyed by ``transport_session_id``;
``ai_router/docs/seat-cost.md`` is canonical for the three measurements
and the rule that a report must say which one it is showing.
"""

import json
import os
import datetime
from pathlib import Path
from typing import Optional

_THIS_DIR = Path(__file__).parent


def _log_path(config: dict) -> Path:
    """Resolve the metrics log file path.

    Resolution order (highest priority first):
      1. ``AI_ROUTER_METRICS_PATH`` env var — explicit deployment override.
      2. ``config["_metrics_base_dir"]`` — set by ``load_config`` ONLY
         when the router-config.yaml was resolved via workspace
         discovery (``_find_workspace_config``). Explicit-path and
         ``AI_ROUTER_CONFIG``-overridden configs do NOT auto-redirect
         metrics; the two env vars stay independent, matching the
         0.1.0 contract.
      3. The package-bundled default at ``<this dir>/<filename>``.
    """
    metrics_cfg = config.get("metrics", {}) or {}
    filename = metrics_cfg.get("log_filename", "router-metrics.jsonl")

    override = os.environ.get("AI_ROUTER_METRICS_PATH")
    if override:
        return Path(override)

    base_dir = config.get("_metrics_base_dir")
    if base_dir:
        return Path(base_dir) / filename

    return _THIS_DIR / filename


def _metrics_enabled(config: dict) -> bool:
    metrics_cfg = config.get("metrics", {}) or {}
    return bool(metrics_cfg.get("enabled", True))


def _session_set_name(session_set):
    """Normalize a session-set identifier to the bare folder name.

    Callers have historically passed three shapes — the slug itself, a
    repo-relative ``docs/session-sets/<slug>``, and an absolute set-dir
    path (the VS Code extension spawns the CLIs with absolute paths, in
    either drive-letter casing on Windows). The mixed shapes fragmented
    per-set cost aggregation across multiple keys and leaked
    machine-specific paths into the log. Normalizing at the write
    boundary keeps the log slug-keyed; ``None`` stays ``None``.
    """
    if not session_set:
        return None
    name = str(session_set).replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
    return name or None


def record_call(
    config: dict,
    *,
    call_type: str,               # "route" | "verify" | "tiebreaker"
    task_type: str,
    model: str,
    provider: str,
    tier: int,
    complexity_score: Optional[int],
    generation_params: dict,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    elapsed_seconds: float,
    escalated: bool,
    stop_reason: str,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
    verifier_of: Optional[str] = None,
    verdict: Optional[str] = None,
    issue_count: Optional[int] = None,
    # Session 9 additions — verifier-selection observability.
    verifier_fallback: Optional[bool] = None,
    fallback_from_provider: Optional[str] = None,
    preferred_verifier_skipped: Optional[tuple] = None,
    # Set 078 S3 additions — honest seat accounting for the copilot-cli
    # transport profile. All three are None for every "api"-profile record
    # (additive-schema: absent/None on old lines and on every api-profile
    # line is indistinguishable from "not applicable", which is correct —
    # this profile is the only one where local invocation counting and
    # billed-usage-unavailability apply).
    transport: Optional[str] = None,
    local_invocations: Optional[int] = None,
    attempts: Optional[int] = None,
    billed_usage_unavailable: Optional[bool] = None,
    # Set 130 S2 addition — the routed child's CONVERSATION id, as the
    # transport reported it. Additive and optional on the same terms as
    # everything above: every historical row and every caller that omits
    # it records null, which is "not captured", never a claim that no
    # conversation existed. The api profile omits it permanently (no
    # child conversation exists there, and its cost_usd is already
    # authoritative). Callers pass a shape-checked value -- see
    # ai_router/__init__.py::_copilot_session_id, which owns that check
    # for both seat call sites.
    transport_session_id: Optional[str] = None,
    # Set 109 S1 additions — requested-vs-served model truth. Additive and
    # optional: every historical row and every caller that omits them records
    # null, which is correct ("we did not capture this"), never a false
    # equality claim.
    requested_model_id: Optional[str] = None,
    served_model_id: Optional[str] = None,
    # Set 084 S2 (F3) -- the verification-evidence stamp, passed as one
    # dict by the sanctioned producers via route(verification_stamp=...).
    # None (every other caller) leaves every stamp field null, keeping
    # historical and bare-route rows schema-compatible.
    stamp: Optional[dict] = None,
) -> None:
    """Append a single record to the metrics log. Never raises — if
    writing fails (disk full, permission), we silently skip rather
    than breaking the routed call."""
    if not _metrics_enabled(config):
        return

    # Extract effort / thinking_on from whatever shape the provider uses
    effort = None
    thinking_on = False
    if provider == "anthropic":
        effort = generation_params.get("effort")
        thinking_on = bool(
            (generation_params.get("thinking") or {}).get("enabled")
        )
    elif provider == "google":
        # Gemini "effort" equivalent: level or the nonzero budget bit
        effort = generation_params.get("thinking_level")
        budget = generation_params.get("thinking_budget")
        thinking_on = (effort is not None) or (
            budget is not None and budget != 0
        )
    elif provider == "openai":
        effort = generation_params.get("reasoning_effort")
        thinking_on = effort not in (None, "none", "minimal")

    record = {
        "timestamp": datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat(),
        "session_set": _session_set_name(session_set),
        "session_number": session_number,
        "call_type": call_type,
        "task_type": task_type,
        "model": model,
        "requested_model_id": requested_model_id,
        "served_model_id": served_model_id,
        # Tri-state on purpose: True/False only when BOTH ids are known, else
        # null. A false here would claim the provider served what we asked
        # for, which an absent id does not establish.
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
        "cost_usd": round(float(cost_usd), 6),
        "elapsed_seconds": round(float(elapsed_seconds), 3),
        "escalated": bool(escalated),
        "stop_reason": stop_reason,
        "verifier_of": verifier_of,
        "verdict": verdict,
        "issue_count": issue_count,
        # Session 9 additions: verifier-selection observability.
        # Null when the field is not applicable to this call type so
        # historical lines without these keys remain schema-compatible.
        "verifier_fallback": verifier_fallback,
        "fallback_from_provider": fallback_from_provider,
        "preferred_verifier_skipped": (
            list(preferred_verifier_skipped)
            if preferred_verifier_skipped else None
        ),
        # Set 078 S3 — honest seat accounting (None on every api-profile /
        # historical line; see the docstring above the record_call signature).
        "transport": transport,
        "local_invocations": local_invocations,
        "attempts": attempts,
        "billed_usage_unavailable": billed_usage_unavailable,
        # Set 130 S2 — the join key. Always present as a column so a
        # jq-style reader never has to tell "old row" from "api row"
        # (the shape argument Set 123 S2 made for the optional stamp
        # keys); null on both.
        "transport_session_id": transport_session_id,
    }

    # Set 084 S2 (F3) — the verification-evidence stamp. Written as
    # individual top-level keys (one per STAMP_FIELDS entry; additive —
    # all None when no stamp) so the close gate and jq-style readers
    # never have to unwrap a nested object on historical lines. The
    # stamp's ``verdict`` deliberately lands on the row's existing
    # ``verdict`` column (same meaning as on verify-call rows);
    # ``setdefault`` on the no-stamp path keeps a verify call's own
    # verdict intact.
    try:
        from .verification_stamp import STAMP_FIELDS, STAMP_OPTIONAL_FIELDS
    except ImportError:
        from verification_stamp import (  # type: ignore[no-redef]
            STAMP_FIELDS,
            STAMP_OPTIONAL_FIELDS,
        )
    if stamp:
        for stamp_field in STAMP_FIELDS:
            record[stamp_field] = stamp.get(stamp_field)
    else:
        for stamp_field in STAMP_FIELDS:
            record.setdefault(stamp_field, None)
    # Set 123 S2: the optional stamp keys travel too. They are written as
    # None when absent (same always-present-column shape as the rest), so a
    # jq-style reader never has to distinguish "old row" from "unqualified
    # row" -- and, critically, so a same-provider row reaches the close gate
    # still carrying the declaration the gate requires of it.
    for stamp_field in STAMP_OPTIONAL_FIELDS:
        record[stamp_field] = stamp.get(stamp_field) if stamp else None

    try:
        path = _log_path(config)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        # Metrics are best-effort. Never break a routed call.
        pass


# Valid values for the ``cause`` and ``resolution`` fields. Kept here
# as lists (not enums) so the log stays plain JSON-serializable.
ADJUDICATION_CAUSES = ("context-gap", "genuine-split", "orchestrator-error")
ADJUDICATION_RESOLUTIONS = (
    "accept-finding",       # human option (a)
    "accept-dismissal",     # human option (b)
    "reverify-reshaped",    # human option (c)
    "second-opinion",       # human option (d)
)


def record_adjudication(
    config: dict,
    *,
    task_type: str,
    cause: str,
    resolution: str,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
    generator_model: Optional[str] = None,
    verifier_model: Optional[str] = None,
    finding_summary: Optional[str] = None,
    dismissal_reason: Optional[str] = None,
) -> None:
    """Append a single adjudication record to the metrics log.

    Called from Step 7 of the session workflow when the orchestrator
    disagrees with a verifier finding and the human picks one of the
    four options from ai-led-session-workflow.md:

        (a) accept-finding       — verifier was right, fix it
        (b) accept-dismissal     — orchestrator was right, close it
        (c) reverify-reshaped    — context was wrong, re-run verify
        (d) second-opinion       — route to tiebreaker model

    The resulting records are joined against the ``verify`` records
    that preceded them (by session_set + session_number + task_type)
    to compute the "verifier findings adopted vs. dismissed" ratio in
    report.py.

    Args:
        task_type: Same task_type as the verify call being adjudicated.
        cause: One of ADJUDICATION_CAUSES. Why the orchestrator
            believes the disagreement occurred.
        resolution: One of ADJUDICATION_RESOLUTIONS. What the human
            chose.
        generator_model / verifier_model: Models involved in the
            original verified call (for joining against verify records).
        finding_summary / dismissal_reason: Short strings preserved for
            audit; not used in aggregate computation.

    Never raises — if writing fails we silently skip, matching
    record_call.
    """
    if not _metrics_enabled(config):
        return

    if cause not in ADJUDICATION_CAUSES:
        cause = f"unknown:{cause}"
    if resolution not in ADJUDICATION_RESOLUTIONS:
        resolution = f"unknown:{resolution}"

    record = {
        "timestamp": datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat(),
        "session_set": _session_set_name(session_set),
        "session_number": session_number,
        "call_type": "adjudication",
        "task_type": task_type,
        # These keep the schema uniform with the route/verify records
        # so jq-style filters don't have to special-case this row.
        "model": None,
        "provider": None,
        "tier": None,
        "complexity_score": None,
        "effort": None,
        "thinking_on": False,
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0.0,
        "elapsed_seconds": 0.0,
        "escalated": False,
        "stop_reason": None,
        "verifier_of": None,
        "verdict": None,
        "issue_count": None,
        "verifier_fallback": None,
        "fallback_from_provider": None,
        "preferred_verifier_skipped": None,
        # Adjudication-specific payload:
        "cause": cause,
        "resolution": resolution,
        "generator_model": generator_model,
        "verifier_model": verifier_model,
        "finding_summary": finding_summary,
        "dismissal_reason": dismissal_reason,
    }

    try:
        path = _log_path(config)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass


def load_metrics(config: dict) -> list[dict]:
    """Read every metrics record. Returns empty list if file missing."""
    path = _log_path(config)
    if not path.exists():
        return []

    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def transport_session_ids(
    session_set,
    session_number: Optional[int] = None,
    *,
    config: Optional[dict] = None,
    records: Optional[list] = None,
) -> list:
    """The routed children's CONVERSATION ids for one workflow session.

    Set 130 S3. ``transport_session_id`` (Set 130 S2) is the join key that
    makes a ``copilot-cli`` row's real cost recoverable, and this is the
    only sanctioned way to ask for a session's worth of them: the log is
    keyed by the normalized set slug (:func:`_session_set_name`), so a
    caller filtering on a raw path would silently match nothing against the
    historical mixed-shape rows.

    Deduped and order-preserving. Rows with no id contribute nothing --
    every pre-Set-130 row and every ``api``-profile row is null there, and
    null means "not captured", never "no conversation existed". A caller
    that gets back fewer ids than it made calls therefore holds a **floor**,
    not a complete set, which is exactly what ``seat_cost`` labels
    ``lower_bound``.

    *session_number* of ``None`` means every session of the set.
    """
    if records is None:
        records = load_metrics(config or {})
    wanted = _session_set_name(session_set)
    out: list = []
    for record in records:
        if not isinstance(record, dict):
            continue
        if _session_set_name(record.get("session_set")) != wanted:
            continue
        if (
            session_number is not None
            and record.get("session_number") != session_number
        ):
            continue
        value = record.get("transport_session_id")
        if not isinstance(value, str):
            continue
        cleaned = value.strip()
        if cleaned and cleaned not in out:
            out.append(cleaned)
    return out


def priced_and_unpriced(records: list) -> tuple:
    """Split *records* into (billing-authoritative, not-priced-here).

    Set 130 S3. ``cost_usd`` is only a measurement on rows whose
    ``billed_usage_unavailable`` is not true; on a ``copilot-cli`` row it is
    a placeholder sitting beside a flag that says so. Summing the two
    together and printing one dollar figure is how this report came to say
    ``Total cost: $0.0000`` for a session that consumed $8.66 of AI credits
    (``ai_router/docs/seat-cost.md``, measurement ``routed_seat``). Every
    cost cell below goes through this split, so no table can drift from the
    header (L-069-1).
    """
    priced: list = []
    unpriced: list = []
    for record in records:
        if isinstance(record, dict) and record.get("billed_usage_unavailable") is True:
            unpriced.append(record)
        else:
            priced.append(record)
    return priced, unpriced


def _priced_sum(records: list) -> float:
    """The billing-authoritative cost of *records*, used only for ordering."""
    priced, _ = priced_and_unpriced(records)
    return sum(r.get("cost_usd", 0) or 0 for r in priced)


def _cost_cell(records: list, width: int = 8) -> str:
    """Render a cost cell that never presents unpriced calls as ``$0.0000``.

    A group with no billing-authoritative row at all renders ``-``: printing
    ``$0.0000`` there is the fail-open defect, because zero looks like a
    measurement (L-112-1). A mixed group prints the priced sum with a ``+``
    suffix, which says out loud that something in that row is not in the
    number. ASCII only (project-guidance Code Style).
    """
    priced, unpriced = priced_and_unpriced(records)
    if not priced:
        return f"{'-':>{width + 2}}"
    total = sum(r.get("cost_usd", 0) or 0 for r in priced)
    return f"${total:>{width}.4f}" + ("+" if unpriced else " ")


def served_model_mismatches(records: list) -> dict:
    """Group rows where the provider served something other than what was
    asked for, keyed by ``"<requested> -> <served>"`` with the call count.

    Rows predating Set 109 S1 carry neither id and are simply absent from the
    result: an uncaptured pair is not evidence of a match.
    """
    grouped: dict = {}
    for record in records:
        if not record.get("served_model_mismatch"):
            continue
        key = (
            f"{record.get('requested_model_id')} -> "
            f"{record.get('served_model_id')}"
        )
        grouped[key] = grouped.get(key, 0) + 1
    return grouped


def print_served_model_mismatches(records: list) -> None:
    """Operator-visible surface for the mismatch flag. ASCII-only."""
    observed = sum(
        1 for r in records if r.get("served_model_mismatch") is not None
    )
    if not observed:
        return
    grouped = served_model_mismatches(records)
    print("\n--- Requested vs served model ---")
    if not grouped:
        print(f"  [ ] {observed} call(s) recorded both ids; none mismatched.")
        return
    total = sum(grouped.values())
    print(
        f"  [~] {total} of {observed} call(s) with both ids recorded were "
        "served a DIFFERENT model id than requested."
    )
    print(
        "      A dated-snapshot pin is routine; a change of model FAMILY is "
        "the one that changes the price."
    )
    for key, count in sorted(grouped.items(), key=lambda kv: -kv[1]):
        print(f"      {count:>5}x  {key}")


def print_metrics_report(config: dict) -> None:
    """Print a human-readable summary of the metrics log to stdout."""
    records = load_metrics(config)
    if not records:
        print("(no metrics recorded yet — router-metrics.jsonl is empty "
              "or missing)")
        return

    # Header
    print("\n" + "=" * 68)
    print(f"AI ROUTER — METRICS REPORT  ({len(records)} calls logged)")
    print("=" * 68)

    # Overall totals. Set 130 S3: cost_usd is a measurement only on rows
    # that do not carry billed_usage_unavailable, so the header says which
    # measurement it is showing and names what it could not measure --
    # ai_router/docs/seat-cost.md section 2, the rule this report used to
    # break by printing an authoritative "Total cost: $0.0000".
    priced, unpriced = priced_and_unpriced(records)
    total_cost = sum(r.get("cost_usd", 0) or 0 for r in priced)
    total_input = sum(r.get("input_tokens", 0) or 0 for r in records)
    total_output = sum(r.get("output_tokens", 0) or 0 for r in records)
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
              f"{with_id} carry the conversation id that prices them")
        print("                                    -> python -m ai_router.seat_cost "
              "--routed <id> ...  (ai_router/docs/seat-cost.md)")
    print(f"Total input tokens:   {total_input:,}")
    print(f"Total output tokens:  {total_output:,}")

    print_served_model_mismatches(records)

    # By model: call count, cost, escalation rate
    print("\n--- By model ---")
    by_model: dict[str, dict] = {}
    for r in records:
        m = r.get("model", "?")
        slot = by_model.setdefault(m, {
            "records": [], "escalated": 0,
            "provider": r.get("provider", "?"),
        })
        slot["records"].append(r)
        if r.get("escalated"):
            slot["escalated"] += 1

    hdr = f"  {'model':<18} {'provider':<11} {'calls':>6} " \
          f"{'cost':>10} {'esc%':>6}"
    print(hdr)
    print(f"  {'-'*18} {'-'*11} {'-'*6} {'-'*10} {'-'*6}")
    for m, s in sorted(by_model.items(), key=lambda kv: -_priced_sum(kv[1]["records"])):
        calls = len(s["records"])
        esc_pct = (100.0 * s["escalated"] / calls) if calls else 0
        print(f"  {m:<18} {s['provider']:<11} {calls:>6} "
              f"{_cost_cell(s['records'])} {esc_pct:>5.1f}%")

    # By task type: cost concentration and escalation signal
    print("\n--- By task type ---")
    by_task: dict[str, dict] = {}
    for r in records:
        t = r.get("task_type", "?")
        slot = by_task.setdefault(t, {
            "records": [], "escalated": 0,
            "models_used": {},
        })
        slot["records"].append(r)
        if r.get("escalated"):
            slot["escalated"] += 1
        m = r.get("model", "?")
        slot["models_used"][m] = slot["models_used"].get(m, 0) + 1

    hdr2 = f"  {'task_type':<24} {'calls':>6} {'cost':>10} " \
           f"{'esc%':>6}  model distribution"
    print(hdr2)
    print(f"  {'-'*24} {'-'*6} {'-'*10} {'-'*6}  {'-'*36}")
    for t, s in sorted(by_task.items(), key=lambda kv: -_priced_sum(kv[1]["records"])):
        calls = len(s["records"])
        esc_pct = (100.0 * s["escalated"] / calls) if calls else 0
        dist = ", ".join(
            f"{m}:{n}" for m, n in sorted(
                s["models_used"].items(), key=lambda kv: -kv[1]
            )[:3]
        )
        print(f"  {t:<24} {calls:>6} {_cost_cell(s['records'])} "
              f"{esc_pct:>5.1f}%  {dist}")

    # Verifier agreement: verification calls only
    v_records = [r for r in records if r.get("call_type") == "verify"]
    if v_records:
        print("\n--- Verifier agreement (session-end + auto-verify) ---")
        print(f"  Total verification calls: {len(v_records)}")
        verified = sum(1 for r in v_records if r.get("verdict") == "VERIFIED")
        issues = sum(1 for r in v_records
                     if r.get("verdict") == "ISSUES_FOUND")
        pct = (100.0 * verified / len(v_records)) if v_records else 0
        print(f"  VERIFIED:     {verified} ({pct:.1f}%)")
        print(f"  ISSUES_FOUND: {issues}")

        # Agreement by verifier model: how often each verifier passes
        by_verifier: dict[str, dict] = {}
        for r in v_records:
            vm = r.get("model", "?")
            slot = by_verifier.setdefault(vm, {"n": 0, "verified": 0})
            slot["n"] += 1
            if r.get("verdict") == "VERIFIED":
                slot["verified"] += 1
        print(f"\n  {'verifier':<18} {'calls':>6} {'pass%':>7}")
        print(f"  {'-'*18} {'-'*6} {'-'*7}")
        for vm, s in sorted(by_verifier.items(),
                            key=lambda kv: -kv[1]["n"]):
            rate = (100.0 * s["verified"] / s["n"]) if s["n"] else 0
            print(f"  {vm:<18} {s['n']:>6} {rate:>6.1f}%")

    # Session-set breakdown (last 5 distinct session sets).
    # Normalize on read too: historical lines carry the pre-normalization
    # mixed shapes (slug / relative / absolute), and the report should
    # aggregate them as one set rather than three.
    sets: dict[str, dict] = {}
    for r in records:
        ss = _session_set_name(r.get("session_set"))
        if not ss:
            continue
        slot = sets.setdefault(ss, {"records": []})
        slot["records"].append(r)

    if sets:
        print("\n--- By session set ---")
        print(f"  {'session_set':<40} {'calls':>6} {'cost':>10}")
        print(f"  {'-'*40} {'-'*6} {'-'*10}")
        for ss, s in sorted(sets.items()):
            print(f"  {ss:<40} {len(s['records']):>6} "
                  f"{_cost_cell(s['records'])}")

    if unpriced:
        print("\n  '-' means no call in that row was priced here; a trailing "
              "'+' means some were not.")
        print("  Neither is zero spend. Seat cost is measured by conversation "
              "id, not by this column.")

    print("=" * 68 + "\n")
