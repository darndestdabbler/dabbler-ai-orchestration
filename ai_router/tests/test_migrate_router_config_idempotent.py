"""Tests that migrate_router_config is idempotent — running twice produces no change."""

import textwrap
from pathlib import Path

import pytest
import migrate_router_config as mig  # type: ignore[import-not-found]


_MINIMAL_RC = textwrap.dedent("""\
    providers:
      anthropic:
        api_key_env: ANTHROPIC_API_KEY
      google:
        api_key_env: GEMINI_API_KEY
    routing:
      tier1_max_complexity: 30
      tier2_max_complexity: 65
      tier_assignments:
        1: gemini-flash
""")

_ALREADY_MIGRATED_RC = textwrap.dedent("""\
    providers:
      anthropic:
        display_label: Anthropic
        enabled: true
        api_key_env: ANTHROPIC_API_KEY
    routing:
      outsourcing_mode: whenever-helpful
      tier1_max_complexity: 30
""")

_MINIMAL_BUDGET = textwrap.dedent("""\
    threshold_usd: 5
    scope: per-session-set
    warn_at_percent: 80
    verification_method: api
""")


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_idempotent_router_config(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _MINIMAL_RC)
    _write(bg, _MINIMAL_BUDGET)

    # First run — should make changes
    mig.migrate(router_config_path=rc, budget_path=bg)
    after_first = _read(rc)

    # Second run — should produce identical output
    mig.migrate(router_config_path=rc, budget_path=bg)
    after_second = _read(rc)

    assert after_first == after_second


def test_already_migrated_rc_is_unchanged(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _ALREADY_MIGRATED_RC)
    _write(bg, _MINIMAL_BUDGET)

    before = _read(rc)
    mig.migrate(router_config_path=rc, budget_path=bg)
    after = _read(rc)

    assert before == after


def test_display_label_injected_as_title_case(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _MINIMAL_RC)
    _write(bg, _MINIMAL_BUDGET)

    mig.migrate(router_config_path=rc, budget_path=bg)
    content = _read(rc)

    assert "display_label: Anthropic" in content
    assert "display_label: Google" in content


def test_enabled_true_injected(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _MINIMAL_RC)
    _write(bg, _MINIMAL_BUDGET)

    mig.migrate(router_config_path=rc, budget_path=bg)
    content = _read(rc)

    assert "enabled: true" in content


def test_outsourcing_mode_injected(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _MINIMAL_RC)
    _write(bg, _MINIMAL_BUDGET)

    mig.migrate(router_config_path=rc, budget_path=bg)
    content = _read(rc)

    assert "outsourcing_mode: whenever-helpful" in content


def test_missing_files_do_not_raise(tmp_path: Path) -> None:
    rc = tmp_path / "missing-rc.yaml"
    bg = tmp_path / "missing-budget.yaml"
    # Should print a warning but not raise
    mig.migrate(router_config_path=rc, budget_path=bg)
