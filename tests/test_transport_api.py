import json

import httpx
import pytest

import ai_router.transports.api as api_mod
from ai_router.transports.api import call_model

pytestmark = pytest.mark.usefixtures("provider_keys")


def _mock_httpx(monkeypatch, handler):
    """Route every httpx.Client request in the api module through *handler*
    (a callable request -> httpx.Response), exercising the real
    request-building code."""
    captured = []

    def _handler(request):
        captured.append(request)
        return handler(request)

    real_client = httpx.Client

    def _client(**kwargs):
        kwargs.pop("transport", None)
        return real_client(transport=httpx.MockTransport(_handler), **kwargs)

    monkeypatch.setattr(api_mod.httpx, "Client", _client)
    return captured


def _provider_cfg(base_config, name):
    return base_config["providers"][name]


ANTHROPIC_OK = {
    "content": [{"type": "text", "text": "hello"}],
    "usage": {"input_tokens": 12, "output_tokens": 34},
    "stop_reason": "end_turn",
    "model": "a-sonnet-2026-01-01",
}

GOOGLE_OK = {
    "candidates": [{
        "content": {"parts": [{"text": "hi from gemini"}]},
        "finishReason": "STOP",
    }],
    "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 21},
    "modelVersion": "g-pro-001",
}

OPENAI_OK = {
    "output_text": "hi from gpt",
    "usage": {"input_tokens": 9, "output_tokens": 18},
    "status": "completed",
    "model": "o-gpt-2026-03-17",
}


class TestAnthropic:
    def test_request_shape_and_result(self, base_config, monkeypatch):
        captured = _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=ANTHROPIC_OK)
        )
        result = call_model(
            "anthropic", "a-sonnet", "sys", "user msg", 1000,
            _provider_cfg(base_config, "anthropic"),
            {"effort": "high", "thinking": {"enabled": True}},
        )
        assert result.content == "hello"
        assert result.input_tokens == 12 and result.output_tokens == 34
        assert result.served_model_id == "a-sonnet-2026-01-01"

        body = json.loads(captured[0].content)
        assert body["system"] == "sys"
        assert body["thinking"] == {"type": "adaptive"}
        assert body["output_config"]["effort"] == "high"
        assert captured[0].headers["x-api-key"] == "test-key"

    def test_missing_key_raises_before_any_request(self, base_config, monkeypatch):
        monkeypatch.delenv("TEST_ANTHROPIC_KEY")
        captured = _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=ANTHROPIC_OK)
        )
        with pytest.raises(EnvironmentError, match="TEST_ANTHROPIC_KEY"):
            call_model(
                "anthropic", "a-sonnet", "s", "u", 100,
                _provider_cfg(base_config, "anthropic"),
            )
        assert not captured

    def test_retries_then_succeeds(self, base_config, monkeypatch):
        calls = {"n": 0}

        def handler(request):
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(500, json={})
            return httpx.Response(200, json=ANTHROPIC_OK)

        _mock_httpx(monkeypatch, handler)
        result = call_model(
            "anthropic", "a-sonnet", "s", "u", 100,
            _provider_cfg(base_config, "anthropic"),
        )
        assert result.content == "hello"
        assert calls["n"] == 2

    def test_exhausted_retries_raise(self, base_config, monkeypatch):
        _mock_httpx(monkeypatch, lambda req: httpx.Response(500, json={}))
        with pytest.raises(RuntimeError, match="failed after 2 attempts"):
            call_model(
                "anthropic", "a-sonnet", "s", "u", 100,
                _provider_cfg(base_config, "anthropic"),
            )

    def test_served_model_mismatch_warns(self, base_config, monkeypatch, capsys):
        _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=ANTHROPIC_OK)
        )
        call_model(
            "anthropic", "a-sonnet", "s", "u", 100,
            _provider_cfg(base_config, "anthropic"),
        )
        assert "served" in capsys.readouterr().err


class TestGoogle:
    def test_key_travels_in_header_not_url(self, base_config, monkeypatch):
        captured = _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=GOOGLE_OK)
        )
        result = call_model(
            "google", "g-pro", "sys", "user", 500,
            _provider_cfg(base_config, "google"),
            {"thinking_budget": -1},
        )
        request = captured[0]
        assert request.headers["x-goog-api-key"] == "test-key"
        assert "key=" not in str(request.url)
        assert result.content == "hi from gemini"
        assert result.served_model_id == "g-pro-001"

        body = json.loads(request.content)
        assert body["generationConfig"]["thinkingConfig"]["thinkingBudget"] == -1

    def test_gemini_3_uses_thinking_level(self, base_config, monkeypatch):
        captured = _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=GOOGLE_OK)
        )
        call_model(
            "google", "gemini-3-pro", "s", "u", 500,
            _provider_cfg(base_config, "google"),
            {"thinking_level": "high", "thinking_budget": -1},
        )
        body = json.loads(captured[0].content)
        assert body["generationConfig"]["thinkingConfig"] == {
            "thinkingLevel": "HIGH"
        }

    def test_max_tokens_finish_reason_maps(self, base_config, monkeypatch):
        payload = json.loads(json.dumps(GOOGLE_OK))
        payload["candidates"][0]["finishReason"] = "MAX_TOKENS"
        _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=payload))
        result = call_model(
            "google", "g-pro", "s", "u", 500,
            _provider_cfg(base_config, "google"),
        )
        assert result.stop_reason == "max_tokens"


class TestOpenAI:
    def test_request_shape_and_result(self, base_config, monkeypatch):
        captured = _mock_httpx(
            monkeypatch, lambda req: httpx.Response(200, json=OPENAI_OK)
        )
        result = call_model(
            "openai", "o-gpt", "sys", "user", 800,
            _provider_cfg(base_config, "openai"),
            {"reasoning_effort": "high"},
        )
        body = json.loads(captured[0].content)
        assert body["instructions"] == "sys"
        assert body["reasoning"] == {"effort": "high"}
        assert body["max_output_tokens"] == 800
        assert captured[0].headers["authorization"] == "Bearer test-key"
        assert result.content == "hi from gpt"
        assert result.served_model_id == "o-gpt-2026-03-17"

    def test_structured_output_fallback_walk(self, base_config, monkeypatch):
        payload = {
            "output": [{
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "part1 "},
                    {"type": "text", "text": "part2"},
                ],
            }],
            "usage": {"input_tokens": 1, "output_tokens": 2},
            "status": "completed",
        }
        _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=payload))
        result = call_model(
            "openai", "o-gpt", "s", "u", 100,
            _provider_cfg(base_config, "openai"),
        )
        assert result.content == "part1 part2"
        assert result.served_model_id is None

    def test_incomplete_status_maps_to_max_tokens(self, base_config, monkeypatch):
        payload = dict(OPENAI_OK)
        payload["status"] = "incomplete"
        payload["incomplete_details"] = {"reason": "max_output_tokens"}
        _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=payload))
        result = call_model(
            "openai", "o-gpt", "s", "u", 100,
            _provider_cfg(base_config, "openai"),
        )
        assert result.stop_reason == "max_tokens"
