from ai_router.metrics import (
    load_metrics,
    print_metrics_report,
    record_call,
)


def _config_at(tmp_path, base_config):
    base_config["_config_path"] = str(tmp_path / "router-config.yaml")
    return base_config


def _record(config, **overrides):
    kwargs = dict(
        call_type="route", task_type="general", model="pro",
        provider="google", generation_params={}, input_tokens=100,
        output_tokens=200, elapsed_seconds=1.5, escalated=False,
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

    def test_records_tokens_and_no_dollar_figure(self, tmp_path, base_config):
        config = _config_at(tmp_path, base_config)
        _record(config, billed_usage_unavailable=True,
                transport="copilot-cli", transport_session_id="conv-9")
        row = load_metrics(config)[0]
        assert "cost_usd" not in row
        assert (row["input_tokens"], row["output_tokens"]) == (100, 200)
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

    def test_write_failure_never_raises(
        self, tmp_path, base_config, monkeypatch
    ):
        # A path under a regular file is unwritable on every platform. A
        # bare `Z:\...` is only unwritable on Windows — POSIX accepts it as
        # a filename, so the test passed vacuously and left the file behind.
        blocker = tmp_path / "not-a-directory"
        blocker.write_text("", encoding="utf-8")
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(blocker / "metrics.jsonl")
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
    def test_report_totals_tokens_and_names_no_dollars(
        self, tmp_path, base_config, capsys
    ):
        config = _config_at(tmp_path, base_config)
        _record(config)
        _record(config, session_set="042-x")
        print_metrics_report(config)
        out = capsys.readouterr().out
        assert "Total input tokens:   200" in out
        assert "042-x" in out
        assert "$" not in out

    def test_seat_rows_point_at_the_conversation_id_that_prices_them(
        self, tmp_path, base_config, capsys
    ):
        config = _config_at(tmp_path, base_config)
        _record(config, billed_usage_unavailable=True,
                transport="copilot-cli", transport_session_id="conv-9",
                model="seat-model")
        print_metrics_report(config)
        out = capsys.readouterr().out
        assert "billed_usage_unavailable" in out
        assert "ai_router.seat_cost" in out

    def test_empty_log_reports_cleanly(self, tmp_path, base_config, capsys):
        config = _config_at(tmp_path, base_config)
        print_metrics_report(config)
        assert "no metrics recorded yet" in capsys.readouterr().out
