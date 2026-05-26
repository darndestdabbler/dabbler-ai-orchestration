"""Set 036 Session 1 — chatSessionId writer + per-set lifecycle lock tests.

Covers the seven branches enumerated in
``docs/session-sets/036-chatsessionid-and-watcher-scope-implementation/spec.md``
Session 1 Step 7:

(a) fresh check-out writes ``chatSessionId`` correctly
(b) same-(engine, provider, chatSessionId) re-attach is benign
(c) different chatSessionId (with matching engine + provider) is
    refused; refusal message names the holder's chatSessionId
(d) ``--force`` overrides and rewrites chatSessionId
(e) legacy state file (no chatSessionId field) is tolerated on read;
    first new write populates the field
(f) lifecycle-lock contention between simultaneous start_session
    callers serializes correctly (one acquires, one returns
    EXIT_LOCK_CONTENTION when polling exhausted)
(g) ``closeout_succeeded`` event payload includes chatSessionId +
    engine + provider + model

Fixture shape mirrors ``test_checkout_writer.py`` for consistency:
a not-started set with a ``spec.md`` carrying a config block; tests
seed prior state by direct JSON edit so each branch exercises the
writer in isolation.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path

import pytest

import close_session
import close_lock
import start_session
from close_lock import (
    LOCK_FILENAME,
    LockContention,
    acquire_lock,
    release_lock,
)
from session_events import read_events
from session_state import (
    read_session_state,
    synthesize_not_started_state,
)


def _fresh_set(tmp_path: Path, total_sessions: int = 3) -> Path:
    """Create a not-started session set directory with a spec.md.

    The spec carries the canonical ``## Session Set Configuration``
    heading so :func:`_read_total_sessions_from_spec` picks up
    ``totalSessions`` correctly. Without the heading the block
    extractor returns None and the writer falls through to inferring
    total=1 from session_number, which produces a 1-session
    ledger — fine for tests that only touch session 1, but the
    closeout test below needs a multi-session set so the close
    flips to "between sessions" rather than the terminal "set
    complete" state.
    """
    set_dir = tmp_path / "test-set-chatsessionid"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "## Session Set Configuration\n\n"
        "```yaml\n"
        f"totalSessions: {total_sessions}\n"
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
    engine: str,
    provider: str,
    chat_session_id: object = "<unset>",
    model: str = "claude-opus-4-7",
    effort: str = "medium",
    session_number: int = 1,
) -> dict:
    """Seed the state file so a session is already in flight.

    ``chat_session_id`` sentinel ``"<unset>"`` means "do not include
    the chatSessionId key on the orchestrator block" — the pre-Set-036
    legacy shape. ``None`` records the field present-but-null
    (Set 036+ writer with no ID at write time). Any string records
    the field with that value.
    """
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = []
    state["currentSession"] = session_number
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = "2026-05-20T08:00:00-04:00"
    for entry in state.get("sessions", []):
        if entry.get("number") == session_number:
            entry["status"] = "in-progress"
    orch: dict = {
        "engine": engine,
        "provider": provider,
        "model": model,
        "effort": effort,
        "checkedOutAt": "2026-05-20T08:00:00-04:00",
        "lastActivityAt": "2026-05-20T08:05:00-04:00",
    }
    if chat_session_id != "<unset>":
        orch["chatSessionId"] = chat_session_id
    state["orchestrator"] = orch
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return state


def _args(set_dir: Path, **overrides):
    parser = start_session._build_arg_parser()
    base = [
        "--session-set-dir", str(set_dir),
        "--engine", overrides.pop("engine", "claude"),
        "--model", overrides.pop("model", "claude-opus-4-7"),
        "--effort", overrides.pop("effort", "medium"),
        "--provider", overrides.pop("provider", "anthropic"),
    ]
    if "session_number" in overrides:
        base.extend(["--session-number", str(overrides.pop("session_number"))])
    chat_session_id = overrides.pop("chat_session_id", "<unset>")
    if chat_session_id != "<unset>":
        if chat_session_id is not None:
            base.extend(["--chat-session-id", str(chat_session_id)])
    if overrides.pop("force", False):
        base.append("--force")
    args = parser.parse_args(base)
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Strip CHAT_SESSION_ID from the env so tests opt-in explicitly.

    The env-var fallback in ``_resolve_chat_session_id`` would
    otherwise leak host environment into every test that didn't
    explicitly pass ``--chat-session-id``.
    """
    monkeypatch.delenv("CHAT_SESSION_ID", raising=False)


