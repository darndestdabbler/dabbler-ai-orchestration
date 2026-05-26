"""Set 033 Session 1 — orchestrator check-out / check-in writer tests.

Covers the six branches enumerated in
``docs/session-sets/033-orchestrator-checkout-checkin-implementation/spec.md``
Session 1 Step 6:

(a) fresh session start writes ``checkedOutAt = lastActivityAt``
(b) same-holder re-attach bumps only ``lastActivityAt`` (preserves
    ``checkedOutAt``)
(c) different-holder refusal returns non-zero + does NOT mutate
(d) refusal message contains both the holder identity AND both
    release paths
(e) ``--force`` writes through + appends to writer log
(f) tolerated read of an in-flight set with no ``checkedOutAt``
    (pre-Set-033 writer migration)

Where these tests differ from ``test_start_session.py``:

- ``test_start_session.py`` covers the boundary-enforcement layer
  (in-flight session, closed-session re-open, skip-ahead) and
  next-session inference — the pre-Set-033 contract.
- This file covers the H3 + H4 + OQ1 layer added in Set 033 S1: the
  ``orchestrator`` block as the canonical check-out record, the
  ``engine + provider`` identity predicate, the +2 timestamp fields,
  the ``--force`` override path, and the writer-log audit trail.

Fixture shape matches ``test_start_session.py`` for consistency: a
not-started set with a ``spec.md`` carrying a config block. Tests
seed prior state (the existing in-progress orchestrator block) by
direct JSON edit so each branch is exercised in isolation, rather
than chaining ``register_session_start`` calls (which would couple
this test file's coverage to behaviors tested elsewhere).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import start_session
from session_state import (
    read_session_state,
    synthesize_not_started_state,
)


def _fresh_set(tmp_path: Path, total_sessions: int = 3) -> Path:
    """Create a not-started session set directory with a spec.md."""
    set_dir = tmp_path / "test-set-checkout"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
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
    model: str = "claude-opus-4-7",
    effort: str = "medium",
    session_number: int = 1,
    checked_out_at: str | None = "2026-05-20T08:00:00-04:00",
    last_activity_at: str | None = "2026-05-20T08:05:00-04:00",
) -> dict:
    """Seed the state file so a session is already in flight under
    *engine + provider*. Mimics what register_session_start would have
    written previously, with ``checkedOutAt`` / ``lastActivityAt``
    explicit so we can detect preservation vs. rewrite in each branch.

    ``checked_out_at = None`` emulates the pre-Set-033 writer (no
    timestamp field on the orchestrator block) — used by branch (f).
    """
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = []
    state["currentSession"] = session_number
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = checked_out_at or "2026-05-20T08:00:00-04:00"
    for entry in state.get("sessions", []):
        if entry.get("number") == session_number:
            entry["status"] = "in-progress"
    orch: dict = {
        "engine": engine,
        "provider": provider,
        "model": model,
        "effort": effort,
    }
    if checked_out_at is not None:
        orch["checkedOutAt"] = checked_out_at
    if last_activity_at is not None:
        orch["lastActivityAt"] = last_activity_at
    state["orchestrator"] = orch
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return state


def _args(set_dir: Path, **overrides) -> "start_session.argparse.Namespace":
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
    if overrides.pop("force", False):
        base.append("--force")
    args = parser.parse_args(base)
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


# ---------------------------------------------------------------------------
# (a) Fresh check-out: checkedOutAt == lastActivityAt
# ---------------------------------------------------------------------------

def test_fresh_session_writes_checked_out_at_equal_to_last_activity_at(
    tmp_path: Path,
):
    """On a not-started set, the first start_session writes a
    fresh ``checkedOutAt`` and a ``lastActivityAt`` mirroring it.
    Both are populated; the writer's ``_now_iso()`` returns the
    same value for both."""
    set_dir = _fresh_set(tmp_path)
    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator")
    assert isinstance(orch, dict)
    assert isinstance(orch.get("checkedOutAt"), str)
    assert isinstance(orch.get("lastActivityAt"), str)
    assert orch["checkedOutAt"] == orch["lastActivityAt"], (
        "fresh check-out: ``lastActivityAt`` must mirror "
        "``checkedOutAt`` (single _now_iso() call within the writer)"
    )


# ---------------------------------------------------------------------------
# (b) Same-holder re-attach: checkedOutAt preserved, lastActivityAt bumped
# ---------------------------------------------------------------------------

def test_same_holder_reattach_preserves_checked_out_at_bumps_last_activity(
    tmp_path: Path,
):
    """When the existing orchestrator block matches the caller on
    (engine, provider), re-running start_session preserves
    ``checkedOutAt`` and only bumps ``lastActivityAt``."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        checked_out_at="2026-05-20T08:00:00-04:00",
        last_activity_at="2026-05-20T08:05:00-04:00",
    )

    rc = start_session.run(_args(set_dir, session_number=1))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("checkedOutAt") == "2026-05-20T08:00:00-04:00", (
        "same-holder re-attach must preserve checkedOutAt"
    )
    # lastActivityAt is now (a fresh ISO string), which is strictly
    # after the seeded "2026-05-20T08:05:00-04:00". Compare as
    # strings since ISO 8601 sorts lexicographically when the
    # offset is the same — both 2026 dates with the writer's
    # local offset. Robustness check: just confirm it changed.
    assert orch.get("lastActivityAt") != "2026-05-20T08:05:00-04:00", (
        "same-holder re-attach must bump lastActivityAt"
    )
    assert isinstance(orch.get("lastActivityAt"), str)


