"""Set 123 Session 2 -- the DIRECT_API precondition and the qualified verdict.

The operator's ruling (spec standing decision 3, verbatim): *"Verification
with the same provider is better than no verification at all, but the
results should be flagged with this limitation."*

Two things must be true for that to mean anything, and this file plants a
violation for each (``L-112-1``: a rule that only ever passes is
indistinguishable from one that checks nothing, and only a planted defect
separates them):

1. **The permission is narrow.** A same-provider run happens only for a
   project whose *committed* verify type is ``DIRECT_API`` **and** which
   holds no usable API key for any provider other than its orchestrator's.
   Every other project -- a Copilot seat, an uncommitted machine default, a
   project with a second key -- keeps the cross-provider exclusion.
2. **The flag is load-bearing in BOTH directions.** A same-provider verdict
   without the flag is refused (the Set 084 F2 guarantee), and a
   cross-provider verdict *carrying* the flag is refused too. A one-way
   check would let the qualification be sprinkled everywhere as a decorative
   no-op, at which point a later reader learns nothing from seeing it --
   which is the entire point of the field.

The ordinary cross-provider row is deliberately not re-tested here: every
stamped fixture in ``test_verification_stamp``, ``test_close_preflight``,
``test_close_mandated_writes``, ``test_verify_session_phases`` and
``test_windows_path_case`` is one, so the unchanged common path is already
the most heavily exercised assertion in the suite. Spending a slot restating
it would buy nothing (spec: irony budget).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disposition import (  # noqa: E402
    Disposition,
    disposition_from_dict,
    disposition_to_dict,
    validate_disposition,
)
from stamp_fixtures import write_stamped_evidence  # noqa: E402
import config as config_mod  # noqa: E402
import metrics as metrics_mod  # noqa: E402
from verification import (  # noqa: E402
    QUALIFICATION_SAME_PROVIDER,
    check_direct_api_precondition,
    classify_verification_qualification,
    providers_with_keys,
)
from verification_stamp import (  # noqa: E402
    STAMP_OPTIONAL_FIELDS,
    complete_stamp,
    validate_stamped_row,
)
from verify_session import patch_disposition, write_issues_artifact  # noqa: E402


_CONFIG = {
    "providers": {
        "anthropic": {"api_key_env": "TEST_ANTHROPIC_KEY"},
        "openai": {"api_key_env": "TEST_OPENAI_KEY"},
        "google": {"api_key_env": "TEST_GOOGLE_KEY", "enabled": False},
    }
}


def _resolver(**present):
    """A secret backend holding exactly *present*. Injected rather than
    exported to the real environment so a falsifier cannot pass merely
    because the developer's machine happens to hold a key."""
    return lambda name: present.get(name)


def _set_dir(tmp_path: Path) -> Path:
    d = tmp_path / "docs" / "session-sets" / "123-fixture"
    d.mkdir(parents=True)
    return d


def _check(verify_type, orchestrator, **keys):
    return check_direct_api_precondition(
        verify_type=verify_type,
        orchestrator_provider=orchestrator,
        config=_CONFIG,
        resolve=_resolver(**keys),
    )


# --- 1. The precondition (step 2) ------------------------------------------