# ---------------------------------------------------------------------------
# (a) Fresh check-out writes chatSessionId correctly
# ---------------------------------------------------------------------------

def test_fresh_check_out_writes_chat_session_id(tmp_path: Path):
    """First start_session against a not-started set populates
    ``chatSessionId`` from the explicit CLI argument."""
    set_dir = _fresh_set(tmp_path)
    rc = start_session.run(_args(
        set_dir, chat_session_id="chat-id-aaa-111",
    ))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator")
    assert isinstance(orch, dict)
    assert orch.get("chatSessionId") == "chat-id-aaa-111"


def test_fresh_check_out_writes_none_when_unsupplied(tmp_path: Path):
    """Strict-on-write contract: when neither --chat-session-id nor
    $CHAT_SESSION_ID is set, the writer still records the field with
    a None value (rather than omitting it). Downstream readers use
    key presence + None vs. key absence to tell Set-036+ from
    pre-Set-036 state files."""
    set_dir = _fresh_set(tmp_path)
    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert "chatSessionId" in orch, (
        "strict-on-write: chatSessionId key must be present on every "
        "new write, even when the resolved value is None"
    )
    assert orch.get("chatSessionId") is None


def test_fresh_check_out_picks_up_env_var(tmp_path: Path, monkeypatch):
    """When --chat-session-id is omitted but $CHAT_SESSION_ID is set,
    the writer falls back to the env value."""
    set_dir = _fresh_set(tmp_path)
    monkeypatch.setenv("CHAT_SESSION_ID", "env-supplied-chat-id-222")

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "env-supplied-chat-id-222"


# ---------------------------------------------------------------------------
# (b) Same-(engine, provider, chatSessionId) re-attach is benign
# ---------------------------------------------------------------------------

