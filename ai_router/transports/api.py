"""Direct-API transport: HTTPS callers for Anthropic, Google, and OpenAI.

``generation_params`` controls per-call reasoning behavior (any subset):

    Anthropic:  {"effort": "low|medium|high|xhigh",
                 "thinking": {"enabled": True, "type": "adaptive"}}
    Gemini 2.5: {"thinking_budget": -1 | 0 | <positive int>}
    Gemini 3.x: {"thinking_level": "MINIMAL|LOW|MEDIUM|HIGH"}
    OpenAI:     {"reasoning_effort": "none|minimal|low|medium|high|xhigh"}
"""

from __future__ import annotations

import sys
import time
from typing import Optional

import httpx

from ..secret_resolver import resolve_secret
from .base import APIResult


def _served_model_id(data: dict, key: str) -> Optional[str]:
    """Read the served-model id out of a response body, defensively: the
    "provider omitted it" and "provider sent a non-string" cases both
    resolve to None. Recording a served model must never break a call that
    already succeeded and was already paid for."""
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        return value
    return None


def call_model(
    provider_name: str,
    model_id: str,
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    config: dict,
    generation_params: Optional[dict] = None,
) -> APIResult:
    """Call a provider API synchronously, with retries. *config* is the
    provider's block from router-config.yaml (api_key_env, base_url,
    timeout_seconds, retry)."""
    caller = _PROVIDER_CALLERS[provider_name]

    max_retries = config["retry"]["max_retries"]
    backoff_base = config["retry"]["backoff_base_seconds"]
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            result = caller(
                model_id, system_prompt, user_message,
                max_tokens, config, generation_params or {},
            )
            if (
                result.served_model_id is not None
                and result.served_model_id != model_id
            ):
                print(
                    f"[dabbler] NOTE: requested model {model_id!r} but "
                    f"{provider_name} served {result.served_model_id!r}. "
                    "A dated-snapshot pin is routine; a change of model "
                    "family changes the price. Both ids are recorded in "
                    "the metrics row.",
                    file=sys.stderr,
                )
            return result
        except (httpx.HTTPStatusError, httpx.TimeoutException) as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(backoff_base * (2 ** attempt))

    raise RuntimeError(
        f"API call failed after {max_retries + 1} attempts: {last_error}"
    )


def _call_anthropic(model_id, system_prompt, user_message,
                    max_tokens, config, gen_params):
    api_key = resolve_secret(config["api_key_env"])
    if not api_key:
        raise EnvironmentError(
            f"Missing environment variable {config['api_key_env']} for Anthropic"
        )

    body = {
        "model": model_id,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }

    thinking = gen_params.get("thinking") or {}
    if thinking.get("enabled"):
        body["thinking"] = {"type": thinking.get("type", "adaptive")}

    effort = gen_params.get("effort")
    if effort:
        body.setdefault("output_config", {})["effort"] = effort

    headers = {
        "x-api-key": api_key,
        "anthropic-version": config.get("api_version", "2023-06-01"),
        "content-type": "application/json",
    }
    betas = gen_params.get("betas") or config.get("betas")
    if betas:
        headers["anthropic-beta"] = (
            ",".join(betas) if isinstance(betas, (list, tuple)) else str(betas)
        )

    with httpx.Client(timeout=config["timeout_seconds"]) as client:
        resp = client.post(
            config.get("base_url", "https://api.anthropic.com/v1/messages"),
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

        content = "".join(
            b["text"] for b in data["content"] if b["type"] == "text"
        )
        return APIResult(
            content=content,
            input_tokens=data["usage"]["input_tokens"],
            output_tokens=data["usage"]["output_tokens"],
            stop_reason=data.get("stop_reason", "unknown"),
            served_model_id=_served_model_id(data, "model"),
        )


def _call_google(model_id, system_prompt, user_message,
                 max_tokens, config, gen_params):
    api_key = resolve_secret(config["api_key_env"])
    if not api_key:
        raise EnvironmentError(
            f"Missing environment variable {config['api_key_env']} for Google"
        )
    base = config.get(
        "base_url", "https://generativelanguage.googleapis.com/v1beta"
    )
    # The key travels in the x-goog-api-key header, never the query string:
    # httpx renders the full URL into HTTPStatusError text, which surfaces
    # in operator-visible output — a `?key=` URL would leak a live credential.
    url = f"{base}/models/{model_id}:generateContent"

    generation_config: dict = {"maxOutputTokens": max_tokens}

    # Gemini 3.x uses thinkingLevel; 2.5 uses thinkingBudget. Mutually
    # exclusive shapes.
    thinking_cfg: dict = {}
    if model_id.startswith("gemini-3"):
        level = gen_params.get("thinking_level")
        if level:
            thinking_cfg["thinkingLevel"] = str(level).upper()
    else:
        budget = gen_params.get("thinking_budget")
        if budget is not None:
            thinking_cfg["thinkingBudget"] = int(budget)
    if thinking_cfg:
        generation_config["thinkingConfig"] = thinking_cfg

    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_message}]}],
        "generationConfig": generation_config,
    }

    with httpx.Client(timeout=config["timeout_seconds"]) as client:
        resp = client.post(url, headers={"x-goog-api-key": api_key}, json=body)
        resp.raise_for_status()
        data = resp.json()

        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage = data.get("usageMetadata", {})
        finish = data["candidates"][0].get("finishReason", "STOP")
        stop_reason = (
            "max_tokens" if finish == "MAX_TOKENS"
            else "end_turn" if finish == "STOP"
            else finish.lower()
        )
        return APIResult(
            content=content,
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0),
            stop_reason=stop_reason,
            served_model_id=_served_model_id(data, "modelVersion"),
        )


