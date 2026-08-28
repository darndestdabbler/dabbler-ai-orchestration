import pytest

from ai_router.selection import (
    ROLE_VERIFIER,
    provider_reachable,
    registry_candidates,
    resolve_role,
)

pytestmark = pytest.mark.usefixtures("provider_keys")


# --- The role rule, transport-independent ------------------------------------

CANDIDATES = [
    ("a-one", "anthropic"),
    ("o-one", "openai"),
    ("g-one", "google"),
]


class TestResolveRole:
    def test_preference_order_sorts_named_candidates_first(self, base_config):
        base_config["roles"] = {"r": {"prefer": ["g-one", "o-one"]}}
        assert [c[0] for c in resolve_role(base_config, "r", CANDIDATES)] == [
            "g-one", "o-one", "a-one",
        ]

    def test_unnamed_candidate_still_qualifies_with_no_exclusion(
        self, base_config
    ):
        """The staleness fix: a preference list is an order, never the
        candidate universe, and that holds when nothing is excluded."""
        base_config["roles"] = {"r": {"prefer": ["g-one"]}}
        assert [c[0] for c in resolve_role(base_config, "r", CANDIDATES)] == [
            "g-one", "a-one", "o-one",
        ]

    def test_preference_name_matching_nothing_is_inert(self, base_config):
        base_config["roles"] = {"r": {"prefer": ["retired-model", "o-one"]}}
        assert [c[0] for c in resolve_role(base_config, "r", CANDIDATES)] == [
            "o-one", "a-one", "g-one",
        ]

    def test_require_provider_in_is_a_hard_filter(self, base_config):
        base_config["roles"] = {"r": {"require_provider_in": ["openai"]}}
        assert resolve_role(base_config, "r", CANDIDATES) == [
            ("o-one", "openai")
        ]

    def test_exclusion_removes_a_provider_the_preference_names(
        self, base_config
    ):
        base_config["roles"] = {"r": {"prefer": ["g-one", "o-one"]}}
        resolved = resolve_role(
            base_config, "r", CANDIDATES, exclude_providers=["Google"]
        )
        assert [c[0] for c in resolved] == ["o-one", "a-one"]

    def test_undeclared_role_keeps_every_candidate_in_declared_order(
        self, base_config
    ):
        assert resolve_role(base_config, "nobody-declared-me", CANDIDATES) == (
            CANDIDATES
        )

    def test_carries_the_transport_handle_through(self, base_config):
        base_config["roles"] = {"r": {"prefer": ["o-one"]}}
        resolved = resolve_role(
            base_config, "r", [("a-one", "anthropic", "alias-a"),
                               ("o-one", "openai", "alias-o")],
        )
        assert [c[2] for c in resolved] == ["alias-o", "alias-a"]


    def test_verifier_role_refuses_a_model_the_registry_distrusts(
        self, base_config
    ):
        """Trust is a property of the model, so it has to hold on the seat
        too — the catalog carries no such flag and spells ids differently."""
        base_config["roles"]["verifier"]["prefer"] = ["o-mini"]
        resolved = resolve_role(
            base_config, ROLE_VERIFIER,
            [("O-Mini", "openai"), ("a-sonnet", "anthropic")],
        )
        assert [c[0] for c in resolved] == ["a-sonnet"]

    def test_a_model_the_registry_does_not_carry_stays_eligible(
        self, base_config
    ):
        """Absent metadata is unknown, never unsupported: filtering on it
        would end cross-vendor verification the day a seat ships a model the
        registry has not heard of."""
        resolved = resolve_role(
            base_config, ROLE_VERIFIER, [("brand-new-model", "google")]
        )
        assert resolved == [("brand-new-model", "google")]


# --- The direct-API path's enumeration ---------------------------------------

class TestRegistryCandidates:
    def test_resolves_against_the_model_record_in_role_order(self, base_config):
        assert registry_candidates(base_config, "generator")[:3] == [
            "flash", "pro", "opus",
        ]

    def test_disabled_model_never_survives(self, base_config):
        assert "ghost" not in registry_candidates(base_config, "generator")

    def test_keyless_provider_is_not_a_candidate(self, base_config, monkeypatch):
        monkeypatch.delenv("TEST_GOOGLE_KEY", raising=False)
        assert not provider_reachable(base_config, "google")
        names = registry_candidates(base_config, "generator")
        assert "flash" not in names and "pro" not in names
        assert "sonnet" in names

    def test_disabled_provider_is_not_reachable(self, base_config):
        base_config["providers"]["openai"]["enabled"] = False
        assert "gpt" not in registry_candidates(base_config, "generator")

    def test_verifier_role_drops_entries_not_trusted_to_verify(
        self, base_config
    ):
        names = registry_candidates(base_config, ROLE_VERIFIER)
        assert "gpt-mini" not in names
        assert "sonnet" in names

    def test_empty_when_every_provider_is_excluded(self, base_config):
        assert registry_candidates(
            base_config, "generator",
            exclude_providers=["google", "openai", "anthropic"],
        ) == []
