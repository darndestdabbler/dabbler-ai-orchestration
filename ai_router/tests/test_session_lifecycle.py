"""Unit tests for ai_router/session_lifecycle.py.

Mirrors the TS suite in
``tools/dabbler-ai-orchestration/src/test/suite/cancelLifecycle.test.ts``.
The two writers must produce byte-identical output, so the assertions
here are deliberately the same shape as the TS tests.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import pytest

import session_lifecycle as sl


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _write_state(dir_: Path, state: dict) -> None:
    (dir_ / "session-state.json").write_text(
        json.dumps(state, indent=2) + "\n", encoding="utf-8"
    )


def _read_state(dir_: Path) -> dict:
    return json.loads((dir_ / "session-state.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# predicates
# ---------------------------------------------------------------------------


def test_is_cancelled_false_on_untouched_folder(tmp_path: Path) -> None:
    assert sl.is_cancelled(str(tmp_path)) is False


def test_was_restored_false_when_no_markers_present(tmp_path: Path) -> None:
    assert sl.was_restored(str(tmp_path)) is False


def test_was_restored_false_when_cancelled_md_also_present(tmp_path: Path) -> None:
    """CANCELLED.md alongside RESTORED.md is a manual-edit shape; the
    cancelled-wins precedence rule means was_restored must report False."""
    (tmp_path / "CANCELLED.md").write_text("x", encoding="utf-8")
    (tmp_path / "RESTORED.md").write_text("x", encoding="utf-8")
    assert sl.is_cancelled(str(tmp_path)) is True
    assert sl.was_restored(str(tmp_path)) is False


# ---------------------------------------------------------------------------
# cancel_session_set — markdown shape
# ---------------------------------------------------------------------------


def test_first_cancel_creates_cancelled_md_with_canonical_header(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "scope rolled into another set")
    text = (tmp_path / "CANCELLED.md").read_text(encoding="utf-8")
    assert text.startswith("# Cancellation history\n\n")
    assert re.search(
        r"Cancelled on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\n",
        text,
    )
    assert "scope rolled into another set" in text
    assert sl.is_cancelled(str(tmp_path)) is True


def test_empty_reason_is_valid(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "")
    text = (tmp_path / "CANCELLED.md").read_text(encoding="utf-8")
    lines = text.split("\n")
    assert lines[0] == "# Cancellation history"
    assert lines[1] == ""
    assert lines[2].startswith("Cancelled on ")
    assert lines[3] == ""


def test_first_cancel_byte_shape_matches_spec_prepend_formula_exactly(
    tmp_path: Path,
) -> None:
    """Locks in the spec line 149 contract: prepend
    ``Cancelled on <ISO-8601 local>\\n<reason or "">\\n\\n`` to the file
    (with the standard header). The trailing blank-line separator is
    part of the entry block, not the assembly.
    """
    sl.cancel_session_set(str(tmp_path), "the reason")
    text = (tmp_path / "CANCELLED.md").read_text(encoding="utf-8")
    header_block = "# Cancellation history\n\n"
    assert text.startswith(header_block)
    body = text[len(header_block):]
    assert re.fullmatch(
        r"Cancelled on [^\n]+\nthe reason\n\n",
        body,
    ), f"expected entry block followed by trailing blank-line separator, got: {body!r}"


def test_cancel_after_restore_renames_and_prepends(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "first cancel")
    time.sleep(1.1)  # ensure strictly later wall-clock seconds
    sl.restore_session_set(str(tmp_path), "first restore")
    assert not (tmp_path / "CANCELLED.md").exists()
    assert (tmp_path / "RESTORED.md").exists()

    time.sleep(1.1)
    sl.cancel_session_set(str(tmp_path), "second cancel")
    assert (tmp_path / "CANCELLED.md").exists()
    assert not (tmp_path / "RESTORED.md").exists()

    text = (tmp_path / "CANCELLED.md").read_text(encoding="utf-8")
    assert "first cancel" in text
    assert "first restore" in text
    assert "second cancel" in text
    idx_second = text.index("second cancel")
    idx_first_restore = text.index("first restore")
    idx_first_cancel = text.index("first cancel")
    assert idx_second < idx_first_restore < idx_first_cancel, (
        "expected newest-first order in the accumulated history"
    )


# ---------------------------------------------------------------------------
# restore_session_set
# ---------------------------------------------------------------------------


def test_restore_without_cancelled_md_throws(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        sl.restore_session_set(str(tmp_path))


def test_restore_renames_and_prepends(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "the reason")
    sl.restore_session_set(str(tmp_path), "back on track")
    assert not (tmp_path / "CANCELLED.md").exists()
    assert (tmp_path / "RESTORED.md").exists()
    assert sl.was_restored(str(tmp_path)) is True

    text = (tmp_path / "RESTORED.md").read_text(encoding="utf-8")
    assert text.startswith("# Cancellation history\n\n")
    assert "Restored on " in text
    assert "back on track" in text
    assert "the reason" in text


def test_multi_cycle_preserves_all_entries_in_order(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "C1")
    time.sleep(1.1)
    sl.restore_session_set(str(tmp_path), "R1")
    time.sleep(1.1)
    sl.cancel_session_set(str(tmp_path), "C2")
    time.sleep(1.1)
    sl.restore_session_set(str(tmp_path), "R2")

    text = (tmp_path / "RESTORED.md").read_text(encoding="utf-8")
    positions = [text.index(s) for s in ("R2", "C2", "R1", "C1")]
    assert positions == sorted(positions), (
        "expected newest-first ordering in the accumulated history"
    )


# ---------------------------------------------------------------------------
# session-state.json plumbing
# ---------------------------------------------------------------------------


def test_cancel_captures_prior_status_into_pre_cancel_status(tmp_path: Path) -> None:
    _write_state(tmp_path, {"schemaVersion": 2, "status": "in-progress", "currentSession": 2})
    sl.cancel_session_set(str(tmp_path), "")
    state = _read_state(tmp_path)
    assert state["status"] == "cancelled"
    assert state["preCancelStatus"] == "in-progress"


def test_re_cancel_preserves_original_pre_cancel_status(tmp_path: Path) -> None:
    _write_state(tmp_path, {"schemaVersion": 2, "status": "in-progress"})
    sl.cancel_session_set(str(tmp_path), "")
    sl.cancel_session_set(str(tmp_path), "")  # re-cancel without intervening restore
    state = _read_state(tmp_path)
    assert state["status"] == "cancelled"
    assert state["preCancelStatus"] == "in-progress", (
        "second cancel must not overwrite preCancelStatus with 'cancelled'"
    )


def test_restore_restores_status_from_pre_cancel_status(tmp_path: Path) -> None:
    _write_state(tmp_path, {"schemaVersion": 2, "status": "complete"})
    sl.cancel_session_set(str(tmp_path), "")
    state = _read_state(tmp_path)
    assert state["status"] == "cancelled"
    assert state["preCancelStatus"] == "complete"

    sl.restore_session_set(str(tmp_path), "")
    state = _read_state(tmp_path)
    assert state["status"] == "complete"
    assert "preCancelStatus" not in state


def test_restore_falls_back_to_file_presence_when_pre_cancel_missing(tmp_path: Path) -> None:
    (tmp_path / "change-log.md").write_text("# Changes\n", encoding="utf-8")
    (tmp_path / "CANCELLED.md").write_text(
        "# Cancellation history\n\nCancelled on x\n\n", encoding="utf-8"
    )
    _write_state(tmp_path, {"schemaVersion": 2, "status": "cancelled"})  # no preCancelStatus
    sl.restore_session_set(str(tmp_path), "")
    state = _read_state(tmp_path)
    assert state["status"] == "complete", (
        "change-log.md should infer 'complete' on restore"
    )


def test_restore_infers_in_progress_from_activity_log_when_pre_cancel_missing(
    tmp_path: Path,
) -> None:
    (tmp_path / "activity-log.json").write_text(
        json.dumps({"entries": []}), encoding="utf-8"
    )
    (tmp_path / "CANCELLED.md").write_text(
        "# Cancellation history\n\nCancelled on x\n\n", encoding="utf-8"
    )
    _write_state(tmp_path, {"schemaVersion": 2, "status": "cancelled"})
    sl.restore_session_set(str(tmp_path), "")
    state = _read_state(tmp_path)
    assert state["status"] == "in-progress"


def test_cancel_restore_no_op_for_state_when_file_absent(tmp_path: Path) -> None:
    sl.cancel_session_set(str(tmp_path), "no state file in this folder")
    assert not (tmp_path / "session-state.json").exists()
    assert sl.is_cancelled(str(tmp_path)) is True
    sl.restore_session_set(str(tmp_path), "")
    assert not (tmp_path / "session-state.json").exists()
    assert sl.was_restored(str(tmp_path)) is True


# ---------------------------------------------------------------------------
# line-ending parity (cross-platform contract)
# ---------------------------------------------------------------------------


def test_writer_emits_lf_only_no_crlf(tmp_path: Path) -> None:
    """The TS and Python writers must agree on LF newlines so a set
    cancelled on Windows reads identically when opened on macOS. The
    Python writer uses binary mode; this test asserts no CR slips in.
    """
    sl.cancel_session_set(str(tmp_path), "x")
    raw = (tmp_path / "CANCELLED.md").read_bytes()
    assert b"\r\n" not in raw, "writer must not emit CRLF"
    assert b"\r" not in raw, "writer must not emit lone CR"