def test_same_composite_reattach_is_benign(tmp_path: Path):
    """When the existing block matches caller on the full
    ``engine + provider + chatSessionId`` composite, re-running
    start_session succeeds idempotently and preserves
    ``checkedOutAt``."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id="chat-id-aaa-111",
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        chat_session_id="chat-id-aaa-111",
    ))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "chat-id-aaa-111"
    assert orch.get("checkedOutAt") == "2026-05-20T08:00:00-04:00", (
        "same-composite re-attach must preserve checkedOutAt"
    )


# ---------------------------------------------------------------------------
# (c) Different chatSessionId (same engine + provider) is refused
# ---------------------------------------------------------------------------

def test_different_chat_session_id_refuses(
    tmp_path: Path, capsys, monkeypatch
):
    """A caller with the same engine+provider but a different
    chatSessionId is refused with EXIT_CHECKOUT_CONFLICT, and the
    error message names the existing chatSessionId so the operator
    can identify the conflicting chat.

    Set 046 mid-Session-2 hotfix: enforcement is opt-in."""
    monkeypatch.setenv("DABBLER_ENFORCE_CHECKOUT_COORDINATION", "1")
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id="chat-id-aaa-111",
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        chat_session_id="chat-id-bbb-222",
    ))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT, (
        f"different chatSessionId must refuse with "
        f"EXIT_CHECKOUT_CONFLICT (4); got {rc}"
    )

    err = capsys.readouterr().err
    assert "chat-id-aaa-111" in err, (
        "refusal must name the existing chatSessionId so the operator "
        "can identify the conflicting chat"
    )
    assert "chat-id-bbb-222" in err, (
        "refusal must name the caller's chatSessionId so the operator "
        "sees both sides of the conflict"
    )

    # State must be unchanged: chatSessionId still the original value.
    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "chat-id-aaa-111"


def test_refusal_message_for_legacy_state_calls_out_no_chat_id(
    tmp_path: Path, capsys, monkeypatch,
):
    """When the prior state has no chatSessionId field (pre-Set-036
    legacy shape), the tolerant-on-read path treats engine+provider
    match as same-holder. But when engine+provider ALSO differ, the
    H3 refusal must call out "no chat session ID recorded" so the
    operator sees the legacy state explicitly rather than being
    confused by an empty composite.

    Set 046 mid-Session-2 hotfix: enforcement is opt-in."""
    monkeypatch.setenv("DABBLER_ENFORCE_CHECKOUT_COORDINATION", "1")
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id="<unset>",  # legacy block — no chatSessionId field
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        engine="gpt-5-4",
        provider="openai",
        chat_session_id="chat-id-bbb-222",
    ))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT

    err = capsys.readouterr().err
    assert "no chat session ID recorded" in err, (
        "refusal against a legacy (no-chatSessionId) prior block must "
        "name the missing-field state explicitly"
    )


# ---------------------------------------------------------------------------
# (d) --force overrides and rewrites chatSessionId
# ---------------------------------------------------------------------------

def test_force_override_rewrites_chat_session_id(
    tmp_path: Path, monkeypatch,
):
    """With --force, a chatSessionId mismatch (engine+provider also
    optionally differing) is bypassed; the new chatSessionId is
    written and the writer log records the handoff including both
    chatSessionIds."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id="chat-id-aaa-111",
    )

    log_path = tmp_path / "writer.log"
    monkeypatch.setattr(start_session, "ORCHESTRATOR_WRITER_LOG", str(log_path))

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        chat_session_id="chat-id-bbb-222",
        force=True,
    ))
    assert rc == start_session.EXIT_OK, (
        f"--force must override the chatSessionId mismatch; got rc={rc}"
    )

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "chat-id-bbb-222"
    # checkedOutAt must have rewritten because the H4 identity changed.
    assert orch.get("checkedOutAt") != "2026-05-20T08:00:00-04:00", (
        "force-override rewrites checkedOutAt (authority handoff)"
    )

    assert log_path.is_file(), "writer log was not created on force-override"
    log = log_path.read_text(encoding="utf-8")
    assert log.count("force-override") == 1
    assert "chat-id-aaa-111" in log, (
        "writer log line must name the prior chatSessionId"
    )
    assert "chat-id-bbb-222" in log, (
        "writer log line must name the new chatSessionId"
    )


# ---------------------------------------------------------------------------
# (e) Legacy state file: missing chatSessionId tolerated on read,
#     populated strictly on first new write
# ---------------------------------------------------------------------------

def test_legacy_no_chat_session_id_tolerated_then_populated(tmp_path: Path):
    """Tolerant-on-read: a prior block missing the chatSessionId field
    entirely is treated as same-holder for engine+provider matches.
    The first new write populates the field strictly with the
    caller-supplied value (or None per the strict-on-write contract)."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id="<unset>",  # legacy block — no chatSessionId field
    )

    # Confirm the seed shape.
    pre = read_session_state(str(set_dir)) or {}
    pre_orch = pre.get("orchestrator") or {}
    assert "chatSessionId" not in pre_orch, (
        "fixture: legacy block must omit the chatSessionId field"
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        chat_session_id="chat-id-fresh-333",
    ))
    assert rc == start_session.EXIT_OK, (
        f"legacy block + matching engine+provider must be tolerated; "
        f"got rc={rc}"
    )

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "chat-id-fresh-333", (
        "first new write must populate chatSessionId strictly"
    )


def test_prior_chat_session_id_null_tolerated_then_populated(tmp_path: Path):
    """Tolerant-on-read (second branch): a prior block with the
    chatSessionId key *present* but value ``None`` (Set 036+ writer
    that had no ID to record at the time of write) is also treated
    as same-holder for engine+provider matches. The first new write
    with a non-null ID populates the field strictly.

    Distinct from ``test_legacy_no_chat_session_id_tolerated_then_populated``
    which exercises the key-absent variant. Round B verifier finding:
    the predicate explicitly branches on both ``not present`` and
    ``present and None``; both deserve coverage."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        chat_session_id=None,  # field present, value None
    )

    # Confirm the seed shape.
    pre = read_session_state(str(set_dir)) or {}
    pre_orch = pre.get("orchestrator") or {}
    assert "chatSessionId" in pre_orch, (
        "fixture: Set 036+ legacy-shape block must have the key present"
    )
    assert pre_orch.get("chatSessionId") is None, (
        "fixture: value must be None for this branch"
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        chat_session_id="chat-id-strict-444",
    ))
    assert rc == start_session.EXIT_OK, (
        f"prior None chatSessionId + matching engine+provider must be "
        f"tolerated; got rc={rc}"
    )

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") == "chat-id-strict-444"
    assert orch.get("checkedOutAt") == "2026-05-20T08:00:00-04:00", (
        "tolerant-on-read same-holder re-attach must preserve checkedOutAt"
    )


