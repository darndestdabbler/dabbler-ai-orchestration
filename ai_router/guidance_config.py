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
from typing import Dict, List, Optional, Tuple

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
class PreloadEntry:
    """One file in the preload manifest (Set 085 F1).

    ``path`` is repo-root-relative (posix-style in config, e.g.
    ``docs/ai-led-session-workflow.md``). ``ceiling_tokens`` is the
    per-file token ceiling (``None`` = uncapped — the file is measured
    and reported but never gated). ``stamp`` opts the file in to
    ``--write-headers`` (default ``False`` — canonical docs and the
    engine bootstrap files are never auto-edited).
    """

    path: str
    ceiling_tokens: Optional[int]
    stamp: bool = False


@dataclass(frozen=True)
class PreloadManifest:
    """The declarative preload manifest (Set 085 F1).

    A list of :class:`PreloadEntry` covering *every* file the workflow
    requires at session start, plus an optional ``total_ceiling_tokens``
    gating their combined size. The manifest is the anti-rebloat gate:
    at ceiling, adding prose to any preloaded file (or the corpus as a
    whole) fails ``guidance_report --check``, so growth is token-neutral
    by construction. Ceilings ratchet **down only** — raising one is an
    operator-authorized config edit with a stated reason.
    """

    files: Tuple[PreloadEntry, ...]
    total_ceiling_tokens: Optional[int] = None
    # Count of ``files:`` items that were declared but could not be built
    # into a valid entry (non-mapping, or missing/empty ``path``). Such an
    # item must NOT be silently dropped from the gate -- a typo in one
    # entry would otherwise remove that required-reading file from
    # enforcement while the rest of the manifest stays green
    # (I-085-S1-8). The reporter fails ``--check`` closed when this is > 0.
    malformed_entry_count: int = 0


@dataclass(frozen=True)
class GuidanceConfig:
    active_lessons_ceiling_tokens: int = DEFAULT_ACTIVE_LESSONS_CEILING_TOKENS
    project_guidance_ceiling_tokens: int = DEFAULT_PROJECT_GUIDANCE_CEILING_TOKENS
    disuse_window_sets: int = DEFAULT_DISUSE_WINDOW_SETS
    # Set 085 F1: the optional preload manifest. ``None`` when the config
    # declares no ``preload:`` block — a repo with no manifest (every
    # existing consumer) keeps exactly the two-file Set-064 behavior, so
    # this is a universal-core / gated-extension addition.
    preload: Optional[PreloadManifest] = None
    # True iff a ``preload:`` key was PRESENT in the guidance block, even
    # if it was malformed and parsed to ``preload=None``. This lets the
    # ``--check`` gate distinguish "no manifest declared" (legacy, fail
    # open) from "manifest declared but unbuildable" (fail closed) --
    # otherwise a typo silently disables the gate (R2 remediation
    # I-085-S1-3).
    preload_declared: bool = False

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


def _coerce_nonneg_int_or_none(value: object) -> Optional[int]:
    """Coerce a ceiling value to a non-negative int, else ``None`` (uncapped).

    Mirrors :func:`_coerce_int`'s bool guard (``True``/``False`` are int
    subclasses and must not read as ``1``/``0``) but returns ``None``
    rather than a default so a missing or malformed ceiling means
    "uncapped" — the file is still measured and reported, just not gated.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _parse_preload_manifest(block: dict) -> Optional[PreloadManifest]:
    """Build a :class:`PreloadManifest` from a ``guidance.preload`` mapping.

    Tolerant and deterministic (the module's ``_coerce_*`` philosophy —
    never raise; a session boundary must not crash on a config typo):

    - ``preload`` absent or not a mapping -> ``None`` (no manifest ->
      legacy two-file behavior).
    - ``files`` absent or not a list -> ``None``.
    - An entry that is not a mapping, or whose ``path`` is missing / not a
      non-empty string, cannot name a file. It is not added to ``files``
      but is **counted** in ``malformed_entry_count`` so the gate can fail
      closed rather than silently drop a declared file (I-085-S1-8).
    - ``ceiling_tokens`` that is not a non-negative int (bad type,
      float, bool, negative) coerces to ``None`` (uncapped) but the entry
      is kept, so the file stays visible in the report and still counts
      toward the total -- it is measured, just not per-file ceiling-gated.
    - ``stamp`` defaults to ``False`` unless it is exactly ``True``.
    - Returns ``None`` only when ``preload`` / ``files`` is structurally
      absent/wrong. A ``files:`` list with zero valid entries but one or
      more malformed ones returns a manifest carrying the malformed count
      (so ``--check`` fails), not ``None``.
    """
    raw = block.get("preload")
    if not isinstance(raw, dict):
        return None
    files_raw = raw.get("files")
    if not isinstance(files_raw, list):
        return None
    entries: List[PreloadEntry] = []
    malformed = 0
    for item in files_raw:
        if not isinstance(item, dict):
            malformed += 1
            continue
        path = item.get("path")
        if not isinstance(path, str) or not path.strip():
            malformed += 1
            continue
        stamp = item.get("stamp")
        entries.append(
            PreloadEntry(
                path=path.strip(),
                ceiling_tokens=_coerce_nonneg_int_or_none(
                    item.get("ceiling_tokens")
                ),
                stamp=stamp is True,
            )
        )
    if not entries and not malformed:
        return None
    return PreloadManifest(
        files=tuple(entries),
        total_ceiling_tokens=_coerce_nonneg_int_or_none(
            raw.get("total_ceiling_tokens")
        ),
        malformed_entry_count=malformed,
    )


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
        preload=_parse_preload_manifest(block),
        preload_declared="preload" in block,
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
    "PreloadEntry",
    "PreloadManifest",
    "GuidanceConfig",
    "estimate_tokens",
    "load_guidance_config",
    "guidance_dir",
    "discover_guidance_files",
]
