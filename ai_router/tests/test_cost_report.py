"""Unit + integration tests for the dual-sourced cost report.

Set 004 / Session 1 re-sources ``print_cost_report``:

  * router-metrics.jsonl (filtered by session_set) is canonical.
  * activity-log.json is supplemental.
  * Discrepancies > $0.01 produce a labeled warning.
  * ``--format json`` (i.e. ``format='json'``) emits parseable JSON.
  * Existing callers of ``get_costs()`` continue to work — every
    field the activity-log-only summary returned is still at the
    top level of the new dict.

Tests inject a fake metrics file via ``AI_ROUTER_METRICS_PATH`` and a
real per-set ``activity-log.json`` written through ``SessionLog``, so
every code path is exercised without monkey-patching internals.
"""

from __future__ import annotations

import io
import json
import os
from contextlib import redirect_stdout
from pathlib import Path

import pytest

# conftest puts ai_router/ on sys.path
import cost_report  # noqa: E402
from cost_report import (
    _COST_DISCREPANCY_THRESHOLD_USD,
    _matches_session_set,
    get_costs,
    print_cost_report,
)
from session_log import SessionLog  # noqa: E402


# --------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------

@pytest.fixture
def session_set_dir(tmp_path: Path) -> Path:
    """Create an empty session set directory with totalSessions=4 (so
    sessions_remaining math is non-trivial)."""
    d = tmp_path / "session-sets" / "004-test"
    d.mkdir(parents=True)
    SessionLog(str(d), total_sessions=4)
    return d


@pytest.fixture
def metrics_path(tmp_path: Path, monkeypatch) -> Path:
    """Redirect ``router-metrics.jsonl`` to a tmp file via the
    AI_ROUTER_METRICS_PATH env var. Tests choose to write or not write
    to the file."""
    p = tmp_path / "router-metrics.jsonl"
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(p))
    return p


