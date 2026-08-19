"""route(): one dispatch body over the Transport protocol.

Both transports run the same loop — select, prompt, dispatch, escalate,
cost, record — with three seams that differ per transport: how candidates
are selected (registry tiers on the API path, seat-catalog roles on the
Copilot path), how a call is dispatched, and how it is priced (resolved
rates on the API path; ``cost_usd=None`` with ``cost_status="unmeasured"``
on the Copilot path — the CLI reports no billing-authoritative usage, and
an absent cost is never 0.0).

Prompt rendering lives here rather than in its own module because
``route`` is its only caller and the size decision it makes — refuse an
over-budget prompt, never trim one — belongs to the dispatch path that
would otherwise ship the truncated result.
"""

from __future__ import annotations

import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from .config import (
    TRANSPORT_COPILOT_CLI,
    load_config,
    resolve_generation_params,
    resolve_transport,
)
from .metrics import record_call
from .pricing import calculate_cost
from .runtime_mode import is_no_router_mode
from .selection import estimate_complexity, next_escalation_model, pick_model
from .transports.api import DirectApiTransport
from .transports.copilot import (
    CopilotCliTransport,
    get_cli_version,
    load_catalog,
    resolve_lockfile_path,
    resolve_role_candidates,
    resolve_transport_timeouts,
    validate_catalog,
)

COST_STATUS_MEASURED = "measured"
COST_STATUS_UNMEASURED = "unmeasured"


class RouterError(RuntimeError):
    """Base class for routing failures. Fail-loud by design — never a
    silent fallback to another transport or provider."""


class NoCandidateError(RouterError):
    """No enabled model survives the provider exclusion. The caller's
    fail-closed case, never a silent same-provider pick."""


class DispatchError(RouterError):
    """The transport could not complete the call (classified error on the
    Copilot path; exhausted retries on the API path). Carries the failing
    provider so a caller can retry excluding it."""

    def __init__(self, message: str, provider=None, model=None):
        super().__init__(message)
        self.provider = provider
        self.model = model


class PromptTooLargeError(RouterError):
    """The rendered prompt exceeds the model's input budget. Refused, not
    trimmed: tail-chopping a review bundle drops the end of the diff while
    the handoff acknowledgement -- appended by the transport after
    prompting -- still validates, so a truncated review returns a
    clean-looking verdict."""


# --- Prompt rendering -------------------------------------------------------

_DEFAULT_SYSTEM_PROMPT = "You are an expert software engineer. Be direct " \
    "and precise."

# Input share of the context window; the remainder is reserved for output.
_INPUT_BUDGET_FRACTION = 0.8
_DEFAULT_MAX_CONTEXT_TOKENS = 200000
_CHARS_PER_TOKEN = 4


def build_prompt(
    content: str,
    context: str,
    task_type: str,
    model_cfg: dict,
    config: dict,
) -> tuple[str, str]:
    """Returns ``(system_prompt, user_message)``. Applies the task-type
    template when one exists, otherwise raw content + context. Raises
    :class:`PromptTooLargeError` when the message exceeds the model's
    input budget -- no code path returns a silently truncated prompt."""
    system_prompt = model_cfg.get("_system_prompt", _DEFAULT_SYSTEM_PROMPT)

    templates = config.get("_task_templates", {})
    if task_type in templates:
        user_message = templates[task_type].replace(
            "{content}", content
        ).replace("{context}", context or "(no additional context)")
    elif context:
        user_message = f"{content}\n\n---\n\nContext:\n{context}"
    else:
        user_message = content

    max_input = model_cfg.get(
        "max_context_tokens", _DEFAULT_MAX_CONTEXT_TOKENS
    )
    budget_tokens = int(max_input * _INPUT_BUDGET_FRACTION)
    estimated_tokens = len(user_message) // _CHARS_PER_TOKEN
    if estimated_tokens > budget_tokens:
        raise PromptTooLargeError(
            f"the rendered {task_type!r} prompt is {len(user_message)} chars "
            f"(~{estimated_tokens} tokens) against an input budget of "
            f"{budget_tokens} tokens ({budget_tokens * _CHARS_PER_TOKEN} "
            f"chars, {int(_INPUT_BUDGET_FRACTION * 100)}% of the model's "
            f"{max_input}-token window) -- an overrun of "
            f"{estimated_tokens - budget_tokens} tokens. Map the session to "
            "a module in docs/modules.yaml so verification builds a bounded "
            "scope instead of a whole-session bundle, split the session, or "
            "route to a model with a larger window. The prompt is never "
            "silently truncated to fit."
        )

    return system_prompt, user_message


