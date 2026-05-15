"""Tests for threshold_scope → scope migration rules in migrate_router_config."""

import textwrap
from pathlib import Path

import migrate_router_config as mig  # type: ignore[import-not-found]


def _budget(content: str, tmp_path: Path) -> Path:
    p = tmp_path / "budget.yaml"
    p.write_text(textwrap.dedent(content), encoding="utf-8")
    return p


def _rc(tmp_path: Path) -> Path:
    p = tmp_path / "router-config.yaml"
    p.write_text("providers: {}\nrouting:\n  tier_assignments: {}\n", encoding="utf-8")
    return p


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_project_lifetime_becomes_per_project(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 10
        threshold_scope: project-lifetime
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    assert "scope: per-project" in content
    assert "threshold_scope" not in content


def test_already_has_scope_not_double_renamed(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 10
        scope: per-project
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    # 'scope' should appear exactly once
    assert content.count("scope: per-project") == 1
    assert "threshold_scope" not in content


def test_per_session_set_preserved(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 5
        threshold_scope: per-session-set
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    assert "scope: per-session-set" in content
    assert "threshold_scope" not in content


def test_monthly_becomes_per_project_with_period(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 20
        threshold_scope: monthly
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    assert "scope: per-project" in content
    assert "period: monthly" in content
    assert "threshold_scope" not in content


def test_warn_at_percent_injected_when_missing(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 10
        scope: per-project
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    assert "warn_at_percent: 80" in content


def test_existing_warn_at_percent_not_overwritten(tmp_path: Path) -> None:
    bg = _budget("""\
        threshold_usd: 10
        scope: per-project
        warn_at_percent: 50
        verification_method: api
    """, tmp_path)
    mig.migrate(router_config_path=_rc(tmp_path), budget_path=bg)
    content = _read(bg)
    assert "warn_at_percent: 50" in content
    assert "warn_at_percent: 80" not in content