def _call_openai(model_id, system_prompt, user_message,
                 max_tokens, config, gen_params):
    """Call OpenAI via the Responses API (POST /v1/responses).

    Reasoning tokens are billed as output tokens and are already included
    in the API's own output_tokens accounting — no double-add.
    """
    api_key = resolve_secret(config["api_key_env"])
    if not api_key:
        raise EnvironmentError(
            f"Missing environment variable {config['api_key_env']} for OpenAI"
        )
    base = config.get("base_url", "https://api.openai.com/v1")
    url = f"{base}/responses"

    body: dict = {
        "model": model_id,
        "instructions": system_prompt,
        "input": user_message,
        "max_output_tokens": max_tokens,
    }
    effort = gen_params.get("reasoning_effort")
    if effort:
        body["reasoning"] = {"effort": effort}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=config["timeout_seconds"]) as client:
        resp = client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

        content = data.get("output_text")
        if not content:
            parts = []
            for item in data.get("output", []):
                if item.get("type") == "message":
                    for c in item.get("content", []):
                        if c.get("type") in ("output_text", "text"):
                            parts.append(c.get("text", ""))
            content = "".join(parts)

        usage = data.get("usage", {}) or {}
        input_tokens = usage.get("input_tokens") or usage.get("prompt_tokens") or 0
        output_tokens = (
            usage.get("output_tokens") or usage.get("completion_tokens") or 0
        )

        status = data.get("status", "completed")
        if status == "incomplete":
            reason = (data.get("incomplete_details") or {}).get("reason")
            stop_reason = (
                "max_tokens" if reason == "max_output_tokens"
                else reason or "incomplete"
            )
        else:
            stop_reason = "end_turn"

        return APIResult(
            content=content or "",
            input_tokens=int(input_tokens),
            output_tokens=int(output_tokens),
            stop_reason=stop_reason,
            served_model_id=_served_model_id(data, "model"),
        )


_PROVIDER_CALLERS = {
    "anthropic": _call_anthropic,
    "google": _call_google,
    "openai": _call_openai,
}


class DirectApiTransport:
    """Transport-protocol wrapper over :func:`call_model` for one provider."""

    def __init__(self, provider_name: str, provider_config: dict) -> None:
        self._provider = provider_name
        self._config = provider_config

    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
        generation_params: Optional[dict] = None,
    ) -> APIResult:
        return call_model(
            self._provider, model_id, system_prompt, user_message,
            max_tokens, self._config, generation_params,
        )
