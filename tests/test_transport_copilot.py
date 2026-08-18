import io
import json
import time
from pathlib import Path

import pytest

from ai_router.transports.copilot import (
    Catalog,
    CatalogMeta,
    CopilotCliTransport,
    ModelEntry,
    TransportTimeouts,
    load_catalog,
    resolve_role_candidates,
    validate_catalog,
    validate_transport_timeouts,
)

V1_LOCK = (
    Path(__file__).parent.parent / "ai_router" / "copilot-catalog.lock"
)


class FakeProcess:
    def __init__(self, stdout="", stderr="", exit_code=0):
        self.stdout = io.StringIO(stdout)
        self.stderr = io.StringIO(stderr)
        self._exit = exit_code
        self.killed = False

    def poll(self):
        return self._exit

    def kill(self):
        self.killed = True

    def wait(self, timeout=None):
        return self._exit


class BlockingStream:
    """A stream whose readline blocks past any test-scale deadline."""

    def __init__(self, lines=()):
        self._lines = list(lines)

    def readline(self):
        if self._lines:
            return self._lines.pop(0)
        time.sleep(0.5)
        return ""


def _spawner_for(process):
    def spawner(argv, env):
        spawner.argv = list(argv)
        return process
    return spawner


def _event_lines(*events):
    return "".join(json.dumps(e) + "\n" for e in events)


OK_STDOUT = _event_lines(
    {"type": "assistant.message",
     "data": {"content": "hello from seat", "model": "claude-sonnet-4.6",
              "outputTokens": 42}},
    {"type": "result", "sessionId": "conv-123",
     "usage": {"premiumRequests": 1}},
)


class TestDispatch:
    def test_success_parses_content_tokens_and_session_id(self):
        spawner = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        transport = CopilotCliTransport(spawner=spawner)
        result = transport.dispatch(
            model_id="claude-sonnet-4.6", system_prompt="sys",
            user_message="user",
        )
        assert result.ok
        assert result.content == "hello from seat"
        assert result.output_tokens == 42
        assert result.input_tokens == 0  # never reported by the CLI
        assert result.served_model_id == "claude-sonnet-4.6"
        assert result.metadata["session_id"] == "conv-123"
        assert result.metadata["premium_requests"] == 1

    def test_argv_carries_read_only_tool_grant_and_pin(self):
        spawner = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        CopilotCliTransport(spawner=spawner).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        argv = spawner.argv
        assert "--available-tools" in argv
        assert argv[argv.index("--available-tools") + 1] == "view,grep,glob"
        assert "--no-auto-update" in argv
        assert "--allow-all-tools" in argv
        # The CLI has no separate system-prompt flag: system and user text
        # join into the single -p argument.
        spawner2 = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        CopilotCliTransport(spawner=spawner2).dispatch(
            model_id="m", system_prompt="SYS", user_message="USER"
        )
        assert spawner2.argv[spawner2.argv.index("-p") + 1] == "SYS\n\nUSER"

    @pytest.mark.parametrize("stdout", [
        # data key absent entirely
        _event_lines({"type": "assistant.message", "content": "flat"}),
        # content wrong type
        _event_lines({"type": "assistant.message", "data": {"content": 0}}),
        # outputTokens as a numeric string
        _event_lines({"type": "assistant.message",
                      "data": {"content": "x", "outputTokens": "7"}}),
        # no assistant.message at all
        _event_lines({"type": "result", "sessionId": "s"}),
        # a malformed line poisons the whole response
        OK_STDOUT + "not json\n",
    ])
    def test_malformed_output_fails_closed(self, stdout):
        spawner = _spawner_for(FakeProcess(stdout=stdout))
        result = CopilotCliTransport(spawner=spawner).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert not result.ok
        assert result.metadata["error_class"] == "generic-unknown"
        assert result.content == ""

    @pytest.mark.parametrize("stderr,expected", [
        ("The model from --model flag is not available", "invalid-model"),
        ("Error: not logged in (401)", "auth-class"),
        ("429 too many requests", "quota-rate-class"),
        ("something inscrutable", "generic-unknown"),
    ])
    def test_nonzero_exit_classifies_stderr(self, stderr, expected):
        spawner = _spawner_for(
            FakeProcess(stdout="", stderr=stderr + "\n", exit_code=1)
        )
        transport = CopilotCliTransport(
            spawner=spawner, version_probe=lambda: "v1.0.69"
        )
        result = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert not result.ok
        assert result.metadata["error_class"] == expected
        assert not result.metadata["retryable"]

    def test_auth_failure_runs_version_reprobe(self):
        spawner = _spawner_for(
            FakeProcess(stdout="", stderr="unauthorized\n", exit_code=1)
        )
        transport = CopilotCliTransport(
            spawner=spawner, version_probe=lambda: "GitHub Copilot CLI 1.0.69."
        )
        result = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["reprobe_cli_version"] == "GitHub Copilot CLI 1.0.69."

    def test_spawn_timeout(self):
        def slow_spawner(argv, env):
            time.sleep(0.5)
            return FakeProcess()

        transport = CopilotCliTransport(
            spawner=slow_spawner,
            timeouts=TransportTimeouts(0.05, 0.1, 0.2),
        )
        result = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "spawn-timeout"

    def test_first_byte_timeout(self):
        proc = FakeProcess()
        proc.stdout = BlockingStream()
        transport = CopilotCliTransport(
            spawner=_spawner_for(proc),
            timeouts=TransportTimeouts(1.0, 0.05, 5.0),
        )
        result = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "first-byte-timeout"
        assert proc.killed

    def test_total_timeout_after_first_byte(self):
        proc = FakeProcess()
        proc.stdout = BlockingStream(lines=['{"type":"other"}\n'])
        transport = CopilotCliTransport(
            spawner=_spawner_for(proc),
            timeouts=TransportTimeouts(1.0, 2.0, 0.2),
        )
        result = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "total-timeout"
        assert result.metadata["partial_output_discarded"]
        assert proc.killed

    def test_invocation_breaker_trips_without_spawning(self):
        spawn_count = {"n": 0}

        def counting_spawner(argv, env):
            spawn_count["n"] += 1
            return FakeProcess(stdout=OK_STDOUT)

        transport = CopilotCliTransport(
            spawner=counting_spawner, max_invocations=2
        )
        for _ in range(2):
            assert transport.dispatch(
                model_id="m", system_prompt="", user_message="u"
            ).ok
        blocked = transport.dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert blocked.metadata["error_class"] == "invocation-breaker"
        assert spawn_count["n"] == 2  # a breaker-blocked call never spawns

    def test_spawner_exception_is_classified_not_raised(self):
        def broken_spawner(argv, env):
            raise OSError("copilot not found")

        result = CopilotCliTransport(spawner=broken_spawner).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "generic-unknown"
        assert "not found" in result.metadata["stderr_tail"]


