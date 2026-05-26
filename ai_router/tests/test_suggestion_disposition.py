"""Unit tests for ai_router.suggestion_disposition.

Set 048 Session 2 §3.4: helpers for reading/writing the operator's
recorded UAT/E2E choice on a "suggested"-tri-state spec.

The runtime gate that uses these helpers is deferred to Set 048 S3;
these tests cover the helper contract only.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from suggestion_disposition import (
    ENTRY_KIND,
    VALID_CHOICES,
    read_suggestion_disposition_for_session,
    record_suggestion_disposition,
)


def _empty_log(tmp_path: Path) -> Path:
    """Create a minimal activity-log.json fixture."""
    set_dir = tmp_path / "test-set"
    set_dir.mkdir()
    log = set_dir / "activity-log.json"
    log.write_text(
        json.dumps(
            {
                "sessionSetName": "test-set",
                "createdDate": "2026-05-26",
                "totalSessions": 2,
                "entries": [],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return set_dir


# ---------- record ----------


@pytest.mark.parametrize("choice", VALID_CHOICES)
def test_record_all_valid_choices(tmp_path: Path, choice: str):
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(set_dir, session_number=2, choice=choice)
    with (set_dir / "activity-log.json").open("r", encoding="utf-8") as f:
        log = json.load(f)
    assert len(log["entries"]) == 1
    entry = log["entries"][0]
    assert entry["kind"] == ENTRY_KIND
    assert entry["choice"] == choice
    assert entry["sessionNumber"] == 2
    assert entry["status"] == "complete"
    assert entry["stepKey"] == "session-002/suggestion-disposition"
    assert "dateTime" in entry


def test_record_infers_step_number(tmp_path: Path):
    """When step_number is None, use max(existing steps for session) + 1."""
    set_dir = _empty_log(tmp_path)
    with (set_dir / "activity-log.json").open("r+", encoding="utf-8") as f:
        log = json.load(f)
        log["entries"].append({"sessionNumber": 3, "stepNumber": 4})
        log["entries"].append({"sessionNumber": 3, "stepNumber": 7})
        log["entries"].append({"sessionNumber": 2, "stepNumber": 99})  # different session
        f.seek(0)
        f.truncate()
        json.dump(log, f, indent=2)

    record_suggestion_disposition(set_dir, session_number=3, choice="both")
    with (set_dir / "activity-log.json").open("r", encoding="utf-8") as f:
        log = json.load(f)
    new_entry = [e for e in log["entries"] if e.get("kind") == ENTRY_KIND][0]
    assert new_entry["stepNumber"] == 8  # max(4,7) + 1


def test_record_explicit_step_number(tmp_path: Path):
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(
        set_dir, session_number=1, choice="uat", step_number=42
    )
    with (set_dir / "activity-log.json").open("r", encoding="utf-8") as f:
        log = json.load(f)
    assert log["entries"][0]["stepNumber"] == 42


def test_record_unknown_choice_raises(tmp_path: Path):
    set_dir = _empty_log(tmp_path)
    with pytest.raises(ValueError, match="unknown suggestion choice"):
        record_suggestion_disposition(
            set_dir, session_number=1, choice="kitchen-sink"  # type: ignore[arg-type]
        )


def test_record_missing_log_raises(tmp_path: Path):
    """activity-log.json must exist; the helper doesn't create it."""
    empty_dir = tmp_path / "no-log"
    empty_dir.mkdir()
    with pytest.raises(FileNotFoundError):
        record_suggestion_disposition(empty_dir, session_number=1, choice="uat")


# ---------- read ----------


def test_read_returns_none_when_no_entry(tmp_path: Path):
    set_dir = _empty_log(tmp_path)
    assert read_suggestion_disposition_for_session(set_dir, 1) is None


def test_read_returns_recorded_choice(tmp_path: Path):
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(set_dir, session_number=2, choice="both")
    assert read_suggestion_disposition_for_session(set_dir, 2) == "both"


def test_read_filters_by_session_number(tmp_path: Path):
    """Choice recorded for session 1 should not surface when reading session 2."""
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(set_dir, session_number=1, choice="e2e")
    assert read_suggestion_disposition_for_session(set_dir, 2) is None
    assert read_suggestion_disposition_for_session(set_dir, 1) == "e2e"


def test_read_returns_most_recent_when_duplicates(tmp_path: Path):
    """If operator answered twice for one session, the LAST answer wins."""
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(set_dir, session_number=3, choice="uat")
    record_suggestion_disposition(set_dir, session_number=3, choice="both")
    assert read_suggestion_disposition_for_session(set_dir, 3) == "both"


def test_read_missing_file_returns_none(tmp_path: Path):
    nonexistent = tmp_path / "missing"
    nonexistent.mkdir()
    assert read_suggestion_disposition_for_session(nonexistent, 1) is None


def test_read_malformed_json_returns_none(tmp_path: Path):
    set_dir = tmp_path / "bad"
    set_dir.mkdir()
    (set_dir / "activity-log.json").write_text("not valid json{", encoding="utf-8")
    assert read_suggestion_disposition_for_session(set_dir, 1) is None


def test_read_ignores_non_disposition_entries(tmp_path: Path):
    """Other entry types in the log should not affect the read."""
    set_dir = _empty_log(tmp_path)
    with (set_dir / "activity-log.json").open("r+", encoding="utf-8") as f:
        log = json.load(f)
        # Add some unrelated entries
        log["entries"].append(
            {"sessionNumber": 1, "stepNumber": 1, "stepKey": "session-001/foo"}
        )
        log["entries"].append(
            {"sessionNumber": 1, "stepNumber": 2, "stepKey": "session-001/bar"}
        )
        f.seek(0)
        f.truncate()
        json.dump(log, f, indent=2)
    assert read_suggestion_disposition_for_session(set_dir, 1) is None


def test_read_ignores_unknown_choice_value(tmp_path: Path):
    """An entry with a corrupted/unknown choice value is ignored."""
    set_dir = _empty_log(tmp_path)
    with (set_dir / "activity-log.json").open("r+", encoding="utf-8") as f:
        log = json.load(f)
        log["entries"].append(
            {
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-001/suggestion-disposition",
                "kind": ENTRY_KIND,
                "choice": "garbled",
            }
        )
        f.seek(0)
        f.truncate()
        json.dump(log, f, indent=2)
    assert read_suggestion_disposition_for_session(set_dir, 1) is None


# ---------- round-trip ----------


@pytest.mark.parametrize("choice", VALID_CHOICES)
def test_round_trip_each_choice(tmp_path: Path, choice: str):
    set_dir = _empty_log(tmp_path)
    record_suggestion_disposition(set_dir, session_number=7, choice=choice)
    assert read_suggestion_disposition_for_session(set_dir, 7) == choice
