"""Tests for Set 7 Session 1 deliverables in ``session_state``:

- :func:`synthesize_not_started_state` — single-folder writer
- :func:`backfill_session_state_files` — bulk walker with file-presence
  inference (change-log → complete; activity-log → in-progress; neither
  → not-started)
- ``ai_router/backfill_session_state.py`` — CLI smoke (subprocess)

These exercise the file invariant Set 7 establishes ("every folder
under ``docs/session-sets/`` with a ``spec.md`` has a
``session-state.json``") without changing any reader; reader collapses
land in Session 2.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import session_state
from session_state import (
    COMPLETE_STATUS,
    IN_PROGRESS_STATUS,
    NOT_STARTED_STATUS,
    SCHEMA_VERSION,
    SESSION_STATE_FILENAME,
    SessionLifecycleState,
    backfill_session_state_files,
    read_session_state,
    synthesize_not_started_state,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SPEC_WITH_TOTAL = """\
# Some session set

Body text.

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
```
"""

SPEC_WITHOUT_BLOCK = """\
# Some session set

Body only, no configuration block.
"""


@pytest.fixture
def session_set_dir(tmp_path: Path) -> Path:
    d = tmp_path / "0xx-test-set"
    d.mkdir()
    (d / "spec.md").write_text(SPEC_WITH_TOTAL, encoding="utf-8")
    return d


@pytest.fixture
def base_dir(tmp_path: Path) -> Path:
    """A ``docs/session-sets``-shaped directory containing several sets."""
    base = tmp_path / "session-sets"
    base.mkdir()
    return base


def _make_set(base: Path, slug: str, *, spec: str = SPEC_WITH_TOTAL) -> Path:
    d = base / slug
    d.mkdir()
    (d / "spec.md").write_text(spec, encoding="utf-8")
    return d


# ---------------------------------------------------------------------------
# synthesize_not_started_state
# ---------------------------------------------------------------------------


class TestSynthesizeNotStarted:
    def test_writes_canonical_shape(self, session_set_dir: Path) -> None:
        path = synthesize_not_started_state(str(session_set_dir))
        assert path == str(session_set_dir / SESSION_STATE_FILENAME)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data == {
            "schemaVersion": SCHEMA_VERSION,
            "sessionSetName": "0xx-test-set",
            "currentSession": None,
            "totalSessions": 4,  # parsed from the spec
            "status": NOT_STARTED_STATUS,
            "lifecycleState": None,
            "startedAt": None,
            "completedAt": None,
            "verificationVerdict": None,
            "orchestrator": None,
        }

    def test_idempotent_does_not_overwrite(
        self, session_set_dir: Path
    ) -> None:
        path = session_set_dir / SESSION_STATE_FILENAME
        # Pre-existing in-progress shape that is intentionally NOT the
        # canonical not-started shape — we want to confirm the
        # synthesizer leaves it alone.
        prior = {
            "schemaVersion": SCHEMA_VERSION,
            "status": "in-progress",
            "currentSession": 2,
        }
        path.write_text(json.dumps(prior), encoding="utf-8")

        result = synthesize_not_started_state(str(session_set_dir))

        assert result == str(path)
        # Untouched contents
        assert json.loads(path.read_text(encoding="utf-8")) == prior

    def test_total_sessions_null_when_spec_missing_block(
        self, base_dir: Path
    ) -> None:
        d = _make_set(base_dir, "no-block-set", spec=SPEC_WITHOUT_BLOCK)
        synthesize_not_started_state(str(d))
        data = json.loads(
            (d / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
        )
        assert data["totalSessions"] is None
        assert data["status"] == NOT_STARTED_STATUS

    def test_total_sessions_null_when_spec_missing(
        self, tmp_path: Path
    ) -> None:
        # No spec.md in this folder. The synthesizer is documented to
        # tolerate that — totalSessions falls back to None.
        d = tmp_path / "no-spec"
        d.mkdir()
        synthesize_not_started_state(str(d))
        data = json.loads(
            (d / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
        )
        assert data["totalSessions"] is None


# ---------------------------------------------------------------------------
# backfill_session_state_files — branches
# ---------------------------------------------------------------------------


class TestBackfillBranches:
    def test_not_started_branch(self, base_dir: Path) -> None:
        d = _make_set(base_dir, "001-fresh")
        count = backfill_session_state_files(str(base_dir))

        assert count == 1
        state = read_session_state(str(d))
        assert state is not None
        assert state["status"] == NOT_STARTED_STATUS
        assert state["startedAt"] is None
        assert state["completedAt"] is None

    def test_in_progress_branch_uses_earliest_log_timestamp(
        self, base_dir: Path
    ) -> None:
        d = _make_set(base_dir, "002-mid-flight")
        # Activity log with two entries; the earliest timestamp should
        # become startedAt.
        log = {
            "sessionSetName": "002-mid-flight",
            "createdDate": "2026-04-30T05:24:06-04:00",
            "totalSessions": 4,
            "entries": [
                {
                    "sessionNumber": 1,
                    "stepNumber": 2,
                    "stepKey": "session-1/step-2",
                    "dateTime": "2026-04-30T07:00:00-04:00",
                    "description": "later",
                    "status": "complete",
                    "routedApiCalls": [],
                },
                {
                    "sessionNumber": 1,
                    "stepNumber": 1,
                    "stepKey": "session-1/step-1",
                    "dateTime": "2026-04-30T06:00:00-04:00",
                    "description": "earlier",
                    "status": "complete",
                    "routedApiCalls": [],
                },
            ],
        }
        (d / "activity-log.json").write_text(
            json.dumps(log), encoding="utf-8"
        )

        backfill_session_state_files(str(base_dir))

        state = read_session_state(str(d))
        assert state is not None
        assert state["status"] == IN_PROGRESS_STATUS
        assert state["lifecycleState"] == (
            SessionLifecycleState.WORK_IN_PROGRESS.value
        )
        assert state["startedAt"] == "2026-04-30T06:00:00-04:00"
        assert state["completedAt"] is None

    def test_complete_branch_change_log_present(
        self, base_dir: Path
    ) -> None:
        d = _make_set(base_dir, "003-done")
        (d / "change-log.md").write_text("# Change log\n", encoding="utf-8")
        # An activity log can coexist with a change-log; the change-log
        # branch wins (the spec is explicit about the precedence).
        (d / "activity-log.json").write_text(
            json.dumps({"entries": []}), encoding="utf-8"
        )

        backfill_session_state_files(str(base_dir))

        state = read_session_state(str(d))
        assert state is not None
        assert state["status"] == COMPLETE_STATUS
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value
        # mtime-derived; just confirm a non-null ISO-ish string landed.
        assert isinstance(state["completedAt"], str)
        assert state["completedAt"]

    def test_existing_state_file_is_preserved_with_change_log(
        self, base_dir: Path
    ) -> None:
        d = _make_set(base_dir, "004-already-tracked")
        # Pre-Set-7 drift: ``status: "completed"`` (vs canonical
        # ``"complete"``) is exactly the kind of historical content
        # Session 1 must NOT touch.
        existing = {
            "schemaVersion": SCHEMA_VERSION,
            "sessionSetName": "004-already-tracked",
            "status": "completed",
            "lifecycleState": "verified",
        }
        (d / SESSION_STATE_FILENAME).write_text(
            json.dumps(existing), encoding="utf-8"
        )
        # Even with a change-log present, the pre-existing file wins.
        (d / "change-log.md").write_text("x", encoding="utf-8")

        count = backfill_session_state_files(str(base_dir))

        assert count == 0
        # Bytes-on-disk unchanged.
        on_disk = json.loads(
            (d / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
        )
        assert on_disk == existing

    def test_existing_state_file_only_is_preserved(
        self, base_dir: Path
    ) -> None:
        # Spec line 180-181 explicitly enumerates this case: existing
        # ``session-state.json``, no ``activity-log.json``, no
        # ``change-log.md``. Backfill must leave it untouched. (This
        # mirrors the legacy "session-1 wrote state-file but never
        # logged a step" path that ``find_active_session_set`` rule 1
        # already handles via state-file-as-in-progress.)
        d = _make_set(base_dir, "0xx-state-only")
        existing = {
            "schemaVersion": SCHEMA_VERSION,
            "sessionSetName": "0xx-state-only",
            "currentSession": 1,
            "totalSessions": 4,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "startedAt": "2026-04-30T05:00:00-04:00",
            "orchestrator": {"engine": "claude-code"},
        }
        (d / SESSION_STATE_FILENAME).write_text(
            json.dumps(existing), encoding="utf-8"
        )
        # Deliberately no activity-log.json, no change-log.md.

        count = backfill_session_state_files(str(base_dir))

        assert count == 0
        on_disk = json.loads(
            (d / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
        )
        assert on_disk == existing

    def test_skips_folder_without_spec(self, base_dir: Path) -> None:
        # A bare folder that lacks spec.md is not a session set and must
        # not gain a state file.
        empty = base_dir / "not-a-set"
        empty.mkdir()

        count = backfill_session_state_files(str(base_dir))

        assert count == 0
        assert not (empty / SESSION_STATE_FILENAME).exists()

    def test_idempotent_second_run_is_a_noop(self, base_dir: Path) -> None:
        _make_set(base_dir, "006-fresh")
        first = backfill_session_state_files(str(base_dir))
        assert first == 1
        second = backfill_session_state_files(str(base_dir))
        assert second == 0

    def test_missing_base_dir_returns_zero(self, tmp_path: Path) -> None:
        # A consumer repo that hasn't laid out docs/session-sets yet.
        result = backfill_session_state_files(
            str(tmp_path / "does-not-exist")
        )
        assert result == 0

    def test_non_recursive(self, base_dir: Path) -> None:
        # Sets nested two levels deep are NOT picked up — the layout
        # convention is one directory level under the base.
        nested_parent = base_dir / "category"
        nested_parent.mkdir()
        nested = nested_parent / "should-be-ignored"
        nested.mkdir()
        (nested / "spec.md").write_text(SPEC_WITH_TOTAL, encoding="utf-8")

        count = backfill_session_state_files(str(base_dir))

        assert count == 0
        assert not (nested / SESSION_STATE_FILENAME).exists()


# ---------------------------------------------------------------------------
# _planned_backfill_paths — internal helper used by the CLI for path output
# ---------------------------------------------------------------------------


class TestPlannedBackfillPaths:
    def test_lists_folders_needing_synthesis(
        self, base_dir: Path
    ) -> None:
        from session_state import _planned_backfill_paths

        a = _make_set(base_dir, "a-fresh")
        b = _make_set(base_dir, "b-fresh")
        # A folder that already has a state file is excluded.
        existing = _make_set(base_dir, "c-existing")
        (existing / SESSION_STATE_FILENAME).write_text(
            json.dumps({"schemaVersion": SCHEMA_VERSION}), encoding="utf-8"
        )

        result = _planned_backfill_paths(str(base_dir))

        assert sorted(result) == sorted([str(a), str(b)])

    def test_pure_function_writes_nothing(self, base_dir: Path) -> None:
        from session_state import _planned_backfill_paths

        d = _make_set(base_dir, "fresh")

        _planned_backfill_paths(str(base_dir))

        assert not (d / SESSION_STATE_FILENAME).exists()


# ---------------------------------------------------------------------------
# _atomic_write_json — concurrency robustness
# ---------------------------------------------------------------------------


class TestAtomicWriteJson:
    def test_uses_unique_temp_filename(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Capture the temp paths each call uses so we can assert two
        # back-to-back writes do not reuse the same temp filename. A
        # fixed ``path + ".tmp"`` would let a parallel writer truncate
        # mid-stream; uniqueness sidesteps the collision entirely.
        from session_state import _atomic_write_json

        target = tmp_path / "out.json"
        seen_temps: list[str] = []

        original_replace = os.replace

        def spy_replace(src: str, dst: str) -> None:
            seen_temps.append(src)
            original_replace(src, dst)

        monkeypatch.setattr(os, "replace", spy_replace)

        _atomic_write_json(str(target), {"x": 1})
        _atomic_write_json(str(target), {"x": 2})

        assert len(seen_temps) == 2
        assert seen_temps[0] != seen_temps[1]
        # And the destination ended up with the second payload.
        assert json.loads(target.read_text(encoding="utf-8")) == {"x": 2}

    def test_temp_file_cleaned_up_on_serialization_failure(
        self, tmp_path: Path
    ) -> None:
        from session_state import _atomic_write_json

        target = tmp_path / "out.json"

        # ``set`` is not JSON-serializable; the write will raise. We
        # need to confirm the temp file does not stick around — a
        # trailing ``.tmp`` would clutter the destination directory.
        with pytest.raises(TypeError):
            _atomic_write_json(str(target), {"x": {1, 2}})

        leftover = list(tmp_path.iterdir())
        # No temp files survived; the destination was never created.
        assert leftover == []


# ---------------------------------------------------------------------------
# CLI smoke
# ---------------------------------------------------------------------------


class TestBackfillCLI:
    def _run(self, *args: str, cwd: Path) -> subprocess.CompletedProcess:
        # Invoke the CLI by file path so the test does not depend on the
        # ``ai_router`` package-resolution shim being installed in the
        # test environment.
        script = (
            Path(__file__).resolve().parent.parent
            / "backfill_session_state.py"
        )
        return subprocess.run(
            [sys.executable, str(script), *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_cli_default_base_dir(self, tmp_path: Path) -> None:
        # Run from a directory whose ``docs/session-sets/`` has one
        # not-started folder.
        sets_dir = tmp_path / "docs" / "session-sets"
        sets_dir.mkdir(parents=True)
        _make_set(sets_dir, "001-default-base")

        result = self._run(cwd=tmp_path)

        assert result.returncode == 0, result.stderr
        assert "synthesized 1" in result.stdout
        assert (
            sets_dir / "001-default-base" / SESSION_STATE_FILENAME
        ).exists()

    def test_cli_explicit_base_dir(self, tmp_path: Path) -> None:
        custom = tmp_path / "elsewhere"
        custom.mkdir()
        _make_set(custom, "001-explicit")

        result = self._run("--base-dir", str(custom), cwd=tmp_path)

        assert result.returncode == 0, result.stderr
        assert "synthesized 1" in result.stdout

    def test_cli_dry_run_writes_nothing(self, tmp_path: Path) -> None:
        sets_dir = tmp_path / "docs" / "session-sets"
        sets_dir.mkdir(parents=True)
        d = _make_set(sets_dir, "001-dry")

        result = self._run("--dry-run", cwd=tmp_path)

        assert result.returncode == 0, result.stderr
        assert "would synthesize 1" in result.stdout
        # The path is still listed even though nothing was written.
        assert "001-dry" in result.stdout
        assert not (d / SESSION_STATE_FILENAME).exists()

    def test_cli_missing_base_dir_is_zero_count(
        self, tmp_path: Path
    ) -> None:
        result = self._run(
            "--base-dir", str(tmp_path / "missing"), cwd=tmp_path
        )

        assert result.returncode == 0, result.stderr
        assert "synthesized 0" in result.stdout
