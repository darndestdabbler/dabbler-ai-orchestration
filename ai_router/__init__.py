"""
AI Router — Lightweight model routing for Claude Code.

Module map (for new contributors):
  __init__.py            route() — the public routing entry point; start here
  close_session.py       Close-out gate: deterministic checks + state flip (Full-tier)
  session_state.py       Lifecycle snapshot (session-state.json) + events ledger (Full-tier)
  gate_checks.py         Deterministic close-out predicates (Full-tier)
  disposition.py         Disposition dataclass + validator — the per-session outcome record
  worktree.py            Worktree lifecycle CLI (open / close / list)
  notifications.py       Session-complete push notifications (optional)
  router-config.yaml     Model selection, task types, tier mapping, complexity weights

Usage:
    from ai_router import (
        route, verify, query, get_costs, print_cost_report,
        print_session_set_status,
        send_pushover_notification, send_session_complete_notification
    )

    # Route a task to the best model automatically
    # (if the task type is in auto_verify_task_types, verification happens
    #  automatically and the result includes verifier feedback)
    result = route(
        content="Review this code for security issues:\n```python\n...\n```",
        task_type="code-review",
        context="This is a Flask web app handling user authentication.",
        complexity_hint=None  # optional 1-100 override
    )
    print(result.content)
    print(f"Cost: ${result.total_cost_usd:.4f} via {result.model_name}")
    if result.verification:
        print(f"Verified by: {result.verification.verifier_model}")
        print(f"Verdict: {result.verification.verdict}")

    # Explicitly verify any result (even if not auto-verified)
    result = route(content="...", task_type="documentation")
    check = verify(result)
    print(check.verdict)        # "VERIFIED" or "ISSUES_FOUND"
    print(check.issues)         # list of issues if any

    # Force a specific model
    result = query(
        model="gemini-flash",
        content="Reformat this JSON:\n...",
        task_type="formatting"
    )

    # Get cost report (includes verification costs)
    costs = get_costs()
    print_cost_report()

Session logging is handled externally by the caller (Claude Code) via
the SessionLog class:

    from ai_router.session_log import SessionLog

    log = SessionLog("docs/session-sets/my-feature")
    log.log_step(session_number=1, step_number=1, ...)
"""

__version__ = "0.27.0"

from .config import load_config, resolve_generation_params
from .models import estimate_complexity, pick_model
from .providers import call_model
from .secret_resolver import resolve_secret, register_backend
from .prompting import build_prompt
from .session_log import SessionLog
from .session_state import (
    SESSION_STATE_FILENAME,
    SCHEMA_VERSION as SESSION_STATE_SCHEMA_VERSION,
    CloseoutGateFailure,
    GateCheckFailure,
    SessionLifecycleState,
    NextOrchestrator,
    NextOrchestratorReason,
    NEXT_ORCHESTRATOR_REASON_CODES,
    NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN,
    compute_effective_completed_sessions,
    register_session_start,
    mark_session_complete,
    read_session_state,
    validate_next_orchestrator,
)
from .disposition import (
    DISPOSITION_FILENAME,
    DISPOSITION_STATUSES,
    VERIFICATION_METHODS,
    Disposition,
    disposition_from_dict,
    disposition_to_dict,
    read_disposition,
    validate_disposition,
    write_disposition,
)
from .session_events import (
    SESSION_EVENTS_FILENAME,
    EVENT_TYPES,
    Event,
    append_event,
    read_events,
    hash_existing_prefix,
    current_lifecycle_state,
    backfill_events_for_session_set,
    backfill_all_session_sets,
)
from .decision_review_queue import (
    DECISION_REVIEW_QUEUE_FILENAME,
    read_queue as read_decision_review_queue,
    clear_queue as clear_decision_review_queue,
    queue_path as decision_review_queue_path,
)
from .utils import (
    RateLimiter,
    should_escalate,
    get_escalation_model,
    detect_truncation,
    kill_conhost_processes,
)
from .metrics import (
    record_call, record_adjudication, load_metrics, print_metrics_report,
    ADJUDICATION_CAUSES, ADJUDICATION_RESOLUTIONS,
)
from .notifications import (
    NotificationResult,
    send_pushover_notification,
    send_session_complete_notification,
)
from .verification import (
    pick_verifier_model, build_verification_prompt,
    parse_verification_response, parse_nits, VerifierSelection,
    is_blocking_verdict, classify_blocking, BlockingClassification,
    reconcile_issue_ledger, LedgerReconciliation,
    LEDGER_RESOLVED, LEDGER_UNRESOLVED,
    pick_copilot_cli_verifier, CopilotCliVerifierSelection,
    ProvenanceUnavailable, walk_role_prefer,
    VerificationUnavailableError,
)
# Set 084 (F1/F2): shared orchestrator-identity resolution — the close
# gate, verifier exclusion, and start_session validation all resolve the
# effective provider through this one helper.
from .orchestrator_identity import (
    IdentityResolutionError,
    OrchestratorIdentity,
    MULTI_PROVIDER_ENGINES,
    classify_identity_provenance,
    is_multi_provider_engine,
    resolve_model_provider,
    resolve_orchestrator_identity,
    resolve_session_orchestrator_identity,
)
# Set 078 S3: the copilot-cli transport profile's routing integration.
# cli_transport.py / copilot_catalog.py (Set 078 S2) are already
# result-object-style (never raise) so route()/verify() compose them
# directly rather than needing new plumbing in either module.
from .cli_transport import CopilotCliTransport
from .copilot_catalog import (
    Catalog as CopilotCatalog,
    load_lockfile as load_copilot_catalog,
    validate_catalog as validate_copilot_catalog,
    get_cli_version as get_copilot_cli_version,
)
from .close_out import (
    CLOSE_OUT_RESULTS,
    FreshCloseOutResult,
    SESSION_CLOSE_OUT_TASK_TYPE,
    route_fresh_close_out_turn,
)
from .reconciler import (
    DEFAULT_QUIET_WINDOW_MINUTES as RECONCILER_DEFAULT_QUIET_WINDOW_MINUTES,
    ReconcileEntry,
    ReconcileSummary,
    reconcile_sessions,
    register_sweeper_hook,
)

from dataclasses import dataclass, field
from typing import Optional
import threading
import time
import os
import json
import logging

# Module-level singletons, initialized on first call
_config = None
_rate_limiters = {}
_logger = logging.getLogger("ai_router.session_verification")

if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)

_logger.setLevel(logging.INFO)
_logger.propagate = False

# Set 078 S3: the copilot-cli transport profile's own singletons. Populated
# by _init_copilot_transport() only when transport.profile == "copilot-cli"
# (untouched, None, under the default "api" profile — no cost to the
# regression-suite-identical claim). _copilot_invocation_count is the hard
# circuit breaker's local counter: it is a per-process count of every CLI
# spawn attempted through _copilot_cli_dispatch(), NOT a billed count (design
# lock Section 5 — a safety ceiling on what we DID, never a fabricated cap on
# what GitHub billed).
#
# KNOWN LIMITATION (round-2 session-verification finding, Set 078 S3): this
# counter is scoped to ONE PYTHON PROCESS, not to an ai-led-workflow session
# (which commonly spans many separate route()/verify() process invocations
# — this repo's own orchestrator usage pattern is a fresh `python -c "..."`
# process per routed call). A long orchestrator session that never keeps one
# process alive therefore never accumulates past 1-2 per process, and the
# ceiling only bites within a single runaway process (e.g. a tight loop of
# route() calls). Making this genuinely cross-process would mean deriving the
# count from a persistent source (e.g. router-metrics.jsonl, scoped by
# session_set/session_number) instead of an in-memory global — but metrics
# logging is itself optional (metrics.enabled: false), so tying a HARD safety
# breaker to an optional log is its own tradeoff, not a drop-in improvement.
# Left as a deliberate, disclosed scoping decision for this session rather
# than an unreviewed architecture change; a future session can revisit if the
# per-process ceiling proves insufficient in practice.
_copilot_transport: Optional[CopilotCliTransport] = None
_copilot_catalog: Optional[CopilotCatalog] = None
_copilot_invocation_count = 0
_copilot_invocation_lock = threading.Lock()


def _init():
    global _config, _rate_limiters
    if _config is None:
        config_path = os.environ.get("AI_ROUTER_CONFIG")  # None → uses __file__-relative default
        _config = load_config(config_path)
        for provider_name, provider_cfg in _config["providers"].items():
            _rate_limiters[provider_name] = RateLimiter(
                provider_cfg["rate_limit"]["requests_per_minute"],
                provider_cfg["rate_limit"]["tokens_per_minute"]
            )
        if _config["transport"]["profile"] == "copilot-cli":
            _init_copilot_transport()


