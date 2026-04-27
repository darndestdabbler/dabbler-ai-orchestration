"""API callers for each provider.

Accepts an optional `generation_params` dict to control per-call reasoning
behavior. Shape of generation_params (any subset is fine):

    For Anthropic (Sonnet 4.6, Opus 4.6/4.7):
        {
          "effort": "low" | "medium" | "high" | "xhigh",
          "thinking": {"enabled": True, "type": "adaptive"}
        }

    For Google Gemini 2.5:
        {"thinking_budget": -1 | 0 | <positive int>}

    For Google Gemini 3.x:
        {"thinking_level": "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"}

    For OpenAI (GPT-5.x family):
        {"reasoning_effort": "none" | "minimal" | "low" | "medium" | "high" | "xhigh"}

If generation_params is None or empty, the call uses each API's defaults.
"""

import os
import time
import httpx
from dataclasses import dataclass


@dataclass
class APIResult:
    content: str
    input_tokens: int
    output_tokens: int
    stop_reason: str


def call_model(
    provider_name: str,
    model_id: str,
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    config: dict,
    generation_params: dict | None = None,
) -> APIResult:
    """Call an AI API synchronously. Handles retries."""
    caller = {
        "anthropic": _call_anthropic,
        "google": _call_google,
        "openai": _call_openai,
    }[provider_name]

    max_retries = config["retry"]["max_retries"]
    backoff_base = config["retry"]["backoff_base_seconds"]
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return caller(
                model_id, system_prompt, user_message,
                max_tokens, config, generation_params or {}
            )
        except (httpx.HTTPStatusError, httpx.TimeoutException) as e:
            last_error = e
            if attempt < max_retries:
                wait = backoff_base * (2 ** attempt)
                time.sleep(wait)

    raise RuntimeError(
        f"API call failed after {max_retries + 1} attempts: {last_error}"
    )


def _call_anthropic(model_id, system_prompt, user_message,
                    max_tokens, config, gen_params):
    api_key = os.environ[config["api_key_env"]]

    body = {
        "model": model_id,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_message}
        ],
    }

    # thinking: {type: adaptive} when enabled
    thinking = gen_params.get("thinking") or {}
    if thinking.get("enabled"):
        body["thinking"] = {
            "type": thinking.get("type", "adaptive"),
        }

    # output_config.effort — Sonnet 4.6 / Opus 4.6 / Opus 4.7
    effort = gen_params.get("effort")
    if effort:
        body.setdefault("output_config", {})["effort"] = effort

    # task_budget (Opus 4.7 beta) — spans the full agentic loop
    task_budget = gen_params.get("task_budget_tokens")
    if isinstance(task_budget, int) and task_budget > 0:
        body.setdefault("output_config", {})["task_budget"] = {
            "type": "tokens",
            "total": task_budget,
        }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": config.get("api_version", "2023-06-01"),
        "content-type": "application/json",
    }

    # Beta headers (e.g., task-budgets-2026-03-13) if any are declared
    betas = gen_params.get("betas") or config.get("betas")
    if betas:
        if isinstance(betas, (list, tuple)):
            headers["anthropic-beta"] = ",".join(betas)
        else:
            headers["anthropic-beta"] = str(betas)

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
        )


def _call_google(model_id, system_prompt, user_message,
                 max_tokens, config, gen_params):
    api_key = os.environ[config["api_key_env"]]
    base = config.get(
        "base_url",
        "https://generativelanguage.googleapis.com/v1beta"
    )
    url = f"{base}/models/{model_id}:generateContent?key={api_key}"

    generation_config: dict = {"maxOutputTokens": max_tokens}

    # Build thinkingConfig. Gemini 3.x uses thinkingLevel; Gemini 2.5 uses
    # thinkingBudget. They are mutually exclusive.
    thinking_cfg: dict = {}
    if model_id.startswith("gemini-3"):
        level = gen_params.get("thinking_level")
        if level:
            thinking_cfg["thinkingLevel"] = str(level).upper()
    else:
        budget = gen_params.get("thinking_budget")
        if budget is not None:
            # -1 = dynamic, 0 = off (Flash only; Pro ignores 0)
            thinking_cfg["thinkingBudget"] = int(budget)

    if thinking_cfg:
        generation_config["thinkingConfig"] = thinking_cfg

    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_message}]}],
        "generationConfig": generation_config,
    }

    with httpx.Client(timeout=config["timeout_seconds"]) as client:
        resp = client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()

        content = (
            data["candidates"][0]["content"]["parts"][0]["text"]
        )
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
        )


def _call_openai(model_id, system_prompt, user_message,
                 max_tokens, config, gen_params):
    """Call OpenAI via the Responses API.

    Uses POST /v1/responses (not chat/completions) because:
      - reasoning.effort is the current shape for GPT-5.x reasoning control
      - The Responses API is OpenAI's recommended endpoint for new models
      - Reasoning tokens are reported separately in the response

    NOTE: OpenAI's reasoning tokens are billed as output tokens. The router
    merges them into output_tokens below so cost calculation stays correct.
    """
    api_key = os.environ[config["api_key_env"]]
    base = config.get("base_url", "https://api.openai.com/v1")
    url = f"{base}/responses"

    body: dict = {
        "model": model_id,
        # The Responses API accepts either a plain `input` string or a
        # message array. We pass a plain message array for multi-turn
        # compatibility with the system prompt.
        "instructions": system_prompt,
        "input": user_message,
        "max_output_tokens": max_tokens,
    }

    # reasoning.effort: none | minimal | low | medium | high | xhigh
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

        # The Responses API returns a top-level `output_text` convenience
        # field when available. Fall back to walking the structured output.
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
        input_tokens = (
            usage.get("input_tokens")
            or usage.get("prompt_tokens")
            or 0
        )
        output_tokens = (
            usage.get("output_tokens")
            or usage.get("completion_tokens")
            or 0
        )
        # Reasoning tokens ARE billed as output tokens. OpenAI reports them
        # separately as a sub-field; they're already included in
        # output_tokens by the API's own accounting, so we don't double-add.
        # (See openai.com/api/docs/pricing, March 2026.)

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
        )
