"""The one-shot cross-provider review ``route()`` may add to a routed call.

The independence guarantee is the point: the verifier is never the provider
that did the work, and the exclusion is enforced in Python where the caller
cannot widen it away.

Response parsing is not reimplemented here. ``verdict.parse_verification_
response`` and ``classify_blocking`` decide what a verdict means and which
findings block.

This module held the run core's verified-policy job as well, until the run
core was retired. What is left is what ``verify`` and ``route`` import.
"""

from __future__ import annotations

from .verdict import classify_blocking, parse_verification_response


def build_verification_prompt(
    template: str, original_task: str, task_type: str, original_response: str
) -> str:
    template = template or (
        "Verify the following work adversarially. Start your response "
        "with VERIFIED or ISSUES FOUND.\n\n### Original Task\n"
        "{original_task}\n\n### Task Type\n{task_type}\n\n"
        "### Response Under Review\n{original_response}\n"
    )
    return (
        template.replace("{original_task}", original_task or "(not provided)")
        .replace("{task_type}", task_type)
        .replace("{original_response}", original_response)
    )


def auto_verify(route_result, content: str, task_type: str, config):
    """Verify a routed response with a different-provider verifier; returns
    ``{verdict, blocking, issue_count, verifier_model, verifier_provider}``
    or ``None`` when no verifier survives. Best-effort by contract: the
    routed call already succeeded and was paid for."""
    from .metrics import record_call
    from .route import RouterError, route
    from .selection import ROLE_VERIFIER

    prompt = build_verification_prompt(
        config.get("_verification_template", ""),
        content, task_type, route_result.content,
    )
    try:
        result = route(
            prompt, task_type="verification",
            role=ROLE_VERIFIER,
            exclude_providers=[route_result.provider],
        )
    except RouterError:
        return None
    verdict, issues = parse_verification_response(result.content)
    classification = classify_blocking(verdict, issues)
    record_call(
        config, call_type="verify", task_type=task_type,
        model=result.model_name, provider=result.provider,
        generation_params={},
        input_tokens=result.input_tokens, output_tokens=result.output_tokens,
        elapsed_seconds=result.elapsed_seconds,
        escalated=result.escalated, stop_reason="", transport=result.transport,
        verifier_of=route_result.model_name, verdict=verdict,
        issue_count=len(issues),
    )
    return {
        "verdict": verdict,
        "blocking": classification.blocking,
        "issue_count": len(issues),
        "verifier_model": result.model_name,
        "verifier_provider": result.provider,
    }
