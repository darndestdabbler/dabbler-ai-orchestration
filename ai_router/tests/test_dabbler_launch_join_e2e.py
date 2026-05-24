"""Layer-2 e2e: wrapper → launch log → joiner harvest() join round-trip.

The L1 tests in test_dabbler_launch.py exercise the writer side and
the L1 tests in test_joiner_parsers.py exercise the reader side.
This file ties them together: the wrapper's actual ``run_launch``
writes the canonical record, the joiner's ``harvest()`` then reads
it and produces the joined HarvestRecord stream with the expected
``binding_state``.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ai_router.dabbler_launch import LaunchInputs, run_launch
from ai_router.joiner.schema import harvest


def _write_claude_jsonl(claude_root: Path, slug: str, conv_id: str, ts: datetime, cwd: str) -> None:
    workspace = claude_root / slug
    workspace.mkdir(parents=True, exist_ok=True)
    jsonl = workspace / f"{conv_id}.jsonl"
    # Set 045 Session 4: ``read_claude_session_events`` only emits per-
    # event ``HarvestRecord`` instances for records carrying
    # ``type ∈ {user, assistant}``. The S3 fixture's minimal shape (no
    # ``type`` field) survived the old fallback path but is now correctly
    # treated as noise. Write a realistic ``type=user`` first record so
    # the bound-native session_start surfaces in the harvest stream.
    jsonl.write_text(
        json.dumps({
            "type": "user",
            "timestamp": ts.isoformat(),
            "cwd": cwd,
            "sessionId": conv_id,
            "message": {"role": "user", "content": [{"type": "text", "text": "test"}]},
        }) + "\n",
        encoding="utf-8",
    )


@pytest.fixture
def workspace_cwd() -> str:
    return "C:/Users/foo/project"


@pytest.fixture
def workspace_canon(workspace_cwd: str) -> str:
    return "c:/users/foo/project"


@pytest.fixture
def launch_inputs(tmp_path: Path, workspace_cwd: str) -> LaunchInputs:
    return LaunchInputs(
        engine="claude",
        workspace_cwd=workspace_cwd,
        set_slug="045-log-harvest-implementation",
        session_number=3,
        effort="high",
        provider="anthropic",
        model="claude-opus-4-7",
        launch_log=tmp_path / "launch-log.jsonl",
        child_argv=[],
    )


class TestWrapperToJoinerBound:
    def test_wrapper_record_binds_to_native_session_within_window(
        self, tmp_path, launch_inputs, workspace_canon
    ):
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        claude_root = tmp_path / "claude-projects"
        # Native first-event 5 s after launch — well inside the 30 s bind window.
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project",
            conv_id="conv-bound",
            ts=launch_ts + timedelta(seconds=5),
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_inputs.launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        natives = [r for r in records if r.event_type == "session_start"]
        assert len(launches) == 1
        assert launches[0].binding_state == "bound"
        assert launches[0].conv_id == "conv-bound"
        assert launches[0].set_slug == "045-log-harvest-implementation"
        # The native session_start is also emitted alongside the bound launch.
        assert len(natives) == 1
        assert natives[0].conv_id == "conv-bound"


class TestWrapperToJoinerUnbound:
    def test_wrapper_record_outside_window_is_unbound(
        self, tmp_path, launch_inputs, workspace_canon
    ):
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        claude_root = tmp_path / "claude-projects"
        # Native event 10 minutes after launch — far outside the 30 s bind window.
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project",
            conv_id="conv-far",
            ts=launch_ts + timedelta(minutes=10),
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_inputs.launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        assert len(launches) == 1
        assert launches[0].binding_state == "unbound"
        assert launches[0].conv_id is None


class TestWrapperToJoinerAmbiguous:
    def test_two_native_candidates_within_window_yields_ambiguous(
        self, tmp_path, launch_inputs, workspace_canon
    ):
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        claude_root = tmp_path / "claude-projects"
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project-a",
            conv_id="conv-a",
            ts=launch_ts + timedelta(seconds=3),
            cwd="C:/Users/foo/project",
        )
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project-b",
            conv_id="conv-b",
            ts=launch_ts + timedelta(seconds=10),
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_inputs.launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        assert len(launches) == 1
        assert launches[0].binding_state == "ambiguous"
        assert launches[0].conv_id is None
        assert set(launches[0].bound_candidates or []) == {"conv-a", "conv-b"}


class TestVendorVariantEngineNormalization:
    """Round-A verifier fix: normalize_engine must be applied to candidates."""

    def test_launch_engine_claude_binds_to_native_engine_claude_code(
        self, tmp_path, launch_inputs, workspace_canon
    ):
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        # Native log carries the vendor variant "claude-code" rather than "claude".
        claude_root = tmp_path / "claude-projects"
        workspace = claude_root / "C--Users-foo-project"
        workspace.mkdir(parents=True)
        jsonl = workspace / "conv-variant.jsonl"
        # We construct the file the same way scan_claude_logs reads it, then
        # we have to force the engine label to "claude-code". Easiest: write
        # the JSONL via scan_claude_logs which returns engine="claude", then
        # monkey-patch the NativeSession before harvest(). But the public
        # contract here is "harvest() uses normalize_engine"; the cleanest
        # test is to override the scanner's output via dataclass replacement.
        jsonl.write_text(
            '{"timestamp": "2026-05-24T12:00:05Z", "cwd": "C:/Users/foo/project"}\n',
            encoding="utf-8",
        )
        from dataclasses import replace
        from ai_router.joiner import parsers as parsers_module
        original_scan = parsers_module.scan_claude_logs

        def _scan_with_variant_engine(root):
            for ns in original_scan(root):
                yield replace(ns, engine="claude-code")

        parsers_module.scan_claude_logs = _scan_with_variant_engine
        try:
            records = list(
                harvest(
                    workspace_cwd=workspace_canon,
                    claude_root=claude_root,
                    copilot_root=tmp_path / "empty-copilot",
                    launch_log=launch_inputs.launch_log,
                )
            )
        finally:
            parsers_module.scan_claude_logs = original_scan
        launches = [r for r in records if r.event_type == "launch"]
        assert len(launches) == 1
        assert launches[0].binding_state == "bound"
        assert launches[0].conv_id == "conv-variant"


class TestBoundNativeEmitsLaunchContextMerged:
    """Round-A verifier fix: bound native's events carry launch.set_slug etc."""

    def test_bound_copilot_emits_full_event_stream_with_launch_context(
        self, tmp_path, workspace_canon
    ):
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        inputs = LaunchInputs(
            engine="copilot",
            workspace_cwd="C:/Users/foo/project",
            set_slug="045-log-harvest-implementation",
            session_number=3,
            effort="high",
            provider="github",
            model="gpt-5-4",
            launch_log=tmp_path / "launch-log.jsonl",
            child_argv=[],
        )
        run_launch(inputs, when=launch_ts, spawn=False)

        copilot_root = tmp_path / "copilot"
        session_dir = copilot_root / "conv-bound-copilot"
        session_dir.mkdir(parents=True)
        events_path = session_dir / "events.jsonl"
        events_path.write_text(
            "\n".join([
                json.dumps({
                    "type": "session.start",
                    "timestamp": (launch_ts + timedelta(seconds=5)).isoformat(),
                    "data": {
                        "sessionId": "conv-bound-copilot",
                        "startTime": (launch_ts + timedelta(seconds=5)).isoformat(),
                        "context": {"cwd": "C:/Users/foo/project"},
                    },
                }),
                json.dumps({
                    "type": "tool.call",
                    "timestamp": (launch_ts + timedelta(seconds=10)).isoformat(),
                    "data": {"tool": "Edit", "args": {"file": "src/foo.py", "lines": 12}},
                }),
                json.dumps({
                    "type": "usage",
                    "timestamp": (launch_ts + timedelta(seconds=15)).isoformat(),
                    "data": {"inputTokens": 100, "outputTokens": 50},
                }),
            ]),
            encoding="utf-8",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=tmp_path / "empty-claude",
                copilot_root=copilot_root,
                launch_log=inputs.launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        natives = [r for r in records if r.source == "copilot-native"]
        assert len(launches) == 1
        assert launches[0].binding_state == "bound"
        # Each Copilot event becomes its own HarvestRecord (no dup session_start).
        event_types = [r.event_type for r in natives]
        assert event_types == ["session_start", "tool_call", "usage"]
        # Launch context (set_slug + session_number) is merged into every event.
        assert all(r.set_slug == "045-log-harvest-implementation" for r in natives)
        assert all(r.session_number == 3 for r in natives)
        # Per joiner-spec.md §4: redaction is preserved on tool_call.
        tool_rec = next(r for r in natives if r.event_type == "tool_call")
        assert tool_rec.tool == "Edit"
        assert tool_rec.tool_args_summary == {"file": "src/foo.py", "lines": 12}

    def test_bound_native_is_not_re_emitted_in_freerunning_loop(
        self, tmp_path, launch_inputs, workspace_canon
    ):
        """When a launch binds to a native, the native's session_start
        must NOT also appear in the free-running emission loop."""
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        claude_root = tmp_path / "claude-projects"
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project",
            conv_id="conv-bound-claude",
            ts=launch_ts + timedelta(seconds=5),
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_inputs.launch_log,
            )
        )
        # Exactly one session_start record — emitted in-line with the bound
        # launch (carrying set_slug merged), not duplicated by the free-running
        # loop. Total claude-native records for this conv_id should be 1.
        claude_records = [r for r in records if r.conv_id == "conv-bound-claude"
                          and r.source == "claude-native"]
        assert len(claude_records) == 1
        assert claude_records[0].set_slug == "045-log-harvest-implementation"


