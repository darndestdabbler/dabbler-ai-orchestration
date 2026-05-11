"""Emit a fully-populated v2 ``session-state.json`` example from the live schema.

Replaces the previous practice of committing a static example file alongside
the schema definition. Static examples drift silently — every change to
:mod:`session_state` (new field, renamed field, changed default) requires a
human to remember to update the example. This module makes the example a
*function of the schema* instead: anyone can regenerate it, and the drift
check (``--check``) fails CI / pre-commit when the regenerated output no
longer matches the committed reference at
``docs/session-state-schema-example.json``.

CLI
---

::

    # Print the example to stdout
    python ai_router/dump_session_state_schema.py

    # Write the example to a file
    python ai_router/dump_session_state_schema.py --write path/to/example.json

    # Emit JSONC (JSON-with-comments) for human-facing documentation
    python ai_router/dump_session_state_schema.py --include-comments

    # Drift check: regenerate and compare to the committed reference.
    # Exits 0 on match, 1 on drift with a pointer at the generator.
    python ai_router/dump_session_state_schema.py --check

The pure-JSON output (no ``--include-comments``) is the form that
``--check`` compares against the reference. Comments are a presentation
concern; they would defeat byte-exact drift detection.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

if __name__ == "__main__" and __package__ in (None, ""):
    # Production CLI path: invoked as
    # ``python ai_router/dump_session_state_schema.py``. The parent
    # directory ``ai_router/`` holds the sibling modules; adding it to
    # sys.path lets the module import them by filename, matching the
    # pattern used by close_session.py / reconciler.py / restart_role.py.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from session_state import (  # type: ignore[import-not-found]
        SCHEMA_VERSION,
        SessionLifecycleState,
    )
except ImportError:  # pragma: no cover — package-style import path
    from .session_state import (  # type: ignore[no-redef]
        SCHEMA_VERSION,
        SessionLifecycleState,
    )


# Single-source reference path. Tests + the --check flag both reach for
# the file at this location, so consumers that move the docs tree only
# need to update the constant.
REFERENCE_PATH = "docs/session-state-schema-example.json"


# Per-key annotations for the JSONC (--include-comments) form. Keys not
# in this map emit without a comment. Edit alongside the schema rather
# than after the fact so the documentation tracks the code.
_FIELD_COMMENTS = {
    "schemaVersion": "v2 since Set 001 Session 3; v1 files are migrated lazily on read.",
    "sessionSetName": "basename of the session-set directory; not the full path.",
    "currentSession": "1-based index; flips at register_session_start.",
    "totalSessions": "may be null on legacy sets that never declared a total.",
    "status": "v1-compatible binary signal: 'in-progress' | 'complete'. Kept for VS Code Session Set Explorer.",
    "lifecycleState": "v2 granular state: work_in_progress | work_verified | closeout_pending | closeout_blocked | closed.",
    "startedAt": "ISO 8601 with offset; written at register_session_start.",
    "completedAt": "ISO 8601 with offset; null until mark_session_complete flips the snapshot.",
    "verificationVerdict": "VERIFIED | ISSUES_FOUND | null. Set at mark_session_complete when known.",
    "orchestrator": "engine + provider + model + effort for the *current* session's driver.",
    "nextOrchestrator": (
        "Recommendation for the next session. Required (non-null) when "
        "currentSession < totalSessions; null on the final session. "
        "reason.code is one of: continue-current-trajectory | "
        "switch-due-to-blocker | switch-due-to-cost | other. "
        "reason.specifics must be at least 30 characters."
    ),
}


def build_example_state() -> dict:
    """Return a fully-populated v2 ``session-state.json`` dict.

    The return value is the canonical example: every field carries a
    realistic, human-readable value (no ``null`` placeholders for fields
    that the schema permits to be non-null). ``completedAt`` and
    ``verificationVerdict`` are populated to show the *closed* shape;
    consumers reading mid-session shapes should refer to the
    :func:`session_state.register_session_start` writer instead.

    Built from the live schema constants — :data:`SCHEMA_VERSION` and
    :class:`SessionLifecycleState` — so a constant-renaming refactor
    surfaces here on the next ``--check`` rather than going silent.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": "example-session-set",
        "currentSession": 2,
        "totalSessions": 4,
        "status": "complete",
        "lifecycleState": SessionLifecycleState.CLOSED.value,
        "startedAt": "2026-04-30T13:00:00-04:00",
        "completedAt": "2026-04-30T14:30:00-04:00",
        "verificationVerdict": "VERIFIED",
        "orchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
        },
        "nextOrchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "reason": {
                "code": "continue-current-trajectory",
                "specifics": (
                    "Session 2 verified clean; the same orchestrator is "
                    "well-positioned to continue with Session 3."
                ),
            },
        },
    }


