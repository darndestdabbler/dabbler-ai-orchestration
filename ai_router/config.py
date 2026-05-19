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

try:
    from .secret_resolver import resolve_secret  # package context
except ImportError:
    from secret_resolver import resolve_secret  # type: ignore[import-not-found]  # test context

# Default config location is router-config.yaml in the same directory as
# this file. Keeps the default working regardless of where Python is
# invoked from.
_THIS_DIR = Path(__file__).parent

# Workspace-relative config / metrics discovery. The walk-up looks for
# this exact relative path under each ancestor of cwd, so a workspace
# that checks in `ai_router/router-config.yaml` is auto-discovered
# without operators having to set AI_ROUTER_CONFIG. The metrics file is
# resolved to the same directory as the discovered config.
_WORKSPACE_CONFIG_RELPATH = Path("ai_router") / "router-config.yaml"


def _find_workspace_config(start: Path | None = None) -> Path | None:
    """Walk up from *start* (default: cwd) looking for an
    ``ai_router/router-config.yaml`` checked into a workspace.

    Returns the first hit (closest ancestor wins), or ``None`` if no
    ancestor contains the file. Stops at the filesystem root without
    erroring. Permission-denied or other OS errors during the walk are
    treated as a miss for that ancestor and the walk continues —
    operators running tools from unusual mountpoints should not crash.
    """
    try:
        cur = (Path(start) if start is not None else Path.cwd()).resolve()
    except OSError:
        return None

    seen: set[Path] = set()
    while cur not in seen:
        seen.add(cur)
        candidate = cur / _WORKSPACE_CONFIG_RELPATH
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            pass
        parent = cur.parent
        if parent == cur:
            break
        cur = parent
    return None


CONFIG_SOURCE_EXPLICIT = "explicit"
CONFIG_SOURCE_ENV = "env"
CONFIG_SOURCE_WORKSPACE = "workspace"
CONFIG_SOURCE_BUNDLED_DEFAULT = "bundled-default"


def _resolve_config_path_and_source(
    path: str | None = None,
) -> tuple[str, str]:
    """Return ``(resolved_path, source)`` for the same input ``load_config``
    would use.

    Resolution order (highest priority first):
      1. Explicit ``path`` argument                → ``"explicit"``
      2. ``AI_ROUTER_CONFIG`` env var              → ``"env"``
      3. Workspace-relative ``_find_workspace_config()`` → ``"workspace"``
      4. Bundled default at ``_THIS_DIR / "router-config.yaml"``
                                                   → ``"bundled-default"``

    The source tag is consumed by ``load_config`` to decide whether
    metrics should auto-co-locate next to the config file. Per the
    Set 012 Session 1 spec, that auto-co-location is gated to
    workspace-discovery only — explicit-path and env-var overrides keep
    the existing bundled-default metrics location unless
    ``AI_ROUTER_METRICS_PATH`` is also set. This preserves the
    independence of the two env vars.
    """
    if path is not None:
        return path, CONFIG_SOURCE_EXPLICIT
    env_override = os.environ.get("AI_ROUTER_CONFIG")
    if env_override:
        return env_override, CONFIG_SOURCE_ENV
    workspace = _find_workspace_config()
    if workspace is not None:
        return str(workspace), CONFIG_SOURCE_WORKSPACE
    return str(_THIS_DIR / "router-config.yaml"), CONFIG_SOURCE_BUNDLED_DEFAULT


def _resolve_config_path(path: str | None = None) -> str:
    """Backward-compatible thin wrapper returning just the resolved
    path. Prefer :func:`_resolve_config_path_and_source` when the
    caller needs to know how the path was resolved.
    """
    resolved, _ = _resolve_config_path_and_source(path)
    return resolved