# ---------------------------------------------------------------------------
# (f) Lifecycle-lock contention between simultaneous start_session
# ---------------------------------------------------------------------------

def test_lock_contention_returns_exit_5(tmp_path: Path, monkeypatch, capsys):
    """A caller that cannot acquire the lifecycle lock within the
    polling timeout returns EXIT_LOCK_CONTENTION (5). We force the
    contention by acquiring the lock directly in this test thread,
    then dropping the timeout to a value short enough to keep the
    test fast."""
    set_dir = _fresh_set(tmp_path)

    # Shrink the polling timeout so the test does not wait 30 s.
    monkeypatch.setattr(
        start_session, "DEFAULT_ACQUIRE_TIMEOUT_SECONDS", 0.5,
    )

    # Hold the lock from the test thread.
    handle = acquire_lock(str(set_dir), worker_id="test-blocker")
    try:
        rc = start_session.run(_args(set_dir))
    finally:
        release_lock(handle)

    assert rc == start_session.EXIT_LOCK_CONTENTION, (
        f"lock contention must return EXIT_LOCK_CONTENTION (5); got {rc}"
    )
    err = capsys.readouterr().err
    assert "lifecycle lock contention" in err, (
        "contention error must mention the lifecycle lock"
    )


def test_lock_acquired_when_no_peer_holds(tmp_path: Path):
    """Sanity: when no peer holds the lock, start_session acquires
    cleanly and leaves the lock file removed at exit (release_lock
    cleanup)."""
    set_dir = _fresh_set(tmp_path)
    rc = start_session.run(_args(set_dir, chat_session_id="solo-chat-id"))
    assert rc == start_session.EXIT_OK
    lock_path = os.path.join(str(set_dir), LOCK_FILENAME)
    assert not os.path.exists(lock_path), (
        "start_session must release the lifecycle lock on exit"
    )


# ---------------------------------------------------------------------------
# (g) closeout_succeeded event payload includes
#     chatSessionId + engine + provider + model
# ---------------------------------------------------------------------------

def test_closeout_succeeded_payload_includes_orchestrator_identity(
    tmp_path: Path, monkeypatch,
):
    """The closeout_succeeded event's payload must carry
    ``chatSessionId``, ``engine``, ``provider``, and ``model`` snapshot
    fields (Set 036 Q4 audit trail). Verifies via direct call into
    ``close_session.run`` against a started-and-disposition'd set."""
    set_dir = _fresh_set(tmp_path)

    # Drive a real start_session so the orchestrator block is
    # populated by the production writer rather than hand-crafted.
    rc = start_session.run(_args(
        set_dir,
        chat_session_id="chat-id-closeout-aaa",
    ))
    assert rc == start_session.EXIT_OK

    # Stub the gate predicates to all pass. close_session's contract
    # is that the gate runs cleanly; we are testing the event payload,
    # not the gate's correctness (the gate is exercised in
    # test_close_session_skeleton.py and test_gate_checks.py).
    monkeypatch.setattr(
        close_session,
        "_run_gate_checks",
        lambda *a, **k: [],
    )

    # Pretend a disposition.json is present. close_session uses
    # ``disposition.verification_method`` to decide the recorded
    # ``method`` field on the event; we synthesize the minimum
    # shape the codepath consults.
    class _StubDisposition:
        verification_method = "skipped"

    monkeypatch.setattr(
        close_session,
        "_read_disposition_or_none",
        lambda _: _StubDisposition(),
    )
    monkeypatch.setattr(
        close_session,
        "_is_already_closed",
        lambda _: False,
    )

    # Build an argparse namespace mirroring `close_session --json`.
    parser = close_session._build_parser()
    args = parser.parse_args([
        "--session-set-dir", str(set_dir),
    ])
    outcome = close_session.run(args)
    assert outcome.result == "succeeded", (
        f"close_session must succeed; got {outcome.result} "
        f"(messages={outcome.messages})"
    )

    events = read_events(str(set_dir))
    closeouts = [
        ev for ev in events if ev.event_type == "closeout_succeeded"
    ]
    assert closeouts, "no closeout_succeeded event was emitted"
    payload = closeouts[-1].fields
    assert payload.get("chatSessionId") == "chat-id-closeout-aaa", (
        f"closeout_succeeded payload must include chatSessionId; got "
        f"fields={payload}"
    )
    assert payload.get("engine") == "claude"
    assert payload.get("provider") == "anthropic"
    assert payload.get("model") == "claude-opus-4-7"


