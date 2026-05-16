"""Regression pin for the ``completedSessions[]``-loss bug in v0.1.1.

dabbler-platform pins ``dabbler-ai-router>=0.1.0`` and was installed
on 0.1.1. The preservation logic in :func:`register_session_start`
was added in Set 022 (shipped as 0.2.x); on 0.1.1 the writer
overwrites ``session-state.json`` without reading the existing
``completedSessions[]``, so every call to ``start_session`` wipes
the progress ledger. The Session Set Explorer then renders ``N−1/N``
forever — a silent display-drift bug.

This test pins the fix shut on the canonical writer in this repo.
If a future refactor accidentally drops the read-and-preserve step
again, this test fails before the regression ships.

The test is intentionally narrow: it does not invoke the CLI, does
not need a git repo, does not stage any artifacts. It exercises
exactly the function whose behavior regressed. That keeps it fast
and lets the failure point at the exact unit under test.
"""

from __future__ import annotations

import json
from pathlib import Path

from session_state import (  # type: ignore[import-not-found]
    SCHEMA_VERSION,
    register_session_start,
)


# Intentionally NOT marked ``e2e``: this test does no subprocess work,
# needs no tmpdir git repo, and runs in milliseconds. It pins the v0.1.1
# ``completedSessions[]``-loss bug on the canonical writer; keeping it
# in the fast unit suite means a regression on that writer surfaces in
# ``pytest -m "not e2e"`` (pre-commit speed), not only in the slower
# ``-m e2e`` harness pass.


SET_SLUG = "harness-regression-pin"


def _write_prior_state(set_dir: Path, completed_sessions: list[int]) -> None:
    """Land a session-state.json shaped like 'session 1 just closed, 2 not yet started'.

    The shape matches the boundary moment v0.1.1 corrupts: a closed
    snapshot from the prior session sits on disk, and the next call
    to ``register_session_start`` must preserve its ``completedSessions[]``
    when it rewrites the snapshot for the new session.
    """
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": SET_SLUG,
        "currentSession": max(completed_sessions),
        "totalSessions": 3,
        "status": "in-progress",
        "lifecycleState": "work_in_progress",
        "startedAt": "2026-05-15T10:00:00-04:00",
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
        },
        "completedSessions": list(completed_sessions),
    }
    with open(set_dir / "session-state.json", "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")


def test_register_session_start_preserves_completed_sessions(tmp_path: Path) -> None:
    """The canonical writer must not wipe ``completedSessions[]`` on rewrite.

    Reproduces the v0.1.1 scenario: session 1 has closed (so
    ``completedSessions: [1]`` is on disk), and the orchestrator
    now calls ``register_session_start`` for session 2. The post-call
    snapshot must still carry ``completedSessions: [1]``.
    """
    set_dir = tmp_path / "docs" / "session-sets" / SET_SLUG
    set_dir.mkdir(parents=True)
    _write_prior_state(set_dir, completed_sessions=[1])

    register_session_start(
        session_set=str(set_dir),
        session_number=2,
        total_sessions=3,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )

    with open(set_dir / "session-state.json", "r", encoding="utf-8") as f:
        state = json.load(f)

    assert state.get("completedSessions") == [1], (
        "register_session_start wiped completedSessions[] on rewrite — "
        "the v0.1.1 regression is back. The writer must read the prior "
        "state's array and pass it through compute_effective_completed_sessions "
        "before writing the new snapshot."
    )

    # While we're here, sanity-check that the new snapshot is otherwise
    # shaped correctly: currentSession bumped to 2, status flipped to
    # in-progress, lifecycleState in WORK_IN_PROGRESS. These are
    # protected by other tests, but pinning the bundle here makes the
    # failure mode unambiguous if multiple invariants regress at once.
    assert state.get("currentSession") == 2
    assert state.get("totalSessions") == 3
    assert state.get("status") == "in-progress"
    assert state.get("lifecycleState") == "work_in_progress"


def test_register_session_start_preserves_multi_session_history(tmp_path: Path) -> None:
    """Same invariant, but with a longer history — guards against an
    off-by-one fix that only preserves the last element.
    """
    set_dir = tmp_path / "docs" / "session-sets" / SET_SLUG
    set_dir.mkdir(parents=True)
    _write_prior_state(set_dir, completed_sessions=[1, 2, 3])

    register_session_start(
        session_set=str(set_dir),
        session_number=4,
        total_sessions=5,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )

    with open(set_dir / "session-state.json", "r", encoding="utf-8") as f:
        state = json.load(f)

    assert state.get("completedSessions") == [1, 2, 3]


def test_fresh_set_has_empty_completed_sessions(tmp_path: Path) -> None:
    """Fresh-set snapshots must always emit completedSessions as an empty array.

    Lightweight-tier orchestrators maintain completedSessions[] by hand. If the
    writer omits the key on fresh sets, Lightweight operators cannot append to
    a pre-existing array and must invent the schema from scratch. This test
    guards against the v0.1.1-era convention of "absent means none closed yet".
    Fresh sets are "in progress" and need an explicit empty array to maintain
    schema consistency.
    """
    set_dir = tmp_path / "docs" / "session-sets" / "fresh-set-test"
    set_dir.mkdir(parents=True)

    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=3,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="normal",
        orchestrator_provider="anthropic",
    )

    with open(set_dir / "session-state.json", "r", encoding="utf-8") as f:
        state = json.load(f)

    assert "completedSessions" in state, "completedSessions key must be present"
    assert state["completedSessions"] == [], "fresh set must have empty completedSessions array"
