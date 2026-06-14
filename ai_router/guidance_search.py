"""Search the guidance files, including the never-auto-loaded archive (D1).

The archive (``lessons-archive.md``) is excluded from the always-load set
(D4) so it does not tax every session start — but its content is
**preserved, not deleted**, and must stay findable on demand. This is
that on-demand surface: ``python -m ai_router.guidance_search <regex>``
searches the active lessons + project-guidance by default, and the
archive too with ``--archive`` (or only the archive with
``--archive-only``).

A thin, dependency-free ``grep`` over the guidance markdown — it exists
so "where did we write down X?" has a first-class answer that reaches
archived knowledge, which a plain editor file-open would miss.

ASCII-only output (Windows cp1252 consoles).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from typing import List, Optional

try:  # test convention: bare import; production: relative fallback
    from guidance_config import (  # type: ignore[import-not-found]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        PROJECT_GUIDANCE,
        discover_guidance_files,
    )
    from guidance_meta import parse_document  # type: ignore[import-not-found]
except ImportError:
    from .guidance_config import (  # type: ignore[no-redef]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        PROJECT_GUIDANCE,
        discover_guidance_files,
    )
    from .guidance_meta import parse_document  # type: ignore[no-redef]


@dataclass
class Match:
    file: str
    line_no: int
    text: str
    lesson_id: str  # the enclosing lesson's id, or "" if none


def _lesson_at_line(entries, line_no: int) -> str:
    """Return the id of the lesson whose heading precedes *line_no* (1-based)."""
    current = ""
    for e in entries:
        if e.heading_line + 1 <= line_no:
            current = e.lesson_id
        else:
            break
    return current


def search_text(label: str, text: str, pattern: "re.Pattern") -> List[Match]:
    entries = parse_document(text)
    matches: List[Match] = []
    for i, line in enumerate(text.split("\n")):
        if pattern.search(line):
            matches.append(
                Match(
                    file=label,
                    line_no=i + 1,
                    text=line.rstrip("\r"),
                    lesson_id=_lesson_at_line(entries, i + 1),
                )
            )
    return matches


def _target_files(repo_root, include_archive, archive_only):
    found = discover_guidance_files(repo_root)
    names: List[str]
    if archive_only:
        names = [LESSONS_ARCHIVE]
    else:
        names = [LESSONS_ACTIVE, PROJECT_GUIDANCE]
        if include_archive:
            names.append(LESSONS_ARCHIVE)
    return [(name, found[name]) for name in names if name in found]


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.guidance_search",
        description=(
            "Regex-search the guidance files. Searches the always-loaded "
            "active lessons + project-guidance by default; --archive adds "
            "the never-auto-loaded lessons-archive.md, --archive-only "
            "searches just the archive."
        ),
    )
    parser.add_argument("pattern", help="Regular expression to search for.")
    parser.add_argument(
        "--archive", action="store_true", help="Include lessons-archive.md."
    )
    parser.add_argument(
        "--archive-only", action="store_true", help="Search only lessons-archive.md."
    )
    parser.add_argument(
        "-i", "--ignore-case", action="store_true", help="Case-insensitive match."
    )
    parser.add_argument(
        "--repo-root", default=None, help="Repo root (default: current directory)."
    )
    args = parser.parse_args(argv)

    flags = re.IGNORECASE if args.ignore_case else 0
    try:
        pattern = re.compile(args.pattern, flags)
    except re.error as exc:
        print(f"ERROR: invalid regex {args.pattern!r}: {exc}")
        return 2

    files = _target_files(args.repo_root, args.archive, args.archive_only)
    if not files:
        print("No guidance files found to search under docs/planning.")
        return 1

    total = 0
    for label, path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
        except OSError as exc:
            print(f"  (could not read {label}: {exc})")
            continue
        for m in search_text(label, text, pattern):
            total += 1
            id_tag = f" [{m.lesson_id}]" if m.lesson_id else ""
            print(f"{m.file}:{m.line_no}{id_tag}: {m.text.strip()}")

    if total == 0:
        print(f"No matches for {args.pattern!r}.")
    return 0 if total else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = ["Match", "search_text", "main"]