class TestSingleBindInvariant:
    """Round-B verifier fix: each native binds to at most ONE launch."""

    def test_two_launches_dont_both_claim_one_native(
        self, tmp_path, workspace_canon
    ):
        """Two launches with overlapping windows must NOT both bind to one native.

        Per the spec, binding is 1:1. If two launches could both claim a
        native, the joiner would emit that native's event stream twice
        and corrupt the bypass-rate computation downstream.
        """
        # Two launches 10s apart, both targeting the same engine + cwd.
        launch_log = tmp_path / "launch-log.jsonl"
        launch_inputs_a = LaunchInputs(
            engine="claude",
            workspace_cwd="C:/Users/foo/project",
            set_slug="set-a",
            session_number=1,
            effort="high",
            provider="anthropic",
            model="claude-opus-4-7",
            launch_log=launch_log,
            child_argv=[],
        )
        launch_inputs_b = LaunchInputs(
            engine="claude",
            workspace_cwd="C:/Users/foo/project",
            set_slug="set-b",
            session_number=2,
            effort="high",
            provider="anthropic",
            model="claude-opus-4-7",
            launch_log=launch_log,
            child_argv=[],
        )
        launch_ts_a = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        launch_ts_b = launch_ts_a + timedelta(seconds=10)
        run_launch(launch_inputs_a, when=launch_ts_a, spawn=False)
        run_launch(launch_inputs_b, when=launch_ts_b, spawn=False)

        claude_root = tmp_path / "claude-projects"
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project",
            conv_id="conv-shared",
            ts=launch_ts_a + timedelta(seconds=5),  # in window of both
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        assert len(launches) == 2
        # Exactly one launch binds; the other is unbound (native is consumed).
        binding_states = sorted(r.binding_state for r in launches)
        assert binding_states == ["bound", "unbound"]
        # The bound conv_id appears exactly once across the whole stream.
        bound_natives = [r for r in records if r.conv_id == "conv-shared"
                         and r.source == "claude-native"]
        assert len(bound_natives) == 1


