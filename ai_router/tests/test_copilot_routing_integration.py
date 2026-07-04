"""Tests for the copilot-cli transport profile's route()/verify() integration
(Set 078 Session 3).

Covers: catalog-role resolution for the generator, the verifier provenance
rule (fail-closed to "verification unavailable", including the loud
same-provider-only case), the hard invocation breaker, and the cost-keyed
guard-exclusion predicate. Never invokes the real Copilot CLI or the real
lockfile — every dispatch goes through a fake transport object, and the
catalog is built directly via its dataclasses (mirrors the fake-spawner
convention in test_cli_transport.py / test_copilot_catalog.py).
"""
from __future__ import annotations

import copy
from typing import Optional

import pytest

import ai_router
from copilot_catalog import (  # noqa: E402  (conftest puts ai_router/ on sys.path)
    Catalog,
    CatalogMeta,
    ENABLEMENT_CONFIRMED,
    ENABLEMENT_UNCONFIRMED,
    ModelEntry,
)
from verification import (  # noqa: E402
    CopilotCliVerifierSelection,
    ProvenanceUnavailable,
    pick_copilot_cli_verifier,
)


# ---------------------------------------------------------------------------
# Fixtures: a fake catalog + a fake transport, mirroring the injected-spawner
# convention already used for the real CLI state machine.
# ---------------------------------------------------------------------------

def _make_catalog() -> Catalog:
    meta = CatalogMeta(
        schema_version=1,
        cli_name="GitHub Copilot CLI",
        cli_version="1.0.68",
        cli_version_pin_required=True,
        seat_id="test-seat",
        seat_label="test",
        source="empirical-probe",
        probed_at="2026-07-04T00:00:00Z",
    )
    models = [
        ModelEntry(id="claude-sonnet-4.6", provider="anthropic",
                   enablement=ENABLEMENT_CONFIRMED),
        ModelEntry(id="claude-haiku-4.5", provider="anthropic",
                   enablement=ENABLEMENT_CONFIRMED),
        ModelEntry(id="gpt-5.4", provider="openai",
                   enablement=ENABLEMENT_CONFIRMED),
        ModelEntry(id="gemini-3.1-pro-preview", provider="google",
                   enablement=ENABLEMENT_UNCONFIRMED),
    ]
    return Catalog(meta=meta, models=models)


def _base_config() -> dict:
    return {
        "transport": {"profile": "copilot-cli"},
        "transports": {
            "copilot-cli": {
                "lockfile": "fake.lock",
                "billed_usage_unavailable": True,
                "max_invocations_per_session": 10,
                "roles": {
                    "generator": {
                        "prefer": ["claude-sonnet-4.6"],
                        "require_provider_in": ["anthropic", "openai", "google"],
                    },
                    "verifier": {
                        "prefer": ["gpt-5.4", "claude-sonnet-4.6"],
                        "require_provider_in": ["anthropic", "openai", "google"],
                    },
                },
            },
        },
        "verification": {"enabled": True, "auto_verify_task_types": ["general"]},
        "metrics": {"enabled": False},
    }


def _ok_result(content: str = "Generated content", input_tokens: int = 0,
               output_tokens: int = 10):
    return ai_router.cli_transport.TransportResult(
        content=content,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        stop_reason="end_turn",
        usage_authoritative=False,
        finish_reason_known=True,
        content_complete=True,
        partial_output_discarded=False,
        raw_stdout=content,
        raw_stderr="",
        transport_metadata={"error_class": None},
    )


def _error_result(error_class: str = "generic-unknown", raw_stderr: str = "boom"):
    return ai_router.cli_transport.TransportResult(
        content="",
        input_tokens=0,
        output_tokens=0,
        stop_reason=f"error:{error_class}",
        usage_authoritative=False,
        finish_reason_known=False,
        content_complete=False,
        partial_output_discarded=False,
        raw_stdout="",
        raw_stderr=raw_stderr,
        transport_metadata={"error_class": error_class, "exit_code": 1},
    )


