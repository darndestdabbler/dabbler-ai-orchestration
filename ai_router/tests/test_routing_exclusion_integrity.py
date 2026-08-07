"""Set 109 S2 — an excluded provider never receives a request, on any path.

The defect these pin: ``route()`` treated ``exclude_providers`` as a hard
constraint for its OWN model pick and then dropped it when dispatching the
secondary calls it makes on the caller's behalf. Traced against the live
registry, a single ``route(task_type="architecture",
exclude_providers=["anthropic"])`` issued two real HTTPS POSTs — the second to
``api.anthropic.com`` for ``claude-opus-4-8``, at five times the cost of the
generator call it was verifying.

Two surfaces are asserted throughout, because they answer different questions:

  * the **call trace** says which requests were actually issued, and
  * the **metrics rows** say what the router wrote down about itself.

Set 109 S1 established that these can disagree; the spec's two competing
hypotheses (a real second call vs. a duplicated row) were distinguishable only
by checking both. So every integration test here checks both.

Assertions are written against the INVARIANT ("nothing from the excluded
provider"), never against which model happens to win. Session 4 re-points
``opus``/``sonnet``, splits ``gpt-5-6``, and adds Fable 5 — a test that pinned
today's winner would fail on a registry change that is not a defect.

No test in this file opens a socket: ``httpx.Client`` is replaced inside
``providers`` so the real provider callers still run, which is what makes the
trace fire through the production seam rather than around it.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

import ai_router
from call_trace import (  # noqa: E402  (conftest puts ai_router/ on sys.path)
    HttpCall,
    record_http_request,
    trace_provider_calls,
)


EXCLUDED = "anthropic"


# ---------------------------------------------------------------------------
# call_trace itself
# ---------------------------------------------------------------------------

class TestCallTrace:
    def test_records_provider_and_wire_model_id(self):
        with trace_provider_calls() as calls:
            record_http_request("openai", "gpt-5.4")
        assert calls == [HttpCall(provider="openai", model_id="gpt-5.4")]

    def test_is_a_no_op_outside_a_scope(self):
        # Must not raise, and must not accumulate anywhere.
        record_http_request("openai", "gpt-5.4")
        with trace_provider_calls() as calls:
            pass
        assert calls == []

    def test_scope_does_not_leak_after_it_closes(self):
        with trace_provider_calls() as first:
            record_http_request("openai", "a")
        record_http_request("openai", "b")
        assert [c.model_id for c in first] == ["a"]

    def test_scope_is_reset_even_when_the_body_raises(self):
        with pytest.raises(ValueError):
            with trace_provider_calls():
                record_http_request("openai", "a")
                raise ValueError("boom")
        # A leaked ContextVar token would make this capture the next call.
        record_http_request("openai", "b")
        with trace_provider_calls() as after:
            record_http_request("openai", "c")
        assert [x.model_id for x in after] == ["c"]

    def test_nested_scopes_do_not_bleed_into_each_other(self):
        with trace_provider_calls() as outer:
            record_http_request("openai", "outer-1")
            with trace_provider_calls() as inner:
                record_http_request("google", "inner-1")
            record_http_request("openai", "outer-2")
        assert [c.model_id for c in inner] == ["inner-1"]
        assert [c.model_id for c in outer] == ["outer-1", "outer-2"]

    def test_counts_a_retry_as_its_own_request(self, api_env):
        """``call_model`` wraps a retry loop, so announcing above the loop
        would undercount exactly the requests most worth seeing."""
        env = api_env
        env.fail_next(2)  # two 500s, then success
        provider_cfg = dict(ai_router._config["providers"]["openai"])
        provider_cfg["retry"] = {"max_retries": 2, "backoff_base_seconds": 0}

        with trace_provider_calls() as calls:
            ai_router.call_model(
                provider_name="openai",
                model_id="gpt-5.4",
                system_prompt="s",
                user_message="u",
                max_tokens=16,
                config=provider_cfg,
            )
        assert len(calls) == 3
        assert {c.provider for c in calls} == {"openai"}


# ---------------------------------------------------------------------------
# A live-registry harness: real config, real provider callers, fake sockets.
# ---------------------------------------------------------------------------

class _ApiEnv:
    #: Reported output tokens. The escalation heuristic fires below
    #: ``escalation.triggers.min_output_tokens`` (30 in the shipping config),
    #: so the default is comfortably above it: a test asserting an exact
    #: request count must not silently be counting an escalation. The
    #: escalation-documenting test lowers it on purpose.
    output_tokens = 200

    def __init__(self, metrics_path: Path):
        self.metrics_path = metrics_path
        self._failures = 0
        self.requests: list[str] = []

    def fail_next(self, n: int) -> None:
        self._failures = n

    def force_escalation(self) -> None:
        """Report a response short enough to trip the escalation trigger."""
        self.output_tokens = 5

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(str(request.url))
        if self._failures > 0:
            self._failures -= 1
            return httpx.Response(500, json={"error": "synthetic"})
        host = request.url.host
        text = "VERIFIED\n\nlooks fine"
        out = self.output_tokens
        if "anthropic" in host:
            return httpx.Response(200, json={
                "model": "claude-opus-4-8",
                "content": [{"type": "text", "text": text}],
                "usage": {"input_tokens": 10, "output_tokens": out},
                "stop_reason": "end_turn",
            })
        if "googleapis" in host:
            return httpx.Response(200, json={
                "modelVersion": "gemini-2.5-pro",
                "candidates": [{
                    "content": {"parts": [{"text": text}]},
                    "finishReason": "STOP",
                }],
                "usageMetadata": {
                    "promptTokenCount": 10, "candidatesTokenCount": out,
                },
            })
        return httpx.Response(200, json={
            "model": "gpt-5.4-2026-03-05",
            "output_text": text,
            "usage": {"input_tokens": 10, "output_tokens": out},
            "status": "completed",
        })

    def rows(self) -> list[dict]:
        if not self.metrics_path.exists():
            return []
        out = []
        for line in self.metrics_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                out.append(json.loads(line))
        return out


@pytest.fixture
def api_env(monkeypatch, tmp_path, direct_api_transport):
    """The real router-config.yaml and the real provider callers, with every
    socket replaced. Using the live registry is deliberate: the invariant is a
    property of the SHIPPING configuration, not of a hand-built fixture that
    could drift away from it.

    ``direct_api_transport`` (Set 111 S2) supplies that shipping config from
    a scratch directory and sets placeholder keys, so a Copilot-CLI seat's
    ``local-overrides.yaml`` cannot redirect these calls into the real CLI —
    which used to make every test here hang until the CLI's total-timeout.
    """
    metrics_path = tmp_path / "router-metrics.jsonl"
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))

    # Force a clean config load so the env vars above are in effect and no
    # earlier test's patched config leaks in.
    monkeypatch.setattr(ai_router, "_config", None)
    monkeypatch.setattr(ai_router, "_rate_limiters", {})
    ai_router._init()

    env = _ApiEnv(metrics_path)

    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop("timeout", None)
        return real_client(
            transport=httpx.MockTransport(env.handle), **kwargs
        )

    monkeypatch.setattr(ai_router.providers.httpx, "Client", factory)

    # Rate limiters would otherwise sleep between the generator and verifier
    # calls; the invariant under test has nothing to do with pacing.
    for limiter in ai_router._rate_limiters.values():
        monkeypatch.setattr(limiter, "wait", lambda: None)

    # ``_config`` / ``_rate_limiters`` are module globals that ``_init()``
    # repopulates above; monkeypatch restores the pre-test values on teardown,
    # so this fixture leaves no config behind for the next test.
    yield env


def _auto_verify_task_type() -> str:
    """A task type the shipping config auto-verifies, so the secondary call
    under test actually happens. Read from config rather than hardcoded: the
    list is operator-tunable and a hardcoded name would silently stop
    exercising the branch if it were retitled."""
    types = (
        ai_router._config.get("verification", {}) or {}
    ).get("auto_verify_task_types") or []
    assert types, "config declares no auto_verify_task_types to exercise"
    return types[0]


class TestExcludedProviderNeverCalled:
    """The invariant, end to end, through the real selection code."""

    @pytest.mark.parametrize("complexity_hint", [None, 90])
    def test_no_excluded_provider_in_trace_or_rows(
        self, api_env, complexity_hint
    ):
        """The tier-2 shape: a verifier on a PERMITTED provider still exists,
        so auto-verification still happens — it just cannot land on the
        barred one. Exact counts are asserted (the spec's Ends-with wants the
        call count asserted, not merely known); a bare "none of them are
        Anthropic" would also pass if the branch had been disabled outright.
        """
        with trace_provider_calls() as calls:
            result = ai_router.route(
                content="Design a routing layer. " * 200,
                task_type="architecture",
                exclude_providers=[EXCLUDED],
                complexity_hint=complexity_hint,
            )

        assert [c for c in calls if c.provider == EXCLUDED] == [], (
            "a real HTTPS request went to the excluded provider"
        )
        rows = api_env.rows()
        assert [r for r in rows if r.get("provider") == EXCLUDED] == [], (
            "a metrics row records the excluded provider"
        )
        # One generator request + one verifier request, and one row each.
        assert len(calls) == 2, [(c.provider, c.model_id) for c in calls]
        assert len(rows) == 2, rows
        assert result.verification is not None
        assert result.verification.verifier_provider != EXCLUDED

    def test_tier3_declines_to_verify_rather_than_crossing_the_exclusion(
        self, api_env
    ):
        """The tier-3 shape, and the behaviour change this session
        introduces. Rule 1 already bars the generator's own provider and the
        tier-distance rule admits only tiers 3-4, so with Anthropic excluded
        NO verifier survives. Pre-fix this call issued two requests, the
        second to the barred provider; it must now issue exactly one and come
        back unverified."""
        with trace_provider_calls() as calls:
            result = ai_router.route(
                content="Design a distributed architecture. " * 400,
                task_type="architecture",
                exclude_providers=[EXCLUDED],
            )
        assert result.complexity_score > 65, (
            "prompt did not reach tier 3 — the scenario is not being exercised"
        )
        assert len(calls) == 1, [(c.provider, c.model_id) for c in calls]
        assert len(api_env.rows()) == 1
        assert result.verification is None

    def test_the_router_never_records_a_call_it_did_not_make(self, api_env):
        """Set 109 S1 showed a row is a claim, not an observation.

        The tempting assertion here — one row per request — is FALSE, and
        writing it is how this test earned its keep: an escalation issues a
        second request (a different provider's model, after the first
        response tripped the short-response heuristic) and collapses both
        into ONE row, by design. A retry does the same. So requests are a
        superset of rows, and the honest invariant is directional: every
        provider the router wrote down must be one it actually called.

        The reverse containment is deliberately not asserted — an escalated
        call really does contact a provider that no row names, and that is
        the escalation feature working, not a bookkeeping fault.
        """
        api_env.force_escalation()
        with trace_provider_calls() as calls:
            ai_router.route(
                content="Design a routing layer. " * 200,
                task_type="architecture",
                exclude_providers=[EXCLUDED],
            )
        # The scenario this test exists to document: more requests than rows.
        assert len(calls) > 1
        rows = api_env.rows()
        assert rows, "no metrics rows were written — harness is wrong"
        assert len(calls) >= len(rows)
        recorded = {r.get("provider") for r in rows}
        issued = {c.provider for c in calls}
        assert recorded <= issued, (
            f"rows name providers that were never called: {recorded - issued}"
        )

    def test_an_unexcluded_call_still_auto_verifies(self, api_env):
        """Guards against 'fixing' the leak by disabling auto-verification:
        with no exclusion in play the second call must still happen, or the
        regression test above would pass for the wrong reason."""
        task_type = _auto_verify_task_type()
        with trace_provider_calls() as calls:
            result = ai_router.route(
                content="Review this. " * 200,
                task_type=task_type,
            )
        assert len(calls) >= 2, (
            "auto-verification stopped happening entirely"
        )
        assert result.verification is not None


class TestRunVerificationHonoursTheCallerExclusion:
    def test_returns_none_rather_than_calling_the_excluded_provider(
        self, api_env
    ):
        """When the exclusion leaves no eligible verifier, declining is the
        correct outcome: this is a courtesy pass on an ordinary routed call,
        and route() already treats None as 'no verification happened'."""
        generator = ai_router.RouteResult(
            content="some answer",
            model_name=_a_model_on_provider("openai"),
            model_id="gpt-5.4",
            tier=3,
            input_tokens=10,
            output_tokens=10,
            cost_usd=1.0,
            total_cost_usd=1.0,
            complexity_score=70,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=0.1,
            truncated=False,
            verification=None,
        )
        with trace_provider_calls() as calls:
            out = ai_router._run_verification(
                route_result=generator,
                original_task="t",
                task_type="architecture",
                exclude_providers=[EXCLUDED],
            )
        assert out is None
        assert calls == []

    def test_without_the_exclusion_the_same_call_does_verify(self, api_env):
        """The paired positive: proves the None above comes from the
        exclusion and not from a broken fixture."""
        generator = ai_router.RouteResult(
            content="some answer",
            model_name=_a_model_on_provider("openai"),
            model_id="gpt-5.4",
            tier=3,
            input_tokens=10,
            output_tokens=10,
            cost_usd=1.0,
            total_cost_usd=1.0,
            complexity_score=70,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=0.1,
            truncated=False,
            verification=None,
        )
        with trace_provider_calls() as calls:
            out = ai_router._run_verification(
                route_result=generator,
                original_task="t",
                task_type="architecture",
            )
        assert out is not None
        assert len(calls) == 1


def _a_model_on_provider(provider: str) -> str:
    """Any enabled tier-3 model on *provider*, read from the live registry."""
    for name, cfg in (ai_router._config.get("models") or {}).items():
        if (
            isinstance(cfg, dict)
            and cfg.get("provider") == provider
            and cfg.get("tier") == 3
            and cfg.get("is_enabled", True)
        ):
            return name
    raise AssertionError(f"no enabled tier-3 {provider} model in the registry")


# ---------------------------------------------------------------------------
# The tiebreaker sibling (L-069-1): a THIRD call, on a hardcoded default.
# ---------------------------------------------------------------------------

class TestTiebreakerHonoursTheExclusion:
    """``settings.tiebreaker_model`` defaults to ``opus`` — an Anthropic
    model read straight from config with no exclusion check. The path is
    currently unreachable (no configured ``on_disagreement`` is
    ``re-route``), so these drive ``_tiebreaker_reroute`` directly rather
    than pretending the config reaches it."""

    def _verification(self):
        return ai_router.VerificationResult(
            verdict="REJECTED",
            verified=False,
            issues=[],
            verifier_model="v",
            verifier_provider="google",
            generator_model="g",
            generator_provider="openai",
            verifier_input_tokens=1,
            verifier_output_tokens=1,
            verifier_cost_usd=0.0,
            raw_response="disagreement",
            blocking=True,
            nits=[],
        )

    def _route_result(self):
        return ai_router.RouteResult(
            content="original answer",
            model_name=_a_model_on_provider("openai"),
            model_id="gpt-5.4",
            tier=3,
            input_tokens=10,
            output_tokens=10,
            cost_usd=1.0,
            total_cost_usd=1.0,
            complexity_score=70,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=0.1,
            truncated=False,
            verification=None,
        )

    def test_excluded_tiebreaker_degrades_to_merge_without_calling_out(
        self, api_env
    ):
        v_config = ai_router._config.get("verification", {})
        tiebreaker = (v_config.get("settings") or {}).get(
            "tiebreaker_model", "opus"
        )
        tb_provider = ai_router._config["models"][tiebreaker]["provider"]

        with trace_provider_calls() as calls:
            out = ai_router._tiebreaker_reroute(
                self._route_result(), "task", "architecture",
                self._verification(), v_config,
                exclude_providers=[tb_provider],
            )
        assert calls == [], "the tiebreaker called the excluded provider"
        # Degraded to the pre-existing merge branch, not silently dropped.
        assert "original answer" in out.content
        assert "Verification" in out.content

    def test_unexcluded_tiebreaker_still_runs(self, api_env):
        v_config = ai_router._config.get("verification", {})
        with trace_provider_calls() as calls:
            ai_router._tiebreaker_reroute(
                self._route_result(), "task", "architecture",
                self._verification(), v_config,
                exclude_providers=["google"],
            )
        assert len(calls) == 1

    def test_a_disabled_tiebreaker_also_degrades_to_merge(
        self, api_env, monkeypatch
    ):
        """Raised by this session's own verification round, on both fan-out
        arms: the tiebreaker dispatch never consulted ``is_enabled`` at all,
        so the sweep for ``pick_model``'s short-circuit pattern did not reach
        it. A disabled tiebreaker is as unusable as a missing one."""
        v_config = ai_router._config.get("verification", {})
        tiebreaker = (v_config.get("settings") or {}).get(
            "tiebreaker_model", "opus"
        )
        monkeypatch.setitem(
            ai_router._config["models"][tiebreaker], "is_enabled", False
        )
        with trace_provider_calls() as calls:
            out = ai_router._tiebreaker_reroute(
                self._route_result(), "task", "architecture",
                self._verification(), v_config,
                exclude_providers=None,
            )
        assert calls == [], "dispatched a tiebreaker the registry disables"
        assert "original answer" in out.content


# ---------------------------------------------------------------------------
# The copilot-cli sibling (L-069-1): the seat transport's auto-verify.
# ---------------------------------------------------------------------------

class TestCopilotCliVerifierHonoursTheExclusion:
    """The seat profile resolved its GENERATOR against the exclusion and its
    VERIFIER against nothing — the same asymmetry as the api profile."""

    def test_verifier_resolution_receives_the_exclusion(self):
        # Package-qualified imports throughout this class: ``ai_router``
        # resolves ``ProvenanceUnavailable`` off ``ai_router.verification``,
        # and a bare ``import verification`` is a DIFFERENT module object
        # holding a different class of the same name. An isinstance check
        # across the two silently returns False.
        from ai_router.copilot_catalog import (
            Catalog, CatalogMeta, ENABLEMENT_CONFIRMED, ModelEntry,
        )
        from ai_router.verification import (
            ProvenanceUnavailable, pick_copilot_cli_verifier,
        )

        catalog = Catalog(
            meta=CatalogMeta(
                schema_version=1, cli_name="GitHub Copilot CLI",
                cli_version="1.0.68", cli_version_pin_required=True,
                seat_id="s", seat_label="s", source="empirical-probe",
                probed_at="2026-07-04T00:00:00Z",
            ),
            models=[
                ModelEntry(id="claude-sonnet-4.6", provider="anthropic",
                           enablement=ENABLEMENT_CONFIRMED),
                ModelEntry(id="gpt-5.4", provider="openai",
                           enablement=ENABLEMENT_CONFIRMED),
            ],
        )
        config = {
            "transports": {"copilot-cli": {"roles": {"verifier": {
                "prefer": ["claude-sonnet-4.6", "gpt-5.4"],
                "require_provider_in": ["anthropic", "openai"],
            }}}},
        }

        # Generator on google: without an exclusion the anthropic entry wins.
        unexcluded = pick_copilot_cli_verifier(
            generator_provider="google", config=config, catalog=catalog,
        )
        assert unexcluded.provider == "anthropic"

        # With anthropic excluded it must fall through, never return it.
        excluded = pick_copilot_cli_verifier(
            generator_provider="google", config=config, catalog=catalog,
            exclude_providers=frozenset({EXCLUDED}),
        )
        assert excluded.provider == "openai"

        # And when nothing survives, fail closed rather than pair anyway.
        nothing = pick_copilot_cli_verifier(
            generator_provider="google", config=config, catalog=catalog,
            exclude_providers=frozenset({"anthropic", "openai"}),
        )
        assert isinstance(nothing, ProvenanceUnavailable)

    def test_route_threads_the_exclusion_into_the_seat_verifier(
        self, monkeypatch
    ):
        """The wiring, not just the selector: route() -> the seat body ->
        pick_copilot_cli_verifier must carry the caller's list."""
        seen: dict = {}

        real = ai_router.pick_copilot_cli_verifier

        def spy(**kwargs):
            seen.update(kwargs)
            return real(**kwargs)

        monkeypatch.setattr(ai_router, "pick_copilot_cli_verifier", spy)

        from ai_router.copilot_catalog import (
            Catalog, CatalogMeta, ENABLEMENT_CONFIRMED, ModelEntry,
        )

        catalog = Catalog(
            meta=CatalogMeta(
                schema_version=1, cli_name="GitHub Copilot CLI",
                cli_version="1.0.68", cli_version_pin_required=True,
                seat_id="s", seat_label="s", source="empirical-probe",
                probed_at="2026-07-04T00:00:00Z",
            ),
            models=[
                ModelEntry(id="gpt-5.4", provider="openai",
                           enablement=ENABLEMENT_CONFIRMED),
                ModelEntry(id="claude-sonnet-4.6", provider="anthropic",
                           enablement=ENABLEMENT_CONFIRMED),
            ],
        )
        config = {
            "transport": {"profile": "copilot-cli"},
            "transports": {"copilot-cli": {
                "billed_usage_unavailable": True,
                "max_invocations_per_session": 10,
                "roles": {
                    "generator": {
                        "prefer": ["gpt-5.4"],
                        "require_provider_in": ["openai", "anthropic"],
                    },
                    "verifier": {
                        "prefer": ["claude-sonnet-4.6"],
                        "require_provider_in": ["openai", "anthropic"],
                    },
                },
            }},
            "verification": {
                "enabled": True, "auto_verify_task_types": ["general"],
            },
            "metrics": {"enabled": False},
            "prompts": {},
        }

        class _T:
            def __init__(self):
                self.calls = []

            def dispatch(self, *, model_id, system_prompt, user_message):
                self.calls.append(model_id)
                return ai_router.cli_transport.TransportResult(
                    content="VERIFIED", input_tokens=1, output_tokens=1,
                    stop_reason="end_turn", usage_authoritative=False,
                    finish_reason_known=True, content_complete=True,
                    partial_output_discarded=False, raw_stdout="VERIFIED",
                    raw_stderr="", transport_metadata={"error_class": None},
                )

        monkeypatch.setattr(ai_router, "_init", lambda: None)
        monkeypatch.setattr(ai_router, "_config", config)
        monkeypatch.setattr(ai_router, "_copilot_catalog", catalog)
        monkeypatch.setattr(ai_router, "_copilot_invocation_count", 0)
        monkeypatch.setattr(ai_router, "_copilot_transport", _T())

        ai_router.route(
            content="hello", task_type="general",
            exclude_providers=[EXCLUDED],
        )

        assert "exclude_providers" in seen, (
            "the seat verifier was resolved without an exclusion argument"
        )
        assert EXCLUDED in set(seen["exclude_providers"])


