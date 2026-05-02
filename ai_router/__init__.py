"""
AI Router — Lightweight model routing for Claude Code.

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

__version__ = "0.1.0"

from .config import load_config, resolve_generation_params
from .models import estimate_complexity, pick_model
from .providers import call_model
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
    ModeConfig,
    OUTSOURCE_MODES,
    ROLE_VALUES,
    DEFAULT_OUTSOURCE_MODE,
    register_session_start,
    mark_session_complete,
    read_session_state,
    validate_next_orchestrator,
    parse_mode_config,
    read_mode_config,
    validate_mode_config,
)
from .queue_db import (
    DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
    DuplicateIdempotencyKeyError,
    QueueDB,
    QueueMessage,
)
from .daemon_pid import (
    ORCHESTRATOR_ROLE,
    VERIFIER_ROLE,
    is_pid_alive,
    pid_file_path,
    read_pid_file,
    remove_pid_file,
    write_pid_file,
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
    parse_verification_response, VerifierSelection,
)
from .verifier_role import (
    FollowUpRequested,
    HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_POLL_INTERVAL_SECONDS,
    VerifierDaemon,
    make_worker_id,
    process_one_message,
    run_verification,
)
from .orchestrator_role import (
    ORCHESTRATOR_TASK_TYPES,
    OrchestratorDaemon,
    TASK_VERIFICATION_FOLLOWUP,
    TASK_VERIFICATION_REJECTED,
    UnknownTaskTypeError,
    make_dispatch_verifier,
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


@dataclass
class VerificationResult:
    verdict: str               # "VERIFIED" or "ISSUES_FOUND" or "PENDING"
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
    # Outsource-last fields. ``pending=True`` means the verification
    # was enqueued and has not yet completed; ``message_id`` is the
    # queue row id the close-out script will poll on.
    pending: bool = False
    message_id: Optional[str] = None
    queue_provider: Optional[str] = None


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
    # Outsource-last fields. ``pending=True`` means the call was
    # enqueued to a verifier provider's queue rather than synchronously
    # executed; ``message_id`` is the queue row id, ``queue_provider``
    # is the verifier-provider name the message was enqueued to. The
    # close-out script (Set 3) will block on the queue until the
    # message reaches a terminal state.
    pending: bool = False
    message_id: Optional[str] = None
    queue_provider: Optional[str] = None


# --------------------------------------------------------------------------
# Outsource-mode resolution
# --------------------------------------------------------------------------

# Task types that always run synchronously regardless of outsource mode.
# These are the cross-provider session checkpoint and orchestrator-internal
# analyses; routing them through the queue would defeat their purpose
# (close-out is the sole synchronization barrier for outsource-last and
# can never itself be outsource-last) or block a session indefinitely
# while the worker is offline. Keep the list narrow — adding a task type
# here is a permanent commitment that the queue path is not its home.
_FORCE_SYNC_TASK_TYPES = frozenset({
    "session-verification",
})


def _resolve_outsource_mode(
    session_set: Optional[str],
    explicit_mode: Optional[str],
) -> tuple[str, Optional[str], Optional[str]]:
    """Decide which outsource mode applies and which provider to enqueue to.

    Resolution order:

    1. Explicit ``mode=`` argument to ``route()`` / ``verify()`` — overrides
       everything else. This is the test/debug path; production callers
       leave it ``None``.
    2. ``AI_ROUTER_OUTSOURCE_MODE`` env var (one of ``"first" | "last"``).
       If set, takes precedence over the spec — the spec describes
       *intent* and the env var is the operator override for cases like
       a UAT-only ramp.
    3. ``Session Set Configuration`` block in ``<session_set>/spec.md``,
       parsed via :func:`read_mode_config`. This is the production path.
    4. :data:`DEFAULT_OUTSOURCE_MODE` — ``"first"`` (the legacy /
       no-config shape).

    Returns ``(mode, orchestrator_role, verifier_role)``. The role
    fields are populated only from the spec block; explicit mode and
    env-var paths leave them ``None``.
    """
    if explicit_mode is not None:
        if explicit_mode not in OUTSOURCE_MODES:
            allowed = ", ".join(sorted(OUTSOURCE_MODES))
            raise ValueError(
                f"explicit mode must be one of {allowed} "
                f"(got {explicit_mode!r})"
            )
        return explicit_mode, None, None

    env_mode = os.environ.get("AI_ROUTER_OUTSOURCE_MODE")
    if env_mode:
        if env_mode not in OUTSOURCE_MODES:
            # Don't crash routed calls over a typo'd env var; warn-by-stderr
            # and fall through to the spec.
            print(
                f"[ai_router] AI_ROUTER_OUTSOURCE_MODE={env_mode!r} is "
                f"not one of {sorted(OUTSOURCE_MODES)}; ignoring",
                file=__import__("sys").stderr,
            )
        else:
            return env_mode, None, None

    if session_set and os.path.isdir(session_set):
        cfg = read_mode_config(session_set)
        ok, errors = validate_mode_config(cfg)
        if not ok:
            # Mode config is invalid (e.g. last mode without verifier_role).
            # The orchestrator surfaced the same errors in Step 2; here we
            # refuse to enqueue rather than silently fall back to first
            # mode, because silent fallback turns a config bug into a
            # spend-controlled-but-unverified routed call.
            raise ValueError(
                f"invalid mode config in {session_set}/spec.md: "
                + "; ".join(errors)
            )
        return cfg.outsource_mode, cfg.orchestrator_role, cfg.verifier_role

    return DEFAULT_OUTSOURCE_MODE, None, None


def _enqueue_route_message(
    *,
    content: str,
    task_type: str,
    context: str,
    complexity_hint: Optional[int],
    max_tier: int,
    session_set: Optional[str],
    session_number: Optional[int],
    orchestrator_role: Optional[str],
    verifier_role: str,
    base_dir: str = QUEUE_DEFAULT_BASE_DIR,
) -> tuple[str, str]:
    """Enqueue an outsource-last verification job. Returns ``(message_id, queue_provider)``.

    The message is addressed to ``verifier_role``'s queue. ``payload``
    carries everything the verifier daemon needs to reproduce the call:
    content, context, task type, complexity hint, max tier, and
    session metadata. ``idempotency_key`` is derived from the
    session_set+session_number+task_type+content-hash so that a
    re-run of the same step within a session is a no-op fetch rather
    than a duplicate enqueue.

    Discussion of from_provider: outsource-last specs always declare
    both roles, so ``orchestrator_role`` (the caller-side provider)
    is the natural ``from_provider``. When the resolver path produced
    no role names (e.g. env-var override without a spec), default
    to ``"unknown"`` — the queue accepts any string for from_provider
    and the audit trail still records who claimed it.
    """
    import hashlib

    h = hashlib.sha256()
    h.update((session_set or "-").encode("utf-8"))
    h.update(b"|")
    h.update(str(session_number or 0).encode("utf-8"))
    h.update(b"|")
    h.update(task_type.encode("utf-8"))
    h.update(b"|")
    h.update(content.encode("utf-8"))
    h.update(b"|")
    h.update(context.encode("utf-8"))
    idempotency_key = h.hexdigest()

    payload = {
        "task_type": task_type,
        "content": content,
        "context": context,
        "complexity_hint": complexity_hint,
        "max_tier": max_tier,
        "session_set": session_set,
        "session_number": session_number,
    }

    queue = QueueDB(provider=verifier_role, base_dir=base_dir)

    # Enqueue-or-fetch: a duplicate idempotency_key returns the existing
    # row's id rather than raising, so an orchestrator that re-runs the
    # same logical step does not create a duplicate.
    try:
        message_id = queue.enqueue(
            from_provider=orchestrator_role or "unknown",
            task_type=task_type,
            payload=payload,
            idempotency_key=idempotency_key,
            session_set=session_set,
            session_number=session_number,
        )
    except DuplicateIdempotencyKeyError as exc:
        message_id = exc.existing_id

    return message_id, verifier_role


def route(
    content: str,
    task_type: str = "general",
    context: str = "",
    complexity_hint: Optional[int] = None,
    max_tier: int = 3,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
    mode: Optional[str] = None,
    queue_base_dir: str = QUEUE_DEFAULT_BASE_DIR,
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
                     by session set.
        session_number: Optional session number (1, 2, ...) for metrics.

    Returns:
        RouteResult with the AI response and metadata.
        The caller is responsible for logging via SessionLog.log_step().

    Mode behavior:
        ``outsourceMode: first`` (default) — synchronous: select model,
        call API, return populated RouteResult. Behavior is unchanged
        from the pre-Set-002 path.

        ``outsourceMode: last`` — asynchronous: enqueue a message to
        the spec-declared verifier provider's queue and return a
        RouteResult with ``pending=True`` and ``message_id`` set.
        Generation cost / model name fields are zero/empty because no
        synchronous call ran. The verifier daemon picks up the message,
        runs the verification, and writes results back; the close-out
        script (Set 3) blocks on completion.

        Task types in :data:`_FORCE_SYNC_TASK_TYPES` always run
        synchronously regardless of mode — ``session-verification``
        is the canonical example, since the close-out gate is what
        consumes outsource-last queue results in the first place.
    """
    _init()

    resolved_mode, orchestrator_role, verifier_role = _resolve_outsource_mode(
        session_set, mode
    )

    if (
        resolved_mode == "last"
        and task_type not in _FORCE_SYNC_TASK_TYPES
    ):
        if not verifier_role:
            raise ValueError(
                "outsourceMode='last' requires a verifierRole declared in the "
                "spec's Session Set Configuration block (or an explicit mode "
                "override paired with a queue path); none was found."
            )
        message_id, queue_provider = _enqueue_route_message(
            content=content,
            task_type=task_type,
            context=context,
            complexity_hint=complexity_hint,
            max_tier=max_tier,
            session_set=session_set,
            session_number=session_number,
            orchestrator_role=orchestrator_role,
            verifier_role=verifier_role,
            base_dir=queue_base_dir,
        )
        return RouteResult(
            content="",
            model_name="",
            model_id="",
            tier=0,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
            total_cost_usd=0.0,
            complexity_score=complexity_hint or 0,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=0.0,
            truncated=False,
            verification=None,
            pending=True,
            message_id=message_id,
            queue_provider=queue_provider,
        )

    # 1. Estimate complexity
    full_prompt_text = f"{content}\n{context}"
    score = estimate_complexity(
        text=full_prompt_text,
        task_type=task_type,
        hint=complexity_hint,
        config=_config["complexity"]
    )

    # 2. Pick model
    model_name = pick_model(score, max_tier, task_type, _config)
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
            next_model = get_escalation_model(
                current_model_name, _config,
                len(escalation_history)
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

    # 6a. Record generator-call metrics (best-effort; never blocks)
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
        VerificationResult with verdict, issues, and cost. When
        ``route_result.pending`` is True, the returned VerificationResult
        is also pending — verification cannot run synchronously against
        a queued routed call. The close-out script (Set 3) blocks on
        the queue and re-reads the result before computing its
        verification verdict.
    """
    _init()

    # Outsource-last short-circuit: a pending RouteResult has no content
    # to verify yet. Return a pending VerificationResult immediately so
    # callers never block on a queue inside route()/verify(). Close-out
    # synchronization is the close-out script's job, per Set 3.
    if route_result.pending:
        return VerificationResult(
            verdict="PENDING",
            verified=False,
            issues=[],
            verifier_model="",
            verifier_provider="",
            generator_model=route_result.model_name,
            generator_provider="",
            verifier_input_tokens=0,
            verifier_output_tokens=0,
            verifier_cost_usd=0.0,
            raw_response="",
            pending=True,
            message_id=route_result.message_id,
            queue_provider=route_result.queue_provider,
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
    from .session_state import read_status
    from .session_lifecycle import is_cancelled

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

        sessions_completed = 0
        total_sessions: Optional[int] = None
        last_touched: Optional[str] = None

        # Activity log carries per-session count + per-step timestamps;
        # the state file only has start/complete-of-current-session
        # timestamps and the canonical totalSessions. Reading both gives
        # us a richer "last touched" (latest activity entry vs.
        # session-state's start/complete) without changing the state
        # decision, which is now read from `status` alone.
        if os.path.isfile(activity_path):
            try:
                with open(activity_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                total_sessions = data.get("totalSessions")
                entries = data.get("entries", [])
                if entries:
                    last_touched = max(
                        (e.get("dateTime", "") for e in entries),
                        default=None,
                    )
                    sessions_completed = len({
                        e["sessionNumber"] for e in entries
                        if e.get("sessionNumber") is not None
                    })
            except Exception:
                pass

        if os.path.isfile(state_path):
            try:
                with open(state_path, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                if total_sessions is None:
                    total_sessions = state_data.get("totalSessions")
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
