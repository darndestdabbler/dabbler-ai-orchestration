"""Outsource-last cost report tests — Set 004 / Session 2.

When a session set is ``outsourceMode: last``, the cost report
replaces USD-based reporting with a subscription-utilization
heartbeat. These tests verify:

* ``get_costs`` picks up ``outsource_mode`` from spec.md and attaches
  ``subscription_utilization`` for the orchestrator role provider.
* The text report shows the utilization metrics with explicit
  heartbeat-only framing (no throttle prediction).
* The JSON report includes utilization with stable rounding.
* Outsource-first sets do NOT get the utilization key.
* Missing capacity_signal.jsonl is surfaced cleanly.
"""

from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import cost_report  # noqa: E402
from cost_report import (
    SUBSCRIPTION_WINDOW_MINUTES,
    get_costs,
    print_cost_report,
)
from session_log import SessionLog
from capacity import CAPACITY_SIGNAL_FILENAME


# --------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------

OUTSOURCE_LAST_SPEC = """\
# Test Outsource-Last Set

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: last
orchestratorRole: claude
verifierRole: openai
```
"""

OUTSOURCE_FIRST_SPEC = """\
# Test Outsource-First Set

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
"""


@pytest.fixture
def outsource_last_dir(tmp_path: Path) -> Path:
    d = tmp_path / "session-sets" / "set-last"
    d.mkdir(parents=True)
    SessionLog(str(d), total_sessions=4)
    (d / "spec.md").write_text(OUTSOURCE_LAST_SPEC, encoding="utf-8")
    return d


@pytest.fixture
def outsource_first_dir(tmp_path: Path) -> Path:
    d = tmp_path / "session-sets" / "set-first"
    d.mkdir(parents=True)
    SessionLog(str(d), total_sessions=4)
    (d / "spec.md").write_text(OUTSOURCE_FIRST_SPEC, encoding="utf-8")
    return d


@pytest.fixture
def queues_base(tmp_path: Path, monkeypatch) -> Path:
    """Redirect the cost report's queues lookup to a tmp tree."""
    base = tmp_path / "provider-queues"
    base.mkdir()
    monkeypatch.setenv("AI_ROUTER_QUEUES_BASE_DIR", str(base))
    return base


@pytest.fixture(autouse=True)
def _isolate_metrics(tmp_path: Path, monkeypatch):
    # Ensure the dual-source cost machinery doesn't pick up the real
    # repo's router-metrics.jsonl during these tests.
    monkeypatch.setenv(
        "AI_ROUTER_METRICS_PATH",
        str(tmp_path / "router-metrics.jsonl"),
    )


def _write_signal(
    queues_base: Path, provider: str, ts: datetime,
    tokens_input: int = 0, tokens_output: int = 0,
) -> None:
    d = queues_base / provider
    d.mkdir(parents=True, exist_ok=True)
    rec = {
        "timestamp": ts.isoformat(),
        "provider": provider,
        "task_type": "verification",
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "elapsed_seconds": None,
        "model_name": None,
    }
    with (d / CAPACITY_SIGNAL_FILENAME).open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")


# ====================================================================
# get_costs — mode detection
# ====================================================================

