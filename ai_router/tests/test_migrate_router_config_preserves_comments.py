"""Tests that migrate_router_config preserves YAML comments after migration."""

import textwrap
from pathlib import Path

import migrate_router_config as mig  # type: ignore[import-not-found]


_RC_WITH_COMMENTS = textwrap.dedent("""\
    # Top-level comment
    providers:
      anthropic:
        # Anthropic provider — keep this comment
                api_key_env: DABBLER_ANTHROPIC_API_KEY
    routing:
      # Routing thresholds
      tier1_max_complexity: 30
""")

_BUDGET_WITH_COMMENTS = textwrap.dedent("""\
    # Budget file comment
    threshold_usd: 10
    # Old scope field
    threshold_scope: project-lifetime
    verification_method: api
""")


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_router_config_comments_preserved(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _RC_WITH_COMMENTS)
    _write(bg, "threshold_usd: 1\nscope: per-project\nwarn_at_percent: 80\n")

    mig.migrate(router_config_path=rc, budget_path=bg)
    content = _read(rc)

    assert "# Top-level comment" in content
    assert "# Anthropic provider — keep this comment" in content
    assert "# Routing thresholds" in content


def test_budget_comments_preserved(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, "providers: {}\nrouting: {}\n")
    _write(bg, _BUDGET_WITH_COMMENTS)

    mig.migrate(router_config_path=rc, budget_path=bg)
    content = _read(bg)

    assert "# Budget file comment" in content


def test_new_fields_added_after_migration_still_readable(tmp_path: Path) -> None:
    rc = tmp_path / "router-config.yaml"
    bg = tmp_path / "budget.yaml"
    _write(rc, _RC_WITH_COMMENTS)
    _write(bg, _BUDGET_WITH_COMMENTS)

    mig.migrate(router_config_path=rc, budget_path=bg)

    # Load with ruamel to verify the migrated file is still valid YAML
    from ruamel.yaml import YAML
    y = YAML()
    rc_doc = y.load(_read(rc))
    bg_doc = y.load(_read(bg))

    assert rc_doc["providers"]["anthropic"]["display_label"] == "Anthropic"
    assert rc_doc["providers"]["anthropic"]["enabled"] is True
    assert rc_doc["routing"]["outsourcing_mode"] == "whenever-helpful"
    assert bg_doc["scope"] == "per-project"
    assert bg_doc["warn_at_percent"] == 80