class TestTimeoutValidation:
    def test_valid_block_passes(self):
        validate_transport_timeouts(
            {"spawn_seconds": 5, "first_byte_seconds": 20, "total_seconds": 600}
        )

    def test_unknown_key_rejected(self):
        with pytest.raises(ValueError, match="total_second"):
            validate_transport_timeouts({"total_second": 300})

    def test_bool_rejected(self):
        with pytest.raises(ValueError, match="must be a number"):
            validate_transport_timeouts({"total_seconds": True})

    def test_out_of_order_trio_rejected(self):
        with pytest.raises(ValueError, match="spawn_seconds <"):
            validate_transport_timeouts(
                {"spawn_seconds": 100, "first_byte_seconds": 30}
            )


def _catalog(*entries, seat="test-seat", version="v1", pin=False):
    return Catalog(
        meta=CatalogMeta(
            cli_version=version, cli_version_pin_required=pin, seat_id=seat
        ),
        models=list(entries),
    )


def _entry(model_id, provider, enablement="confirmed"):
    return ModelEntry(id=model_id, provider=provider, enablement=enablement)


class TestCatalog:
    def test_loads_v1_lockfile_with_legacy_probe_key(self):
        catalog = load_catalog(V1_LOCK)
        assert len(catalog.confirmed_models()) == 15
        sonnet = next(
            e for e in catalog.models if e.id == "claude-sonnet-4.6"
        )
        assert sonnet.probe_premium_requests == 1  # legacy key still reads
        assert catalog.meta.seat_id == "op-personal"
        assert catalog.provider_of("gpt-5.5") == "openai"

    def test_provider_of_unconfirmed_entry_is_none(self):
        catalog = _catalog(_entry("m1", "openai", enablement="unconfirmed"))
        assert catalog.provider_of("m1") is None

    def test_validate_passes_on_diverse_confirmed_catalog(self):
        catalog = _catalog(_entry("a", "anthropic"), _entry("b", "openai"))
        assert validate_catalog(catalog).ok

    def test_version_drift_fails_when_pinned(self):
        catalog = _catalog(
            _entry("a", "anthropic"), _entry("b", "openai"),
            version="v1", pin=True,
        )
        result = validate_catalog(catalog, live_cli_version="v2")
        assert not result.ok
        assert "drift" in result.reasons[0]

    def test_version_drift_is_a_warning_by_default(self):
        """The seat CLI auto-updates, so drift is the normal steady state.
        Refusing the seat for it stranded working seats and taught people
        to hand-edit the pin, destroying the signal."""
        catalog = _catalog(
            _entry("a", "anthropic"), _entry("b", "openai"), version="v1",
        )
        result = validate_catalog(catalog, live_cli_version="v2")
        assert result.ok
        assert not result.reasons
        assert any("drift" in w for w in result.warnings)

    def test_no_drift_warning_when_versions_match(self):
        catalog = _catalog(
            _entry("a", "anthropic"), _entry("b", "openai"), version="v1",
        )
        assert validate_catalog(catalog, live_cli_version="v1").warnings == ()

    def test_pin_defaults_off_when_lockfile_omits_it(self, tmp_path):
        lock = tmp_path / "c.lock"
        lock.write_text(
            '[meta]\ncli_version = "v1"\nseat_id = "s"\n\n'
            '[[models]]\nid = "a"\nprovider = "anthropic"\n'
            'enablement = "confirmed"\n\n'
            '[[models]]\nid = "b"\nprovider = "openai"\n'
            'enablement = "confirmed"\n',
            encoding="utf-8",
        )
        catalog = load_catalog(lock)
        assert catalog.meta.cli_version_pin_required is False
        assert validate_catalog(catalog, live_cli_version="v9").ok

    def test_unknown_live_version_skips_drift_check(self):
        catalog = _catalog(
            _entry("a", "anthropic"), _entry("b", "openai"), pin=True
        )
        assert validate_catalog(catalog, live_cli_version=None).ok

    def test_missing_provenance_fails(self):
        catalog = _catalog(_entry("a", ""), _entry("b", "openai"))
        result = validate_catalog(catalog)
        assert not result.ok
        assert any("provenance" in r for r in result.reasons)

    def test_same_provider_only_catalog_fails(self):
        catalog = _catalog(_entry("a", "openai"), _entry("b", "openai"))
        result = validate_catalog(catalog)
        assert not result.ok
        assert any("Same-provider-only" in r for r in result.reasons)


