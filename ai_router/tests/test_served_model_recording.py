"""Set 109 S1 — the router records what the provider SERVED, not just what it
asked for.

The failure this closes: ``router-config.yaml`` sent ``model_id: gpt-5.6``,
OpenAI served ``gpt-5.6-sol`` at twice the recorded price, and nothing in the
router could see the substitution because only the requested id was ever
written down. Every test here drives the real provider callers over captured
response bodies; none opens a socket.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

import metrics as metrics_mod  # type: ignore[import-not-found]
import model_inventory_fixtures as fx
import providers as providers_mod  # type: ignore[import-not-found]


PROVIDER_CFG = {
    "api_key_env": "TEST_SERVED_KEY",
    "timeout_seconds": 30,
    "retry": {"max_retries": 0, "backoff_base_seconds": 0},
}


@pytest.fixture
def responds(monkeypatch):
    """Make every ``httpx.Client`` built inside providers.py answer from a fixture."""
    monkeypatch.setenv("TEST_SERVED_KEY", "k")

    # Capture the real class BEFORE patching: providers.py resolves
    # ``httpx.Client`` off the shared module object, so the patch is global and
    # a factory that called ``httpx.Client`` again would call itself.
    real_client = httpx.Client

    def install(payload: dict):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=payload)

        def factory(*args, **kwargs):
            kwargs.pop("timeout", None)
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(providers_mod.httpx, "Client", factory)

    return install


# ---------------------------------------------------------------------------
# The shared extraction helper
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"model": "gpt-5.6-sol"}, "gpt-5.6-sol"),
        ({}, None),                      # provider did not report one
        ({"model": None}, None),
        ({"model": ""}, None),
        ({"model": "   "}, None),
        ({"model": 5.6}, None),          # not a string: must not reach the log
        ({"model": ["gpt-5.6-sol"]}, None),
    ],
)
def test_served_model_id_is_extracted_defensively(body, expected):
    assert providers_mod._served_model_id(body, "model") == expected


# ---------------------------------------------------------------------------
# Per-provider capture
# ---------------------------------------------------------------------------


def test_anthropic_records_the_served_model(responds):
    responds(fx.ANTHROPIC_MESSAGE_RESPONSE)
    result = providers_mod.call_model(
        "anthropic", "claude-sonnet-4-6", "sys", "hi", 16, PROVIDER_CFG, {},
    )
    assert result.served_model_id == "claude-sonnet-4-6"


def test_google_records_the_served_model_from_model_version(responds):
    responds(fx.GOOGLE_GENERATE_RESPONSE)
    result = providers_mod.call_model(
        "google", "gemini-2.5-pro", "sys", "hi", 16, PROVIDER_CFG, {},
    )
    assert result.served_model_id == "gemini-2.5-pro"


def test_openai_records_a_dated_snapshot_as_the_served_model(responds):
    # Captured live: a plain `gpt-5.4-mini` request comes back served as a
    # dated snapshot. Requested != served is ROUTINE on this provider, which is
    # exactly why the mismatch is derived at read time and never stored as an
    # alarm bit.
    responds(fx.OPENAI_RESPONSES_RESPONSE)
    result = providers_mod.call_model(
        "openai", "gpt-5.4-mini", "sys", "hi", 16, PROVIDER_CFG, {},
    )
    assert result.served_model_id == "gpt-5.4-mini-2026-03-17"
    assert result.served_model_id != "gpt-5.4-mini"


def test_a_response_without_a_model_field_records_none(responds):
    body = dict(fx.ANTHROPIC_MESSAGE_RESPONSE)
    del body["model"]
    responds(body)
    result = providers_mod.call_model(
        "anthropic", "claude-sonnet-4-6", "sys", "hi", 16, PROVIDER_CFG, {},
    )
    assert result.served_model_id is None


def test_a_non_string_model_field_cannot_break_a_paid_call(responds):
    body = dict(fx.OPENAI_RESPONSES_RESPONSE, model={"id": "gpt-5.4-mini"})
    responds(body)
    result = providers_mod.call_model(
        "openai", "gpt-5.4-mini", "sys", "hi", 16, PROVIDER_CFG, {},
    )
    assert result.content == "OK"
    assert result.served_model_id is None


def test_api_result_defaults_served_model_id_to_none():
    result = providers_mod.APIResult(
        content="x", input_tokens=1, output_tokens=1, stop_reason="end_turn",
    )
    assert result.served_model_id is None


# ---------------------------------------------------------------------------
# The metrics columns
# ---------------------------------------------------------------------------


def _record(tmp_path: Path, monkeypatch, **kwargs) -> dict:
    log = tmp_path / "router-metrics.jsonl"
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(log))
    base = dict(
        call_type="route", task_type="analysis", model="gpt-5-6",
        provider="openai", tier=3, complexity_score=50, generation_params={},
        input_tokens=10, output_tokens=20, cost_usd=0.5, elapsed_seconds=1.0,
        escalated=False, stop_reason="end_turn",
    )
    base.update(kwargs)
    metrics_mod.record_call({"metrics": {"enabled": True}}, **base)
    return json.loads(log.read_text(encoding="utf-8").splitlines()[-1])


def test_record_call_writes_both_model_id_columns(tmp_path, monkeypatch):
    row = _record(
        tmp_path, monkeypatch,
        requested_model_id="gpt-5.6", served_model_id="gpt-5.6-sol",
    )
    assert row["model"] == "gpt-5-6"            # the local alias
    assert row["requested_model_id"] == "gpt-5.6"
    assert row["served_model_id"] == "gpt-5.6-sol"


def test_a_mismatch_is_flagged_on_the_row(tmp_path, monkeypatch):
    row = _record(
        tmp_path, monkeypatch,
        requested_model_id="gpt-5.6", served_model_id="gpt-5.6-sol",
    )
    assert row["served_model_mismatch"] is True
    assert row["requested_model_id"] != row["served_model_id"]


def test_a_faithful_call_is_flagged_false(tmp_path, monkeypatch):
    row = _record(
        tmp_path, monkeypatch,
        requested_model_id="claude-sonnet-4-6",
        served_model_id="claude-sonnet-4-6",
    )
    assert row["served_model_mismatch"] is False


@pytest.mark.parametrize(
    "requested, served",
    [("gpt-5.6", None), (None, "gpt-5.6-sol"), (None, None)],
)
def test_the_flag_is_null_when_either_id_is_missing(
    tmp_path, monkeypatch, requested, served
):
    # null, not false: an uncaptured id does not establish that the provider
    # served what was asked for.
    row = _record(
        tmp_path, monkeypatch,
        requested_model_id=requested, served_model_id=served,
    )
    assert row["served_model_mismatch"] is None


def test_the_alias_column_alone_cannot_show_the_substitution(tmp_path, monkeypatch):
    # Before this change the row carried only `model`, the local alias. It is
    # equal on both rows below even though one call was substituted -- which is
    # why `requested_model_id` had to be added alongside `served_model_id`.
    substituted = _record(
        tmp_path, monkeypatch,
        requested_model_id="gpt-5.6", served_model_id="gpt-5.6-sol",
    )
    faithful = _record(
        tmp_path, monkeypatch,
        requested_model_id="gpt-5.6-sol", served_model_id="gpt-5.6-sol",
    )
    assert substituted["model"] == faithful["model"]
    assert substituted["requested_model_id"] != faithful["requested_model_id"]


def test_both_columns_default_to_null(tmp_path, monkeypatch):
    row = _record(tmp_path, monkeypatch)
    assert row["requested_model_id"] is None
    assert row["served_model_id"] is None


# ---------------------------------------------------------------------------
# The operator-visible surface. A column nothing reports is not a flag.
# ---------------------------------------------------------------------------


def test_the_report_groups_mismatches_by_substitution():
    rows = [
        {"served_model_mismatch": True, "requested_model_id": "gpt-5.4-mini",
         "served_model_id": "gpt-5.4-mini-2026-03-17"},
        {"served_model_mismatch": True, "requested_model_id": "gpt-5.4-mini",
         "served_model_id": "gpt-5.4-mini-2026-03-17"},
        {"served_model_mismatch": True, "requested_model_id": "gpt-5.6",
         "served_model_id": "gpt-5.6-sol"},
        {"served_model_mismatch": False, "requested_model_id": "x",
         "served_model_id": "x"},
    ]
    assert metrics_mod.served_model_mismatches(rows) == {
        "gpt-5.4-mini -> gpt-5.4-mini-2026-03-17": 2,
        "gpt-5.6 -> gpt-5.6-sol": 1,
    }


def test_historical_rows_are_absent_from_the_mismatch_report():
    # Pre-Set-109 rows carry neither id; an uncaptured pair is not a match.
    assert metrics_mod.served_model_mismatches(
        [{"model": "gpt-5-6", "cost_usd": 0.1}]
    ) == {}


def test_the_report_prints_the_substitution_and_stays_ascii(capsys):
    metrics_mod.print_served_model_mismatches([
        {"served_model_mismatch": True, "requested_model_id": "gpt-5.6",
         "served_model_id": "gpt-5.6-sol"},
    ])
    out = capsys.readouterr().out
    out.encode("cp1252")  # Windows console safety
    assert "gpt-5.6 -> gpt-5.6-sol" in out
    assert "1 of 1" in out


def test_the_report_says_so_when_nothing_mismatched(capsys):
    metrics_mod.print_served_model_mismatches([
        {"served_model_mismatch": False, "requested_model_id": "x",
         "served_model_id": "x"},
    ])
    assert "none mismatched" in capsys.readouterr().out


def test_the_report_is_silent_when_no_row_carries_the_columns(capsys):
    metrics_mod.print_served_model_mismatches([{"model": "gpt-5-6"}])
    assert capsys.readouterr().out == ""


def test_record_call_still_never_raises_on_a_bad_path(tmp_path, monkeypatch):
    # The log path is an existing DIRECTORY, so the append cannot succeed.
    # Metrics stay best-effort: a routed call that already cost money must not
    # be turned into an exception by its own bookkeeping.
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(tmp_path))
    metrics_mod.record_call(
        {"metrics": {"enabled": True}},
        call_type="route", task_type="analysis", model="gpt-5-6",
        provider="openai", tier=3, complexity_score=None, generation_params={},
        input_tokens=1, output_tokens=1, cost_usd=0.0, elapsed_seconds=0.1,
        escalated=False, stop_reason="end_turn",
        requested_model_id="gpt-5.6", served_model_id="gpt-5.6-sol",
    )
