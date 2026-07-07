"""Set 047 Session 4 — writer-side v4 emission tests.

Pins down the v4 on-disk shape produced by every writer in the
session_state module so a future refactor that re-introduces the v3
top-level fields (or drops the per-session metadata) surfaces here.

What this file covers (the spec §3.1 contract):

- ``register_session_start`` emits v4: schemaVersion=4, top-level
  status+sessions only, in-progress session carries per-session
  startedAt + orchestrator block, prior-completed sessions preserve
  their per-session metadata across the rewrite.
- ``_flip_state_to_closed`` emits v4: closed session's
  ``completedAt`` + ``verificationVerdict`` land on its per-session
  record; the per-session orchestrator is preserved as the historical
  record of who closed the session; the implicit check-in semantic
  is satisfied by top-level status moving off ``in-progress``.
- ``cancel_session_set`` + ``restore_session_set`` emit canonical
  v4 shape with the cancellation passthrough fields (``preCancelStatus``,
  ``forceClosed``) preserved across the rewrite.
- The dropped top-level keys (``currentSession``, ``totalSessions``,
  ``completedSessions``, ``startedAt``, ``completedAt``,
  ``orchestrator``, ``verificationVerdict``, ``lifecycleState``) are
  absent from the on-disk file — the shim re-derives them at read
  time.

The legacy-derived-view assertions live in test_session_state_v3.py
and test_session_state_v2.py; this file asserts the literal v4 bytes
on disk.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from session_state import (
    SESSION_STATE_FILENAME,
    SCHEMA_VERSION,
    _flip_state_to_closed,
    mark_session_complete,
    read_raw_session_state,
    register_session_start,
    synthesize_not_started_state,
)
from session_lifecycle import cancel_session_set, restore_session_set


# Set 047 Session 4: writers MUST drop these from the on-disk shape.
# The shim re-derives them at read time from sessions[]. If any of
# these reappears on disk, the dual-source-of-truth bug v4 was
# specifically introduced to prevent is back.
V4_DROPPED_TOP_LEVEL_KEYS = (
    "lifecycleState",
    "currentSession",
    "totalSessions",
    "completedSessions",
    "startedAt",
    "completedAt",
    "orchestrator",
    "verificationVerdict",
)


@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    d = tmp_path / "test-set"
    d.mkdir()
    return str(d)


@pytest.fixture
def spec_md(session_set_dir: str) -> str:
    spec_path = os.path.join(session_set_dir, "spec.md")
    with open(spec_path, "w", encoding="utf-8") as f:
        f.write(
            "# Test set\n\n"
            "## Session Set Configuration\n\n"
            "```yaml\ntotalSessions: 3\n```\n\n"
            "### Session 1 of 3: First session title\n\n"
            "### Session 2 of 3: Second session title\n\n"
            "### Session 3 of 3: Third session title\n"
        )
    return spec_path


def _read_raw(session_set_dir: str) -> dict:
    with open(
        os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8",
    ) as f:
        return json.load(f)


class TestRegisterSessionStartV4Shape:
    def test_schema_version_is_v4(self, session_set_dir, spec_md):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        assert _read_raw(session_set_dir)["schemaVersion"] == 4 == SCHEMA_VERSION

    def test_drops_all_derived_top_level_keys(self, session_set_dir, spec_md):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        raw = _read_raw(session_set_dir)
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw, (
                f"v4 writer must not emit top-level {key!r}; the shim "
                "derives it at read time from sessions[]"
            )

    def test_in_progress_session_carries_per_session_metadata(
        self, session_set_dir, spec_md,
    ):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        raw = _read_raw(session_set_dir)
        session1 = raw["sessions"][0]
        assert session1["status"] == "in-progress"
        assert session1["startedAt"] is not None
        assert session1["completedAt"] is None
        assert session1["verificationVerdict"] is None
        orch = session1["orchestrator"]
        # Set 049: orchestrator block is an omit-null dict; the
        # coordination-era fields (chatSessionId / checkedOutAt /
        # lastActivityAt) are dropped from both the writer parameter
        # surface and the on-disk shape. Set 084 (F1): the block also
        # carries identityProvenance, derived from the engine ("direct"
        # for single-vendor engines like claude).
        assert isinstance(orch, dict)
        assert orch == {
            "engine": "claude",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "identityProvenance": "direct",
        }

    def test_orchestrator_block_applies_omit_null(
        self, session_set_dir, spec_md,
    ):
        """Set 049: missing model/effort/provider are omitted from the
        on-disk block (no null values, no "unknown" placeholders)."""
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            # provider / model / effort intentionally omitted
        )
        raw = _read_raw(session_set_dir)
        orch = raw["sessions"][0]["orchestrator"]
        # Set 084 (F1): identityProvenance is always derivable from the
        # engine, so it is present even on an otherwise-minimal block.
        assert orch == {"engine": "claude", "identityProvenance": "direct"}

    def test_not_started_sessions_have_null_metadata(self, session_set_dir, spec_md):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        raw = _read_raw(session_set_dir)
        for s in raw["sessions"][1:]:
            assert s["status"] == "not-started"
            assert s["startedAt"] is None
            assert s["completedAt"] is None
            assert s["orchestrator"] is None
            assert s["verificationVerdict"] is None


class TestFlipStateToClosedV4Shape:
    def test_close_preserves_per_session_orchestrator_as_history(
        self, session_set_dir, spec_md,
    ):
        # Register session 1 with one orchestrator.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        # Close session 1 (mid-set — no change-log present).
        _flip_state_to_closed(
            session_set_dir, verification_verdict="VERIFIED", forced=False,
        )
        raw = _read_raw(session_set_dir)
        session1 = raw["sessions"][0]
        assert session1["status"] == "complete"
        # Per-session orchestrator preserved as historical record.
        assert session1["orchestrator"] is not None
        assert session1["orchestrator"]["engine"] == "claude"
        # Per-session completedAt + verdict populated by the close.
        assert session1["completedAt"] is not None
        assert session1["verificationVerdict"] == "VERIFIED"

    def test_close_drops_top_level_orchestrator(self, session_set_dir, spec_md):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        _flip_state_to_closed(session_set_dir, forced=False)
        raw = _read_raw(session_set_dir)
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw

    def test_close_session_n_preserves_session_n_minus_1_metadata(
        self, session_set_dir, spec_md,
    ):
        # Session 1: register + close.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        _flip_state_to_closed(
            session_set_dir, verification_verdict="VERIFIED",
        )
        s1_meta_before = _read_raw(session_set_dir)["sessions"][0]

        # Session 2: register + close.
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=3,
            orchestrator_engine="gpt-5-4",
            orchestrator_provider="openai",
            orchestrator_model="gpt-5.4",
            orchestrator_effort="medium",
        )
        _flip_state_to_closed(
            session_set_dir, verification_verdict="ISSUES_FOUND",
        )
        raw_after = _read_raw(session_set_dir)
        s1_meta_after = raw_after["sessions"][0]
        s2_meta_after = raw_after["sessions"][1]

        # Session 1's metadata survives session 2's lifecycle writes.
        assert s1_meta_after["completedAt"] == s1_meta_before["completedAt"]
        assert s1_meta_after["verificationVerdict"] == "VERIFIED"
        assert s1_meta_after["orchestrator"]["engine"] == "claude"

        # Session 2's metadata reflects the different orchestrator that
        # closed it.
        assert s2_meta_after["orchestrator"]["engine"] == "gpt-5-4"
        assert s2_meta_after["verificationVerdict"] == "ISSUES_FOUND"

    def test_mark_session_complete_writes_v4_with_force_promotion(
        self, session_set_dir, spec_md,
    ):
        # Register session 1, then force-close (operator-asserted
        # "SET is done" semantics promote every session in the ledger
        # to complete under v3 + v4). The writer must emit v4 shape
        # with every session in sessions[] complete and the
        # ``forceClosed`` passthrough preserved at the top level.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        mark_session_complete(
            session_set_dir, verification_verdict="VERIFIED", force=True,
        )
        raw = _read_raw(session_set_dir)
        assert raw["schemaVersion"] == 4
        assert raw["status"] == "complete"
        # Forced last-session close promotes all 3 sessions to complete.
        assert len(raw["sessions"]) == 3
        assert all(s["status"] == "complete" for s in raw["sessions"])
        assert all(s["completedAt"] is not None for s in raw["sessions"])
        # Forensic marker (Set 9 Session 3 D-2) — passthrough under v4.
        assert raw["forceClosed"] is True
        # Top-level derived keys absent.
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw


class TestCancelLifecycleV4Shape:
    def test_cancel_emits_v4_shape(self, session_set_dir, spec_md):
        # Mid-flight set.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        cancel_session_set(session_set_dir, reason="operator changed mind")
        raw = _read_raw(session_set_dir)
        assert raw["schemaVersion"] == 4
        assert raw["status"] == "cancelled"
        assert raw["preCancelStatus"] == "in-progress"
        # The dropped top-level keys must stay dropped through the
        # cancel rewrite.
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw

    def test_restore_emits_v4_shape(self, session_set_dir, spec_md):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        cancel_session_set(session_set_dir, reason="oops")
        restore_session_set(session_set_dir, reason="never mind")
        raw = _read_raw(session_set_dir)
        assert raw["schemaVersion"] == 4
        # Status restored from preCancelStatus.
        assert raw["status"] == "in-progress"
        # preCancelStatus cleared after restore.
        assert "preCancelStatus" not in raw
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw


class TestNotStartedPayloadV4Shape:
    def test_synthesize_not_started_drops_legacy_top_level(
        self, session_set_dir, spec_md,
    ):
        synthesize_not_started_state(session_set_dir)
        raw = _read_raw(session_set_dir)
        assert raw["schemaVersion"] == 4
        assert raw["status"] == "not-started"
        assert isinstance(raw["sessions"], list)
        assert len(raw["sessions"]) == 3
        for s in raw["sessions"]:
            assert s["status"] == "not-started"
            assert s["startedAt"] is None
            assert s["completedAt"] is None
            assert s["orchestrator"] is None
            assert s["verificationVerdict"] is None
        for key in V4_DROPPED_TOP_LEVEL_KEYS:
            assert key not in raw


class TestPlanLessCarveOutV4Shape:
    def test_planless_in_progress_keeps_top_level_orchestrator(
        self, session_set_dir,
    ):
        # Plan-less: no Session Set Configuration block in spec.md.
        # The writer cannot materialize sessions[] without a known
        # total, so it falls back to the documented carve-out —
        # top-level orchestrator + startedAt, no sessions[].
        spec_path = os.path.join(session_set_dir, "spec.md")
        with open(spec_path, "w", encoding="utf-8") as f:
            f.write("# stub spec, no configuration block\n")
        synthesize_not_started_state(session_set_dir)
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=None,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        raw = _read_raw(session_set_dir)
        # Carve-out: sessions[] absent (no plan known) but
        # orchestrator + startedAt at top level so plan-less in-flight
        # work is still attributable.
        assert raw["schemaVersion"] == 4
        assert raw["status"] == "in-progress"
        assert "sessions" not in raw
        assert isinstance(raw.get("orchestrator"), dict)
        assert raw["orchestrator"]["engine"] == "claude"
        assert isinstance(raw.get("startedAt"), str)


class TestVerifierCriticalFixes:
    """Set 047 Session 4 verifier Round-A fix coverage.

    Three Critical items the gpt-5-4 verifier flagged + 1 Important.
    Each test pins the fix shut against a future regression.
    """

    def test_critical_1_register_session_start_uses_v4_sessions_for_total(
        self, tmp_path: Path,
    ):
        """Critical 1: when prior state is v4 with sessions[] but no
        spec.md (or a spec.md without totalSessions/headings), the
        register-session writer must derive the total from the v4
        ledger instead of falling through to the plan-less carve-out.
        """
        set_dir = tmp_path / "v4-no-spec"
        set_dir.mkdir()
        # Empty spec.md: no config block, no headings — every fallback
        # except the v4 ledger fallback returns 0.
        (set_dir / "spec.md").write_text("# stub\n", encoding="utf-8")
        # Hand-write a v4 file with sessions[] of length 4 (session 1
        # complete, sessions 2-4 not-started). No top-level totalSessions.
        (set_dir / "session-state.json").write_text(
            json.dumps({
                "schemaVersion": 4,
                "sessionSetName": "v4-no-spec",
                "status": "in-progress",
                "sessions": [
                    {
                        "number": 1, "title": "first", "status": "complete",
                        "startedAt": "2026-05-20T08:00:00-04:00",
                        "completedAt": "2026-05-20T09:00:00-04:00",
                        "orchestrator": None, "verificationVerdict": "VERIFIED",
                    },
                    {"number": 2, "title": "second", "status": "not-started",
                     "startedAt": None, "completedAt": None,
                     "orchestrator": None, "verificationVerdict": None},
                    {"number": 3, "title": "third", "status": "not-started",
                     "startedAt": None, "completedAt": None,
                     "orchestrator": None, "verificationVerdict": None},
                    {"number": 4, "title": "fourth", "status": "not-started",
                     "startedAt": None, "completedAt": None,
                     "orchestrator": None, "verificationVerdict": None},
                ],
            }, indent=2) + "\n",
            encoding="utf-8",
        )
        # Register session 2. With Critical 1 fixed, the writer infers
        # total=4 from the prior v4 sessions[] ledger and produces a
        # known-plan v4 state. Without the fix, it would either fall
        # through to plan-less (refused due to prior_completed) or
        # land on session-number=2 exceeds total=1.
        register_session_start(
            session_set=str(set_dir),
            session_number=2,
            total_sessions=None,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        raw = _read_raw(str(set_dir))
        assert raw["schemaVersion"] == 4
        assert len(raw["sessions"]) == 4
        assert raw["sessions"][0]["status"] == "complete"
        assert raw["sessions"][1]["status"] == "in-progress"
        assert all(s["status"] == "not-started" for s in raw["sessions"][2:])
        # Session 1's per-session verdict survived the rewrite.
        assert raw["sessions"][0]["verificationVerdict"] == "VERIFIED"

    def test_critical_2_not_started_payload_uses_headings_fallback(
        self, tmp_path: Path,
    ):
        """Critical 2: a spec.md with `### Session N` headings but no
        Session Set Configuration totalSessions block must produce
        a canonical v4 sessions[] ledger at synth time, not the
        plan-less carve-out.
        """
        set_dir = tmp_path / "headings-only-spec"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# Spec without config block\n\n"
            "### Session 1 of 3: First heading\n\n"
            "Body.\n\n"
            "### Session 2 of 3: Second heading\n\n"
            "More body.\n\n"
            "### Session 3 of 3: Third heading\n",
            encoding="utf-8",
        )
        synthesize_not_started_state(str(set_dir))
        raw = _read_raw(str(set_dir))
        assert raw["schemaVersion"] == 4
        assert raw["status"] == "not-started"
        # Headings drove the total — sessions[] is populated with 3
        # entries even though no config block existed.
        assert isinstance(raw["sessions"], list)
        assert len(raw["sessions"]) == 3
        assert raw["sessions"][0]["title"] == "First heading"
        assert raw["sessions"][1]["title"] == "Second heading"
        assert raw["sessions"][2]["title"] == "Third heading"

    def test_critical_3_planless_cancel_restore_preserves_carveout(
        self, tmp_path: Path,
    ):
        """Critical 3: cancel/restore of a plan-less in-progress set
        must NOT convert the absent-sessions[] state into a zero-
        session state, AND must carry the top-level orchestrator /
        startedAt through both transitions.
        """
        set_dir = tmp_path / "planless-cancel"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# stub spec, no configuration block\n",
            encoding="utf-8",
        )
        synthesize_not_started_state(str(set_dir))
        # Plan-less in-progress write — should land the carve-out.
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=None,
            orchestrator_engine="claude",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
        )
        pre_cancel = _read_raw(str(set_dir))
        assert "sessions" not in pre_cancel
        assert isinstance(pre_cancel.get("orchestrator"), dict)
        assert isinstance(pre_cancel.get("startedAt"), str)
        pre_orch = pre_cancel["orchestrator"]
        pre_started = pre_cancel["startedAt"]

        # Cancel must preserve the absent-sessions[] carve-out.
        cancel_session_set(str(set_dir), reason="planless cancel")
        cancelled = _read_raw(str(set_dir))
        assert cancelled["schemaVersion"] == 4
        assert cancelled["status"] == "cancelled"
        assert cancelled.get("preCancelStatus") == "in-progress"
        assert "sessions" not in cancelled
        # Plan-less carve-out passthrough through cancel.
        assert cancelled.get("orchestrator") == pre_orch
        assert cancelled.get("startedAt") == pre_started

        # Restore returns to the same plan-less shape.
        restore_session_set(str(set_dir), reason="never mind")
        restored = _read_raw(str(set_dir))
        assert restored["schemaVersion"] == 4
        assert restored["status"] == "in-progress"
        assert "preCancelStatus" not in restored
        assert "sessions" not in restored
        assert restored.get("orchestrator") == pre_orch
        assert restored.get("startedAt") == pre_started