class TestGetCostsModeDetection:
    def test_outsource_last_attaches_utilization(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        # Drop one signal record for the orchestrator role provider.
        now = datetime.now(timezone.utc)
        _write_signal(queues_base, "claude", now - timedelta(minutes=10),
                      tokens_input=1000, tokens_output=500)
        s = get_costs(str(outsource_last_dir))
        assert s["outsource_mode"] == "last"
        util = s["subscription_utilization"]
        assert util["provider"] == "claude"
        assert util["completions_in_subscription_window"] == 1
        assert util["tokens_in_subscription_window"] == 1500
        assert util["last_completion_at"] is not None

    def test_outsource_first_no_utilization(
        self, outsource_first_dir: Path, queues_base: Path,
    ):
        s = get_costs(str(outsource_first_dir))
        assert s.get("outsource_mode") == "first"
        assert "subscription_utilization" not in s

    def test_outsource_last_with_no_signal_file(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        # No capacity_signal.jsonl yet — common at session start.
        s = get_costs(str(outsource_last_dir))
        util = s["subscription_utilization"]
        assert util["signal_file_present"] is False
        assert util["completions_in_subscription_window"] == 0
        assert util["tokens_per_minute"] == 0.0  # zero / 60 min
        assert util["last_completion_at"] is None
        assert util["time_since_last_seconds"] is None


# ====================================================================
# Subscription window math
# ====================================================================

class TestSubscriptionWindowMath:
    def test_old_completion_outside_5_hour_window(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        # Completion older than 5 hours falls out of the subscription
        # window but is still tracked as "last completion".
        now = datetime.now(timezone.utc)
        _write_signal(queues_base, "claude",
                      now - timedelta(hours=6),
                      tokens_input=99, tokens_output=99)
        s = get_costs(str(outsource_last_dir))
        util = s["subscription_utilization"]
        # Out of the 5-hour window.
        assert util["completions_in_subscription_window"] == 0
        # But the absolute "last completion" stamp is still surfaced.
        assert util["last_completion_at"] is not None

    def test_subscription_window_is_5_hours(self):
        # 5 hours is the spec default. If this changes, the printed
        # report's framing needs to change too — the test pins the
        # invariant.
        assert SUBSCRIPTION_WINDOW_MINUTES == 300

    def test_token_burn_rate_uses_60_minute_lookback(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        # Two completions in the last 60 min = 100 tokens total.
        now = datetime.now(timezone.utc)
        _write_signal(queues_base, "claude",
                      now - timedelta(minutes=10),
                      tokens_input=30, tokens_output=20)
        _write_signal(queues_base, "claude",
                      now - timedelta(minutes=30),
                      tokens_input=30, tokens_output=20)
        s = get_costs(str(outsource_last_dir))
        util = s["subscription_utilization"]
        # 100 tokens / 60 min = 1.666... tokens/min
        assert util["tokens_per_minute"] == pytest.approx(100 / 60.0)
        assert util["rate_lookback_minutes"] == 60


# ====================================================================
# Text report
# ====================================================================

class TestOutsourceLastTextReport:
    def test_text_report_shows_utilization_block(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        now = datetime.now(timezone.utc)
        _write_signal(queues_base, "claude",
                      now - timedelta(minutes=15),
                      tokens_input=500, tokens_output=500)
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(outsource_last_dir))
        out = buf.getvalue()
        # Header signals the mode.
        assert "outsource-last" in out
        assert "subscription utilization" in out.lower()
        # All three required lines (per spec.md).
        assert "5.0-hour window" in out
        assert "Token burn rate" in out
        assert "Last activity" in out
        # Heartbeat-only caveat is loud and unmissable.
        assert "backward-looking heartbeat" in out
        assert "not a routing or capacity prediction" in out
        # USD lines do NOT lead the report (the utilization block does).
        assert out.index("subscription utilization") < out.index(
            "Routed-model spend"
        )

    def test_text_report_handles_missing_signal_file(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        # No capacity_signal.jsonl — must not crash, must surface the
        # absence to the operator.
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(outsource_last_dir))
        out = buf.getvalue()
        assert "capacity_signal.jsonl not found" in out
        # Still shows the structural lines, just with zeros.
        assert "5.0-hour window: 0" in out

    def test_outsource_first_text_report_unchanged(
        self, outsource_first_dir: Path, queues_base: Path,
    ):
        # The outsource-first text report should match the Session 1
        # behavior — no subscription-utilization block.
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(outsource_first_dir))
        out = buf.getvalue()
        assert "subscription utilization" not in out.lower()
        assert "Token burn rate" not in out
        # Original outsource-first labels still present.
        assert "Routed-model spend (canonical)" in out
        assert "Activity-log adjustments (supplemental)" in out


# ====================================================================
# JSON report
# ====================================================================

class TestOutsourceLastJsonReport:
    def test_json_includes_utilization(
        self, outsource_last_dir: Path, queues_base: Path,
    ):
        now = datetime.now(timezone.utc)
        _write_signal(queues_base, "claude",
                      now - timedelta(minutes=10),
                      tokens_input=100, tokens_output=200)
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(outsource_last_dir), format="json")
        data = json.loads(buf.getvalue())
        assert data["outsource_mode"] == "last"
        util = data["subscription_utilization"]
        assert util["provider"] == "claude"
        assert util["completions_in_subscription_window"] == 1
        assert util["tokens_in_subscription_window"] == 300
        # Floats rounded to 6 dp for stable diffs.
        rate = util["tokens_per_minute"]
        assert isinstance(rate, float)
        assert round(rate, 6) == rate

    def test_outsource_first_json_keeps_utilization_null(
        self, outsource_first_dir: Path, queues_base: Path,
    ):
        buf = io.StringIO()
        with redirect_stdout(buf):
            print_cost_report(str(outsource_first_dir), format="json")
        data = json.loads(buf.getvalue())
        assert data["outsource_mode"] == "first"
        assert data["subscription_utilization"] is None
