import io
import json

import httpx
import pytest
import yaml

import importlib

route_mod = importlib.import_module("ai_router.route")
api_mod = importlib.import_module("ai_router.transports.api")
from ai_router import NoCandidateError, RouterError, route
from ai_router.metrics import load_metrics
from ai_router.transports.copilot import (
    Catalog,
    CatalogMeta,
    CopilotCliTransport,
    ModelEntry,
)
from tests.conftest import make_config


@pytest.fixture
def config_on_disk(tmp_path, monkeypatch, provider_keys):
    """Write the test config to disk and point AI_ROUTER_CONFIG at it, so
    route()'s lazy config load resolves hermetically."""
    def _install(config=None):
        config = config or make_config()
        path = tmp_path / "router-config.yaml"
        path.write_text(yaml.safe_dump(config), encoding="utf-8")
        monkeypatch.setenv("AI_ROUTER_CONFIG", str(path))
        return config

    return _install


def _mock_api(monkeypatch, handler):
    real_client = httpx.Client

    def _client(**kwargs):
        kwargs.pop("transport", None)
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(api_mod.httpx, "Client", _client)


def _google_response(text, out_tokens=100):
    return httpx.Response(200, json={
        "candidates": [{
            "content": {"parts": [{"text": text}]},
            "finishReason": "STOP",
        }],
        "usageMetadata": {
            "promptTokenCount": 10, "candidatesTokenCount": out_tokens,
        },
        "modelVersion": "g-served",
    })


def _install_fake_copilot(stdout, max_invocations=None):
    """Pre-populate route's process state with a fake-spawner transport and
    a synthetic catalog, bypassing lockfile discovery."""
    def spawner(argv, env):
        class P:
            def __init__(self):
                self.stdout = io.StringIO(stdout)
                self.stderr = io.StringIO("")

            def poll(self):
                return 0

            def kill(self):
                pass

            def wait(self, timeout=None):
                return 0
        return P()

    route_mod._state["copilot_transport"] = CopilotCliTransport(
        spawner=spawner, max_invocations=max_invocations
    )
    route_mod._state["copilot_catalog"] = Catalog(
        meta=CatalogMeta(
            cli_version="v", cli_version_pin_required=False, seat_id="t"
        ),
        models=[
            ModelEntry(id="claude-x", provider="anthropic",
                       enablement="confirmed"),
            ModelEntry(id="gpt-x", provider="openai", enablement="confirmed"),
            ModelEntry(id="gemini-x", provider="google",
                       enablement="confirmed"),
        ],
    )


COPILOT_OK = (
    json.dumps({
        "type": "assistant.message",
        "data": {"content": "seat answer", "model": "claude-x",
                 "outputTokens": 64},
    }) + "\n"
    + json.dumps({
        "type": "result", "sessionId": "conv-42",
        "usage": {"premiumRequests": 1},
    }) + "\n"
)


class TestNoRouter:
    def test_env_var_short_circuits_before_config_load(self, monkeypatch):
        monkeypatch.setenv("DABBLER_NO_ROUTER", "1")
        # No config, no keys, no network — must still return a stub.
        result = route("anything")
        assert result.model_name == "no-router-mode"
        assert result.cost_usd is None
        assert result.cost_status == "unmeasured"


class TestApiTransport:
    def test_end_to_end_with_cost_and_metrics(
        self, config_on_disk, monkeypatch, tmp_path
    ):
        config_on_disk()
        _mock_api(monkeypatch, lambda req: _google_response("the answer"))
        result = route("say hi", task_type="formatting", session_set="042-demo")

        assert result.content == "the answer"
        assert result.model_name == "flash"  # short formatting prompt -> tier 1
        assert result.transport == "api"
        assert result.cost_status == "measured"
        assert result.cost_usd == pytest.approx(
            (10 / 1e6) * 0.30 + (100 / 1e6) * 2.50
        )
        assert result.served_model_id == "g-served"

        rows = load_metrics({"_config_path": str(tmp_path / "router-config.yaml")})
        assert len(rows) == 1
        assert rows[0]["session_set"] == "042-demo"
        assert rows[0]["transport"] == "api"
        assert rows[0]["billed_usage_unavailable"] is None
        assert rows[0]["requested_model_id"] == "g-flash"
        assert rows[0]["served_model_id"] == "g-served"

    def test_escalation_climbs_tiers_and_records_history(
        self, config_on_disk, monkeypatch, tmp_path
    ):
        config_on_disk()

        def handler(request):
            if "g-flash" in request.url.path:
                return _google_response("", out_tokens=0)  # empty -> escalate
            return _google_response("recovered " * 20, out_tokens=200)

        _mock_api(monkeypatch, handler)
        result = route("say hi", task_type="formatting")

        assert result.escalated
        assert result.escalation_history == [("flash", "empty_response")]
        assert result.model_name == "pro"
        rows = load_metrics({"_config_path": str(tmp_path / "router-config.yaml")})
        assert rows[0]["escalated"] is True
        assert rows[0]["model"] == "pro"

    def test_exclusion_is_honored_end_to_end(self, config_on_disk, monkeypatch):
        config_on_disk()

        def handler(request):
            assert "google" not in str(request.url.host)
            return httpx.Response(200, json={
                "content": [{"type": "text", "text": "from anthropic " * 5}],
                "usage": {"input_tokens": 5, "output_tokens": 50},
                "stop_reason": "end_turn", "model": "a-sonnet",
            })

        _mock_api(monkeypatch, handler)
        result = route("say hi", exclude_providers=["google", "openai"])
        assert result.provider == "anthropic"

    def test_no_surviving_candidate_fails_closed(self, config_on_disk):
        config_on_disk()
        with pytest.raises(NoCandidateError):
            route(
                "say hi",
                exclude_providers=["google", "openai", "anthropic"],
            )

    def test_keyless_machine_fails_closed_not_keyerror(
        self, config_on_disk, monkeypatch
    ):
        config_on_disk()
        for var in ("TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"):
            monkeypatch.delenv(var)
        with pytest.raises(NoCandidateError):
            route("say hi")


