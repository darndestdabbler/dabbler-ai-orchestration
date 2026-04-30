"""Unit tests for Session 3 deliverables in ``session_state``:

- ``SessionLifecycleState`` enum
- v1 → v2 lazy migration on read; rewrite-as-v2 on next write
- ``NextOrchestrator`` / ``NextOrchestratorReason`` dataclasses
- ``validate_next_orchestrator``
- ``ModeConfig`` parsing from spec.md's Session Set Configuration block
- ``validate_mode_config``

The tests bypass ``ai-router/`` package import via ``conftest.py`` adding
the package directory to ``sys.path``; modules are imported by filename.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import session_state
from session_state import (
    DEFAULT_OUTSOURCE_MODE,
    ModeConfig,
    NEXT_ORCHESTRATOR_REASON_CODES,
    NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN,
    NextOrchestrator,
    NextOrchestratorReason,
    OUTSOURCE_MODES,
    ROLE_VALUES,
    SCHEMA_VERSION,
    SessionLifecycleState,
    SESSION_STATE_FILENAME,
    mark_session_complete,
    parse_mode_config,
    read_mode_config,
    read_session_state,
    register_session_start,
    validate_mode_config,
    validate_next_orchestrator,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    """Return a fresh, empty session-set directory path."""
    d = tmp_path / "test-set"
    d.mkdir()
    return str(d)


def _write_v1_state(path: str, **overrides) -> None:
    state = {
        "schemaVersion": 1,
        "sessionSetName": "test-set",
        "currentSession": 1,
        "totalSessions": 5,
        "status": "in-progress",
        "startedAt": "2026-04-30T05:00:00-04:00",
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
        },
    }
    state.update(overrides)
    with open(os.path.join(path, SESSION_STATE_FILENAME), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# ---------------------------------------------------------------------------
# SessionLifecycleState
# ---------------------------------------------------------------------------

class TestSessionLifecycleState:
    def test_all_five_states_exist(self):
        assert SessionLifecycleState.WORK_IN_PROGRESS.value == "work_in_progress"
        assert SessionLifecycleState.WORK_VERIFIED.value == "work_verified"
        assert SessionLifecycleState.CLOSEOUT_PENDING.value == "closeout_pending"
        assert SessionLifecycleState.CLOSEOUT_BLOCKED.value == "closeout_blocked"
        assert SessionLifecycleState.CLOSED.value == "closed"

    def test_str_subclass_serializes_as_string(self):
        # str subclass means JSON serialization works without .value
        state = SessionLifecycleState.WORK_IN_PROGRESS
        assert json.dumps({"x": state.value}) == '{"x": "work_in_progress"}'
        assert state == "work_in_progress"


# ---------------------------------------------------------------------------
# Schema version + writer
# ---------------------------------------------------------------------------

class TestRegisterSessionStartV2:
    def test_writes_v2_with_lifecycle_state(self, session_set_dir):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=5,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
            orchestrator_provider="anthropic",
        )
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["schemaVersion"] == 2 == SCHEMA_VERSION
        assert data["lifecycleState"] == "work_in_progress"
        assert data["status"] == "in-progress"  # backward-compat field
        assert data["currentSession"] == 1


class TestMarkSessionCompleteV2:
    def test_writes_closed_lifecycle_state(self, session_set_dir):
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=5,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        mark_session_complete(session_set_dir, verification_verdict="VERIFIED")
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["schemaVersion"] == 2
        assert data["lifecycleState"] == "closed"
        assert data["status"] == "complete"
        assert data["verificationVerdict"] == "VERIFIED"
        assert data["completedAt"] is not None


# ---------------------------------------------------------------------------
# Lazy migration v1 → v2
# ---------------------------------------------------------------------------

class TestLazyMigrationOnRead:
    def test_v1_in_progress_maps_to_work_in_progress(self, session_set_dir):
        _write_v1_state(session_set_dir, status="in-progress")
        state = read_session_state(session_set_dir)
        assert state is not None
        assert state["schemaVersion"] == 2
        assert state["lifecycleState"] == "work_in_progress"
        # Original status field preserved (consumers may still read it)
        assert state["status"] == "in-progress"

    def test_v1_complete_maps_to_closed(self, session_set_dir):
        _write_v1_state(
            session_set_dir,
            status="complete",
            completedAt="2026-04-30T06:00:00-04:00",
            verificationVerdict="VERIFIED",
        )
        state = read_session_state(session_set_dir)
        assert state is not None
        assert state["schemaVersion"] == 2
        assert state["lifecycleState"] == "closed"

    def test_read_does_not_rewrite_file(self, session_set_dir):
        """Lazy migration is in-memory only; file stays v1 until next write."""
        _write_v1_state(session_set_dir)
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        before = open(path, encoding="utf-8").read()
        read_session_state(session_set_dir)
        after = open(path, encoding="utf-8").read()
        assert before == after  # file unchanged

    def test_mark_complete_rewrites_v1_as_v2(self, session_set_dir):
        """Next legitimate write must produce a v2 file from a v1 input."""
        _write_v1_state(session_set_dir, status="in-progress")
        mark_session_complete(session_set_dir, verification_verdict="VERIFIED")
        with open(os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8") as f:
            data = json.load(f)
        assert data["schemaVersion"] == 2
        assert data["lifecycleState"] == "closed"
        assert data["status"] == "complete"

    def test_v2_file_passes_through_unchanged(self, session_set_dir):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=5,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        before = open(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8"
        ).read()
        state = read_session_state(session_set_dir)
        assert state["schemaVersion"] == 2
        # Reading v2 should not perturb the on-disk content either.
        after = open(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8"
        ).read()
        assert before == after

    def test_malformed_v1_status_falls_back_safely(self, session_set_dir):
        """Unknown status should not crash — defaults to work_in_progress."""
        _write_v1_state(session_set_dir, status="something-weird")
        state = read_session_state(session_set_dir)
        assert state["lifecycleState"] == "work_in_progress"
        assert state["schemaVersion"] == 2

    def test_malformed_json_returns_none(self, session_set_dir):
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        assert read_session_state(session_set_dir) is None

    def test_missing_file_returns_none(self, session_set_dir):
        assert read_session_state(session_set_dir) is None


# ---------------------------------------------------------------------------
# NextOrchestrator dataclasses + validator
# ---------------------------------------------------------------------------

def _good_next_orc(
    code: str = "continue-current-trajectory",
    specifics: str = "Session 3 mostly extends session_state.py with similar idioms.",
) -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(code=code, specifics=specifics),
    )


class TestValidateNextOrchestrator:
    def test_passes_with_good_value(self):
        passed, errors = validate_next_orchestrator(_good_next_orc())
        assert passed is True
        assert errors == []

    def test_passes_with_dict_form(self):
        passed, errors = validate_next_orchestrator({
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "reason": {
                "code": "switch-due-to-cost",
                "specifics": "Gemini Flash handled the prior session 30x cheaper.",
            },
        })
        assert passed is True
        assert errors == []

    def test_all_four_reason_codes_accepted(self):
        for code in NEXT_ORCHESTRATOR_REASON_CODES:
            passed, errors = validate_next_orchestrator(_good_next_orc(code=code))
            assert passed is True, f"{code} should be accepted: {errors}"

    @pytest.mark.parametrize(
        "field_name", ["engine", "provider", "model", "effort"]
    )
    def test_missing_top_level_field_fails(self, field_name):
        no = _good_next_orc()
        setattr(no, field_name, "")
        passed, errors = validate_next_orchestrator(no)
        assert passed is False
        assert any(field_name in e for e in errors)

    def test_unknown_reason_code_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(code="invent-a-new-code")
        )
        assert passed is False
        assert any("reason.code" in e for e in errors)

    def test_short_specifics_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="too short")
        )
        assert passed is False
        assert any("specifics" in e for e in errors)

    def test_specifics_at_minimum_length_passes(self):
        # Exactly 30 chars after strip
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="x" * NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN)
        )
        assert passed is True
        assert errors == []

    def test_specifics_one_char_below_min_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="x" * (NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN - 1))
        )
        assert passed is False

    def test_whitespace_only_specifics_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="   " * 20)  # all whitespace
        )
        assert passed is False

    def test_missing_reason_fails(self):
        no = _good_next_orc()
        no.reason = None  # type: ignore[assignment]
        passed, errors = validate_next_orchestrator(no)
        assert passed is False
        assert any("reason" in e for e in errors)

    def test_reason_must_be_object(self):
        passed, errors = validate_next_orchestrator({
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "reason": "just a string",
        })
        assert passed is False
        assert any("reason" in e for e in errors)

    def test_non_dataclass_non_dict_input_fails(self):
        passed, errors = validate_next_orchestrator("not a valid value")
        assert passed is False
        assert len(errors) == 1


# ---------------------------------------------------------------------------
# Mode config parsing
# ---------------------------------------------------------------------------

class TestParseModeConfig:
    def test_default_when_block_missing(self):
        cfg = parse_mode_config("# Some Spec\n\nNo configuration block here.\n")
        assert cfg == ModeConfig()
        assert cfg.outsource_mode == DEFAULT_OUTSOURCE_MODE == "first"
        assert cfg.orchestrator_role is None
        assert cfg.verifier_role is None

    def test_default_outsource_mode_when_omitted(self):
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "totalSessions: 5\n"
            "requiresUAT: false\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "first"
        assert cfg.orchestrator_role is None
        assert cfg.verifier_role is None

    def test_outsource_mode_first_explicit(self):
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: first\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "first"

    def test_outsource_mode_last_with_roles(self):
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: gemini\n"
            "verifierRole: claude\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "gemini"
        assert cfg.verifier_role == "claude"

    def test_unknown_outsource_mode_is_preserved_for_validator_to_flag(self):
        """parse_mode_config preserves invalid values; validate_mode_config flags them."""
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: middle\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "middle"
        passed, errors = validate_mode_config(cfg)
        assert passed is False
        assert any("outsource_mode" in e for e in errors)

    def test_unknown_role_value_is_preserved_for_validator_to_flag(self):
        """An unknown role string is passed through; validate_mode_config
        rejects it under outsourceMode=last (where roles matter).
        """
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: marvin\n"
            "verifierRole: claude\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "marvin"
        assert cfg.verifier_role == "claude"
        passed, errors = validate_mode_config(cfg)
        assert passed is False
        assert any("orchestrator_role" in e for e in errors)

    def test_yaml_fence_with_yml_label(self):
        spec = (
            "## Session Set Configuration\n\n"
            "```yml\n"
            "outsourceMode: last\n"
            "orchestratorRole: openai\n"
            "verifierRole: gemini\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "openai"
        assert cfg.verifier_role == "gemini"

    def test_unfenced_block_is_parsed(self):
        spec = (
            "## Session Set Configuration\n\n"
            "outsourceMode: last\n"
            "orchestratorRole: claude\n"
            "verifierRole: openai\n"
            "\n"
            "---\n"
            "## Next section\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "claude"
        assert cfg.verifier_role == "openai"

    def test_malformed_yaml_falls_back_to_defaults(self):
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: : : nope\n"
            "  orchestratorRole [bad\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == DEFAULT_OUTSOURCE_MODE
        assert cfg.orchestrator_role is None

    def test_bom_prefixed_spec_parses(self):
        """A spec.md saved with a UTF-8 BOM should still parse correctly."""
        spec = (
            "﻿## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: claude\n"
            "verifierRole: gemini\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "claude"
        assert cfg.verifier_role == "gemini"

    def test_fence_in_later_section_is_not_misread(self):
        """A YAML fence in a later section must NOT be picked up as the config."""
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: first\n"
            "```\n"
            "\n"
            "## Some Other Section\n"
            "\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: gemini\n"
            "verifierRole: claude\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        # Must read the first section, not the later one
        assert cfg.outsource_mode == "first"
        assert cfg.orchestrator_role is None
        assert cfg.verifier_role is None

    def test_fenced_yaml_with_internal_comment_keeps_all_keys(self):
        """A YAML comment (`# ...`) inside the fenced config must NOT be
        treated as a markdown heading and truncate the body. Without the
        fence-aware section detection, the comment line would match the
        `#{1,6}\\s` heading pattern and drop everything after it.
        """
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "# this comment must not truncate the block\n"
            "orchestratorRole: gemini\n"
            "verifierRole: claude\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "gemini"
        assert cfg.verifier_role == "claude"

    def test_fenced_yaml_with_internal_dashes_is_not_truncated_early(self):
        """A `---` line inside the fenced config must not truncate the
        section. (yaml.safe_load only returns the first document if the
        body has multiple, but the keys before any internal `---` must
        at minimum be parsed correctly.)
        """
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: openai\n"
            "verifierRole: gemini\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "openai"
        assert cfg.verifier_role == "gemini"

    def test_section_without_fence_then_later_fence_is_not_misread(self):
        """Configuration section ends at the next heading; a later fence
        (e.g., in 'Risks' or 'References') should not be parsed as config.
        """
        spec = (
            "## Session Set Configuration\n\n"
            "outsourceMode: last\n"
            "orchestratorRole: openai\n"
            "verifierRole: claude\n"
            "\n"
            "## Risks\n"
            "\n"
            "```yaml\n"
            "this: should-be-ignored\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "openai"
        assert cfg.verifier_role == "claude"

    def test_yaml_labeled_fence_preferred_over_unlabeled(self):
        """When both an unlabeled and a yaml-labeled fence appear, the
        yaml-labeled fence is the configuration block. This handles specs
        that have a leading example/quote fence followed by the real config.
        """
        spec = (
            "## Session Set Configuration\n\n"
            "```\n"
            "this is an unlabeled fence — should NOT be parsed as config\n"
            "```\n"
            "\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: gemini\n"
            "verifierRole: claude\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "gemini"
        assert cfg.verifier_role == "claude"

    def test_unlabeled_fence_used_when_only_option(self):
        """An unlabeled fence still parses if there is no yaml-labeled fence."""
        spec = (
            "## Session Set Configuration\n\n"
            "```\n"
            "outsourceMode: last\n"
            "orchestratorRole: openai\n"
            "verifierRole: gemini\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "openai"

    def test_tiebreaker_fallback_field_is_ignored(self):
        """Hybrid mode (tiebreakerFallback) is deferred — must not appear in ModeConfig."""
        spec = (
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "orchestratorRole: gemini\n"
            "verifierRole: claude\n"
            "tiebreakerFallback: api\n"
            "```\n"
        )
        cfg = parse_mode_config(spec)
        # Field is not part of ModeConfig — accepted silently in the YAML
        # but not surfaced as a config attribute.
        assert not hasattr(cfg, "tiebreaker_fallback")
        assert not hasattr(cfg, "tiebreakerFallback")


class TestReadModeConfig:
    def test_reads_from_session_set_dir(self, session_set_dir):
        spec_path = os.path.join(session_set_dir, "spec.md")
        with open(spec_path, "w", encoding="utf-8") as f:
            f.write(
                "## Session Set Configuration\n\n"
                "```yaml\n"
                "outsourceMode: last\n"
                "orchestratorRole: gemini\n"
                "verifierRole: claude\n"
                "```\n"
            )
        cfg = read_mode_config(session_set_dir)
        assert cfg.outsource_mode == "last"
        assert cfg.orchestrator_role == "gemini"
        assert cfg.verifier_role == "claude"

    def test_missing_spec_returns_default(self, session_set_dir):
        cfg = read_mode_config(session_set_dir)
        assert cfg == ModeConfig()

    def test_real_session_set_001_parses(self):
        """Smoke test against the actual spec for set 001 — the orchestrator
        must be able to read its own configuration without error.
        """
        repo_root = Path(__file__).resolve().parents[2]
        target = repo_root / "docs" / "session-sets" / (
            "001-queue-contract-and-recovery-foundations"
        )
        if not target.is_dir():
            pytest.skip("session set 001 not present")
        cfg = read_mode_config(str(target))
        # Per spec, this set declares outsourceMode: first
        assert cfg.outsource_mode == "first"


# ---------------------------------------------------------------------------
# Mode config validation
# ---------------------------------------------------------------------------

class TestValidateModeConfig:
    def test_first_mode_passes_with_no_roles(self):
        passed, errors = validate_mode_config(ModeConfig())
        assert passed is True
        assert errors == []

    def test_first_mode_ignores_role_fields(self):
        cfg = ModeConfig(
            outsource_mode="first",
            orchestrator_role="claude",
            verifier_role="claude",  # same role allowed in first mode
        )
        passed, errors = validate_mode_config(cfg)
        assert passed is True

    def test_last_mode_requires_both_roles(self):
        cfg = ModeConfig(outsource_mode="last")
        passed, errors = validate_mode_config(cfg)
        assert passed is False
        assert any("orchestrator_role" in e for e in errors)
        assert any("verifier_role" in e for e in errors)

    def test_last_mode_requires_distinct_roles(self):
        cfg = ModeConfig(
            outsource_mode="last",
            orchestrator_role="claude",
            verifier_role="claude",
        )
        passed, errors = validate_mode_config(cfg)
        assert passed is False
        assert any("differ" in e for e in errors)

    def test_last_mode_with_distinct_roles_passes(self):
        cfg = ModeConfig(
            outsource_mode="last",
            orchestrator_role="gemini",
            verifier_role="claude",
        )
        passed, errors = validate_mode_config(cfg)
        assert passed is True

    def test_outsource_mode_must_be_known(self):
        cfg = ModeConfig(outsource_mode="middle")
        passed, errors = validate_mode_config(cfg)
        assert passed is False
        assert any("outsource_mode" in e for e in errors)


# ---------------------------------------------------------------------------
# Constants exposed for downstream consumers
# ---------------------------------------------------------------------------

class TestConstants:
    def test_outsource_modes_are_first_and_last(self):
        assert OUTSOURCE_MODES == {"first", "last"}

    def test_role_values(self):
        assert ROLE_VALUES == {"claude", "openai", "gemini"}

    def test_reason_codes(self):
        assert NEXT_ORCHESTRATOR_REASON_CODES == {
            "continue-current-trajectory",
            "switch-due-to-blocker",
            "switch-due-to-cost",
            "other",
        }
