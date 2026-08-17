"""Load and validate router-config.yaml; resolve transport preference and
effective generation params.

Structural validation runs through the JSON schema at
``schemas/router-config.schema.json``. Semantic rules a schema cannot express
(cross-references, pricing periods) run here, all at load time so a bad
config fails at startup rather than mid-call.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

import jsonschema
import yaml

from .pricing import validate_model_rates
from .transports.copilot import validate_transport_timeouts

_THIS_DIR = Path(__file__).parent
_SCHEMA_PATH = _THIS_DIR / "schemas" / "router-config.schema.json"

TRANSPORT_API = "api"
TRANSPORT_COPILOT_CLI = "copilot-cli"
VALID_TRANSPORTS = (TRANSPORT_API, TRANSPORT_COPILOT_CLI)

TRANSPORT_ENV_VAR = "DABBLER_TRANSPORT"

# Keys required in transports.copilot-cli when that transport is selected.
_COPILOT_CLI_REQUIRED_KEYS = frozenset({"lockfile", "roles"})

_schema_cache: dict | None = None


def _load_schema() -> dict:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache


def _resolve_config_path(path: str | None = None) -> Path:
    """Explicit path > ``AI_ROUTER_CONFIG`` env var > bundled default."""
    if path is not None:
        return Path(path)
    env_override = os.environ.get("AI_ROUTER_CONFIG")
    if env_override:
        return Path(env_override)
    return _THIS_DIR / "router-config.yaml"


def load_config(path: str | None = None) -> dict:
    config_path = _resolve_config_path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Router config not found: {config_path}. Create it from the "
            "bundled ai_router/router-config.yaml."
        )

    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    try:
        jsonschema.validate(config, _load_schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise ValueError(
            f"router-config.yaml failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc

    for prov_cfg in config["providers"].values():
        prov_cfg.setdefault("enabled", True)

    provider_names = set(config["providers"])
    for model_name, model_cfg in config["models"].items():
        if model_cfg["provider"] not in provider_names:
            raise ValueError(
                f"Model {model_name!r} references unknown provider "
                f"{model_cfg['provider']!r}. Available: {sorted(provider_names)}"
            )
        validate_model_rates(model_name, model_cfg)

    for tier, model_name in config["routing"]["tier_assignments"].items():
        if model_name not in config["models"]:
            raise ValueError(
                f"Tier {tier} references unknown model {model_name!r}. "
                f"Available: {list(config['models'])}"
            )
    for task_type, model_name in (
        config["routing"].get("task_type_overrides") or {}
    ).items():
        if model_name not in config["models"]:
            raise ValueError(
                f"task_type_overrides.{task_type} references unknown model "
                f"{model_name!r}"
            )

    _validate_copilot_block(config)
    _load_prompt_templates(config, config_path.parent)

    config["_config_path"] = str(config_path.resolve())
    return config


def _validate_copilot_block(config: dict) -> None:
    """When the copilot-cli transport is configured, its block must be
    complete — selecting the seat transport and silently falling back to a
    keyless API path is a worse failure than refusing to load."""
    block = (config.get("transports") or {}).get(TRANSPORT_COPILOT_CLI)
    if block is None:
        return
    if not isinstance(block, dict):
        raise ValueError("transports.copilot-cli must be a mapping")
    missing = sorted(_COPILOT_CLI_REQUIRED_KEYS - set(block))
    if missing:
        raise ValueError(
            f"transports.copilot-cli is missing required key(s): {missing}"
        )
    validate_transport_timeouts(block.get("timeouts"))


def resolve_transport(config: dict, cli_flag: str | None = None) -> str:
    """The effective transport for routine dispatch.

    Precedence: CLI flag > ``DABBLER_TRANSPORT`` env var (the operator's
    standing preference) > ``transport.profile`` in router-config.yaml >
    default ``api``. An unknown value fails loud at whichever level supplied
    it. This selects the transport for routine dispatch; verifier selection
    may still use the other transport when provider independence requires it.
    """
    for source, value in (
        ("--transport flag", cli_flag),
        (f"{TRANSPORT_ENV_VAR} env var", os.environ.get(TRANSPORT_ENV_VAR) or None),
        ("transport.profile", (config.get("transport") or {}).get("profile")),
    ):
        if value is None:
            continue
        normalized = str(value).strip().lower()
        if normalized not in VALID_TRANSPORTS:
            raise ValueError(
                f"{source} must be one of {list(VALID_TRANSPORTS)}, "
                f"got {value!r}"
            )
        return normalized
    return TRANSPORT_API


def resolve_generation_params(
    model_name: str, task_type: str, config: dict
) -> dict:
    """Effective generation_params for a (model, task_type) pair: model-level
    defaults overlaid by ``task_type_params[task_type][model_name]``."""
    model_cfg = config["models"].get(model_name, {})
    params = copy.deepcopy(model_cfg.get("generation_params", {}) or {})
    tt_block = config.get("task_type_params", {}).get(task_type, {}) or {}
    overrides = tt_block.get(model_name, {}) or {}
    return _deep_merge(params, overrides)


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


# --- Prompt templates -------------------------------------------------------

_DEFAULT_SYSTEM_PROMPT = (
    "You are an expert software engineer. Be direct and precise."
)


def _load_prompt_templates(config: dict, config_dir: Path) -> None:
    """Resolve prompt templates relative to the config file's directory.

    System prompts: one consolidated file (``system_prompt_file`` per model)
    with an H2 section per provider slug. Task templates:
    ``prompt-templates/task-prompts.md`` with an H1 section per task type
    (H1 because template bodies contain their own H2 headers). Verification
    template: ``verification.settings.prompt_template_file``.
    """
    sections_cache: dict[Path, dict[str, str]] = {}

    def _resolve(relative: str) -> Path | None:
        candidate = config_dir / relative
        return candidate if candidate.exists() else None

    def _sections(path: Path, level: int) -> dict[str, str]:
        key = path.resolve()
        if key not in sections_cache:
            sections_cache[key] = _split_sections(
                path.read_text(encoding="utf-8"), header_level=level
            )
        return sections_cache[key]

    for model_cfg in config["models"].values():
        prompt_file = model_cfg.get("system_prompt_file")
        if not prompt_file:
            continue
        full_path = _resolve(prompt_file)
        if full_path is None:
            model_cfg["_system_prompt"] = _DEFAULT_SYSTEM_PROMPT
            continue
        sections = _sections(full_path, 2)
        if not sections:
            model_cfg["_system_prompt"] = full_path.read_text(
                encoding="utf-8"
            ).strip()
            continue
        provider_slug = str(model_cfg.get("provider", "")).strip().lower()
        model_cfg["_system_prompt"] = sections.get(
            provider_slug, _DEFAULT_SYSTEM_PROMPT
        )

    config["_task_templates"] = {}
    task_file = config_dir / "prompt-templates" / "task-prompts.md"
    if task_file.exists():
        config["_task_templates"] = _sections(task_file, 1)

    v_template_file = (
        (config.get("verification") or {}).get("settings", {}) or {}
    ).get("prompt_template_file")
    config["_verification_template"] = ""
    if v_template_file:
        v_path = _resolve(v_template_file)
        if v_path is not None:
            config["_verification_template"] = v_path.read_text(
                encoding="utf-8"
            ).strip()


def _split_sections(text: str, header_level: int) -> dict[str, str]:
    """Split markdown by ``#``-headers of exactly the given level, mapping
    slugified header text to section body. Content before the first header
    is preamble and discarded; deeper headers stay inside their section."""
    prefix = "#" * header_level + " "
    sections: dict[str, str] = {}
    current_slug: str | None = None
    current_lines: list[str] = []

    for line in text.splitlines():
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
