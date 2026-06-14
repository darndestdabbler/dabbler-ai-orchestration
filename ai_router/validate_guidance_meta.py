"""Validate per-lesson metadata trailers (Set 064, D2 validator).

CI / pre-commit wireable: ``python -m ai_router.validate_guidance_meta``
walks the active + archive lessons files (and any explicitly named
files), validates every metadata trailer, and enforces cross-file id
uniqueness. Exit non-zero on any error so it can gate a commit.

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
    from guidance_meta import validate_documents  # type: ignore[import-not-found]
except ImportError:
    from .guidance_config import (  # type: ignore[no-redef]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        discover_guidance_files,
    )
    from .guidance_meta import validate_documents  # type: ignore[no-redef]


def _default_files(repo_root: Optional[str] = None) -> List[str]:
    """The active + archive lessons files that carry trailers, if present."""
    found = discover_guidance_files(repo_root)
    return [found[name] for name in (LESSONS_ACTIVE, LESSONS_ARCHIVE) if name in found]


def _read_docs(paths: List[str]) -> Tuple[List[Tuple[str, str]], List[str]]:
    docs: List[Tuple[str, str]] = []
    errors: List[str] = []
    for path in paths:
        try:
            with open(path, "r", encoding="utf-8") as f:
                docs.append((os.path.basename(path), f.read()))
        except OSError as exc:
            errors.append(f"could not read {path}: {exc}")
    return docs, errors


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.validate_guidance_meta",
        description=(
            "Validate per-lesson metadata trailers across the guidance "
            "files. Exit non-zero on any error (malformed trailer, bad id "
            "format, duplicate id, bad enum). Warnings (missing added-set, "
            "unknown keys) do not fail unless --strict."
        ),
    )
    parser.add_argument(
        "files",
        nargs="*",
        help=(
            "Markdown files to validate. Default: lessons-learned.md + "
            "lessons-archive.md under ./docs/planning."
        ),
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as failures too.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only print on failure.",
    )
    args = parser.parse_args(argv)

    paths = list(args.files) if args.files else _default_files()
    if not paths:
        print("No guidance files found to validate (looked for "
              "docs/planning/lessons-learned.md, lessons-archive.md).")
        return 0

    docs, read_errors = _read_docs(paths)
    result = validate_documents(docs)
    errors = read_errors + result.errors

    if errors:
        print(f"FAIL: {len(errors)} guidance-metadata error(s):")
        for err in errors:
            print(f"  [error] {err}")
    if result.warnings:
        for warn in result.warnings:
            print(f"  [warn]  {warn}")

    failed = bool(errors) or (args.strict and bool(result.warnings))
    if failed:
        return 1

    if not args.quiet:
        n_ids = len(result.ids)
        print(f"OK: {n_ids} lesson id(s) validated across {len(docs)} file(s).")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = ["main"]
