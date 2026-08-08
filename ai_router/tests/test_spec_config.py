"""Unit tests for ai_router.spec_config.

Covers Set 048 Session 2 schema additions:
- ``tier`` field (default ``"full"`` when absent)
- Tri-state ``requiresUAT`` / ``requiresE2E`` (``true | false | "suggested"``)
- Backwards compatibility with pre-Set-048 specs (default to Full tier)
"""
from __future__ import annotations

from pathlib import Path

import pytest

from spec_config import SessionSetConfig, parse_session_set_config


def _write_spec(tmp_path: Path, body: str) -> Path:
    spec = tmp_path / "spec.md"
    spec.write_text(body, encoding="utf-8")
    return spec


def _config_block(yaml_lines: str) -> str:
    """Wrap yaml lines in the canonical Session Set Configuration block."""
    return f"""# Some Set

## Session Set Configuration

```yaml
{yaml_lines}
```

## 1. What this set ships
"""


# ---------- defaults / missing file ----------


def test_missing_spec_returns_defaults(tmp_path: Path) -> None:
    cfg = parse_session_set_config(tmp_path / "nonexistent.md")
    assert cfg.tier == "full"
    assert cfg.requires_uat is False
    assert cfg.requires_e2e is False
    # An OMITTED uatScope is None, not "none": the close gate has to be able
    # to tell "the author never declared a scope" from "the author declared
    # none", because only the second is a decision.
    assert cfg.uat_scope is None


def test_spec_without_config_block_returns_defaults(tmp_path: Path) -> None:
    spec = _write_spec(tmp_path, "# Bare spec with no YAML block\n\nsome text\n")
    cfg = parse_session_set_config(spec)
    assert cfg.tier == "full"
    assert cfg.requires_uat is False
    assert cfg.requires_e2e is False


def test_pre_set_048_spec_defaults_tier_to_full(tmp_path: Path) -> None:
    """Specs without `tier:` field resolve to Full tier (backwards compat)."""
    body = _config_block(
        "totalSessions: 4\nrequiresUAT: true\nrequiresE2E: false\nuatStyle: ad-hoc\neffort: medium"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.tier == "full"
    assert cfg.requires_uat is True
    assert cfg.requires_e2e is False


# ---------- tier field ----------


def test_tier_full(tmp_path: Path) -> None:
    body = _config_block("tier: full\nrequiresUAT: false\nrequiresE2E: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).tier == "full"


def test_tier_lightweight(tmp_path: Path) -> None:
    body = _config_block("tier: lightweight\nrequiresUAT: false\nrequiresE2E: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).tier == "lightweight"


def test_unknown_tier_falls_back_to_full(tmp_path: Path) -> None:
    """Per parser contract: unknown values silently default; validator surfaces errors."""
    body = _config_block("tier: kitchen-sink\nrequiresUAT: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).tier == "full"


def test_tier_case_insensitive(tmp_path: Path) -> None:
    body = _config_block("tier: LIGHTWEIGHT\nrequiresUAT: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).tier == "lightweight"


# ---------- tri-state UAT/E2E ----------


def test_requires_uat_true(tmp_path: Path) -> None:
    body = _config_block("requiresUAT: true\nrequiresE2E: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).requires_uat is True


def test_requires_uat_false(tmp_path: Path) -> None:
    body = _config_block("requiresUAT: false\nrequiresE2E: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).requires_uat is False


def test_requires_uat_suggested_unquoted(tmp_path: Path) -> None:
    body = _config_block("requiresUAT: suggested\nrequiresE2E: false")
    assert parse_session_set_config(_write_spec(tmp_path, body)).requires_uat == "suggested"


def test_requires_uat_suggested_quoted(tmp_path: Path) -> None:
    body = _config_block('requiresUAT: "suggested"\nrequiresE2E: false')
    assert parse_session_set_config(_write_spec(tmp_path, body)).requires_uat == "suggested"


def test_requires_e2e_suggested(tmp_path: Path) -> None:
    body = _config_block('requiresUAT: false\nrequiresE2E: "suggested"')
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_e2e == "suggested"


def test_mixed_tri_state(tmp_path: Path) -> None:
    body = _config_block('requiresUAT: true\nrequiresE2E: "suggested"\ntier: lightweight')
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True
    assert cfg.requires_e2e == "suggested"
    assert cfg.tier == "lightweight"


# ---------- inline comments / trailing whitespace ----------


def test_inline_yaml_comment_tolerated(tmp_path: Path) -> None:
    body = _config_block(
        'tier: lightweight  # operator-locked at S1\nrequiresUAT: "suggested"  # Set 048 D4'
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.tier == "lightweight"
    assert cfg.requires_uat == "suggested"


# ---------- frozen dataclass invariant ----------


def test_config_is_frozen() -> None:
    cfg = SessionSetConfig(
        tier="full", requires_uat=False, requires_e2e=False, uat_scope=None
    )
    with pytest.raises((AttributeError, TypeError)):
        cfg.tier = "lightweight"  # type: ignore[misc]


# ---------- Round-A verifier regression: false-positive tier detection ----------


def test_tier_from_free_form_prose_is_ignored(tmp_path: Path) -> None:
    """Set 048 S2 Round-A Important #5: a spec mentioning ``tier: lightweight``
    in free-form prose (not inside the canonical YAML block) MUST default
    to ``full`` rather than silently activate --no-router mode."""
    body = (
        "# Some Spec\n\n"
        "Design note: we considered using `tier: lightweight` here but\n"
        "decided against it. Implementation will follow Full discipline.\n"
        "\n"
        "(No `## Session Set Configuration` block exists in this spec.)\n"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.tier == "full", (
        "Free-form prose mentioning 'tier: lightweight' must NOT activate "
        "Lightweight tier; only declarations inside the canonical YAML block count."
    )


def test_requiresUAT_in_plain_text_still_parses_set015_compat(tmp_path: Path) -> None:
    """Set 015 Session 3 compat: when no canonical heading exists but
    a yaml fence is present elsewhere, requiresUAT IS still parsed (the
    plain-text fallback applies to UAT/E2E/uatScope but NOT to tier)."""
    body = (
        "# Some Spec\n\n"
        "## UAT scope\n\n"
        "```yaml\nrequiresUAT: true\nrequiresE2E: false\nuatScope: full\n```\n"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    # Plain-text fallback applies to UAT/E2E/uatScope: requiresUAT was found.
    assert cfg.requires_uat is True
    assert cfg.requires_e2e is False
    assert cfg.uat_scope == "full"
    # But tier is fail-safe to "full" when no canonical block exists.
    assert cfg.tier == "full"


# ---------- real-world: Set 048 spec.md ----------


def test_set_048_spec_parses_as_locked() -> None:
    """End-to-end against the audit-locked Set 048 spec.md."""
    spec = (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "session-sets"
        / "048-lightweight-tier-parity"
        / "spec.md"
    )
    if not spec.exists():
        pytest.skip("Set 048 spec.md not present")
    cfg = parse_session_set_config(spec)
    assert cfg.tier == "full"  # Set 048 itself authors under Full discipline
    assert cfg.requires_uat is True
    assert cfg.requires_e2e is False
