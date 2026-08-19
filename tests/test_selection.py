import pytest

from ai_router.selection import (
    estimate_complexity,
    next_escalation_model,
    pick_model,
    provider_reachable,
    surviving_candidates,
)

pytestmark = pytest.mark.usefixtures("provider_keys")


# --- estimate_complexity ----------------------------------------------------

class TestEstimateComplexity:
    def test_short_simple_prompt_scores_low(self, base_config):
        score = estimate_complexity(
            "fix typo", "formatting", None, base_config["complexity"]
        )
        assert score <= 30

    def test_long_security_prompt_scores_high(self, base_config):
        text = "security concurrency " * 600
        score = estimate_complexity(
            text, "architecture", None, base_config["complexity"]
        )
        assert score > 65

    def test_hint_is_clamped_to_range(self, base_config):
        low = estimate_complexity("x", "general", -50, base_config["complexity"])
        high = estimate_complexity("x", "general", 500, base_config["complexity"])
        assert 1 <= low <= 100
        assert 1 <= high <= 100

    def test_hint_pulls_score_upward(self, base_config):
        without = estimate_complexity("x", "general", None, base_config["complexity"])
        with_hint = estimate_complexity("x", "general", 100, base_config["complexity"])
        assert with_hint > without


# --- provider_reachable / surviving_candidates ------------------------------

class TestSurvivingCandidates:
    def test_sorted_cheapest_first_by_worst_case_output(self, base_config):
        names = surviving_candidates(base_config)
        # flash 2.5 < gpt-mini 4.5 < sonnet 15 (dated worst) == pro 15 (tier
        # worst) == gpt 15 < opus 25
        assert names[0] == "flash"
        assert names[-1] == "opus"

    def test_disabled_model_never_survives(self, base_config):
        assert "ghost" not in surviving_candidates(base_config)

    def test_excluded_provider_removes_all_its_models(self, base_config):
        names = surviving_candidates(base_config, exclude_providers=["google"])
        assert names
        assert not any(n in names for n in ("flash", "pro"))

    def test_keyless_provider_is_not_a_candidate(self, base_config, monkeypatch):
        monkeypatch.delenv("TEST_GOOGLE_KEY", raising=False)
        assert not provider_reachable(base_config, "google")
        names = surviving_candidates(base_config)
        assert "flash" not in names and "pro" not in names
        assert "sonnet" in names

    def test_disabled_provider_is_not_reachable(self, base_config):
        base_config["providers"]["openai"]["enabled"] = False
        assert "gpt" not in surviving_candidates(base_config)

    def test_tier_filter(self, base_config):
        assert surviving_candidates(base_config, tier=1) == ["flash"]

    def test_require_verifier_drops_non_verifiers(self, base_config):
        names = surviving_candidates(base_config, require_verifier=True)
        assert "gpt-mini" not in names
        assert "sonnet" in names


# --- pick_model -------------------------------------------------------------

