"""Load and validate router-config.yaml; resolve transport preference and
effective generation params.

Structural validation runs through the JSON schema at
``schemas/router-config.schema.json``. Semantic rules a schema cannot express
(cross-references between blocks) run here, all at load time so a bad config
fails at startup rather than mid-call. A role's preference order is
deliberately not cross-referenced: it is ordering only, so a name that matches
no model is a stale line rather than an error.

Configuration resolves in three layers, and each one owns a different kind
of fact:

1. The bundled ``router-config.yaml`` is package data and therefore the
   *published* default: providers, models, roles and transports. It must stay
   correct for a fresh install that has provider API keys and no seat.
2. ``dabbler.yaml`` at the repository root is **tracked**, and carries what
   the repository owns — its suites, its selection rules, how it publishes,
   which of its paths are sensitive. CI reads these and so does the next
   machine, which is precisely why they cannot live in a gitignored file.
3. ``local-overrides.yaml`` is machine facts only, deep-merged last and never
   published. It is refused a key the repository owns, because an overlay
   nobody can see must not be able to replace a suite command that the run of
   record will then attribute to the repository.

Config is the only layer that is client-independent, model-independent and
transport-independent — an instruction file cannot carry a machine fact
because which instruction files load at all is a property of the client, and
an env var reaches only processes started after it was written.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Optional

import jsonschema
import yaml

from .journal import repo_root_for
from .transports.copilot import validate_transport_timeouts

_THIS_DIR = Path(__file__).parent
_SCHEMA_PATH = _THIS_DIR / "schemas" / "router-config.schema.json"
_PROJECT_SCHEMA_PATH = _THIS_DIR / "schemas" / "dabbler.schema.json"

LOCAL_OVERRIDES_FILENAME = "local-overrides.yaml"
PROJECT_CONFIG_FILENAME = "dabbler.yaml"

#: The blocks a repository owns. They are declared in the tracked
#: ``dabbler.yaml`` and refused in the machine-local overlay: the split is
#: what keeps a gitignored file from rewriting a fact the record attributes
#: to the repository.
REPOSITORY_OWNED_BLOCKS = frozenset({"testing", "packaging", "paths"})

TRANSPORT_API = "api"
TRANSPORT_COPILOT_CLI = "copilot-cli"
# Scripted responses from disk: no network, no credentials, no spend. It
# answers from a directory the operator names, so it cannot be reached by
# default or by accident.
TRANSPORT_OFFLINE = "offline"
VALID_TRANSPORTS = (TRANSPORT_API, TRANSPORT_COPILOT_CLI, TRANSPORT_OFFLINE)

TRANSPORT_ENV_VAR = "DABBLER_TRANSPORT"

#: The backstop every review loop shares when the config names no bound.
DEFAULT_VERIFICATION_ROUNDS = 3

#: The backstop for the test loop. Higher than the review bound because the
#: rounds are different things: a review round buys a vendor's opinion, a
#: test round runs a suite the framework already has. What both bounds stop
#: is an unattended loop that never converges.
DEFAULT_TEST_ROUNDS = 7

CRITIQUE_PIPELINE_DEFAULT = "off"
CRITIQUE_PIPELINE_SHADOW = "shadow"
CRITIQUE_PIPELINE_ENFORCE = "enforce"
# The set that implements enforcement. Named in the refusal so an operator
# who sets 'enforce' early learns what they are waiting for.
CRITIQUE_ENFORCE_SET = "145-lite-enforcement-and-projection"

# Keys required in transports.copilot-cli when that transport is selected.
# Roles are not among them: selection is by role on both transports, so the
# declaration is top-level and a seat block does not own it.
_COPILOT_CLI_REQUIRED_KEYS = frozenset({"lockfile"})

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


def _resolve_config_sources(
    path: str | None = None, project_dir: str | None = None,
) -> tuple[Path, Optional[Path], Optional[Path]]:
    """``(base config, tracked project config, machine overlay)``, the last
    two ``None`` when they do not apply.

    An explicitly-named config — by argument or by ``AI_ROUTER_CONFIG`` — is
    the whole answer and takes neither layer: a caller that named a file
    means that file. The layers apply only over the bundled default, which
    is the one config nobody on this machine chose. This is also why
    ``AI_ROUTER_CONFIG`` is not the way a foreign repository declares
    itself — pointing it at a hand-written file forks the provider list and
    the model registry in order to say how to run a test suite, which is the
    drift the layering exists to prevent. ``dabbler.yaml`` is that way.

    ``project_dir`` names the project both layers belong to. A caller that
    was handed a workspace passes it, because they belong to the workspace
    under discussion rather than to whatever directory the process happens
    to be sitting in.
    """
    base = _resolve_config_path(path)
    if path is not None or os.environ.get("AI_ROUTER_CONFIG"):
        return base, None, None
    return (
        base,
        project_config_path(project_dir),
        local_overrides_path(project_dir),
    )


# Resolved once per working directory: the overlay's location is a property
# of the project, and re-shelling out to git on every config load is not.
_project_root_cache: dict[str, Optional[str]] = {}


def project_root(project_dir: str | None = None) -> Optional[str]:
    """The git toplevel of ``project_dir``, or of the working directory when
    none is named, or ``None`` outside a repository. The router already
    discovers the project this way for evidence and gates; a second notion
    of "the project" would be a second thing to disagree."""
    start = str(Path(project_dir or Path.cwd()).resolve())
    if start not in _project_root_cache:
        _project_root_cache[start] = repo_root_for(start)
    return _project_root_cache[start]


def local_overrides_path(project_dir: str | None = None) -> Optional[Path]:
    """The machine-local overlay, when the project has one."""
    return _root_relative_file(project_dir, LOCAL_OVERRIDES_FILENAME)


def project_config_path(project_dir: str | None = None) -> Optional[Path]:
    """The repository's own tracked config, when it has one."""
    return _root_relative_file(project_dir, PROJECT_CONFIG_FILENAME)


