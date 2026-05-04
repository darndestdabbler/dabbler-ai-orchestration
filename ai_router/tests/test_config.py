"""Tests for ai_router.config workspace-relative auto-discovery.

The legacy contract of ``load_config()`` (explicit path > bundled
default) is exercised end-to-end by the rest of the suite. These tests
focus on the new resolution helpers added in 0.1.1:

  - ``_find_workspace_config()`` — walk-up search for
    ``ai_router/router-config.yaml`` from a given start directory.
  - ``_resolve_config_path_and_source()`` — full resolution order
    plus the source tag used by ``load_config`` to gate
    metrics co-location.

The helpers are tested directly rather than going through
``load_config()`` because ``load_config()`` validates provider API
keys + model references, which would force every test to mint a full
router-config.yaml fixture for a precedence-only assertion. Tests that
exercise the load_config → metrics integration use a minimal yaml
fixture and live alongside in test_metrics.py.
"""

import os
import uuid
from pathlib import Path

import config as config_mod  # type: ignore[import-not-found]


# --- _find_workspace_config -----------------------------------------------


def _make_workspace(root: Path) -> Path:
    """Create ``<root>/ai_router/router-config.yaml`` and return its path."""
    target = root / "ai_router" / "router-config.yaml"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("# fixture\nproviders: {}\n", encoding="utf-8")
    return target


def test_find_workspace_config_hits_in_cwd(tmp_path: Path) -> None:
    expected = _make_workspace(tmp_path)
    found = config_mod._find_workspace_config(start=tmp_path)
    assert found is not None
    assert found.resolve() == expected.resolve()


def test_find_workspace_config_hits_in_ancestor(tmp_path: Path) -> None:
    expected = _make_workspace(tmp_path)
    deep = tmp_path / "src" / "subpkg" / "tests"
    deep.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=deep)
    assert found is not None
    assert found.resolve() == expected.resolve()


def test_find_workspace_config_returns_none_when_no_ancestor_has_it(
    tmp_path: Path, monkeypatch
) -> None:
    # Pin a deterministic miss: substitute the relpath constant with a
    # uniquely-named file no real filesystem ancestor will contain.
    # The walk then deterministically walks all the way to the
    # filesystem root and returns None.
    unique_relpath = (
        Path("ai_router") / f"missing-{uuid.uuid4().hex}.yaml"
    )
    monkeypatch.setattr(
        config_mod, "_WORKSPACE_CONFIG_RELPATH", unique_relpath
    )
    leaf = tmp_path / "deep" / "deeper"
    leaf.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=leaf)
    assert found is None


def test_find_workspace_config_stops_at_root_without_erroring(
    tmp_path: Path,
) -> None:
    # Use the actual filesystem root as the start. Should not raise.
    config_mod._find_workspace_config(start=Path(tmp_path.anchor or "/"))


def test_find_workspace_config_closest_ancestor_wins(tmp_path: Path) -> None:
    # Two configs: outer and inner. Walk-up from a leaf should hit the
    # inner one first.
    _make_workspace(tmp_path)
    inner_root = tmp_path / "project"
    inner_root.mkdir()
    inner_expected = _make_workspace(inner_root)
    leaf = inner_root / "src" / "deep"
    leaf.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=leaf)
    assert found is not None
    assert found.resolve() == inner_expected.resolve()


# --- _resolve_config_path / _resolve_config_path_and_source ---------------


def test_resolve_explicit_path_wins_over_env_and_workspace(
    tmp_path: Path, monkeypatch
) -> None:
    _make_workspace(tmp_path)
    env_target = tmp_path / "env.yaml"
    env_target.write_text("# env\n", encoding="utf-8")
    explicit_target = tmp_path / "explicit.yaml"
    explicit_target.write_text("# explicit\n", encoding="utf-8")

    monkeypatch.setenv("AI_ROUTER_CONFIG", str(env_target))
    monkeypatch.chdir(tmp_path)

    resolved, source = config_mod._resolve_config_path_and_source(
        str(explicit_target)
    )
    assert Path(resolved).resolve() == explicit_target.resolve()
    assert source == config_mod.CONFIG_SOURCE_EXPLICIT


def test_resolve_env_var_wins_over_workspace(
    tmp_path: Path, monkeypatch
) -> None:
    workspace_path = _make_workspace(tmp_path)
    env_target = tmp_path / "env.yaml"
    env_target.write_text("# env\n", encoding="utf-8")

    monkeypatch.setenv("AI_ROUTER_CONFIG", str(env_target))
    monkeypatch.chdir(tmp_path)

    resolved, source = config_mod._resolve_config_path_and_source(None)
    assert Path(resolved).resolve() == env_target.resolve()
    assert source == config_mod.CONFIG_SOURCE_ENV
    # Sanity: workspace fixture was findable, env var just outranked it.
    assert workspace_path.exists()


def test_resolve_workspace_wins_over_bundled_default(
    tmp_path: Path, monkeypatch
) -> None:
    expected = _make_workspace(tmp_path)
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.chdir(tmp_path)

    resolved, source = config_mod._resolve_config_path_and_source(None)
    assert Path(resolved).resolve() == expected.resolve()
    assert source == config_mod.CONFIG_SOURCE_WORKSPACE


def test_resolve_falls_back_to_bundled_default_when_nothing_else_resolves(
    tmp_path: Path, monkeypatch
) -> None:
    # Force the workspace branch to miss so the only remaining path is
    # the bundled default. (We can't safely chdir to a directory that
    # has no ai_router/router-config.yaml above it — the developer's
    # repo may have one above tmp_path.)
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.setattr(
        config_mod, "_find_workspace_config", lambda start=None: None
    )
    monkeypatch.chdir(tmp_path)

    resolved, source = config_mod._resolve_config_path_and_source(None)
    expected = config_mod._THIS_DIR / "router-config.yaml"
    assert Path(resolved).resolve() == expected.resolve()
    assert source == config_mod.CONFIG_SOURCE_BUNDLED_DEFAULT


def test_resolve_config_path_thin_wrapper_returns_just_path(
    tmp_path: Path, monkeypatch
) -> None:
    # Backward-compatible wrapper from the first round of Session 1
    # work — kept around so callers that don't care about the source
    # tag have a simple string-returning helper.
    explicit_target = tmp_path / "explicit.yaml"
    explicit_target.write_text("# explicit\n", encoding="utf-8")
    resolved = config_mod._resolve_config_path(str(explicit_target))
    assert isinstance(resolved, str)
    assert Path(resolved).resolve() == explicit_target.resolve()
