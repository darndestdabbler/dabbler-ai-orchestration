"""Shared guidance-lifecycle config + file discovery (Set 064).

The reporter (D1), citation path (D3), and ceiling/trigger checks (D5)
all need the same two things: where the guidance files live, and the
operator-tunable ceilings / disuse window. This module is the single
source for both so the CLIs never disagree on a path or a budget.

Config lives in a ``guidance:`` block in ``router-config.yaml`` and is
fully defaulted — a repo with no block (every existing consumer) gets
the locked defaults with zero edits:

    guidance:
      active_lessons_ceiling_tokens: 10000   # docs/planning/lessons-learned.md
      project_guidance_ceiling_tokens: 6000  # docs/planning/project-guidance.md
      disuse_window_sets: 20                  # D5 archive trigger

Token estimate is the locked ``ceil(chars / 4)`` heuristic — zero deps,
deterministic, framed as a tokens-read-per-session proxy, not a billing
number.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Dict, Optional

# Canonical guidance filenames (relative to the guidance dir).
LESSONS_ACTIVE = "lessons-learned.md"
LESSONS_ARCHIVE = "lessons-archive.md"
PROJECT_GUIDANCE = "project-guidance.md"

# Where the guidance files live within a repo.
GUIDANCE_RELDIR = os.path.join("docs", "planning")

# Locked default ceilings / window (Set 064 D5). Operators override via the
# router-config ``guidance:`` block without a code change.
DEFAULT_ACTIVE_LESSONS_CEILING_TOKENS = 10000
DEFAULT_PROJECT_GUIDANCE_CEILING_TOKENS = 6000
DEFAULT_DISUSE_WINDOW_SETS = 20


@dataclass(frozen=True)
class GuidanceConfig:
    active_lessons_ceiling_tokens: int = DEFAULT_ACTIVE_LESSONS_CEILING_TOKENS
    project_guidance_ceiling_tokens: int = DEFAULT_PROJECT_GUIDANCE_CEILING_TOKENS
    disuse_window_sets: int = DEFAULT_DISUSE_WINDOW_SETS

    def ceiling_for(self, filename: str) -> Optional[int]:
        """Return the token ceiling for *filename*, or ``None`` if uncapped.

        The active lessons file and project-guidance file are each capped;
        the archive is uncapped (it is never auto-loaded, so its size is
        not a recurring context tax).
        """
        base = os.path.basename(filename)
        if base == LESSONS_ACTIVE:
            return self.active_lessons_ceiling_tokens
        if base == PROJECT_GUIDANCE:
            return self.project_guidance_ceiling_tokens
        return None


def estimate_tokens(text: str) -> int:
    """The locked tokens-read-per-session proxy: ``ceil(chars / 4)``."""
    return math.ceil(len(text) / 4)


def _coerce_int(value: object, default: int) -> int:
    if isinstance(value, bool):  # bool is an int subclass; reject it
        return default
    if isinstance(value, int):
        return value
    return default


def load_guidance_config(config: Optional[dict] = None) -> GuidanceConfig:
    """Build a :class:`GuidanceConfig` from a router-config dict.

    *config* is a parsed ``router-config.yaml`` dict (or ``None`` to use
    the bundled defaults). A missing or partial ``guidance:`` block falls
    back to the locked defaults field-by-field, so older configs keep
    working unchanged.
    """
    if config is None:
        return GuidanceConfig()
    block = config.get("guidance") if isinstance(config, dict) else None
    if not isinstance(block, dict):
        return GuidanceConfig()
    return GuidanceConfig(
        active_lessons_ceiling_tokens=_coerce_int(
            block.get("active_lessons_ceiling_tokens"),
            DEFAULT_ACTIVE_LESSONS_CEILING_TOKENS,
        ),
        project_guidance_ceiling_tokens=_coerce_int(
            block.get("project_guidance_ceiling_tokens"),
            DEFAULT_PROJECT_GUIDANCE_CEILING_TOKENS,
        ),
        disuse_window_sets=_coerce_int(
            block.get("disuse_window_sets"), DEFAULT_DISUSE_WINDOW_SETS
        ),
    )


def guidance_dir(repo_root: Optional[str] = None) -> str:
    """Return the absolute guidance directory for *repo_root* (default: cwd)."""
    root = repo_root if repo_root is not None else os.getcwd()
    return os.path.join(root, GUIDANCE_RELDIR)


def discover_guidance_files(repo_root: Optional[str] = None) -> Dict[str, str]:
    """Return ``{logical_name: abs_path}`` for guidance files that exist.

    Logical names are the module constants (``LESSONS_ACTIVE``,
    ``LESSONS_ARCHIVE``, ``PROJECT_GUIDANCE``). Only files present on disk
    are included, so a repo without an archive yet simply omits that key.
    """
    gdir = guidance_dir(repo_root)
    found: Dict[str, str] = {}
    for name in (LESSONS_ACTIVE, LESSONS_ARCHIVE, PROJECT_GUIDANCE):
        path = os.path.join(gdir, name)
        if os.path.isfile(path):
            found[name] = path
    return found


__all__ = [
    "LESSONS_ACTIVE",
    "LESSONS_ARCHIVE",
    "PROJECT_GUIDANCE",
    "GUIDANCE_RELDIR",
    "DEFAULT_ACTIVE_LESSONS_CEILING_TOKENS",
    "DEFAULT_PROJECT_GUIDANCE_CEILING_TOKENS",
    "DEFAULT_DISUSE_WINDOW_SETS",
    "GuidanceConfig",
    "estimate_tokens",
    "load_guidance_config",
    "guidance_dir",
    "discover_guidance_files",
]