# ---------------------------------------------------------------------------
# A pinned task type cannot route work to a model the registry disabled.
# ---------------------------------------------------------------------------

class TestPinnedOverrideRespectsIsEnabled:
    """Handed to this session by Set 109 S1's disposition: ``pick_model``
    returned a ``task_type_overrides`` pin without its ``_survives`` check
    whenever no exclusion applied — which is to say, it bypassed
    ``is_enabled`` for exactly the pinned task types.

    That matters because S1 gave ``is_enabled: false`` a specific meaning:
    identity-registry-only, the record of what an orchestrator IS, never a
    destination for work. ``claude-opus-5`` and ``claude-sonnet-5`` are in
    the shipping registry on those terms today.
    """

    def _config_pinning(self, model_name: str) -> dict:
        import copy

        ai_router._init()
        config = copy.deepcopy(ai_router._config)
        config["routing"].setdefault("task_type_overrides", {})
        config["routing"]["task_type_overrides"]["architecture"] = model_name
        config["models"][model_name]["tier"] = 3
        return config

    def test_a_pin_on_a_disabled_model_is_not_routed_to(self):
        from ai_router.models import pick_model

        ai_router._init()
        disabled = next(
            name
            for name, cfg in ai_router._config["models"].items()
            if isinstance(cfg, dict) and not cfg.get("is_enabled", True)
        )
        config = self._config_pinning(disabled)
        chosen = pick_model(70, 3, "architecture", config, exclude_providers=None)
        assert chosen != disabled, (
            f"routed work to {disabled!r}, which the registry disables"
        )
        assert config["models"][chosen].get("is_enabled", True)

    def test_a_pin_on_an_enabled_model_is_still_honoured(self):
        """The paired positive — the pin must keep working, or the removal
        above would have deleted the feature rather than the bypass."""
        from ai_router.models import pick_model

        ai_router._init()
        enabled = _a_model_on_provider("anthropic")
        config = self._config_pinning(enabled)
        assert pick_model(
            70, 3, "architecture", config, exclude_providers=None
        ) == enabled

    def test_a_disabled_tier_assignment_is_not_routed_to_either(self):
        """The sibling four lines down in the same function (L-069-1). This
        one governs every NON-pinned call, so leaving it while fixing the pin
        branch would have closed half a class."""
        import copy

        from ai_router.models import pick_model

        ai_router._init()
        config = copy.deepcopy(ai_router._config)
        disabled = next(
            name
            for name, cfg in config["models"].items()
            if isinstance(cfg, dict) and not cfg.get("is_enabled", True)
        )
        config["models"][disabled]["tier"] = 3
        config["routing"]["tier_assignments"][3] = disabled

        chosen = pick_model(70, 3, "general", config, exclude_providers=None)
        assert chosen != disabled
        assert config["models"][chosen].get("is_enabled", True)

    def test_an_enabled_tier_assignment_is_still_returned_directly(self):
        from ai_router.models import pick_model

        ai_router._init()
        config = ai_router._config
        assigned = config["routing"]["tier_assignments"][3]
        assert pick_model(
            70, 3, "general", config, exclude_providers=None
        ) == assigned

    def test_an_escalation_cannot_land_on_a_disabled_model_either(self):
        """The third instance of the same short-circuit, in
        ``utils.get_escalation_model``. The initial pick and the escalation
        must agree about what the registry permits, or escalation becomes a
        way around it."""
        import copy

        from ai_router.utils import get_escalation_model

        ai_router._init()
        config = copy.deepcopy(ai_router._config)
        disabled = next(
            name
            for name, cfg in config["models"].items()
            if isinstance(cfg, dict) and not cfg.get("is_enabled", True)
        )
        config["models"][disabled]["tier"] = 3
        config["routing"]["tier_assignments"][3] = disabled

        chosen = get_escalation_model(
            "gemini-pro", config, 0, exclude_providers=None
        )
        assert chosen != disabled
        assert chosen is None or config["models"][chosen].get(
            "is_enabled", True
        )

    def test_an_escalation_to_an_enabled_assignment_still_works(self):
        from ai_router.utils import get_escalation_model

        ai_router._init()
        config = ai_router._config
        assert get_escalation_model(
            "gemini-pro", config, 0, exclude_providers=None
        ) == config["routing"]["tier_assignments"][3]