def test_same_holder_reattach_updates_model_and_effort_in_place(
    tmp_path: Path,
):
    """Same-holder re-attach with a different ``model`` / ``effort``
    must update those mutable fields in place. ``model`` is below the
    H4 identity (engine + provider is the composite); changes do not
    constitute a different holder."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="medium",
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        model="claude-sonnet-4-6",
        effort="high",
    ))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("model") == "claude-sonnet-4-6"
    assert orch.get("effort") == "high"
    assert orch.get("checkedOutAt") == "2026-05-20T08:00:00-04:00", (
        "model/effort change is NOT a re-check-out: checkedOutAt "
        "must survive (H4: engine + provider composite is the "
        "identity, model is mutable in place)"
    )


# ---------------------------------------------------------------------------
# (c) Different-holder refusal: non-zero exit, no mutation
# ---------------------------------------------------------------------------

def test_different_holder_default_off_writes_through_without_refusal(
    tmp_path: Path, capsys, monkeypatch
):
    """Set 046 mid-Session-2 hotfix: with ``DABBLER_ENFORCE_CHECKOUT_
    COORDINATION`` UNSET (the default), a different-holder claim
    proceeds and rewrites the orchestrator block. The writer log
    records the handoff so the change is auditable, but the operator
    is not blocked by a refusal toast.

    This is the contract Set 033's enforcement layer used to violate:
    the operator running claude on machine A and codex on machine B
    against the same workspace would get a poll/force/dismiss toast
    on B that blocked normal work. The default-off behavior treats
    every handoff as authority transfer and lets the user manage
    coordination through observation (the orchestrator block + writer
    log) rather than enforcement."""
    # Explicitly clear the env var in case the test environment has
    # it set globally.
    monkeypatch.delenv(
        "DABBLER_ENFORCE_CHECKOUT_COORDINATION", raising=False
    )
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir, engine="claude", provider="anthropic",
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        engine="gpt-5-4",
        provider="openai",
    ))
    assert rc == start_session.EXIT_OK, (
        f"default-off coordination must let the handoff through; "
        f"got {rc}"
    )

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("engine") == "gpt-5-4", (
        "new holder's engine must be recorded after handoff"
    )
    assert orch.get("provider") == "openai", (
        "new holder's provider must be recorded after handoff"
    )
    capsys.readouterr()  # drain


def test_different_holder_refuses_with_exit_4(
    tmp_path: Path, capsys, monkeypatch
):
    """An existing in-flight session held by Claude/Anthropic + a
    caller of GPT-5-4/OpenAI without --force exits with the new
    EXIT_CHECKOUT_CONFLICT (4) code and does NOT mutate state.

    Set 046 mid-Session-2 hotfix: enforcement is opt-in. The test
    explicitly enables it via the env var so the refusal path stays
    under test; production callers see the default-off "always
    succeed (with writer-log audit)" behavior."""
    monkeypatch.setenv("DABBLER_ENFORCE_CHECKOUT_COORDINATION", "1")
    set_dir = _fresh_set(tmp_path)
    seeded = _seed_in_flight(
        set_dir, engine="claude", provider="anthropic",
    )

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        engine="gpt-5-4",
        provider="openai",
    ))
    assert rc == start_session.EXIT_CHECKOUT_CONFLICT, (
        f"expected EXIT_CHECKOUT_CONFLICT (4), got {rc} "
        f"(EXIT_OK={start_session.EXIT_OK}, "
        f"EXIT_USAGE={start_session.EXIT_USAGE}, "
        f"EXIT_BOUNDARY={start_session.EXIT_BOUNDARY})"
    )

    # State must be unchanged: same orchestrator block, same
    # currentSession, no new ``checkedOutAt``.
    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("engine") == "claude"
    assert orch.get("provider") == "anthropic"
    assert orch.get("checkedOutAt") == seeded["orchestrator"]["checkedOutAt"]
    assert orch.get("lastActivityAt") == seeded["orchestrator"]["lastActivityAt"]
    capsys.readouterr()  # drain so this doesn't leak into the next test


# ---------------------------------------------------------------------------
# (d) Refusal message: holder identity + both release paths
# ---------------------------------------------------------------------------

