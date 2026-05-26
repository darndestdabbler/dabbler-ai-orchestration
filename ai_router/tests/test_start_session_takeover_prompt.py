"""Set 036 Session 4 — CLI takeover prompt tests for start_session.

Covers the TTY-interactive chatSessionId-mismatch prompt added in S4:

(a) non-interactive (no TTY) → no prompt; refuses with
    EXIT_CHECKOUT_CONFLICT (matches the audit-locked verdict).
(b) TTY + chatSessionId mismatch + operator selects "t" → take-over
    proceeds via the force path (EXIT_OK, writer log appended).
(c) TTY + chatSessionId mismatch + operator selects "r" →
    EXIT_READ_ONLY; no state mutation.
(d) TTY + chatSessionId mismatch + operator selects "c" →
    EXIT_CHECKOUT_CONFLICT; no state mutation.
(e) TTY + engine+provider mismatch (NOT chat-id mismatch) → no prompt
    (the modal/CLI prompt is locked to the chat-id case only — the
    engine+provider case stays on the non-interactive refusal path
    per the proposal-addendum §Q3).
(f) Empty / EOF input defaults to cancel.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

import start_session
from session_state import (
    read_session_state,
    synthesize_not_started_state,
)


# Set 046 mid-Session-2 hotfix: hard-coordination enforcement is opt-in
# (default off). Every test in this module exercises the enforcement
# code path (TTY take-over prompt + EXIT_CHECKOUT_CONFLICT refusal), so
# we enable it via the autouse fixture below. The same env var is
# honored by start_session's runtime check.
@pytest.fixture(autouse=True)
def _enforce_coordination(monkeypatch):
    monkeypatch.setenv("DABBLER_ENFORCE_CHECKOUT_COORDINATION", "1")


def _fresh_set(tmp_path: Path) -> Path:
    set_dir = tmp_path / "test-set-takeover-prompt"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "## Session Set Configuration\n\n"
        "```yaml\n"
        "totalSessions: 3\n"
        "requiresUAT: false\n"
        "requiresE2E: false\n"
        "uatStyle: ad-hoc\n"
        "effort: medium\n"
        "```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))
    return set_dir


def _seed_in_flight(
    set_dir: Path,
    *,
    engine: str = "claude",
    provider: str = "anthropic",
    chat_session_id: str | None = "held-chat-aaa",
) -> None:
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = []
    state["currentSession"] = 1
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = "2026-05-20T08:00:00-04:00"
    for entry in state.get("sessions", []):
        if entry.get("number") == 1:
            entry["status"] = "in-progress"
    state["orchestrator"] = {
        "engine": engine,
        "provider": provider,
        "model": "claude-opus-4-7",
        "effort": "medium",
        "chatSessionId": chat_session_id,
        "checkedOutAt": "2026-05-20T08:00:00-04:00",
        "lastActivityAt": "2026-05-20T08:05:00-04:00",
    }
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _args(set_dir: Path, *, chat_session_id: str | None = None, force: bool = False):
    parser = start_session._build_arg_parser()
    base = [
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--provider", "anthropic",
        "--model", "claude-opus-4-7",
        "--effort", "medium",
    ]
    if chat_session_id is not None:
        base.extend(["--chat-session-id", chat_session_id])
    if force:
        base.append("--force")
    return parser.parse_args(base)


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    monkeypatch.delenv("CHAT_SESSION_ID", raising=False)


def _force_non_tty(monkeypatch):
    monkeypatch.setattr(start_session, "_is_interactive_tty", lambda: False)


def _force_tty_with_input(monkeypatch, response: str):
    """Pretend stdin+stderr are TTYs and inject a one-line response.

    Returns a sentinel that asserts the prompt was actually surfaced
    (the prompt-helper writes to stderr; we capture and assert it
    contains the audit-locked options).
    """
    captured_stderr = io.StringIO()
    monkeypatch.setattr(start_session, "_is_interactive_tty", lambda: True)
    monkeypatch.setattr(start_session.sys, "stdin", io.StringIO(response))
    monkeypatch.setattr(start_session.sys, "stderr", captured_stderr)
    return captured_stderr


# ---------------------------------------------------------------------------
# (a) Non-interactive: no prompt, EXIT_CHECKOUT_CONFLICT
# ---------------------------------------------------------------------------

def test_no_tty_refuses_with_exit_checkout_conflict(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    _force_non_tty(monkeypatch)
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT
    # State was not mutated — chatSessionId still names the held holder.
    state = read_session_state(str(set_dir)) or {}
    orch = state["orchestrator"]
    assert orch["chatSessionId"] == "held-aaa"


# ---------------------------------------------------------------------------
# (b) TTY + "t" => take-over via force path
# ---------------------------------------------------------------------------

def test_tty_take_over_proceeds_via_force(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    captured = _force_tty_with_input(monkeypatch, "t\n")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_OK
    # Prompt was surfaced.
    assert "Take Over" in captured.getvalue()
    assert "Read-Only" in captured.getvalue()
    # State now reflects the new chatSessionId.
    state = read_session_state(str(set_dir)) or {}
    assert state["orchestrator"]["chatSessionId"] == "new-bbb"


# ---------------------------------------------------------------------------
# (c) TTY + "r" => EXIT_READ_ONLY, no mutation
# ---------------------------------------------------------------------------

def test_tty_read_only_returns_exit_read_only(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    captured = _force_tty_with_input(monkeypatch, "r\n")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_READ_ONLY
    assert "read-only mode chosen" in captured.getvalue()
    state = read_session_state(str(set_dir)) or {}
    assert state["orchestrator"]["chatSessionId"] == "held-aaa"


# ---------------------------------------------------------------------------
# (d) TTY + "c" => EXIT_CHECKOUT_CONFLICT, no mutation
# ---------------------------------------------------------------------------

def test_tty_cancel_returns_exit_checkout_conflict(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    _force_tty_with_input(monkeypatch, "c\n")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT
    state = read_session_state(str(set_dir)) or {}
    assert state["orchestrator"]["chatSessionId"] == "held-aaa"


# ---------------------------------------------------------------------------
# (e) engine+provider mismatch under TTY: NO prompt (Q3 scope)
# ---------------------------------------------------------------------------

def test_tty_engine_provider_mismatch_no_prompt(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    # Held by a DIFFERENT engine — the modal/CLI prompt does not apply
    # to this case per the audit-locked Q3 scope.
    _seed_in_flight(set_dir, engine="codex", provider="openai", chat_session_id="held-aaa")
    captured = _force_tty_with_input(monkeypatch, "t\n")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT
    # No prompt fired — captured stderr should NOT contain the prompt's
    # "[t] Take Over" choice list (it would on the chat-id path).
    assert "[t] Take Over" not in captured.getvalue()


# ---------------------------------------------------------------------------
# (f) Empty input / EOF defaults to cancel
# ---------------------------------------------------------------------------

def test_tty_empty_input_defaults_to_cancel(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    _force_tty_with_input(monkeypatch, "")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT


def test_tty_garbage_input_defaults_to_cancel(tmp_path: Path, monkeypatch):
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, chat_session_id="held-aaa")
    _force_tty_with_input(monkeypatch, "xyzzy\n")
    rc = start_session.run(_args(set_dir, chat_session_id="new-bbb"))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT
