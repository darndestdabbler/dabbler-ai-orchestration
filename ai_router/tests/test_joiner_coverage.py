"""Layer-1 unit tests for ai_router.joiner.coverage."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_router.joiner.coverage import coverage


@pytest.fixture
def workspace_with_set(tmp_path: Path) -> Path:
    workspace = tmp_path / "workspace"
    set_dir = workspace / "docs" / "session-sets" / "999-test-set"
    set_dir.mkdir(parents=True)
    state = {
        "schemaVersion": 3,
        "sessionSetName": "999-test-set",
        "sessions": [],
        "totalSessions": 0,
        "completedSessions": [],
        "status": "not-started",
        "startedAt": "2026-05-24T08:00:00-04:00",
        "orchestrator": None,
    }
    (set_dir / "session-state.json").write_text(json.dumps(state), encoding="utf-8")
    return workspace


def test_coverage_returns_one_summary_per_set(workspace_with_set: Path, tmp_path: Path):
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=tmp_path / "empty-claude",
        copilot_root=tmp_path / "empty-copilot",
        launch_log=tmp_path / "no-launch.jsonl",
    )
    assert len(summaries) == 1
    s = summaries[0]
    assert s.set_slug == "999-test-set"
    assert s.wrapper_launched is False
    assert s.narration_present is False  # no native sessions → no markers
    assert s.native_log_bound is False
    assert s.bypass_inferred is False
    assert s.last_signal_ts is None


def test_coverage_detects_native_log_in_workspace(workspace_with_set: Path, tmp_path: Path):
    claude_root = tmp_path / "claude"
    ws_dir = claude_root / "any-slug"
    ws_dir.mkdir(parents=True)
    (ws_dir / "conv-x.jsonl").write_text(
        json.dumps({
            "timestamp": "2026-05-24T08:00:00Z",
            "cwd": str(workspace_with_set),
        }) + "\n",
        encoding="utf-8",
    )
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=claude_root,
        copilot_root=tmp_path / "empty-copilot",
        launch_log=tmp_path / "no-launch.jsonl",
    )
    assert len(summaries) == 1
    s = summaries[0]
    assert s.native_log_bound is True
    assert s.wrapper_launched is False
    assert s.bypass_inferred is True  # native log present + no wrapper launch
    assert s.last_signal_ts is not None


def test_coverage_detects_wrapper_launch(workspace_with_set: Path, tmp_path: Path):
    launch_log = tmp_path / "launch-log.jsonl"
    launch_log.write_text(
        json.dumps({
            "launch_ts": "2026-05-24T08:00:00Z",
            "workspace_cwd": str(workspace_with_set),
            "set_slug": "999-test-set",
            "session_number": 1,
            "target_backend": "claude",
            "launch_id": "uuid-1",
            "effort": "high",
        }) + "\n",
        encoding="utf-8",
    )
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=tmp_path / "empty-claude",
        copilot_root=tmp_path / "empty-copilot",
        launch_log=launch_log,
    )
    s = summaries[0]
    assert s.wrapper_launched is True
    assert s.bypass_inferred is False  # wrapper present → not a bypass case


# ---------------------------------------------------------------------------
# Set 045 / S5 — narration_present wiring through the S4 per-event parser.
# ---------------------------------------------------------------------------


def _write_claude_session_with_marker(
    claude_root: Path,
    workspace_cwd: str,
    marker_text: str,
    *,
    timestamp: str = "2026-05-24T08:00:00Z",
) -> None:
    """Write a minimal Claude JSONL with one assistant turn carrying a text
    block whose contents the per-event parser will scan for a narration
    marker. Models the on-disk shape Claude Code's session writer emits.
    """
    ws_dir = claude_root / "any-slug"
    ws_dir.mkdir(parents=True, exist_ok=True)
    (ws_dir / "conv-marker.jsonl").write_text(
        json.dumps({
            "type": "assistant",
            "timestamp": timestamp,
            "cwd": workspace_cwd,
            "message": {
                "model": "claude-opus-4-7",
                "content": [{"type": "text", "text": marker_text}],
            },
        }) + "\n",
        encoding="utf-8",
    )


def test_coverage_narration_present_when_marker_in_workspace(
    workspace_with_set: Path, tmp_path: Path,
):
    """A Claude session in the workspace emitting a [DABBLER-NARRATION ...]
    marker flips narration_present True for any set in that workspace.
    """
    claude_root = tmp_path / "claude"
    _write_claude_session_with_marker(
        claude_root,
        str(workspace_with_set),
        "Some preamble. "
        "[DABBLER-NARRATION v1 phase=work set=999-test-set session=1 total=2 effort=high] "
        "More body.",
    )
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=claude_root,
        copilot_root=tmp_path / "empty-copilot",
        launch_log=tmp_path / "no-launch.jsonl",
    )
    s = summaries[0]
    assert s.narration_present is True
    assert s.native_log_bound is True


def test_coverage_narration_absent_when_no_marker_text(
    workspace_with_set: Path, tmp_path: Path,
):
    """A Claude session with assistant turns but no marker keeps
    narration_present False — the predicate must not false-positive on
    any assistant text.
    """
    claude_root = tmp_path / "claude"
    _write_claude_session_with_marker(
        claude_root,
        str(workspace_with_set),
        "An ordinary assistant reply with no marker in it.",
    )
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=claude_root,
        copilot_root=tmp_path / "empty-copilot",
        launch_log=tmp_path / "no-launch.jsonl",
    )
    s = summaries[0]
    assert s.narration_present is False
    assert s.native_log_bound is True  # session present, just no marker


def test_coverage_narration_unbound_marker_in_workspace_still_counts(
    workspace_with_set: Path, tmp_path: Path,
):
    """A free-running marker (no set_slug because there's no launch
    binding) still counts as narration evidence for any set in the
    workspace — the workspace filter is sufficient.
    """
    claude_root = tmp_path / "claude"
    _write_claude_session_with_marker(
        claude_root,
        str(workspace_with_set),
        # set= field intentionally omitted from the marker — the parser
        # still emits a marker event, just with no bound set_slug.
        "[DABBLER-NARRATION v1 phase=work session=1 total=2 effort=high]",
    )
    summaries = coverage(
        workspace_root=workspace_with_set,
        claude_root=claude_root,
        copilot_root=tmp_path / "empty-copilot",
        launch_log=tmp_path / "no-launch.jsonl",
    )
    s = summaries[0]
    assert s.narration_present is True