# ---------------------------------------------------------------------------
# The verify_session path — the question the spec insisted be answered plainly.
# ---------------------------------------------------------------------------

class TestSessionVerificationPathWasNeverAffected:
    def test_session_verification_does_not_take_the_auto_verify_branch(self):
        """``session-verification`` is not an auto-verified task type, so the
        leaking branch was never on the verification path. This asserts the
        fact rather than leaving it as a reading of the config, so a future
        edit that adds it to the list fails here instead of silently
        reopening same-provider verification."""
        ai_router._init()
        auto = (
            ai_router._config.get("verification", {}) or {}
        ).get("auto_verify_task_types") or []
        assert ai_router.SESSION_VERIFICATION_TASK_TYPE not in auto

    def test_the_verify_session_seam_passes_its_exclusion_through(
        self, monkeypatch
    ):
        """Raised by this session's verification round: the two tests below
        exercise ``route()`` directly, so a regression in the CLI wrapper that
        dropped its own exclusion would not fail them. This drives the real
        seam — ``verify_session._default_route``, which the close backstop
        also calls — and asserts the exclusion reaches ``route``."""
        import ai_router.verify_session as vs

        seen: dict = {}

        def fake_route(**kwargs):
            seen.update(kwargs)
            raise RuntimeError("stop here — selection is what is under test")

        monkeypatch.setattr("ai_router.route", fake_route, raising=False)

        with pytest.raises(RuntimeError):
            vs._default_route(
                "prompt", "docs/session-sets/109-model-registry-and-pricing-truth",
                2, 70, None, exclude_providers=[EXCLUDED],
            )

        assert seen.get("task_type") == vs.SESSION_VERIFICATION_TASK_TYPE
        assert seen.get("exclude_providers") == [EXCLUDED]

    def test_a_session_verification_call_issues_exactly_one_request(
        self, api_env
    ):
        """The end-to-end statement of the same fact: one routed
        verification, one HTTPS request, none of it on the orchestrator's
        own provider."""
        with trace_provider_calls() as calls:
            ai_router.route(
                content="verify this session",
                task_type=ai_router.SESSION_VERIFICATION_TASK_TYPE,
                exclude_providers=[EXCLUDED],
            )
        assert len(calls) == 1
        assert calls[0].provider != EXCLUDED
        rows = api_env.rows()
        assert len(rows) == 1
        assert rows[0]["provider"] != EXCLUDED