class TestFilterAppliedBeforeBinding:
    """Round-B verifier fix: filters applied to launches BEFORE binding.

    A launch that fails the workspace_cwd or since filter must not
    consume a native that should appear in the free-running loop.
    """

    def test_filtered_launch_does_not_consume_native(
        self, tmp_path, workspace_canon
    ):
        # Launch in workspace A — will be filtered out by workspace_cwd="B".
        launch_log = tmp_path / "launch-log.jsonl"
        launch_inputs = LaunchInputs(
            engine="claude",
            workspace_cwd="C:/Users/foo/project",
            set_slug="045-log-harvest-implementation",
            session_number=3,
            effort="high",
            provider="anthropic",
            model="claude-opus-4-7",
            launch_log=launch_log,
            child_argv=[],
        )
        launch_ts = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)
        run_launch(launch_inputs, when=launch_ts, spawn=False)

        claude_root = tmp_path / "claude-projects"
        # Native in workspace B (different from the launch).
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-bar-other",
            conv_id="conv-other",
            ts=launch_ts + timedelta(seconds=5),
            cwd="C:/Users/bar/other",
        )

        # Filter the harvest to workspace B. The launch (workspace A) is
        # filtered out; the native (workspace B) must still appear in the
        # free-running loop because it was never claimed.
        records = list(
            harvest(
                workspace_cwd="c:/users/bar/other",
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=launch_log,
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        natives = [r for r in records if r.source == "claude-native"]
        assert launches == []  # launch filtered out
        assert len(natives) == 1
        assert natives[0].conv_id == "conv-other"
        assert natives[0].binding_state is None  # free-running


class TestFreeRunningNativeWithoutLaunch:
    def test_native_session_with_no_launch_is_emitted_without_binding(
        self, tmp_path, workspace_canon
    ):
        # No launch log at all — just a native session.
        claude_root = tmp_path / "claude-projects"
        _write_claude_jsonl(
            claude_root,
            slug="C--Users-foo-project",
            conv_id="conv-freerunning",
            ts=datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc),
            cwd="C:/Users/foo/project",
        )

        records = list(
            harvest(
                workspace_cwd=workspace_canon,
                claude_root=claude_root,
                copilot_root=tmp_path / "empty-copilot",
                launch_log=tmp_path / "no-such-log.jsonl",
            )
        )
        launches = [r for r in records if r.event_type == "launch"]
        natives = [r for r in records if r.event_type == "session_start"]
        assert launches == []
        assert len(natives) == 1
        assert natives[0].conv_id == "conv-freerunning"
        assert natives[0].binding_state is None
