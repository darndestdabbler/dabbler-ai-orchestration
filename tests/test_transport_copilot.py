import io
import json
import time
from pathlib import Path

import pytest

from ai_router.transports.copilot import (
    Catalog,
    CatalogMeta,
    CopilotCliTransport,
    ERROR_CLASS_INVALID_MODEL,
    HANDOFF_THRESHOLD_UTF16_UNITS,
    ModelEntry,
    PROVENANCE_HAND_EDITED,
    PROVENANCE_MACHINE_WRITTEN,
    PROVENANCE_UNSTAMPED,
    PROVIDER_SOURCE_HEURISTIC,
    REFRESH_COMMAND,
    SCOPE_ALL,
    SCOPE_MODELS,
    SCOPE_QUORUM,
    SCOPE_STALE,
    TransportTimeouts,
    _rendered_utf16_units,
    catalog_provenance,
    discover_models,
    dumps_catalog,
    format_plan,
    load_catalog,
    merge_catalog,
    plan_refresh,
    resolve_role_candidates,
    run_refresh,
    validate_catalog,
    validate_transport_timeouts,
    write_catalog,
)

V1_LOCK = Path(__file__).parent / "fixtures" / "seat-catalog.lock"

# The operator's live seat record, which a real refresh rewrites. Only the
# contracts that must hold for ANY lockfile are asserted against it; a test
# that pinned its values would fail on the next honest refresh, and a test
# that fails when the record is updated is pressure to edit the record.
SHIPPED_LOCK = (
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
        result = validate_catalog(catalog, live_cli_version="v1")
        assert not any("drift" in w for w in result.warnings)

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


def _seat_spawner(by_model):
    """A fake seat that answers per requested model, so a multi-model probe
    runs the real dispatch state machine once per call."""
    def spawner(argv, env):
        stdout, stderr, exit_code = by_model[argv[argv.index("--model") + 1]]
        return FakeProcess(stdout=stdout, stderr=stderr, exit_code=exit_code)
    return spawner


def _probe_ok(model, usage=None):
    return (
        _event_lines(
            {"type": "assistant.message",
             "data": {"content": "OK", "model": model, "outputTokens": 2}},
            {"type": "result", "sessionId": "conv-1", "usage": usage or {}},
        ),
        "", 0,
    )


_PROBE_REFUSED = ("", "model from --model flag is not available", 1)
_STAMP = "2026-08-19T00:00:00Z"


def _probe(model_ids, by_model, **kwargs):
    return discover_models(
        model_ids,
        transport=CopilotCliTransport(spawner=_seat_spawner(by_model)),
        clock=lambda: _STAMP,
        **kwargs,
    )


def _model_blocks(text):
    """Rendered ``[[models]]`` blocks keyed by their id line."""
    blocks = {}
    for chunk in text.split("\n\n"):
        if chunk.startswith("[[models]]"):
            blocks[chunk.splitlines()[1]] = chunk
    return blocks


class TestCatalogWriter:
    def test_shipped_lockfile_round_trips_byte_for_byte(self):
        """The contract that makes a partial refresh honest: a catalog
        nothing touched renders back to the bytes it was read from."""
        assert dumps_catalog(load_catalog(SHIPPED_LOCK)) == (
            SHIPPED_LOCK.read_text(encoding="utf-8")
        )

    def test_keys_this_version_does_not_model_survive_the_writer(
        self, tmp_path
    ):
        lock = tmp_path / "c.lock"
        lock.write_text(
            '[meta]\ncli_version = "v1"\nseat_id = "s"\n\n'
            '[[models]]\nid = "a"\nprovider = "anthropic"\n'
            'enablement = "confirmed"\nfuture_key = "keep me"\n',
            encoding="utf-8",
        )
        assert 'future_key = "keep me"' in dumps_catalog(load_catalog(lock))

    def test_unrenderable_value_is_refused_by_the_writer(self):
        catalog = _catalog(_entry("a", "anthropic"))
        catalog.models[0].raw = {"probe_detail": {"nested": "table"}}
        with pytest.raises(ValueError, match="cannot represent"):
            dumps_catalog(catalog)

    def test_unknown_fields_are_written_by_omission(self):
        # TOML has no null, and an absent key already means unknown; a
        # placeholder would read as a measured zero.
        text = dumps_catalog(_catalog(_entry("a", "anthropic")))
        assert "echoed_model" not in text
        assert "probe_premium_requests" not in text

    def test_written_lockfile_is_one_the_reader_accepts(self, tmp_path):
        path = tmp_path / "seat.lock"
        write_catalog(
            path, _catalog(_entry("a", "anthropic"), _entry("b", "openai"))
        )
        assert validate_catalog(load_catalog(path)).ok


class TestWriterStamp:
    def _written(self, tmp_path, *entries, **kwargs):
        path = tmp_path / "seat.lock"
        write_catalog(path, _catalog(*entries), **kwargs)
        return path

    def test_the_writer_records_what_wrote_the_file_and_when(self, tmp_path):
        path = self._written(
            tmp_path, _entry("a", "anthropic"), _entry("b", "openai"),
            written_at=_STAMP,
        )
        meta = load_catalog(path).meta
        assert meta.written_at == _STAMP
        assert meta.written_by.startswith("ai_router.transports.copilot")
        assert catalog_provenance(load_catalog(path)) == (
            PROVENANCE_MACHINE_WRITTEN
        )

    def test_an_edit_after_the_write_is_reported_as_hand_edited(
        self, tmp_path
    ):
        """The rule this repo already holds for .dabbler/runs/ — never
        hand-repaired — made checkable rather than aspirational. Two people
        hand-edited this file's pin, which is exactly what it must report."""
        path = self._written(
            tmp_path, _entry("a", "anthropic"), _entry("b", "openai")
        )
        path.write_text(
            path.read_text(encoding="utf-8").replace(
                'cli_version = "v1"', 'cli_version = "v2"'
            ),
            encoding="utf-8",
        )
        catalog = load_catalog(path)
        result = validate_catalog(catalog)
        assert catalog_provenance(catalog) == PROVENANCE_HAND_EDITED
        # Detection, not enforcement: the seat still loads, and says so.
        assert result.ok
        assert any("hand-edited" in w for w in result.warnings)

    def test_deleting_the_digest_reads_as_hand_edited_not_unstamped(
        self, tmp_path
    ):
        """Removing the line that would convict is itself the edit."""
        path = self._written(tmp_path, _entry("a", "anthropic"))
        path.write_text(
            "".join(
                f"{line}\n"
                for line in path.read_text(encoding="utf-8").splitlines()
                if not line.startswith("content_digest")
            ),
            encoding="utf-8",
        )
        assert catalog_provenance(load_catalog(path)) == PROVENANCE_HAND_EDITED

    def test_a_lockfile_no_writer_ever_touched_reads_as_unstamped(self):
        catalog = load_catalog(V1_LOCK)
        assert catalog_provenance(catalog) == PROVENANCE_UNSTAMPED
        assert any(
            "no writer stamp" in w for w in validate_catalog(catalog).warnings
        )

    def test_a_refreshed_lockfile_reads_back_as_machine_written(
        self, tmp_path
    ):
        lock = _lock_copy(tmp_path)
        run_refresh(
            catalog_path=lock,
            transport=CopilotCliTransport(spawner=_seat_spawner({
                "claude-sonnet-4.6": _probe_ok("claude-sonnet-4.6"),
                "gemini-3.1-pro-preview": _probe_ok("gemini-3.1-pro-preview"),
                "gpt-5.5": _probe_ok("gpt-5.5"),
            })),
            live_cli_version=SEAT_VERSION, clock=lambda: _STAMP,
        )
        catalog = load_catalog(lock)
        assert catalog_provenance(catalog) == PROVENANCE_MACHINE_WRITTEN
        assert catalog.meta.written_at == _STAMP

    def test_no_stale_catalog_message_omits_the_command_that_fixes_it(self):
        """The absence of that verb is the incident: an operator told the
        file is wrong, and handed no command, edits the file."""
        results = (
            validate_catalog(
                _catalog(_entry("a", "anthropic"), _entry("b", "openai")),
                live_cli_version="v9",
            ),
            validate_catalog(_catalog(_entry("a", ""), _entry("b", "openai"))),
            validate_catalog(
                _catalog(_entry("a", "openai"), _entry("b", "openai"))
            ),
        )
        for result in results:
            messages = result.reasons + result.warnings
            assert messages
            assert all(REFRESH_COMMAND in message for message in messages)


class TestCandidateUniverse:
    def test_shipped_lockfile_declares_every_id_it_carries(self):
        """The CLI cannot enumerate models, so the universe is data in the
        file rather than a list in code."""
        catalog = load_catalog(SHIPPED_LOCK)
        assert catalog.meta.candidate_universe == tuple(
            e.id for e in catalog.models
        )

    def test_malformed_universe_is_refused_at_load(self, tmp_path):
        lock = tmp_path / "c.lock"
        lock.write_text(
            '[meta]\ncli_version = "v1"\nseat_id = "s"\n'
            "candidate_universe = [1, 2]\n",
            encoding="utf-8",
        )
        with pytest.raises(ValueError, match="candidate_universe"):
            load_catalog(lock)


class TestDiscoverModels:
    def test_successful_probe_records_its_provenance(self):
        [entry] = _probe(
            ["claude-sonnet-4.6"],
            {"claude-sonnet-4.6": _probe_ok(
                "claude-sonnet-4.6", {"premiumRequests": 1}
            )},
            cli_version="GitHub Copilot CLI 1.0.80.",
        )
        assert entry.enablement == "confirmed"
        assert entry.confirmed_at == _STAMP
        assert entry.confirmed_on_cli_version == "GitHub Copilot CLI 1.0.80."
        assert entry.echoed_model == "claude-sonnet-4.6"
        assert entry.probe_premium_requests == 1

    def test_failed_probe_records_the_failures_own_error_class(self):
        [entry] = _probe(["ghost-1"], {"ghost-1": _PROBE_REFUSED})
        assert entry.enablement == "unconfirmed"
        assert entry.last_probe_error == ERROR_CLASS_INVALID_MODEL
        assert entry.last_probe_at == _STAMP
        assert entry.confirmed_at is None

    def test_a_fractional_sample_is_a_measurement_not_malformation(
        self, tmp_path
    ):
        """The seat reports 0.33 for sub-premium models. Discarding that
        files the cheapest models on the seat as the most uncertain, since
        unknown sorts after every known sample."""
        [entry] = _probe(
            ["claude-haiku-4.5"],
            {"claude-haiku-4.5": _probe_ok(
                "claude-haiku-4.5", {"premiumRequests": 0.33}
            )},
        )
        assert entry.probe_premium_requests == 0.33
        path = tmp_path / "seat.lock"
        write_catalog(path, _catalog(entry, _entry("o", "openai")))
        assert load_catalog(path).models[0].probe_premium_requests == 0.33

    def test_a_sample_that_is_not_a_count_is_coerced_to_unknown(self):
        # Unknown, never free: a zero would read as a measurement.
        for wire in ("1", [1], True, -1, float("nan"), float("inf")):
            [entry] = _probe(
                ["gpt-5.5"],
                {"gpt-5.5": _probe_ok("gpt-5.5", {"premiumRequests": wire})},
            )
            assert entry.probe_premium_requests is None, wire

    def test_provider_is_inferred_by_prefix_with_its_source_declared(self):
        [entry] = _probe(
            ["gemini-3.5-flash"],
            {"gemini-3.5-flash": _probe_ok("gemini-3.5-flash")},
        )
        assert entry.provider == "google"
        assert entry.provider_source == PROVIDER_SOURCE_HEURISTIC

    def test_unrecognised_prefix_yields_no_provider(self):
        [entry] = _probe(["mystery-1"], {"mystery-1": _probe_ok("mystery-1")})
        assert entry.provider == ""
        assert entry.provider_source == ""


class TestCatalogMerge:
    def test_unprobed_entries_survive_byte_for_byte(self):
        merged = dumps_catalog(merge_catalog(
            load_catalog(V1_LOCK),
            _probe(["gpt-5.5"], {"gpt-5.5": _probe_ok(
                "gpt-5.5", {"premiumRequests": 0}
            )}, cli_version="GitHub Copilot CLI 1.0.80."),
            cli_version="GitHub Copilot CLI 1.0.80.", probed_at=_STAMP,
        ))
        before = _model_blocks(V1_LOCK.read_text(encoding="utf-8"))
        after = _model_blocks(merged)
        assert {k for k in before if before[k] != after[k]} == {
            'id = "gpt-5.5"'
        }

    def test_failed_probe_keeps_the_prior_confirmation(self):
        """A transient CLI failure is not a withdrawn model — the entry
        goes visibly stale rather than silently unconfirmed."""
        catalog = _catalog(_entry("a", "anthropic"))
        catalog.models[0].confirmed_at = "2026-07-04T16:17:00Z"
        merged = merge_catalog(
            catalog,
            _probe(["a"], {"a": _PROBE_REFUSED}),
        )
        entry = merged.models[0]
        assert entry.enablement == "confirmed"
        assert entry.confirmed_at == "2026-07-04T16:17:00Z"
        assert entry.last_probe_error == ERROR_CLASS_INVALID_MODEL
        assert entry.last_probe_at == _STAMP

    def test_probing_an_id_the_catalog_lacks_appends_it(self):
        merged = merge_catalog(
            _catalog(_entry("a", "anthropic")),
            _probe(["gpt-5.5"], {"gpt-5.5": _probe_ok("gpt-5.5")}),
        )
        assert [e.id for e in merged.models] == ["a", "gpt-5.5"]

    def test_refresh_redates_the_cli_version_and_probe_time(self):
        merged = merge_catalog(
            _catalog(_entry("a", "anthropic"), version="v1"),
            [], cli_version="v2", probed_at=_STAMP,
        )
        assert merged.meta.cli_version == "v2"
        assert merged.meta.probed_at == _STAMP

    def test_a_run_reporting_no_sample_keeps_the_prior_one(self):
        # The sample is a one-call observation the cost preview depends on;
        # dropping it on a silent run would blind the next refresh.
        catalog = _catalog(_entry("a", "anthropic"))
        catalog.models[0].probe_premium_requests = 15
        merged = merge_catalog(
            catalog, _probe(["a"], {"a": _probe_ok("a")}),
        )
        assert merged.models[0].probe_premium_requests == 15


SEAT_VERSION = "GitHub Copilot CLI 1.0.80."


def _lock_copy(tmp_path):
    """The frozen seat fixture, somewhere a test may write to."""
    dest = tmp_path / "copilot-catalog.lock"
    dest.write_text(V1_LOCK.read_text(encoding="utf-8"), encoding="utf-8")
    return dest


def _write_lock(tmp_path, meta_lines, *entries):
    lock = tmp_path / "small.lock"
    tables = ["[meta]\n" + "\n".join(meta_lines)]
    tables.extend("[[models]]\n" + "\n".join(lines) for lines in entries)
    lock.write_text("\n\n".join(tables) + "\n", encoding="utf-8")
    return lock


def _sampled(model_id, provider, sample=None, on_version=None,
             enablement="confirmed"):
    return ModelEntry(
        id=model_id, provider=provider, enablement=enablement,
        probe_premium_requests=sample, confirmed_on_cli_version=on_version,
    )


def _refuse_to_spawn(argv, env):
    raise AssertionError(
        f"a plan that was not approved spawned the CLI: {argv!r}"
    )


class TestRefreshScope:
    def test_quorum_is_the_cheapest_confirmed_model_of_each_provider(self):
        """The 2-request common case. A refresh that costs 39 to answer 'did
        my seat survive the auto-update?' is one nobody runs, which is what
        left hand-editing as the only remedy."""
        plan = plan_refresh(load_catalog(V1_LOCK), scope=SCOPE_QUORUM)
        assert plan.model_ids == (
            "claude-sonnet-4.6", "gemini-3.1-pro-preview", "gpt-5.5",
        )
        assert plan.known_premium_requests == 2

    def test_quorum_prefers_a_measured_sample_to_an_unmeasured_one(self):
        """Unknown is never free, so an unmeasured entry is not the cheap
        one — picking it would make the projection meaningless."""
        catalog = _catalog(
            _sampled("a-unmeasured", "anthropic"),
            _sampled("a-measured", "anthropic", sample=3),
            _sampled("o-1", "openai", sample=0),
        )
        plan = plan_refresh(catalog, scope=SCOPE_QUORUM)
        assert plan.model_ids == ("a-measured", "o-1")

    def test_stale_is_confirmation_on_another_cli_version_cheapest_first(self):
        """An entry with no confirmation at all is unprobed, not stale:
        sweeping it in here would turn a targeted re-confirmation into a
        universe probe."""
        catalog = _catalog(
            _sampled("dear", "anthropic", sample=15, on_version="v1"),
            _sampled("cheap", "anthropic", sample=1, on_version="v1"),
            _sampled("current", "openai", sample=0, on_version="v2"),
            _sampled("never-probed", "google", enablement="unconfirmed"),
        )
        plan = plan_refresh(catalog, scope=SCOPE_STALE, live_cli_version="v2")
        assert plan.model_ids == ("cheap", "dear")

    def test_all_is_the_declared_universe_priced_from_the_file(self):
        plan = plan_refresh(load_catalog(V1_LOCK), scope=SCOPE_ALL)
        assert plan.model_ids == load_catalog(V1_LOCK).meta.candidate_universe
        assert plan.known_premium_requests == 39
        assert len(plan.unknown_cost_ids) == 5

    def test_the_declared_universe_bounds_what_a_refresh_may_probe(self):
        """The CLI has no list-models command, so the universe in the file is
        the only list there is: an id outside it is a data edit away, and a
        probe costs a premium request a typo must not buy."""
        catalog = load_catalog(V1_LOCK)
        with pytest.raises(ValueError, match="candidate universe"):
            plan_refresh(catalog, scope=SCOPE_MODELS, models=["claude-opus-9"])
        with pytest.raises(ValueError, match="candidate_universe"):
            plan_refresh(_catalog(_entry("a", "anthropic")), scope=SCOPE_ALL)


class TestRefreshCost:
    def test_unknown_cost_is_named_rather_than_costed_zero(self):
        text = format_plan(plan_refresh(
            _catalog(_sampled("a", "anthropic"), _sampled("b", "openai", 1)),
            scope=SCOPE_QUORUM,
        ))
        assert "projected cost: 1 premium request(s)" in text
        assert "unknown is not zero" in text
        assert "floor" in text

    def test_the_quorum_never_asks_and_the_full_universe_always_does(self):
        """Friction on the cheap path is what made v1's writer unrunnable."""
        catalog = load_catalog(V1_LOCK)
        assert not plan_refresh(catalog, scope=SCOPE_QUORUM).needs_confirmation
        assert plan_refresh(catalog, scope=SCOPE_ALL).needs_confirmation

    def test_dry_run_prints_the_plan_and_probes_nothing(self, tmp_path,
                                                        capsys):
        lock = _lock_copy(tmp_path)
        before = lock.read_bytes()
        code = run_refresh(
            catalog_path=lock,
            transport=CopilotCliTransport(spawner=_refuse_to_spawn),
            scope=SCOPE_ALL, dry_run=True,
        )
        assert code == 0
        assert "refresh plan: scope=all" in capsys.readouterr().out
        assert lock.read_bytes() == before

    def test_an_unapproved_plan_spends_nothing(self, tmp_path, capsys):
        """pytest's stdin is not a terminal, which is the case that matters:
        an unattended run must fail closed rather than prompt into the void
        or assume yes."""
        lock = _lock_copy(tmp_path)
        before = lock.read_bytes()
        code = run_refresh(
            catalog_path=lock,
            transport=CopilotCliTransport(spawner=_refuse_to_spawn),
            scope=SCOPE_ALL,
        )
        out = capsys.readouterr().out
        assert code == 1
        assert "--yes" in out and "declined" in out
        assert lock.read_bytes() == before


class TestRefreshRun:
    def _quorum_seat(self, **overrides):
        by_model = {
            "claude-sonnet-4.6": _probe_ok(
                "claude-sonnet-4.6", {"premiumRequests": 1}
            ),
            "gemini-3.1-pro-preview": _probe_ok(
                "gemini-3.1-pro-preview", {"premiumRequests": 1}
            ),
            "gpt-5.5": _probe_ok("gpt-5.5", {"premiumRequests": 0}),
        }
        by_model.update(overrides)
        return CopilotCliTransport(spawner=_seat_spawner(by_model))

    def _run(self, lock, transport, **kwargs):
        return run_refresh(
            catalog_path=lock, transport=transport,
            live_cli_version=SEAT_VERSION, clock=lambda: _STAMP, **kwargs,
        )

    def test_a_refresh_writes_its_merge_and_reports_it_as_a_diff(
        self, tmp_path, capsys
    ):
        lock = _lock_copy(tmp_path)
        before = _model_blocks(lock.read_text(encoding="utf-8"))
        assert self._run(lock, self._quorum_seat()) == 0
        out = capsys.readouterr().out
        after_text = lock.read_text(encoding="utf-8")

        assert load_catalog(lock).meta.cli_version == SEAT_VERSION
        assert "cli version re-dated" in out
        assert "re-confirmed: claude-sonnet-4.6" in out
        # Merge, never clobber: the 15 entries this run did not probe are
        # byte-identical, provenance included.
        after = _model_blocks(after_text)
        assert {k for k in before if before[k] != after[k]} == {
            'id = "claude-sonnet-4.6"',
            'id = "gemini-3.1-pro-preview"',
            'id = "gpt-5.5"',
        }

    def test_a_failed_probe_is_reported_and_the_confirmation_stands(
        self, tmp_path, capsys
    ):
        lock = _lock_copy(tmp_path)
        code = self._run(
            lock, self._quorum_seat(**{"gpt-5.5": _PROBE_REFUSED}),
        )
        out = capsys.readouterr().out
        assert code == 0
        assert f"probe failed: gpt-5.5 ({ERROR_CLASS_INVALID_MODEL})" in out
        assert "stands, visibly stale" in out
        assert load_catalog(lock).provider_of("gpt-5.5") == "openai"

    def test_an_unchanged_refresh_says_so(self, tmp_path, capsys):
        lock = _write_lock(
            tmp_path,
            ['cli_version = "v1"', 'seat_id = "s"',
             'candidate_universe = [\n    "a",\n    "o",\n]'],
            ['id = "a"', 'provider = "anthropic"', 'enablement = "confirmed"',
             'confirmed_on_cli_version = "v1"', "probe_premium_requests = 1"],
            ['id = "o"', 'provider = "openai"', 'enablement = "confirmed"',
             'confirmed_on_cli_version = "v1"', "probe_premium_requests = 0"],
        )
        code = run_refresh(
            catalog_path=lock,
            transport=CopilotCliTransport(spawner=_seat_spawner({
                "a": _probe_ok("a", {"premiumRequests": 1}),
                "o": _probe_ok("o", {"premiumRequests": 0}),
            })),
            live_cli_version="v1", clock=lambda: _STAMP,
        )
        out = capsys.readouterr().out
        assert code == 0
        assert "no change" in out
        assert "changed:" not in out


class TestRoleResolution:
    CONFIG = {
        "roles": {
            "generator": {
                "prefer": ["claude-x", "gpt-x"],
                "require_provider_in": ["anthropic", "openai", "google"],
            },
        },
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

    def test_an_unnamed_confirmed_entry_still_qualifies(self):
        # gemini-x is confirmed and not in prefer: it sorts last rather than
        # dropping out, and that holds with no exclusion in play.
        candidates = resolve_role_candidates(
            self.CONFIG, self._catalog(), "generator"
        )
        assert candidates[-1] == ("gemini-x", "google")

    def test_exclusion_leaves_the_rest_of_the_confirmed_catalog(self):
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
            "roles": {
                "generator": {
                    "prefer": ["claude-x", "gpt-x"],
                    "require_provider_in": ["openai"],
                },
            },
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

class TestRoutedCallIsolation:
    """A routed call is not an orchestrator session. The CLI would
    otherwise load the workspace's AGENTS.md/CLAUDE.md into the system
    prompt -- text the api transport never sends."""

    def test_argv_disables_workspace_custom_instructions(self):
        spawner = _spawner_for(FakeProcess(stdout=OK_STDOUT))
        CopilotCliTransport(spawner=spawner).dispatch(
            model_id="m", system_prompt="", user_message="u"
        )
        assert "--no-custom-instructions" in spawner.argv