class TestDirectApiPrecondition:
    """Compare against the EFFECTIVE provider, report, and never block."""

    def test_a_key_the_router_cannot_use_leaves_the_project_degraded(self):
        """The planted violation: DIRECT_API, and no *usable* key outside
        the orchestrator's own provider.

        Both shapes of that state are asserted together because they are one
        fact -- ``google`` is disabled in the config, so its key cannot be
        dispatched to. Counting it would satisfy the precondition with a
        verifier that then fails at the socket, which is precisely the silent
        failure this check exists to predict.
        """
        assert providers_with_keys(
            _CONFIG, _resolver(TEST_ANTHROPIC_KEY="k", TEST_GOOGLE_KEY="k3")
        ) == ("anthropic",)

        for keys in (
            {"TEST_ANTHROPIC_KEY": "k"},
            {"TEST_ANTHROPIC_KEY": "k", "TEST_GOOGLE_KEY": "k3"},
        ):
            result = _check("DIRECT_API", "anthropic", **keys)
            assert result.applies is True
            assert result.satisfied is False
            assert result.degraded is True
            assert result.keyed_providers == ("anthropic",)
            assert result.cross_provider_candidates == ()
            # It reports; it never raises and returns no refusal -- Set 116's
            # standing rule: a field on the record, never a new gate.
            assert "anthropic" in result.reason

    def test_a_second_usable_provider_key_satisfies_it(self):
        """The look-alike: same project, same orchestrator, one more key.
        Nothing is degraded, so nothing is permitted."""
        result = _check(
            "DIRECT_API", "anthropic",
            TEST_ANTHROPIC_KEY="k", TEST_OPENAI_KEY="k2",
        )
        assert result.applies is True
        assert result.satisfied is True
        assert result.degraded is False
        assert result.cross_provider_candidates == ("openai",)

    @pytest.mark.parametrize(
        "verify_type", ["COPILOT_CLI", None, "direct_api", ""]
    )
    def test_it_applies_only_to_a_committed_direct_api_project(
        self, verify_type, tmp_path, monkeypatch
    ):
        """The scope guard, planted with the harshest input: no keys at all.

        A Copilot seat keeps its fail-closed ``ProvenanceUnavailable``
        contract (Set 083/084) and an unresolved project has asked for
        nothing, so neither may reach the degraded path however few keys the
        machine holds. ``"direct_api"`` is in the list because the verify
        type is an exact token, never a case-folded guess.

        The second half drives the ROUTE boundary, where the permission is
        actually granted, and plants the case that matters most there: a
        project with no committed file but ``AI_ORCHESTRATION_VERIFY_TYPE``
        set to ``DIRECT_API``. Session 1's rule is that an unconfirmed
        machine default is a *suggestion*; if a suggestion could relax the
        cross-provider exclusion, then exporting one environment variable
        would silently weaken every verdict produced on that machine --
        action at a distance with nothing committed to the project. ``None``
        here means "exclusion preserved".
        """
        result = _check(verify_type, "anthropic")
        assert result.applies is False
        assert result.degraded is False

        import ai_router

        project = tmp_path / "uncommitted-project"
        project.mkdir()
        (project / ".git").mkdir()
        monkeypatch.chdir(project)
        monkeypatch.setenv("AI_ORCHESTRATION_VERIFY_TYPE", "DIRECT_API")
        assert ai_router._direct_api_precondition("anthropic") is None


# --- 2. The qualification, both directions (steps 3-4) ---------------------

class TestQualificationIsDerivedOnce:

    def test_the_classifier_decides_and_the_stamp_reflects_it(self):
        """One mechanism computes the qualification; the stamp writer only
        carries what it says. Asserted together so the two can never drift
        into disagreeing about the same pairing."""
        assert (
            classify_verification_qualification("anthropic", "anthropic")
            == QUALIFICATION_SAME_PROVIDER
        )
        assert classify_verification_qualification("openai", "anthropic") is None
        # Unknown either side -> no claim. An invented qualification is a lie
        # in one direction and a missing one is a lie in the other, so the
        # classifier declines both rather than guessing.
        assert classify_verification_qualification(None, "anthropic") is None
        assert classify_verification_qualification("openai", None) is None

        base = {"orchestrator_effective_provider": "anthropic"}
        same = complete_stamp(
            base, verifier_model="opus", response_content="VERIFIED\n",
            verifier_provider="anthropic",
        )
        assert same["verification_qualification"] == QUALIFICATION_SAME_PROVIDER
        cross = complete_stamp(
            base, verifier_model="gpt-5-4", response_content="VERIFIED\n",
            verifier_provider="openai",
        )
        assert "verification_qualification" not in cross


