import json

from ai_router.metrics import (
    load_metrics,
    opus_equivalent_savings,
    priced_and_unpriced,
    print_metrics_report,
    record_call,
)


def _config_at(tmp_path, base_config):
    base_config["_config_path"] = str(tmp_path / "router-config.yaml")
    return base_config


def _record(config, **overrides):
    kwargs = dict(
        call_type="route", task_type="general", model="pro",
        provider="google", tier=2, complexity_score=50,
        generation_params={}, input_tokens=100, output_tokens=200,
        cost_usd=0.01, elapsed_seconds=1.5, escalated=False,
        stop_reason="end_turn",
    )
    kwargs.update(overrides)
    record_call(config, **kwargs)


class TestRecordCall:
    def test_appends_one_json_line_per_call(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        _record(config)
        _record(config, model="opus", provider="anthropic")
        rows = load_metrics(config)
        assert len(rows) == 2
        assert rows[0]["model"] == "pro"
        assert rows[1]["provider"] == "anthropic"

    def test_none_cost_stays_null_never_zero(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        _record(config, cost_usd=None, billed_usage_unavailable=True,
                transport="copilot-cli", transport_session_id="conv-9")
        row = load_metrics(config)[0]
        assert row["cost_usd"] is None
        assert row["billed_usage_unavailable"] is True
        assert row["transport_session_id"] == "conv-9"

    def test_session_set_normalized_to_slug(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        for shape in (
            "042-my-set",
            "docs/session-sets/042-my-set",
            "D:\\repo\\docs\\session-sets\\042-my-set",
        ):
            _record(config, session_set=shape)
        rows = load_metrics(config)
        assert {r["session_set"] for r in rows} == {"042-my-set"}

    def test_mismatch_is_tri_state(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        _record(config, requested_model_id="a", served_model_id="b")
        _record(config, requested_model_id="a", served_model_id="a")
        _record(config, requested_model_id="a", served_model_id=None)
        flags = [r["served_model_mismatch"] for r in load_metrics(config)]
        assert flags == [True, False, None]

    def test_disabled_metrics_write_nothing(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        config["metrics"]["enabled"] = False
        _record(config)
        assert load_metrics(config) == []

    def test_write_failure_never_raises(self, base_config, monkeypatch):
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", "Z:\\no\\such\\dir\\metrics.jsonl"
        )
        _record(base_config)  # must not raise

    def test_env_override_wins_over_config_location(
        self, tmp_path, base_config, monkeypatch
    ):
        target = tmp_path / "elsewhere" / "m.jsonl"
        monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(target))
        config = _config_at(tmp_path, base_config)
        _record(config)
        assert target.exists()

    def test_load_skips_unparseable_lines(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        _record(config)
        log = tmp_path / "router-metrics.jsonl"
        log.write_text(
            log.read_text(encoding="utf-8") + "garbage line\n", encoding="utf-8"
        )
        assert len(load_metrics(config)) == 1


class TestReport:
    def test_priced_and_unpriced_split(self):
        rows = [
            {"cost_usd": 0.5},
            {"cost_usd": None, "billed_usage_unavailable": True},
            {"cost_usd": None},
        ]
        priced, unpriced = priced_and_unpriced(rows)
        assert len(priced) == 1 and len(unpriced) == 2

    def test_opus_equivalent_savings(self, base_config):
        rows = [{"cost_usd": 1.0, "input_tokens": 1_000_000,
                 "output_tokens": 100_000}]
        # Baseline on `opus` (5/25): 5.0 + 2.5 = 7.5; savings 6.5.
        savings = opus_equivalent_savings(rows, base_config)
        assert round(savings, 6) == 6.5

    def test_savings_none_when_nothing_priced(self, base_config):
        rows = [{"cost_usd": None, "billed_usage_unavailable": True}]
        assert opus_equivalent_savings(rows, base_config) is None

    def test_report_never_prints_zero_for_unpriced(
        self, tmp_path, base_config, capsys
    ):
        config = _config_at(tmp_path, base_config)
        _record(config, cost_usd=None, billed_usage_unavailable=True,
                transport="copilot-cli", model="seat-model")
        print_metrics_report(config)
        out = capsys.readouterr().out
        assert "no call in this log was priced" in out
        assert "NOT PRICED HERE" in out
        assert "$0.0000" not in out

    def test_report_totals_priced_calls(self, tmp_path, base_config, capsys):
        config = _config_at(tmp_path, base_config)
        _record(config, cost_usd=0.25)
        _record(config, cost_usd=0.75, session_set="042-x")
        print_metrics_report(config)
        out = capsys.readouterr().out
        assert "$1.0000 over 2 call(s)" in out
        assert "042-x" in out

    def test_empty_log_reports_cleanly(self, tmp_path, base_config, capsys):
        config = _config_at(tmp_path, base_config)
        print_metrics_report(config)
        assert "no metrics recorded yet" in capsys.readouterr().out
