"""Unit tests for ai_router.spec_config.

Covers:
- Tri-state ``requiresUAT`` / ``requiresE2E`` (``true | false | "suggested"``)
- ``uatScope`` omitted-vs-declared
- **Set 112**: the fail-loud refusal of the removed ``tier: lightweight``,
  including the exact migration message a stranded reader sees, and the
  narrow blast radius that keeps archives and prose readable.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from spec_config import (
    LIGHTWEIGHT_REMOVED_MESSAGE,
    LightweightTierRemovedError,
    SessionSetConfig,
    parse_session_set_config,
)


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
    assert cfg.requires_uat is False
    assert cfg.requires_e2e is False
    # An OMITTED uatScope is None, not "none": the close gate has to be able
    # to tell "the author never declared a scope" from "the author declared
    # none", because only the second is a decision.
    assert cfg.uat_scope is None


def test_spec_without_config_block_returns_defaults(tmp_path: Path) -> None:
    spec = _write_spec(tmp_path, "# Bare spec with no YAML block\n\nsome text\n")
    cfg = parse_session_set_config(spec)
    assert cfg.requires_uat is False
    assert cfg.requires_e2e is False


def test_spec_without_tier_field_parses(tmp_path: Path) -> None:
    """A spec that never mentions tier is the normal shape after Set 112."""
    body = _config_block(
        "requiresUAT: true\nrequiresE2E: false\nuatStyle: ad-hoc\neffort: medium"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True
    assert cfg.requires_e2e is False


# ---------- Set 112: the removed tier fails loud ----------


def test_tier_lightweight_raises_with_the_migration_message(tmp_path: Path) -> None:
    """The Set 112 fail-loud contract: refuse, never silently convert.

    A silent conversion to Full would run a set under discipline its author
    did not choose and did not configure a provider for; the first symptom
    would be a mysterious routed call. The refusal is the feature.
    """
    body = _config_block("tier: lightweight\nrequiresUAT: false\nrequiresE2E: false")
    spec = _write_spec(tmp_path, body)
    with pytest.raises(LightweightTierRemovedError) as exc:
        parse_session_set_config(spec)
    message = str(exc.value)
    # The exact one-liner, verbatim -- a stranded reader must be able to act
    # on it without opening another file.
    assert LIGHTWEIGHT_REMOVED_MESSAGE in message
    # ...and it must name the failing spec so a bulk scan is actionable.
    assert str(spec) in message


def test_migration_message_names_both_remedies() -> None:
    """Both populations get an answer: keyed users and Copilot-seat users."""
    m = LIGHTWEIGHT_REMOVED_MESSAGE
    assert "tier: full" in m
    assert "DABBLER_ANTHROPIC_API_KEY" in m
    assert "copilot-cli" in m
    assert "cross-repo-lightweight-removal-notice.md" in m
    # ASCII-only: this string reaches a Windows cp1252 console.
    m.encode("cp1252")


def test_lightweight_error_is_a_value_error(tmp_path: Path) -> None:
    """Existing ``except ValueError`` handlers keep working across the bump."""
    body = _config_block("tier: lightweight")
    with pytest.raises(ValueError):
        parse_session_set_config(_write_spec(tmp_path, body))


def test_tier_lightweight_case_insensitive(tmp_path: Path) -> None:
    body = _config_block("tier: LIGHTWEIGHT\nrequiresUAT: false")
    with pytest.raises(LightweightTierRemovedError):
        parse_session_set_config(_write_spec(tmp_path, body))


def test_tier_lightweight_with_inline_comment_still_refused(tmp_path: Path) -> None:
    body = _config_block("tier: lightweight  # operator-locked at S1\nrequiresUAT: false")
    with pytest.raises(LightweightTierRemovedError):
        parse_session_set_config(_write_spec(tmp_path, body))


def test_tier_lightweight_quoted_value_is_refused(tmp_path: Path) -> None:
    """Round-1 finding: a quoted YAML value must not slip past the refusal.

    ``tier: "lightweight"`` is legal YAML and reads identically to a human,
    so a parser that only matched the bare token would let the exact spec
    the removal targets load silently.
    """
    for raw in ('tier: "lightweight"', "tier: 'lightweight'"):
        body = _config_block(f"{raw}\nrequiresUAT: false")
        with pytest.raises(LightweightTierRemovedError):
            parse_session_set_config(_write_spec(tmp_path, body))


def test_refuse_if_lightweight_raises_for_a_declaring_set(tmp_path: Path) -> None:
    """The boundary helper the lifecycle CLIs call before any write."""
    from spec_config import refuse_if_lightweight

    (tmp_path / "spec.md").write_text(
        _config_block("tier: lightweight"), encoding="utf-8"
    )
    with pytest.raises(LightweightTierRemovedError):
        refuse_if_lightweight(tmp_path)


def test_refuse_if_lightweight_is_silent_otherwise(tmp_path: Path) -> None:
    """Missing, unreadable, and ordinary specs are not this check's business."""
    from spec_config import refuse_if_lightweight

    refuse_if_lightweight(tmp_path)  # no spec.md at all
    (tmp_path / "spec.md").write_text(
        _config_block("tier: full\nrequiresUAT: true"), encoding="utf-8"
    )
    refuse_if_lightweight(tmp_path)
    (tmp_path / "spec.md").write_text("not a spec at all", encoding="utf-8")
    refuse_if_lightweight(tmp_path)