class TestCopilotTransport:
    def test_end_to_end_cost_is_none_unmeasured(
        self, config_on_disk, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("DABBLER_TRANSPORT", "copilot-cli")
        config_on_disk()
        _install_fake_copilot(COPILOT_OK)

        result = route("do a thing", session_set="042-demo")
        assert result.content == "seat answer"
        assert result.transport == "copilot-cli"
        assert result.cost_usd is None
        assert result.cost_status == "unmeasured"
        assert result.transport_session_id == "conv-42"
        assert result.model_name == "claude-x"  # roles.generator.prefer[0]
        assert result.tier == 0

        rows = load_metrics({"_config_path": str(tmp_path / "router-config.yaml")})
        assert rows[0]["cost_usd"] is None
        assert rows[0]["billed_usage_unavailable"] is True
        assert rows[0]["transport"] == "copilot-cli"
        assert rows[0]["transport_session_id"] == "conv-42"

    def test_exclusion_walks_past_preferred_provider(
        self, config_on_disk, monkeypatch
    ):
        monkeypatch.setenv("DABBLER_TRANSPORT", "copilot-cli")
        config_on_disk()
        _install_fake_copilot(COPILOT_OK)
        result = route("do a thing", exclude_providers=["anthropic"])
        assert result.provider == "openai"
        assert result.model_name == "gpt-x"

    def test_exclusion_leaving_no_candidate_fails_closed(
        self, config_on_disk, monkeypatch
    ):
        monkeypatch.setenv("DABBLER_TRANSPORT", "copilot-cli")
        config_on_disk()
        _install_fake_copilot(COPILOT_OK)
        with pytest.raises(NoCandidateError):
            route(
                "x", exclude_providers=["anthropic", "openai", "google"]
            )

    def test_failed_dispatch_raises_dispatch_error(
        self, config_on_disk, monkeypatch
    ):
        monkeypatch.setenv("DABBLER_TRANSPORT", "copilot-cli")
        config_on_disk()
        _install_fake_copilot("not json at all\n")
        with pytest.raises(RouterError, match="generic-unknown"):
            route("x")


class TestPromptSizeRefusal:
    """The prompt is never silently truncated: a tail-chopped review
    bundle still returns a clean-looking verdict, because the handoff
    acknowledgement is appended after prompting."""

    def test_a_prompt_within_budget_is_returned_intact(self):
        content = "x" * 4000
        _system, message = route_mod.build_prompt(
            content=content, context="", task_type="general",
            model_cfg={"max_context_tokens": 2000}, config={},
        )
        assert message == content

    def test_an_over_budget_prompt_is_refused_with_overrun_and_remedy(self):
        with pytest.raises(route_mod.PromptTooLargeError) as excinfo:
            route_mod.build_prompt(
                content="x" * 8000, context="", task_type="general",
                model_cfg={"max_context_tokens": 1000}, config={},
            )
        message = str(excinfo.value)
        assert "8000 chars" in message          # the overrun, named
        assert "800 tokens" in message          # the budget, named
        assert "docs/modules.yaml" in message   # the remedy, named

    def test_route_refuses_before_dispatching(
        self, config_on_disk, monkeypatch
    ):
        config = make_config()
        for model in config["models"].values():
            model["max_context_tokens"] = 1000
        config_on_disk(config)
        dispatched = []
        _mock_api(monkeypatch, lambda req: dispatched.append(req)
                  or _google_response("never"))
        with pytest.raises(route_mod.PromptTooLargeError):
            route("x" * 8000, task_type="formatting")
        assert dispatched == []