def format_example(
    state: dict,
    *,
    include_comments: bool = False,
) -> str:
    """Render *state* as JSON or JSONC.

    JSON form (``include_comments=False``) is byte-deterministic:
    ``indent=2``, ``sort_keys=False`` (preserves the schema's logical
    field order), trailing newline. This is the form that ``--check``
    compares against the reference file, so any change in ``json.dumps``
    options here MUST be matched in the test suite's normalization.

    JSONC form annotates each top-level key with the
    :data:`_FIELD_COMMENTS` entry on a preceding ``//`` line. Nested
    keys are not annotated (the comments would clutter without adding
    information that isn't already in the field name + the docstring on
    the dataclass). Strict JSON parsers will reject the JSONC output —
    that is intentional. JSONC is for humans only.
    """
    if not include_comments:
        return json.dumps(state, indent=2) + "\n"

    # JSONC: emit a ``//``-prefixed comment line above each top-level key.
    # We render the JSON normally, then walk the rendered lines and
    # inject comments where a top-level key appears. Top-level keys are
    # exactly the lines that start with two spaces followed by ``"name":``
    # — nested keys have four-or-more spaces of leading indent.
    #
    # The regex below tolerates JSON-escaped characters inside the key
    # (escaped quotes, backslashes, control-char escapes); naive
    # ``str.split('"')`` would mis-split a key like ``"a\"b"``. None of
    # the current schema keys contain such escapes, but the parser
    # should not become a constraint on future field names.
    rendered = json.dumps(state, indent=2)
    out_lines: list[str] = []
    for raw_line in rendered.splitlines():
        match = _TOP_LEVEL_KEY_RE.match(raw_line)
        if match is not None:
            # The matched group is a JSON-escaped string body; round-trip
            # through ``json.loads`` to recover the actual key text the
            # _FIELD_COMMENTS table is indexed by.
            key = json.loads(f'"{match.group(1)}"')
            comment = _FIELD_COMMENTS.get(key)
            if comment is not None:
                out_lines.append(f"  // {comment}")
        out_lines.append(raw_line)
    return "\n".join(out_lines) + "\n"


# Top-level key matcher for JSONC injection: exactly two-space indent,
# JSON-string body (with escape support), then ``:``. Compiled once so
# rendering large state dicts does not re-parse the regex per line.
_TOP_LEVEL_KEY_RE = re.compile(r'^  "((?:[^"\\]|\\.)*)"\s*:')


def _resolve_reference_path(repo_root: Optional[Path] = None) -> Path:
    """Resolve :data:`REFERENCE_PATH` against *repo_root* (default: cwd).

    The drift check is invoked from CI / pre-commit hooks, both of which
    run with cwd at the repo root. Resolving relative to cwd matches
    that contract; tests pass an explicit *repo_root* via the
    :func:`run_check` helper instead of mutating cwd.
    """
    base = Path.cwd() if repo_root is None else Path(repo_root)
    return base / REFERENCE_PATH


def run_check(
    *,
    repo_root: Optional[Path] = None,
    stderr=None,
) -> int:
    """Compare the regenerated example to the committed reference.

    Returns ``0`` on match, ``1`` on drift (or missing reference). On
    drift, prints a one-line operator hint to *stderr* (default
    :data:`sys.stderr`) pointing at the regeneration command — the goal
    is that a human reading a CI failure can fix the drift in one step.
    """
    if stderr is None:
        stderr = sys.stderr

    reference_path = _resolve_reference_path(repo_root)
    expected = format_example(build_example_state(), include_comments=False)

    if not reference_path.is_file():
        print(
            f"DRIFT: reference file missing at {reference_path}. "
            f"Regenerate with: python ai_router/dump_session_state_schema.py "
            f"--write {REFERENCE_PATH}",
            file=stderr,
        )
        return 1

    actual = reference_path.read_text(encoding="utf-8")
    if actual != expected:
        print(
            f"DRIFT: {reference_path} no longer matches the live "
            f"session-state schema. Regenerate with: python "
            f"ai_router/dump_session_state_schema.py --write {REFERENCE_PATH}",
            file=stderr,
        )
        return 1

    return 0


def main(argv: Optional[list] = None) -> int:
    """CLI entry point. Returns the process exit code.

    ``--check`` short-circuits both ``--write`` and ``--include-comments``
    because the drift check operates on the canonical (no-comments)
    form, and writing a file is irrelevant when the goal is to
    *compare* against a committed file.
    """
    parser = argparse.ArgumentParser(
        prog="dump_session_state_schema",
        description=(
            "Emit a fully-populated v2 session-state.json example from "
            "the live schema, or check the committed reference for drift."
        ),
    )
    parser.add_argument(
        "--write",
        metavar="PATH",
        help="Write the example to PATH instead of stdout.",
    )
    parser.add_argument(
        "--include-comments",
        action="store_true",
        help="Emit JSONC (JSON with // comments) instead of pure JSON.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            f"Compare the regenerated example to {REFERENCE_PATH} and "
            f"exit non-zero on drift. Ignores --write and "
            f"--include-comments."
        ),
    )
    args = parser.parse_args(argv)

    if args.check:
        return run_check()

    rendered = format_example(
        build_example_state(),
        include_comments=args.include_comments,
    )

    if args.write:
        out_path = Path(args.write)
        if out_path.parent and not out_path.parent.exists():
            out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(rendered, encoding="utf-8")
        # Operator-visible confirmation on stderr so stdout stays clean
        # for callers that pipe the path back into another tool.
        print(f"Wrote {out_path}", file=sys.stderr)
    else:
        sys.stdout.write(rendered)

    return 0


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    raise SystemExit(main())
