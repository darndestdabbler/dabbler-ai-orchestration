"""Tests for ai_router.metrics._log_path resolution.

The 0.1.1 contract for ``_log_path`` is:

  1. ``AI_ROUTER_METRICS_PATH`` env var wins.
  2. Else, ``config["_metrics_base_dir"]`` decides — and that key is
     set by ``load_config`` ONLY when the router-config.yaml was
     resolved via workspace discovery. Explicit-path and
     ``AI_ROUTER_CONFIG``-overridden configs do NOT set
     ``_metrics_base_dir``, so they keep using the bundled default.
  3. Else, the package-bundled default beside ``metrics.py`` is used.

The two env-var semantics (config vs. metrics) are independent — an
``AI_ROUTER_CONFIG`` override does NOT auto-redirect metrics, matching
behavior in 0.1.0. The lower portion of this file integration-tests
that property end-to-end through a real ``load_config()`` call rather
than a hand-built config dict.
"""

import os
import textwrap
from pathlib import Path

import config as config_mod  # type: ignore[import-not-found]
import metrics as metrics_mod  # type: ignore[import-not-found]


# --- Direct _log_path() tests (lightweight; no load_config) ---------------


def test_log_path_uses_metrics_env_var_when_set(
    tmp_path: Path, monkeypatch
) -> None:
    target = tmp_path / "elsewhere" / "metrics.jsonl"
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(target))
    # Even with a workspace base dir set, the env var wins.
    config = {"_metrics_base_dir": str(tmp_path / "ai_router")}
    assert metrics_mod._log_path(config).resolve() == target.resolve()


def test_log_path_uses_metrics_base_dir_when_set(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    workspace_dir = tmp_path / "workspace" / "ai_router"
    workspace_dir.mkdir(parents=True)
    config = {"_metrics_base_dir": str(workspace_dir)}
    expected = workspace_dir / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


def test_log_path_honors_metrics_log_filename_override(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    workspace_dir = tmp_path / "workspace" / "ai_router"
    workspace_dir.mkdir(parents=True)
    config = {
        "_metrics_base_dir": str(workspace_dir),
        "metrics": {"log_filename": "custom-name.jsonl"},
    }
    expected = workspace_dir / "custom-name.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


def test_log_path_falls_back_to_bundled_default_without_base_dir(
    monkeypatch,
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    # No _metrics_base_dir on the dict — even if _config_path is
    # present (used for diagnostics), it must not auto-redirect metrics.
    config = {"_config_path": "/some/non-workspace/config.yaml"}
    expected = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


# --- Integration tests through load_config() ------------------------------


def _write_minimal_yaml(target: Path) -> Path:
    """Write a minimal router-config.yaml that load_config() accepts.

    The fixture is intentionally tiny — empty providers/models/routing
    dicts so load_config's API-key + tier validation loops have nothing
    to iterate. Other sections (verification, prompts) default cleanly.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        textwrap.dedent("""\
            providers: {}
            models: {}
            routing:
              tier_assignments: {}
            metadata:
              pricing_reviewed: '2026-05-04'
              review_frequency_days: 365
        """),
        encoding="utf-8",
    )
    return target


def test_load_config_sets_metrics_base_dir_only_when_workspace_resolved(
    tmp_path: Path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspace"
    config_path = _write_minimal_yaml(
        workspace_root / "ai_router" / "router-config.yaml"
    )
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    monkeypatch.chdir(workspace_root)

    config = config_mod.load_config()
    assert config.get("_config_source") == config_mod.CONFIG_SOURCE_WORKSPACE
    assert config.get("_metrics_base_dir") is not None
    assert (
        Path(config["_metrics_base_dir"]).resolve()
        == config_path.parent.resolve()
    )

    expected_log = config_path.parent / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected_log.resolve()


def test_load_config_does_not_set_metrics_base_dir_for_env_override(
    tmp_path: Path, monkeypatch
) -> None:
    # Workspace fixture exists at a discoverable location, BUT the env
    # var points at a different yaml. Per the spec, the env-var
    # override must NOT auto-redirect metrics — they stay on the
    # bundled default.
    workspace_root = tmp_path / "workspace"
    _write_minimal_yaml(
        workspace_root / "ai_router" / "router-config.yaml"
    )
    env_config = _write_minimal_yaml(tmp_path / "elsewhere" / "config.yaml")

    monkeypatch.setenv("AI_ROUTER_CONFIG", str(env_config))
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    monkeypatch.chdir(workspace_root)

    config = config_mod.load_config()
    assert config.get("_config_source") == config_mod.CONFIG_SOURCE_ENV
    assert "_metrics_base_dir" not in config

    expected_log = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected_log.resolve()


def test_load_config_does_not_set_metrics_base_dir_for_explicit_path(
    tmp_path: Path, monkeypatch
) -> None:
    explicit_config = _write_minimal_yaml(
        tmp_path / "explicit" / "config.yaml"
    )
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    monkeypatch.chdir(tmp_path)

    config = config_mod.load_config(str(explicit_config))
    assert config.get("_config_source") == config_mod.CONFIG_SOURCE_EXPLICIT
    assert "_metrics_base_dir" not in config

    expected_log = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected_log.resolve()


def test_load_config_does_not_set_metrics_base_dir_for_bundled_default(
    tmp_path: Path, monkeypatch
) -> None:
    # Force the workspace branch to miss so load_config falls through
    # to the bundled default.
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    monkeypatch.setattr(
        config_mod, "_find_workspace_config", lambda start=None: None
    )
    monkeypatch.chdir(tmp_path)

    config = config_mod.load_config()
    assert (
        config.get("_config_source")
        == config_mod.CONFIG_SOURCE_BUNDLED_DEFAULT
    )
    assert "_metrics_base_dir" not in config

    expected_log = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected_log.resolve()