def test_closeout_succeeded_payload_when_chat_session_id_is_none(
    tmp_path: Path, monkeypatch,
):
    """Q4 audit-trail contract distinguishes ``chatSessionId: None``
    in the payload from key-omitted. A close-out that runs against a
    state file whose orchestrator block has ``chatSessionId: null``
    (Set 036+ writer with no ID at write time) must emit the key
    in the payload with a ``None`` value — not omit it.

    Round B verifier finding: the docstring promises this distinction
    but no test enforces it. Cheap to test and the subtlety is the
    most regression-prone part of the Q4 contract."""
    set_dir = _fresh_set(tmp_path)

    # Drive start_session WITHOUT a chat_session_id → orchestrator
    # block records the field with value None (strict-on-write).
    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    # Confirm the orchestrator block has chatSessionId: None.
    pre = read_session_state(str(set_dir)) or {}
    pre_orch = pre.get("orchestrator") or {}
    assert pre_orch.get("chatSessionId") is None
    assert "chatSessionId" in pre_orch

    class _StubDisposition:
        verification_method = "skipped"

    monkeypatch.setattr(close_session, "_run_gate_checks", lambda *a, **k: [])
    monkeypatch.setattr(
        close_session,
        "_read_disposition_or_none",
        lambda _: _StubDisposition(),
    )
    monkeypatch.setattr(close_session, "_is_already_closed", lambda _: False)

    parser = close_session._build_parser()
    args = parser.parse_args(["--session-set-dir", str(set_dir)])
    outcome = close_session.run(args)
    assert outcome.result == "succeeded"

    events = read_events(str(set_dir))
    closeouts = [
        ev for ev in events if ev.event_type == "closeout_succeeded"
    ]
    assert closeouts, "no closeout_succeeded event was emitted"
    payload = closeouts[-1].fields
    assert "chatSessionId" in payload, (
        "closeout_succeeded payload must include the chatSessionId "
        "KEY even when its value is None (per Q4 docstring contract)"
    )
    assert payload.get("chatSessionId") is None, (
        f"chatSessionId value must be None, got {payload.get('chatSessionId')!r}"
    )
    # engine + provider + model still populated from the orch block.
    assert payload.get("engine") == "claude"
    assert payload.get("provider") == "anthropic"
    assert payload.get("model") == "claude-opus-4-7"


# ---------------------------------------------------------------------------
# Additional sanity: legacy lock-file sweep on acquisition
# ---------------------------------------------------------------------------

def test_legacy_close_session_lock_swept_when_stale(tmp_path: Path):
    """A pre-Set-036 ``.close_session.lock`` left behind by a crashed
    close_session must be swept on the new acquisition path so it
    does not block a legitimate start_session indefinitely."""
    set_dir = _fresh_set(tmp_path)
    legacy_path = os.path.join(str(set_dir), close_lock.LEGACY_LOCK_FILENAME)
    # Write a stale legacy lock — old timestamp + a dead PID.
    legacy_record = {
        "pid": 999_999,  # unlikely to be live
        "worker_id": "pre-set-036-ghost",
        "acquired_at": "2026-04-01T00:00:00-04:00",
    }
    with open(legacy_path, "w", encoding="utf-8") as f:
        json.dump(legacy_record, f)

    rc = start_session.run(_args(set_dir, chat_session_id="post-sweep-chat"))
    assert rc == start_session.EXIT_OK, (
        f"start_session must sweep the stale legacy lock; got rc={rc}"
    )
    assert not os.path.exists(legacy_path), (
        "stale legacy lock must be removed by the migration sweep"
    )