def _write_metric(metrics_path: Path, **fields) -> None:
    """Append one metrics record. Sensible defaults for every required
    field; tests only set the ones they care about."""
    rec = {
        "timestamp": "2026-04-30T12:00:00+00:00",
        "session_set": "docs/session-sets/004-test",
        "session_number": 1,
        "call_type": "route",
        "task_type": "general",
        "model": "gemini-flash",
        "provider": "google",
        "tier": 1,
        "complexity_score": 30,
        "effort": None,
        "thinking_on": False,
        "input_tokens": 1000,
        "output_tokens": 200,
        "cost_usd": 0.0,
        "elapsed_seconds": 1.2,
        "escalated": False,
        "stop_reason": "end_turn",
        "verifier_of": None,
        "verdict": None,
        "issue_count": None,
    }
    rec.update(fields)
    with open(metrics_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")


def _log_activity(session_set_dir: Path, *, session_number: int,
                  step_number: int, model: str, cost_usd: float) -> None:
    """Append one activity-log entry with a single routed API call."""
    log = SessionLog(str(session_set_dir))
    log.log_step(
        session_number=session_number,
        step_number=step_number,
        step_key=f"session-{session_number}/step-{step_number}",
        description="test",
        status="complete",
        api_calls=[{
            "model": model,
            "provider": "google",
            "costUsd": cost_usd,
        }],
    )


# --------------------------------------------------------------------
# _matches_session_set helper
# --------------------------------------------------------------------

class TestMatchesSessionSet:
    def test_exact_path_match(self):
        assert _matches_session_set(
            "docs/session-sets/foo",
            "docs/session-sets/foo",
            "foo",
        )

    def test_windows_path_canonicalized(self):
        assert _matches_session_set(
            "docs\\session-sets\\foo",
            "docs/session-sets/foo",
            "foo",
        )

    def test_basename_match(self):
        assert _matches_session_set("foo", "docs/session-sets/foo", "foo")

    def test_unrelated_set_does_not_match(self):
        assert not _matches_session_set(
            "docs/session-sets/bar",
            "docs/session-sets/foo",
            "foo",
        )

    def test_empty_record_does_not_match(self):
        assert not _matches_session_set(
            None, "docs/session-sets/foo", "foo"
        )
        assert not _matches_session_set(
            "", "docs/session-sets/foo", "foo"
        )


# --------------------------------------------------------------------
# get_costs() — backward-compatibility + dual-sourcing
# --------------------------------------------------------------------

class TestGetCosts:
    def test_backward_compat_keys_present(
        self, session_set_dir, metrics_path
    ):
        # No activity entries, no metrics records — every old key still
        # has to be there with sane defaults.
        summary = get_costs(str(session_set_dir))
        assert "total_calls" in summary
        assert "total_cost" in summary
        assert "by_model" in summary
        assert "sessions_completed" in summary
        assert "sessions_remaining" in summary
        # New dual-sourced keys
        assert "routed_canonical" in summary
        assert "activity_supplemental" in summary
        assert "delta_usd" in summary
        assert "discrepancy" in summary

    def test_matching_totals_no_discrepancy(
        self, session_set_dir, metrics_path
    ):
        _write_metric(
            metrics_path, model="gemini-flash", cost_usd=0.0050
        )
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.0050,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["routed_canonical"]["total_cost"] == pytest.approx(
            0.0050
        )
        assert summary["activity_supplemental"]["total_cost"] == pytest.approx(
            0.0050
        )
        assert summary["delta_usd"] == pytest.approx(0.0)
        assert summary["discrepancy"] is False

    def test_mismatched_totals_flagged(
        self, session_set_dir, metrics_path
    ):
        _write_metric(
            metrics_path, model="gemini-flash", cost_usd=0.10
        )
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.50,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["delta_usd"] == pytest.approx(0.40)
        assert summary["discrepancy"] is True

    def test_just_under_threshold_not_flagged(
        self, session_set_dir, metrics_path
    ):
        # 0.005 USD apart — below the 0.01 threshold, should not flag
        _write_metric(
            metrics_path, model="gemini-flash", cost_usd=0.10
        )
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.105,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["discrepancy"] is False

    def test_just_over_threshold_flagged(
        self, session_set_dir, metrics_path
    ):
        _write_metric(
            metrics_path, model="gemini-flash", cost_usd=0.10
        )
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.111,
        )
        summary = get_costs(str(session_set_dir))
        assert abs(summary["delta_usd"]) > _COST_DISCREPANCY_THRESHOLD_USD
        assert summary["discrepancy"] is True

    def test_missing_metrics_file(
        self, session_set_dir, metrics_path
    ):
        # metrics_path env var points at a path that does not exist
        assert not metrics_path.exists()
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.10,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["routed_canonical"]["metrics_file_present"] is False
        assert summary["routed_canonical"]["total_cost"] == 0.0
        assert summary["activity_supplemental"]["total_cost"] == pytest.approx(
            0.10
        )
        # Activity log claims spend the metrics log can't see → delta > 0
        assert summary["delta_usd"] == pytest.approx(0.10)
        assert summary["discrepancy"] is True

    def test_missing_activity_log(self, tmp_path, metrics_path):
        # Set dir exists but no activity-log.json (SessionLog creates
        # one on init, so we delete it after init to simulate "missing").
        d = tmp_path / "set"
        d.mkdir()
        SessionLog(str(d), total_sessions=2)
        activity = d / "activity-log.json"
        activity.unlink()  # simulate "missing"
        # Use a session_set value that matches by basename ("set")
        _write_metric(
            metrics_path,
            session_set="docs/session-sets/set",
            model="opus", cost_usd=2.5,
        )
        # SessionLog re-creates the file on construction — the
        # supplemental side will see a fresh empty log. The point is
        # that get_costs does not crash and routed totals are correct.
        summary = get_costs(str(d))
        assert summary["routed_canonical"]["total_cost"] == pytest.approx(
            2.5
        )
        assert summary["activity_supplemental"]["total_cost"] == 0.0
        # Delta is negative — metrics says spend, activity log says none
        assert summary["delta_usd"] == pytest.approx(-2.5)
        assert summary["discrepancy"] is True

    def test_both_missing(self, tmp_path, metrics_path):
        d = tmp_path / "empty"
        d.mkdir()
        # Don't write any metric; don't construct a SessionLog (so no
        # activity-log.json exists yet — but get_costs will create
        # one through SessionLog init).
        summary = get_costs(str(d))
        assert summary["routed_canonical"]["total_cost"] == 0.0
        assert summary["activity_supplemental"]["total_cost"] == 0.0
        assert summary["delta_usd"] == 0.0
        assert summary["discrepancy"] is False
        assert summary["total_calls"] == 0

    def test_session_set_filter_excludes_other_sets(
        self, session_set_dir, metrics_path
    ):
        # Records for two different session sets; only ours should count
        _write_metric(
            metrics_path,
            session_set="docs/session-sets/004-test",
            model="gemini-flash", cost_usd=1.00,
        )
        _write_metric(
            metrics_path,
            session_set="docs/session-sets/099-other",
            model="gemini-flash", cost_usd=99.00,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["routed_canonical"]["total_cost"] == pytest.approx(
            1.00
        )

    def test_canonical_path_separator_normalized(
        self, session_set_dir, metrics_path
    ):
        # Windows-style backslash in the record's session_set must
        # still match a forward-slash query.
        _write_metric(
            metrics_path,
            session_set="docs\\session-sets\\004-test",
            model="opus", cost_usd=3.00,
        )
        summary = get_costs(str(session_set_dir))
        assert summary["routed_canonical"]["total_cost"] == pytest.approx(
            3.00
        )

    def test_activity_log_present_false_when_file_absent(
        self, tmp_path, metrics_path
    ):
        """Regression for the cross-provider review finding: probing
        ``activity_log_present`` must happen *before* SessionLog is
        constructed, since SessionLog's __init__ creates the file.
        Otherwise the flag is always True and the missing-file branch
        of print_cost_report is unreachable."""
        d = tmp_path / "set"
        d.mkdir()
        # Construct then delete to set up a directory with no log.
        SessionLog(str(d), total_sessions=2)
        (d / "activity-log.json").unlink()
        summary = get_costs(str(d))
        assert summary["activity_supplemental"]["activity_log_present"] is False

    def test_activity_log_present_true_when_file_exists(
        self, session_set_dir, metrics_path
    ):
        # session_set_dir fixture already created an activity-log.json
        summary = get_costs(str(session_set_dir))
        assert summary["activity_supplemental"]["activity_log_present"] is True

    def test_by_model_aggregates_correctly(
        self, session_set_dir, metrics_path
    ):
        _write_metric(metrics_path, model="opus", cost_usd=1.00)
        _write_metric(metrics_path, model="opus", cost_usd=2.00)
        _write_metric(metrics_path, model="gemini-flash", cost_usd=0.05)
        summary = get_costs(str(session_set_dir))
        bm = summary["routed_canonical"]["by_model"]
        assert bm["opus"]["calls"] == 2
        assert bm["opus"]["cost"] == pytest.approx(3.00)
        assert bm["gemini-flash"]["calls"] == 1
        assert bm["gemini-flash"]["cost"] == pytest.approx(0.05)


# --------------------------------------------------------------------
# print_cost_report() — text + JSON
# --------------------------------------------------------------------

class TestPrintCostReportText:
    def test_text_output_shows_both_totals(
        self, session_set_dir, metrics_path
    ):
        _write_metric(metrics_path, model="opus", cost_usd=1.50)
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="opus", cost_usd=1.50,
        )
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(session_set_dir))
        text = buf.getvalue()
        assert "Routed-model spend (canonical)" in text
        assert "Activity-log adjustments (supplemental)" in text
        assert "$1.5000" in text
        # No discrepancy → no warning
        assert "WARNING" not in text

    def test_text_output_warns_on_discrepancy(
        self, session_set_dir, metrics_path
    ):
        _write_metric(metrics_path, model="opus", cost_usd=0.10)
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="opus", cost_usd=1.00,
        )
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(session_set_dir))
        text = buf.getvalue()
        assert "WARNING" in text
        assert "discrepancy" in text.lower()
        # Activity log claims more → "MORE" direction message
        assert "MORE" in text

    def test_text_output_warns_on_negative_delta(
        self, session_set_dir, metrics_path
    ):
        _write_metric(metrics_path, model="opus", cost_usd=2.00)
        # No activity log entries → activity total is 0 → delta < 0
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(session_set_dir))
        text = buf.getvalue()
        assert "WARNING" in text
        assert "LESS" in text

    def test_text_output_notes_missing_metrics_file(
        self, session_set_dir, metrics_path
    ):
        # Don't create the metrics file
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(session_set_dir))
        text = buf.getvalue()
        assert "router-metrics.jsonl not found" in text


