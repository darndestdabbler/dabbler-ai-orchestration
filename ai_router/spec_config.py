"""Parser for the ``Session Set Configuration`` YAML block in ``spec.md``.

Set 048 Session 2 added the ``tier`` field and tri-state ``requires_uat`` /
``requires_e2e`` enums to the spec schema. The Python parser mirrors the
TypeScript ``parseSessionSetConfig`` in
``tools/dabbler-ai-orchestration/src/utils/fileSystem.ts``.

**Set 112 removed the Lightweight tier.** There is one tier, so ``tier:``
is no longer a switch — it is a legacy field that is *tolerated* when it
says ``full`` and **refused** when it says ``lightweight``. A spec that
still declares ``tier: lightweight`` raises
:class:`LightweightTierRemovedError` carrying the migration one-liner;
it is never silently converted, because a silent conversion would run a
set under discipline its author did not choose and did not configure for.

Archived Lightweight session sets stay readable as history: nothing here
walks a set directory, and the error fires only when a caller actually
asks to parse that spec's configuration.

The parser is intentionally simple regex (not a YAML parser) to stay
dependency-free and tolerant of stray formatting in the spec block.
Schema validation that surfaces typos as errors lives in
``schema_validator.py`` (separate from this parser).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union

from typing import Literal

TriStateFlag = Union[bool, Literal["suggested"]]

# The one-line migration message a stranded reader sees. It has to answer
# "what do I do next" without further reading, so it names both remedies:
# the keyed path and the Copilot-seat path.
LIGHTWEIGHT_REMOVED_MESSAGE = (
    "tier: lightweight was removed in Set 112 -- there is one tier now. "
    "Fix: set 'tier: full' in the Session Set Configuration block (or drop "
    "the tier: line entirely), then give the router a provider to call -- "
    "either DABBLER_ANTHROPIC_API_KEY / DABBLER_GEMINI_API_KEY / "
    "DABBLER_OPENAI_API_KEY for the Direct APIs transport, or an "
    "authenticated GitHub Copilot CLI seat with "
    "'transport: {profile: copilot-cli}' in ai_router/local-overrides.yaml. "
    "See docs/cross-repo-lightweight-removal-notice.md."
)


class LightweightTierRemovedError(ValueError):
    """Raised when a spec still declares the removed ``tier: lightweight``.

    A ``ValueError`` subclass so existing ``except ValueError`` handlers
    keep working, and a named type so a caller that wants to render the
    migration message specially can catch exactly this.
    """

    def __init__(self, spec_md_path: Optional[Path] = None) -> None:
        self.spec_md_path = spec_md_path
        where = f" ({spec_md_path})" if spec_md_path is not None else ""
        super().__init__(f"{LIGHTWEIGHT_REMOVED_MESSAGE}{where}")


@dataclass(frozen=True)
class SessionSetConfig:
    """Parsed shape of the ``Session Set Configuration`` block."""

    requires_uat: TriStateFlag
    requires_e2e: TriStateFlag
    # ``None`` means the field was OMITTED, which is deliberately distinct
    # from an explicit ``uatScope: none``. Collapsing the two lost the only
    # signal a gate could use to tell "the author said no UAT scope" from
    # "the author never mentioned scope at all".
    uat_scope: Optional[str]


_DEFAULT = SessionSetConfig(
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
        rf'^\s*{re.escape(key)}\s*:\s*["\']?([\w-]+)["\']?\s*(?:#.*)?$',
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

    Returns the conservative default when the file is missing, unreadable,
    or has no ``Session Set Configuration`` block.

    Raises :class:`LightweightTierRemovedError` when the canonical
    configuration block declares ``tier: lightweight`` (Set 112). Any other
    ``tier:`` value — including ``full`` and including a typo — is ignored:
    there is one tier, so the field carries no meaning beyond the refusal.
    """
    try:
        text = Path(spec_md_path).read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return _DEFAULT

    block_match = _CONFIG_BLOCK_RE.search(text)
    # Set 048 S2 Round-A verifier-flagged Important #5 (false-positive
    # tier detection): the ``tier`` field is read ONLY from inside the
    # canonical ``Session Set Configuration`` YAML block, never from
    # free-form prose. That guard is what keeps this set's own spec --
    # and every doc that quotes the removed value -- from tripping the
    # refusal below just by discussing it.
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

    if block_for_tier is not None:
        tier_match = _string_re("tier").search(block_for_tier)
        if tier_match and tier_match.group(1).lower() == "lightweight":
            raise LightweightTierRemovedError(Path(spec_md_path))

    uat = _parse_tri(_tri_state_re("requiresUAT").search(block))
    e2e = _parse_tri(_tri_state_re("requiresE2E").search(block))

    uat_scope: Optional[str] = None
    scope_match = _string_re("uatScope").search(block)
    if scope_match:
        uat_scope = scope_match.group(1)

    return SessionSetConfig(
        requires_uat=uat if uat is not None else _DEFAULT.requires_uat,
        requires_e2e=e2e if e2e is not None else _DEFAULT.requires_e2e,
        uat_scope=uat_scope,
    )


__all__ = [
    "LIGHTWEIGHT_REMOVED_MESSAGE",
    "LightweightTierRemovedError",
    "SessionSetConfig",
    "TriStateFlag",
    "parse_session_set_config",
    "refuse_if_lightweight",
]


def refuse_if_lightweight(session_set_dir) -> None:
    """Raise :class:`LightweightTierRemovedError` if the set declares the tier.

    The **boundary refusal** (Set 112). ``parse_session_set_config`` raises
    wherever it is called, but the lifecycle CLIs did not previously parse
    the config block at all on their happy path — so a stranded consumer
    running ``start_session`` on a legacy Lightweight spec would have been
    registered and written to disk under one-tier semantics, and would only
    have met an unrelated error much later. The whole point of a fail-loud
    removal is that the message arrives on the FIRST command, before any
    state or event write.

    Silent (returns ``None``) when the spec is missing, unreadable, or
    declares anything else — an unparseable spec is not this check's
    business, and every other failure mode has its own gate.
    """
    from pathlib import Path as _Path

    spec = _Path(session_set_dir) / "spec.md"
    try:
        parse_session_set_config(spec)
    except LightweightTierRemovedError:
        raise
    except Exception:  # noqa: BLE001 — not this check's business
        return