@dataclass
class RouteResult:
    content: str
    model_name: str            # registry alias (API) or catalog id (Copilot)
    model_id: str              # the id put on the wire
    provider: str
    tier: int                  # 0 on the Copilot path (no tier ladder)
    input_tokens: int
    output_tokens: int
    cost_usd: Optional[float]  # None when not priced here — never 0.0
    cost_status: str           # "measured" | "unmeasured"
    complexity_score: int
    escalated: bool
    escalation_history: list   # [(model, reason), ...]
    elapsed_seconds: float
    transport: str
    # True when the response appears cut off: the provider reports
    # max_tokens, or a syntactic-completeness heuristic fires. The heuristic
    # exists because providers have returned end_turn on visibly truncated
    # output; the stop reason alone is not sufficient.
    truncated: bool = False
    # The CLI conversation id on the Copilot path — the join key that makes
    # this call's real seat cost recoverable via ai_router.seat_cost.
    transport_session_id: Optional[str] = None
    served_model_id: Optional[str] = None
    metadata: dict = field(default_factory=dict)


_NO_ROUTER_MODEL = "no-router-mode"


def _build_no_router_stub() -> RouteResult:
    """Zero-cost stub for --no-router invocations: no config load, no
    credential check, no network."""
    return RouteResult(
        content="", model_name=_NO_ROUTER_MODEL, model_id=_NO_ROUTER_MODEL,
        provider=_NO_ROUTER_MODEL, tier=0, input_tokens=0, output_tokens=0,
        cost_usd=None, cost_status=COST_STATUS_UNMEASURED, complexity_score=0,
        escalated=False, escalation_history=[], elapsed_seconds=0.0,
        transport="none",
    )


# --- Escalation triggers ----------------------------------------------------

def should_escalate(result, escalation_cfg: dict) -> bool:
    """True when a response indicates the model couldn't handle the task."""
    triggers = escalation_cfg["triggers"]

    if triggers.get("empty_response") and not result.content.strip():
        return True
    if triggers.get("max_tokens_hit") and result.stop_reason == "max_tokens":
        return True
    # Only when tokens were actually reported: the Copilot CLI omits the
    # count on some events, and an unmeasured count is not a short response.
    min_tokens = triggers.get("min_output_tokens", 30)
    if result.output_tokens and result.output_tokens < min_tokens:
        return True
    if triggers.get("refusal_detection"):
        lower = result.content.lower()
        for phrase in escalation_cfg.get("refusal_phrases", []):
            if phrase in lower:
                return True
    return False


def classify_escalation_reason(result, escalation_cfg: dict) -> str:
    if len(result.content.strip()) == 0:
        return "empty_response"
    if result.stop_reason == "max_tokens":
        return "truncated"
    if result.output_tokens < escalation_cfg["triggers"].get(
        "min_output_tokens", 30
    ):
        return "too_short"
    for phrase in escalation_cfg.get("refusal_phrases", []):
        if phrase in result.content.lower():
            return "refusal"
    return "unknown"


_SENTENCE_ENDINGS = ".!?)`\"'"