def load_config(path: str | None = None) -> dict:
    path, config_source = _resolve_config_path_and_source(path)
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Router config not found: {path}\n"
            f"Create it from the template in the AI Router specification."
        )

    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Apply defaults for new Set-026 provider fields (display_label, enabled)
    for prov_name, prov_cfg in config["providers"].items():
        prov_cfg.setdefault("display_label", prov_name.title())
        prov_cfg.setdefault("enabled", True)

    # Apply default for routing.outsourcing_mode
    config.setdefault("routing", {})
    config["routing"].setdefault("outsourcing_mode", "whenever-helpful")

    # Validate API keys exist in environment (only for enabled providers)
    for name, provider in config["providers"].items():
        if not provider.get("enabled", True):
            continue
        env_var = provider["api_key_env"]
        if not resolve_secret(env_var):
            raise EnvironmentError(
                f"Missing environment variable {env_var} "
                f"for provider '{name}'. "
                f"Set it with: export {env_var}=your-key-here"
            )

    # Validate model references resolve against the providers block
    provider_names = set(config["providers"])
    for model_name, model_cfg in config["models"].items():
        model_provider = model_cfg.get("provider")
        if model_provider and model_provider not in provider_names:
            raise ValueError(
                f"Model '{model_name}' references unknown provider "
                f"'{model_provider}'. "
                f"Available providers: {sorted(provider_names)}"
            )

    # Validate tier_assignments reference known models
    for tier, model_name in config["routing"]["tier_assignments"].items():
        if model_name not in config["models"]:
            raise ValueError(
                f"Tier {tier} references unknown model '{model_name}'. "
                f"Available: {list(config['models'].keys())}"
            )

    # Validate delegation.decision_consensus sub-block (Set 031).
    # Default-opt-out: absent block is fine; present block must satisfy
    # the V1 invariants. Unknown sub-keys are tolerated (forward-compat
    # for V1.5/V2 additions); only known-bad values are rejected.
    _validate_decision_consensus(config)

    # Merge local-overrides.yaml if present (local > shared > default)
    local_overrides_path = config_path.parent / "local-overrides.yaml"
    if local_overrides_path.exists():
        _apply_local_overrides(config, local_overrides_path)

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

    # Stash the resolved config path (always — useful for diagnostics)
    # and a separate metrics-base-dir hint that is set ONLY when the
    # workspace-discovery branch resolved the config. The metrics
    # co-location is intentionally NOT applied to env-var or
    # explicit-path overrides: those preserve the 0.1.0 contract that
    # the AI_ROUTER_CONFIG and AI_ROUTER_METRICS_PATH env vars are
    # independent. Operators who want metrics next to a non-workspace
    # config still set AI_ROUTER_METRICS_PATH explicitly.
    config["_config_path"] = str(config_path.resolve())
    config["_config_source"] = config_source
    if config_source == CONFIG_SOURCE_WORKSPACE:
        config["_metrics_base_dir"] = str(config_path.resolve().parent)

    return config


# V1 category whitelist for delegation.decision_consensus.categories.
# Operators can opt any subset of these in via router-config.yaml; the
# default in the shipped YAML is the four "mechanical" ones. Broader
# slots (testing-strategy, api-surface, design, architecture) are
# accepted at load time so consumer repos can opt in without a schema
# bump. Update this list deliberately — adding a slug here is a public
# API change.
_DECISION_CONSENSUS_KNOWN_CATEGORIES: frozenset[str] = frozenset({
    "refactor-placement",
    "file-layout",
    "scoping",
    "spec-clarification",
    "testing-strategy",
    "api-surface",
    "design",
    "architecture",
})

_DECISION_CONSENSUS_UNRESOLVED_ACTIONS: frozenset[str] = frozenset({
    "ask_user",
    "proceed_with_orchestrator_judgment",
})


def _validate_decision_consensus(config: dict) -> None:
    """Validate the optional delegation.decision_consensus sub-block.

    Absent block is fine (default opt-out). Present block must satisfy:
      - enabled is bool
      - engines is a list of "provider:model" strings where model resolves
        in config['models'] AND the named provider matches that model's
        configured provider
      - categories is a list of recognized slugs (see
        _DECISION_CONSENSUS_KNOWN_CATEGORIES)
      - unresolved_action is one of _DECISION_CONSENSUS_UNRESOLVED_ACTIONS
      - journal_path is a string or None
      - journal_full_payloads_dir is a string or None

    Unknown sub-keys are tolerated (forward-compat for V1.5/V2 additions).
    """
    delegation = config.get("delegation") or {}
    block = delegation.get("decision_consensus")
    if block is None:
        return
    if not isinstance(block, dict):
        raise ValueError(
            "delegation.decision_consensus must be a mapping, "
            f"got {type(block).__name__}"
        )

    enabled = block.get("enabled", False)
    if not isinstance(enabled, bool):
        raise ValueError(
            "delegation.decision_consensus.enabled must be a boolean, "
            f"got {type(enabled).__name__}"
        )

    engines = block.get("engines")
    if engines is not None:
        if not isinstance(engines, list) or not all(
            isinstance(e, str) for e in engines
        ):
            raise ValueError(
                "delegation.decision_consensus.engines must be a list of "
                "'provider:model' strings"
            )
        for entry in engines:
            if ":" not in entry:
                raise ValueError(
                    f"delegation.decision_consensus.engines entry "
                    f"'{entry}' must be 'provider:model' (colon-separated)"
                )
            provider_slug, _, model_name = entry.partition(":")
            provider_slug = provider_slug.strip()
            model_name = model_name.strip()
            model_cfg = config.get("models", {}).get(model_name)
            if model_cfg is None:
                raise ValueError(
                    f"delegation.decision_consensus.engines references "
                    f"unknown model '{model_name}' "
                    f"(available: {sorted(config.get('models', {}))})"
                )
            model_provider = str(model_cfg.get("provider", "")).strip()
            if not model_provider:
                raise ValueError(
                    f"delegation.decision_consensus.engines entry "
                    f"'{entry}' references model '{model_name}' which "
                    f"is missing a 'provider' key — the orchestrator "
                    f"cannot route to a provider-less model"
                )
            if model_provider != provider_slug:
                raise ValueError(
                    f"delegation.decision_consensus.engines entry "
                    f"'{entry}' provider mismatch: model '{model_name}' "
                    f"is registered under provider '{model_provider}'"
                )

    categories = block.get("categories")
    if categories is not None:
        if not isinstance(categories, list) or not all(
            isinstance(c, str) for c in categories
        ):
            raise ValueError(
                "delegation.decision_consensus.categories must be a list "
                "of strings"
            )
        unknown = [
            c for c in categories
            if c not in _DECISION_CONSENSUS_KNOWN_CATEGORIES
        ]
        if unknown:
            raise ValueError(
                f"delegation.decision_consensus.categories has unknown "
                f"slugs: {unknown}. "
                f"Known: {sorted(_DECISION_CONSENSUS_KNOWN_CATEGORIES)}"
            )

    action = block.get("unresolved_action", "ask_user")
    if action not in _DECISION_CONSENSUS_UNRESOLVED_ACTIONS:
        raise ValueError(
            f"delegation.decision_consensus.unresolved_action must be one "
            f"of {sorted(_DECISION_CONSENSUS_UNRESOLVED_ACTIONS)}, "
            f"got {action!r}"
        )

    for path_field in ("journal_path", "journal_full_payloads_dir"):
        value = block.get(path_field, None)
        if value is not None and not isinstance(value, str):
            raise ValueError(
                f"delegation.decision_consensus.{path_field} must be a "
                f"string or null, got {type(value).__name__}"
            )


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


