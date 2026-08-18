import io
import json
import time
from pathlib import Path

import pytest

from ai_router.transports.copilot import (
    Catalog,
    CatalogMeta,
    CopilotCliTransport,
    HANDOFF_THRESHOLD_UTF16_UNITS,
    ModelEntry,
    TransportTimeouts,
    _rendered_utf16_units,
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


# --- Large-prompt file handoff ----------------------------------------------

BIG_PROMPT = "x" * 30_000


def _payload_path_from(argv):
    """The handoff payload path the bootstrap points the model at."""
    bootstrap = argv[argv.index("-p") + 1]
    for line in bootstrap.splitlines():
        if line.endswith(".txt"):
            return line.strip()
    raise AssertionError(f"no payload path in bootstrap: {bootstrap!r}")


def _ack_stdout(nonce, body="answer body"):
    return _event_lines(
        {"type": "assistant.message",
         "data": {"content": f"{body}\n\nHANDOFF-ACK {nonce}",
                  "model": "m", "outputTokens": 7}},
        {"type": "result", "sessionId": "s1", "usage": {"premiumRequests": 1}},
    )


class HandoffSpawner:
    """Reads the payload at spawn time (proving the handle is closed), then
    answers with whatever the test asked for."""

    def __init__(self, *, respond=None, process=None, raises=None,
                 mutate_payload=False):
        self._respond = respond
        self._process = process
        self._raises = raises
        self._mutate = mutate_payload
        self.argv = None
        self.payload_text = None
        self.payload_path = None

    def __call__(self, argv, env):
        self.argv = list(argv)
        self.payload_path = _payload_path_from(argv)
        self.payload_text = Path(self.payload_path).read_text(encoding="utf-8")
        if self._mutate:
            Path(self.payload_path).write_text("clobbered", encoding="utf-8")
        if self._raises is not None:
            raise self._raises
        if self._process is not None:
            return self._process
        nonce = self.payload_text.strip().splitlines()[-2].split()[-1]
        return FakeProcess(stdout=self._respond(nonce))


def _dispatch_big(spawner, **kwargs):
    return CopilotCliTransport(spawner=spawner, **kwargs).dispatch(
        model_id="m", system_prompt="sys", user_message=BIG_PROMPT
    )


class TestHandoffThreshold:
    @pytest.mark.parametrize("argv,expected", [
        (["a"], 2),                       # "a" + NUL
        (["a b"], 6),                     # quoting adds two chars
        (["a\\b"], 4),                    # a lone backslash is not escaped
        (["\U0001F600"], 3),              # one astral char is two UTF-16 units
    ])
    def test_measurement_counts_rendered_utf16_units(self, argv, expected):
        assert _rendered_utf16_units(argv) == expected

    def test_below_threshold_stays_inline(self):
        spawner = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        result = CopilotCliTransport(spawner=spawner).dispatch(
            model_id="m", system_prompt="sys", user_message="small"
        )
        assert spawner.argv[spawner.argv.index("-p") + 1] == "sys\n\nsmall"
        assert result.metadata["handoff"] is False
        assert "payload_bytes" not in result.metadata

    def test_threshold_boundary_is_inclusive(self):
        """One unit under the threshold stays inline; exactly at it pulls."""
        transport = CopilotCliTransport(spawner=_spawner_for(None))
        # Overhead measured against a one-character prompt, so an empty
        # string's own quoting does not skew the arithmetic.
        overhead = _rendered_utf16_units(transport._build_argv("z", "m")) - 1
        exact = "z" * (HANDOFF_THRESHOLD_UTF16_UNITS - overhead)
        assert _rendered_utf16_units(
            transport._build_argv(exact, "m")
        ) == HANDOFF_THRESHOLD_UTF16_UNITS

        under = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        below = CopilotCliTransport(spawner=under).dispatch(
            model_id="m", system_prompt="", user_message=exact[:-1]
        )
        assert below.metadata["handoff"] is False

        at = HandoffSpawner(respond=_ack_stdout)
        result = CopilotCliTransport(spawner=at).dispatch(
            model_id="m", system_prompt="", user_message=exact
        )
        assert result.metadata["handoff"] is True

    def test_bootstrap_names_a_posix_path_and_carries_no_nonce(self):
        spawner = HandoffSpawner(respond=_ack_stdout)
        _dispatch_big(spawner)
        bootstrap = spawner.argv[spawner.argv.index("-p") + 1]
        assert "\\" not in _payload_path_from(spawner.argv)
        assert BIG_PROMPT not in bootstrap
        nonce = spawner.payload_text.strip().splitlines()[-2].split()[-1]
        assert nonce not in " ".join(spawner.argv)

    def test_payload_holds_the_exact_prompt_plus_footer(self):
        spawner = HandoffSpawner(respond=_ack_stdout)
        _dispatch_big(spawner)
        assert spawner.payload_text.startswith(f"sys\n\n{BIG_PROMPT}")
        assert "HANDOFF-ACK " in spawner.payload_text

    def test_argv_is_otherwise_identical_on_both_branches(self):
        inline_spawner = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        CopilotCliTransport(spawner=inline_spawner).dispatch(
            model_id="m", system_prompt="sys", user_message="small"
        )
        handoff_spawner = HandoffSpawner(respond=_ack_stdout)
        _dispatch_big(handoff_spawner)

        def without_prompt(argv):
            i = argv.index("-p")
            return argv[:i] + argv[i + 2:]

        assert without_prompt(handoff_spawner.argv) == without_prompt(
            inline_spawner.argv
        )


class TestHandoffAcknowledgement:
    def test_valid_ack_is_stripped_from_returned_content(self):
        spawner = HandoffSpawner(respond=_ack_stdout)
        result = _dispatch_big(spawner)
        assert result.ok
        assert result.content == "answer body"
        assert result.metadata["handoff_ack"] == "validated"
        assert result.metadata["payload_bytes"] == len(
            spawner.payload_text.encode("utf-8")
        )

    def test_missing_ack_fails_closed_and_discards_content(self):
        spawner = HandoffSpawner(
            respond=lambda nonce: _event_lines(
                {"type": "assistant.message",
                 "data": {"content": "answer with no ack", "model": "m"}},
                {"type": "result", "sessionId": "s1", "usage": {}},
            )
        )
        result = _dispatch_big(spawner)
        assert not result.ok
        assert result.metadata["error_class"] == "handoff-incomplete"
        assert result.metadata["handoff_ack"] == "missing"
        assert result.content == ""

    def test_mismatched_ack_is_distinguished_from_a_missing_one(self):
        spawner = HandoffSpawner(
            respond=lambda nonce: _ack_stdout("deadbeef" * 4)
        )
        result = _dispatch_big(spawner)
        assert result.metadata["error_class"] == "handoff-incomplete"
        assert result.metadata["handoff_ack"] == "mismatch"

    def test_handoff_incomplete_is_never_retryable(self):
        spawner = HandoffSpawner(respond=lambda nonce: _ack_stdout("nope"))
        assert _dispatch_big(spawner).metadata["retryable"] is False

    def test_payload_mutation_is_recorded_not_gated(self):
        spawner = HandoffSpawner(respond=_ack_stdout, mutate_payload=True)
        result = _dispatch_big(spawner)
        assert result.ok
        assert result.metadata["payload_file_modified"] is True


class TestHandoffCleanup:
    def _assert_removed(self, spawner):
        assert spawner.payload_path is not None
        assert not Path(spawner.payload_path).exists()

    def test_payload_deleted_after_success(self):
        spawner = HandoffSpawner(respond=_ack_stdout)
        _dispatch_big(spawner)
        self._assert_removed(spawner)

    def test_payload_deleted_after_spawn_failure(self):
        spawner = HandoffSpawner(raises=RuntimeError("boom"))
        result = _dispatch_big(spawner)
        assert result.metadata["error_class"] == "generic-unknown"
        self._assert_removed(spawner)

    def test_payload_deleted_after_first_byte_timeout(self):
        proc = FakeProcess()
        proc.stdout = BlockingStream()
        spawner = HandoffSpawner(process=proc)
        result = _dispatch_big(
            spawner, timeouts=TransportTimeouts(0.5, 0.1, 0.3)
        )
        assert result.metadata["error_class"] == "first-byte-timeout"
        self._assert_removed(spawner)

    def test_payload_deleted_after_total_timeout(self):
        proc = FakeProcess()
        proc.stdout = BlockingStream(lines=['{"type":"x"}\n'])
        spawner = HandoffSpawner(process=proc)
        result = _dispatch_big(
            spawner, timeouts=TransportTimeouts(1.0, 2.0, 0.2)
        )
        assert result.metadata["error_class"] == "total-timeout"
        self._assert_removed(spawner)

    def test_payload_deleted_after_malformed_output(self):
        spawner = HandoffSpawner(respond=lambda nonce: "not json\n")
        result = _dispatch_big(spawner)
        assert result.metadata["error_class"] == "generic-unknown"
        assert result.metadata["handoff"] is True
        self._assert_removed(spawner)

    def test_diagnostics_toggle_retains_the_payload(self, monkeypatch):
        monkeypatch.setenv("DABBLER_COPILOT_DIAGNOSTICS", "1")
        spawner = HandoffSpawner(respond=_ack_stdout)
        _dispatch_big(spawner)
        try:
            assert Path(spawner.payload_path).exists()
        finally:
            Path(spawner.payload_path).unlink(missing_ok=True)


class TestArgvCeiling:
    def test_os_size_refusal_gets_its_own_error_class(self):
        too_long = OSError(206, "The filename or extension is too long")
        too_long.winerror = 206

        def raising(argv, env):
            raise too_long

        result = CopilotCliTransport(spawner=raising).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "argv-too-large"
        assert result.metadata["retryable"] is False

    def test_other_spawn_errors_stay_generic(self):
        def raising(argv, env):
            raise OSError(2, "No such file or directory")

        result = CopilotCliTransport(spawner=raising).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert result.metadata["error_class"] == "generic-unknown"
