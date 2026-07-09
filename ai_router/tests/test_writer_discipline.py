"""Unit tests for ai_router.writer_discipline (the salvaged D3 detector).

Set 051 lifted the writer-bypass detector out of the deleted
``ai_router.joiner`` island into a standalone module. These tests cover
the detector + the scan entry point + the self-contained helpers, and
pin the salvaged behavior so a future cleanup cannot silently drop it.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

from ai_router.writer_discipline import (
    DEFAULT_EVENT_TOLERANCE_NS,
    SessionStateView,
    WriterBypassReport,
    canonicalize_cwd,
    detect_writer_bypass,
    parse_iso,
    read_session_state,
    scan_session_states,
    scan_writer_bypass,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_state_file(tmp_path, slug="set-a", *, status="in-progress"):
    set_dir = tmp_path / "docs" / "session-sets" / slug
    set_dir.mkdir(parents=True)
    state_file = set_dir / "session-state.json"
    state_file.write_text(
        json.dumps({"sessionSetName": slug, "status": status}), encoding="utf-8"
    )
    return state_file


def _write_events(state_file, timestamps):
    events_path = state_file.with_name("session-events.jsonl")
    lines = [json.dumps({"ts": dt.isoformat()}) for dt in timestamps]
    events_path.write_text("\n".join(lines), encoding="utf-8")
    return events_path


def _set_mtime(path, dt):
    epoch = dt.timestamp()
    os.utime(path, (epoch, epoch))


# ---------------------------------------------------------------------------
# Helper-level tests
# ---------------------------------------------------------------------------


def test_canonicalize_cwd_normalizes_slashes_case_and_trailing():
    assert canonicalize_cwd("C:\\Users\\Foo\\Repo\\") == "c:/users/foo/repo"
    assert canonicalize_cwd("") == ""


def test_parse_iso_accepts_z_and_naive():
    aware = parse_iso("2026-05-30T04:44:11Z")
    assert aware.tzinfo is not None
    naive = parse_iso("2026-05-30T04:44:11")
    assert naive.tzinfo == timezone.utc


def test_read_session_state_missing_returns_none(tmp_path):
    assert read_session_state(tmp_path / "nope.json") is None


def test_read_session_state_bad_json_returns_none(tmp_path):
    p = tmp_path / "session-state.json"
    p.write_text("{not json", encoding="utf-8")
    assert read_session_state(p) is None


def test_read_session_state_projects_slug_and_root(tmp_path):
    state_file = _make_state_file(tmp_path, slug="set-x")
    view = read_session_state(state_file)
    assert isinstance(view, SessionStateView)
    assert view.set_slug == "set-x"
    # workspace_root walks up 4 parents to the tmp_path workspace root.
    assert view.workspace_root == tmp_path.resolve()


# ---------------------------------------------------------------------------
# detect_writer_bypass
# ---------------------------------------------------------------------------


def test_no_events_ledger_skips(tmp_path):
    state_file = _make_state_file(tmp_path)
    view = read_session_state(state_file)
    assert detect_writer_bypass(view) == []


def test_empty_events_ledger_skips(tmp_path):
    state_file = _make_state_file(tmp_path)
    state_file.with_name("session-events.jsonl").write_text("", encoding="utf-8")
    view = read_session_state(state_file)
    assert detect_writer_bypass(view) == []


def test_in_tolerance_no_report(tmp_path):
    state_file = _make_state_file(tmp_path)
    now = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    _write_events(state_file, [now])
    _set_mtime(state_file, now)  # mtime == event ts (delta 0)
    view = read_session_state(state_file)
    assert detect_writer_bypass(view) == []


def test_out_of_tolerance_reports_bypass(tmp_path):
    state_file = _make_state_file(tmp_path)
    event_ts = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    _write_events(state_file, [event_ts])
    # mtime 10s after the nearest event -> well outside the ±2s window.
    _set_mtime(state_file, event_ts + timedelta(seconds=10))
    view = read_session_state(state_file)
    reports = detect_writer_bypass(view)
    assert len(reports) == 1
    rep = reports[0]
    assert isinstance(rep, WriterBypassReport)
    assert rep.kind == "writer-bypass"
    assert rep.severity == "high"
    assert rep.set_slug == "set-a"
    assert rep.evidence["delta_seconds"] >= 9.0


def test_nearest_event_wins_within_tolerance(tmp_path):
    state_file = _make_state_file(tmp_path)
    base = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    # One far event and one close event; nearest (close) is within tolerance.
    _write_events(state_file, [base, base + timedelta(seconds=100)])
    _set_mtime(state_file, base + timedelta(seconds=1))
    view = read_session_state(state_file)
    assert detect_writer_bypass(view) == []


def test_custom_tolerance_is_honored(tmp_path):
    state_file = _make_state_file(tmp_path)
    event_ts = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    _write_events(state_file, [event_ts])
    _set_mtime(state_file, event_ts + timedelta(seconds=5))
    view = read_session_state(state_file)
    # Default ±2s -> reports; a 10s tolerance -> clean.
    assert len(detect_writer_bypass(view)) == 1
    assert detect_writer_bypass(view, event_tolerance_ns=10_000_000_000) == []


def test_detected_at_is_pinned(tmp_path):
    state_file = _make_state_file(tmp_path)
    event_ts = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    _write_events(state_file, [event_ts])
    _set_mtime(state_file, event_ts + timedelta(seconds=10))
    pinned = datetime(2030, 1, 1, tzinfo=timezone.utc)
    view = read_session_state(state_file)
    rep = detect_writer_bypass(view, detected_at=pinned)[0]
    assert rep.detected_at == pinned
    assert rep.to_json_dict()["detected_at"] == pinned.isoformat()


def test_malformed_event_lines_are_skipped(tmp_path):
    state_file = _make_state_file(tmp_path)
    event_ts = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    events_path = state_file.with_name("session-events.jsonl")
    events_path.write_text(
        "not json\n"
        + json.dumps({"no_ts_field": 1})
        + "\n"
        + json.dumps({"ts": event_ts.isoformat()})
        + "\n",
        encoding="utf-8",
    )
    _set_mtime(state_file, event_ts)  # matches the one good line
    view = read_session_state(state_file)
    assert detect_writer_bypass(view) == []


def test_default_tolerance_constant():
    assert DEFAULT_EVENT_TOLERANCE_NS == 2_000_000_000


# ---------------------------------------------------------------------------
# scan_session_states / scan_writer_bypass
# ---------------------------------------------------------------------------


def test_scan_session_states_missing_dir(tmp_path):
    assert list(scan_session_states(tmp_path)) == []


def test_scan_writer_bypass_across_sets(tmp_path):
    clean = _make_state_file(tmp_path, slug="clean")
    dirty = _make_state_file(tmp_path, slug="dirty")
    base = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    _write_events(clean, [base])
    _set_mtime(clean, base)
    _write_events(dirty, [base])
    _set_mtime(dirty, base + timedelta(seconds=30))
    reports = scan_writer_bypass(workspace_root=tmp_path)
    assert len(reports) == 1
    assert reports[0].set_slug == "dirty"


def test_scan_writer_bypass_set_slug_filter(tmp_path):
    dirty = _make_state_file(tmp_path, slug="dirty")
    other = _make_state_file(tmp_path, slug="other")
    base = datetime(2026, 5, 30, 12, 0, 0, tzinfo=timezone.utc)
    for sf in (dirty, other):
        _write_events(sf, [base])
        _set_mtime(sf, base + timedelta(seconds=30))
    reports = scan_writer_bypass(set_slug="dirty", workspace_root=tmp_path)
    assert len(reports) == 1
    assert reports[0].set_slug == "dirty"


# ---------------------------------------------------------------------------
# Set 086 S1 — require_ledger strict mode (fail loud on missing/unreadable)
# ---------------------------------------------------------------------------

from ai_router.writer_discipline import (  # noqa: E402
    REASON_LEDGER_ABSENT,
    REASON_LEDGER_EMPTY,
    REASON_LEDGER_UNREADABLE,
)


def test_require_ledger_absent_is_high(tmp_path):
    state_file = _make_state_file(tmp_path)
    reports = detect_writer_bypass(read_session_state(state_file), require_ledger=True)
    assert len(reports) == 1
    assert reports[0].severity == "high"
    assert reports[0].reason == REASON_LEDGER_ABSENT
    # Default mode still skips (back-compat with the historical scan).
    assert detect_writer_bypass(read_session_state(state_file)) == []


def test_require_ledger_empty_is_high(tmp_path):
    state_file = _make_state_file(tmp_path)
    state_file.with_name("session-events.jsonl").write_text("", encoding="utf-8")
    reports = detect_writer_bypass(read_session_state(state_file), require_ledger=True)
    assert len(reports) == 1
    assert reports[0].reason == REASON_LEDGER_EMPTY
    assert detect_writer_bypass(read_session_state(state_file)) == []


def test_require_ledger_unreadable_is_high(tmp_path):
    # Round-5 finding: an existing-but-unreadable ledger must fail loud, not
    # skip. A directory in the ledger's place raises OSError on open().
    state_file = _make_state_file(tmp_path)
    (state_file.with_name("session-events.jsonl")).mkdir()
    reports = detect_writer_bypass(read_session_state(state_file), require_ledger=True)
    assert len(reports) == 1
    assert reports[0].severity == "high"
    assert reports[0].reason == REASON_LEDGER_UNREADABLE
    # Default mode still skips.
    assert detect_writer_bypass(read_session_state(state_file)) == []