# Paths that local-overrides.yaml is allowed to override per Set 025 Appendix B.
# Paths NOT in this set are rejected with a clear error.
_LOCAL_OVERRIDE_ALLOWED: frozenset[str] = frozenset({
    "routing.outsourcing_mode",
    # Per-provider fields — expressed as "providers.<id>.<field>"
    # but validated dynamically by _apply_local_overrides.
    # Also allow local-only sections entirely:
    "notifications",
    "decision_review",
})

# Provider-level fields allowed to be overridden in local-overrides.yaml
_PROVIDER_LOCAL_ALLOWED: frozenset[str] = frozenset({"display_label", "enabled"})


def _apply_local_overrides(config: dict, path: Path) -> None:
    """Merge local-overrides.yaml into *config* per Appendix B precedence rules.

    Rules:
      - Local values win over shared values.
      - Only paths listed in ``_LOCAL_OVERRIDE_ALLOWED`` (or provider-level
        fields in ``_PROVIDER_LOCAL_ALLOWED``) may be overridden; others raise
        ``ValueError``.
      - New providers or models defined solely in local-overrides are rejected.
      - Unknown top-level keys produce a warning and are ignored.
    """
    with open(path) as fh:
        overrides = yaml.safe_load(fh) or {}

    existing_providers = set(config.get("providers", {}))
    existing_models = set(config.get("models", {}))

    for key, value in overrides.items():
        # --- routing ---
        if key == "routing" and isinstance(value, dict):
            for rk, rv in value.items():
                full_path = f"routing.{rk}"
                if full_path not in _LOCAL_OVERRIDE_ALLOWED:
                    raise ValueError(
                        f"local-overrides.yaml: '{full_path}' is not allowed "
                        "as a local override per Appendix B."
                    )
                config["routing"][rk] = rv

        # --- providers ---
        elif key == "providers" and isinstance(value, dict):
            for prov_id, prov_overrides in value.items():
                if prov_id not in existing_providers:
                    raise ValueError(
                        f"local-overrides.yaml: provider '{prov_id}' does not "
                        "exist in router-config.yaml. Local overrides cannot "
                        "add new providers."
                    )
                if not isinstance(prov_overrides, dict):
                    continue
                for field, fval in prov_overrides.items():
                    if field not in _PROVIDER_LOCAL_ALLOWED:
                        raise ValueError(
                            f"local-overrides.yaml: providers.{prov_id}.{field} "
                            "is not allowed as a local override per Appendix B."
                        )
                    config["providers"][prov_id][field] = fval

        # --- models (reject new entries) ---
        elif key == "models" and isinstance(value, dict):
            for model_id in value:
                if model_id not in existing_models:
                    raise ValueError(
                        f"local-overrides.yaml: model '{model_id}' does not "
                        "exist in router-config.yaml. Local overrides cannot "
                        "add new models."
                    )
            # (Model-field overrides not currently in the allowed set; skip silently
            # with a warning rather than raising, to be forward-compatible.)
            print(
                "WARNING: local-overrides.yaml 'models' section — model-field "
                "overrides are not in the Appendix B allowed set; ignored.",
                file=sys.stderr,
            )

        # --- local-only sections (notifications, decision_review) ---
        elif key in ("notifications", "decision_review"):
            config[key] = value

        # --- unknown keys ---
        else:
            print(
                f"WARNING: local-overrides.yaml: unknown key '{key}' — ignored.",
                file=sys.stderr,
            )


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