def detect_truncation(content: str, stop_reason: str) -> bool:
    """Provider signal plus a conservative syntactic heuristic: an odd
    count of triple-backtick fences, or more ``{`` than ``}`` in output
    that also *stops abruptly*. The abrupt-ending condition is what
    separates cut-off code from prose that merely discusses braces — a
    complete review of brace-matching code quoted seven ``{`` against six
    ``}``, ended in a full sentence, and was discarded as truncated,
    losing the verdict. Parentheses are deliberately not checked (prose
    false-positives)."""
    if stop_reason == "max_tokens":
        return True
    stripped = content.rstrip()
    if not stripped:
        return False  # empty response is a different failure mode
    if stripped.count("```") % 2 == 1:
        return True
    if stripped[-1] in _SENTENCE_ENDINGS:
        return False
    return stripped.count("{") > stripped.count("}")


class RateLimiter:
    """Per-provider token-bucket on request count."""

    def __init__(self, requests_per_minute: int, tokens_per_minute: int):
        self.rpm = requests_per_minute
        self.tpm = tokens_per_minute
        self._request_times: list[float] = []
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            now = time.time()
            self._request_times = [
                t for t in self._request_times if t > now - 60.0
            ]
            if len(self._request_times) >= self.rpm:
                sleep_duration = self._request_times[0] + 60.0 - now
                if sleep_duration > 0:
                    time.sleep(sleep_duration)
            self._request_times.append(time.time())


# --- Process-level state ----------------------------------------------------

_state: dict = {
    "config": None,
    "rate_limiters": {},
    "copilot_transport": None,
    "copilot_catalog": None,
}


def reset_for_tests() -> None:
    _state.update(
        config=None, rate_limiters={}, copilot_transport=None,
        copilot_catalog=None,
    )


def _get_config() -> dict:
    if _state["config"] is None:
        _state["config"] = load_config()
        _state["rate_limiters"] = {
            name: RateLimiter(
                cfg["rate_limit"]["requests_per_minute"],
                cfg["rate_limit"]["tokens_per_minute"],
            )
            for name, cfg in _state["config"]["providers"].items()
        }
    return _state["config"]


def _get_copilot(config: dict):
    """Load + fail-closed-validate the seat catalog and construct the CLI
    transport, once per process. An unreadable or invalid lockfile stops
    dispatch with an actionable message — never a silent fallback to the
    API transport."""
    if _state["copilot_transport"] is not None:
        return _state["copilot_transport"], _state["copilot_catalog"]

    cli_cfg = (config.get("transports") or {}).get(TRANSPORT_COPILOT_CLI)
    if not isinstance(cli_cfg, dict):
        raise RouterError(
            "the copilot-cli transport is selected but router-config.yaml "
            "has no transports.copilot-cli block"
        )
    lockfile = resolve_lockfile_path(config)
    try:
        catalog = load_catalog(lockfile)
    except (OSError, ValueError) as exc:
        raise RouterError(
            f"the copilot-cli catalog lockfile at {str(lockfile)!r} could "
            f"not be loaded ({exc}). Probe the seat to regenerate it, or "
            "switch the transport back to 'api'."
        ) from exc

    binary = cli_cfg.get("binary", "copilot")
    validation = validate_catalog(
        catalog, live_cli_version=get_cli_version(binary=binary)
    )
    if not validation.ok:
        raise RouterError(
            "the copilot-cli catalog lockfile failed fail-closed "
            "validation: " + "; ".join(validation.reasons)
            + ". Re-probe the seat to refresh it."
        )
    for warning in validation.warnings:
        print(f"ai_router: copilot-cli catalog: {warning}", file=sys.stderr)

    _state["copilot_catalog"] = catalog
    _state["copilot_transport"] = CopilotCliTransport(
        binary=binary,
        timeouts=resolve_transport_timeouts(cli_cfg),
        max_invocations=cli_cfg.get("max_invocations_per_session"),
    )
    return _state["copilot_transport"], _state["copilot_catalog"]