def _init_copilot_transport() -> None:
    """Load + fail-closed-validate the seat catalog and construct the CLI
    transport. Runs once per process, only under the copilot-cli profile.

    "Fail loud, fail early" (Architecture section): an unreadable lockfile or
    a catalog that fails any of the four fail-closed rules stops route()/
    verify() from ever dispatching, with a friendly, actionable message —
    never a silent fallback to the api transport.
    """
    global _copilot_transport, _copilot_catalog

    cli_cfg = _config["transports"]["copilot-cli"]
    lockfile_path = cli_cfg["lockfile"]
    try:
        catalog = load_copilot_catalog(lockfile_path)
    except (OSError, ValueError) as exc:
        raise RuntimeError(
            f"transport.profile is 'copilot-cli' but the catalog lockfile at "
            f"{lockfile_path!r} could not be loaded ({exc}). Run "
            f"'python -m ai_router.copilot_catalog --refresh --seat-id "
            f"<your-seat-id>' to generate it, or switch transport.profile "
            f"back to 'api'."
        ) from exc

    binary = cli_cfg.get("binary", "copilot")
    live_cli_version = get_copilot_cli_version(binary=binary) or "unknown"
    # NOTE on live_seat_id: the CLI has no whoami/account-identity surface
    # distinguishable from the lockfile's own recorded seat_id (S1 finding —
    # no discovery/list-models command exists either). There is therefore no
    # independent "live" seat assertion to probe at routing time; passing the
    # lockfile's own seat_id makes this one rule a documented no-op here
    # rather than a false sense of security. It still does real, load-bearing
    # work at --refresh time and remains meaningful the moment an
    # operator-declared expected seat_id is added to router-config.yaml (a
    # config.py change intentionally out of this session's scope). The other
    # three rules (version drift, provenance, provider diversity) are fully
    # live checks regardless.
    validation = validate_copilot_catalog(
        catalog, live_cli_version=live_cli_version, live_seat_id=catalog.meta.seat_id,
    )
    if not validation.ok:
        raise RuntimeError(
            "transport.profile is 'copilot-cli' but the catalog lockfile "
            "failed its fail-closed validation: "
            + "; ".join(validation.reasons)
            + ". Re-run 'python -m ai_router.copilot_catalog --refresh' to "
              "refresh it."
        )

    _copilot_catalog = catalog
    _copilot_transport = CopilotCliTransport(binary=binary)


@dataclass
class VerificationResult:
    verdict: str               # "VERIFIED" or "ISSUES_FOUND"
    verified: bool             # True if verdict == "VERIFIED"
    issues: list               # list of issue dicts if any
    verifier_model: str        # which model verified
    verifier_provider: str     # which provider (for cross-provider confirmation)
    generator_model: str       # which model generated the original
    generator_provider: str    # which provider generated the original
    verifier_input_tokens: int
    verifier_output_tokens: int
    verifier_cost_usd: float
    raw_response: str          # full verifier response text
    # Set 071 (S2): the severity-derived re-verify decision + the non-blocking
    # nits, surfaced at the one programmatic verification site so the re-verify
    # loop reads them directly instead of switching on the bare verdict token.
    # ``blocking`` is is_blocking_verdict(verdict, issues): a round reopens only
    # when True (>=1 Critical/Major, or unknown-severity in a non-VERIFIED
    # result); a Minor-only / nits-only round is non-blocking ("effectively
    # VERIFIED for the loop"). ``nits`` is the read-only NITS list (never
    # blocking). Defaulted so existing constructors stay backward-compatible.
    blocking: bool = False
    nits: list = field(default_factory=list)


@dataclass
class RouteResult:
    content: str
    model_name: str
    model_id: str
    tier: int
    input_tokens: int
    output_tokens: int
    cost_usd: float            # cost of the generation call only
    total_cost_usd: float      # generation + verification combined
    complexity_score: int
    escalated: bool
    escalation_history: list   # [(model, reason), ...]
    elapsed_seconds: float
    # True when the response appears cut off mid-content. Set when the
    # provider reports `stop_reason="max_tokens"` OR when a syntactic-
    # completeness heuristic fires (unclosed code fence, brace imbalance).
    # The heuristic exists because gemini-pro has been observed to return
    # `stop_reason="end_turn"` on visibly truncated responses; the
    # provider signal alone is not sufficient. Callers should check
    # this flag before logging a routed call as successful.
    truncated: bool = False
    verification: Optional[VerificationResult] = None  # populated if verified


# Set 048 Session 2: --no-router mode stub model identifier. Surfaced
# in RouteResult.model_name and VerificationResult.verifier_model so
# downstream observers (metrics, audit logs) can tell at a glance that
# no actual LLM call happened.
_NO_ROUTER_MODEL = "no-router-mode"
_NO_ROUTER_VERDICT = "no_router_skipped"


def _build_no_router_route_stub() -> "RouteResult":
    """Return a zero-cost RouteResult stub for --no-router-mode invocations.

    Set 048 §3.1 A3: callers SHOULD check ``runtime_mode.is_no_router_mode()``
    before invoking ``route()`` and short-circuit at the call site. This
    stub exists as a defensive safety net so a stray invocation under
    Lightweight tier never hits an LLM API or requires credentials in env.
    """
    return RouteResult(
        content="",
        model_name=_NO_ROUTER_MODEL,
        model_id=_NO_ROUTER_MODEL,
        tier=0,
        input_tokens=0,
        output_tokens=0,
        cost_usd=0.0,
        total_cost_usd=0.0,
        complexity_score=0,
        escalated=False,
        escalation_history=[],
        elapsed_seconds=0.0,
        truncated=False,
        verification=None,
    )


def _build_no_router_verification_stub(generator_model: str) -> "VerificationResult":
    """Return a zero-cost VerificationResult stub for --no-router-mode invocations.

    Set 048 §3.1 A3: returned when ``verify()`` is called while
    ``runtime_mode.is_no_router_mode()`` is True. The verdict
    ``no_router_skipped`` is explicit so downstream metrics + audit
    code don't mistake the stub for a real ``VERIFIED`` / ``ISSUES_FOUND``
    outcome.
    """
    return VerificationResult(
        verdict=_NO_ROUTER_VERDICT,
        verified=False,
        issues=[],
        verifier_model=_NO_ROUTER_MODEL,
        verifier_provider=_NO_ROUTER_MODEL,
        generator_model=generator_model,
        generator_provider=_NO_ROUTER_MODEL,
        verifier_input_tokens=0,
        verifier_output_tokens=0,
        verifier_cost_usd=0.0,
        raw_response="[skipped: --no-router mode active]",
    )


# ---------------------------------------------------------------------------
# Set 078 S3: route()/verify() integration for the copilot-cli transport
# profile. Kept as a fully separate code path from the api-profile body below
# (Architecture section: "Under the api profile the dispatch path is
# unchanged" / Feature 1 Standards: "the api profile passes the entire
# existing suite unchanged") — this never rewrites, wraps, or shares control
# flow with the escalation-loop / pick_model / call_model body, so the
# api-path regression suite cannot be affected by a bug here.
# ---------------------------------------------------------------------------


class CopilotCliRoutingError(RuntimeError):
    """Raised when route()/verify() cannot proceed at all under the
    copilot-cli profile: an unresolvable generator role, or a failed
    dispatch. Fail-loud by design (Architecture: "fail loud, fail early") —
    never a silent fallback to the api transport."""


class InvocationBreakerTripped(CopilotCliRoutingError):
    """The transports.copilot-cli.max_invocations_per_session hard circuit
    breaker has already been reached for this process (design lock Section
    5: a safety ceiling on local invocation count that we DID make, never a
    fabricated cap on what GitHub billed)."""


# Cost-keyed guard exclusions (design lock Section 5 guard-exclusion list).
# Every guard whose decision is keyed on a dollar/token cost ESTIMATE must
# skip under billed_usage_unavailable — never guess a fabricated cost for a
# transport with no real cost signal. Guards that are NOT cost-keyed (the
# hard invocation breaker, timeouts, retry policy, lockfile/provider-
# diversity validation) stay active regardless of profile and are
# deliberately absent from this list.
GUARD_DOLLAR_SPEND_BUDGET = "dollar_spend_budget"
GUARD_TOKEN_COST_ESTIMATE = "token_cost_estimate"
GUARD_PROVIDER_PRICE_TABLE_ESTIMATE = "provider_price_table_estimate"
GUARD_QUOTA_BALANCE_PREFLIGHT = "quota_balance_preflight"

COST_KEYED_GUARDS = frozenset({
    GUARD_DOLLAR_SPEND_BUDGET,
    GUARD_TOKEN_COST_ESTIMATE,
    GUARD_PROVIDER_PRICE_TABLE_ESTIMATE,
    GUARD_QUOTA_BALANCE_PREFLIGHT,
})


@dataclass(frozen=True)
class CostGuardSkipDecision:
    guard: str
    skip: bool
    reason: str


