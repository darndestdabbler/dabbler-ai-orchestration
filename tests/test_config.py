import subprocess

import pytest
import yaml

from ai_router.config import (
    CRITIQUE_ENFORCE_SET,
    load_config,
    resolve_generation_params,
    resolve_transport,
    _split_sections,
)
from tests.conftest import make_config


def _write_config(tmp_path, config):
    path = tmp_path / "router-config.yaml"
    path.write_text(yaml.safe_dump(config), encoding="utf-8")
    return str(path)


@pytest.fixture
def project(tmp_path, monkeypatch):
    """A working directory the overlay can live in. Config discovers the
    project through git, the same discovery the gates use, so the fixture
    has to be a real repository rather than a bare directory."""
    subprocess.run(
        ["git", "init", "-q"], cwd=str(tmp_path), capture_output=True,
    )
    monkeypatch.chdir(tmp_path)
    return tmp_path


class TestLoadConfig:
    def test_bundled_config_loads(self):
        config = load_config()
        assert config["models"]
        assert config["_config_path"].endswith("router-config.yaml")

    def test_missing_file_raises_with_path(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="nope.yaml"):
            load_config(str(tmp_path / "nope.yaml"))

    def test_schema_rejects_missing_providers(self, tmp_path):
        config = make_config()
        del config["providers"]
        with pytest.raises(ValueError, match="schema validation"):
            load_config(_write_config(tmp_path, config))

    def test_schema_rejects_typoed_pricing_row_key(self, tmp_path):
        # A typo'd bound would silently widen a tier to unbounded.
        config = make_config()
        config["models"]["pro"]["pricing"][0]["max_input_token"] = 5
        del config["models"]["pro"]["pricing"][0]["max_input_tokens"]
        with pytest.raises(ValueError, match="schema validation"):
            load_config(_write_config(tmp_path, config))

    def test_schema_rejects_flat_and_pricing_together(self, tmp_path):
        config = make_config()
        config["models"]["pro"]["input_cost_per_1m"] = 1.0
        config["models"]["pro"]["output_cost_per_1m"] = 2.0
        with pytest.raises(ValueError, match="schema validation"):
            load_config(_write_config(tmp_path, config))

    def test_schema_rejects_half_declared_flat_rate(self, tmp_path):
        config = make_config()
        del config["models"]["flash"]["output_cost_per_1m"]
        with pytest.raises(ValueError, match="schema validation"):
            load_config(_write_config(tmp_path, config))

    def test_routable_model_without_rates_rejected(self, tmp_path):
        config = make_config()
        config["models"]["norate"] = {
            "provider": "openai", "model_id": "x", "tier": 2,
            "max_output_tokens": 100,
        }
        with pytest.raises(ValueError, match="declares no rates"):
            load_config(_write_config(tmp_path, config))

    def test_unknown_provider_reference_rejected(self, tmp_path):
        config = make_config()
        config["models"]["flash"]["provider"] = "mystery"
        with pytest.raises(ValueError, match="unknown provider"):
            load_config(_write_config(tmp_path, config))

    def test_unknown_tier_assignment_rejected(self, tmp_path):
        config = make_config()
        config["routing"]["tier_assignments"][2] = "mystery"
        with pytest.raises(ValueError, match="unknown model"):
            load_config(_write_config(tmp_path, config))

    def test_copilot_block_missing_roles_rejected(self, tmp_path):
        config = make_config()
        del config["transports"]["copilot-cli"]["roles"]
        with pytest.raises(ValueError, match="roles"):
            load_config(_write_config(tmp_path, config))

    def test_copilot_bad_timeouts_rejected_at_load(self, tmp_path):
        config = make_config()
        config["transports"]["copilot-cli"]["timeouts"] = {
            "spawn_seconds": 100, "first_byte_seconds": 5,
        }
        with pytest.raises(ValueError, match="spawn_seconds <"):
            load_config(_write_config(tmp_path, config))


class TestResolveTransport:
    def test_default_is_api(self, base_config):
        assert resolve_transport(base_config) == "api"

    def test_config_profile_wins_over_default(self, base_config):
        base_config["transport"] = {"profile": "copilot-cli"}
        assert resolve_transport(base_config) == "copilot-cli"

    def test_env_var_wins_over_config(self, base_config, monkeypatch):
        base_config["transport"] = {"profile": "copilot-cli"}
        monkeypatch.setenv("DABBLER_TRANSPORT", "api")
        assert resolve_transport(base_config) == "api"

    def test_cli_flag_wins_over_env(self, base_config, monkeypatch):
        monkeypatch.setenv("DABBLER_TRANSPORT", "api")
        assert resolve_transport(base_config, "copilot-cli") == "copilot-cli"

    def test_unknown_value_fails_loud_naming_its_source(
        self, base_config, monkeypatch
    ):
        monkeypatch.setenv("DABBLER_TRANSPORT", "carrier-pigeon")
        with pytest.raises(ValueError, match="DABBLER_TRANSPORT"):
            resolve_transport(base_config)


