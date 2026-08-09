"""Unit tests for ai_router.runtime_mode.

--no-router mode resolution with two-knob precedence: CLI flag > env var >
default. Set 112 removed the third knob (the spec's ``tier:`` field) along
with the Lightweight tier, and with it the ability of a spec file -- or the
env var on its own -- to disarm a close-out verification gate. The
``session_set_dir`` parameter survives as an ignored, signature-stable
argument so consumer callers keep working across the major bump.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pytest

import runtime_mode
from runtime_mode import (
    ENV_VAR_NAME,
    is_no_router_mode,
    reset_for_tests,
    resolve_no_router_mode,
)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    """Ensure each test starts with a clean cache + no env var."""
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    reset_for_tests()
    yield
    reset_for_tests()


def _write_spec(tmp_path: Path, tier: str | None) -> Path:
    """Write a minimal spec.md with the given tier (or no tier field)."""
    spec_dir = tmp_path / "session-set-dir"
    spec_dir.mkdir(exist_ok=True)
    body = "# Some Set\n\n## Session Set Configuration\n\n```yaml\n"
    if tier is not None:
        body += f"tier: {tier}\n"
    body += "requiresUAT: false\nrequiresE2E: false\n```\n"
    spec = spec_dir / "spec.md"
    spec.write_text(body, encoding="utf-8")
    return spec_dir


# ---------- defaults ----------


def test_default_is_router_enabled(tmp_path: Path) -> None:
    """No CLI flag, no env var -> the router is enabled."""
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=None) is False
    assert is_no_router_mode() is False


# ---------- CLI flag wins ----------


def test_cli_flag_enables_no_router(tmp_path: Path) -> None:
    assert resolve_no_router_mode(cli_flag=True, session_set_dir=None) is True
    assert is_no_router_mode() is True


def test_cli_flag_wins_over_env_var(monkeypatch, tmp_path: Path) -> None:
    """CLI flag explicit override; env var is also set but lower precedence."""
    monkeypatch.setenv(ENV_VAR_NAME, "0")  # env says NO no-router
    assert resolve_no_router_mode(cli_flag=True, session_set_dir=None) is True


def test_cli_flag_wins_with_a_spec_dir_present(tmp_path: Path) -> None:
    spec_dir = _write_spec(tmp_path, "full")
    assert resolve_no_router_mode(cli_flag=True, session_set_dir=spec_dir) is True


# ---------- env var ----------


@pytest.mark.parametrize("truthy_value", ["1", "true", "TRUE", "yes", "YES", "on"])
def test_env_var_truthy_enables_no_router(monkeypatch, truthy_value: str) -> None:
    monkeypatch.setenv(ENV_VAR_NAME, truthy_value)
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=None) is True


@pytest.mark.parametrize("falsy_value", ["", "0", "false", "no", "off", "kitchen-sink"])
def test_env_var_falsy_does_not_enable(monkeypatch, falsy_value: str) -> None:
    monkeypatch.setenv(ENV_VAR_NAME, falsy_value)
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=None) is False


def test_env_var_wins_with_a_spec_dir_present(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv(ENV_VAR_NAME, "1")
    spec_dir = _write_spec(tmp_path, "full")
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=spec_dir) is True


# ---------- the removed spec-tier knob ----------


def test_spec_tier_lightweight_no_longer_enables_no_router(tmp_path) -> None:
    """The Set 112 removal, asserted from the outside.

    A spec still declaring the removed tier cannot switch the router off
    behind the operator's back. (The spec loader refuses such a spec
    outright -- see test_spec_config -- but the resolver must not depend on
    that, because a resolver that silently honoured the field would be a
    second, quieter activation path.)
    """
    spec_dir = _write_spec(tmp_path, "lightweight")
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=spec_dir) is False


def test_spec_tier_full_does_not_enable(tmp_path) -> None:
    spec_dir = _write_spec(tmp_path, "full")
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=spec_dir) is False


def test_spec_tier_absent_does_not_enable(tmp_path) -> None:
    spec_dir = _write_spec(tmp_path, None)
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=spec_dir) is False


def test_missing_spec_dir_does_not_enable(tmp_path) -> None:
    nonexistent = tmp_path / "does-not-exist"
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=nonexistent) is False


def test_missing_spec_file_does_not_enable(tmp_path) -> None:
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    assert resolve_no_router_mode(cli_flag=False, session_set_dir=empty_dir) is False


def test_session_set_dir_is_accepted_and_ignored(tmp_path) -> None:
    """Signature stability: an unreadable path is not an error, it is inert."""
    assert (
        resolve_no_router_mode(cli_flag=False, session_set_dir=tmp_path / "nope")
        is False
    )
    reset_for_tests()
    assert (
        resolve_no_router_mode(cli_flag=True, session_set_dir=tmp_path / "nope")
        is True
    )


# ---------- caching ----------


def test_resolve_caches_result(monkeypatch, tmp_path: Path) -> None:
    resolve_no_router_mode(cli_flag=True, session_set_dir=None)
    # Even if env var changes after resolve, is_no_router_mode returns cached.
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    assert is_no_router_mode() is True


def test_is_no_router_mode_lazy_resolves_from_env(monkeypatch) -> None:
    """is_no_router_mode without explicit resolve picks up env var."""
    monkeypatch.setenv(ENV_VAR_NAME, "1")
    reset_for_tests()  # ensure no cached value
    assert is_no_router_mode() is True


def test_is_no_router_mode_lazy_default_false() -> None:
    """is_no_router_mode without explicit resolve and no env var → False."""
    reset_for_tests()
    assert is_no_router_mode() is False


# ---------- source logging ----------


def test_cli_flag_logs_its_source(caplog, tmp_path) -> None:
    caplog.set_level(logging.INFO, logger="ai_router.runtime_mode")
    resolve_no_router_mode(cli_flag=True, session_set_dir=None)
    assert any("via CLI flag" in r.message for r in caplog.records)


def test_env_var_logs_its_source(monkeypatch, caplog) -> None:
    caplog.set_level(logging.INFO, logger="ai_router.runtime_mode")
    monkeypatch.setenv(ENV_VAR_NAME, "1")
    resolve_no_router_mode(cli_flag=False, session_set_dir=None)
    assert any("via env var" in r.message for r in caplog.records)


def test_no_log_names_a_spec_tier(caplog, tmp_path) -> None:
    """The resolver's log line names only the two surviving sources."""
    caplog.set_level(logging.INFO, logger="ai_router.runtime_mode")
    spec_dir = _write_spec(tmp_path, "lightweight")
    resolve_no_router_mode(cli_flag=True, session_set_dir=spec_dir)
    assert not any("tier" in r.message for r in caplog.records)


def test_default_does_not_log(caplog) -> None:
    """Default resolution should not log (nothing happened)."""
    caplog.set_level(logging.INFO, logger="ai_router.runtime_mode")
    resolve_no_router_mode(cli_flag=False, session_set_dir=None)
    assert not [r for r in caplog.records if r.levelno >= logging.INFO]
