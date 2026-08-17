"""Build model-specific prompts from templates."""


def build_prompt(
    content: str,
    context: str,
    task_type: str,
    model_cfg: dict,
    config: dict,
) -> tuple[str, str]:
    """Returns ``(system_prompt, user_message)``. Applies the task-type
    template when one exists, otherwise raw content + context."""
    system_prompt = model_cfg.get(
        "_system_prompt",
        "You are an expert software engineer. Be direct and precise.",
    )

    templates = config.get("_task_templates", {})
    if task_type in templates:
        template = templates[task_type]
        user_message = template.replace("{content}", content).replace(
            "{context}", context or "(no additional context)"
        )
    else:
        if context:
            user_message = f"{content}\n\n---\n\nContext:\n{context}"
        else:
            user_message = content

    # Truncation safety: if the message exceeds the model's context window,
    # trim the tail (reserving 20% of the window for output) with a marker.
    estimated_tokens = len(user_message) // 4
    max_input = model_cfg.get("max_context_tokens", 200000)
    input_budget = int(max_input * 0.8)
    if estimated_tokens > input_budget:
        max_chars = input_budget * 4
        user_message = user_message[:max_chars] + (
            "\n\n[TRUNCATED — context exceeded model's input limit]"
        )

    return system_prompt, user_message