def test_refusal_message_names_holder_and_both_release_paths(
    tmp_path: Path, capsys, monkeypatch
):
    """The H3 refusal error must name (a) the current holder's
    ``engine + provider`` identity and (b) BOTH release paths —
    ``--force`` and the ``Release Check-Out`` Command Palette
    action. The Set 033 verdict makes this contract operator-facing,
    so the error wording matters.

    Set 046 mid-Session-2 hotfix: refusal-message coverage runs
    under explicit enforcement-on."""
    monkeypatch.setenv("DABBLER_ENFORCE_CHECKOUT_COORDINATION", "1")
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(set_dir, engine="claude", provider="anthropic")

    start_session.run(_args(
        set_dir,
        session_number=1,
        engine="gpt-5-4",
        provider="openai",
    ))
    err = capsys.readouterr().err

    # Holder identity (H4): both engine and provider must appear in
    # the error so the operator can identify the conflicting
    # orchestrator without consulting external state.
    assert "claude" in err, "holder engine missing from refusal"
    assert "anthropic" in err, "holder provider missing from refusal"

    # Both release paths (H3 explicit requirement).
    assert "--force" in err, (
        "refusal must mention --force as a release path"
    )
    assert "Release Check-Out" in err, (
        "refusal must mention the Command Palette 'Release Check-Out' "
        "action as the second release path"
    )


# ---------------------------------------------------------------------------
# (e) --force writes through + appends to writer log
# ---------------------------------------------------------------------------

def test_force_override_writes_through_and_appends_writer_log(
    tmp_path: Path, monkeypatch
):
    """With ``--force``, a different-holder call mutates the state
    (new orchestrator block, fresh ``checkedOutAt``) and appends a
    single line to ``~/.dabbler/orchestrator-writer.log``. The
    writer log lives at a fixed home-relative path; we redirect it
    via monkeypatching the module-level constant so the test stays
    hermetic on every developer's machine."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        checked_out_at="2026-05-20T08:00:00-04:00",
    )

    log_path = tmp_path / "writer.log"
    monkeypatch.setattr(start_session, "ORCHESTRATOR_WRITER_LOG", str(log_path))

    rc = start_session.run(_args(
        set_dir,
        session_number=1,
        engine="gpt-5-4",
        provider="openai",
        force=True,
    ))
    assert rc == start_session.EXIT_OK, (
        f"--force must override H3 refusal; got rc={rc}"
    )

    # State must reflect the new holder.
    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert orch.get("engine") == "gpt-5-4"
    assert orch.get("provider") == "openai"
    # checkedOutAt must have rewritten to "now" because the H4
    # identity changed; not preserved from the prior holder.
    assert orch.get("checkedOutAt") != "2026-05-20T08:00:00-04:00", (
        "force-override rewrites checkedOutAt (authority handoff)"
    )
    assert orch.get("checkedOutAt") == orch.get("lastActivityAt"), (
        "fresh check-out (force-override): lastActivityAt mirrors "
        "checkedOutAt"
    )

    # Writer log must exist and contain exactly one force-override
    # line referencing both holders + the session number.
    assert log_path.is_file(), "writer log was not created on force-override"
    log = log_path.read_text(encoding="utf-8")
    assert log.count("force-override") == 1
    assert "claude" in log and "anthropic" in log, (
        "writer log line must name the prior holder"
    )
    assert "gpt-5-4" in log and "openai" in log, (
        "writer log line must name the new holder"
    )
    assert "session=1" in log
    assert "session-set=test-set-checkout" in log


# ---------------------------------------------------------------------------
# (f) Tolerated read of an in-flight set with no checkedOutAt
# ---------------------------------------------------------------------------

def test_tolerated_read_of_in_flight_set_without_checked_out_at(
    tmp_path: Path,
):
    """An in-flight set whose orchestrator block predates Set 033
    (no ``checkedOutAt`` / ``lastActivityAt`` fields) must read
    without error, and the next same-holder re-attach must
    populate both fields with ``now``. Migration tolerance per
    docs/session-state-schema.md (Set 033 schema delta)."""
    set_dir = _fresh_set(tmp_path)
    _seed_in_flight(
        set_dir,
        engine="claude",
        provider="anthropic",
        checked_out_at=None,
        last_activity_at=None,
    )

    # Confirm the seed shape: no timestamp fields on the block.
    pre = read_session_state(str(set_dir)) or {}
    pre_orch = pre.get("orchestrator") or {}
    assert "checkedOutAt" not in pre_orch
    assert "lastActivityAt" not in pre_orch

    # Same-holder re-attach.
    rc = start_session.run(_args(set_dir, session_number=1))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    orch = state.get("orchestrator") or {}
    assert isinstance(orch.get("checkedOutAt"), str), (
        "tolerated read: next same-holder write populates "
        "checkedOutAt with ``now`` rather than carrying the "
        "missing field forward"
    )
    assert isinstance(orch.get("lastActivityAt"), str)
    # On a tolerated read, the writer cannot recover the historical
    # checkedOutAt — both fields collapse to ``now`` (the same call
    # to _now_iso()), same as a fresh check-out.
    assert orch.get("checkedOutAt") == orch.get("lastActivityAt")
