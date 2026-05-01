"""Tests for the cancelled-state rendering in ``print_session_set_status``.

Covers the three Set 8 / Session 1 acceptance items the verifier flagged:

* ``[!]`` glyph appears for cancelled sets,
* cancelled sets sort to the bottom of the table,
* ``CANCELLED.md`` precedence wins over the on-disk ``status`` field.

These complement the file-shape tests in ``test_session_lifecycle.py``.
"""

from __future__ import annotations

import importlib.util
import io
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _load_ai_router():
    """Load the hyphen-named ``ai-router`` package as ``ai_router``."""
    init = REPO_ROOT / "ai-router" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "ai_router_for_print_test",
        str(init),
        submodule_search_locations=[str(init.parent)],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router_for_print_test"] = mod
    spec.loader.exec_module(mod)
    return mod


def _make_set(
    base: Path,
    name: str,
    *,
    status: str | None = None,
    has_cancelled: bool = False,
    has_change_log: bool = False,
    has_activity_log: bool = False,
    last_touched: str = "2026-05-01T12:00:00-04:00",
) -> Path:
    """Build a session-set folder with the requested signal mix."""
    set_dir = base / name
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# stub\n", encoding="utf-8")
    if has_change_log:
        (set_dir / "change-log.md").write_text("# Changes\n", encoding="utf-8")
    if has_activity_log:
        (set_dir / "activity-log.json").write_text(
            json.dumps({"entries": [{"dateTime": last_touched, "sessionNumber": 1}]}),
            encoding="utf-8",
        )
    if has_cancelled:
        (set_dir / "CANCELLED.md").write_text(
            "# Cancellation history\n\nCancelled on x\n\n", encoding="utf-8"
        )
    if status is not None:
        (set_dir / "session-state.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "status": status,
                    "currentSession": 1,
                    "totalSessions": 3,
                    "startedAt": last_touched,
                    "completedAt": last_touched if status == "complete" else None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    return set_dir


@pytest.fixture
def ar():
    return _load_ai_router()


def _capture(ar, base_dir: Path) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        ar.print_session_set_status(str(base_dir))
    return buf.getvalue()


def test_cancelled_set_renders_with_bang_glyph(ar, tmp_path: Path) -> None:
    base = tmp_path / "session-sets"
    _make_set(
        base,
        "abandoned-feature",
        status="cancelled",
        has_cancelled=True,
        has_activity_log=True,
    )
    out = _capture(ar, base)
    # Row line for the cancelled set carries the [!] glyph.
    assert "[!]  abandoned-feature" in out, out
    # Legend column for cancelled appears now that the bucket is non-empty.
    assert "[!] cancelled: 1" in out, out


def test_cancelled_legend_column_is_silent_when_no_cancelled_sets(
    ar, tmp_path: Path
) -> None:
    base = tmp_path / "session-sets"
    _make_set(base, "feature-a", status="in-progress", has_activity_log=True)
    _make_set(base, "feature-b", status="complete", has_change_log=True)
    out = _capture(ar, base)
    # No [!] in the rows or the legend.
    assert "[!]" not in out, out


def test_cancelled_sets_sort_to_bottom(ar, tmp_path: Path) -> None:
    base = tmp_path / "session-sets"
    _make_set(base, "active", status="in-progress", has_activity_log=True)
    _make_set(base, "fresh", status="not-started")
    _make_set(base, "shipped", status="complete", has_change_log=True)
    _make_set(base, "scrapped", status="cancelled", has_cancelled=True)
    out = _capture(ar, base)
    # Locate the row for each set in the rendered output and assert the
    # cancelled row is below every other state's row.
    pos_active = out.index("[~]  active")
    pos_fresh = out.index("[ ]  fresh")
    pos_shipped = out.index("[x]  shipped")
    pos_scrapped = out.index("[!]  scrapped")
    assert pos_scrapped > max(pos_active, pos_fresh, pos_shipped), (
        f"cancelled row should sort below every other state. "
        f"positions: active={pos_active}, fresh={pos_fresh}, "
        f"shipped={pos_shipped}, scrapped={pos_scrapped}"
    )


def test_cancelled_md_precedence_beats_in_progress_status_field(
    ar, tmp_path: Path
) -> None:
    """Spec line 21-23: a set with both ``activity-log.json`` (status
    in-progress on disk) and ``CANCELLED.md`` shows as Cancelled, not
    in-progress. The marker file is the highest-precedence signal.
    """
    base = tmp_path / "session-sets"
    _make_set(
        base,
        "midflight-cancel",
        status="in-progress",  # state file says in-progress
        has_activity_log=True,
        has_cancelled=True,  # but the marker file wins
    )
    out = _capture(ar, base)
    assert "[!]  midflight-cancel" in out
    # And in-progress is empty per the legend (no other [~] sets).
    assert "[~] in-progress: 0" in out, out


def test_cancelled_md_precedence_beats_complete_status_field(
    ar, tmp_path: Path
) -> None:
    """A done set the operator cancelled mid-stream still renders
    cancelled. Mirrors the precedence rule for the in-progress case.
    """
    base = tmp_path / "session-sets"
    _make_set(
        base,
        "shipped-then-cancelled",
        status="complete",
        has_change_log=True,
        has_cancelled=True,
    )
    out = _capture(ar, base)
    assert "[!]  shipped-then-cancelled" in out
    assert "[x] done: 0" in out, out
