"""Build model-specific prompts from templates."""


def build_prompt(
    content: str,
    context: str,
    task_type: str,
    model_cfg: dict,
    config: dict
) -> tuple[str, str]:
    """
    Returns (system_prompt, user_message).
    Applies task-type template if available, otherwise raw content.
    """
    # System prompt from model config
    system_prompt = model_cfg.get(
        "_system_prompt",
        "You are an expert software engineer. Be direct and precise."
    )

    # User message: apply task-type template if available
    templates = config.get("_task_templates", {})
    if task_type in templates:
        template = templates[task_type]
        user_message = template.replace(
            "{content}", content
        ).replace(
            "{context}", context or "(no additional context)"
        )
    else:
        # No template — raw content + context
        if context:
            user_message = f"{content}\n\n---\n\nContext:\n{context}"
        else:
            user_message = content

    # Truncation safety: if message exceeds model's context window,
    # truncate context (not content) with a warning
    estimated_tokens = len(user_message) // 4
    max_input = model_cfg.get("max_context_tokens", 200000)
    # Reserve 20% for output
    input_budget = int(max_input * 0.8)

    if estimated_tokens > input_budget:
        # Truncate by trimming context
        max_chars = input_budget * 4
        user_message = user_message[:max_chars] + (
            "\n\n[TRUNCATED — context exceeded model's input limit]"
        )

    return system_prompt, user_message
