import copy
import sys
from dataclasses import asdict
from typing import Optional, Sequence

import pytest

import copilot_catalog
from cli_transport import TransportResult

# ---------------------------------------------------------------------------
# Test Data and Fakes
# ---------------------------------------------------------------------------

CATALOG_META = copilot_catalog.CatalogMeta(
    schema_version=1,
    cli_name="Test CLI",
    cli_version="1.2.3",
    cli_version_pin_required=True,
    seat_id="test-seat-1",
    seat_label="Test Seat",
    source="test-fixture",
    probed_at="2024-01-01T00:00:00Z",
)

MODEL_ENTRIES = [
    copilot_catalog.ModelEntry(
        id="gpt-5.4",
        provider="openai",
        enablement=copilot_catalog.ENABLEMENT_CONFIRMED,
        confirmed_at="2024-01-01T00:00:00Z",
        confirmed_on_cli_version="1.2.3",
        echoed_model="gpt-5.4",
    ),
    copilot_catalog.ModelEntry(
        id="claude-sonnet-4.6",
        provider="anthropic",
        enablement=copilot_catalog.ENABLEMENT_CONFIRMED,
        confirmed_at="2024-01-01T00:00:00Z",
        confirmed_on_cli_version="1.2.3",
        premium_request_weight=2,
    ),
    copilot_catalog.ModelEntry(
        id="gemini-3.1-pro-preview",
        provider="google",
        enablement=copilot_catalog.ENABLEMENT_UNCONFIRMED,
    ),
]


@pytest.fixture
def valid_catalog():
    # Deep copy: several tests below mutate meta/model fields in place
    # (cli_version_pin_required, provider). Sharing the module-level
    # CATALOG_META/MODEL_ENTRIES objects directly would let one test's
    # mutation leak into every later test (including test_main_cli, which
    # reads MODEL_ENTRIES directly rather than through this fixture).
    return copy.deepcopy(
        copilot_catalog.Catalog(meta=CATALOG_META, models=MODEL_ENTRIES)
    )


class FakeTransport:
    def __init__(self, confirmed_models: set[str]):
        self.confirmed_models = confirmed_models

    def dispatch(
        self, *, model_id: str, system_prompt: str, user_message: str
    ) -> TransportResult:
        if model_id in self.confirmed_models:
            return TransportResult(
                content="OK",
                input_tokens=0,
                output_tokens=1,
                stop_reason="end_turn",
                usage_authoritative=False,
                finish_reason_known=True,
                content_complete=True,
                partial_output_discarded=False,
                raw_stdout="",
                raw_stderr="",
                transport_metadata={
                    "error_class": None,
                    "echoed_model": f"echoed-{model_id}",
                    "premium_requests": 1,
                },
            )
        return TransportResult(
            content="",
            input_tokens=0,
            output_tokens=0,
            stop_reason="error:invalid-model",
            usage_authoritative=False,
            finish_reason_known=False,
            content_complete=False,
            partial_output_discarded=False,
            raw_stdout="",
            raw_stderr="Error: Model not available",
            transport_metadata={"error_class": "invalid-model"},
        )


class FakeCompletedProcess:
    def __init__(self, stdout: str, returncode: int = 0):
        self.stdout = stdout
        self.returncode = returncode


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model_id, expected_provider",
    [
        ("gpt-5.4", "openai"),
        ("claude-sonnet-4.6", "anthropic"),
        ("gemini-3.1-pro-preview", "google"),
        ("unknown-model-1.0", ""),
    ],
)
def test_infer_provider(model_id, expected_provider):
    provider, source = copilot_catalog.infer_provider(model_id)
    assert provider == expected_provider
    assert source == "name-prefix-heuristic"


def test_lockfile_roundtrip_dumps_loads(valid_catalog):
    toml_text = copilot_catalog.dumps(valid_catalog)
    reloaded_catalog = copilot_catalog.loads(toml_text)
    assert asdict(reloaded_catalog) == asdict(valid_catalog)


def test_lockfile_roundtrip_file_io(valid_catalog, tmp_path):
    lockfile = tmp_path / "catalog.lock"
    copilot_catalog.write_lockfile(lockfile, valid_catalog)
    reloaded_catalog = copilot_catalog.load_lockfile(lockfile)
    assert asdict(reloaded_catalog) == asdict(valid_catalog)


@pytest.mark.parametrize(
    "bad_toml, match_str",
    [
        # No [meta] header at all (only a comment/blank line, so nothing
        # ever reaches the "line before any header" check either).
        ("# just a comment\n", "no \\[meta\\] table"),
        # The lockfile format is double-quoted-string-only (see module
        # docstring); required keys present but cli_version missing.
        ('[meta]\ncli_name = "x"\nseat_id = "y"', "missing required key 'cli_version'"),
        # No "=" at all -- fails the key/value regex outright.
        ("[meta]\nnot a key value line", "Unparseable lockfile line"),
        ("key = \"value\"\n[meta]", "before any table header"),
    ],
)
def test_loads_raises_on_malformed_input(bad_toml, match_str):
    with pytest.raises(ValueError, match=match_str):
        copilot_catalog.loads(bad_toml)