class TestPrintCostReportJson:
    def test_json_format_is_parseable(
        self, session_set_dir, metrics_path
    ):
        _write_metric(metrics_path, model="opus", cost_usd=1.00)
        _log_activity(
            session_set_dir,
            session_number=1, step_number=1,
            model="opus", cost_usd=0.50,
        )
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(session_set_dir), format="json")
        out = json.loads(buf.getvalue())
        assert out["routed_canonical"]["total_cost"] == pytest.approx(1.00)
        assert out["activity_supplemental"]["total_cost"] == pytest.approx(
            0.50
        )
        assert out["delta_usd"] == pytest.approx(-0.50)
        assert out["discrepancy"] is True
        assert out["routed_canonical"]["metrics_file_present"] is True

    def test_invalid_format_raises(self, session_set_dir, metrics_path):
        with pytest.raises(ValueError, match="format must be"):
            print_cost_report(str(session_set_dir), format="xml")


# --------------------------------------------------------------------
# Integration: real session set on disk, real metrics file
# --------------------------------------------------------------------

class TestIntegration:
    def test_full_round_trip(self, tmp_path, monkeypatch):
        """Construct a session set directory layout that mirrors the
        production layout (docs/session-sets/<slug>) and verify
        get_costs + print_cost_report against it end-to-end."""
        repo = tmp_path / "repo"
        sets_dir = repo / "docs" / "session-sets"
        sset = sets_dir / "004-cost-enforcement-and-capacity"
        sset.mkdir(parents=True)
        SessionLog(str(sset), total_sessions=4)

        # Two sessions worth of activity
        _log_activity(
            sset, session_number=1, step_number=1,
            model="gemini-flash", cost_usd=0.0123,
        )
        _log_activity(
            sset, session_number=1, step_number=2,
            model="opus", cost_usd=0.4567,
        )

        metrics = repo / "router-metrics.jsonl"
        monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))

        # Metrics record uses the relative path the orchestrator passed
        # at route time, which is the canonical form of the session
        # set dir.
        rel = "docs/session-sets/004-cost-enforcement-and-capacity"
        _write_metric(
            metrics, session_set=rel, model="gemini-flash", cost_usd=0.0123
        )
        _write_metric(
            metrics, session_set=rel, model="opus", cost_usd=0.4567
        )

        summary = get_costs(str(sset))
        assert summary["routed_canonical"]["total_cost"] == pytest.approx(
            0.4690
        )
        assert summary["activity_supplemental"]["total_cost"] == pytest.approx(
            0.4690
        )
        assert summary["discrepancy"] is False

        # Both text and json formats run cleanly
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(sset))
        text = buf.getvalue()
        assert "AI ROUTER" in text
        assert "WARNING" not in text

        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(sset), format="json")
        parsed = json.loads(buf.getvalue())
        assert parsed["sessions_completed"] == 0  # no review files
        assert parsed["sessions_remaining"] == 4
