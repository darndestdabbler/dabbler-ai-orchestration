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
    from .pricing import unconfirmed_and_stale, validate_model_rates  # package context
    from .secret_resolver import resolve_secret
    from .cli_transport import validate_transport_timeouts
    from .verify_type import (
        PROFILE_SOURCE_PROJECT_FILE,
        VERIFY_TYPE_BY_PROFILE,
        derive_transport_profile,
    )
except ImportError:  # test context — this module is also imported bare
    from pricing import (  # type: ignore[import-not-found]
        unconfirmed_and_stale,
        validate_model_rates,
    )
    from secret_resolver import resolve_secret  # type: ignore[import-not-found]
    from cli_transport import (  # type: ignore[import-not-found]
        validate_transport_timeouts,
    )
    from verify_type import (  # type: ignore[import-not-found]
        PROFILE_SOURCE_PROJECT_FILE,
        VERIFY_TYPE_BY_PROFILE,
        derive_transport_profile,
    )

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


def validate_provider_api_keys(config: dict) -> None:
    """Raise unless this machine can dispatch to **some** enabled provider.

    **Called at DISPATCH, not at config load** (Set 111 S2, operator
    decision 2026-08-07). There are two clean populations of user, and a
    keyless machine is healthy in one of them:

    - **Copilot CLI** — a GitHub Copilot seat with *no provider API keys
      at all*; every call dispatches through the CLI, never
      ``providers.call_model``. This function is a no-op there.
    - **Direct APIs** — provider keys, no Copilot seat.

    So absence of keys is only ever a problem when something is actually
    attempting a **direct-API** dispatch. Making it a *load-time* error
    made every read-only consumer of the config — drift guards, guidance
    reports, registry checks that touch no provider at all — fail on a
    perfectly healthy Copilot seat, complaining about credentials nothing
    in that code path would have used.

    **Set 123 S2 — a keyless provider is DISABLED, not fatal.** This used
    to raise on the first enabled provider missing a key, which made the
    single-key ``DIRECT_API`` machine impossible to serve: that is the exact
    machine the operator's same-provider ruling exists for, and it died here
    (during ``_init()``) long before any precondition or verifier selection
    could act on it. A provider whose key is absent cannot be dispatched to,
    so the honest repair is to mark it disabled and say so, leaving the
    config's live provider set equal to what the machine can actually reach
    — which also stops model selection pinning a verifier the process could
    never call.

    What still raises is the case that is genuinely fatal: **no** enabled
    provider has a key, so a direct-API dispatch has nowhere to go. The
    message names every variable that was missing, because at that point all
    of them are actionable.
    """
    if (config.get("transport") or {}).get("profile") == "copilot-cli":
        return

    keyed: list[str] = []
    keyless: list[tuple[str, str]] = []
    for name, provider in (config.get("providers") or {}).items():
        if not provider.get("enabled", True):
            continue
        env_var = provider["api_key_env"]
        if resolve_secret(env_var):
            keyed.append(name)
        else:
            keyless.append((name, env_var))

    if not keyless:
        return

    if not keyed:
        details = "; ".join(
            f"Missing environment variable {env_var} for provider '{name}'"
            for name, env_var in keyless
        )
        raise EnvironmentError(
            f"{details}. No enabled provider has an API key, so a direct-API "
            "dispatch has nowhere to go. Set at least one with: export "
            f"{keyless[0][1]}=your-key-here"
        )

    for name, env_var in keyless:
        config["providers"][name]["enabled"] = False
        # Disabling the PROVIDER is not enough to remove it from selection:
        # ``models.pick_model`` consults each model's ``is_enabled`` and the
        # caller's ``exclude_providers``, and never looks at
        # ``providers.<name>.enabled`` at all. Leaving the models enabled
        # made the disabling cosmetic -- a keyless-but-PINNED verifier
        # (the shipped session-verification pin is OpenAI) would still be
        # selected and then die at dispatch on the missing key, even on a
        # machine that held a perfectly good cross-provider key elsewhere.
        # Disabling the models is what makes "removed from selection" true,
        # and pick_model already falls back correctly past a disabled pin,
        # tier assignment, or escalation target.
        for model_cfg in (config.get("models") or {}).values():
            if isinstance(model_cfg, dict) and model_cfg.get("provider") == name:
                model_cfg["is_enabled"] = False
    print(
        "[dabbler] NOTE: disabled provider(s) "
        + ", ".join(
            f"{name} (no {env_var})" for name, env_var in keyless
        )
        + "; dispatching with "
        + ", ".join(sorted(keyed))
        + ". A provider with no key cannot be called, so it is removed from "
        "selection rather than failing the whole run. Cross-provider "
        "verification needs a key for a provider OTHER than the "
        "orchestrator's; without one the verdict is recorded as "
        "same-provider.",
        file=sys.stderr,
    )