def test_validate_catalog_success(valid_catalog):
    result = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.3", live_seat_id="test-seat-1"
    )
    assert result.ok
    assert bool(result)
    assert result.reasons == ()


def test_validate_catalog_fails_on_version_drift(valid_catalog):
    # Fails when pin is required
    result = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.4", live_seat_id="test-seat-1"
    )
    assert not result.ok
    assert not bool(result)
    assert len(result.reasons) == 1
    assert "CLI version drift" in result.reasons[0]

    # Succeeds when pin is not required
    valid_catalog.meta.cli_version_pin_required = False
    result_no_pin = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.4", live_seat_id="test-seat-1"
    )
    assert result_no_pin.ok


def test_validate_catalog_fails_on_seat_mismatch(valid_catalog):
    result = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.3", live_seat_id="DIFFERENT-SEAT"
    )
    assert not result.ok
    assert "Seat mismatch" in result.reasons[0]


def test_validate_catalog_fails_on_bad_provenance(valid_catalog):
    # Missing provider
    valid_catalog.models[0].provider = ""
    result_missing = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.3", live_seat_id="test-seat-1"
    )
    assert not result_missing.ok
    assert "Missing/unknown provenance" in result_missing.reasons[0]

    # Unknown provider
    valid_catalog.models[0].provider = "some-other-provider"
    result_unknown = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.3", live_seat_id="test-seat-1"
    )
    assert not result_unknown.ok
    assert "Missing/unknown provenance" in result_unknown.reasons[0]


def test_validate_catalog_fails_on_same_provider_only(valid_catalog):
    # Make all confirmed models have the same provider
    valid_catalog.models[0].provider = "openai"
    valid_catalog.models[1].provider = "openai"
    result = copilot_catalog.validate_catalog(
        valid_catalog, live_cli_version="1.2.3", live_seat_id="test-seat-1"
    )
    assert not result.ok
    assert "Same-provider-only" in result.reasons[0]


def test_discover_catalog():
    fake_transport = FakeTransport(confirmed_models={"gpt-5.4", "claude-sonnet-4.6"})
    test_universe = ["gpt-5.4", "claude-sonnet-4.6", "gemini-3.5-flash"]
    probed_at_str = "2024-07-20T10:00:00Z"

    catalog = copilot_catalog.discover_catalog(
        seat_id="discover-seat",
        seat_label="Discovery",
        probed_at=probed_at_str,
        transport=fake_transport,
        model_universe=test_universe,
        cli_version="9.9.9",
    )

    assert catalog.meta.seat_id == "discover-seat"
    assert catalog.meta.seat_label == "Discovery"
    assert catalog.meta.cli_version == "9.9.9"
    assert len(catalog.models) == 3

    model_map = {m.id: m for m in catalog.models}
    assert model_map["gpt-5.4"].enablement == copilot_catalog.ENABLEMENT_CONFIRMED
    assert model_map["gpt-5.4"].confirmed_at == probed_at_str
    assert model_map["gpt-5.4"].confirmed_on_cli_version == "9.9.9"
    assert model_map["gpt-5.4"].echoed_model == "echoed-gpt-5.4"
    assert model_map["gpt-5.4"].premium_request_weight == 1

    assert model_map["claude-sonnet-4.6"].enablement == copilot_catalog.ENABLEMENT_CONFIRMED
    assert model_map["gemini-3.5-flash"].enablement == copilot_catalog.ENABLEMENT_UNCONFIRMED
    assert model_map["gemini-3.5-flash"].confirmed_at is None


@pytest.mark.parametrize("bad_weight", [1.5, [], {}, "1", True])
def test_discover_catalog_coerces_malformed_premium_weight_to_none(
    bad_weight, tmp_path
):
    # Round-4 verification finding: a wrong-shaped premiumRequests value in
    # the transport's diagnostic metadata (a float, list, dict, numeric
    # string, or bool) must never cross into ModelEntry.premium_request_weight
    # (a typed Optional[int]) un-coerced -- write_lockfile()'s TOML
    # serializer only supports bool/int/str and would otherwise crash on
    # --refresh. Confirm both the coercion AND that the lockfile still
    # writes cleanly end-to-end.
    class _WeirdWeightTransport:
        def dispatch(self, *, model_id, system_prompt, user_message):
            return TransportResult(
                content="OK", input_tokens=0, output_tokens=1,
                stop_reason="end_turn", usage_authoritative=False,
                finish_reason_known=True, content_complete=True,
                partial_output_discarded=False, raw_stdout="", raw_stderr="",
                transport_metadata={
                    "error_class": None,
                    "echoed_model": model_id,
                    "premium_requests": bad_weight,
                },
            )

    catalog = copilot_catalog.discover_catalog(
        seat_id="s", seat_label="l", probed_at="2024-01-01T00:00:00Z",
        transport=_WeirdWeightTransport(),
        model_universe=["gpt-5.4"], cli_version="1.0.0",
    )
    assert catalog.models[0].premium_request_weight is None

    out_file = tmp_path / "catalog.lock"
    copilot_catalog.write_lockfile(out_file, catalog)  # must not raise
    reloaded = copilot_catalog.load_lockfile(out_file)
    assert reloaded.models[0].premium_request_weight is None


