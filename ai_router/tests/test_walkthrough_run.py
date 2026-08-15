"""The recorded-run contract: what a run says happened, and what it cannot say.

Set 113 Session 3. Three claims are under test, and each is stated as a
falsifier that plants the defect rather than as an assertion that today's
code agrees with itself:

1. **The inventory is the authored scenario, not the event stream.** A run
   that died at step 3 must still account for steps 4 and 5. The falsifier
   truncates a stream and asserts the missing steps are *present and
   marked*, because a report assembled from whatever records exist makes an
   omitted item look identical to a passing one -- which is exactly the
   defect Session 1 fixed one layer up.
2. **The stream is lenient about truncation and strict about
   contradiction.** A driver that was killed mid-write is a normal
   outcome; a driver that disagrees with itself is not. Each refusal has
   its own falsifier, and each has a legitimate look-alike that must NOT
   be refused (L-112-1).
3. **Nothing assumes there is a video.** An empty artifact list is valid,
   a manifest cannot claim a file nobody wrote, and every artifact says
   what medium it is.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scenario import load_scenario, parse_scenario
from walkthrough_run import (
    ARTIFACT_KINDS,
    EVENTS_FILENAME,
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_INCOMPLETE,
    STEP_NOT_REACHED,
    Artifact,
    RunError,
    build_plan,
    build_timeline,
    cue_windows,
    finalize_and_write,
    finalize_run,
    format_events,
    load_driver_output,
    parse_artifact,
    parse_events,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
EXEMPLAR = REPO_ROOT / "docs" / "walkthroughs" / "task-board-first-task"

SCENARIO_YAML = """
id: sample-run
title: A sample
summary: One paragraph.
audience: Anyone.
baseline:
  description: Start here.
  observable: You see the thing.
steps:
  - id: first-step
    title: First
    action: Do the first thing.
    expect: You see the first thing.
  - id: second-step
    title: Second
    action: Do the second thing.
    expect: You see the second thing.
  - id: third-step
    title: Third
    action: Do the third thing.
    expect: You see the third thing.
drivers:
  playwright-web:
    fixture: task-board
    steps:
      first-step: { emphasize: '#one' }
      second-step: { emphasize: '#two' }
      third-step: { emphasize: '#three' }
