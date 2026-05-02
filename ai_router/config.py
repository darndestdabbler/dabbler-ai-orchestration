"""Load and validate router-config.yaml, and resolve effective generation
params for a (model, task_type) pair.

The previous tuning-overlay mechanism (router-tuning.json) has been
removed as of Session 2 of BATON v2. router-config.yaml is now the
single source of truth for every tunable knob.
"""

import copy
import datetime
import os
import sys
import yaml
from pathlib import Path

# Default config location is router-config.yaml in the same directory as
# this file. Keeps the default working regardless of where Python is
# invoked from.
_THIS_DIR = Path(__file__).parent


def load_config(path: str | None = None) -> dict:
    if path is None:
        path = str(_THIS_DIR / "router-config.yaml")
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Router config not found: {path}\n"
            f"Create it from the template in the AI Router specification."
        )

    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Validate API keys exist in environment
    for name, provider in config["providers"].items():
        env_var = provider["api_key_env"]
        if not os.environ.get(env_var):
            raise EnvironmentError(
                f"Missing environment variable {env_var} "
                f"for provider '{name}'. "
                f"Set it with: export {env_var}=your-key-here"
            )

    # Validate model references
    for tier, model_name in config["routing"]["tier_assignments"].items():
        if model_name not in config["models"]:
            raise ValueError(
                f"Tier {tier} references unknown model '{model_name}'. "
                f"Available: {list(config['models'].keys())}"
            )

    # Resolve prompt template file paths relative to config file location.
    # The integrated repo stores templates under ai_router/prompt-templates,
    # but we keep a sibling fallback so older layouts still load cleanly.
    config_dir = config_path.parent
    prompt_roots = [
        config_dir / "prompt-templates",
        config_dir.parent / "prompt-templates",
    ]

    def resolve_relative_path(relative_path: str) -> Path | None:
        candidate = config_dir / relative_path
        if candidate.exists():
            return candidate

        for root in prompt_roots:
            if not root.exists():
                continue

            root_name = root.name
            normalized = relative_path.replace("\\", "/")
            if normalized.startswith(f"{root_name}/"):
                nested = root / normalized[len(root_name) + 1:]
                if nested.exists():
                    return nested

        return None

    # System prompts live in a single consolidated file
    # (prompt-templates/system-prompts.md) with one H2 section per
    # provider slug ("anthropic", "google", "openai"). Each model's
    # system_prompt_file points at that file; its provider field picks
    # the section. Parse once per unique file path.
    _default_system_prompt = (
        "You are an expert software engineer. Be direct and precise."
    )
    _system_sections_cache: dict[Path, dict[str, str]] = {}

    def _load_system_sections(path: Path) -> dict[str, str]:
        if path not in _system_sections_cache:
            _system_sections_cache[path] = _split_sections(
                path.read_text(), header_level=2
            )
        return _system_sections_cache[path]

    for model_name, model_cfg in config["models"].items():
        prompt_file = model_cfg.get("system_prompt_file")
        if not prompt_file:
            continue
        full_path = resolve_relative_path(prompt_file)
        if full_path is None:
            model_cfg["_system_prompt"] = _default_system_prompt
            continue
        sections = _load_system_sections(full_path)
        if not sections:
            # Flat file with no H2 section headers — use whole contents.
            model_cfg["_system_prompt"] = full_path.read_text().strip()
            continue
        provider_slug = str(model_cfg.get("provider", "")).strip().lower()
        model_cfg["_system_prompt"] = sections.get(
            provider_slug, _default_system_prompt
        )

    # Task templates live in a single consolidated file
    # (prompt-templates/task-prompts.md) with one H1 section per
    # task type slug. H1 is used rather than H2 because the template
    # body contains its own H2 headers.
    config["_task_templates"] = {}
    for _pt_root in prompt_roots:
        task_file = _pt_root / "task-prompts.md"
        if not task_file.exists():
            continue
        config["_task_templates"] = _split_sections(
            task_file.read_text(), header_level=1
        )
        if config["_task_templates"]:
            break

    # Resolve verification template
    v_config = config.get("verification", {})
    v_template_file = (v_config.get("settings", {})
                       .get("prompt_template_file"))
    if v_template_file:
        v_path = resolve_relative_path(v_template_file)
        if v_path is not None:
            config["_verification_template"] = v_path.read_text().strip()
        else:
            config["_verification_template"] = ""
    else:
        config["_verification_template"] = ""

    # Pricing-staleness check — nags (does not block) if the YAML has
    # not been reviewed inside the configured window. Missing metadata
    # is treated as "never reviewed" and always warns.
    _check_pricing_staleness(config)

    return config


