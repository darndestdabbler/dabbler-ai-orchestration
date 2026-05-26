"""CLI backward-compatibility regression tests for Set 048 Session 2.

Set 048 §3.1 A4 + D5: existing invocation patterns from before Set 048
landed must continue to work unchanged. The new flags (``--no-router``,
``--accept-suggestions``) are additive only — when absent, all
behavior matches the pre-Set-048 baseline.

These tests are *minimal* (no actual close-out work) — they assert
that the argparse layer accepts and rejects flag combinations the
same way it did before Set 048, and that the new default values
(``no_router=False``, ``accept_suggestions=False``) are correctly
applied.
"""
from __future__ import annotations

import pytest

import close_session
import runtime_mode
import start_session
from runtime_mode import ENV_VAR_NAME


@pytest.fixture(autouse=True)
def _reset_runtime_mode(monkeypatch):
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    runtime_mode.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()


# ---------- start_session: pre-Set-048 invocations work unchanged ----------


def test_start_session_pre_set_048_invocation_still_works():
    """The exact CLI shape used by Set 047 S6 close-out must still parse."""
    parser = start_session._build_arg_parser()
    args = parser.parse_args([
        "--session-set-dir", "docs/session-sets/047-state-file-schema-v4-audit",
        "--session-number", "1",
        "--engine", "claude",
        "--provider", "anthropic",
        "--model", "claude-opus-4-7",
        "--effort", "high",
    ])
    assert args.session_set_dir == "docs/session-sets/047-state-file-schema-v4-audit"
    assert args.session_number == 1
    assert args.engine == "claude"
    assert args.no_router is False  # new flag defaults to False


def test_start_session_with_force_still_works():
    """The --force flag (Set 033) still parses without --no-router."""
    parser = start_session._build_arg_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--force",
    ])
    assert args.force is True
    assert args.no_router is False


def test_start_session_no_router_flag_independently_settable():
    """--no-router is additive; doesn't collide with other flags."""
    parser = start_session._build_arg_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--no-router",
    ])
    assert args.no_router is True
    assert args.force is False


def test_start_session_no_router_with_force_both_set():
    """--no-router and --force are orthogonal; both can be set."""
    parser = start_session._build_arg_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--no-router",
        "--force",
    ])
    assert args.no_router is True
    assert args.force is True


# ---------- close_session: pre-Set-048 invocations work unchanged ----------


def test_close_session_pre_set_048_invocation_still_works():
    """The exact CLI shape used by Set 047 close-outs must still parse."""
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "docs/session-sets/047-state-file-schema-v4-audit",
        "--reason-file", "docs/session-sets/047-state-file-schema-v4-audit/s6-close-reason.md",
        "--manual-verify",
    ])
    assert args.session_set_dir == "docs/session-sets/047-state-file-schema-v4-audit"
    assert args.manual_verify is True
    assert args.no_router is False
    assert args.accept_suggestions is False


def test_close_session_force_with_repair_still_works():
    """Pre-Set-048 --repair --apply combo continues to work."""
    parser = close_session._build_parser()
    args = parser.parse_args(["--repair", "--apply"])
    assert args.repair is True
    assert args.apply is True
    assert args.no_router is False


def test_close_session_no_router_independently_settable():
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--no-router",
    ])
    assert args.no_router is True
    assert args.accept_suggestions is False


def test_close_session_accept_suggestions_independently_settable():
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--accept-suggestions",
    ])
    assert args.accept_suggestions is True
    assert args.no_router is False


def test_close_session_all_new_flags_together():
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--no-router",
        "--accept-suggestions",
        "--manual-verify",
        "--reason-file", "x.md",
    ])
    assert args.no_router is True
    assert args.accept_suggestions is True
    assert args.manual_verify is True
    assert args.reason_file == "x.md"


# ---------- runtime_mode does not affect pre-Set-048 callers ----------


def test_full_mode_runtime_does_not_alter_routing():
    """is_no_router_mode() returns False by default — full-tier behavior
    unchanged for callers that never touch the new resolution."""
    assert runtime_mode.is_no_router_mode() is False


def test_validate_args_unchanged_for_pre_set_048_invocations():
    """The Set 026+ _validate_args contract still rejects/accepts the same combos."""
    parser = close_session._build_parser()
    # Old, valid: manual-verify + reason-file
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--manual-verify",
        "--reason-file", "x.md",
    ])
    err = close_session._validate_args(args)
    assert err is None

    # Old, invalid: force + interactive
    args = parser.parse_args(["--force", "--interactive"])
    err = close_session._validate_args(args)
    assert err is not None
    assert "force" in err.lower()


# ---------- new flag interactions don't break existing _validate_args ----------


def test_no_router_alone_passes_validation():
    """--no-router (no other flags) is a valid invocation."""
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--no-router",
    ])
    assert close_session._validate_args(args) is None


def test_accept_suggestions_alone_passes_validation():
    """--accept-suggestions (no other flags) is also valid."""
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--accept-suggestions",
    ])
    assert close_session._validate_args(args) is None