def _root_relative_file(project_dir: str | None, filename: str):
    root = project_root(project_dir)
    if root is None:
        return None
    candidate = Path(root) / filename
    return candidate if candidate.is_file() else None


_overlay_schema_cache: dict | None = None
_project_schema_cache: dict | None = None


def _overlay_schema() -> dict:
    """The vocabulary a machine-local overlay may use: the router-config
    schema with the repository-owned blocks removed.

    Removed rather than merely checked, so "the overlay may not say this"
    is one statement in one place. Anything the schema still declares is a
    machine fact and stays overridable, including the provider key names
    that make a checkout its own cost center.
    """
    global _overlay_schema_cache
    if _overlay_schema_cache is None:
        schema = copy.deepcopy(_load_schema())
        for block in REPOSITORY_OWNED_BLOCKS:
            schema.get("properties", {}).pop(block, None)
        _overlay_schema_cache = schema
    return _overlay_schema_cache


def _project_schema() -> dict:
    global _project_schema_cache
    if _project_schema_cache is None:
        _project_schema_cache = json.loads(
            _PROJECT_SCHEMA_PATH.read_text(encoding="utf-8")
        )
    return _project_schema_cache


def _reject_unknown_overlay_keys(
    overlay: dict, schema: dict, source: Path, trail: tuple = ()
) -> None:
    """Refuse an overlay key the schema declares no vocabulary for.

    A dropped override is the failure this file exists to prevent: the
    operator states a machine fact, the router ignores it, and the symptom
    surfaces somewhere else entirely. Where the schema names its properties,
    that list is the vocabulary and a key outside it is refused; where it
    declares an open object — a provider or model name, or a block the
    schema deliberately leaves unstructured — anything goes and recursion
    stops. The seat transport block therefore has to be *declared* in the
    schema rather than left opaque, because it is the block a seat-only
    machine most needs to override and a typo there would be silent.
    """
    properties = schema.get("properties")
    additional = schema.get("additionalProperties")
    for key, value in overlay.items():
        if properties is not None and key in properties:
            subschema = properties[key]
        elif isinstance(additional, dict):
            subschema = additional
        elif properties is not None:
            dotted = ".".join(trail + (str(key),))
            if not trail and key in REPOSITORY_OWNED_BLOCKS:
                raise ValueError(
                    f"{source} sets {dotted!r}, which the repository owns. "
                    f"Declare it in {PROJECT_CONFIG_FILENAME} at the "
                    "repository root, where it is tracked. A suite command "
                    "or a packaging feed coming from a gitignored file "
                    "would be attributed by the run of record to a "
                    "repository that never declared it."
                )
            raise ValueError(
                f"{source} sets unknown key {dotted!r}: "
                "router-config.schema.json declares no such setting. An "
                "override the router would silently drop is refused instead."
            )
        else:
            continue
        if isinstance(value, dict):
            _reject_unknown_overlay_keys(
                value, subschema, source, trail + (str(key),)
            )