def test_get_cli_version_success(monkeypatch):
    def fake_run(*args, **kwargs):
        return FakeCompletedProcess(stdout="  1.2.3  \n")
    monkeypatch.setattr(copilot_catalog.subprocess, "run", fake_run)
    assert copilot_catalog.get_cli_version() == "1.2.3"


def test_get_cli_version_strips_multiline_update_nag(monkeypatch):
    # S4 live-dogfood finding: the real CLI's --version banner is two lines
    # ("GitHub Copilot CLI 1.0.68.\nRun 'copilot update' to check for
    # updates."), not the single clean token every prior fixture assumed.
    # The raw multi-line string, stored verbatim as `cli_version`, produced a
    # literal unescaped newline inside a quoted TOML value that the module's
    # own loader could not parse back -- caught only by discovering against
    # the real seat. Only the first line is the actual version banner.
    def fake_run(*args, **kwargs):
        return FakeCompletedProcess(
            stdout="GitHub Copilot CLI 1.0.68.\nRun 'copilot update' to check for updates.\n"
        )
    monkeypatch.setattr(copilot_catalog.subprocess, "run", fake_run)
    version = copilot_catalog.get_cli_version()
    assert version == "GitHub Copilot CLI 1.0.68."
    assert "\n" not in version

    # The fixed version must round-trip through the lockfile writer/loader
    # -- the exact failure the raw multi-line value caused for real.
    catalog = copilot_catalog.discover_catalog(
        seat_id="s", seat_label="l", probed_at="2024-01-01T00:00:00Z",
        transport=FakeTransport({"gpt-5.4"}),
        model_universe=["gpt-5.4"], cli_version=version,
    )
    assert "\n" not in catalog.meta.cli_version


@pytest.mark.parametrize("error_case", ["os_error", "non_zero"])
def test_get_cli_version_failure(monkeypatch, error_case):
    if error_case == "os_error":
        def fake_run_oserror(*args, **kwargs):
            raise OSError("Command not found")
        monkeypatch.setattr(copilot_catalog.subprocess, "run", fake_run_oserror)
    else:
        def fake_run_nonzero(*args, **kwargs):
            return FakeCompletedProcess(stdout="", returncode=1)
        monkeypatch.setattr(copilot_catalog.subprocess, "run", fake_run_nonzero)
    assert copilot_catalog.get_cli_version() is None


def test_main_cli(monkeypatch, tmp_path, capsys):
    out_file = tmp_path / "catalog.lock"

    # Create a catalog with multiple providers to avoid the warning path
    multi_provider_catalog = copilot_catalog.Catalog(meta=CATALOG_META, models=MODEL_ENTRIES)
    
    def fake_discover(*args, **kwargs):
        return multi_provider_catalog
    monkeypatch.setattr(copilot_catalog, "discover_catalog", fake_discover)

    argv = [
        "--refresh",
        "--seat-id", "test-seat-1",
        "--seat-label", "Test Seat",
        "--out", str(out_file),
    ]
    ret_code = copilot_catalog.main(argv)
    assert ret_code == 0
    assert out_file.exists()
    
    reloaded = copilot_catalog.load_lockfile(out_file)
    assert reloaded.meta.seat_id == "test-seat-1"
    
    captured = capsys.readouterr()
    assert "Wrote" in captured.out
    assert "2/3 models confirmed" in captured.out
    assert "providers=['anthropic', 'openai']" in captured.out
    assert "WARNING" not in captured.err


def test_main_cli_warns_on_single_provider(monkeypatch, tmp_path, capsys):
    out_file = tmp_path / "catalog.lock"
    
    # Create a catalog with only one provider confirmed
    single_provider_models = [
        copilot_catalog.ModelEntry(id="gpt-5.4", provider="openai", enablement="confirmed"),
        copilot_catalog.ModelEntry(id="gpt-5.2", provider="openai", enablement="confirmed"),
        copilot_catalog.ModelEntry(id="claude-sonnet-4.6", provider="anthropic", enablement="unconfirmed"),
    ]
    single_provider_catalog = copilot_catalog.Catalog(meta=CATALOG_META, models=single_provider_models)

    def fake_discover(*args, **kwargs):
        return single_provider_catalog
    monkeypatch.setattr(copilot_catalog, "discover_catalog", fake_discover)

    argv = ["--refresh", "--seat-id", "test-seat-1", "--out", str(out_file)]
    ret_code = copilot_catalog.main(argv)
    assert ret_code == 0

    captured = capsys.readouterr()
    assert "WARNING: fewer than 2 distinct providers confirmed" in captured.err