def any_candidate_survives(exclude_providers=None, transport=None) -> bool:
    """Selection-only preflight: True when at least one enabled candidate
    outside *exclude_providers* could be dispatched on the resolved
    transport. No call is made and nothing is metered — this runs the same
    selection seams :func:`route` uses, so the answer can never disagree
    with a real dispatch. ``verify waive`` uses it to machine-check
    "adjudication is unavailable" before permitting an operator waiver."""
    config = _get_config()
    transport_name = resolve_transport(config, transport)
    exclude = sorted(
        {str(p).strip().lower() for p in (exclude_providers or []) if p}
    )
    if transport_name == TRANSPORT_COPILOT_CLI:
        _transport_obj, catalog = _get_copilot(config)
        return bool(resolve_role_candidates(
            config, catalog, "generator", exclude_providers=exclude
        ))
    from .selection import surviving_candidates

    return bool(surviving_candidates(config, exclude_providers=exclude))


# --- The one dispatch body --------------------------------------------------

@dataclass(frozen=True)
class _Candidate:
    alias: str          # registry alias (API) or catalog id (Copilot)
    model_id: str
    provider: str
    tier: int


def route(
    content: str,
    task_type: str = "general",
    context: str = "",
    complexity_hint: Optional[int] = None,
    max_tier: int = 3,
    session_set: Optional[str] = None,
    session_number: Optional[int] = None,
    exclude_providers: Optional[list] = None,
    prefer_model: Optional[str] = None,
    transport: Optional[str] = None,
) -> RouteResult:
    """Route a task to the best model and dispatch it.

    *exclude_providers* is a hard constraint no pin, preference, or
    escalation can override; an exclusion that leaves no candidate raises
    :class:`NoCandidateError` (fail closed, never a silent same-provider
    pick). *transport* overrides the resolved transport preference for this
    call.
    """
    if is_no_router_mode():
        return _build_no_router_stub()

    config = _get_config()
    transport_name = resolve_transport(config, transport)
    exclude = sorted(
        {str(p).strip().lower() for p in (exclude_providers or []) if p}
    )

    score = estimate_complexity(
        text=f"{content}\n{context}", task_type=task_type,
        hint=complexity_hint, config=config["complexity"],
    )

    if transport_name == TRANSPORT_COPILOT_CLI:
        transport_obj, catalog = _get_copilot(config)
        role_candidates = resolve_role_candidates(
            config, catalog, "generator", exclude_providers=exclude
        )
        if not role_candidates:
            raise NoCandidateError(
                "copilot-cli: no confirmed catalog entry survives the "
                f"provider exclusion {exclude!r} for the generator role"
            )
        ladder = [
            _Candidate(alias=mid, model_id=mid, provider=prov, tier=0)
            for mid, prov in role_candidates
        ]

        def _next_candidate(index: int, escalation_count: int):
            if escalation_count >= config["escalation"]["max_escalations"]:
                return None
            return (
                ladder[index + 1] if index + 1 < len(ladder) else None
            )

        def _dispatch(candidate: _Candidate, system_prompt, user_message, gen_params):
            return transport_obj.dispatch(
                model_id=candidate.model_id,
                system_prompt=system_prompt,
                user_message=user_message,
            )

        def _model_cfg(candidate: _Candidate) -> dict:
            return {}

        def _gen_params(candidate: _Candidate) -> dict:
            return {}  # the CLI exposes no generation knobs

        def _rate_limit(candidate: _Candidate) -> None:
            pass

        def _price(candidate, result):
            return None
    else:
        alias = pick_model(
            score, max_tier, task_type, config,
            exclude_providers=exclude, prefer_model=prefer_model,
        )
        if alias is None:
            raise NoCandidateError(
                "no enabled model in router-config.yaml survives the "
                f"provider exclusion {exclude!r} "
                f"(task_type={task_type!r}, max_tier={max_tier}). Enable a "
                "model from a surviving provider, or set its API key."
            )

        def _to_candidate(model_alias: str) -> _Candidate:
            entry = config["models"][model_alias]
            return _Candidate(
                alias=model_alias,
                model_id=entry["model_id"],
                provider=entry["provider"],
                tier=entry["tier"],
            )

        ladder = [_to_candidate(alias)]

        def _next_candidate(index: int, escalation_count: int):
            nxt = next_escalation_model(
                ladder[index].alias, config, escalation_count,
                exclude_providers=exclude,
            )
            if nxt is None:
                return None
            candidate = _to_candidate(nxt)
            ladder.append(candidate)
            return candidate

        def _dispatch(candidate: _Candidate, system_prompt, user_message, gen_params):
            entry = config["models"][candidate.alias]
            api = DirectApiTransport(
                candidate.provider, config["providers"][candidate.provider]
            )
            return api.dispatch(
                model_id=candidate.model_id,
                system_prompt=system_prompt,
                user_message=user_message,
                max_tokens=entry["max_output_tokens"],
                generation_params=gen_params,
            )

        def _model_cfg(candidate: _Candidate) -> dict:
            return config["models"][candidate.alias]

        def _gen_params(candidate: _Candidate) -> dict:
            return resolve_generation_params(candidate.alias, task_type, config)

        def _rate_limit(candidate: _Candidate) -> None:
            _state["rate_limiters"][candidate.provider].wait()

        def _price(candidate, result):
            return calculate_cost(
                result.input_tokens, result.output_tokens,
                config["models"][candidate.alias],
            )

    escalation_cfg = config["escalation"]
    escalation_history: list = []
    index = 0
    current = ladder[0]

    while True:
        system_prompt, user_message = build_prompt(
            content=content, context=context, task_type=task_type,
            model_cfg=_model_cfg(current), config=config,
        )
        gen_params = _gen_params(current)
        _rate_limit(current)
        start = time.time()
        result = _dispatch(current, system_prompt, user_message, gen_params)
        elapsed = time.time() - start

        if not result.ok:
            raise DispatchError(
                f"dispatch of {current.model_id!r} over {transport_name} "
                f"failed: {result.metadata.get('error_class')} "
                f"({result.metadata.get('stderr_tail', '')[-300:]})",
                provider=current.provider,
                model=current.alias,
            )

        if escalation_cfg["enabled"] and should_escalate(result, escalation_cfg):
            nxt = _next_candidate(index, len(escalation_history))
            if nxt is not None:
                escalation_history.append(
                    (current.alias, classify_escalation_reason(result, escalation_cfg))
                )
                index += 1
                current = nxt
                continue
            # Max escalations reached or nothing survives: use what we have.
        break

    cost = _price(current, result)
    on_copilot = transport_name == TRANSPORT_COPILOT_CLI
    session_id = result.metadata.get("session_id") if on_copilot else None

    record_call(
        config,
        call_type="route",
        task_type=task_type,
        model=current.alias,
        provider=current.provider,
        tier=current.tier,
        complexity_score=score,
        generation_params=gen_params,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        elapsed_seconds=elapsed,
        escalated=bool(escalation_history),
        stop_reason=result.stop_reason,
        session_set=session_set,
        session_number=session_number,
        requested_model_id=current.model_id,
        served_model_id=result.served_model_id,
        transport=transport_name,
        billed_usage_unavailable=True if on_copilot else None,
        transport_session_id=session_id,
    )

    route_result = RouteResult(
        content=result.content,
        model_name=current.alias,
        model_id=current.model_id,
        provider=current.provider,
        tier=current.tier,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=cost,
        cost_status=(
            COST_STATUS_UNMEASURED if cost is None else COST_STATUS_MEASURED
        ),
        complexity_score=score,
        escalated=bool(escalation_history),
        escalation_history=escalation_history,
        elapsed_seconds=elapsed,
        transport=transport_name,
        truncated=detect_truncation(result.content, result.stop_reason),
        transport_session_id=session_id,
        served_model_id=result.served_model_id,
        metadata=dict(result.metadata),
    )

    verification_cfg = config.get("verification") or {}
    if (
        verification_cfg.get("enabled")
        and task_type in (verification_cfg.get("auto_verify_task_types") or [])
        and task_type not in ("verification", "session-verification")
    ):
        from .verify import auto_verify

        outcome = auto_verify(route_result, content, task_type, config)
        if outcome is not None:
            route_result.metadata["verification"] = outcome

    return route_result