class TestLocalOverrides:
    """The project-local overlay: how a machine states a fact about itself
    without editing the packaged default every install would inherit."""

    def _overlay(self, project, body):
        (project / "local-overrides.yaml").write_text(
            yaml.safe_dump(body), encoding="utf-8"
        )

    def test_overlay_merges_over_the_bundled_base(self, project):
        self._overlay(project, {"transport": {"profile": "copilot-cli"}})
        config = load_config()
        assert resolve_transport(config) == "copilot-cli"
        # Partial: the overlay named one key and inherited the rest.
        assert config["models"]
        assert config["_local_overrides_path"].endswith("local-overrides.yaml")

    def test_typo_in_the_seat_transport_block_is_refused(self, project):
        # The block a seat-only machine most needs to override: a dropped
        # `timeotus` would leave the bundled ceilings quietly in force.
        self._overlay(
            project,
            {"transports": {"copilot-cli": {"timeotus": {"total_seconds": 60}}}},
        )
        with pytest.raises(ValueError, match=r"copilot-cli\.timeotus"):
            load_config()

    def test_open_block_accepts_keys_the_schema_does_not_name(self, project):
        # metrics is an object the schema deliberately leaves unstructured;
        # refusing there would refuse overrides the schema never described.
        self._overlay(project, {"metrics": {"sink": "stdout"}})
        config = load_config()
        assert config["metrics"]["sink"] == "stdout"
        assert config["metrics"]["enabled"] is True  # base survived

    def test_valid_seat_transport_override_still_loads(self, project):
        self._overlay(
            project, {"transports": {"copilot-cli": {"lockfile": "seat.lock"}}}
        )
        config = load_config()
        assert config["transports"]["copilot-cli"]["lockfile"] == "seat.lock"
        assert config["transports"]["copilot-cli"]["roles"]  # base survived

    def test_merged_result_is_schema_validated(self, project):
        self._overlay(project, {"transport": {"profile": "carrier-pigeon"}})
        with pytest.raises(ValueError, match="schema validation"):
            load_config()

    def test_explicitly_named_config_takes_no_overlay(self, project):
        self._overlay(project, {"transport": {"profile": "copilot-cli"}})
        config = load_config(_write_config(project, make_config()))
        assert config["_local_overrides_path"] is None
        assert resolve_transport(config) == "api"

    def test_env_named_config_takes_no_overlay(self, project, monkeypatch):
        self._overlay(project, {"transport": {"profile": "copilot-cli"}})
        monkeypatch.setenv(
            "AI_ROUTER_CONFIG", _write_config(project, make_config())
        )
        config = load_config()
        assert config["_local_overrides_path"] is None
        assert resolve_transport(config) == "api"


class TestGenerationParams:
    def test_task_override_deep_merges_over_model_defaults(self, base_config):
        base_config["models"]["sonnet"]["generation_params"] = {
            "effort": "medium",
            "thinking": {"enabled": True, "type": "adaptive"},
        }
        base_config["task_type_params"] = {
            "formatting": {"sonnet": {"effort": "low",
                                      "thinking": {"enabled": False}}},
        }
        params = resolve_generation_params("sonnet", "formatting", base_config)
        assert params["effort"] == "low"
        assert params["thinking"] == {"enabled": False, "type": "adaptive"}

    def test_no_overrides_returns_model_defaults(self, base_config):
        base_config["models"]["opus"]["generation_params"] = {"effort": "high"}
        assert resolve_generation_params("opus", "x", base_config) == {
            "effort": "high"
        }


class TestSplitSections:
    TEXT = "preamble\n# alpha\nbody a\n## nested\ndeep\n# Beta Two\nbody b\n"

    def test_exact_level_split_and_slugging(self):
        sections = _split_sections(self.TEXT, header_level=1)
        assert sections["alpha"] == "body a\n## nested\ndeep"
        assert sections["beta-two"] == "body b"

class TestPromptTemplates:
    def test_bundled_templates_resolve(self):
        config = load_config()
        assert "code-review" in config["_task_templates"]
        assert config["_verification_template"]
        sonnet_prompt = config["models"]["sonnet"]["_system_prompt"]
        assert sonnet_prompt  # provider section resolved

    def test_missing_template_file_falls_back_to_default(
        self, tmp_path
    ):
        config = make_config()
        config["models"]["flash"]["system_prompt_file"] = "absent.md"
        loaded = load_config(_write_config(tmp_path, config))
        assert "expert software engineer" in (
            loaded["models"]["flash"]["_system_prompt"]
        )


class TestCritiquePipeline:
    """The critique pipeline's authority switch. It ships off, and the mode
    that would let critique artifacts decide anything is refused until the
    code that honours it exists."""

    def _overlay(self, project, body):
        (project / "local-overrides.yaml").write_text(
            yaml.safe_dump(body), encoding="utf-8"
        )

    def test_pipeline_is_off_when_the_block_is_absent(self, project):
        assert load_config()["critique"]["pipeline"] == "off"

    def test_shadow_is_accepted(self, project):
        self._overlay(project, {"critique": {"pipeline": "shadow"}})
        assert load_config()["critique"]["pipeline"] == "shadow"

    def test_enforce_is_refused_by_name(self, project):
        self._overlay(project, {"critique": {"pipeline": "enforce"}})
        with pytest.raises(ValueError) as excinfo:
            load_config()
        assert CRITIQUE_ENFORCE_SET in str(excinfo.value)
