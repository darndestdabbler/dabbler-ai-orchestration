"""Set 131 S1, round-1 remediation — the independence floor is enforced on
the PROVIDER, not just on "must route".

The defect both discovery lenses found independently: rule 2 says work whose
value is independence must run on a different effective provider and names
three task types, but ``route()`` derived the orchestrator-provider exclusion
only for ``session-verification``. With the shipped ``code-review: sonnet``
pin, an Anthropic orchestrator routing a mandatory ``code-review`` got an
Anthropic reviewer — a same-provider "independent" review on the normal
supported path, not an edge case.

These tests drive ``route()``'s real derivation seam and capture the
exclusion it computes. They are transport-agnostic on purpose: the api body
and the copilot-cli body are separate code paths that must reach the same
answer, and this repo's own ``transport.profile`` is machine state
(``project-verify-type.txt`` is gitignored), so a test that assumed one
profile would pass or fail depending on how the developer provisioned their
checkout.
"""

import pytest

import ai_router
from ai_router.config import INDEPENDENCE_REQUIRED_TASK_TYPES


ORCHESTRATOR_PROVIDER = "anthropic"


class _StopBeforeDispatch(Exception):
    """Raised from the captured seam so no model is ever contacted."""


class _FakeIdentity:
    effective_provider = ORCHESTRATOR_PROVIDER
    model = "claude-opus-5"
    engine = "github-copilot"


@pytest.fixture
def captured_exclusion(monkeypatch, direct_api_transport):
    """Capture the exclusion ``route()`` derives, on whichever transport.

    Both bodies are patched so the assertion holds regardless of the profile
    the config resolves to, and neither patch lets a real call proceed.

    ``direct_api_transport`` removes the seat from the equation (conftest):
    ``_init()`` is the dispatch entry point and validates provider keys, and
    a Copilot seat carries none by design.
    """
    seen: dict[str, object] = {}

    # _config is a process-global cached by _init(). Reset it so this test
    # loads the fixture's config rather than one an earlier test cached.
    monkeypatch.setattr(ai_router, "_config", None)

    def _fake_identity(session_set, session_number=None):
        return _FakeIdentity()

    def _fake_pick_model(*args, **kwargs):
        seen["exclude_providers"] = kwargs.get("exclude_providers")
        raise _StopBeforeDispatch()

    def _fake_copilot_body(**kwargs):
        seen["exclude_providers"] = kwargs.get("exclude_providers")
        raise _StopBeforeDispatch()

    monkeypatch.setattr(
        ai_router, "resolve_session_orchestrator_identity", _fake_identity
    )
    monkeypatch.setattr(ai_router, "pick_model", _fake_pick_model)
    monkeypatch.setattr(
        ai_router, "_route_via_copilot_cli", _fake_copilot_body
    )
    # The degraded DIRECT_API branch deliberately LIFTS the exclusion when the
    # machine holds only one provider key. That path has its own tests; here
    # it must not fire, or every assertion below would be measuring the
    # degradation rather than the rule.
    monkeypatch.setattr(
        ai_router, "_direct_api_precondition", lambda provider: None
    )

    def _run(task_type: str):
        seen.clear()
        with pytest.raises(_StopBeforeDispatch):
            ai_router.route(
                content="irrelevant",
                task_type=task_type,
                session_set="docs/session-sets/131-outsourcing-policy-restoration",
                session_number=1,
            )
        excluded = seen.get("exclude_providers") or []
        return [str(p).strip().lower() for p in excluded]

    return _run


@pytest.mark.parametrize("task_type", INDEPENDENCE_REQUIRED_TASK_TYPES)
def test_every_independence_task_excludes_the_orchestrator_provider(
    captured_exclusion, task_type
):
    """THE plant, run once per floor entry.

    Before the fix this passed for session-verification and failed for
    code-review and security-review.
    """
    assert ORCHESTRATOR_PROVIDER in captured_exclusion(task_type), (
        f"{task_type!r} is in the independence floor but route() did not "
        f"exclude the orchestrator's effective provider "
        f"{ORCHESTRATOR_PROVIDER!r} — a same-provider 'independent' review."
    )


def test_code_review_specifically_cannot_select_the_pinned_same_provider():
    """The shipped pin is the thing that made this reachable, so assert the
    pin is still a preference and still points where it did.

    If someone later removes the ``code-review: sonnet`` pin, this test
    should be re-read rather than deleted: the pin is not the defect, the
    missing exclusion was.
    """
    config = ai_router.load_config()
    pinned = config["routing"]["task_type_overrides"].get("code-review")
    assert pinned is not None, "code-review pin vanished; re-read this test"
    pinned_provider = config["models"][pinned]["provider"]
    assert pinned_provider == ORCHESTRATOR_PROVIDER, (
        "this test's premise is that the shipped pin resolves to the same "
        "provider an Anthropic orchestrator runs on; if that changed, the "
        "regression it guards is no longer reachable this way"
    )
    from ai_router.models import pick_model

    chosen = pick_model(
        50, 3, "code-review", config,
        exclude_providers=[ORCHESTRATOR_PROVIDER],
    )
    assert chosen != pinned, "the task_type_overrides pin beat a hard exclusion"
    if chosen is not None:
        assert config["models"][chosen]["provider"] != ORCHESTRATOR_PROVIDER