def load_config(path: str | None = None, *,
                require_api_keys: bool = False) -> dict:
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

    # Merge local-overrides.yaml if present (local > shared > default) BEFORE
    # any validation below runs. Session-verification finding (Set 078 S2):
    # validating against the pre-merge config meant a local override that
    # disables a provider (providers.<id>.enabled: false, an existing
    # supported override) was not respected by the API-key check, which ran
    # before the merge — the shared config's "enabled" stuck regardless of
    # what the operator's own machine actually needs. Every validation step
    # below must see the FINAL effective config, not the pre-override one.
    local_overrides_path = config_path.parent / "local-overrides.yaml"
    if local_overrides_path.exists():
        _apply_local_overrides(config, local_overrides_path)

    # Set 123 S1: transport.profile is DERIVED from the project's verify type,
    # never decided beside it. The old unconditional `setdefault("profile",
    # "api")` that used to sit here was a PARALLEL answer to the same question
    # project-verify-type.txt answers; the default still exists, but it is now
    # reached through resolution (verify_type.derive_transport_profile) rather
    # than independently of it, so the two cannot disagree. Runs AFTER the
    # local-overrides merge -- an explicitly configured seat profile is only
    # visible once merged -- and BEFORE every consumer below, including
    # validate_provider_api_keys, which branches on the profile.
    #
    # The anchor FOLLOWS THE CONFIG, not the process: the config file's own
    # directory is tried first and the working directory second, and the FIRST
    # anchor that lands in a project answers outright. A verify type describes
    # how a PROJECT is verified, so the project that owns the config being
    # loaded answers for it -- automation running from repo A while explicitly
    # loading repo B's config must dispatch B's calls by B's answer, and by
    # B's own configured default when B has not chosen yet. The cwd anchor is
    # what keeps a pip-installed consumer (whose bundled config belongs to no
    # repository) reading its own project file.
    config.setdefault("transport", {})
    profile_derivation = derive_transport_profile(
        config, anchors=(config_path.parent, None)
    )
    config["transport"]["profile"] = profile_derivation.profile

    # Validate API keys exist in environment (only for enabled providers,
    # and only when the caller is about to DISPATCH -- Set 111 S2). The
    # copilot-cli profile is exempt at any call site (Set 078 verification
    # finding): that profile's whole point is a seat with NO provider API
    # keys at all. Read-only consumers (drift guards, guidance reports,
    # registry checks) leave require_api_keys False and never complain
    # about credentials they would not have used.
    if require_api_keys:
        validate_provider_api_keys(config)

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
        # Set 109 S3: rates may be flat or a `pricing:` list of tiered /
        # effective-dated rows. Validated at LOAD so a malformed entry fails
        # at startup rather than resolving to zero mid-call.
        if isinstance(model_cfg, dict):
            validate_model_rates(model_name, model_cfg)

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

    # Validate transport.profile + transports.copilot-cli (Set 078).
    # Default profile "api" (absent block is fine); an unknown profile or a
    # copilot-cli profile missing its own config block fails loud rather
    # than silently falling back to the api path.
    _validate_transport(config, derivation=profile_derivation)

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