class FakeTransport:
    """Pops canned TransportResults off a queue, in call order."""

    def __init__(self, results=None):
        self.results = list(results or [])
        self.dispatch_calls: list[dict] = []

    def dispatch(self, *, model_id, system_prompt, user_message):
        self.dispatch_calls.append({
            "model_id": model_id,
            "system_prompt": system_prompt,
            "user_message": user_message,
        })
        if not self.results:
            raise AssertionError("FakeTransport received an unexpected dispatch call")
        return self.results.pop(0)


@pytest.fixture
def copilot_env(monkeypatch):
    """Wire ai_router's module globals for the copilot-cli profile without
    ever touching _init(), the real lockfile, or a real subprocess."""
    monkeypatch.setattr(ai_router, "_init", lambda: None)
    config = _base_config()
    monkeypatch.setattr(ai_router, "_config", config)
    monkeypatch.setattr(ai_router, "_copilot_catalog", _make_catalog())
    monkeypatch.setattr(ai_router, "_copilot_invocation_count", 0)
    transport = FakeTransport()
    monkeypatch.setattr(ai_router, "_copilot_transport", transport)
    return transport, config


# ---------------------------------------------------------------------------
# route() under the copilot-cli profile
# ---------------------------------------------------------------------------

class TestRouteCopilotCli:
    def test_happy_path_dispatches_generator_role(self, copilot_env):
        transport, _config = copilot_env
        transport.results = [_ok_result(content="hello world")]

        result = ai_router.route(content="do a thing", task_type="something-else")

        assert result.content == "hello world"
        assert result.model_id == "claude-sonnet-4.6"
        assert result.model_name == "claude-sonnet-4.6"
        assert result.cost_usd == 0.0
        assert result.total_cost_usd == 0.0
        assert result.tier == 0
        assert result.escalated is False
        assert ai_router._copilot_invocation_count == 1
        assert transport.dispatch_calls[0]["model_id"] == "claude-sonnet-4.6"

    def test_generator_resolution_failure_raises_before_any_dispatch(
        self, copilot_env
    ):
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["roles"]["generator"]["prefer"] = [
            "no-such-model"
        ]

        with pytest.raises(
            ai_router.CopilotCliRoutingError, match="could not resolve a generator role"
        ):
            ai_router.route(content="x", task_type="general")

        assert transport.dispatch_calls == []
        assert ai_router._copilot_invocation_count == 0

    def test_generator_skips_unconfirmed_catalog_entries(self, copilot_env):
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["roles"]["generator"]["prefer"] = [
            "gemini-3.1-pro-preview",  # unconfirmed -- must be skipped
            "claude-sonnet-4.6",
        ]
        transport.results = [_ok_result()]

        result = ai_router.route(content="x", task_type="something-else")
        assert result.model_id == "claude-sonnet-4.6"

    def test_dispatch_failure_raises_and_still_counts_the_invocation(
        self, copilot_env
    ):
        transport, _config = copilot_env
        transport.results = [_error_result(error_class="auth-class")]

        with pytest.raises(
            ai_router.CopilotCliRoutingError, match="Copilot CLI dispatch failed"
        ):
            ai_router.route(content="x", task_type="general")

        # The spawn happened (and is breaker-counted) even though it failed.
        assert ai_router._copilot_invocation_count == 1

    def test_auto_verify_runs_verifier_on_a_distinct_provider(self, copilot_env):
        transport, _config = copilot_env
        transport.results = [
            _ok_result(content="generated"),
            _ok_result(content="VERIFIED"),
        ]

        result = ai_router.route(content="x", task_type="general")

        assert result.verification is not None
        assert result.verification.verdict == "VERIFIED"
        assert result.verification.verified is True
        assert result.verification.verifier_model == "gpt-5.4"
        assert result.verification.verifier_provider == "openai"
        assert result.verification.generator_provider == "anthropic"
        assert result.total_cost_usd == 0.0
        assert ai_router._copilot_invocation_count == 2
        assert [c["model_id"] for c in transport.dispatch_calls] == [
            "claude-sonnet-4.6", "gpt-5.4",
        ]

    def test_auto_verify_fails_closed_when_only_same_provider_survives(
        self, copilot_env
    ):
        """The 'loud same-provider failure' case: misconfigure the verifier
        role so every candidate that survives resolves to the generator's own
        provider. route() must never silently self-verify -- it records
        'verification_unavailable' and makes exactly one dispatch (the
        generator's), never a second same-provider call."""
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["roles"]["verifier"] = {
            "prefer": ["claude-haiku-4.5"],
            "require_provider_in": ["anthropic"],
        }
        transport.results = [_ok_result(content="generated")]

        result = ai_router.route(content="x", task_type="general")

        assert result.verification is not None
        assert result.verification.verdict == "verification_unavailable"
        assert result.verification.verified is False
        assert result.verification.blocking is False
        assert ai_router._copilot_invocation_count == 1
        assert len(transport.dispatch_calls) == 1

    def test_no_auto_verify_for_non_auto_verify_task_type(self, copilot_env):
        transport, _config = copilot_env
        transport.results = [_ok_result()]

        result = ai_router.route(content="x", task_type="something-else")
        assert result.verification is None
        assert len(transport.dispatch_calls) == 1