class TestCloseGateBijection:
    """The gate that makes the flag mean something. Planted both ways."""

    def test_a_declared_same_provider_row_corroborates_a_close(self, tmp_path):
        """A same-provider verdict is REAL -- it settles a close -- and it
        says on the row that it is the weaker claim."""
        set_dir = _set_dir(tmp_path)
        row = write_stamped_evidence(
            set_dir,
            model="opus",
            provider="anthropic",
            orchestrator_provider="anthropic",
            verification_qualification=QUALIFICATION_SAME_PROVIDER,
        )
        ok, reason = validate_stamped_row(
            row,
            session_set_dir=str(set_dir),
            session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert ok, reason

    def test_an_undeclared_same_provider_row_is_refused(self, tmp_path):
        """Direction one: the Set 084 F2 guarantee still holds in full for
        any row that does not own up to what it is."""
        set_dir = _set_dir(tmp_path)
        row = write_stamped_evidence(
            set_dir,
            model="opus",
            provider="anthropic",
            orchestrator_provider="anthropic",
        )
        ok, reason = validate_stamped_row(
            row,
            session_set_dir=str(set_dir),
            session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert not ok
        assert "not cross-provider" in reason

    def test_a_false_or_unreadable_qualification_is_refused(self, tmp_path):
        """Direction two -- the half a one-way check would miss.

        A cross-provider row wearing the flag understates itself, and an
        unknown token cannot be interpreted at all. Both are refused, because
        a qualification that could be attached to anything, or that means
        nothing, distinguishes nothing -- and distinguishing is the field's
        only job.
        """
        set_dir = _set_dir(tmp_path)
        understated = write_stamped_evidence(
            set_dir,
            model="gpt-5-4",
            provider="openai",
            orchestrator_provider="anthropic",
            verification_qualification=QUALIFICATION_SAME_PROVIDER,
        )
        ok, reason = validate_stamped_row(
            understated,
            session_set_dir=str(set_dir),
            session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert not ok
        assert "must not understate itself" in reason

        unreadable = write_stamped_evidence(
            set_dir,
            session_number=2,
            model="opus",
            provider="anthropic",
            orchestrator_provider="anthropic",
            verification_qualification="mostly-fine",
        )
        ok, reason = validate_stamped_row(
            unreadable,
            session_set_dir=str(set_dir),
            session_number=2,
            orchestrator_effective_provider="anthropic",
        )
        assert not ok
        assert "not a known qualification" in reason


# --- 3. The records the qualification travels on (step 3) ------------------

class TestQualificationTravelsWithTheVerdict:
    """Distinguishable BY A LATER READER, which is the whole point."""

    def test_every_verdict_record_carries_it_omit_null(self, tmp_path):
        set_dir = _set_dir(tmp_path)
        # Set 134 S2: the writer's severity vocabulary is exact, so this
        # fixture spells the canonical token. Unrelated to what this test
        # asserts (the qualification field's omit-null behaviour).
        issues = [{"description": "x", "severity": "Minor"}]

        write_issues_artifact(
            set_dir / "s1-issues.json", 1, 1, "ISSUES_FOUND", issues,
            qualification=QUALIFICATION_SAME_PROVIDER,
        )
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert envelope["verificationQualification"] == QUALIFICATION_SAME_PROVIDER

        write_issues_artifact(
            set_dir / "s2-issues.json", 2, 1, "ISSUES_FOUND", issues,
        )
        unqualified = json.loads(
            (set_dir / "s2-issues.json").read_text(encoding="utf-8")
        )
        assert "verificationQualification" not in unqualified

        d = Disposition(
            status="completed", summary="s", verification_method="api",
            verification_verdict="VERIFIED",
            verification_qualification=QUALIFICATION_SAME_PROVIDER,
        )
        as_dict = disposition_to_dict(d)
        assert (
            disposition_from_dict(as_dict).verification_qualification
            == QUALIFICATION_SAME_PROVIDER
        )
        plain = disposition_to_dict(
            Disposition(status="completed", summary="s",
                        verification_method="api")
        )
        assert "verification_qualification" not in plain

        as_dict["verification_qualification"] = "sort-of-verified"
        _ok, errors = validate_disposition(as_dict)
        assert any("verification_qualification" in e for e in errors)

    def test_an_unqualified_round_clears_a_stale_qualification(self, tmp_path):
        """A later cross-provider round must not leave the older, weaker
        claim standing beside a verdict it no longer describes -- the
        disposition patch REMOVES the key rather than merely not writing it.
        """
        set_dir = _set_dir(tmp_path)
        patch_disposition(set_dir, "ISSUES_FOUND", QUALIFICATION_SAME_PROVIDER)
        first = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert first["verification_qualification"] == QUALIFICATION_SAME_PROVIDER

        patch_disposition(set_dir, "VERIFIED", None)
        second = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert second["verification_verdict"] == "VERIFIED"
        assert "verification_qualification" not in second


# --- 4. Reachability: the permission must survive the whole path -----------

class TestTheDegradedPathIsActuallyReachable:
    """Round-1 discovery found the machinery correct and **unreachable**:
    the process died at config load, the CLI re-imposed the exclusion it had
    just lifted, and the qualification was dropped between the stamp and the
    metrics row. Each of those is planted here, because a permission that
    cannot be exercised is indistinguishable from one that was never built.
    """

    def test_a_single_key_machine_loads_instead_of_dying(self, monkeypatch):
        """The degraded machine IS the target case: one provider keyed, the
        others enabled but keyless. It must reach dispatch with the keyless
        providers disabled -- not raise, which is what killed the feature
        before ``route()`` could ever ask the precondition.

        The genuinely fatal case still raises: no enabled provider has a
        key, so a direct-API dispatch has nowhere to go.
        """
        monkeypatch.setattr(
            config_mod, "resolve_secret",
            lambda name: "k" if name == "TEST_ANTHROPIC_KEY" else None,
        )
        config = {
            "transport": {"profile": "api"},
            "providers": {
                "anthropic": {"api_key_env": "TEST_ANTHROPIC_KEY"},
                "openai": {"api_key_env": "TEST_OPENAI_KEY"},
            },
            "models": {
                "opus": {"provider": "anthropic", "tier": 3},
                "gpt": {"provider": "openai", "tier": 3},
            },
        }
        config_mod.validate_provider_api_keys(config)
        assert config["providers"]["anthropic"].get("enabled", True) is True
        assert config["providers"]["openai"]["enabled"] is False
        # Disabling the PROVIDER is cosmetic on its own: pick_model consults
        # each MODEL's is_enabled and never the provider's flag, so a
        # keyless-but-pinned verifier would still be selected and then die
        # at dispatch. "Removed from selection" has to be true of the models.
        assert config["models"]["gpt"]["is_enabled"] is False
        assert config["models"]["opus"].get("is_enabled", True) is True

        monkeypatch.setattr(config_mod, "resolve_secret", lambda name: None)
        with pytest.raises(EnvironmentError) as excinfo:
            config_mod.validate_provider_api_keys(
                {
                    "transport": {"profile": "api"},
                    "providers": {
                        "anthropic": {"api_key_env": "TEST_ANTHROPIC_KEY"},
                    },
                }
            )
        assert "TEST_ANTHROPIC_KEY" in str(excinfo.value)

    def test_the_qualification_survives_the_metrics_writer(
        self, tmp_path, monkeypatch
    ):
        """The stamp computed it and the row dropped it: ``record_call``
        wrote only ``STAMP_FIELDS``, which cannot contain an omit-null key
        (its presence sweep requires every entry to be truthy). The close
        gate reads the ROW, so the field dying here rejected exactly the
        same-provider verdict the machinery exists to permit."""
        assert "verification_qualification" in STAMP_OPTIONAL_FIELDS

        stamp = complete_stamp(
            {"orchestrator_effective_provider": "anthropic"},
            verifier_model="opus",
            response_content="VERIFIED\n",
            verifier_provider="anthropic",
        )
        metrics_path = tmp_path / "router-metrics.jsonl"
        monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
        config = {"metrics": {"enabled": True}}

        def _rows():
            return [
                json.loads(line)
                for line in metrics_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]

        metrics_mod.record_call(
            config,
            call_type="route",
            task_type="session-verification",
            model="opus",
            provider="anthropic",
            tier=1,
            complexity_score=1,
            generation_params={},
            input_tokens=1,
            output_tokens=1,
            cost_usd=0.0,
            elapsed_seconds=0.0,
            escalated=False,
            stop_reason="end_turn",
            stamp=stamp,
        )
        assert _rows()[-1]["verification_qualification"] == (
            QUALIFICATION_SAME_PROVIDER
        )

        # The look-alike: an unstamped call still writes the column, as
        # None, so a reader never has to tell "old row" from "unqualified".
        metrics_mod.record_call(
            config,
            call_type="route",
            task_type="generation",
            model="opus",
            provider="anthropic",
            tier=1,
            complexity_score=1,
            generation_params={},
            input_tokens=1,
            output_tokens=1,
            cost_usd=0.0,
            elapsed_seconds=0.0,
            escalated=False,
            stop_reason="end_turn",
        )
        rows = [
            json.loads(line)
            for line in metrics_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        assert rows[-1]["verification_qualification"] is None

    def test_the_degraded_route_drops_the_callers_orchestrator_exclusion(
        self, monkeypatch
    ):
        """``verify_session`` passes ``exclude_providers=[orchestrator]`` for
        its own reporting, and ``route()`` UNIONS caller exclusions in. So
        lifting the router's own exclusion achieved nothing through the
        sanctioned CLI -- the caller's copy put it straight back, and the
        permission was unreachable exactly where it is used.

        The degraded branch must therefore *discard* it, and must also bar
        every provider the machine cannot reach, or selection lands on a
        configured-but-keyless model and dies at the socket instead of
        verifying with the key that is actually present.

        This does not reopen I-084-S1-3: no caller input is consulted. The
        router decided the degraded state from the project's committed file
        plus the machine's real key set, which a caller cannot fabricate.
        """
        import ai_router
        from verification import DirectApiPrecondition

        class _Stop(RuntimeError):
            pass

        seen: dict = {}

        def _fake_pick_model(*args, **kwargs):
            seen["exclude"] = list(kwargs.get("exclude_providers") or [])
            raise _Stop()

        class _Identity:
            effective_provider = "anthropic"
            source = "model-registry"
            provenance = "direct"

        monkeypatch.setattr(
            ai_router, "_config",
            {
                "transport": {"profile": "api"},
                "providers": {
                    "anthropic": {}, "openai": {}, "google": {},
                },
                "complexity": {},
                "models": {},
            },
        )
        monkeypatch.setattr(ai_router, "pick_model", _fake_pick_model)
        monkeypatch.setattr(
            ai_router, "resolve_session_orchestrator_identity",
            lambda *a, **k: _Identity(),
        )
        monkeypatch.setattr(
            ai_router, "estimate_complexity", lambda **k: 50
        )
        monkeypatch.setattr(
            ai_router, "_direct_api_precondition",
            lambda provider: DirectApiPrecondition(
                applies=True, satisfied=False, reason="planted",
                orchestrator_provider="anthropic",
                keyed_providers=("anthropic",),
                cross_provider_candidates=(),
            ),
        )

        with pytest.raises(_Stop):
            ai_router.route(
                content="verify this session",
                task_type=ai_router.SESSION_VERIFICATION_TASK_TYPE,
                session_set="docs/session-sets/123-fixture",
                session_number=1,
                exclude_providers=["anthropic"],
            )
        # The orchestrator's own provider is no longer excluded (that IS the
        # permission), and the two providers with no key are.
        assert "anthropic" not in seen["exclude"]
        assert set(seen["exclude"]) == {"openai", "google"}

        # The look-alike: an UNdegraded session keeps the exclusion, caller
        # copy and router copy alike.
        monkeypatch.setattr(
            ai_router, "_direct_api_precondition", lambda provider: None
        )
        with pytest.raises(_Stop):
            ai_router.route(
                content="verify this session",
                task_type=ai_router.SESSION_VERIFICATION_TASK_TYPE,
                session_set="docs/session-sets/123-fixture",
                session_number=1,
                exclude_providers=["anthropic"],
            )
        assert seen["exclude"] == ["anthropic"]