_VALID_TRANSPORT_PROFILES: frozenset[str] = frozenset({"api", "copilot-cli"})

# Required keys in transports.copilot-cli when transport.profile is set to
# copilot-cli. Validated as PRESENT, not deep-shape-checked here — the
# lockfile itself and ai_router.copilot_catalog.validate_catalog own the
# per-seat fail-closed checks (version drift, provenance, diversity, seat
# mismatch); this is only the config-load-time "did the operator wire the
# block at all" check.
_COPILOT_CLI_REQUIRED_KEYS: frozenset[str] = frozenset({"lockfile", "roles"})


def _validate_transport(config: dict, *, derivation=None) -> None:
    """Validate transport.profile + its matching transports.<profile> block.

    Default profile "api" requires no extra block (the existing dispatch
    path is unchanged). Selecting "copilot-cli" without a
    transports.copilot-cli block (or missing its required keys) fails loud
    at load time rather than silently falling back to "api" — a shop that
    opted into the seat profile and got the plain API path instead (which
    it may have no keys for) is a worse failure than refusing to load.

    Set 123 S1: *derivation* (a ``verify_type.ProfileDerivation``) says what
    decided the profile. When a project file did, every error below names
    that file — otherwise the operator is told to fix a ``transport.profile``
    they never wrote, in a config that is no longer the authority for it.
    """
    profile = (config.get("transport") or {}).get("profile", "api")
    origin = ""
    if derivation is not None and derivation.source == PROFILE_SOURCE_PROJECT_FILE:
        origin = (
            f" (derived from {derivation.project_file}, which is the project's "
            "verify type and outranks any configured transport.profile)"
        )
    if profile not in _VALID_TRANSPORT_PROFILES:
        raise ValueError(
            f"transport.profile must be one of "
            f"{sorted(_VALID_TRANSPORT_PROFILES)}, got {profile!r}{origin}"
        )
    if profile == "api":
        return

    transports = config.get("transports") or {}
    block = transports.get(profile)
    if not isinstance(block, dict):
        raise ValueError(
            f"transport.profile is {profile!r}{origin} but transports.{profile} "
            "is missing — add its config block (see router-config.yaml's "
            "transports.copilot-cli example) before selecting this profile."
        )
    missing = sorted(_COPILOT_CLI_REQUIRED_KEYS - set(block))
    if missing:
        raise ValueError(
            f"transports.{profile} is missing required key(s): {missing}"
        )
    # Set 111 S1: the optional timeouts block, validated at load so a
    # malformed ceiling fails at startup rather than mid-call.
    validate_transport_timeouts(block.get("timeouts"))