# ---------------------------------------------------------------------------
# verify() under the copilot-cli profile
# ---------------------------------------------------------------------------

class TestVerifyCopilotCli:
    def _route_result(self, model_name="claude-sonnet-4.6", model_id=None):
        return ai_router.RouteResult(
            content="generated content",
            model_name=model_name,
            model_id=model_id if model_id is not None else model_name,
            tier=0,
            input_tokens=0,
            output_tokens=10,
            cost_usd=0.0,
            total_cost_usd=0.0,
            complexity_score=-1,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=1.0,
        )

    def test_verify_happy_path(self, copilot_env):
        transport, _config = copilot_env
        transport.results = [_ok_result(content="VERIFIED")]

        result = ai_router.verify(self._route_result(), original_task="do a thing")

        assert result.verdict == "VERIFIED"
        assert result.verifier_model == "gpt-5.4"
        assert result.generator_provider == "anthropic"
        assert ai_router._copilot_invocation_count == 1

    def test_verify_fails_closed_for_a_model_id_absent_from_the_catalog(
        self, copilot_env
    ):
        """Round-3 session-verification finding: a model_id NOT in the
        catalog must fail closed even when it happens to match a known
        provider name-prefix (e.g. "gpt-5.5") -- the prefix heuristic is
        trustworthy only for a catalog entry Session 2's discover_catalog
        actually confirmed by dispatching it; a bare untracked string gets
        no such confirmation and must never drive a same-provider safety
        exclusion on a guess alone."""
        transport, _config = copilot_env

        result = ai_router.verify(
            self._route_result(model_name="gpt-5.5"), original_task="x"
        )
        assert result.verdict == "verification_unavailable"
        assert "could not resolve a provider" in result.raw_response
        assert transport.dispatch_calls == []

    def test_verify_trusts_model_id_over_a_mismatched_model_name(
        self, copilot_env
    ):
        """Round-2 session-verification finding: a hand-constructed
        RouteResult with model_id/model_name deliberately out of sync must
        not let the WRONG (model_name-derived) provider drive the
        same-provider exclusion. model_id is this module's own canonical
        identifier and must win."""
        transport, _config = copilot_env
        transport.results = [_ok_result(content="VERIFIED")]

        result = ai_router.verify(
            self._route_result(model_id="claude-sonnet-4.6", model_name="gpt-5.5"),
            original_task="x",
        )
        # Derived from model_id ("claude-sonnet-4.6" -> anthropic), NOT from
        # the mismatched model_name ("gpt-5.5" -> openai).
        assert result.generator_provider == "anthropic"
        assert result.verifier_provider != "anthropic"

    def test_verify_returns_unavailable_on_dispatch_failure(self, copilot_env):
        transport, _config = copilot_env
        transport.results = [_error_result(error_class="quota-rate-class")]

        result = ai_router.verify(self._route_result(), original_task="x")

        assert result.verdict == "verification_unavailable"
        assert "verifier dispatch failed" in result.raw_response

    def test_verify_fails_closed_when_generator_provider_is_unresolvable(
        self, copilot_env
    ):
        """Session-verification finding, Set 078 S3: a model name matching no
        known prefix and absent from the catalog must fail closed to
        "verification unavailable" rather than proceeding with an empty
        provider guess that excludes nothing real -- which could otherwise
        let a same-provider "verification" slip through undetected."""
        transport, _config = copilot_env

        result = ai_router.verify(
            self._route_result(model_name="totally-unknown-model"),
            original_task="x",
        )

        assert result.verdict == "verification_unavailable"
        assert "could not resolve a provider" in result.raw_response
        # No dispatch was attempted at all -- fails closed before ever
        # picking a verifier candidate.
        assert transport.dispatch_calls == []
        assert ai_router._copilot_invocation_count == 0

    def test_verify_uses_the_configured_verification_template(self, copilot_env):
        """Session-verification finding, Set 078 S3 (adjudicated false
        positive): the reviewer suspected _verification_template is never
        populated in this diff. It IS populated -- by the existing,
        unmodified ai_router/config.py's load_config() (line ~282), into
        the same _config object both the api-path and copilot-cli-path
        read. This test proves the copilot-cli verifier prompt actually
        carries a configured template's content end-to-end."""
        transport, config = copilot_env
        config["_verification_template"] = (
            "CUSTOM TEMPLATE MARKER -- task: {original_task} "
            "response: {original_response}"
        )
        transport.results = [_ok_result(content="VERIFIED")]

        ai_router.verify(self._route_result(), original_task="do the thing")

        sent_prompt = transport.dispatch_calls[0]["user_message"]
        assert "CUSTOM TEMPLATE MARKER" in sent_prompt
        assert "do the thing" in sent_prompt
        assert ai_router._copilot_invocation_count == 1