def evaluate_cost_guard(guard: str, config: dict) -> CostGuardSkipDecision:
    """Decide whether a cost-keyed guard should skip under the active
    transport profile. Every cost-keyed guard call site consults this
    instead of re-deriving "is this profile billed" locally, so the skip
    decision — and its recorded reason — is uniform across every guard
    category and independently testable per category.
    """
    if guard not in COST_KEYED_GUARDS:
        raise ValueError(f"Unknown cost-keyed guard: {guard!r}")

    profile = (config.get("transport") or {}).get("profile", "api")
    if profile != "copilot-cli":
        return CostGuardSkipDecision(
            guard=guard, skip=False,
            reason="api profile: billed cost signal available",
        )

    cli_cfg = (config.get("transports") or {}).get("copilot-cli") or {}
    # Default True: billed_usage_unavailable is this profile's defining
    # property (router-config.yaml ships it explicitly true), so an absent
    # key means "unavailable", not "available" -- code-review finding, Set
    # 078 S3: the original `.get(..., False)` inverted this, silently
    # NOT skipping (and therefore raising in _run_verification_via_
    # copilot_cli) for any config that omitted the key.
    if not cli_cfg.get("billed_usage_unavailable", True):
        return CostGuardSkipDecision(
            guard=guard, skip=False,
            reason=(
                "copilot-cli profile configured with "
                "billed_usage_unavailable=False"
            ),
        )

    return CostGuardSkipDecision(
        guard=guard, skip=True,
        reason=(
            "billed_usage_unavailable: copilot-cli has no dollar/token "
            "cost signal"
        ),
    )


_VERIFICATION_UNAVAILABLE_VERDICT = "verification_unavailable"

# The one task type whose selection is governed by dynamic orchestrator
# exclusion (Set 084 F2). Mirrors gate_checks / verify_session.
SESSION_VERIFICATION_TASK_TYPE = "session-verification"


def _build_verification_unavailable_stub(
    generator_model_id: str, generator_provider: str, reason: str
) -> "VerificationResult":
    """Fail-closed stub for the copilot-cli verifier provenance rule
    (Critique-2 M3): returned instead of raising when no confirmed catalog
    entry resolves the verifier role to a provider distinct from the
    generator's. Non-blocking so it never reopens a re-verify loop on its
    own, but the distinct verdict token keeps it from ever being mistaken
    for a real VERIFIED / ISSUES_FOUND outcome — "operator-visible,
    non-silent" per the Architecture section.
    """
    return VerificationResult(
        verdict=_VERIFICATION_UNAVAILABLE_VERDICT,
        verified=False,
        issues=[],
        verifier_model="none",
        verifier_provider="none",
        generator_model=generator_model_id,
        generator_provider=generator_provider,
        verifier_input_tokens=0,
        verifier_output_tokens=0,
        verifier_cost_usd=0.0,
        raw_response=f"[verification unavailable: {reason}]",
        blocking=False,
        nits=[],
    )


