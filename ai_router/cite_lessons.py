"""Record lesson usage at the source — the D3 citation path (Set 064).

``python -m ai_router.cite_lessons --set <N> <id> <id> ...`` updates the
``last-used-set`` trailer of each cited lesson id to set ``<N>``, in
place, in the guidance markdown files. The work agent runs this as part
of the final commit so the metadata edit lands **inside the committed,
pushed work** — ``git blame`` on a ``last-used-set`` line then points at
the very commit that used the lesson.

Why a separate CLI instead of close_session writing the markdown
-----------------------------------------------------------------

``close_session`` runs *after* the working tree is clean and pushed; a
post-gate markdown mutation would re-dirty the tree. So the markdown
edit is the agent's job (via this CLI, pre-commit) and
``close_session`` only reads ``disposition.lessons_cited`` to stamp the
``closeout_succeeded`` event. See the S1 audit, "the D3 citation seam".

Reactivation loop (D3 lock)
---------------------------

Citing an **archived** id is legal: its ``last-used-set`` is updated in
the archive and the tool prints a ``RECONSIDER`` line so the operator
can move it back to the active tier. The tool never auto-moves entries.

ASCII-only output (Windows cp1252 consoles).
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import List, Optional, Tuple

try:  # test convention: bare import; production: relative fallback
    from guidance_config import (  # type: ignore[import-not-found]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        discover_guidance_files,
    )
    from guidance_meta import find_entry, update_last_used  # type: ignore[import-not-found]
except ImportError:
    from .guidance_config import (  # type: ignore[no-redef]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        discover_guidance_files,
    )
    from .guidance_meta import find_entry, update_last_used  # type: ignore[no-redef]


def normalize_set_label(value: str) -> str:
    """Normalize a ``--set`` argument to the stored ``last-used-set`` form.

    A pure-integer value is zero-padded to three digits (``64`` -> ``064``)
    to match the ``L-<set>-<seq>`` id convention; anything else is passed
    through stripped.
    """
    v = value.strip()
    if v.isdigit():
        return v.zfill(3)
    return v


# Citation outcome tokens.
CITED_ACTIVE = "cited"          # found in the active tier, updated
CITED_ARCHIVED = "reconsider"   # found in the archive, updated + flagged
NOT_FOUND = "not-found"         # id present in no guidance file
NO_TRAILER = "no-trailer"       # heading exists but carries no metadata


def cite_one(
    files: List[Tuple[str, str]], lesson_id: str, set_label: str
) -> Tuple[str, Optional[str]]:
    """Update *lesson_id*'s last-used-set across *files* (label, path pairs).

    Returns ``(outcome, path_or_None)``. Writes the changed file in place
    (UTF-8) when an update lands. Searches the active tier first, then the
    archive; an id lives in exactly one file (id uniqueness, D2).
    """
    for logical_name, path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        entry = find_entry(text, lesson_id)
        if entry is None:
            continue
        if entry.trailer_line is None:  # pragma: no cover - find_entry needs a trailer
            return NO_TRAILER, path
        new_text, _ = update_last_used(text, lesson_id, set_label)
        if new_text is None:
            return NO_TRAILER, path
        if new_text != text:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(new_text)
        archived = entry.meta is not None and entry.meta.status == "archived"
        return (CITED_ARCHIVED if archived else CITED_ACTIVE), path
    return NOT_FOUND, None


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.cite_lessons",
        description=(
            "Record that the given lesson ids were instrumental this set by "
            "updating each lesson's last-used-set in the guidance markdown. "
            "Run as part of the final commit so the edit lands inside the "
            "pushed work. Unknown ids are reported but do not abort the "
            "others; exit non-zero if any id was not found."
        ),
    )
    parser.add_argument(
        "--set",
        dest="set_label",
        required=True,
        help="Session-set number/label whose work cited these lessons (e.g. 64).",
    )
    parser.add_argument(
        "ids",
        nargs="+",
        help="Lesson ids to cite (e.g. L-064-1 L-030-2).",
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Repo root containing docs/planning (default: current directory).",
    )
    args = parser.parse_args(argv)

    set_label = normalize_set_label(args.set_label)
    found = discover_guidance_files(args.repo_root)
    # Active tier first, then archive (reactivation case).
    files = [
        (name, found[name])
        for name in (LESSONS_ACTIVE, LESSONS_ARCHIVE)
        if name in found
    ]
    if not files:
        print(
            "ERROR: no guidance files found under docs/planning "
            "(lessons-learned.md / lessons-archive.md). Nothing to cite."
        )
        return 1

    any_missing = False
    for lesson_id in args.ids:
        outcome, path = cite_one(files, lesson_id, set_label)
        rel = os.path.basename(path) if path else "(none)"
        if outcome == CITED_ACTIVE:
            print(f"[cited]      {lesson_id} -> last-used-set={set_label} ({rel})")
        elif outcome == CITED_ARCHIVED:
            print(
                f"[reconsider] {lesson_id} -> last-used-set={set_label} ({rel}); "
                "id is ARCHIVED -- consider reactivating it into the active tier."
            )
        elif outcome == NO_TRAILER:
            any_missing = True
            print(
                f"[no-meta]    {lesson_id}: a heading matched but it carries no "
                "metadata trailer; cannot record usage. Add a trailer first."
            )
        else:
            any_missing = True
            print(
                f"[not-found]  {lesson_id}: not present in any guidance file. "
                "Check the id (typo?) or that the lesson exists."
            )

    return 1 if any_missing else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "CITED_ACTIVE",
    "CITED_ARCHIVED",
    "NOT_FOUND",
    "NO_TRAILER",
    "normalize_set_label",
    "cite_one",
    "main",
]