# ---------------------------------------------------------------------------
# _resolve_copilot_generator (pure, no transport involved)
# ---------------------------------------------------------------------------

class TestResolveCopilotGenerator:
    def test_resolves_first_confirmed_prefer_entry(self):
        config = _base_config()
        model_id, provider, reason = ai_router._resolve_copilot_generator(
            config, _make_catalog()
        )
        assert (model_id, provider, reason) == ("claude-sonnet-4.6", "anthropic", None)

    def test_fails_closed_when_require_provider_in_excludes_every_survivor(self):
        config = _base_config()
        config["transports"]["copilot-cli"]["roles"]["generator"][
            "require_provider_in"
        ] = ["google"]  # claude-sonnet-4.6's provider is anthropic
        model_id, provider, reason = ai_router._resolve_copilot_generator(
            config, _make_catalog()
        )
        assert model_id is None
        assert provider is None
        assert "require_provider_in" in reason

    def test_fails_closed_when_nothing_in_prefer_list_matches(self):
        config = _base_config()
        config["transports"]["copilot-cli"]["roles"]["generator"]["prefer"] = [
            "no-such-model"
        ]
        model_id, provider, reason = ai_router._resolve_copilot_generator(
            config, _make_catalog()
        )
        assert model_id is None
        assert "no confirmed catalog entry" in reason


# ---------------------------------------------------------------------------
# pick_copilot_cli_verifier -- the verifier provenance rule
# ---------------------------------------------------------------------------