def _check_pricing_staleness(config: dict) -> None:
    """Print a warning to stderr if router-config.yaml's pricing has
    not been reviewed recently.

    Controlled by two fields under the top-level `metadata` block:
        pricing_reviewed:    ISO date string, e.g. "2026-04-20"
        review_frequency_days: integer, default 30

    Soft warning only. Does not raise.
    """
    metadata = config.get("metadata", {}) or {}
    reviewed_raw = metadata.get("pricing_reviewed")
    threshold_days = int(metadata.get("review_frequency_days", 30))

    if not reviewed_raw:
        print("WARNING: router-config.yaml has no metadata.pricing_reviewed "
              "date — pricing has never been reviewed.", file=sys.stderr)
        return

    try:
        reviewed = datetime.date.fromisoformat(str(reviewed_raw))
    except ValueError:
        print(f"WARNING: metadata.pricing_reviewed is not an ISO date: "
              f"{reviewed_raw!r}", file=sys.stderr)
        return

    age = (datetime.date.today() - reviewed).days
    if age > threshold_days:
        print(f"WARNING: router-config.yaml pricing last reviewed "
              f"{age} days ago (threshold: {threshold_days}). "
              f"Verify model prices at the provider consoles and update "
              f"metadata.pricing_reviewed.", file=sys.stderr)


def resolve_generation_params(
    model_name: str,
    task_type: str,
    config: dict,
) -> dict:
    """Resolve effective generation_params for a (model, task_type) pair.

    Precedence (lowest to highest):
      1. Model-level defaults: config['models'][model_name]['generation_params']
      2. Per-task-type override: config['task_type_params'][task_type][model_name]

    Returns a dict with any subset of provider-specific fields:
      effort, thinking (dict), thinking_budget (int), thinking_level (str),
      reasoning_effort (str).
    """
    model_cfg = config["models"].get(model_name, {})
    params = copy.deepcopy(model_cfg.get("generation_params", {}) or {})

    # Per-task-type YAML override
    tt_block = config.get("task_type_params", {}).get(task_type, {}) or {}
    overrides = tt_block.get(model_name, {}) or {}
    params = _deep_merge(params, overrides)

    return params


def _deep_merge(base: dict, override: dict) -> dict:
    """Return a new dict where override keys win. Nested dicts merge."""
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if (
            k in out
            and isinstance(out[k], dict)
            and isinstance(v, dict)
        ):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _split_sections(text: str, header_level: int) -> dict[str, str]:
    """Split markdown by `#`-style headers of exactly the given level.

    Returns a dict mapping slugified header text (lowercased, spaces
    and underscores converted to hyphens) to the section body that
    follows the header, stripped of surrounding whitespace.

    Content preceding the first matching header is treated as file
    preamble and discarded. Deeper headers inside a section are left
    untouched — the level check is exact, not minimum.
    """
    prefix = "#" * header_level + " "
    sections: dict[str, str] = {}
    current_slug: str | None = None
    current_lines: list[str] = []

    for line in text.splitlines():
        # startswith(prefix) matches ONLY the exact level: for H1,
        # "## foo" fails the check because position 1 is '#' not ' '.
        if line.startswith(prefix):
            if current_slug is not None:
                sections[current_slug] = "\n".join(current_lines).strip()
            header_text = line[len(prefix):].strip()
            current_slug = (
                header_text.lower().replace(" ", "-").replace("_", "-")
            )
            current_lines = []
        elif current_slug is not None:
            current_lines.append(line)

    if current_slug is not None:
        sections[current_slug] = "\n".join(current_lines).strip()

    return sections