def test_an_ordinary_task_type_is_not_provider_constrained(captured_exclusion):
    """The legitimate look-alike that must NOT fire (L-112-1).

    Rule 2 is about work whose value IS independence. Constraining every
    routed call to a different provider would be a much bigger behavioural
    change wearing this fix's clothes.
    """
    assert ORCHESTRATOR_PROVIDER not in captured_exclusion("documentation")


def test_a_caller_supplied_exclusion_is_unioned_not_replaced(
    monkeypatch, direct_api_transport
):
    """I-084-S1-3 must not reopen: a caller list that omits the orchestrator
    cannot buy a same-provider reviewer.
    """
    seen: dict[str, object] = {}

    monkeypatch.setattr(ai_router, "_config", None)
    monkeypatch.setattr(
        ai_router, "resolve_session_orchestrator_identity",
        lambda session_set, session_number=None: _FakeIdentity(),
    )
    monkeypatch.setattr(
        ai_router, "_direct_api_precondition", lambda provider: None
    )

    def _capture(*args, **kwargs):
        seen["exclude_providers"] = kwargs.get("exclude_providers")
        raise _StopBeforeDispatch()

    monkeypatch.setattr(ai_router, "pick_model", _capture)
    monkeypatch.setattr(ai_router, "_route_via_copilot_cli", _capture)

    with pytest.raises(_StopBeforeDispatch):
        ai_router.route(
            content="irrelevant",
            task_type="code-review",
            session_set="docs/session-sets/131-outsourcing-policy-restoration",
            session_number=1,
            exclude_providers=["google"],
        )

    excluded = [str(p).strip().lower() for p in (seen["exclude_providers"] or [])]
    assert ORCHESTRATOR_PROVIDER in excluded, (
        "a caller-supplied exclusion REPLACED the session-derived one"
    )
    assert "google" in excluded, "the caller's own exclusion was dropped"


# ---------------------------------------------------------------------------
# The DIRECT_API degradation carve-out is scoped to session-verification
# ---------------------------------------------------------------------------
#
# Round-3 remediation-review finding. Widening the independence guard to all
# three floor task types silently carried the Set 123 S2 degradation
# permission along with it. That permission is an OPERATOR-AUTHORIZED
# VERIFICATION-REDUCTION (2026-08-11) granted for session-verification and
# nothing else, so extending it to code-review / security-review would be the
# orchestrator self-authorizing a reduction -- the hard carve-out.
#
# The round-1 tests patched _direct_api_precondition to None and so never
# exercised this path at all. The reviewer said so explicitly. These are the
# falsifiers that close that gap.


class _DegradedPrecondition:
    """A DIRECT_API machine holding only the orchestrator's own key."""

    degraded = True
    reason = "only DABBLER_ANTHROPIC_API_KEY is set"
    keyed_providers = (ORCHESTRATOR_PROVIDER,)


@pytest.fixture
def captured_exclusion_when_degraded(monkeypatch, direct_api_transport):
    seen: dict[str, object] = {}

    monkeypatch.setattr(ai_router, "_config", None)
    monkeypatch.setattr(
        ai_router, "resolve_session_orchestrator_identity",
        lambda session_set, session_number=None: _FakeIdentity(),
    )
    monkeypatch.setattr(
        ai_router, "_direct_api_precondition",
        lambda provider: _DegradedPrecondition(),
    )

    def _capture(*args, **kwargs):
        seen["exclude_providers"] = kwargs.get("exclude_providers")
        raise _StopBeforeDispatch()

    monkeypatch.setattr(ai_router, "pick_model", _capture)
    monkeypatch.setattr(ai_router, "_route_via_copilot_cli", _capture)

    def _run(task_type: str):
        seen.clear()
        with pytest.raises(_StopBeforeDispatch):
            ai_router.route(
                content="irrelevant",
                task_type=task_type,
                session_set="docs/session-sets/131-outsourcing-policy-restoration",
                session_number=1,
            )
        return [
            str(p).strip().lower()
            for p in (seen.get("exclude_providers") or [])
        ]

    return _run


@pytest.mark.parametrize("task_type", ["code-review", "security-review"])
def test_degradation_does_not_relax_the_floor_for_review_tasks(
    captured_exclusion_when_degraded, task_type
):
    """THE plant: a single-key DIRECT_API machine must not get a
    same-provider 'independent' review.
    """
    assert ORCHESTRATOR_PROVIDER in captured_exclusion_when_degraded(task_type), (
        f"the DIRECT_API degradation lifted the exclusion for {task_type!r}. "
        "That permission was authorized for session-verification only; "
        "applying it here extends an operator-authorized verification "
        "reduction to a task type the operator never ruled on."
    )


def test_degradation_still_applies_to_session_verification(
    captured_exclusion_when_degraded
):
    """The look-alike that must NOT fire: the operator's ruling stands.

    Set 123 S2 decided a single-key DIRECT_API project verifies anyway and
    carries the qualification on its record. Scoping the carve-out must not
    quietly revoke it.
    """
    excluded = captured_exclusion_when_degraded("session-verification")
    assert ORCHESTRATOR_PROVIDER not in excluded, (
        "the Set 123 S2 operator-authorized degradation was revoked; that "
        "ruling is still in force for session-verification"
    )