def _check_pricing_staleness(config: dict) -> None:
    """Print a warning to stderr when model prices have not been confirmed
    recently.

    Set 109 S3 moved the authority for this from one global
    ``metadata.pricing_reviewed`` date to a per-model ``confirmed_on`` stamp,
    because a single global date says "somebody reviewed something" and cannot
    say WHICH model's rate a human actually checked — and the rate that was
    wrong for months sat under a global date that looked fresh.

    ``metadata.pricing_reviewed`` is deliberately still read as a fallback.
    It was kept because the VS Code extension's Cost Dashboard rendered its
    own staleness banner from that field; Set 123 S3 deleted that dashboard
    along with every other webview, so the field's only remaining consumer is
    this fallback and the rollup below. Left in place rather than removed in
    the same breath as an unrelated deletion -- a config field with hand-
    maintained data is retired on purpose, by a set that owns the schema, not
    as a side effect. Set 119 S3 deleted ``pricing_proposal``, the
    CLI that used to maintain both fields, so both are now maintained by
    hand in ``router-config.yaml`` -- keep them in step when you edit a
    rate, or the rollup drifts away from the stamps it summarises.

    Controlled by, under the top-level ``metadata`` block:
        review_frequency_days: integer, default 30
        pricing_reviewed:      ISO date, the fallback rollup

    ONE warning line at most. Soft warning only; does not raise.
    """
    metadata = config.get("metadata", {}) or {}
    threshold_days = int(metadata.get("review_frequency_days", 30))
    never, stale = unconfirmed_and_stale(config)

    if never or stale:
        # Names, not just counts — a count tells an operator that something is
        # unconfirmed without telling them what to go and look at. Capped so
        # one line stays one line on a large registry.
        flagged = sorted(set(never) | set(stale))
        shown = ", ".join(flagged[:6])
        if len(flagged) > 6:
            shown += f", +{len(flagged) - 6} more"
        print(
            f"WARNING: {len(never)} model(s) have no confirmed_on stamp and "
            f"{len(stale)} are older than {threshold_days} days: {shown}. "
            "Check the provider's published pricing page and update the "
            "model's rate and confirmed_on stamp in router-config.yaml.",
            file=sys.stderr,
        )
        return

    reviewed_raw = metadata.get("pricing_reviewed")
    if not reviewed_raw:
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
    # Set 124 S2: ``transport.profile`` is NO LONGER an allowed local override.
    #
    # Set 110 S4 added it because router-config.yaml is package data and a
    # Copilot seat had nowhere else to say "I dispatch through the CLI". Set
    # 123 S1 then made project-verify-type.txt outrank it. Set 124 S1 settled
    # (operator ruling, 2026-08-12) that the project file is **machine/project**
    # state -- "this project, on THIS machine" -- and gitignored it.
    #
    # That collapsed the two into ONE scope: local-overrides.yaml is per-machine
    # and lives inside the checkout, so both files answered "what verifies this
    # project, on this machine" and only one of them was authoritative. Two
    # mechanisms for one fact is the defect class router-config.yaml itself
    # names as having bitten this repo three times, so the second one is gone.
    # `python -m ai_router.verify_type --set <VALUE>` is now the only way to say
    # it, and a stale key is REFUSED rather than ignored -- see the transport
    # branch in _apply_local_overrides for why silence would be worse.
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

        # --- transport (Set 110 S4; retired as an override by Set 124 S2) ---
        # No transport key is locally overridable any more. `transport.profile`
        # was the only one, and it now duplicates project-verify-type.txt's
        # scope exactly (see _LOCAL_OVERRIDE_ALLOWED).
        #
        # REFUSED rather than warned-and-ignored, decided by the standing
        # tiebreaks and journaled in this set's decisions.jsonl. The deciding
        # case is a Copilot seat with NO project file: ignoring the key would
        # silently fall its profile back to `api`, and validate_provider_api_keys
        # would then fail on a seat that has no provider keys BY DESIGN -- a
        # confusing credential error a long way from its cause. A refusal that
        # names the one replacement command is reversible in seconds; a silent
        # transport switch is a mis-dispatch.
        elif key == "transport" and isinstance(value, dict):
            for tk, tv in value.items():
                full_path = f"transport.{tk}"
                if full_path == "transport.profile":
                    raise ValueError(
                        "local-overrides.yaml: 'transport.profile' is no "
                        "longer a local override (Set 124 S2). What verifies "
                        "a project is machine/project state, and "
                        "project-verify-type.txt is the one place that "
                        "records it -- two mechanisms for one fact is the "
                        "defect this removes.\n"
                        "\n"
                        f"  Replace it: python -m ai_router.verify_type --set "
                        f"{VERIFY_TYPE_BY_PROFILE.get(tv, '<DIRECT_API|COPILOT_CLI>')}\n"
                        "  Then delete the 'transport:' block from "
                        "ai_router/local-overrides.yaml.\n"
                        "\n"
                        "`python -m ai_router.verify_type` (no flags) prints "
                        "what this project currently resolves to."
                    )
                raise ValueError(
                    f"local-overrides.yaml: '{full_path}' is not allowed "
                    "as a local override per Appendix B."
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