def load_config(path: str | None = None, project_dir: str | None = None) -> dict:
    config_path, project_path, overrides_path = _resolve_config_sources(
        path, project_dir
    )
    if not config_path.exists():
        raise FileNotFoundError(
            f"Router config not found: {config_path}. Create it from the "
            "bundled ai_router/router-config.yaml."
        )

    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Tracked first, machine-local second: a machine may disagree with the
    # distribution, and never with the repository.
    if project_path is not None:
        config = _apply_project_config(config, project_path)
    if overrides_path is not None:
        config = _apply_local_overrides(config, overrides_path)

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

    _validate_copilot_block(config)
    _apply_run_core_defaults(config)
    _resolve_critique_block(config)
    _load_prompt_templates(config, config_path.parent)

    config["_config_path"] = str(config_path.resolve())
    config["_project_config_path"] = (
        str(project_path.resolve()) if project_path is not None else None
    )
    config["_local_overrides_path"] = (
        str(overrides_path.resolve()) if overrides_path is not None else None
    )
    return config


def _resolve_critique_block(config: dict) -> None:
    """Resolve the critique pipeline's authority, refusing a mode no code honours.

    `enforce` is declared in the schema so the vocabulary lives in one
    place, and refused here because nothing yet reads critique artifacts to
    decide anything. Downgrading it silently to `shadow` would leave an
    operator believing their work is being gated when it is not, which is
    the failure this refusal exists to prevent.
    """
    block = config.get("critique") or {}
    mode = block.get("pipeline", CRITIQUE_PIPELINE_DEFAULT)
    if mode == CRITIQUE_PIPELINE_ENFORCE:
        raise ValueError(
            f"critique.pipeline: {CRITIQUE_PIPELINE_ENFORCE!r} is refused at "
            f"load. Enforcement arrives with set {CRITIQUE_ENFORCE_SET}; "
            f"until then the accepted values are "
            f"{CRITIQUE_PIPELINE_DEFAULT!r} (the default, which writes "
            f"nothing) and {CRITIQUE_PIPELINE_SHADOW!r}, which records "
            "critique artifacts without letting them decide anything."
        )
    config["critique"] = {**block, "pipeline": mode}


