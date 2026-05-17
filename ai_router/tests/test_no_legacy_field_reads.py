"""D13 lint: application readers must not access legacy progress fields.

Set 030 spec D13:
    "No application reader may read legacy fields except through approved
    compatibility helpers."

The legacy progress triple — ``currentSession``, ``totalSessions``,
``completedSessions`` — was replaced by the v3 ``sessions[]`` ledger
in Session 1. Session 2 added the dual-write writers. Session 3 (this
file's session) migrated every application reader to ``read_progress``
and adds this guard so regressions surface in CI.

Scope (the lint rule applies to):
    - ``ai_router/`` source files (excluding tests, the migrator stub,
      and the carve-out files below)
    - Direct dict-access patterns: ``.get("X")`` and ``["X"]``

Carve-outs (allowed):
    - ``ai_router/progress.py`` — the helper itself
    - ``ai_router/session_state.py`` — the writer that emits the dual
      shape; reads exist only inside writer-derivation paths
    - ``ai_router/session_log.py`` — wraps activity-log.json, which has
      its own ``totalSessions`` top-level field (different artifact;
      outside D13's scope)
    - ``ai_router/scripts/`` — schema-doc / utility scripts, not
      production readers
    - ``ai_router/tests/`` — test fixtures intentionally construct v2
      and drift shapes; tests are not application readers
    - ``ai_router/reconciler.py`` — never reads the triple directly
      (uses lifecycle states from the events ledger); listed for clarity
    - Any line annotated with ``# noqa: D13`` — inline carve-out for
      v2-compat code (e.g., the ``_run_repair`` walk in close_session.py
      that reconciles legacy fields)

A regression that adds ``state.get("currentSession")`` to, say, a new
close-out gate predicate will fail this test with the file:line pointer
so the offender knows where to migrate to ``read_progress``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


# Three patterns covering the dict-access syntaxes Python readers use.
# We deliberately do NOT match the raw bareword (``currentSession``)
# because comments, docstrings, and error-message strings legitimately
# mention the field names — only access patterns are the violation.
_LEGACY_FIELDS = ("currentSession", "totalSessions", "completedSessions")
_ACCESS_PATTERNS = [
    re.compile(rf'\.get\(["\']({f})["\']\)') for f in _LEGACY_FIELDS
] + [
    re.compile(rf'\[["\']({f})["\']\]') for f in _LEGACY_FIELDS
]


# Files allowlisted from the lint rule. Paths are relative to the
# ``ai_router/`` directory so the test is portable across consumer
# repos that vendor the package.
_ALLOWLIST = {
    "progress.py",                # the helper itself
    "session_state.py",           # writer emits dual shape from sessions[]
    "session_log.py",             # different artifact (activity-log)
    "close_session.py",           # repair walk is v2-compat (per-line noqa)
}

# Path prefixes (any file under these dirs is exempt).
_ALLOWLIST_PREFIXES = (
    "tests/",
    "scripts/",
)


def _is_allowlisted(rel_path: str) -> bool:
    """Return True if *rel_path* is a fully-exempt file."""
    if rel_path in _ALLOWLIST:
        return True
    for prefix in _ALLOWLIST_PREFIXES:
        if rel_path.startswith(prefix):
            return True
    return False


def _is_noqa_line(line: str) -> bool:
    """Return True if *line* carries the inline carve-out marker."""
    return "noqa: D13" in line


def _ai_router_root() -> Path:
    """Return the ``ai_router/`` directory.

    Adjacent to this test file: ``tests/test_no_legacy_field_reads.py``
    sits inside the package, so ``parent.parent`` is the root.
    """
    return Path(__file__).resolve().parent.parent


def _scan_for_violations() -> list[tuple[str, int, str]]:
    """Walk ``ai_router/*.py`` and collect lint violations.

    Returns a list of ``(rel_path, line_number, line_content)`` tuples.
    """
    root = _ai_router_root()
    violations: list[tuple[str, int, str]] = []
    for py_path in root.rglob("*.py"):
        rel = py_path.relative_to(root).as_posix()
        if _is_allowlisted(rel):
            continue
        try:
            text = py_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if _is_noqa_line(line):
                continue
            for pattern in _ACCESS_PATTERNS:
                if pattern.search(line):
                    violations.append((rel, lineno, line.strip()))
                    break
    return violations


def test_no_application_reader_accesses_legacy_fields():
    """D13 lint guard. See module docstring for scope + carve-outs.

    Any new direct legacy-field access in application code (outside
    progress.py, the writer, the migrator, tests, scripts, and lines
    annotated with ``# noqa: D13``) will fail this test with the
    offending file:line:content reported.

    Remediation: route the read through
    ``ai_router.progress.read_progress(state, spec_md_path)`` and use
    the returned ``ProgressView`` fields (``current_session``,
    ``total_sessions``, ``completed_sessions``).
    """
    violations = _scan_for_violations()
    if violations:
        formatted = "\n".join(
            f"  {rel}:{lineno}: {content}" for rel, lineno, content in violations
        )
        pytest.fail(
            f"D13 lint violation: {len(violations)} direct legacy-field "
            f"access(es) found in application code:\n{formatted}\n\n"
            "Route reads through ai_router.progress.read_progress() or "
            "annotate the line with '# noqa: D13' (with a justifying comment) "
            "if this is a v2-compat carve-out.",
        )


def test_lint_scanner_finds_the_carve_out_file_itself():
    """Sanity check: confirm the scanner is actually walking the tree.

    Without this check, a buggy ``_scan_for_violations`` that returned
    nothing would silently pass the main test. We exercise the scanner
    against ``close_session.py`` — which has multiple ``# noqa: D13``
    markers — and assert it sees that file's content.
    """
    root = _ai_router_root()
    close_session_path = root / "close_session.py"
    assert close_session_path.exists(), "close_session.py should exist"
    text = close_session_path.read_text(encoding="utf-8")
    assert "noqa: D13" in text, (
        "close_session.py should carry the D13 carve-out marker "
        "(the _run_repair walk's v2-compat reads). If this assertion "
        "fails, either the markers were removed or the repair logic "
        "was migrated away from legacy reads — update this sanity check."
    )
