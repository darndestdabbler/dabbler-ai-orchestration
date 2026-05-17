"""Tests for the bulk v2→v3 migrator — Set 030 Session 4.

Covers:

- Idempotency: a v3 file is returned as ``ACTION_SKIPPED_V3``.
- v2 closed sets (``status: complete`` + ``lifecycleState: closed``)
  force-promote every session to ``complete`` even when
  ``completedSessions[]`` is missing/empty.
- v2 closed sets where ``currentSession >= totalSessions`` are treated
  identically to the lifecycle-closed signal.
- v2 in-flight sets put exactly one session in ``in-progress`` and
  preserve the legacy completedSessions[] for prior closed sessions.
- v2 between-sessions sets (``status: in-progress`` with
  ``currentSession: null``) preserve closed sessions and leave the
  rest ``not-started``.
- v2 not-started sets become an all-``not-started`` v3 ledger.
- Cancelled sets (``status: cancelled``) preserve top-level status and
  reflect actual per-session completion from completedSessions[].
- Title resolution prefers spec.md regex headings; falls back to
  ``"Session N"`` when the spec has no parseable heading or when
  ``strategy='generic'``.
- Malformed inputs (missing state file, non-object JSON, unparseable
  JSON) return structured skip results, never raise.
- The dry-run path leaves the on-disk file untouched even when the
  in-memory migration succeeds.
- The in-place path atomically rewrites the file and the result is
  re-validatable through ``read_progress``.
- Inputs that would violate the 8 invariants surface as
  ``ACTION_WOULD_VIOLATE`` rather than corrupting state.
- The ``ai`` strategy raises NotImplementedError (Session 5 work).
- ``discover_session_sets`` finds every set with a state file under
  a scan root, sorted by basename.
- The CLI ``main()`` returns 0 on success, 1 when any set would
  violate, and prints JSON when ``--json`` is passed.
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path

import pytest

import migrate_session_state as mss
import progress
from migrate_session_state import (
    ACTION_MIGRATED,
    ACTION_SKIPPED_MALFORMED,
    ACTION_SKIPPED_NO_STATE,
    ACTION_SKIPPED_OPERATOR,
    ACTION_SKIPPED_V3,
    ACTION_WOULD_VIOLATE,
    STRATEGY_AI,
    STRATEGY_GENERIC,
    STRATEGY_INTERACTIVE,
    STRATEGY_REGEX,
    MigrationResult,
    discover_session_sets,
    main,
    migrate_all,
    migrate_one_set,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_HEADING_TITLES = ["Alpha session", "Beta session", "Gamma session", "Delta session", "Epsilon session"]


def _spec(n: int) -> str:
    lines = ["# Test set", "", "## Sessions", ""]
    for i in range(1, n + 1):
        title = _HEADING_TITLES[i - 1] if i <= len(_HEADING_TITLES) else f"Session {i}"
        lines.append(f"### Session {i} of {n}: {title}")
        lines.append("Body...")
        lines.append("")
    return "\n".join(lines)


def _write_state(set_dir: Path, state: dict, *, spec_n: int = 3) -> None:
    set_dir.mkdir(parents=True, exist_ok=True)
    (set_dir / "session-state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    (set_dir / "spec.md").write_text(_spec(spec_n), encoding="utf-8")


def _migrated(state_after: dict) -> dict:
    """Return ``state_after`` for asserting v3 invariants are intact."""
    progress.get_progress(state_after)  # raises on violation
    return state_after


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


class TestIdempotency:
    def test_v3_file_skipped(self, tmp_path):
        set_dir = tmp_path / "set"
        _write_state(
            set_dir,
            {
                "schemaVersion": 3,
                "sessionSetName": "set",
                "sessions": [
                    {"number": 1, "title": "Alpha", "status": "not-started"},
                    {"number": 2, "title": "Beta", "status": "not-started"},
                    {"number": 3, "title": "Gamma", "status": "not-started"},
                ],
                "status": "not-started",
                "lifecycleState": None,
            },
        )
        r = migrate_one_set(str(set_dir))
        assert r.action == ACTION_SKIPPED_V3
        assert "already v3" in r.reason


# ---------------------------------------------------------------------------
# Closed-set semantics
# ---------------------------------------------------------------------------


class TestClosedSets:
    def test_closed_with_empty_completedSessions_force_promotes_all(self, tmp_path):
        """A v2 file like 007/008/011/014 (closed, no completedSessions[])."""
        set_dir = tmp_path / "closed-no-array"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "closed-no-array",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
            },
        )
        r = migrate_one_set(str(set_dir), strategy=STRATEGY_REGEX, dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert out["schemaVersion"] == 3
        assert [s["status"] for s in out["sessions"]] == ["complete"] * 3
        assert out["completedSessions"] == [1, 2, 3]
        assert out["currentSession"] is None
        assert out["totalSessions"] == 3
        assert out["status"] == "complete"
        assert out["lifecycleState"] == "closed"

    def test_closed_with_full_completedSessions_array(self, tmp_path):
        set_dir = tmp_path / "closed-with-array"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "closed-with-array",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == ["complete"] * 3

    def test_closed_signal_from_current_meets_total(self, tmp_path):
        """``status: complete`` plus ``currentSession >= totalSessions``."""
        set_dir = tmp_path / "closed-by-current"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "closed-by-current",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": None,
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == ["complete"] * 3
        assert out["lifecycleState"] == "closed"

    def test_closed_uses_spec_titles_when_present(self, tmp_path):
        set_dir = tmp_path / "closed-titles"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "closed-titles",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), strategy=STRATEGY_REGEX, dry_run=True)
        out = r.after
        assert out["sessions"][0]["title"] == "Alpha session"
        assert out["sessions"][1]["title"] == "Beta session"
        assert out["sessions"][2]["title"] == "Gamma session"

    def test_generic_strategy_overrides_spec_titles(self, tmp_path):
        set_dir = tmp_path / "closed-generic"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "closed-generic",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), strategy=STRATEGY_GENERIC, dry_run=True)
        out = r.after
        assert [s["title"] for s in out["sessions"]] == [
            "Session 1",
            "Session 2",
            "Session 3",
        ]


# ---------------------------------------------------------------------------
# In-flight / between / not-started semantics
# ---------------------------------------------------------------------------


class TestInFlightAndBetween:
    def test_in_flight_marks_current_session_in_progress(self, tmp_path):
        set_dir = tmp_path / "in-flight"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "in-flight",
                "currentSession": 2,
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [1],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        statuses = [s["status"] for s in out["sessions"]]
        assert statuses == ["complete", "in-progress", "not-started"]
        assert out["currentSession"] == 2
        assert out["completedSessions"] == [1]

    def test_between_sessions_no_current(self, tmp_path):
        set_dir = tmp_path / "between"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "between",
                "currentSession": None,
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [1, 2],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == [
            "complete",
            "complete",
            "not-started",
        ]
        assert out["currentSession"] is None
        view = progress.get_progress(out)
        assert view.is_between_sessions is True

    def test_not_started_set(self, tmp_path):
        set_dir = tmp_path / "fresh"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "fresh",
                "currentSession": None,
                "totalSessions": 3,
                "status": "not-started",
                "lifecycleState": None,
                "completedSessions": [],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == ["not-started"] * 3
        assert out["lifecycleState"] is None
        assert out["currentSession"] is None

    def test_currentSession_in_array_does_not_re_promote(self, tmp_path):
        """If currentSession is already in completedSessions, don't mark it in-progress.

        Defends against a stale ``currentSession`` pointing at a session
        that's already closed (a known v2 drift mode). The migrator
        prefers the array's testimony over the ambiguous int.
        """
        set_dir = tmp_path / "stale-current"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "stale-current",
                "currentSession": 1,
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [1, 2],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        # 1 is complete (not re-promoted); 2 is complete; 3 is not-started.
        # No in-progress -> between-sessions state.
        assert [s["status"] for s in out["sessions"]] == [
            "complete",
            "complete",
            "not-started",
        ]


# ---------------------------------------------------------------------------
# Cancelled sets
# ---------------------------------------------------------------------------


class TestCancelled:
    def test_cancelled_preserves_top_status_and_per_session_completion(self, tmp_path):
        set_dir = tmp_path / "cancelled"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "cancelled",
                "currentSession": 2,
                "totalSessions": 3,
                "status": "cancelled",
                "lifecycleState": "closed",
                "completedSessions": [1],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        # Cancelled is top-level only. Session-level statuses remain
        # ``complete`` / ``not-started`` based on actual completion.
        assert out["status"] == "cancelled"
        assert out["lifecycleState"] == "closed"
        assert [s["status"] for s in out["sessions"]] == [
            "complete",
            "not-started",
            "not-started",
        ]

    def test_cancelled_with_no_completed_sessions_all_not_started(self, tmp_path):
        set_dir = tmp_path / "cancelled-fresh"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "cancelled-fresh",
                "currentSession": None,
                "totalSessions": 2,
                "status": "cancelled",
                "lifecycleState": None,
                "completedSessions": [],
            },
            spec_n=2,
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == ["not-started", "not-started"]
        assert out["status"] == "cancelled"
        # Empty lifecycleState defaults to closed for cancelled.
        assert out["lifecycleState"] == "closed"


# ---------------------------------------------------------------------------
# Status aliases
# ---------------------------------------------------------------------------


class TestStatusAliases:
    def test_status_completed_canonicalizes_to_complete(self, tmp_path):
        set_dir = tmp_path / "alias-completed"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "alias-completed",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "completed",  # alias
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert out["status"] == "complete"
        assert [s["status"] for s in out["sessions"]] == ["complete"] * 3

    def test_status_done_canonicalizes_to_complete(self, tmp_path):
        set_dir = tmp_path / "alias-done"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "alias-done",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "done",  # alias
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert out["status"] == "complete"


# ---------------------------------------------------------------------------
# Bool / float strict filtering
# ---------------------------------------------------------------------------


class TestStrictIntFiltering:
    def test_currentSession_True_does_not_escalate(self, tmp_path):
        set_dir = tmp_path / "boolish"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "boolish",
                "currentSession": True,  # rejected by strict-int filter
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        # status: in-progress + currentSession not a real int + no completed
        # → invariant rule 6 (between-sessions requires >=1 complete + >=1
        # not-started + no in-progress; here we have 0 complete + 3
        # not-started + 0 in-progress).
        assert r.action == ACTION_WOULD_VIOLATE
        assert "rule 6" in r.reason

    def test_completedSessions_float_ignored(self, tmp_path):
        set_dir = tmp_path / "floatish"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "floatish",
                "currentSession": None,
                "totalSessions": 3,
                "status": "not-started",
                "lifecycleState": None,
                "completedSessions": [1.0, 2.0],  # floats, not ints
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        # Floats are filtered out; status: not-started + all sessions
        # default to not-started → valid not-started v3 state.
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["status"] for s in out["sessions"]] == ["not-started"] * 3


# ---------------------------------------------------------------------------
# Title resolution
# ---------------------------------------------------------------------------


class TestTitleResolution:
    def test_missing_spec_falls_back_to_generic(self, tmp_path):
        set_dir = tmp_path / "no-spec"
        set_dir.mkdir(parents=True)
        (set_dir / "session-state.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "sessionSetName": "no-spec",
                    "currentSession": 2,
                    "totalSessions": 2,
                    "status": "complete",
                    "lifecycleState": "closed",
                    "completedSessions": [1, 2],
                }
            )
        )
        # NOTE: no spec.md written
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert [s["title"] for s in out["sessions"]] == ["Session 1", "Session 2"]

    def test_spec_with_extra_heading_beyond_total_picks_total(self, tmp_path):
        # spec.md declares 4 sessions; state file says totalSessions=3.
        # The spec wins on totals because the migrator prefers the max
        # known signal (per the docstring rule). This is intentional:
        # operators who edit spec.md upward should see the new total
        # surface in the migrated v3 ledger.
        set_dir = tmp_path / "spec-wider"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "spec-wider",
                "currentSession": None,
                "totalSessions": 3,
                "status": "not-started",
                "lifecycleState": None,
                "completedSessions": [],
            },
            spec_n=4,
        )
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        out = _migrated(r.after)
        assert out["totalSessions"] == 4
        assert [s["status"] for s in out["sessions"]] == ["not-started"] * 4


# ---------------------------------------------------------------------------
# Malformed / missing inputs
# ---------------------------------------------------------------------------


class TestMalformedInputs:
    def test_missing_state_file(self, tmp_path):
        set_dir = tmp_path / "empty"
        set_dir.mkdir()
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_SKIPPED_NO_STATE

    def test_unparseable_json(self, tmp_path):
        set_dir = tmp_path / "bad-json"
        set_dir.mkdir()
        (set_dir / "session-state.json").write_text("{not valid json")
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_SKIPPED_MALFORMED

    def test_top_level_array_not_object(self, tmp_path):
        set_dir = tmp_path / "wrong-shape"
        set_dir.mkdir()
        (set_dir / "session-state.json").write_text("[1, 2, 3]")
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_SKIPPED_MALFORMED

    def test_no_total_signal_anywhere(self, tmp_path):
        set_dir = tmp_path / "no-signal"
        set_dir.mkdir()
        (set_dir / "session-state.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "sessionSetName": "no-signal",
                    "currentSession": None,
                    "totalSessions": None,
                    "status": "not-started",
                    "lifecycleState": None,
                    "completedSessions": [],
                }
            )
        )
        # no spec.md
        r = migrate_one_set(str(set_dir), dry_run=True)
        # No total signal -> rule 1 violation surfaced as would-violate
        assert r.action == ACTION_WOULD_VIOLATE
        assert "totalSessions" in r.reason or "rule 1" in r.reason


# ---------------------------------------------------------------------------
# Dry-run vs in-place
# ---------------------------------------------------------------------------


class TestWriteSemantics:
    def test_dry_run_leaves_file_untouched(self, tmp_path):
        set_dir = tmp_path / "dry"
        original = {
            "schemaVersion": 2,
            "sessionSetName": "dry",
            "currentSession": 3,
            "totalSessions": 3,
            "status": "complete",
            "lifecycleState": "closed",
            "completedSessions": [1, 2, 3],
        }
        _write_state(set_dir, original)
        r = migrate_one_set(str(set_dir), dry_run=True)
        assert r.action == ACTION_MIGRATED
        # On-disk file is still v2
        on_disk = json.loads((set_dir / "session-state.json").read_text())
        assert on_disk == original

    def test_in_place_writes_v3_atomically(self, tmp_path):
        set_dir = tmp_path / "ip"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "ip",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), dry_run=False)
        assert r.action == ACTION_MIGRATED
        on_disk = json.loads((set_dir / "session-state.json").read_text())
        assert on_disk["schemaVersion"] == 3
        assert [s["status"] for s in on_disk["sessions"]] == ["complete"] * 3
        # Tempfile cleaned up
        leftover = list(set_dir.glob(".session-state.json.tmp"))
        assert leftover == []

    def test_in_place_round_trips_through_read_progress(self, tmp_path):
        set_dir = tmp_path / "rt"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "rt",
                "currentSession": 2,
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [1],
            },
        )
        migrate_one_set(str(set_dir), dry_run=False)
        on_disk = json.loads((set_dir / "session-state.json").read_text())
        view = progress.read_progress(on_disk, set_dir / "spec.md")
        assert view.completed_sessions == (1,)
        assert view.current_session == 2
        assert view.total_sessions == 3


# ---------------------------------------------------------------------------
# AI strategy is a Session-5 stub
# ---------------------------------------------------------------------------


class TestAIStrategy:
    def test_ai_strategy_raises_NotImplementedError(self, tmp_path):
        set_dir = tmp_path / "ai"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "ai",
                "currentSession": None,
                "totalSessions": 3,
                "status": "not-started",
                "lifecycleState": None,
                "completedSessions": [],
            },
        )
        with pytest.raises(NotImplementedError):
            migrate_one_set(str(set_dir), strategy=STRATEGY_AI, dry_run=True)

    def test_interactive_strategy_resolves_to_regex_when_called_directly(self, tmp_path):
        """Library callers passing 'interactive' get the safe default (regex)."""
        set_dir = tmp_path / "interactive-direct"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "interactive-direct",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        r = migrate_one_set(str(set_dir), strategy=STRATEGY_INTERACTIVE, dry_run=True)
        assert r.action == ACTION_MIGRATED
        assert r.after["sessions"][0]["title"] == "Alpha session"  # regex path

    def test_unknown_strategy_raises_ValueError(self, tmp_path):
        set_dir = tmp_path / "unknown"
        _write_state(
            set_dir,
            {
                "schemaVersion": 2,
                "sessionSetName": "unknown",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        with pytest.raises(ValueError, match="unknown strategy"):
            migrate_one_set(str(set_dir), strategy="bogus", dry_run=True)


# ---------------------------------------------------------------------------
# Discovery + bulk
# ---------------------------------------------------------------------------


class TestDiscovery:
    def test_discover_returns_sorted_set_dirs(self, tmp_path):
        for name in ("c-set", "a-set", "b-set"):
            d = tmp_path / name
            _write_state(
                d,
                {
                    "schemaVersion": 2,
                    "sessionSetName": name,
                    "currentSession": None,
                    "totalSessions": 3,
                    "status": "not-started",
                    "lifecycleState": None,
                    "completedSessions": [],
                },
            )
        # Add a non-set directory and a file directly under the scan root —
        # neither should be returned.
        (tmp_path / "not-a-set").mkdir()
        (tmp_path / "loose.txt").write_text("hi")
        results = discover_session_sets(str(tmp_path))
        names = [os.path.basename(p) for p in results]
        assert names == ["a-set", "b-set", "c-set"]

    def test_discover_nonexistent_root(self, tmp_path):
        assert discover_session_sets(str(tmp_path / "missing")) == []

    def test_migrate_all_filter_by_name(self, tmp_path):
        for name in ("keep", "skip"):
            _write_state(
                tmp_path / name,
                {
                    "schemaVersion": 2,
                    "sessionSetName": name,
                    "currentSession": None,
                    "totalSessions": 3,
                    "status": "not-started",
                    "lifecycleState": None,
                    "completedSessions": [],
                },
            )
        results = migrate_all(
            str(tmp_path),
            strategy=STRATEGY_REGEX,
            dry_run=True,
            set_filter=["keep"],
        )
        assert len(results) == 1
        assert os.path.basename(results[0].set_dir) == "keep"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


class TestCLI:
    def test_dry_run_default_exits_zero_when_clean(self, tmp_path, capsys, monkeypatch):
        _write_state(
            tmp_path / "001-set",
            {
                "schemaVersion": 2,
                "sessionSetName": "001-set",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        monkeypatch.chdir(tmp_path)
        rc = main(["--scan", str(tmp_path), "--strategy", "regex", "--json"])
        out = capsys.readouterr().out
        payload = json.loads(out)
        assert rc == 0
        assert payload["counts"]["migrated"] == 1
        assert payload["counts"]["total"] == 1
        assert payload["dry_run"] is True
        # On-disk file is still v2 (dry run)
        on_disk = json.loads((tmp_path / "001-set" / "session-state.json").read_text())
        assert on_disk["schemaVersion"] == 2

    def test_in_place_writes_and_summarizes(self, tmp_path, capsys):
        _write_state(
            tmp_path / "001-set",
            {
                "schemaVersion": 2,
                "sessionSetName": "001-set",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        rc = main(
            [
                "--scan",
                str(tmp_path),
                "--strategy",
                "regex",
                "--in-place",
                "--json",
            ]
        )
        out = capsys.readouterr().out
        payload = json.loads(out)
        assert rc == 0
        assert payload["counts"]["migrated"] == 1
        on_disk = json.loads((tmp_path / "001-set" / "session-state.json").read_text())
        assert on_disk["schemaVersion"] == 3

    def test_would_violate_exits_one(self, tmp_path, capsys):
        # status: in-progress + currentSession invalid + 0 complete + 3 not-started
        # → rule 6 violation surfaces as would-violate.
        _write_state(
            tmp_path / "001-set",
            {
                "schemaVersion": 2,
                "sessionSetName": "001-set",
                "currentSession": True,  # filtered out → no in-progress
                "totalSessions": 3,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "completedSessions": [],
            },
        )
        rc = main(["--scan", str(tmp_path), "--strategy", "regex", "--json"])
        out = capsys.readouterr().out
        payload = json.loads(out)
        assert rc == 1
        assert payload["counts"]["would_violate"] == 1

    def test_only_filter(self, tmp_path, capsys):
        for name in ("keep", "skip"):
            _write_state(
                tmp_path / name,
                {
                    "schemaVersion": 2,
                    "sessionSetName": name,
                    "currentSession": None,
                    "totalSessions": 3,
                    "status": "not-started",
                    "lifecycleState": None,
                    "completedSessions": [],
                },
            )
        rc = main(
            [
                "--scan",
                str(tmp_path),
                "--strategy",
                "regex",
                "--only",
                "keep",
                "--json",
            ]
        )
        payload = json.loads(capsys.readouterr().out)
        assert rc == 0
        assert payload["counts"]["total"] == 1
        assert os.path.basename(payload["results"][0]["set_dir"]) == "keep"

    def test_no_sets_under_scan_root(self, tmp_path, capsys):
        rc = main(["--scan", str(tmp_path / "missing"), "--strategy", "regex", "--json"])
        payload = json.loads(capsys.readouterr().out)
        assert rc == 0
        assert payload["counts"] == {} or payload["results"] == []

    def test_human_output_summarizes_counts(self, tmp_path, capsys):
        _write_state(
            tmp_path / "001-set",
            {
                "schemaVersion": 2,
                "sessionSetName": "001-set",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        rc = main(["--scan", str(tmp_path), "--strategy", "regex"])
        out = capsys.readouterr().out
        assert rc == 0
        assert "Summary:" in out
        assert "1 migrated" in out
        assert "[migrated]" in out

    def test_interactive_non_tty_falls_back_to_regex(self, tmp_path, capsys, monkeypatch):
        _write_state(
            tmp_path / "001-set",
            {
                "schemaVersion": 2,
                "sessionSetName": "001-set",
                "currentSession": 3,
                "totalSessions": 3,
                "status": "complete",
                "lifecycleState": "closed",
                "completedSessions": [1, 2, 3],
            },
        )
        # Force stdin.isatty() to False to exercise the non-TTY branch.
        monkeypatch.setattr("sys.stdin", io.StringIO(""))
        rc = main(["--scan", str(tmp_path), "--strategy", "interactive", "--json"])
        payload = json.loads(capsys.readouterr().out)
        assert rc == 0
        assert payload["counts"]["migrated"] == 1
