"""Parser for the ``Session Set Configuration`` YAML block in ``spec.md``.

Set 048 Session 2: adds the ``tier`` field and tri-state ``requires_uat`` /
``requires_e2e`` enums to the spec schema. The Python parser mirrors the
TypeScript ``parseSessionSetConfig`` in
``tools/dabbler-ai-orchestration/src/utils/fileSystem.ts``.

Defaults are full-tier-conservative — ``tier="full"``, ``requires_uat=False``,
``requires_e2e=False``. Pre-Set-048 specs without explicit ``tier:``
resolve to ``"full"`` so existing sets continue to run under canonical
Full-tier discipline.

The parser is intentionally lightweight regex (not a YAML parser) to stay
dependency-free and tolerant of stray formatting in the spec block.
Schema validation that surfaces typos as errors lives in
``schema_validator.py`` (separate from this parser).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional, Union

TriStateFlag = Union[bool, Literal["suggested"]]
SessionSetTier = Literal["full", "lightweight"]


@dataclass(frozen=True)
class SessionSetConfig:
    """Parsed shape of the ``Session Set Configuration`` block."""

    tier: SessionSetTier
    requires_uat: TriStateFlag
    requires_e2e: TriStateFlag
    # ``None`` means the field was OMITTED, which is deliberately distinct
    # from an explicit ``uatScope: none``. Collapsing the two lost the only
    # signal a gate could use to tell "the author said no UAT scope" from
    # "the author never mentioned scope at all".
    uat_scope: Optional[str]


_DEFAULT = SessionSetConfig(
    tier="full",
    requires_uat=False,
    requires_e2e=False,
    uat_scope=None,
)


_CONFIG_BLOCK_RE = re.compile(
    r"##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```",
    re.IGNORECASE,
)

# Tri-state values: literal `true`, `false`, or `suggested` (optionally
# quoted). Trailing inline `# comment` tolerated.
def _tri_state_re(key: str) -> re.Pattern[str]:
    return re.compile(
        rf'^\s*{re.escape(key)}\s*:\s*(?:"(suggested)"|(true|false|suggested))\s*(?:#.*)?$',
        re.IGNORECASE | re.MULTILINE,
    )


def _string_re(key: str) -> re.Pattern[str]:
    return re.compile(
        rf'^\s*{re.escape(key)}\s*:\s*([\w-]+)\s*(?:#.*)?$',
        re.IGNORECASE | re.MULTILINE,
    )


def _parse_tri(m: re.Match[str] | None) -> TriStateFlag | None:
    if m is None:
        return None
    raw = (m.group(1) or m.group(2) or "").lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    if raw == "suggested":
        return "suggested"
    return None


def parse_session_set_config(spec_md_path: Path) -> SessionSetConfig:
    """Parse ``spec.md`` and return its ``SessionSetConfig``.

    Returns the Full-tier-conservative default when the file is missing,
    unreadable, or has no ``Session Set Configuration`` block. Unknown
    ``tier`` values silently fall back to ``"full"`` — schema validation
    is the responsibility of the validator, not this parser.
    """
    try:
        text = Path(spec_md_path).read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return _DEFAULT

    block_match = _CONFIG_BLOCK_RE.search(text)
    # Set 048 S2 Round-A verifier-flagged Important #5 (false-positive
    # tier detection): the ``tier`` field is parsed ONLY from inside the
    # canonical ``Session Set Configuration`` YAML block, never from
    # free-form prose. Without this guard, a pre-Set-048 spec that
    # mentions "tier: lightweight" in design notes or a quoted example
    # could silently activate --no-router mode for the whole set.
    # requiresUAT/E2E/uatScope retain the Set 015 Session 3 plain-text
    # fallback (when the heading is absent but a yaml fence is present
    # elsewhere in the file) for backwards compatibility with existing
    # spec.md layouts.
    if block_match:
        block = block_match.group(1)
        block_for_tier = block_match.group(1)  # strict — only inside the canonical block
    else:
        block = text  # legacy fallback for UAT/E2E/uatScope
        block_for_tier = None

    tier: SessionSetTier = "full"
    if block_for_tier is not None:
        tier_match = _string_re("tier").search(block_for_tier)
        if tier_match:
            v = tier_match.group(1).lower()
            if v in ("full", "lightweight"):
                tier = v  # type: ignore[assignment]

    uat = _parse_tri(_tri_state_re("requiresUAT").search(block))
    e2e = _parse_tri(_tri_state_re("requiresE2E").search(block))

    uat_scope: Optional[str] = None
    scope_match = _string_re("uatScope").search(block)
    if scope_match:
        uat_scope = scope_match.group(1)

    return SessionSetConfig(
        tier=tier,
        requires_uat=uat if uat is not None else _DEFAULT.requires_uat,
        requires_e2e=e2e if e2e is not None else _DEFAULT.requires_e2e,
        uat_scope=uat_scope,
    )


__all__ = [
    "SessionSetConfig",
    "SessionSetTier",
    "TriStateFlag",
    "parse_session_set_config",
]