def _apply_project_config(config: dict, project_path: Path) -> dict:
    """Merge the repository's own tracked config over the packaged default.

    The file is validated against its own schema rather than against the
    router's, because the two declare different things: this one is a short,
    closed list of what a repository owns, and a key outside that list is a
    repository trying to fork a distribution fact. ``schema_version`` is
    stripped after validation — it describes the file, not the router.
    """
    with open(project_path, encoding="utf-8") as f:
        declared = yaml.safe_load(f)
    if declared is None:
        raise ValueError(
            f"{project_path} is empty. A repository with nothing to declare "
            f"has no {PROJECT_CONFIG_FILENAME}; an empty one cannot state "
            "its schema_version and so cannot be read at all."
        )
    if not isinstance(declared, dict):
        raise ValueError(
            f"{project_path} must be a mapping of config blocks, got "
            f"{type(declared).__name__}"
        )
    try:
        jsonschema.validate(declared, _project_schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise ValueError(
            f"{project_path} failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc
    blocks = {k: v for k, v in declared.items() if k != "schema_version"}
    return _deep_merge(config, blocks)


def _apply_local_overrides(config: dict, overrides_path: Path) -> dict:
    """Deep-merge the machine-local overlay on last.

    The overlay is partial — only the keys it changes — and the merged
    result goes through the same schema and semantic checks as any config,
    so an overlay cannot produce a config the router would have refused.
    It is refused the blocks the repository owns before anything is merged:
    it wins over the distribution, never over ``dabbler.yaml``.
    """
    with open(overrides_path, encoding="utf-8") as f:
        overrides = yaml.safe_load(f)
    if overrides is None:
        return config
    if not isinstance(overrides, dict):
        raise ValueError(
            f"{overrides_path} must be a mapping of config keys to override, "
            f"got {type(overrides).__name__}"
        )
    _reject_unknown_overlay_keys(overrides, _overlay_schema(), overrides_path)
    return _deep_merge(config, overrides)


RUN_CORE_DEFAULTS = {
    "run_policy": {
        "default": "fast",
        "verification_rounds": 3,
        "diff_limit_lines": 1500,
        "check_timeout_seconds": 1800,
        "budgets": {
            # Null, not a figure: dollars are not computed on either
            # transport, so a dollar ceiling could only ever compare against
            # zero and would read as an assurance nothing enforces. The knob
            # survives for a deployment that reintroduces pricing; the
            # dispatch ceiling below is what actually bounds spend.
            "model_usd": None,
            "model_dispatches": 3,
            "elapsed_minutes": 120,
        },
    },
    # A repository fact, so it is declared in dabbler.yaml and defaulted
    # here rather than sitting in run_policy where the machine-local overlay
    # could have quietly emptied it.
    "paths": {"sensitive_paths": []},
    "git": {
        "push_on_finish": False,
        "worktree_per_run": False,
        "remote": "origin",
    },
    "explorer": {"stale_after_minutes": 5},
    "worktree": {"root": None, "init": []},
}


def _apply_run_core_defaults(config: dict) -> None:
    """Fill the run-core blocks so every reader sees the same shape.

    An existing repository needs no new configuration for ``fast``: an
    absent block is the documented default, not an unconfigured feature.
    The schema has already refused unknown keys and out-of-range limits, so
    the only rule left here is the one a range check cannot express — a null
    dollar ceiling disables the dollar ceiling and nothing else.
    """
    for block, defaults in RUN_CORE_DEFAULTS.items():
        merged = _deep_merge(copy.deepcopy(defaults), config.get(block) or {})
        config[block] = merged

    budgets = config["run_policy"]["budgets"]
    if budgets.get("model_dispatches") is None:
        raise ValueError(
            "run_policy.budgets.model_dispatches has no 'unlimited' value: "
            "a dispatch ceiling is what bounds framework model calls, "
            "because no transport reports a dollar figure to cap."
        )


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


def _round_cap(config: dict, key: str, default: int) -> int:
    """A loop bound from ``verification.settings``, or the shipped default.

    A missing, unparseable or non-positive setting falls back to the default
    rather than to no cap — a bound that a malformed config can switch off
    is not a bound.
    """
    settings = (config.get("verification") or {}).get("settings") or {}
    try:
        cap = int(settings.get(key, default))
    except (TypeError, ValueError):
        return default
    return cap if cap >= 1 else default


def verification_round_cap(config: dict) -> int:
    """How many review rounds any loop may open before it must terminate.

    One resolver for every loop that calls a vendor per round, because a cap
    read through two code paths is a cap two loops eventually disagree
    about. The closed severity vocabulary is the primary control and this is
    the backstop: an unattended loop that never converges still stops
    calling vendors.
    """
    return _round_cap(config, "max_rounds", DEFAULT_VERIFICATION_ROUNDS)


def run_round_cap(config: dict) -> int:
    """How many times the framework runs the authored tests before the loop
    must terminate.

    Separate from the review bound because the two loops meter different
    things — a review round buys a vendor's opinion and a test round runs a
    suite — and one number serving both would tune each against the other's
    cost.

    Named for the runs it counts rather than for the phase: a
    ``test_``-prefixed module attribute is collected by pytest wherever it is
    imported, and a bound that reports itself as a failing test is worse than
    a clumsy name.
    """
    return _round_cap(config, "max_test_rounds", DEFAULT_TEST_ROUNDS)


def resolve_transport(config: dict, cli_flag: str | None = None) -> str:
    """The effective transport for routine dispatch.

    Precedence: CLI flag > ``DABBLER_TRANSPORT`` env var (the operator's
    standing preference) > ``transport.profile`` in the loaded config >
    default ``api``. The config value may come from the bundled
    ``router-config.yaml`` or from a project-local ``local-overrides.yaml``
    merged over it — the overlay is a config source, not a precedence tier,
    so nothing above it changes its answer. An unknown value fails loud at
    whichever level supplied it. This selects the transport for routine
    dispatch; verifier selection may still use the other transport when
    provider independence requires it.
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