class TestPickCopilotCliVerifier:
    def test_resolves_a_distinct_provider(self):
        config = _base_config()
        result = pick_copilot_cli_verifier(
            generator_provider="anthropic", config=config, catalog=_make_catalog(),
        )
        assert isinstance(result, CopilotCliVerifierSelection)
        assert result.model_id == "gpt-5.4"
        assert result.provider == "openai"

    def test_skips_a_same_provider_prefer_entry_before_a_later_survivor(self):
        config = _base_config()
        config["transports"]["copilot-cli"]["roles"]["verifier"]["prefer"] = [
            "claude-haiku-4.5",  # same provider as the generator -- must skip
            "gpt-5.4",
        ]
        result = pick_copilot_cli_verifier(
            generator_provider="anthropic", config=config, catalog=_make_catalog(),
        )
        assert isinstance(result, CopilotCliVerifierSelection)
        assert result.model_id == "gpt-5.4"

    def test_fails_loud_when_only_same_provider_entries_survive(self):
        """The load-bearing 'loud same-provider failure' case: even if the
        prefer list / require_provider_in only ever resolves to the
        generator's own provider, pick_copilot_cli_verifier must return
        ProvenanceUnavailable -- never a same-provider selection."""
        config = _base_config()
        config["transports"]["copilot-cli"]["roles"]["verifier"] = {
            "prefer": ["claude-haiku-4.5"],
            "require_provider_in": ["anthropic"],
        }
        result = pick_copilot_cli_verifier(
            generator_provider="anthropic", config=config, catalog=_make_catalog(),
        )
        assert isinstance(result, ProvenanceUnavailable)
        assert "distinct from the generator" in result.reason

    def test_respects_exclude_providers(self):
        config = _base_config()
        # Only openai (gpt-5.4) would otherwise survive; excluding it too
        # must fail closed rather than falling back to the generator's own
        # provider.
        result = pick_copilot_cli_verifier(
            generator_provider="anthropic", config=config, catalog=_make_catalog(),
            exclude_providers=frozenset({"openai"}),
        )
        assert isinstance(result, ProvenanceUnavailable)

    def test_never_returns_an_unconfirmed_entry(self):
        config = _base_config()
        config["transports"]["copilot-cli"]["roles"]["verifier"] = {
            "prefer": ["gemini-3.1-pro-preview"],  # unconfirmed in the fixture
            "require_provider_in": ["google"],
        }
        result = pick_copilot_cli_verifier(
            generator_provider="anthropic", config=config, catalog=_make_catalog(),
        )
        assert isinstance(result, ProvenanceUnavailable)


def test_build_verification_unavailable_stub_shape():
    result = ai_router._build_verification_unavailable_stub(
        generator_model_id="claude-sonnet-4.6",
        generator_provider="anthropic",
        reason="no eligible verifier",
    )
    assert result.verdict == "verification_unavailable"
    assert result.verified is False
    assert result.blocking is False
    assert result.issues == []
    assert result.nits == []
    assert result.generator_model == "claude-sonnet-4.6"
    assert result.generator_provider == "anthropic"
    assert "no eligible verifier" in result.raw_response


# ---------------------------------------------------------------------------
# The hard invocation breaker
# ---------------------------------------------------------------------------

class TestInvocationBreaker:
    def test_trips_before_the_configured_ceiling_is_exceeded(self, copilot_env):
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["max_invocations_per_session"] = 1
        transport.results = [_ok_result()]

        ai_router.route(content="first", task_type="something-else")
        assert ai_router._copilot_invocation_count == 1

        with pytest.raises(ai_router.InvocationBreakerTripped):
            ai_router.route(content="second", task_type="something-else")

        # The tripped call never reached the transport at all.
        assert len(transport.dispatch_calls) == 1
        assert ai_router._copilot_invocation_count == 1

    def test_none_ceiling_means_unlimited(self, copilot_env):
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["max_invocations_per_session"] = None
        transport.results = [_ok_result(), _ok_result()]

        ai_router.route(content="a", task_type="something-else")
        ai_router.route(content="b", task_type="something-else")
        assert ai_router._copilot_invocation_count == 2

    def test_breaker_is_a_subclass_of_the_routing_error(self):
        assert issubclass(
            ai_router.InvocationBreakerTripped, ai_router.CopilotCliRoutingError
        )

    def test_breaker_tripped_during_auto_verify_degrades_gracefully(
        self, copilot_env
    ):
        """The breaker trips on the AUTO-VERIFY dispatch, not the generator's
        -- the already-successful generation must survive, reported as
        'verification unavailable' rather than raised out of route()."""
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["max_invocations_per_session"] = 1
        transport.results = [_ok_result(content="generated")]

        result = ai_router.route(content="x", task_type="general")

        assert result.content == "generated"
        assert result.verification is not None
        assert result.verification.verdict == "verification_unavailable"
        assert "invocation breaker tripped" in result.verification.raw_response
        assert ai_router._copilot_invocation_count == 1
        assert len(transport.dispatch_calls) == 1