def _resolve_copilot_generator(
    config: dict, catalog: "CopilotCatalog",
    exclude_providers: frozenset = frozenset(),
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Resolve the ``generator`` role against the seat-local catalog.

    Returns ``(model_id, provider, failure_reason)`` — ``failure_reason`` is
    ``None`` on success. Walks ``transports.copilot-cli.roles.generator.
    prefer`` in declared order; the first entry that is ``confirmed`` on the
    live catalog, whose provider is in ``require_provider_in`` (when set),
    and whose provider is not in *exclude_providers* (Set 084 F2 — the
    session orchestrator's effective provider, for session-verification
    dispatch) wins. Never raises — the caller decides how loud to be about
    a failure (unlike the verifier role, there is no "generation
    unavailable" fallback: without a generator there is nothing to route).
    """
    roles_cfg = (
        (config.get("transports") or {}).get("copilot-cli") or {}
    ).get("roles") or {}
    gen_cfg = roles_cfg.get("generator") or {}
    prefer = gen_cfg.get("prefer") or []
    require_provider_in = set(gen_cfg.get("require_provider_in") or [])

    survivor = next(
        walk_role_prefer(
            catalog, prefer, require_provider_in, exclude_providers
        ),
        None,
    )
    if survivor is not None:
        return survivor.id, survivor.provider, None

    # R3 remediation (I-084-S1-6): when an EXCLUSION is active (a Set 084
    # session-verification dispatch), the spec's contract is "exclusion is
    # applied against the catalog lockfile's CONFIRMED ENTRIES; no
    # different-provider candidate -> verification_unavailable" — the
    # prefer list is a preference ORDER, not the candidate universe. So
    # before declaring nothing resolvable, fall back to any confirmed
    # catalog entry (in catalog order) whose provider is allowed and not
    # excluded. verification_unavailable may then fire only when the
    # confirmed catalog truly has no surviving different-provider
    # candidate. Without an exclusion the pre-084 contract is unchanged:
    # the generator role resolves from prefer alone.
    if exclude_providers:
        for entry in catalog.confirmed_models():
            if require_provider_in and entry.provider not in require_provider_in:
                continue
            if entry.provider in exclude_providers:
                continue
            return entry.id, entry.provider, None

    return None, None, (
        f"no confirmed catalog entry in the generator role's prefer list "
        f"{prefer!r} resolves to a provider in require_provider_in="
        f"{sorted(require_provider_in)!r}"
        + (
            f" outside excluded providers {sorted(exclude_providers)!r} "
            "(the full confirmed catalog was also scanned — no "
            "different-provider candidate exists on this seat)"
            if exclude_providers
            else ""
        )
    )


def _copilot_provider_of(model_id: str) -> Optional[str]:
    """Look up ``model_id``'s provider from the seat catalog's CONFIRMED
    entries only. Returns ``None`` when the model isn't there.

    Round-3 session-verification finding, Set 078 S3: an earlier version of
    this function fell back to the bare name-prefix heuristic
    (:func:`ai_router.copilot_catalog.infer_provider`) for a model absent
    from the catalog. That heuristic is trustworthy for a CONFIRMED catalog
    entry (Session 2's ``discover_catalog`` only records it after actually
    dispatching the model successfully, and ``validate_catalog`` checks the
    result against ``KNOWN_PROVIDERS`` at load time) — but a bare, untracked
    ``model_id`` string has neither safeguard: nothing confirms the guess is
    even plausible, let alone correct, and this value drives a same-provider
    SAFETY exclusion (``cross_role_provider_diversity``). The caller
    (``verify()``) fails closed to "verification unavailable" on ``None``
    rather than resolving a verifier against an unconfirmed guess.
    """
    if _copilot_catalog is not None:
        for entry in _copilot_catalog.confirmed_models():
            if entry.id == model_id:
                return entry.provider
    return None


def _copilot_cli_dispatch(model_id: str, system_prompt: str, user_message: str):
    """The single call site every copilot-cli generator/verifier dispatch
    goes through — enforces the hard invocation breaker BEFORE spawning
    (never counts a breaker-blocked call as an invocation).

    The check-and-reserve happens under ``_copilot_invocation_lock`` so two
    concurrent callers can't both pass the check and jointly exceed the
    declared ceiling (code-review finding, Set 078 S3) — serialized
    execution is this transport's documented contract (design lock Section
    3), but the breaker itself should hold even if a future caller violates
    that. The slot is reserved (incremented) before dispatch, not after, so
    a failed dispatch still consumes it — same accounting as before.
    """
    global _copilot_invocation_count

    cli_cfg = _config["transports"]["copilot-cli"]
    max_invocations = cli_cfg.get("max_invocations_per_session")
    with _copilot_invocation_lock:
        if max_invocations is not None and _copilot_invocation_count >= max_invocations:
            raise InvocationBreakerTripped(
                f"transports.copilot-cli.max_invocations_per_session "
                f"({max_invocations}) reached for this Python process — no "
                f"further Copilot CLI calls will be made. This is a safety "
                f"ceiling on local invocation count, not a fabricated cost "
                f"cap; raise the config value or restart the process to "
                f"continue. NOTE: the count is process-scoped, not tracked "
                f"across separate process invocations of the same "
                f"ai-led-workflow session (see the module comment on "
                f"_copilot_invocation_count for the known limitation)."
            )
        _copilot_invocation_count += 1

    return _copilot_transport.dispatch(
        model_id=model_id, system_prompt=system_prompt, user_message=user_message,
    )


def _route_via_copilot_cli(
    *,
    content: str,
    task_type: str,
    context: str,
    session_set: Optional[str],
    session_number: Optional[int],
    exclude_providers: Optional[list] = None,
    verification_stamp: Optional[dict] = None,
) -> "RouteResult":
    """route()'s entire copilot-cli-profile body. Task typing (the prompt
    template lookup) is unchanged; tier/complexity-based model selection is
    replaced by late-bound catalog-role resolution (Architecture section) —
    there is exactly one generator role, not a 3-tier ladder, so there is no
    escalation loop under this profile.

    Set 084 (F2): *exclude_providers* (the session orchestrator's
    registry-resolved effective provider, for session-verification
    dispatch) is applied against the seat catalog's CONFIRMED entries.
    A seat that cannot serve any different-provider candidate raises
    :class:`VerificationUnavailableError` — the explicit blocked state,
    never a silent same-provider verification.
    """
    exclusion = frozenset(
        str(p).strip().lower() for p in (exclude_providers or []) if p
    )
    model_id, provider, failure_reason = _resolve_copilot_generator(
        _config, _copilot_catalog, exclude_providers=exclusion
    )
    if model_id is None:
        if exclusion:
            raise VerificationUnavailableError(
                f"copilot-cli profile: no confirmed catalog entry "
                f"resolves to a provider outside the exclusion "
                f"{sorted(exclusion)!r} (the session orchestrator's "
                f"effective provider): {failure_reason}. This is the "
                "hard verification_unavailable outcome — no verdict is "
                "written and the close stays blocked. The sanctioned "
                "resolution is the operator-attested manual path: "
                "close_session --manual-verify with an attestation "
                "naming the verifying surface, model, effective "
                "provider, template used, timestamp, and raw artifact."
            )
        raise CopilotCliRoutingError(
            f"copilot-cli profile: could not resolve a generator role: "
            f"{failure_reason}"
        )

    system_prompt, user_message = build_prompt(
        content=content, context=context, task_type=task_type,
        model_cfg={}, config=_config,
    )

    start = time.time()
    result = _copilot_cli_dispatch(
        model_id=model_id, system_prompt=system_prompt, user_message=user_message,
    )
    elapsed = time.time() - start

    if not result.ok:
        raise CopilotCliRoutingError(
            f"Copilot CLI dispatch failed: error_class="
            f"{result.transport_metadata.get('error_class')!r}, "
            f"exit_code={result.transport_metadata.get('exit_code')!r}. "
            f"stderr: {result.raw_stderr[:500]}"
        )

    route_result = RouteResult(
        content=result.content,
        model_name=model_id,
        model_id=model_id,
        tier=0,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=0.0,
        total_cost_usd=0.0,
        complexity_score=-1,
        escalated=False,
        escalation_history=[],
        elapsed_seconds=elapsed,
        truncated=not result.content_complete,
        verification=None,
    )

    # Set 084 S2 (F3): same stamp completion as the api path — the seat
    # transport's session-verification rows corroborate a close under
    # the identical consistency rules.
    completed_stamp = None
    if verification_stamp is not None:
        from .verification_stamp import complete_stamp

        completed_stamp = complete_stamp(
            verification_stamp,
            verifier_model=model_id,
            response_content=result.content,
        )
    record_call(
        _config,
        call_type="route",
        task_type=task_type,
        model=model_id,
        provider=provider,
        tier=0,
        complexity_score=None,
        generation_params={},
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=0.0,
        elapsed_seconds=elapsed,
        escalated=False,
        stop_reason=result.stop_reason,
        session_set=session_set,
        session_number=session_number,
        transport="copilot-cli",
        local_invocations=_copilot_invocation_count,
        attempts=1,
        billed_usage_unavailable=True,
        stamp=completed_stamp,
    )

    v_config = _config.get("verification", {})
    auto_types = v_config.get("auto_verify_task_types", [])
    if v_config.get("enabled", False) and task_type in auto_types:
        verification = _run_verification_via_copilot_cli(
            route_result=route_result,
            original_task=user_message,
            task_type=task_type,
            generator_provider=provider,
            session_set=session_set,
            session_number=session_number,
        )
        route_result.verification = verification
        # cost_usd is always 0.0 for this profile (honest non-accounting) —
        # total_cost_usd stays 0.0 rather than merging in a verifier cost
        # that is equally not billing-authoritative.
        route_result.total_cost_usd = 0.0

    return route_result


def _run_verification_via_copilot_cli(
    *,
    route_result: "RouteResult",
    original_task: str,
    task_type: str,
    generator_provider: str,
    session_set: Optional[str],
    session_number: Optional[int],
) -> "VerificationResult":
    """verify()'s / route()'s auto-verify copilot-cli-profile body.

    Resolves the verifier role via :func:`pick_copilot_cli_verifier`
    (provenance fail-closed to "verification unavailable" — Critique-2 M3);
    on success, dispatches through the same CLI transport and parses the
    verdict with the existing push-surface parser (the verifier still
    returns free-form markdown through the CLI's ``-p`` prompt, exactly like
    the api-profile verifier call).
    """
    # Guard-exclusion list (design lock Section 5): the token-cost estimate
    # guard the api-profile verifier applies (max_cost_multiplier in
    # _run_verification) must never run against a transport with no dollar/
    # token cost signal. This function never estimates one; the check below
    # just fails loud instead of silently proceeding if a misconfigured
    # router-config.yaml ever set billed_usage_unavailable: false under this
    # profile (the only way this guard would NOT skip here).
    cost_guard = evaluate_cost_guard(GUARD_TOKEN_COST_ESTIMATE, _config)
    if not cost_guard.skip:
        raise CopilotCliRoutingError(
            f"cost-keyed guard {cost_guard.guard!r} did not skip under the "
            f"copilot-cli profile ({cost_guard.reason}) — refusing to "
            f"estimate a fabricated verification cost."
        )

    selection = pick_copilot_cli_verifier(
        generator_provider=generator_provider,
        config=_config,
        catalog=_copilot_catalog,
    )
    if isinstance(selection, ProvenanceUnavailable):
        return _build_verification_unavailable_stub(
            generator_model_id=route_result.model_id,
            generator_provider=generator_provider,
            reason=selection.reason,
        )

    v_template = _config.get("_verification_template", "")
    user_message = build_verification_prompt(
        original_task=original_task,
        original_response=route_result.content,
        task_type=task_type,
        template=v_template,
    )

    start = time.time()
    try:
        result = _copilot_cli_dispatch(
            model_id=selection.model_id, system_prompt="", user_message=user_message,
        )
    except InvocationBreakerTripped as exc:
        # The breaker is a hard ceiling on total spawns, generator AND
        # verifier alike -- but tripping on the courtesy auto-verify step
        # must not discard an already-successful generation. Unlike the
        # generator dispatch (route()'s primary result, nothing to salvage
        # if it can't run), verification failing closed here is exactly the
        # existing "verification unavailable" contract, just with a
        # breaker-specific reason.
        return _build_verification_unavailable_stub(
            generator_model_id=route_result.model_id,
            generator_provider=generator_provider,
            reason=f"invocation breaker tripped before verification could dispatch: {exc}",
        )
    elapsed = time.time() - start

    if not result.ok:
        return _build_verification_unavailable_stub(
            generator_model_id=route_result.model_id,
            generator_provider=generator_provider,
            reason=(
                f"verifier dispatch failed: error_class="
                f"{result.transport_metadata.get('error_class')!r}"
            ),
        )

    verdict, issues = parse_verification_response(result.content)
    blocking = is_blocking_verdict(verdict, issues)
    nits = parse_nits(result.content)

    record_call(
        _config,
        call_type="verify",
        task_type=task_type,
        model=selection.model_id,
        provider=selection.provider,
        tier=0,
        complexity_score=None,
        generation_params={},
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=0.0,
        elapsed_seconds=elapsed,
        escalated=False,
        stop_reason=result.stop_reason,
        session_set=session_set,
        session_number=session_number,
        verifier_of=route_result.model_name,
        verdict=verdict,
        issue_count=len(issues),
        transport="copilot-cli",
        local_invocations=_copilot_invocation_count,
        attempts=1,
        billed_usage_unavailable=True,
    )

    return VerificationResult(
        verdict=verdict,
        verified=(verdict == "VERIFIED"),
        issues=issues,
        verifier_model=selection.model_id,
        verifier_provider=selection.provider,
        generator_model=route_result.model_name,
        generator_provider=generator_provider,
        verifier_input_tokens=result.input_tokens,
        verifier_output_tokens=result.output_tokens,
        verifier_cost_usd=0.0,
        raw_response=result.content,
        blocking=blocking,
        nits=nits,
    )


def route(
    content: str,
    task_type: str = "general",
    context: str = "",
    complexity_hint: Optional[int] = None,
    max_tier: int = 3,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
    exclude_providers: Optional[list] = None,
    verification_stamp: Optional[dict] = None,
) -> RouteResult:
    """
    Route a task to the best model based on complexity estimation.

    Args:
        content: The main content/prompt for the AI (code, text, question).
        task_type: One of the task types in router-config.yaml
                   (code-review, documentation, analysis, etc.)
        context: Additional context (project info, existing patterns, etc.)
        complexity_hint: Optional manual complexity score (1-100).
                         If provided, weighted into the estimate.
        max_tier: Maximum tier to use (for cost-capped runs).
        session_set: Optional path or slug identifying the active session set.
                     Passed through to the metrics log so reports can group
                     by session set. For ``task_type="session-verification"``
                     this is ALSO the session context the dynamic exclusion
                     below resolves against (Set 084 F2).
        session_number: Optional session number (1, 2, ...) for metrics
                        (and for the exclusion resolution).
        exclude_providers: Providers barred from model selection — a hard
                     constraint no pin or escalation can override
                     (Set 084 F2). On a ``session-verification`` call
                     that carries session context, route() ALWAYS
                     resolves the session orchestrator's
                     registry-resolved effective provider itself and
                     UNIONS it into this set (a caller-supplied list can
                     add exclusions but never remove the session-derived
                     one) — so the ``verify_session`` CLI and a bare
                     ``route()`` call have identical semantics.
                     Unresolvable identity raises
                     :class:`IdentityResolutionError` (fails closed);
                     an exclusion that leaves no eligible candidate
                     raises :class:`VerificationUnavailableError`.
        verification_stamp: Set 084 S2 (F3) — the producer-side
                     evidence stamp built by
                     ``verification_stamp.build_stamp`` (only the
                     sanctioned surfaces — the ``verify_session`` CLI
                     and the ``close_session`` backstop — pass this).
                     route() completes it at record time
                     (``verifier_model`` = the model that actually
                     answered, post-escalation; ``artifact_sha256`` =
                     the hash of the response the producer will write
                     raw) and writes it onto the metrics row. Only
                     legal on ``task_type="session-verification"``
                     (ValueError otherwise); a bare call without it
                     writes an unstamped row that no longer
                     corroborates a close.

    Returns:
        RouteResult with the AI response and metadata.
        The caller is responsible for logging via SessionLog.log_step().
    """
    # Set 048 Session 2 §3.1 A3: --no-router short-circuit. Defensive
    # safety net for callers that didn't check is_no_router_mode() first.
    # Returns a zero-cost stub WITHOUT calling _init() (no config load,
    # no credential check, no LLM SDK touch).
    #
    # Set 048 S2 Round-A verifier-flagged Critical #1 (fail-open to full
    # mode under exception was a safety bug): the runtime-mode lookup
    # is now fail-CLOSED. If the check itself raises, we re-raise rather
    # than silently issue a live LLM call.
    #
    # Set 048 S5 UAT-discovered Critical: the original `from runtime_mode
    # import …` bare form only worked under the test conftest's sys.path
    # shim. pip-installed consumers (the Lightweight target audience) had
    # no such shim, so the import raised ModuleNotFoundError on every
    # route() call under --no-router. Use a relative import so the
    # package resolves the module within its own namespace.
    from .runtime_mode import is_no_router_mode

    if is_no_router_mode():
        return _build_no_router_route_stub()

    # Set 084 S2 (F3): the stamp is only meaningful on the one task type
    # whose rows the close gate consumes. Refusing it elsewhere fails
    # loud on a mis-wired producer rather than writing a stamp the gate
    # would never look at.
    if (
        verification_stamp is not None
        and task_type != SESSION_VERIFICATION_TASK_TYPE
    ):
        raise ValueError(
            "verification_stamp is only legal on "
            f"task_type={SESSION_VERIFICATION_TASK_TYPE!r} "
            f"(got {task_type!r})"
        )

    _init()

    # Set 084 (F2): dynamic verifier exclusion. A session-verification
    # call that carries session context ALWAYS resolves the session
    # orchestrator's EFFECTIVE provider (registry lookup on the
    # orchestrator block's model — orchestrator_identity) and excludes
    # it from selection, replacing the static task_type_overrides pin
    # as the cross-provider guarantee. route() applies this itself so a
    # bare call and the verify_session CLI cannot diverge. A
    # caller-supplied exclude_providers is UNIONED with the
    # session-derived exclusion, never substituted for it (R1
    # remediation I-084-S1-3: an explicit list that omitted the
    # orchestrator's provider would reopen same-provider verification
    # at the bare API boundary). Unresolvable identity FAILS CLOSED
    # (IdentityResolutionError) — never a verification whose exclusion
    # target is unknown.
    if task_type == SESSION_VERIFICATION_TASK_TYPE and session_set:
        identity = resolve_session_orchestrator_identity(
            session_set, session_number
        )
        exclude_providers = sorted(
            {
                str(p).strip().lower()
                for p in (exclude_providers or [])
                if p
            }
            | {identity.effective_provider}
        )

    # Set 078 S3: the copilot-cli profile is a fully separate body — see
    # _route_via_copilot_cli's docstring for why this branches here rather
    # than threading through the api-path escalation loop below.
    if _config["transport"]["profile"] == "copilot-cli":
        return _route_via_copilot_cli(
            content=content, task_type=task_type, context=context,
            session_set=session_set, session_number=session_number,
            exclude_providers=exclude_providers,
            verification_stamp=verification_stamp,
        )

    # 1. Estimate complexity
    full_prompt_text = f"{content}\n{context}"
    score = estimate_complexity(
        text=full_prompt_text,
        task_type=task_type,
        hint=complexity_hint,
        config=_config["complexity"]
    )

    # 2. Pick model. exclude_providers is a hard constraint (Set 084
    # F2): the task_type_overrides pin is only a preference against it,
    # and an exclusion that leaves no candidate is the explicit
    # verification_unavailable outcome, never a same-provider pick.
    model_name = pick_model(
        score, max_tier, task_type, _config,
        exclude_providers=exclude_providers,
    )
    if model_name is None:
        raise VerificationUnavailableError(
            f"no enabled model in router-config.yaml survives the "
            f"provider exclusion {sorted(set(exclude_providers or []))!r} "
            f"(task_type={task_type!r}, max_tier={max_tier}). This is "
            "the hard verification_unavailable outcome — no verdict is "
            "written and the close stays blocked. The sanctioned "
            "resolution is the operator-attested manual path: "
            "close_session --manual-verify with an attestation naming "
            "the verifying surface, model, effective provider, template "
            "used, timestamp, and raw artifact."
        )
    model_cfg = _config["models"][model_name]

    if task_type == "session-verification":
        _log_session_verification_event(
            "session_verification_started",
            model=model_name,
            complexity_score=score,
            max_tier=max_tier
        )

    # 3. Build prompt with model-specific formatting
    system_prompt, user_message = build_prompt(
        content=content,
        context=context,
        task_type=task_type,
        model_cfg=model_cfg,
        config=_config
    )

    # 4. Execute with escalation loop
    escalation_history = []
    current_model_name = model_name

    while True:
        current_cfg = _config["models"][current_model_name]
        provider_name = current_cfg["provider"]

        # Rate limit
        _rate_limiters[provider_name].wait()

        # Resolve effective generation params for this (model, task_type)
        gen_params = resolve_generation_params(
            current_model_name, task_type, _config
        )

        # Call API
        start = time.time()
        result = call_model(
            provider_name=provider_name,
            model_id=current_cfg["model_id"],
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=current_cfg["max_output_tokens"],
            config=_config["providers"][provider_name],
            generation_params=gen_params,
        )
        elapsed = time.time() - start

        # Check if escalation needed
        if _config["escalation"]["enabled"] and should_escalate(
            result, _config["escalation"]
        ):
            # Set 084 (F2): escalation honors the same provider
            # exclusion as the initial pick — the short-response
            # heuristic must never cross back onto the excluded
            # (orchestrator's own) provider.
            next_model = get_escalation_model(
                current_model_name, _config,
                len(escalation_history),
                exclude_providers=exclude_providers,
            )
            if next_model:
                reason = _classify_escalation_reason(result, _config)
                escalation_history.append((current_model_name, reason))
                current_model_name = next_model
                # Rebuild prompt for new model's provider
                new_cfg = _config["models"][current_model_name]
                system_prompt, user_message = build_prompt(
                    content=content,
                    context=context,
                    task_type=task_type,
                    model_cfg=new_cfg,
                    config=_config
                )
                continue
            # else: max escalations reached, use what we have
        break

    # 5. Calculate cost
    cost = _calculate_cost(
        result.input_tokens,
        result.output_tokens,
        _config["models"][current_model_name]
    )

    # 6. Build initial result
    route_result = RouteResult(
        content=result.content,
        model_name=current_model_name,
        model_id=_config["models"][current_model_name]["model_id"],
        tier=_config["models"][current_model_name]["tier"],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        total_cost_usd=cost,
        complexity_score=score,
        escalated=len(escalation_history) > 0,
        escalation_history=escalation_history,
        elapsed_seconds=elapsed,
        truncated=detect_truncation(result.content, result.stop_reason),
        verification=None
    )

    # 6a. Record generator-call metrics (best-effort; never blocks).
    # Set 084 S2 (F3): a sanctioned producer's stamp is completed here —
    # verifier_model is the model that actually answered
    # (post-escalation) and artifact_sha256 hashes the response the
    # producer writes raw — so the stamp and the row can never disagree
    # about which model produced which artifact.
    completed_stamp = None
    if verification_stamp is not None:
        from .verification_stamp import complete_stamp

        completed_stamp = complete_stamp(
            verification_stamp,
            verifier_model=current_model_name,
            response_content=result.content,
        )
    record_call(
        _config,
        call_type="route",
        task_type=task_type,
        model=current_model_name,
        provider=_config["models"][current_model_name]["provider"],
        tier=_config["models"][current_model_name]["tier"],
        complexity_score=score,
        generation_params=gen_params,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        elapsed_seconds=elapsed,
        escalated=len(escalation_history) > 0,
        stop_reason=result.stop_reason,
        session_set=session_set,
        session_number=session_number,
        stamp=completed_stamp,
    )

    # 7. Auto-verify if this task type is configured for it
    v_config = _config.get("verification", {})
    auto_types = v_config.get("auto_verify_task_types", [])

    if (v_config.get("enabled", False)
            and task_type in auto_types):
        verification = _run_verification(
            route_result=route_result,
            original_task=user_message,
            task_type=task_type,
            session_set=session_set,
            session_number=session_number,
        )
        if verification:
            route_result.verification = verification
            route_result.total_cost_usd = cost + verification.verifier_cost_usd

            # Resolve on_disagreement: per-task override wins over the
            # global default. Merge is sound for task types whose
            # generator and verifier outputs combine naturally (code
            # review, documentation). For task types where a verifier
            # disagreement signals a logic divergence (analysis,
            # planning, architecture), we flag instead so the
            # orchestrator adjudicates under Step 7 rather than
            # synthesizing a hallucinated compromise.
            settings = v_config.get("settings", {}) or {}
            per_task = settings.get("on_disagreement_by_task_type", {}) or {}
            on_disagree = per_task.get(
                task_type, settings.get("on_disagreement", "flag")
            )
            if (not verification.verified
                    and on_disagree == "merge"):
                route_result.content = _merge_with_verification(
                    result.content, verification
                )
            elif (not verification.verified
                    and on_disagree == "re-route"):
                route_result = _tiebreaker_reroute(
                    route_result, user_message, task_type,
                    verification, v_config,
                    session_set=session_set,
                    session_number=session_number,
                )

    if task_type == "session-verification":
        _log_session_verification_event(
            "session_verification_completed",
            model=route_result.model_name,
            total_cost_usd=round(route_result.total_cost_usd, 6),
            elapsed_seconds=round(route_result.elapsed_seconds, 3),
            escalated=route_result.escalated
        )

    return route_result


def query(
    model: str,
    content: str,
    task_type: str = "general",
    context: str = "",
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
) -> RouteResult:
    """
    Call a specific model directly, bypassing complexity estimation.
    Use when you know which model you want.
    """
    _init()

    model_cfg = _config["models"][model]
    provider_name = model_cfg["provider"]

    system_prompt, user_message = build_prompt(
        content=content,
        context=context,
        task_type=task_type,
        model_cfg=model_cfg,
        config=_config
    )

    _rate_limiters[provider_name].wait()

    gen_params = resolve_generation_params(model, task_type, _config)

    start = time.time()
    result = call_model(
        provider_name=provider_name,
        model_id=model_cfg["model_id"],
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=model_cfg["max_output_tokens"],
        config=_config["providers"][provider_name],
        generation_params=gen_params,
    )
    elapsed = time.time() - start

    cost = _calculate_cost(
        result.input_tokens, result.output_tokens, model_cfg
    )

    # Record direct-query metrics (best-effort)
    record_call(
        _config,
        call_type="route",
        task_type=task_type,
        model=model,
        provider=provider_name,
        tier=model_cfg.get("tier", 0),
        complexity_score=None,
        generation_params=gen_params,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        elapsed_seconds=elapsed,
        escalated=False,
        stop_reason=result.stop_reason,
        session_set=session_set,
        session_number=session_number,
    )

    return RouteResult(
        content=result.content,
        model_name=model,
        model_id=model_cfg["model_id"],
        tier=model_cfg["tier"],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        total_cost_usd=cost,
        complexity_score=-1,
        escalated=False,
        escalation_history=[],
        elapsed_seconds=elapsed,
        truncated=detect_truncation(result.content, result.stop_reason),
        verification=None
    )


def verify(
    route_result: RouteResult,
    original_task: str = "",
    task_type: str = "general",
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
) -> VerificationResult:
    """
    Independently verify a RouteResult using a model from a different provider.

    Args:
        route_result: The result from route() or query() to verify.
        original_task: The original task/prompt (if not provided, the
                       verifier only sees the response, not the task).
        task_type: Task type for context in the verification prompt.
        session_set: Optional session set identifier for metrics.
        session_number: Optional session number for metrics.

    Returns:
        VerificationResult with verdict, issues, and cost.
    """
    # Set 048 Session 2 §3.1 A3: --no-router short-circuit. Same safety-net
    # contract as route() above. Round-A verifier-flagged Critical #1
    # made this fail-CLOSED — runtime-mode lookup failures re-raise
    # rather than silently promote to a live LLM verification call.
    # S5 UAT fix: relative import resolves correctly under pip-install.
    from .runtime_mode import is_no_router_mode

    if is_no_router_mode():
        return _build_no_router_verification_stub(
            generator_model=route_result.model_name
        )

    _init()

    if _config["transport"]["profile"] == "copilot-cli":
        # verify() doesn't receive the generator's provider directly (the
        # api-path derives it from config["models"][route_result.model_name]
        # below); under copilot-cli the model_name IS the catalog model id,
        # so look its provider up from the seat catalog instead. Round-2
        # session-verification finding: prefer model_id over model_name --
        # model_id is this module's own canonical identifier (every
        # RouteResult this profile produces sets both to the same catalog
        # id, but only model_id is guaranteed to be that value for a
        # hand-constructed RouteResult passed to a standalone verify()
        # call; model_name is the display/alias field elsewhere in this
        # module's api-path RouteResults, so trusting it here for a
        # same-provider-exclusion safety check is the weaker choice).
        generator_provider = _copilot_provider_of(route_result.model_id)
        if generator_provider is None:
            # Fail closed rather than resolving the verifier against an
            # empty/unreliable exclusion set (session-verification finding,
            # Set 078 S3): an unresolvable generator provider must never
            # risk a same-provider "verification" slipping through.
            return _build_verification_unavailable_stub(
                generator_model_id=route_result.model_id,
                generator_provider="unknown",
                reason=(
                    f"could not resolve a provider for generator model "
                    f"{route_result.model_id!r} from the seat catalog or "
                    f"the name-prefix heuristic"
                ),
            )
        return _run_verification_via_copilot_cli(
            route_result=route_result,
            original_task=original_task,
            task_type=task_type,
            generator_provider=generator_provider,
            session_set=session_set,
            session_number=session_number,
        )

    result = _run_verification(
        route_result, original_task, task_type,
        session_set=session_set, session_number=session_number
    )
    if result is None:
        raise RuntimeError(
            f"No cross-provider verifier available for "
            f"model '{route_result.model_name}'"
        )
    return result


def _run_verification(
    route_result: RouteResult,
    original_task: str,
    task_type: str,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
) -> Optional[VerificationResult]:
    """Internal: execute a verification call.

    Selects a cross-provider verifier via rule-based selection
    (``pick_verifier_model``). If the HTTPS call to the chosen
    verifier fails, re-picks with the failed provider excluded and
    tries once more. Two attempts total; returns None if both fail
    or no eligible verifier exists.
    """
    v_config = _config.get("verification", {})
    settings = v_config.get("settings", {})

    v_template = _config.get("_verification_template", "")
    excluded_providers: list[str] = []
    first_attempt_provider: Optional[str] = None

    # Up to 2 attempts: initial selection, then one fallback with the
    # failed provider excluded. Cost guard and metric recording run
    # inside the loop so a fallback attempt gets its own verify record
    # marked with verifier_fallback=True.
    for attempt in range(2):
        selection = pick_verifier_model(
            generator_model=route_result.model_name,
            config=_config,
            exclude_providers=excluded_providers or None,
        )
        if selection is None:
            # No eligible verifier. If the first attempt already tried
            # and failed, the caller should still know a fallback was
            # attempted — but with no verifier available, there's no
            # record to write under the "verify" call_type. Return None.
            return None

        verifier_name = selection.model_name
        preferred_skipped = selection.preferred_skipped
        verifier_cfg = _config["models"][verifier_name]
        verifier_provider = verifier_cfg["provider"]

        # Cost guard: skip if verification would be too expensive
        # relative to the original generator call.
        max_multiplier = settings.get("max_cost_multiplier", 3.0)
        estimated_verify_cost = _calculate_cost(
            route_result.input_tokens + route_result.output_tokens,
            route_result.output_tokens // 2,  # verifier output is shorter
            verifier_cfg,
        )
        if (route_result.cost_usd > 0
                and estimated_verify_cost
                > route_result.cost_usd * max_multiplier):
            return None

        # Build verification prompt
        system_prompt = verifier_cfg.get(
            "_system_prompt",
            "You are an independent code verifier. Be precise and objective.",
        )
        user_message = build_verification_prompt(
            original_task=original_task,
            original_response=route_result.content,
            task_type=task_type,
            template=v_template,
        )

        _rate_limiters[verifier_provider].wait()

        # Verifier runs against a synthetic 'verification' task type
        # so per-task-type overrides for session-verification /
        # code-review / etc. don't accidentally apply to it.
        v_gen_params = resolve_generation_params(
            verifier_name, "verification", _config
        )

        v_start = time.time()
        try:
            v_result = call_model(
                provider_name=verifier_provider,
                model_id=verifier_cfg["model_id"],
                system_prompt=system_prompt,
                user_message=user_message,
                max_tokens=verifier_cfg["max_output_tokens"],
                config=_config["providers"][verifier_provider],
                generation_params=v_gen_params,
            )
        except Exception as exc:
            v_elapsed = time.time() - v_start
            _logger.warning(
                "Verifier call to %s (%s) failed: %s — "
                "re-picking with provider excluded",
                verifier_name, verifier_provider, exc,
            )
            if first_attempt_provider is None:
                first_attempt_provider = verifier_provider
            excluded_providers.append(verifier_provider)
            # Loop: re-pick. If the second attempt also raises, the
            # exception propagates out of this function (by design —
            # two verifier providers in a row failing is a real
            # outage the caller should see).
            if attempt == 1:
                raise
            continue

        v_elapsed = time.time() - v_start
        v_cost = _calculate_cost(
            v_result.input_tokens, v_result.output_tokens, verifier_cfg
        )

        verdict, issues = parse_verification_response(v_result.content)
        # Set 071 (S2): derive the re-verify decision from the parsed findings
        # (severity-anchored, not the bare token) and read the non-blocking nits.
        blocking = is_blocking_verdict(verdict, issues)
        nits = parse_nits(v_result.content)

        # Record verifier-call metrics (best-effort). Mark the record
        # as a fallback if we got here via the second attempt.
        record_call(
            _config,
            call_type="verify",
            task_type=task_type,
            model=verifier_name,
            provider=verifier_provider,
            tier=verifier_cfg.get("tier", 0),
            complexity_score=None,
            generation_params=v_gen_params,
            input_tokens=v_result.input_tokens,
            output_tokens=v_result.output_tokens,
            cost_usd=v_cost,
            elapsed_seconds=v_elapsed,
            escalated=False,
            stop_reason=v_result.stop_reason,
            session_set=session_set,
            session_number=session_number,
            verifier_of=route_result.model_name,
            verdict=verdict,
            issue_count=len(issues),
            verifier_fallback=(attempt > 0),
            fallback_from_provider=first_attempt_provider,
            preferred_verifier_skipped=preferred_skipped,
        )

        # Build and return verification result
        generator_cfg = _config["models"][route_result.model_name]
        return VerificationResult(
            verdict=verdict,
            verified=(verdict == "VERIFIED"),
            issues=issues,
            verifier_model=verifier_name,
            verifier_provider=verifier_provider,
            generator_model=route_result.model_name,
            generator_provider=generator_cfg["provider"],
            verifier_input_tokens=v_result.input_tokens,
            verifier_output_tokens=v_result.output_tokens,
            verifier_cost_usd=v_cost,
            raw_response=v_result.content,
            blocking=blocking,
            nits=nits,
        )

    # Unreachable: the loop either returns or raises on every path.
    return None


def _merge_with_verification(
    original_content: str,
    verification: VerificationResult
) -> str:
    """Append verifier feedback to the original response."""
    merged = original_content + "\n\n"
    merged += "---\n"
    merged += (f"**Verification ({verification.verifier_model}, "
               f"{verification.verifier_provider}):** "
               f"{verification.verdict}\n\n")
    if verification.issues:
        for i, issue in enumerate(verification.issues, 1):
            merged += (f"**Issue {i}** "
                       f"[{issue.get('category', '?')} / "
                       f"{issue.get('severity', '?')}]: "
                       f"{issue.get('description', '')}\n")
    return merged


def _tiebreaker_reroute(
    route_result: RouteResult,
    user_message: str,
    task_type: str,
    verification: VerificationResult,
    v_config: dict,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
) -> RouteResult:
    """When generator and verifier disagree, send to a Tier 3 tiebreaker."""
    tiebreaker_name = v_config.get("settings", {}).get(
        "tiebreaker_model", "opus"
    )
    if tiebreaker_name not in _config["models"]:
        # No tiebreaker available — fall back to merge
        route_result.content = _merge_with_verification(
            route_result.content, verification
        )
        return route_result

    tb_cfg = _config["models"][tiebreaker_name]
    tb_provider = tb_cfg["provider"]

    # Build a tiebreaker prompt with both perspectives
    tb_prompt = (
        "Two AI models disagree on the following task. "
        "Review both responses and produce the correct, authoritative answer.\n\n"
        f"## Original Task\n\n{user_message}\n\n"
        f"## Response A ({route_result.model_name})\n\n"
        f"{route_result.content}\n\n"
        f"## Verification Feedback ({verification.verifier_model})\n\n"
        f"{verification.raw_response}\n\n"
        "## Your Task\n\n"
        "Produce the final, correct response to the original task, "
        "incorporating valid points from both perspectives."
    )

    system_prompt = tb_cfg.get("_system_prompt", "You are an expert.")

    _rate_limiters[tb_provider].wait()

    # Tiebreakers should always get deep reasoning since they resolve
    # genuine disagreement. Route under the task type so its per-task
    # tuning applies, and the tiebreaker (Opus) will use its high-effort
    # defaults.
    tb_gen_params = resolve_generation_params(
        tiebreaker_name, task_type, _config
    )

    tb_start = time.time()
    tb_result = call_model(
        provider_name=tb_provider,
        model_id=tb_cfg["model_id"],
        system_prompt=system_prompt,
        user_message=tb_prompt,
        max_tokens=tb_cfg["max_output_tokens"],
        config=_config["providers"][tb_provider],
        generation_params=tb_gen_params,
    )
    tb_elapsed = time.time() - tb_start

    tb_cost = _calculate_cost(
        tb_result.input_tokens, tb_result.output_tokens, tb_cfg
    )

    # Record tiebreaker metrics (best-effort)
    record_call(
        _config,
        call_type="tiebreaker",
        task_type=task_type,
        model=tiebreaker_name,
        provider=tb_provider,
        tier=tb_cfg.get("tier", 0),
        complexity_score=None,
        generation_params=tb_gen_params,
        input_tokens=tb_result.input_tokens,
        output_tokens=tb_result.output_tokens,
        cost_usd=tb_cost,
        elapsed_seconds=tb_elapsed,
        escalated=False,
        stop_reason=tb_result.stop_reason,
        session_set=session_set,
        session_number=session_number,
    )

    route_result.content = tb_result.content
    route_result.total_cost_usd += verification.verifier_cost_usd + tb_cost
    route_result.verification = verification
    return route_result


from .cost_report import get_costs, print_cost_report

# Set 067: the first-party tool-loop "pull" verifier adapter. A route()-PARALLEL
# agentic seam (the verifier drives a read-only tool loop; the orchestrator is a
# deterministic servant), NOT a branch inside route(). See pull_verifier.py and
# docs/session-sets/067-pull-verifier-adapter-experiment-a/tool-contract.md.
from .pull_verifier import (
    pull_route,
    PullResult,
    PullCritique,
    PullCaps,
    PullTrace,
    Finding,
    DeterministicServant,
    DeterministicServantViolation,
    SandboxEscape,
    VerdictSchemaError,
    PullVerifierError,
)

# Set 067 S4: the opt-in automated producer that drives the pull verifier across
# >= 2 providers and writes the Set 066 path-aware-critique.json artifact the
# close-out gate validates. Manual flow stays the default; this is strictly
# opt-in. See pull_critique.py.
from .pull_critique import (
    produce_path_aware_critique,
    build_instruction,
    ProducerResult,
    PullCritiqueError,
    DEFAULT_PROVIDERS,
)

# Set 068 S1: the disposable-worktree run_test execution cage (the first
# write-capable but caged adapter tool) + the relocated grep ReDoS isolation.
# run_test runs a bounded, operator-configured command in a disposable, detached
# git worktree with crash-safe teardown and returns the RAW exit code + output.
# This is disposable-CWD isolation of a TRUSTED command -- ordinary
# working-directory writes land in the throwaway worktree -- NOT an OS sandbox:
# a command that deliberately writes an absolute path, follows a committed
# symlink, discovers the main worktree, or spawns a detached child can still
# reach the real filesystem (run-test-contract.md, "Scope of the isolation").
# See run_test_sandbox.py and
# docs/session-sets/068-cadence-study-and-contract-gate/run-test-contract.md.
from .pull_verifier import RunTestConfig
from .run_test_sandbox import (
    run_test_in_cage,
    run_subprocess_capped,
    isolated_regex_search,
    run_test_caps_from_config,
    RunTestCaps,
    RunTestResult,
    CappedRun,
    RegexTimeout,
    RegexError,
)

# Set 068 S5: the contract-test / CDC gate (the deterministic verification floor).
# A per-set, opt-in contractGate (none|advisory|required) whose close-out gate
# confirms a set's contract/falsifier tests ran and PASSED in the S1 cage and
# cover every probeable defect class, reserving the path-aware agent for the
# non-probeable residual. The replacement floor the S4 routed-demotion transition
# guard waits on. See contract_gate.py + docs/contract-gate.md.
from .contract_gate import (
    read_contract_gate,
    read_spec_contract_gate,
    has_contract_gate_record,
    contract_gate_record_unreadable,
    record_contract_gate,
    resolve_and_record_contract_gate,
    validate_contract_manifest,
    validate_contract_floor_result,
    find_contract_manifest,
    find_contract_floor_result,
    produce_contract_floor,
    validate_contract_gate,
    ContractManifestResult,
    ContractFloorResultValidation,
    ContractGateResult,
    ProduceFloorResult,
    ContractGateError,
    CONTRACT_GATE_NONE,
    CONTRACT_GATE_ADVISORY,
    CONTRACT_GATE_REQUIRED,
    CONTRACT_GATE_VALUES,
    DEFAULT_CONTRACT_GATE,
    CONTRACT_MANIFEST_FILENAME,
    CONTRACT_FLOOR_RESULT_FILENAME,
)

# Set 068 S6: the per-session routed-verification gating predicate — RETIRED
# as a skip authority by Set 083 (operator decision after the 2026-07-06 UAT
# incident: the predicate's verdict is only as honest as the path list the
# policed actor feeds it). Per-session cross-provider verification is now
# MANDATORY on every Full-tier session; the CLI always answers REQUIRED. The
# exports stay for import back-compat and the informational trigger report.
# See routed_gate.py + docs/ai-led-session-workflow.md ->
# "Verification-surface policy".
from .routed_gate import (
    evaluate_routed_gate,
    RoutedGateDecision,
    ROUTED_GATE_TRIGGERS,
    BREADTH_THRESHOLD,
    TRIGGER_BLAST_RADIUS,
    TRIGGER_MULTI_MODULE,
    TRIGGER_BREADTH,
    TRIGGER_BUILD_CI_CONFIG,
    TRIGGER_CONTRACT_UNCOVERED,
    TRIGGER_HIGH_BLAST,
    TRIGGER_POST_FAILED_LOOP,
)


def print_session_set_status(base_dir: str = "docs/session-sets") -> None:
    """Print a status table of every session set under *base_dir*.

    State is read from each set's ``session-state.json`` via
    :func:`read_status` (Set 7 invariant: every folder has one, lazy-synth
    fallback for any that slipped through backfill). The presence of a
    ``CANCELLED.md`` marker (Set 8) takes precedence over the status
    field — a partially-completed set the operator has cancelled
    renders as cancelled, not whatever its prior status was. Sets are
    grouped in the table by state (in-progress first, then not-started,
    then done, then cancelled), and within each group sorted by most
    recently touched.
    """
    from .session_state import read_status, compute_effective_completed_sessions
    from .session_lifecycle import is_cancelled
    from .progress import SessionStateInvariantError, read_progress

    if not os.path.isdir(base_dir):
        print(f"(no session-sets directory at {base_dir})")
        return

    in_progress: list[dict] = []
    not_started: list[dict] = []
    done: list[dict] = []
    cancelled: list[dict] = []

    for name in sorted(os.listdir(base_dir)):
        path = os.path.join(base_dir, name)
        if not os.path.isdir(path):
            continue
        spec_path = os.path.join(path, "spec.md")
        if not os.path.isfile(spec_path):
            continue

        activity_path = os.path.join(path, "activity-log.json")
        state_path = os.path.join(path, SESSION_STATE_FILENAME)

        # Set 023 Session 3 audit: authoritative count comes from
        # ``compute_effective_completed_sessions``, which Set 022 made
        # the single source of truth (array → events ledger → legacy
        # ``currentSession - 1`` heuristic with warning). The pre-Set-022
        # shape that lived here — ``len({entry.sessionNumber for entry
        # in activity_log.entries})`` — was the same derivation Set 022
        # Session 2 explicitly removed from the TypeScript reader
        # (``fileSystem.ts`` near readSessionSets, "Activity log is a
        # step log, not a count source"). Activity-log entries record
        # in-flight step events too, so the old shape overcounted by 1
        # whenever a session was open — a Full-tier set with
        # currentSession=2 (session 1 closed, session 2 in flight)
        # reported ``2/N`` here while the extension correctly reported
        # ``1/N``. The Python CLI status reporter was left out of the
        # Set 022 migration; this brings it into agreement with the
        # extension and the canonical invariant.
        sessions_completed = len(compute_effective_completed_sessions(path))
        total_sessions: Optional[int] = None
        last_touched: Optional[str] = None

        # Activity log still consulted for two non-count signals:
        # totalSessions (lives at the top level of activity-log.json,
        # which is a different artifact / different schema from
        # session-state.json — outside D13's scope) and the per-step
        # dateTime for the ``last touched`` display, which is more
        # granular than the state-file's session-boundary timestamps
        # while a session is mid-flight.
        if os.path.isfile(activity_path):
            try:
                with open(activity_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                total_sessions = data.get("totalSessions")  # noqa: D13 - activity-log.json carrier field, not session-state
                entries = data.get("entries", [])
                if entries:
                    last_touched = max(
                        (e.get("dateTime", "") for e in entries),
                        default=None,
                    )
            except Exception:
                pass

        # Set 030 Session 3: session-state.json's totalSessions is now
        # derived from the v3 ``sessions[]`` ledger via ``read_progress``
        # rather than read directly. ``completedAt`` / ``startedAt`` are
        # top-level timestamp fields outside the legacy progress triple,
        # so they continue to be read directly.
        if os.path.isfile(state_path):
            try:
                with open(state_path, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                if total_sessions is None:
                    try:
                        view = read_progress(state_data, spec_path)
                        total_sessions = view.total_sessions
                    except (SessionStateInvariantError, TypeError, ValueError):
                        total_sessions = None
                state_touched = state_data.get("completedAt") or state_data.get("startedAt")
                if state_touched and (not last_touched or state_touched > last_touched):
                    last_touched = state_touched
            except Exception:
                pass

        # CANCELLED.md presence beats every other state signal — a
        # partially-completed set the operator has cancelled renders as
        # cancelled, not whatever its prior status was. The marker file
        # is checked first so we do not have to teach `read_status` the
        # cancelled state (which Set 7 already does, but the on-disk
        # status field may still be in-progress / complete on
        # legacy-shape state files that pre-date Set 8's writers).
        if is_cancelled(path):
            state = "cancelled"
        else:
            # Single source of truth for non-cancelled state: read_status.
            # The "done" display label maps from the canonical "complete"
            # status. A "cancelled" status that is NOT backed by a
            # CANCELLED.md (e.g., a manually-edited state file) falls
            # through to "not-started" — operators relying on the marker
            # file alone get the same rendering whether they edited the
            # status field or not.
            status = read_status(path)
            if status == "complete":
                state = "done"
            elif status == "in-progress":
                state = "in-progress"
            else:
                state = "not-started"

        record = {
            "name": name,
            "completed": sessions_completed,
            "total": total_sessions,
            "last_touched": last_touched or "",
            "state": state,
        }

        if state == "done":
            done.append(record)
        elif state == "in-progress":
            in_progress.append(record)
        elif state == "cancelled":
            cancelled.append(record)
        else:
            not_started.append(record)

    in_progress.sort(key=lambda r: r["last_touched"], reverse=True)
    done.sort(key=lambda r: r["last_touched"], reverse=True)
    not_started.sort(key=lambda r: r["name"])
    # Cancelled sets sink to the bottom; within the group, most recently
    # touched first (mirrors the in-progress / done convention).
    cancelled.sort(key=lambda r: r["last_touched"], reverse=True)

    # ASCII-only glyphs — Windows cp1252 consoles cannot print emoji and
    # crash mid-line, losing the rest of the report (see lessons-learned
    # "Persist Routed Output To Disk Before Any Display Or Logging Side
    # Effects" for the original failure shape).
    rows = (
        [("[~]", r) for r in in_progress]
        + [("[ ]", r) for r in not_started]
        + [("[x]", r) for r in done]
        + [("[!]", r) for r in cancelled]
    )

    if not rows:
        print(f"(no session sets under {base_dir})")
        return

    name_width = max(len(r[1]["name"]) for r in rows)
    name_width = max(name_width, len("Session Set"))

    print()
    print("=" * (name_width + 32))
    print("SESSION-SET STATUS")
    print("=" * (name_width + 32))
    print(f"{'St':3}  {'Session Set':<{name_width}}  {'Progress':>10}  Touched")
    print(f"{'-' * 3}  {'-' * name_width}  {'-' * 10}  {'-' * 10}")
    for icon, r in rows:
        if r["state"] == "done":
            # Done sets show actual sessions run as both sides of the fraction.
            # total_sessions is a planning estimate; it may exceed completed
            # when optional buffer sessions are not needed.
            progress = f"{r['completed']}/{r['completed']}" if r["completed"] > 0 else "-"
        elif r["total"] not in (None, 0):
            progress = f"{r['completed']}/{r['total']}"
        elif r["completed"] > 0:
            progress = f"{r['completed']} done"
        else:
            progress = "-"
        touched = r["last_touched"][:10] if r["last_touched"] else "-"
        print(f"{icon}  {r['name']:<{name_width}}  {progress:>10}  {touched}")
    print("=" * (name_width + 32))
    legend = (
        f"  [~] in-progress: {len(in_progress)}    "
        f"[ ] not-started: {len(not_started)}    "
        f"[x] done: {len(done)}"
    )
    if cancelled:
        # The cancelled column only appears when at least one cancelled
        # set is present, mirroring the spec's tree-view rule for the
        # extension's Cancelled group ("only renders when ≥ 1 is
        # present"). Keeps the legend clean for the common case.
        legend += f"    [!] cancelled: {len(cancelled)}"
    print(legend)
    print("=" * (name_width + 32) + "\n")


def _calculate_cost(input_tokens, output_tokens, model_cfg):
    return (
        (input_tokens / 1_000_000) * model_cfg["input_cost_per_1m"]
        + (output_tokens / 1_000_000) * model_cfg["output_cost_per_1m"]
    )


def _classify_escalation_reason(result, config):
    esc = config["escalation"]
    if len(result.content.strip()) == 0:
        return "empty_response"
    if result.stop_reason == "max_tokens":
        return "truncated"
    if result.output_tokens < esc["triggers"]["min_output_tokens"]:
        return "too_short"
    for phrase in esc.get("refusal_phrases", []):
        if phrase in result.content.lower():
            return "refusal"
    return "unknown"


def _log_session_verification_event(event_name: str, **fields):
    payload = {"event": event_name, **fields}
    _logger.info("session_verification %s", json.dumps(payload, sort_keys=True))
