import json
from datetime import datetime, timedelta, timezone

import pytest

from ai_router.discovery import (
    ENUMERATE_COMMAND,
    ERROR_NO_API_KEY,
    ApiModelEntry,
    ProviderResult,
    compute_drift,
    dumps_record,
    empty_record,
    enumerate_provider,
    check_freshness,
    load_record,
    merge_record,
    record_provenance,
    sessions_in_flight,
    write_record,
)
from ai_router.lockfile import PROVENANCE_HAND_EDITED

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=timezone.utc)


def _stamp(hours_ago):
    return (NOW - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_aged_record(tmp_path, *, hours):
    return write_record(
        tmp_path / "api-models.lock",
        merge_record(
            empty_record(),
            [ProviderResult(name, ())
             for name in ("anthropic", "google", "openai")],
            enumerated_at=_stamp(hours),
        ),
    )


def _provider_config(**overrides):
    cfg = {
        "providers": {
            "anthropic": {
                "api_key_env": "TEST_ANTHROPIC_KEY",
                "base_url": "https://api.anthropic.com/v1/messages",
                "api_version": "2023-06-01",
                "timeout_seconds": 30,
            },
            "google": {
                "api_key_env": "TEST_GOOGLE_KEY",
                "base_url": "https://generativelanguage.googleapis.com/v1beta",
                "timeout_seconds": 30,
            },
            "openai": {
                "api_key_env": "TEST_OPENAI_KEY",
                "base_url": "https://api.openai.com/v1",
                "timeout_seconds": 30,
            },
        }
    }
    cfg.update(overrides)
    return cfg


class RecordingGet:
    """A models endpoint that answers from a script and remembers the calls."""

    def __init__(self, *pages):
        self.pages = list(pages)
        self.calls = []

    def __call__(self, url, headers, params, timeout):
        self.calls.append((url, headers, params))
        return self.pages.pop(0) if self.pages else {}


class TestEnumeration:
    def test_anthropic_paginates_to_exhaustion(self, monkeypatch):
        monkeypatch.setenv("TEST_ANTHROPIC_KEY", "k")
        get = RecordingGet(
            {"data": [{"id": "claude-opus-5", "display_name": "Opus 5"}],
             "has_more": True, "last_id": "claude-opus-5"},
            {"data": [{"id": "claude-sonnet-5"}], "has_more": False},
        )
        result = enumerate_provider(_provider_config(), "anthropic", get=get)

        assert [e.id for e in result.entries] == [
            "claude-opus-5", "claude-sonnet-5"
        ]
        assert get.calls[0][0] == "https://api.anthropic.com/v1/models"
        assert get.calls[1][2]["after_id"] == "claude-opus-5"

    def test_google_reports_limits_and_methods_anthropic_does_not(
        self, monkeypatch
    ):
        # The unequal-reporting case the record has to survive: one vendor
        # returns a capability tree, the other returns a name.
        monkeypatch.setenv("TEST_GOOGLE_KEY", "k")
        get = RecordingGet({"models": [{
            "name": "models/gemini-3.1-pro-preview",
            "displayName": "Gemini 3.1 Pro",
            "inputTokenLimit": 1048576,
            "outputTokenLimit": 65536,
            "supportedGenerationMethods": ["generateContent"],
        }]})
        entry = enumerate_provider(
            _provider_config(), "google", get=get
        ).entries[0]

        assert entry.id == "gemini-3.1-pro-preview"
        assert entry.max_context_tokens == 1048576
        assert entry.capabilities == ("generateContent",)
        assert get.calls[0][1] == {"x-goog-api-key": "k"}
        assert "key" not in (get.calls[0][2] or {})

    def test_a_missing_key_is_a_result_not_a_raise(self, monkeypatch):
        monkeypatch.delenv("TEST_OPENAI_KEY", raising=False)
        result = enumerate_provider(_provider_config(), "openai")

        assert result.error == ERROR_NO_API_KEY
        assert result.entries == ()

    def test_openai_epoch_creation_becomes_a_dated_field(self, monkeypatch):
        monkeypatch.setenv("TEST_OPENAI_KEY", "k")
        get = RecordingGet({"data": [{"id": "gpt-5.5", "created": 1767225600}]})
        entry = enumerate_provider(
            _provider_config(), "openai", get=get
        ).entries[0]

        assert entry.id == "gpt-5.5"
        assert entry.created_at == "2026-01-01T00:00:00Z"
        assert get.calls[0][0] == "https://api.openai.com/v1/models"

    def test_a_vendor_error_reports_its_class_and_not_its_message(
        self, monkeypatch
    ):
        # The string is written to a committed record, and a vendor error body
        # can echo the request headers back.
        monkeypatch.setenv("TEST_OPENAI_KEY", "k")

        def explode(url, headers, params, timeout):
            raise TimeoutError(f"failed calling {url} with {headers}")

        result = enumerate_provider(
            _provider_config(), "openai", get=explode
        )

        assert result.error == "TimeoutError"


class TestUnknownNeverUnsupported:
    def test_a_field_a_vendor_stops_reporting_keeps_its_last_known_value(self):
        record = merge_record(empty_record(), [ProviderResult(
            "google",
            (ApiModelEntry(
                id="gemini-x", provider="google", max_context_tokens=1000,
                capabilities=("generateContent",),
            ),),
        )])
        quiet = merge_record(record, [ProviderResult(
            "google", (ApiModelEntry(id="gemini-x", provider="google"),)
        )])

        entry = quiet.models[0]
        assert entry.max_context_tokens == 1000
        assert entry.capabilities == ("generateContent",)

    def test_an_unreported_field_is_written_by_omission(self, tmp_path):
        # A placeholder would later read as a measurement; TOML has only
        # absence, and absence is what unknown means.
        path = tmp_path / "api-models.lock"
        write_record(path, merge_record(empty_record(), [ProviderResult(
            "anthropic",
            (ApiModelEntry(id="claude-x", provider="anthropic"),),
        )]))
        text = path.read_text(encoding="utf-8")

        assert "max_context_tokens" not in text
        assert "capabilities" not in text
        assert load_record(path).models[0].max_context_tokens is None

    def test_a_failed_provider_keeps_its_models_and_records_the_failure(self):
        record = merge_record(empty_record(), [ProviderResult(
            "openai", (ApiModelEntry(id="gpt-x", provider="openai"),)
        )])
        after = merge_record(
            record, [ProviderResult("openai", error="TimeoutError")]
        )

        assert [e.id for e in after.models] == ["gpt-x"]
        status = next(p for p in after.providers if p.name == "openai")
        assert status.last_error == "TimeoutError"


class TestRecord:
    def test_the_record_round_trips_through_its_writer(self, tmp_path):
        path = tmp_path / "api-models.lock"
        written = write_record(path, merge_record(empty_record("keys-a"), [
            ProviderResult("anthropic", (ApiModelEntry(
                id="claude-x", provider="anthropic", display_name="X",
            ),)),
            # A vendor that answered and listed nothing: zero is a
            # measurement, and must not read back as never-enumerated.
            ProviderResult("google", ()),
        ]))

        assert load_record(path) == written
        assert dumps_record(load_record(path)) == path.read_text(
            encoding="utf-8"
        )

    def test_an_edit_after_the_write_is_reported_as_hand_edited(self, tmp_path):
        path = tmp_path / "api-models.lock"
        write_record(path, merge_record(empty_record(), [ProviderResult(
            "anthropic", (ApiModelEntry(id="claude-x", provider="anthropic"),)
        )]))
        path.write_text(
            path.read_text(encoding="utf-8").replace("claude-x", "claude-y"),
            encoding="utf-8", newline="\n",
        )

        assert record_provenance(load_record(path)) == PROVENANCE_HAND_EDITED

    def test_the_first_write_creates_the_records_home(self, tmp_path):
        # The default lives under .dabbler/, which does not exist on a fresh
        # checkout; the sanctioned writer is the only way to make the record,
        # so it has to be able to make it the first time.
        path = tmp_path / ".dabbler" / "api-models.lock"
        write_record(path, empty_record())

        assert load_record(path).meta.key_set_id == "default"

    def test_a_withdrawn_model_leaves_the_record_of_the_vendor_that_answered(
        self,
    ):
        # Enumeration is authoritative about existence on this path, unlike a
        # probe: a role naming the departed model becomes drift, not a silent
        # candidate.
        record = merge_record(empty_record(), [ProviderResult("openai", (
            ApiModelEntry(id="gpt-old", provider="openai"),
            ApiModelEntry(id="gpt-new", provider="openai"),
        ))])
        after = merge_record(record, [ProviderResult(
            "openai", (ApiModelEntry(id="gpt-new", provider="openai"),)
        )])

        assert [e.id for e in after.models] == ["gpt-new"]


class TestFreshness:
    def _config(self, tmp_path, **discovery):
        cfg = _provider_config()
        cfg["discovery"] = {
            "record": str(tmp_path / "api-models.lock"), **discovery
        }
        return cfg

    def test_an_absent_record_is_stale_and_names_its_invocation(self, tmp_path):
        rows = check_freshness(self._config(tmp_path), now=NOW)
        api = next(r for r in rows if r.record == "api-enumeration")

        assert api.stale and not api.present
        assert ENUMERATE_COMMAND in api.message()

    def test_the_two_records_are_aged_against_their_own_thresholds(
        self, tmp_path
    ):
        # The seat is not on the API's clock: a probe costs premium requests,
        # so the same age that is stale for a free metadata call is not.
        config = self._config(tmp_path, max_age_hours=24, seat_max_age_hours=720)
        _write_aged_record(tmp_path, hours=100)
        (tmp_path / "copilot-catalog.lock").write_text(
            '[meta]\ncli_version = "x"\nseat_id = "s"\n'
            f'probed_at = "{_stamp(100)}"\n',
            encoding="utf-8", newline="\n",
        )
        config["_config_path"] = str(tmp_path / "router-config.yaml")
        config["transports"] = {
            "copilot-cli": {"lockfile": "copilot-catalog.lock"}
        }
        rows = {r.record: r for r in check_freshness(config, now=NOW)}

        assert rows["api-enumeration"].stale
        assert not rows["seat-catalog"].stale

    def test_one_vendor_s_success_does_not_date_the_whole_record(
        self, tmp_path
    ):
        # Three endpoints this project does not control: one key expiring
        # while the others answer is an operational path, not an edge case,
        # and the record is only as current as its stalest enabled vendor.
        config = self._config(tmp_path, max_age_hours=24)
        record = merge_record(
            empty_record(),
            [ProviderResult("anthropic", ()), ProviderResult("openai", ()),
             ProviderResult("google", ())],
            enumerated_at=_stamp(100),
        )
        record = merge_record(
            record,
            [ProviderResult("anthropic", ()), ProviderResult("google", ())],
            enumerated_at=_stamp(1),
        )
        write_record(tmp_path / "api-models.lock", record)
        api = next(
            r for r in check_freshness(config, now=NOW)
            if r.record == "api-enumeration"
        )

        assert api.stale
        assert api.age_hours == pytest.approx(100, abs=1)

    def test_a_vendor_missing_from_the_record_is_named(self, tmp_path):
        config = self._config(tmp_path, max_age_hours=24)
        write_record(tmp_path / "api-models.lock", merge_record(
            empty_record(),
            [ProviderResult("anthropic", ()), ProviderResult("openai", ())],
            enumerated_at=_stamp(1),
        ))
        api = next(
            r for r in check_freshness(config, now=NOW)
            if r.record == "api-enumeration"
        )

        assert api.stale
        assert any("google has never been enumerated" in n for n in api.notes)


class TestDrift:
    def test_the_diff_reports_both_directions_against_the_roles(self, tmp_path):
        config = _provider_config()
        config["discovery"] = {"record": str(tmp_path / "api-models.lock")}
        config["roles"] = {"verifier": {"prefer": ["gpt-ranked", "gpt-gone"]}}
        write_record(tmp_path / "api-models.lock", merge_record(
            empty_record(), [ProviderResult("openai", (
                ApiModelEntry(id="gpt-ranked", provider="openai"),
                ApiModelEntry(id="gpt-unranked", provider="openai"),
            ))],
        ))
        drift = compute_drift(config, now=NOW)

        assert [m for m, _ in drift.unavailable] == ["gpt-gone"]
        assert [m for m, _ in drift.unnamed] == ["gpt-unranked"]


class TestSessionStart:
    def test_an_unreadable_config_leaves_registration_unblocked_and_silent(
        self, monkeypatch
    ):
        # A staleness check that could fail a registration would be a
        # maintenance signal capable of causing an outage, which is how
        # maintenance signals get suppressed.
        from ai_router import config as config_module
        from ai_router.session import _discovery_warnings

        def boom(*args, **kwargs):
            raise RuntimeError("router-config.yaml is unreadable")

        monkeypatch.setattr(config_module, "load_config", boom)

        assert _discovery_warnings() == []


class TestRefreshNeverHappensInsideASession:
    def test_a_session_in_flight_is_read_from_the_state_file(self, tmp_path):
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [
                {"number": 1, "status": "complete"},
                {"number": 2, "status": "in-progress"},
            ],
        }), encoding="utf-8")

        assert sessions_in_flight(tmp_path) == ["session 2"]

    def test_an_idle_repository_reports_nothing_in_flight(self, tmp_path):
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [{"number": 1, "status": "not-started"}],
        }), encoding="utf-8")

        assert sessions_in_flight(tmp_path) == []
