"""Regression tests for the Windows drive-letter case-sensitivity bug class.

Found by the Set 084 S3 out-of-band UAT: a real Copilot orchestrator passed
``--session-set-dir c:\\temp\\...`` (lowercase drive) while git reports
``C:\\temp\\...`` (uppercase drive). Path comparisons that did not
``os.path.normcase`` both sides then rejected a legitimate verification stamp
(``verification_stamp.validate_stamped_row``) and mis-scoped the working-tree
gate, forcing the close backstop to run redundant verification rounds.

The drive-letter form only exists on Windows, so the faithful reproductions are
gated to ``os.name == "nt"``; ``test_matches_session_set_is_case_folded`` covers
the comparison logic portably by folding case through a patched ``normcase``.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from cost_report import _matches_session_set
from tests.stamp_fixtures import write_stamped_evidence
from verification_stamp import validate_stamped_row

_WINDOWS_ONLY = pytest.mark.skipif(
    os.name != "nt", reason="drive-letter case only exists on Windows"
)


def _swap_drive_case(path: str) -> str:
    """Flip the drive letter's case: ``C:\\x`` -> ``c:\\x`` (and back)."""
    if len(path) >= 2 and path[1] == ":" and path[0].isalpha():
        return path[0].swapcase() + path[1:]
    return path


@_WINDOWS_ONLY
def test_validate_stamped_row_tolerates_drive_letter_case(tmp_path: Path):
    """A valid stamp validates even when ``session_set_dir`` differs from the
    artifact's git-derived anchor only in drive-letter case."""
    set_dir = tmp_path / "docs" / "session-sets" / "001-case"
    set_dir.mkdir(parents=True)
    row = write_stamped_evidence(set_dir, session_number=1)

    # Sanity: the natural-case path validates.
    ok, reason = validate_stamped_row(
        row,
        session_set_dir=str(set_dir),
        session_number=1,
        orchestrator_effective_provider="anthropic",
    )
    assert ok, reason

    # The bug: the SAME set dir passed with the opposite drive-letter case
    # (what a lowercase-c CLI arg looks like against git's uppercase C:)
    # must still validate — it is the identical location.
    swapped = _swap_drive_case(str(set_dir))
    assert swapped != str(set_dir)  # a real case difference was introduced
    ok, reason = validate_stamped_row(
        row,
        session_set_dir=swapped,
        session_number=1,
        orchestrator_effective_provider="anthropic",
    )
    assert ok, f"drive-case mismatch spuriously rejected the stamp: {reason}"


@_WINDOWS_ONLY
def test_matches_session_set_tolerates_drive_letter_case():
    """cost_report row matching survives a drive-letter case difference."""
    rec = r"C:\repo\docs\session-sets\001-case"
    target = _swap_drive_case(rec).replace("\\", "/")
    assert target != rec.replace("\\", "/")
    assert _matches_session_set(rec, target, "001-case")


def test_matches_session_set_is_case_folded(monkeypatch):
    """Portable: with a case-folding ``normcase`` (Windows semantics), a
    record whose path differs only in case from the target still matches."""
    monkeypatch.setattr(os.path, "normcase", str.lower)
    rec = "Docs/Session-Sets/001-Case"
    target = "docs/session-sets/001-case"
    assert rec != target
    assert _matches_session_set(rec, target, "001-case")