class TestRoleResolution:
    CONFIG = {
        "transports": {"copilot-cli": {"roles": {
            "generator": {
                "prefer": ["claude-x", "gpt-x"],
                "require_provider_in": ["anthropic", "openai", "google"],
            },
        }}},
    }

    def _catalog(self):
        return _catalog(
            _entry("claude-x", "anthropic"),
            _entry("gpt-x", "openai"),
            _entry("gemini-x", "google"),
            _entry("blocked-x", "openai", enablement="unconfirmed"),
        )

    def test_prefer_order_wins(self):
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator"
        )
        assert candidates[0] == ("claude-x", "anthropic")
        assert candidates[1] == ("gpt-x", "openai")

    def test_unconfirmed_entries_never_qualify(self):
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator"
        )
        assert all(mid != "blocked-x" for mid, _ in candidates)

    def test_without_exclusion_prefer_is_the_universe(self):
        # gemini-x is confirmed but not in prefer; with no exclusion the
        # prefer list alone decides.
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator"
        )
        assert ("gemini-x", "google") not in candidates

    def test_exclusion_widens_to_full_confirmed_catalog(self):
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator",
            exclude_providers=["anthropic", "openai"],
        )
        assert candidates == [("gemini-x", "google")]

    def test_exclusion_that_leaves_nothing_returns_empty(self):
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator",
            exclude_providers=["anthropic", "openai", "google"],
        )
        assert candidates == []

    def test_require_provider_in_filters(self):
        config = {
            "transports": {"copilot-cli": {"roles": {
                "generator": {
                    "prefer": ["claude-x", "gpt-x"],
                    "require_provider_in": ["openai"],
                },
            }}},
        }
        candidates = resolve_role_candidates(
            config, self._catalog(), "generator"
        )
        assert candidates == [("gpt-x", "openai")]