# ---------------------------------------------------------------------------
# Cost-keyed guard exclusions (design lock Section 5)
# ---------------------------------------------------------------------------

class TestCostGuardExclusions:
    @pytest.mark.parametrize("guard", [
        ai_router.GUARD_DOLLAR_SPEND_BUDGET,
        ai_router.GUARD_TOKEN_COST_ESTIMATE,
        ai_router.GUARD_PROVIDER_PRICE_TABLE_ESTIMATE,
        ai_router.GUARD_QUOTA_BALANCE_PREFLIGHT,
    ])
    def test_api_profile_never_skips(self, guard):
        decision = ai_router.evaluate_cost_guard(guard, {"transport": {"profile": "api"}})
        assert decision.skip is False
        assert decision.guard == guard

    @pytest.mark.parametrize("guard", [
        ai_router.GUARD_DOLLAR_SPEND_BUDGET,
        ai_router.GUARD_TOKEN_COST_ESTIMATE,
        ai_router.GUARD_PROVIDER_PRICE_TABLE_ESTIMATE,
        ai_router.GUARD_QUOTA_BALANCE_PREFLIGHT,
    ])
    def test_copilot_cli_profile_skips_when_billed_usage_unavailable(self, guard):
        config = _base_config()
        decision = ai_router.evaluate_cost_guard(guard, config)
        assert decision.skip is True
        assert "billed_usage_unavailable" in decision.reason

    def test_copilot_cli_profile_skips_when_key_is_absent(self):
        """billed_usage_unavailable is this profile's defining property --
        an absent key must default to "unavailable" (skip), not the
        opposite. Regression for a code-review-caught inverted default."""
        config = _base_config()
        del config["transports"]["copilot-cli"]["billed_usage_unavailable"]
        decision = ai_router.evaluate_cost_guard(
            ai_router.GUARD_TOKEN_COST_ESTIMATE, config
        )
        assert decision.skip is True

    def test_copilot_cli_profile_does_not_skip_when_operator_opts_out(self):
        """billed_usage_unavailable: false is a real, if unusual, operator
        override -- the guard must not skip in that case."""
        config = _base_config()
        config["transports"]["copilot-cli"]["billed_usage_unavailable"] = False
        decision = ai_router.evaluate_cost_guard(
            ai_router.GUARD_TOKEN_COST_ESTIMATE, config
        )
        assert decision.skip is False

    def test_unknown_guard_raises(self):
        with pytest.raises(ValueError, match="Unknown cost-keyed guard"):
            ai_router.evaluate_cost_guard("not-a-real-guard", _base_config())

    def test_run_verification_via_copilot_cli_refuses_a_misconfigured_opt_out(
        self, copilot_env
    ):
        """If an operator sets billed_usage_unavailable: false under the
        copilot-cli profile, the verifier path must fail loud rather than
        silently proceeding as if cost estimation were meaningful."""
        transport, config = copilot_env
        config["transports"]["copilot-cli"]["billed_usage_unavailable"] = False
        transport.results = [_ok_result(content="generated")]

        with pytest.raises(
            ai_router.CopilotCliRoutingError,
            match="did not skip under the copilot-cli profile",
        ):
            ai_router.route(content="x", task_type="general")
