"""Set 072 (S1) - L-069-1 sibling-reader hardening.

The non-list-``entries`` guard + ``UnicodeError`` tolerance proven in the Set 070
``dual_surface_verify`` mode readers, applied to the four remaining sibling
readers that walk ``activity-log.json`` looking for a durable record:

- ``path_aware_critique.read_path_aware_critique`` / ``has_path_aware_critique_record``

Set 112 deleted the ``dedicated_verification`` pair with the Lightweight
tier; the surviving readers keep the same guarantee.

L-069-1: a bug is a bug CLASS. A malformed ``entries`` (non-list) or invalid
UTF-8 bytes must collapse to the no-record default on EVERY sibling, never raise -
these run on the close-out path where a crash is expensive.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import path_aware_critique as pac


# (reader, is_predicate, no_record_value) for each surviving sibling reader.
_READERS = [
    (pac.read_path_aware_critique, False, pac.DEFAULT_PATH_AWARE_CRITIQUE),
    (pac.has_path_aware_critique_record, True, False),
]


def _write(set_dir: Path, payload) -> None:
    p = set_dir / "activity-log.json"
    if isinstance(payload, (bytes, bytearray)):
        p.write_bytes(payload)
    else:
        p.write_text(json.dumps(payload), encoding="utf-8")


@pytest.mark.parametrize("reader,is_pred,no_record", _READERS)
def test_non_list_entries_returns_no_record(tmp_path, reader, is_pred, no_record):
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    _write(set_dir, {"entries": 1})  # entries is an int, NOT a list
    # Must not raise (TypeError on iterating a non-list) and must read no record.
    assert reader(set_dir) == no_record


@pytest.mark.parametrize("reader,is_pred,no_record", _READERS)
def test_invalid_utf8_returns_no_record(tmp_path, reader, is_pred, no_record):
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    _write(set_dir, b"\xff\xfe\x00 not valid utf-8 \x81\x82")
    # Invalid UTF-8 raises UnicodeError (a ValueError, NOT a JSONDecodeError) -
    # the reader must catch it and return the no-record default.
    assert reader(set_dir) == no_record


@pytest.mark.parametrize("reader,is_pred,no_record", _READERS)
def test_top_level_non_dict_returns_no_record(tmp_path, reader, is_pred, no_record):
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    _write(set_dir, [1, 2, 3])  # the whole log is a JSON array, not an object
    assert reader(set_dir) == no_record


@pytest.mark.parametrize("reader,is_pred,no_record", _READERS)
def test_non_dict_entry_members_are_skipped_not_fatal(tmp_path, reader, is_pred, no_record):
    """A list whose members include non-dicts must be tolerated (the bad members
    skipped) while a valid record present alongside them is still found."""
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    # Mix junk members with a genuine record.
    good = {"kind": "path_aware_critique", "choice": "required"}
    expected_read = "required"
    _write(set_dir, {"entries": [1, "junk", None, good]})
    if is_pred:
        assert reader(set_dir) is True  # the valid record IS found
    else:
        assert reader(set_dir) == expected_read


def test_missing_file_returns_no_record(tmp_path):
    set_dir = tmp_path / "set"
    set_dir.mkdir()  # no activity-log.json at all
    assert pac.read_path_aware_critique(set_dir) == pac.DEFAULT_PATH_AWARE_CRITIQUE
    assert pac.has_path_aware_critique_record(set_dir) is False