def test_tier_full_is_tolerated(tmp_path: Path) -> None:
    """A legacy ``tier: full`` line is inert, not an error.

    Consumer repos have hundreds of these. Refusing them would turn a
    no-op legacy field into a migration chore for no safety gain.
    """
    body = _config_block("tier: full\nrequiresUAT: true")
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True


def test_unknown_tier_value_is_ignored(tmp_path: Path) -> None:
    body = _config_block("tier: kitchen-sink\nrequiresUAT: false")
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is False


def test_tier_from_free_form_prose_is_ignored(tmp_path: Path) -> None:
    """Prose that merely MENTIONS the removed value must not raise.

    Inherited from the Set 048 S2 Round-A guard (then: prose must not
    silently activate the tier; now: prose must not blow up the parser).
    This is what keeps the archives, this set's own spec, and the migration
    notice readable by every tool that walks a repo.
    """
    body = (
        "# Some Spec\n\n"
        "Design note: we considered using `tier: lightweight` here but\n"
        "decided against it. Implementation will follow the one-tier flow.\n"
        "\n"
        "(No `## Session Set Configuration` block exists in this spec.)\n"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is False


def test_tier_lightweight_outside_the_canonical_block_is_ignored(
    tmp_path: Path,
) -> None:
    """A yaml fence under some OTHER heading is not a tier declaration."""
    body = (
        "# Some Spec\n\n"
        "## Historical note\n\n"
        "```yaml\ntier: lightweight\n```\n\n"
        "## UAT scope\n\n"
        "```yaml\nrequiresUAT: true\n```\n"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True


def test_repo_session_sets_all_parse() -> None:
    """No set in this repo may declare the removed tier.

    A cheap standing guard: the S3 grep gate owns the doc-wide proof, but
    this catches a resurrected spec at the layer that would refuse it.
    """
    root = Path(__file__).resolve().parents[2] / "docs" / "session-sets"
    if not root.is_dir():
        pytest.skip("docs/session-sets not present")
    for spec in sorted(root.glob("*/spec.md")):
        parse_session_set_config(spec)  # must not raise


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
    body = _config_block('requiresUAT: true\nrequiresE2E: "suggested"')
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True
    assert cfg.requires_e2e == "suggested"


# ---------- inline comments / trailing whitespace ----------


def test_inline_yaml_comment_tolerated(tmp_path: Path) -> None:
    body = _config_block('requiresUAT: "suggested"  # Set 048 D4\nrequiresE2E: false')
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat == "suggested"


# ---------- frozen dataclass invariant ----------


def test_config_is_frozen() -> None:
    cfg = SessionSetConfig(requires_uat=False, requires_e2e=False, uat_scope=None)
    with pytest.raises((AttributeError, TypeError)):
        cfg.requires_uat = True  # type: ignore[misc]


# ---------- Set 015 Session 3 plain-text fallback ----------


def test_requiresUAT_in_plain_text_still_parses_set015_compat(tmp_path: Path) -> None:
    """When no canonical heading exists but a yaml fence is present
    elsewhere, requiresUAT IS still parsed (the plain-text fallback applies
    to UAT/E2E/uatScope but never to tier)."""
    body = (
        "# Some Spec\n\n"
        "## UAT scope\n\n"
        "```yaml\nrequiresUAT: true\nrequiresE2E: false\nuatScope: full\n```\n"
    )
    cfg = parse_session_set_config(_write_spec(tmp_path, body))
    assert cfg.requires_uat is True
    assert cfg.requires_e2e is False
    assert cfg.uat_scope == "full"