class TestPickModel:
    def test_task_type_pin_is_honored(self, base_config):
        assert pick_model(10, 3, "code-review", base_config) == "sonnet"

    def test_pin_loses_to_provider_exclusion(self, base_config):
        picked = pick_model(
            10, 3, "code-review", base_config, exclude_providers=["anthropic"]
        )
        assert picked is not None
        assert base_config["models"][picked]["provider"] != "anthropic"

    def test_pin_on_disabled_model_falls_through(self, base_config):
        base_config["models"]["sonnet"]["is_enabled"] = False
        picked = pick_model(10, 3, "code-review", base_config)
        assert picked != "sonnet"

    def test_pin_above_max_tier_falls_through(self, base_config):
        base_config["routing"]["task_type_overrides"]["code-review"] = "opus"
        assert pick_model(10, 1, "code-review", base_config) == "flash"

    def test_prefer_model_outranks_pin(self, base_config):
        picked = pick_model(
            10, 3, "code-review", base_config, prefer_model="gpt-mini"
        )
        assert picked == "gpt-mini"

    def test_prefer_model_loses_to_exclusion(self, base_config):
        picked = pick_model(
            10, 3, "code-review", base_config,
            exclude_providers=["openai"], prefer_model="gpt-mini",
        )
        assert picked == "sonnet"  # falls through to the pin

    def test_prefer_model_unknown_alias_ignored(self, base_config):
        assert (
            pick_model(10, 3, "code-review", base_config, prefer_model="nope")
            == "sonnet"
        )

    def test_prefer_model_with_bool_tier_ignored(self, base_config):
        base_config["models"]["gpt-mini"]["tier"] = True
        assert (
            pick_model(10, 3, "code-review", base_config, prefer_model="gpt-mini")
            == "sonnet"
        )

    def test_complexity_maps_to_tiers(self, base_config):
        assert pick_model(10, 3, "general", base_config) == "flash"
        assert pick_model(50, 3, "general", base_config) == "pro"
        assert pick_model(90, 3, "general", base_config) == "opus"

    def test_max_tier_caps_selection(self, base_config):
        assert pick_model(90, 1, "general", base_config) == "flash"

    def test_disabled_tier_assignment_falls_to_cheapest_at_tier(self, base_config):
        base_config["models"]["pro"]["is_enabled"] = False
        # Cheapest surviving tier-2: gpt-mini (4.5) < sonnet (15 worst).
        assert pick_model(50, 3, "general", base_config) == "gpt-mini"

    def test_excluded_tier_widens_upward_before_downward(self, base_config):
        # Exclude google+openai: no tier-2 or tier-1 candidates except
        # anthropic's sonnet at tier 2; drop sonnet too and tier-2 must
        # widen up to opus rather than failing.
        base_config["models"]["sonnet"]["is_enabled"] = False
        picked = pick_model(
            50, 3, "general", base_config,
            exclude_providers=["google", "openai"],
        )
        assert picked == "opus"

    def test_widens_downward_when_no_higher_tier_survives(self, base_config):
        base_config["models"]["pro"]["is_enabled"] = False
        base_config["models"]["sonnet"]["is_enabled"] = False
        base_config["models"]["gpt-mini"]["is_enabled"] = False
        picked = pick_model(
            50, 2, "general", base_config  # tier 2, max_tier 2: only tier 1 left
        )
        assert picked == "flash"

    def test_returns_none_when_nothing_survives(self, base_config):
        picked = pick_model(
            50, 3, "general", base_config,
            exclude_providers=["google", "openai", "anthropic"],
        )
        assert picked is None

    def test_keyless_provider_excluded_from_every_path(
        self, base_config, monkeypatch
    ):
        # The pin's provider has no key: the pin must not be honored and
        # selection must land on a keyed provider.
        monkeypatch.delenv("TEST_ANTHROPIC_KEY", raising=False)
        picked = pick_model(10, 3, "code-review", base_config)
        assert picked is not None
        assert base_config["models"][picked]["provider"] != "anthropic"


# --- next_escalation_model --------------------------------------------------

class TestNextEscalationModel:
    def test_escalates_to_next_tier_assignment(self, base_config):
        assert next_escalation_model("flash", base_config, 0) == "pro"
        assert next_escalation_model("pro", base_config, 0) == "opus"

    def test_stops_at_max_escalations(self, base_config):
        assert next_escalation_model("flash", base_config, 2) is None

    def test_stops_above_top_tier(self, base_config):
        assert next_escalation_model("opus", base_config, 0) is None

    def test_excluded_assignment_falls_to_cheapest_survivor(self, base_config):
        picked = next_escalation_model(
            "flash", base_config, 0, exclude_providers=["google"]
        )
        assert picked == "gpt-mini"

    def test_returns_none_when_no_next_tier_candidate_survives(self, base_config):
        picked = next_escalation_model(
            "pro", base_config, 0,
            exclude_providers=["anthropic", "openai"],
        )
        assert picked is None