# ---------------------------------------------------------------------------
# Round A finding (Blocker): dual-acquisition serializes against a live
# legacy holder. A pre-Set-036 close_session that holds .close_session.lock
# must block the new-name acquisition from succeeding.
# ---------------------------------------------------------------------------

def test_live_legacy_lock_blocks_new_acquisition(tmp_path: Path):
    """A live ``.close_session.lock`` held by a pre-Set-036 writer
    must block the new dual-acquire path. The new-name lock must NOT
    be created when the legacy lock is held live (no leaked
    half-acquired state)."""
    set_dir = _fresh_set(tmp_path)
    legacy_path = os.path.join(str(set_dir), close_lock.LEGACY_LOCK_FILENAME)
    new_path = os.path.join(str(set_dir), close_lock.LOCK_FILENAME)

    # Simulate a live pre-Set-036 close_session holding the legacy
    # lock. Use the test process's own PID so the liveness probe
    # treats it as live (the test process IS live).
    live_record = {
        "pid": os.getpid(),
        "worker_id": "pre-set-036-live-close_session",
        # Fresh timestamp so the TTL check does not reclaim.
        "acquired_at": "9999-01-01T00:00:00+00:00",
    }
    with open(legacy_path, "w", encoding="utf-8") as f:
        json.dump(live_record, f)

    with pytest.raises(LockContention) as exc_info:
        acquire_lock(str(set_dir), worker_id="new-writer")
    assert "legacy-interop lock" in str(exc_info.value), (
        "contention error must call out the legacy-interop file by name"
    )

    # Crucially: the new-name file must NOT exist after the failed
    # acquisition — half-acquired state would let a parallel writer
    # see a stale .lifecycle.lock and reclaim it via TTL later.
    assert not os.path.exists(new_path), (
        "failed acquisition must roll back the new-name file"
    )
    # The legacy lock itself stays — we never touch a live holder.
    assert os.path.isfile(legacy_path), (
        "live legacy lock must not be removed by a failed acquisition"
    )

    # Cleanup so the fixture teardown does not see a leaked file.
    os.unlink(legacy_path)


def test_dual_acquire_creates_both_files(tmp_path: Path):
    """A successful acquisition holds BOTH the new and legacy lock
    files so a legacy reader still serializes correctly during the
    R1 alias window."""
    set_dir = _fresh_set(tmp_path)
    new_path = os.path.join(str(set_dir), close_lock.LOCK_FILENAME)
    legacy_path = os.path.join(str(set_dir), close_lock.LEGACY_LOCK_FILENAME)

    handle = acquire_lock(str(set_dir), worker_id="dual-acquire-test")
    try:
        assert os.path.isfile(new_path), (
            "dual-acquire must create the new-name file"
        )
        assert os.path.isfile(legacy_path), (
            "dual-acquire must ALSO create the legacy file so a "
            "pre-Set-036 reader sees a live holder"
        )
    finally:
        release_lock(handle)

    # Release removes both.
    assert not os.path.exists(new_path)
    assert not os.path.exists(legacy_path)


# ---------------------------------------------------------------------------
# Round A finding (Major): explicit --chat-session-id "" clears the env.
# ---------------------------------------------------------------------------

def test_explicit_empty_string_clears_env(tmp_path: Path, monkeypatch):
    """``--chat-session-id ""`` is an explicit CLI override that
    clears any inherited ``$CHAT_SESSION_ID``. The state file must
    record None, not the env value."""
    set_dir = _fresh_set(tmp_path)
    monkeypatch.setenv("CHAT_SESSION_ID", "ambient-env-value-should-be-ignored")

    parser = start_session._build_arg_parser()
    args = parser.parse_args([
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--provider", "anthropic",
        "--chat-session-id", "",
    ])
    rc = start_session.run(args)
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("chatSessionId") is None, (
        "explicit empty --chat-session-id must override the env; "
        f"got chatSessionId={orch.get('chatSessionId')!r}"
    )