"""


@pytest.fixture()
def scenario():
    return parse_scenario(SCENARIO_YAML)


def stream(*lines: str) -> str:
    return "".join(line + "\n" for line in lines)


FULL_RUN = stream(
    '{"event": "run-started", "atMillis": 0}',
    '{"event": "started", "stepId": "first-step", "atMillis": 100}',
    '{"event": "completed", "stepId": "first-step", "atMillis": 900}',
    '{"event": "started", "stepId": "second-step", "atMillis": 1000}',
    '{"event": "completed", "stepId": "second-step", "atMillis": 1800}',
    '{"event": "started", "stepId": "third-step", "atMillis": 1900}',
    '{"event": "completed", "stepId": "third-step", "atMillis": 2700}',
    '{"event": "run-finished", "atMillis": 2800}',
)


class TestTheInventoryIsTheScenario:
    """The claim Session 1 made about components, one layer down."""

    def test_a_run_that_stopped_early_still_accounts_for_every_step(self, scenario):
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 100}',
                '{"event": "completed", "stepId": "first-step", "atMillis": 900}',
                '{"event": "started", "stepId": "second-step", "atMillis": 1000}',
                '{"event": "failed", "stepId": "second-step", "atMillis": 1200,'
                ' "error": "the button was not there"}',
            )
        )
        timeline = build_timeline(scenario, events)

        # The point: three records for three authored steps, not two for
        # the two the stream mentioned.
        assert len(timeline.steps) == 3
        assert [step.outcome for step in timeline.steps] == [
            "completed",
            "failed",
            STEP_NOT_REACHED,
        ]
        assert timeline.outcome == RUN_FAILED
        assert timeline.steps[1].error == "the button was not there"
        assert timeline.steps[2].start_millis is None

    def test_a_complete_run_is_complete(self, scenario):
        events, notes = parse_events(FULL_RUN)
        timeline = build_timeline(scenario, events, notes)
        assert timeline.outcome == RUN_COMPLETED
        assert all(step.outcome == "completed" for step in timeline.steps)

    def test_a_stream_that_simply_stops_is_incomplete_not_complete(self, scenario):
        """No ``run-finished``: the machine went away. Not a pass."""
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 100}',
                '{"event": "completed", "stepId": "first-step", "atMillis": 900}',
                '{"event": "started", "stepId": "second-step", "atMillis": 1000}',
                '{"event": "completed", "stepId": "second-step", "atMillis": 1800}',
                '{"event": "started", "stepId": "third-step", "atMillis": 1900}',
                '{"event": "completed", "stepId": "third-step", "atMillis": 2700}',
            )
        )
        timeline = build_timeline(scenario, events)
        assert timeline.outcome == RUN_INCOMPLETE

    def test_a_step_that_started_and_never_ended_is_not_a_pass(self, scenario):
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 100}',
            )
        )
        timeline = build_timeline(scenario, events)
        assert timeline.steps[0].outcome == "incomplete"
        assert timeline.outcome == RUN_INCOMPLETE

    def test_a_step_id_the_scenario_does_not_declare_is_refused(self, scenario):
        """A driver keyed to a step that was renamed on one side only."""
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "frist-step", "atMillis": 100}',
            )
        )
        with pytest.raises(RunError, match="frist-step"):
            build_timeline(scenario, events)


class TestTruncationIsToleratedContradictionIsNot:
    def test_a_half_written_last_line_is_dropped_with_a_note(self, scenario):
        """The measured way a stream goes wrong: the writer was killed."""
        events, notes = parse_events(
            FULL_RUN.rstrip("\n").rsplit("\n", 1)[0]
            + '\n{"event": "run-finish'
        )
        assert notes and "interrupted" in notes[0]
        timeline = build_timeline(scenario, events, notes)
        # Tolerated, and NOT silently upgraded to a finished run.
        assert timeline.outcome == RUN_INCOMPLETE
        assert timeline.notes == tuple(notes)

    def test_a_half_written_line_in_the_MIDDLE_is_refused(self):
        """The look-alike. Only the tail can be truncation."""
        with pytest.raises(RunError, match="line 2 is not valid JSON"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "star',
                    '{"event": "run-finished", "atMillis": 10}',
                )
            )

    @pytest.mark.parametrize(
        "line, expected",
        [
            (
                '{"event": "moved-on", "stepId": "first-step", "atMillis": 5}',
                "unknown event",
            ),
            (
                '{"event": "started", "stepId": "first-step", "atMillis": 5,'
                ' "confidence": 0.9}',
                "unknown event key",
            ),
            (
                '{"event": "completed", "stepId": "first-step", "atMillis": 5}',
                "never emitted",
            ),
            (
                '{"event": "started", "atMillis": 5}',
                "must carry a 'stepId'",
            ),
            (
                '{"event": "run-finished", "stepId": "first-step", "atMillis": 5}',
                "must not carry a 'stepId'",
            ),
            (
                '{"event": "started", "stepId": "first-step", "atMillis": -1}',
                "cannot precede it",
            ),
            (
                '{"event": "started", "stepId": "first-step", "atMillis": "5"}',
                "whole number",
            ),
            (
                '{"event": "run-started", "atMillis": 5}',
                "must be the first event",
            ),
        ],
    )
    def test_each_contradiction_is_refused_by_name(self, line: str, expected: str):
        with pytest.raises(RunError, match=expected):
            parse_events(stream('{"event": "run-started", "atMillis": 0}', line))

    def test_a_timestamp_that_goes_backwards_is_refused(self):
        with pytest.raises(RunError, match="non-decreasing"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 900}',
                    '{"event": "completed", "stepId": "first-step", "atMillis": 100}',
                )
            )

    def test_two_events_at_the_same_instant_are_fine(self):
        """The look-alike: non-decreasing, not strictly increasing."""
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 900}',
                '{"event": "completed", "stepId": "first-step", "atMillis": 900}',
            )
        )
        assert len(events) == 3

    def test_a_step_cannot_start_twice(self):
        with pytest.raises(RunError, match="already started"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 10}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 20}',
                )
            )

    def test_a_step_cannot_end_twice(self):
        with pytest.raises(RunError, match="already ended"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 10}',
                    '{"event": "completed", "stepId": "first-step", "atMillis": 20}',
                    '{"event": "failed", "stepId": "first-step", "atMillis": 30,'
                    ' "error": "and again"}',
                )
            )

    def test_nothing_may_follow_the_end_of_the_run(self):
        with pytest.raises(RunError, match="follows 'run-finished'"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "run-finished", "atMillis": 10}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 20}',
                )
            )

    def test_a_failure_with_no_description_is_refused(self):
        with pytest.raises(RunError, match="not a record"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 10}',
                    '{"event": "failed", "stepId": "first-step", "atMillis": 20}',
                )
            )

    def test_an_empty_stream_is_refused(self):
        with pytest.raises(RunError, match="always emits at least"):
            parse_events("   \n\n")

    def test_blank_lines_are_not_content(self):
        """The look-alike: a stray newline is not a truncated record."""
        events, notes = parse_events(
            '{"event": "run-started", "atMillis": 0}\n\n'
            '{"event": "run-finished", "atMillis": 10}\n'
        )
        assert len(events) == 2
        assert notes == []


class TestBoundingBoxes:
    """Recorded for a use that does not exist yet, so it must be exact."""

    def test_a_box_survives_the_round_trip(self, scenario):
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 10,'
                ' "bounds": {"x": 1.5, "y": 2, "width": 3, "height": 4}}',
            )
        )
        assert events[1].bounds == {"x": 1.5, "y": 2.0, "width": 3.0, "height": 4.0}
        timeline = build_timeline(scenario, events)
        assert timeline.steps[0].bounds["width"] == 3.0

    def test_a_partial_box_is_refused_rather_than_defaulted(self):
        with pytest.raises(RunError, match="partial box"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 10,'
                    ' "bounds": {"x": 1, "y": 2}}',
                )
            )

    def test_a_box_on_a_completion_event_is_refused(self):
        with pytest.raises(RunError, match="belongs on 'started'"):
            parse_events(
                stream(
                    '{"event": "run-started", "atMillis": 0}',
                    '{"event": "started", "stepId": "first-step", "atMillis": 10}',
                    '{"event": "completed", "stepId": "first-step", "atMillis": 20,'
                    ' "bounds": {"x": 1, "y": 2, "width": 3, "height": 4}}',
                )
            )


class TestCueWindows:
    def test_cues_cover_the_run_with_no_gaps(self, scenario):
        events, _ = parse_events(FULL_RUN)
        timeline = build_timeline(scenario, events)
        windows = timeline.cue_windows()
        assert windows == [(100, 1000), (1000, 1900), (1900, 2800)]
        # Every cue ends exactly where the next begins.
        for (_, end), (start, _) in zip(windows, windows[1:]):
            assert end == start

    def test_an_unreached_step_gets_no_cue_at_all(self, scenario):
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 100}',
                '{"event": "completed", "stepId": "first-step", "atMillis": 900}',
                '{"event": "run-finished", "atMillis": 1000}',
            )
        )
        windows = build_timeline(scenario, events).cue_windows()
        assert windows[1] is None and windows[2] is None

    def test_a_zero_length_window_is_still_displayable(self, scenario):
        events, _ = parse_events(
            stream(
                '{"event": "run-started", "atMillis": 0}',
                '{"event": "started", "stepId": "first-step", "atMillis": 0}',
                '{"event": "run-finished", "atMillis": 0}',
            )
        )
        start, end = build_timeline(scenario, events).cue_windows()[0]
        assert end > start


class TestArtifactsDoNotAssumeVideo:
    def test_an_empty_artifact_list_is_valid(self, tmp_path, scenario):
        """Failure to record must never fail the walkthrough."""
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        manifest = finalize_run(run, scenario)
        assert manifest.artifacts == ()
        assert manifest.video is None
        assert manifest.outcome == RUN_COMPLETED

    def test_the_vocabulary_names_media_that_are_not_video(self):
        assert {"terminal-cast", "transcript", "screenshot"} <= ARTIFACT_KINDS

    @pytest.mark.parametrize("kind", sorted(ARTIFACT_KINDS))
    def test_every_declared_kind_is_accepted(self, tmp_path, kind: str):
        (tmp_path / "thing").write_text("x", encoding="utf-8")
        artifact = parse_artifact(
            {"kind": kind, "path": "thing", "mediaType": "application/octet-stream"},
            tmp_path,
        )
        assert artifact.kind == kind

    def test_an_unknown_kind_is_refused(self, tmp_path):
        (tmp_path / "thing").write_text("x", encoding="utf-8")
        with pytest.raises(RunError, match="unknown artifact kind"):
            parse_artifact(
                {"kind": "hologram", "path": "thing", "mediaType": "video/mp4"},
                tmp_path,
            )

    def test_an_artifact_that_names_a_file_nobody_wrote_is_refused(self, tmp_path):
        with pytest.raises(RunError, match="does not exist"):
            parse_artifact(
                {
                    "kind": "browser-video",
                    "path": "recording.webm",
                    "mediaType": "video/webm",
                },
                tmp_path,
            )

    def test_an_artifact_with_no_media_type_is_refused(self, tmp_path):
        (tmp_path / "thing").write_text("x", encoding="utf-8")
        with pytest.raises(RunError, match="mediaType"):
            parse_artifact({"kind": "transcript", "path": "thing"}, tmp_path)

    @pytest.mark.parametrize("path", ["/etc/passwd", "../escape.webm", "C:\\x.webm"])
    def test_a_path_outside_the_run_directory_is_refused(self, tmp_path, path: str):
        with pytest.raises(RunError):
            parse_artifact(
                {"kind": "browser-video", "path": path, "mediaType": "video/webm"},
                tmp_path,
            )

    def test_a_nested_path_inside_the_run_directory_is_fine(self, tmp_path):
        """The look-alike: a subdirectory is not an escape."""
        (tmp_path / "shots").mkdir()
        (tmp_path / "shots" / "one.png").write_text("x", encoding="utf-8")
        artifact = parse_artifact(
            {"kind": "screenshot", "path": "shots/one.png", "mediaType": "image/png"},
            tmp_path,
        )
        assert artifact.path == "shots/one.png"


class TestTheRunIsTiedToItsScenario:
    def test_a_scenario_that_moved_since_the_recording_is_refused(
        self, tmp_path, scenario
    ):
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        moved = parse_scenario(
            SCENARIO_YAML.replace("Do the first thing.", "Do something else entirely.")
        )
        with pytest.raises(RunError, match="regenerated, never patched"):
            finalize_run(run, moved)

    def test_a_driver_only_edit_does_not_stale_a_recording(self, tmp_path, scenario):
        """The look-alike, and the quarantine restated: a selector change
        cannot invalidate a video of the portable steps."""
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        rekeyed = parse_scenario(SCENARIO_YAML.replace("'#one'", "'#uno'"))
        assert finalize_run(run, rekeyed).outcome == RUN_COMPLETED

    def test_the_wrong_scenario_entirely_is_refused(self, tmp_path, scenario):
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        other = parse_scenario(SCENARIO_YAML.replace("id: sample-run", "id: other-run"))
        with pytest.raises(RunError, match="but 'other-run' was supplied"):
            finalize_run(run, other)


class TestTheAnchorIsHonest:
    def test_an_anchor_without_a_stated_uncertainty_is_refused(
        self, tmp_path, scenario
    ):
        run = _write_run(
            tmp_path, scenario, FULL_RUN, artifacts=[], anchor={"basis": "something"}
        )
        with pytest.raises(RunError, match="frame accuracy"):
            finalize_run(run, scenario)

    def test_a_bracketed_anchor_is_carried_through(self, tmp_path, scenario):
        run = _write_run(
            tmp_path,
            scenario,
            FULL_RUN,
            artifacts=[],
            anchor={"basis": "context creation", "uncertaintyMillis": 6},
        )
        assert finalize_run(run, scenario).anchor["uncertaintyMillis"] == 6


class TestWritingTheRunOut:
    def test_a_run_with_a_video_gets_retimed_captions_and_an_index(
        self, tmp_path, scenario
    ):
        (tmp_path / "recording.webm").write_bytes(b"not really a video")
        run = _write_run(
            tmp_path,
            scenario,
            FULL_RUN,
            artifacts=[
                {
                    "kind": "browser-video",
                    "path": "recording.webm",
                    "mediaType": "video/webm",
                }
            ],
        )
        manifest = finalize_and_write(run, scenario)

        captions = (run / "captions.vtt").read_text(encoding="utf-8")
        # The real boundaries, not the authored 8-second default.
        assert "00:00:00.100 --> 00:00:01.000" in captions
        assert "re-run the driver" in captions
        assert {entry.kind for entry in manifest.artifacts} == {
            "browser-video",
            "captions",
            "index",
        }
        assert (run / "index.html").exists()
        assert json.loads((run / "manifest.json").read_text(encoding="utf-8"))[
            "outcome"
        ] == RUN_COMPLETED

    def test_a_run_with_no_video_writes_no_caption_sidecar(self, tmp_path, scenario):
        """Captions exist to sit under a video. With no video they would
        be a file that describes nothing."""
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        manifest = finalize_and_write(run, scenario)
        assert not (run / "captions.vtt").exists()
        assert [entry.kind for entry in manifest.artifacts] == ["index"]
        assert (run / "index.html").exists()

    def test_every_derived_artifact_is_validated_like_a_driver_s_own(
        self, tmp_path, scenario
    ):
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        manifest = finalize_and_write(run, scenario)
        for entry in manifest.artifacts:
            assert (run / entry.path).exists()
            assert entry.size_bytes == (run / entry.path).stat().st_size


class TestTheDriverPlan:
    def test_the_plan_carries_the_portable_steps_and_one_driver_block(self, scenario):
        plan = build_plan(scenario, "playwright-web", Path("somewhere"))
        assert [step["id"] for step in plan["steps"]] == [
            "first-step",
            "second-step",
            "third-step",
        ]
        assert plan["driverBlock"]["fixture"] == "task-board"
        assert plan["portableDigest"] == scenario.portable_digest()

    def test_the_plan_is_opaque_about_driver_contents(self, scenario):
        """The seam Session 2 authored: this module has no opinion about
        what a selector is, so an unrecognisable block passes through."""
        odd = parse_scenario(
            SCENARIO_YAML.replace(
                "fixture: task-board", "somethingNobodyHasWrittenYet: 42"
            )
        )
        plan = build_plan(odd, "playwright-web", Path("somewhere"))
        assert plan["driverBlock"]["somethingNobodyHasWrittenYet"] == 42

    def test_asking_for_a_driver_the_scenario_does_not_declare_names_the_ones_it_has(
        self, scenario
    ):
        with pytest.raises(RunError, match="playwright-web"):
            build_plan(scenario, "obs-windows", Path("somewhere"))

    def test_the_committed_web_scenario_can_be_planned(self):
        """The exemplar this session recorded, planned from disk."""
        exemplar = load_scenario(EXEMPLAR)
        plan = build_plan(exemplar, "playwright-web", EXEMPLAR)
        assert plan["scenarioId"] == "task-board-first-task"
        # Every authored step is drivable, or the recording would silently
        # show fewer steps than the document lists.
        driven = set(plan["driverBlock"]["steps"])
        assert driven == {step["id"] for step in plan["steps"]}
        # The authored budget reaches the driver, which holds each step on
        # screen for it.
        assert all(step["seconds"] > 0 for step in plan["steps"])


class TestDriverOutput:
    def test_an_unknown_top_level_key_is_refused(self, tmp_path, scenario):
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        raw = json.loads((run / "driver-output.json").read_text(encoding="utf-8"))
        raw["confidenceScore"] = 0.8
        (run / "driver-output.json").write_text(
            json.dumps(raw), encoding="utf-8", newline="\n"
        )
        with pytest.raises(RunError, match="unknown driver-output key"):
            load_driver_output(run)

    def test_a_missing_stream_is_named(self, tmp_path, scenario):
        run = _write_run(tmp_path, scenario, FULL_RUN, artifacts=[])
        (run / EVENTS_FILENAME).unlink()
        with pytest.raises(RunError, match="no step-event stream"):
            finalize_run(run, scenario)


def _write_run(tmp_path: Path, scenario, events: str, artifacts, anchor=None) -> Path:
    """Stand in for a driver: write exactly what one writes, nothing more."""
    (tmp_path / EVENTS_FILENAME).write_text(events, encoding="utf-8", newline="\n")
    payload = {
        "scenarioId": scenario.id,
        "portableDigest": scenario.portable_digest(),
        "driver": "playwright-web",
        "startedAt": "2026-08-15T18:00:00Z",
        "artifacts": artifacts,
    }
    if anchor is not None:
        payload["anchor"] = anchor
    (tmp_path / "driver-output.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8", newline="\n"
    )
    return tmp_path


def test_events_round_trip_through_the_serialiser():
    events, _ = parse_events(FULL_RUN)
    again, _ = parse_events(format_events(events))
    assert [e.payload() for e in again] == [e.payload() for e in events]


def test_cue_windows_is_one_implementation_not_two():
    """The free function and the timeline method must agree, because the
    finalizer calls one and the model exposes the other."""
    scenario_ = parse_scenario(SCENARIO_YAML)
    events, _ = parse_events(FULL_RUN)
    timeline = build_timeline(scenario_, events)
    assert timeline.cue_windows() == cue_windows(
        timeline.steps, timeline.duration_millis
    )


def test_an_artifact_dataclass_serialises_without_optional_fields():
    entry = Artifact(kind="index", path="index.html", media_type="text/html")
    assert entry.payload() == {
        "kind": "index",
        "path": "index.html",
        "mediaType": "text/html",
    }
