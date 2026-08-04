"""Set 109 S1 — provider enumeration, the drift gate, and served-model truth.

No test in this file opens a socket. The fetch paths are driven through
``httpx.MockTransport`` over the captured payloads in
``model_inventory_fixtures``; the gate paths are pure functions over dicts; and
``test_check_never_touches_the_network`` proves the ``--check`` CLI cannot
probe even if someone later wires a fetch into it.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

import model_inventory
import model_inventory_fixtures as fx


NOW = datetime(2026, 8, 4, 12, 0, 0, tzinfo=timezone.utc)


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _config(**providers) -> dict:
    """A minimal router-config shaped dict with only the keys this module reads."""
    return {
        "providers": {
            "anthropic": {
                "api_key_env": "TEST_ANTHROPIC_KEY",
                "base_url": "https://api.anthropic.com/v1/messages",
                "api_version": "2023-06-01",
            },
            "google": {
                "api_key_env": "TEST_GOOGLE_KEY",
                "base_url": "https://generativelanguage.googleapis.com/v1beta",
            },
            "openai": {
                "api_key_env": "TEST_OPENAI_KEY",
                "base_url": "https://api.openai.com/v1",
            },
            **providers,
        },
        "models": {},
    }


def _lock(now=NOW, **provider_models) -> dict:
    return {
        "schema_version": model_inventory.SCHEMA_VERSION,
        "generated_by": "ai_router.model_inventory",
        "providers": {
            name: {
                "probed_at": model_inventory._iso(now),
                "endpoint": f"https://example.invalid/{name}/models",
                "model_count": len(models),
                "models": sorted(models),
            }
            for name, models in provider_models.items()
        },
    }


# ---------------------------------------------------------------------------
# Endpoint resolution
# ---------------------------------------------------------------------------


def test_anthropic_endpoint_drops_the_messages_suffix():
    cfg = _config()["providers"]["anthropic"]
    assert model_inventory.list_endpoint("anthropic", cfg) == (
        "https://api.anthropic.com/v1/models"
    )


def test_openai_and_google_endpoints_append_models():
    providers = _config()["providers"]
    assert model_inventory.list_endpoint("openai", providers["openai"]) == (
        "https://api.openai.com/v1/models"
    )
    assert model_inventory.list_endpoint("google", providers["google"]) == (
        "https://generativelanguage.googleapis.com/v1beta/models"
    )


def test_endpoint_honours_a_proxied_base_url():
    assert model_inventory.list_endpoint(
        "openai", {"base_url": "https://proxy.internal/openai/v1/"}
    ) == "https://proxy.internal/openai/v1/models"


def test_unknown_provider_has_no_endpoint():
    with pytest.raises(model_inventory.InventoryError):
        model_inventory.list_endpoint("mistral", {})


# ---------------------------------------------------------------------------
# Per-provider parsing of the captured payloads
# ---------------------------------------------------------------------------


def test_parse_openai_page_returns_ids_and_no_cursor():
    ids, cursor = model_inventory.parse_openai_page(fx.OPENAI_MODELS_PAGE)
    assert cursor is None
    assert "gpt-5.4" in ids
    # The whole point of the gate: the three variants exist, the bare id does not.
    assert {"gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"} <= set(ids)
    assert "gpt-5.6" not in ids


def test_parse_anthropic_page_returns_ids_and_no_cursor_when_complete():
    ids, cursor = model_inventory.parse_anthropic_page(fx.ANTHROPIC_MODELS_PAGE)
    assert cursor is None
    assert "claude-opus-5" in ids and "claude-sonnet-4-6" in ids


def test_parse_anthropic_page_returns_last_id_when_has_more():
    _, cursor = model_inventory.parse_anthropic_page(fx.ANTHROPIC_MODELS_PAGE_1)
    assert cursor == "claude-opus-5"


def test_parse_google_page_strips_the_models_prefix():
    ids, cursor = model_inventory.parse_google_page(fx.GOOGLE_MODELS_PAGE)
    assert cursor is None
    assert "gemini-2.5-pro" in ids
    assert not any(i.startswith("models/") for i in ids)


def test_parse_google_page_returns_the_next_page_token():
    _, cursor = model_inventory.parse_google_page(fx.GOOGLE_MODELS_PAGE_1)
    assert cursor == "page-2-token"


@pytest.mark.parametrize(
    "parser",
    [
        model_inventory.parse_openai_page,
        model_inventory.parse_anthropic_page,
        model_inventory.parse_google_page,
    ],
)
def test_parsers_fail_loud_on_a_reshaped_payload(parser):
    # A provider that changes its envelope must raise, not quietly enumerate
    # zero models -- an empty snapshot would make every id read as drift.
    with pytest.raises(model_inventory.InventoryError):
        parser({"unexpected": "shape"})


# ---------------------------------------------------------------------------
# Fetching, over httpx.MockTransport
# ---------------------------------------------------------------------------


def test_fetch_openai_sends_bearer_auth_and_returns_ids():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=fx.OPENAI_MODELS_PAGE)

    with _client(handler) as client:
        ids = model_inventory.fetch_openai(
            client, endpoint="https://api.openai.com/v1/models", api_key="k",
        )
    assert seen["auth"] == "Bearer k"
    assert "gpt-5.6-sol" in ids


def test_fetch_anthropic_follows_the_cursor_across_pages():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(dict(request.url.params))
        page = (
            fx.ANTHROPIC_MODELS_PAGE_2 if "after_id" in request.url.params
            else fx.ANTHROPIC_MODELS_PAGE_1
        )
        return httpx.Response(200, json=page)

    with _client(handler) as client:
        ids = model_inventory.fetch_anthropic(
            client, endpoint="https://api.anthropic.com/v1/models", api_key="k",
        )
    assert ids == ["claude-opus-5", "claude-sonnet-4-6"]
    assert calls[1]["after_id"] == "claude-opus-5"


def test_fetch_anthropic_sends_the_version_header():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["version"] = request.headers.get("anthropic-version")
        seen["key"] = request.headers.get("x-api-key")
        return httpx.Response(200, json=fx.ANTHROPIC_MODELS_PAGE)

    with _client(handler) as client:
        model_inventory.fetch_anthropic(
            client, endpoint="https://api.anthropic.com/v1/models",
            api_key="k", api_version="2023-06-01",
        )
    assert seen == {"version": "2023-06-01", "key": "k"}


def test_fetch_anthropic_stops_on_a_repeated_cursor():
    # A server that keeps handing back the same last_id must not spin forever.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=fx.ANTHROPIC_MODELS_PAGE_1)

    with _client(handler) as client:
        ids = model_inventory.fetch_anthropic(
            client, endpoint="https://api.anthropic.com/v1/models", api_key="k",
        )
    assert ids == ["claude-opus-5", "claude-opus-5"]


def test_fetch_google_follows_the_next_page_token():
    def handler(request: httpx.Request) -> httpx.Response:
        page = (
            fx.GOOGLE_MODELS_PAGE_2 if "pageToken" in request.url.params
            else fx.GOOGLE_MODELS_PAGE_1
        )
        return httpx.Response(200, json=page)

    with _client(handler) as client:
        ids = model_inventory.fetch_google(
            client,
            endpoint="https://generativelanguage.googleapis.com/v1beta/models",
            api_key="k",
        )
    assert ids == ["gemini-2.5-flash", "gemini-2.5-pro"]


# ---------------------------------------------------------------------------
# Credential hygiene. httpx renders the request URL into HTTPStatusError and
# --refresh prints that message to stderr, so a key in the query string would
# land in terminal history and CI logs on any routine 401/429/5xx.
# ---------------------------------------------------------------------------


def test_google_sends_the_key_as_a_header_not_a_query_parameter():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["header"] = request.headers.get("x-goog-api-key")
        seen["url"] = str(request.url)
        return httpx.Response(200, json=fx.GOOGLE_MODELS_PAGE)

    with _client(handler) as client:
        model_inventory.fetch_google(
            client,
            endpoint="https://generativelanguage.googleapis.com/v1beta/models",
            api_key="SENTINEL-KEY-VALUE",
        )
    assert seen["header"] == "SENTINEL-KEY-VALUE"
    assert "SENTINEL-KEY-VALUE" not in seen["url"]
    assert "key=" not in seen["url"]


@pytest.mark.parametrize("provider", ["anthropic", "google", "openai"])
def test_an_http_failure_never_renders_the_api_key(provider, monkeypatch):
    monkeypatch.setenv("TEST_ANTHROPIC_KEY", "SENTINEL-KEY-VALUE")
    monkeypatch.setenv("TEST_GOOGLE_KEY", "SENTINEL-KEY-VALUE")
    monkeypatch.setenv("TEST_OPENAI_KEY", "SENTINEL-KEY-VALUE")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate limited")

    with _client(handler) as client:
        with pytest.raises(model_inventory.InventoryError) as excinfo:
            model_inventory.probe_provider(provider, _config(), client=client)
    assert "SENTINEL-KEY-VALUE" not in str(excinfo.value)
    # ...and the suppressed cause cannot leak it through a chained traceback.
    assert excinfo.value.__cause__ is None


def test_redact_secret_scrubs_both_the_value_and_credential_query_params():
    text = (
        "GET https://example.invalid/v1/models?key=SEKRIT&pageSize=1000 "
        "failed; token SEKRIT rejected"
    )
    scrubbed = model_inventory.redact_secret(text, "SEKRIT")
    assert "SEKRIT" not in scrubbed
    assert "pageSize=1000" in scrubbed


def test_redact_secret_scrubs_a_query_param_even_without_the_value():
    # The call site does not always hold the credential that leaked.
    scrubbed = model_inventory.redact_secret(
        "https://example.invalid/models?key=OTHER-KEY&x=1"
    )
    assert "OTHER-KEY" not in scrubbed and "x=1" in scrubbed


def test_fetch_raises_inventory_error_on_an_http_error(monkeypatch):
    # The key IS present here, so the failure under test is the 401 itself and
    # not the missing-credential path (which raises the same exception type).
    monkeypatch.setenv("TEST_OPENAI_KEY", "k")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    with _client(handler) as client:
        with pytest.raises(
            model_inventory.InventoryError, match="openai enumeration failed"
        ):
            model_inventory.probe_provider("openai", _config(), client=client)


# ---------------------------------------------------------------------------
# probe_provider
# ---------------------------------------------------------------------------


def test_probe_provider_fails_loud_without_an_api_key(monkeypatch):
    monkeypatch.delenv("TEST_OPENAI_KEY", raising=False)
    with pytest.raises(model_inventory.InventoryError, match="Missing API key"):
        model_inventory.probe_provider("openai", _config())


def test_probe_provider_refuses_an_empty_model_list(monkeypatch):
    monkeypatch.setenv("TEST_OPENAI_KEY", "k")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"object": "list", "data": []})

    with _client(handler) as client:
        with pytest.raises(model_inventory.InventoryError, match="empty model list"):
            model_inventory.probe_provider("openai", _config(), client=client)


# ---------------------------------------------------------------------------
# Lockfile IO
# ---------------------------------------------------------------------------


def test_lockfile_round_trips(tmp_path: Path):
    path = tmp_path / "model-inventory.lock"
    payload = _lock(openai=["gpt-5.4"])
    model_inventory.write_lockfile(path, payload)
    assert model_inventory.load_lockfile(path) == payload


def test_load_lockfile_raises_when_absent(tmp_path: Path):
    with pytest.raises(model_inventory.InventoryError, match="Cannot read lockfile"):
        model_inventory.load_lockfile(tmp_path / "nope.lock")


def test_load_lockfile_raises_on_invalid_json(tmp_path: Path):
    path = tmp_path / "bad.lock"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(model_inventory.InventoryError, match="not valid JSON"):
        model_inventory.load_lockfile(path)


def test_load_lockfile_raises_without_a_providers_object(tmp_path: Path):
    path = tmp_path / "bad.lock"
    path.write_text(json.dumps({"schema_version": 1}), encoding="utf-8")
    with pytest.raises(model_inventory.InventoryError, match="no 'providers'"):
        model_inventory.load_lockfile(path)


# ---------------------------------------------------------------------------
# refresh_inventory
# ---------------------------------------------------------------------------


def test_refresh_records_a_per_provider_probe_timestamp(tmp_path: Path, monkeypatch):
    for env in ("TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"):
        monkeypatch.setenv(env, "k")

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if "anthropic" in host:
            return httpx.Response(200, json=fx.ANTHROPIC_MODELS_PAGE)
        if "googleapis" in host:
            return httpx.Response(200, json=fx.GOOGLE_MODELS_PAGE)
        return httpx.Response(200, json=fx.OPENAI_MODELS_PAGE)

    path = tmp_path / "model-inventory.lock"
    with _client(handler) as client:
        payload, failures = model_inventory.refresh_inventory(
            _config(), lockfile_path=path, client=client, now=NOW,
        )
    assert failures == []
    assert set(payload["providers"]) == set(model_inventory.ENUMERATED_PROVIDERS)
    for block in payload["providers"].values():
        assert block["probed_at"] == "2026-08-04T12:00:00Z"
        assert block["model_count"] == len(block["models"])
    assert "gpt-5.6" not in payload["providers"]["openai"]["models"]


def test_a_failing_provider_keeps_its_previous_snapshot(tmp_path: Path, monkeypatch):
    # A partial refresh must never downgrade a good snapshot to a missing one:
    # that would silently convert "we could not ask" into "not offered".
    path = tmp_path / "model-inventory.lock"
    model_inventory.write_lockfile(path, _lock(openai=["gpt-5.4", "gpt-5.5"]))
    monkeypatch.delenv("TEST_OPENAI_KEY", raising=False)
    monkeypatch.setenv("TEST_ANTHROPIC_KEY", "k")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=fx.ANTHROPIC_MODELS_PAGE)

    with _client(handler) as client:
        payload, failures = model_inventory.refresh_inventory(
            _config(), lockfile_path=path, providers=("anthropic", "openai"),
            client=client, now=NOW,
        )
    assert len(failures) == 1 and "openai" in failures[0]
    assert payload["providers"]["openai"]["models"] == ["gpt-5.4", "gpt-5.5"]
    assert "claude-opus-5" in payload["providers"]["anthropic"]["models"]


# ---------------------------------------------------------------------------
# check_registry — the gate
# ---------------------------------------------------------------------------


def _registry(**entries) -> dict:
    cfg = _config()
    cfg["models"] = entries
    return cfg


def test_gate_fails_loud_on_a_routable_id_the_provider_does_not_offer():
    cfg = _registry(**{"gpt-5-6": {
        "provider": "openai", "model_id": "gpt-5.6", "is_enabled": True,
    }})
    result = model_inventory.check_registry(
        cfg, _lock(openai=["gpt-5.6-sol", "gpt-5.6-luna"]), now=NOW,
    )
    assert not result.ok
    assert [f.alias for f in result.routable_drift] == ["gpt-5-6"]
    assert result.routable_drift[0].model_id == "gpt-5.6"


def test_gate_passes_when_every_routable_id_is_offered():
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    result = model_inventory.check_registry(cfg, _lock(openai=["gpt-5.4"]), now=NOW)
    assert result.ok and result.checked == 1
    assert not result.routable_drift and not result.identity_drift


def test_an_entry_omitting_is_enabled_is_treated_as_routable():
    # The registry documents `is_enabled` as defaulting to true when omitted,
    # and models.py / utils.py / verification.py all read it that way. A gate
    # that defaulted the other way would demote a live entry to a mere note.
    cfg = _registry(**{"gpt-5-6": {"provider": "openai", "model_id": "gpt-5.6"}})
    result = model_inventory.check_registry(
        cfg, _lock(openai=["gpt-5.6-sol"]), now=NOW,
    )
    assert not result.ok
    assert [f.alias for f in result.routable_drift] == ["gpt-5-6"]


def test_a_pinned_entry_is_routable_even_with_is_enabled_false():
    # models.pick_model returns a task_type_overrides pin WITHOUT its
    # _survives() check when no provider exclusion applies, so a pinned entry
    # reaches the wire regardless of the flag. Classifying it as identity-only
    # would file a live, invalid id as a note and exit 0.
    cfg = _registry(**{"pinned-verifier": {
        "provider": "openai", "model_id": "gpt-5.6", "is_enabled": False,
    }})
    cfg["routing"] = {"task_type_overrides": {"session-verification": "pinned-verifier"}}
    result = model_inventory.check_registry(
        cfg, _lock(openai=["gpt-5.6-sol"]), now=NOW,
    )
    assert not result.ok
    assert [f.alias for f in result.routable_drift] == ["pinned-verifier"]


def test_a_tier_assigned_entry_is_routable_even_with_is_enabled_false():
    cfg = _registry(**{"tier3": {
        "provider": "openai", "model_id": "gpt-5.6", "is_enabled": False,
    }})
    cfg["routing"] = {"tier_assignments": {1: "tier3", 2: "tier3", 3: "tier3"}}
    result = model_inventory.check_registry(
        cfg, _lock(openai=["gpt-5.6-sol"]), now=NOW,
    )
    assert [f.alias for f in result.routable_drift] == ["tier3"]


def test_pinned_model_names_reads_both_routing_tables():
    cfg = {"routing": {
        "task_type_overrides": {"architecture": "opus", "code-review": "sonnet"},
        "tier_assignments": {1: "gemini-flash", 2: "gemini-pro", 3: "opus"},
    }}
    assert model_inventory.pinned_model_names(cfg) == {
        "opus", "sonnet", "gemini-flash", "gemini-pro",
    }


def test_pinned_model_names_tolerates_a_missing_routing_block():
    assert model_inventory.pinned_model_names({}) == set()


def test_an_identity_only_miss_fails_too_but_is_classified_separately():
    # No carve-out: the invariant is "every configured model_id is offered by
    # its provider". The routable/identity-only split says how URGENT a miss
    # is; it never says whether the gate passes.
    cfg = _registry(**{"gemini-3-pro": {
        "provider": "google", "model_id": "gemini-3-pro", "is_enabled": False,
    }})
    result = model_inventory.check_registry(
        cfg, _lock(google=["gemini-3-pro-preview"]), now=NOW,
    )
    assert not result.ok
    assert [f.alias for f in result.identity_drift] == ["gemini-3-pro"]
    assert result.routable_drift == []


def test_identity_only_entry_that_is_offered_reports_nothing():
    cfg = _registry(**{"claude-opus-5": {
        "provider": "anthropic", "model_id": "claude-opus-5", "is_enabled": False,
    }})
    result = model_inventory.check_registry(
        cfg, _lock(anthropic=["claude-opus-5"]), now=NOW,
    )
    assert result.ok and not result.identity_drift


def test_a_never_enumerated_provider_is_fatal_not_drift():
    # "We never asked" and "the provider does not offer it" are different
    # facts; conflating them would report every model of that provider as drift.
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    result = model_inventory.check_registry(cfg, _lock(anthropic=["x"]), now=NOW)
    assert not result.ok
    assert not result.routable_drift
    assert len(result.fatal) == 1 and "never been enumerated" in result.fatal[0]


def test_a_never_enumerated_provider_is_reported_once_per_cause():
    cfg = _registry(
        **{
            "gpt-5-4": {"provider": "openai", "model_id": "gpt-5.4",
                        "is_enabled": True},
            "gpt-5-5": {"provider": "openai", "model_id": "gpt-5.5",
                        "is_enabled": True},
        }
    )
    result = model_inventory.check_registry(cfg, _lock(anthropic=["x"]), now=NOW)
    assert len(result.fatal) == 1


def test_an_unenumerable_provider_is_reported_at_its_own_routability():
    cfg = _registry(
        **{
            "mistral-large": {"provider": "mistral", "model_id": "mistral-large",
                              "is_enabled": True},
            "mistral-note": {"provider": "mistral", "model_id": "mistral-small",
                             "is_enabled": False},
        }
    )
    result = model_inventory.check_registry(cfg, _lock(openai=["gpt-5.4"]), now=NOW)
    assert [f.alias for f in result.routable_drift] == ["mistral-large"]
    assert [f.alias for f in result.identity_drift] == ["mistral-note"]


def test_an_entry_without_a_model_id_is_fatal():
    cfg = _registry(**{"broken": {"provider": "openai", "is_enabled": True}})
    result = model_inventory.check_registry(cfg, _lock(openai=["gpt-5.4"]), now=NOW)
    assert not result.ok and "missing provider and/or model_id" in result.fatal[0]


def test_a_stale_snapshot_warns_without_failing():
    old = NOW - timedelta(days=model_inventory.STALENESS_THRESHOLD_DAYS + 1)
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    result = model_inventory.check_registry(
        cfg, _lock(now=old, openai=["gpt-5.4"]), now=NOW,
    )
    assert result.ok
    assert len(result.stale_providers) == 1 and "openai" in result.stale_providers[0]


def test_a_fresh_snapshot_does_not_warn():
    fresh = NOW - timedelta(days=model_inventory.STALENESS_THRESHOLD_DAYS - 1)
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    result = model_inventory.check_registry(
        cfg, _lock(now=fresh, openai=["gpt-5.4"]), now=NOW,
    )
    assert result.stale_providers == []


def test_a_snapshot_without_a_timestamp_is_fatal():
    # Otherwise it can never be judged stale and would pass forever.
    lock = _lock(openai=["gpt-5.4"])
    del lock["providers"]["openai"]["probed_at"]
    result = model_inventory.check_registry(_registry(), lock, now=NOW)
    assert not result.ok and "no probed_at" in result.fatal[0]


def test_an_unparseable_probe_timestamp_is_fatal():
    lock = _lock(openai=["gpt-5.4"])
    lock["providers"]["openai"]["probed_at"] = "last Tuesday"
    result = model_inventory.check_registry(_registry(), lock, now=NOW)
    assert not result.ok and "unparseable probed_at" in result.fatal[0]


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def test_render_is_ascii_only():
    cfg = _registry(
        **{
            "gpt-5-6": {"provider": "openai", "model_id": "gpt-5.6",
                        "is_enabled": True},
            "gemini-3-pro": {"provider": "google", "model_id": "gemini-3-pro",
                             "is_enabled": False},
        }
    )
    old = NOW - timedelta(days=90)
    result = model_inventory.check_registry(
        cfg, _lock(now=old, openai=["gpt-5.6-sol"], google=["gemini-3-pro-preview"]),
        now=NOW,
    )
    text = "\n".join(model_inventory.render_check(result))
    text.encode("cp1252")  # raises UnicodeEncodeError if a glyph is unsafe
    assert "gpt-5-6" in text and "gemini-3-pro" in text


def test_render_reports_both_drift_kinds_as_failures_and_names_the_kind():
    cfg = _registry(
        **{
            "gpt-5-6": {"provider": "openai", "model_id": "gpt-5.6",
                        "is_enabled": True},
            "gemini-3-pro": {"provider": "google", "model_id": "gemini-3-pro",
                             "is_enabled": False},
        }
    )
    result = model_inventory.check_registry(
        cfg, _lock(openai=["gpt-5.6-sol"], google=["gemini-3-pro-preview"]),
        now=NOW,
    )
    text = "\n".join(model_inventory.render_check(result))
    assert text.count("[x] DRIFT") == 2
    assert "(routable," in text and "(identity-only," in text
    # The report must never claim success on a run that exits non-zero.
    assert "[ ] OK" not in text


def test_render_reports_ok_only_when_nothing_drifted():
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    result = model_inventory.check_registry(cfg, _lock(openai=["gpt-5.4"]), now=NOW)
    assert "[ ] OK" in "\n".join(model_inventory.render_check(result))


# ---------------------------------------------------------------------------
# The CLI
# ---------------------------------------------------------------------------


@pytest.fixture
def cli(monkeypatch, tmp_path):
    """Drive ``main()`` with an injected config and a tmp lockfile."""

    def run(config: dict, lock: dict | None, *argv: str):
        if lock is not None:
            model_inventory.write_lockfile(tmp_path / "test.lock", lock)
        monkeypatch.setattr(
            model_inventory, "_resolve_config", lambda path: config
        )
        return model_inventory.main(
            ["--lockfile", str(tmp_path / "test.lock"), *argv]
        )

    return run


def test_cli_check_exits_1_on_routable_drift(cli, capsys):
    cfg = _registry(**{"gpt-5-6": {
        "provider": "openai", "model_id": "gpt-5.6", "is_enabled": True,
    }})
    code = cli(cfg, _lock(openai=["gpt-5.6-sol"]), "--check")
    assert code == model_inventory.EXIT_DRIFT
    assert "gpt-5-6" in capsys.readouterr().err


def test_cli_check_exits_0_when_clean(cli, capsys):
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    assert cli(cfg, _lock(openai=["gpt-5.4"]), "--check") == model_inventory.EXIT_OK
    assert "[ ] OK" in capsys.readouterr().out


def test_cli_check_exits_2_when_the_lockfile_is_missing(cli, capsys):
    assert cli(_registry(), None, "--check") == model_inventory.EXIT_FATAL
    assert "--refresh" in capsys.readouterr().err


def test_cli_check_exits_1_on_identity_only_drift_with_no_flag_needed(cli, capsys):
    # The regression the close backstop caught: once Session 4 corrects the
    # routable gpt-5.6 specimen, a lenient default would exit 0 on a registry
    # that still names an id its provider does not offer.
    cfg = _registry(**{"gemini-3-pro": {
        "provider": "google", "model_id": "gemini-3-pro", "is_enabled": False,
    }})
    code = cli(cfg, _lock(google=["gemini-3-pro-preview"]), "--check")
    assert code == model_inventory.EXIT_DRIFT
    assert "gemini-3-pro" in capsys.readouterr().err


def test_cli_rejects_the_retired_strict_flag(cli):
    # --strict is gone: leniency was the defect, so there is no lenient mode
    # left for a flag to escape from.
    with pytest.raises(SystemExit):
        model_inventory.main(["--check", "--strict"])


def test_check_never_touches_the_network(cli, monkeypatch):
    def explode(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("--check opened an HTTP client")

    monkeypatch.setattr(model_inventory.httpx, "Client", explode)
    cfg = _registry(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4", "is_enabled": True,
    }})
    assert cli(cfg, _lock(openai=["gpt-5.4"]), "--check") == model_inventory.EXIT_OK


def test_cli_requires_a_mode():
    with pytest.raises(SystemExit):
        model_inventory.main([])


# ---------------------------------------------------------------------------
# The shipped lockfile — an integrity check on the committed artifact itself.
# It deliberately does NOT assert the repo's current drift state: Session 4 of
# this set fixes the registry, and a test that pins today's failure would have
# to be deleted to let the fix land.
# ---------------------------------------------------------------------------


def test_the_committed_lockfile_is_loadable_and_complete():
    lock = model_inventory.load_lockfile(model_inventory.DEFAULT_LOCKFILE_PATH)
    assert set(lock["providers"]) >= set(model_inventory.ENUMERATED_PROVIDERS)
    for provider in model_inventory.ENUMERATED_PROVIDERS:
        block = lock["providers"][provider]
        assert block["models"], f"{provider} snapshot is empty"
        assert block["model_count"] == len(block["models"])
        datetime.strptime(block["probed_at"], "%Y-%m-%dT%H:%M:%SZ")
        assert not any(m.startswith("models/") for m in block["models"])
