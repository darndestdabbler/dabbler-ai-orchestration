"""One-shot CLI to backfill ``session-state.json`` across all session sets.

Writes the canonical not-started / in-progress / complete shape into any
``docs/session-sets/<slug>/`` folder that has a ``spec.md`` but no
``session-state.json``. Folders that already have a state file are left
untouched — Set 7's invariant is *existence*, not field-value
normalization, so pre-Set-7 drift such as ``status: "completed"`` vs the
canonical ``"complete"`` is preserved.

CLI
---

::

    # Walk docs/session-sets and synthesize where missing
    python -m ai_router.backfill_session_state

    # Point at a different base directory (e.g., a consumer repo)
    python -m ai_router.backfill_session_state --base-dir path/to/sets

    # Audit-only: print which folders would be synthesized, write nothing
    python -m ai_router.backfill_session_state --dry-run

The command is idempotent. Running it twice is harmless: the second run
finds every folder already covered and exits with a count of zero.

Consumer repos (``dabbler-access-harvester``, ``dabbler-platform``)
should run this once after they sync this repo's ai-router copy. The
lazy-synthesis fallback in :func:`session_state.read_status` (Set 7
Session 2) covers folders that slip through, so the CLI is recommended
but not required.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional

if __name__ == "__main__" and __package__ in (None, ""):
    # Production CLI path: invoked as
    # ``python ai-router/backfill_session_state.py``. Mirrors the
    # sys.path tweak in ``dump_session_state_schema.py`` so sibling
    # modules import by filename. The ``python -m`` form goes through
    # the package import path and does not hit this branch.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from session_state import (  # type: ignore[import-not-found]
        _planned_backfill_paths,
        backfill_session_state_files,
    )
except ImportError:  # pragma: no cover — package-style import path
    from .session_state import (  # type: ignore[no-redef]
        _planned_backfill_paths,
        backfill_session_state_files,
    )


DEFAULT_BASE_DIR = "docs/session-sets"


def main(argv: Optional[list] = None) -> int:
    """CLI entry point. Returns the process exit code.

    The exit code is always ``0`` on a successful walk — even when no
    folders needed synthesis. A non-zero exit would imply a precondition
    failure (e.g., base directory missing) but the default base dir
    being absent is a valid no-op (consumer repos that haven't laid out
    the directory yet), so it does not warrant a failure code either.
    """
    parser = argparse.ArgumentParser(
        prog="backfill_session_state",
        description=(
            "Synthesize session-state.json for any session-set folder "
            "that has a spec.md but no state file. Existing files are "
            "preserved untouched."
        ),
    )
    parser.add_argument(
        "--base-dir",
        default=DEFAULT_BASE_DIR,
        metavar="PATH",
        help=(
            f"Directory containing per-session-set folders "
            f"(default: {DEFAULT_BASE_DIR})."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Print the folders that would be synthesized without "
            "writing anything."
        ),
    )
    args = parser.parse_args(argv)

    # Plan-then-write: ``_planned_backfill_paths`` returns the same
    # folder list the public writer would have processed, so we can
    # print per-path output for both dry-run and live modes without
    # exposing the path list through the public API surface (which the
    # spec pins at ``-> int``).
    paths = _planned_backfill_paths(args.base_dir)

    if args.dry_run:
        verb = "would synthesize"
        count = len(paths)
    else:
        verb = "synthesized"
        count = backfill_session_state_files(args.base_dir)

    print(f"{verb} {count} session-state.json file(s)")
    for path in paths:
        print(f"  {path}")

    return 0


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    raise SystemExit(main())
