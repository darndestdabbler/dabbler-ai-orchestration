"""The static index, including the case where there is nothing to play.

Set 113 Session 3. The index is the one artifact a human actually opens,
and the claim it has to keep is the awkward one: **a run that recorded
nothing must still produce a page worth opening.** So the no-video case
gets as much testing as the happy one, and the page is asserted to say so
in words rather than to merely omit a player.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scenario import parse_scenario
from walkthrough_index import render_index
from walkthrough_run import (
    Artifact,
    build_timeline,
    finalize_and_write,
    parse_events,
)

SCENARIO_YAML = """
id: index-sample
title: A sample walkthrough
summary: Read the `0 open` line and then add something.
audience: Anyone at all.
baseline:
  description: Start here.
  observable: You see the thing.
steps:
  - id: first-step
    title: Look at it
    action: Look at the `0 open` line.
    expect: It reads `0 open`.
    narration: The count is the thing to watch.
  - id: second-step
    title: Add something
    checkpoint: one task on the board
    action: Click the <b>Add task</b> button.
    expect: A row appears.
  - id: third-step
    title: Never got here
    action: Do the third thing.
    expect: You see the third thing.
"""

FULL_RUN = (
    '{"event": "run-started", "atMillis": 0}\n'
    '{"event": "started", "stepId": "first-step", "atMillis": 100}\n'
    '{"event": "completed", "stepId": "first-step", "atMillis": 900}\n'
    '{"event": "started", "stepId": "second-step", "atMillis": 1000}\n'
    '{"event": "completed", "stepId": "second-step", "atMillis": 1800}\n'
    '{"event": "started", "stepId": "third-step", "atMillis": 1900}\n'
    '{"event": "completed", "stepId": "third-step", "atMillis": 2700}\n'
    '{"event": "run-finished", "atMillis": 2800}\n'
)

STOPPED_RUN = (
    '{"event": "run-started", "atMillis": 0}\n'
    '{"event": "started", "stepId": "first-step", "atMillis": 100}\n'
    '{"event": "completed", "stepId": "first-step", "atMillis": 900}\n'
    '{"event": "started", "stepId": "second-step", "atMillis": 1000}\n'
    '{"event": "failed", "stepId": "second-step", "atMillis": 1200,'
    ' "error": "the Add task button was never there"}\n'
)


@pytest.fixture()
def scenario():
    return parse_scenario(SCENARIO_YAML)


def _run(tmp_path: Path, scenario, events: str, with_video: bool) -> Path:
    import json

    artifacts = []
    if with_video:
        (tmp_path / "recording.webm").write_bytes(b"pretend this is a video")
        artifacts.append(
            {
                "kind": "browser-video",
                "path": "recording.webm",
                "mediaType": "video/webm",
                "bytes": 23,
            }
        )
    (tmp_path / "events.jsonl").write_text(events, encoding="utf-8", newline="\n")
    (tmp_path / "driver-output.json").write_text(
        json.dumps(
            {
                "scenarioId": scenario.id,
                "portableDigest": scenario.portable_digest(),
                "driver": "playwright-web",
                "startedAt": "2026-08-15T18:00:00Z",
                "target": {"url": "http://127.0.0.1:9999/"},
                "anchor": {"basis": "context creation", "uncertaintyMillis": 6},
                "artifacts": artifacts,
            }
        ),
        encoding="utf-8",
        newline="\n",
    )
    return tmp_path


class TestTheHappyPage:
    def test_it_plays_the_recording(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")

        assert '<video id="recording"' in page
        assert '<source src="recording.webm" type="video/webm">' in page

    def test_captions_are_embedded_not_fetched(self, tmp_path, scenario):
        """The documented way to view a run is to open the file from disk,
        and Chromium refuses to load a ``<track>`` sidecar over
        ``file://``. A track ELEMENT would therefore look right in the
        markup and show no captions on the normal path, so the cues ship
        in the page and are added through ``addTextTrack``."""
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")

        assert "<track" not in page
        assert 'id="cues"' in page
        assert "addTextTrack" in page

        payload = page.split('id="cues">')[1].split("</script>")[0]
        cues = json.loads(payload)
        # One cue per REACHED step, in seconds, carrying the caption line.
        assert [cue["start"] for cue in cues] == [0.1, 1.0, 1.9]
        assert cues[0]["text"] == scenario.steps[0].caption

    def test_the_caption_sidecar_is_still_written_for_uploading(
        self, tmp_path, scenario
    ):
        """Embedding the cues does not retire the file: it is what you
        upload beside a copy of the video."""
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        manifest = finalize_and_write(run, scenario)
        assert (run / "captions.vtt").exists()
        assert manifest.artifact("captions") is not None

    def test_a_cue_payload_cannot_break_out_of_its_script_tag(self, tmp_path):
        """The look-alike for the escaping test below: JSON in a <script>
        block is not HTML-escaped, so the one sequence that ends the block
        early has to be neutralised or authored prose becomes markup."""
        nasty = parse_scenario(
            SCENARIO_YAML.replace(
                "narration: The count is the thing to watch.",
                'narration: Watch the </script><img src=x> line.',
            )
        )
        (tmp_path / "recording.webm").write_bytes(b"pretend this is a video")
        run = _run(tmp_path, nasty, FULL_RUN, with_video=True)
        finalize_and_write(run, nasty)
        page = (run / "index.html").read_text(encoding="utf-8")
        payload = page.split('id="cues">')[1].split("</script>")[0]
        # The block did not end early: the payload still parses as JSON.
        assert json.loads(payload)

    def test_every_step_carries_its_do_and_its_see(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        for step in scenario.steps:
            assert step.title in page
            assert step.expect.replace("`0 open`", "<code>0 open</code>") in page

    def test_times_come_from_the_run_not_the_authored_estimate(
        self, tmp_path, scenario
    ):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        # The real start of step two, in milliseconds, on its seek button.
        assert 'data-at="1000"' in page
        # The authored default would have put step two at 8 seconds.
        assert 'data-at="8000"' not in page

    def test_the_index_does_not_list_itself_in_its_own_file_list(
        self, tmp_path, scenario
    ):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=True)
        manifest = finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        # It IS an artifact -- a consumer looking for the page finds it in
        # the manifest -- but the page does not link to itself.
        assert manifest.artifact("index") is not None
        assert '<a href="index.html"' not in page


class TestThePageWithNothingToPlay:
    """Failure to record must never fail the walkthrough."""

    def test_it_says_there_is_no_recording_rather_than_showing_a_dead_player(
        self, tmp_path, scenario
    ):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")

        assert "<video" not in page
        assert "No recording" in page
        assert "supported outcome" in page
        assert "the walkthrough document is the deliverable" in page

    def test_the_steps_are_all_still_there(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        for step in scenario.steps:
            assert step.title in page
        # Structural rather than textual: the prose is escaped and its
        # backtick spans become <code>, so asserting on the raw authored
        # string would only be re-implementing the renderer here. What
        # matters is that no step lost its "do this / see that" pair.
        assert page.count('class="do"') == len(scenario.steps)
        assert page.count('class="see"') == len(scenario.steps)

    def test_there_are_no_seek_buttons_to_press(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        assert "data-at=" not in page
        assert "Click a time to jump" not in page


class TestAStepThatNeverRan:
    def test_it_is_shown_and_labelled_rather_than_omitted(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, STOPPED_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")

        assert "Never got here" in page
        assert "not reached" in page
        assert "is-not-reached" in page
        assert "the Add task button was never there" in page
        assert "A step failed" in page


class TestEscapingAndProse:
    def test_markup_in_authored_prose_cannot_reach_the_page_as_markup(
        self, tmp_path, scenario
    ):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        assert "<b>Add task</b>" not in page
        assert "&lt;b&gt;Add task&lt;/b&gt;" in page

    def test_backtick_spans_become_code_not_punctuation(self, tmp_path, scenario):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        assert "<code>0 open</code>" in page
        assert "`0 open`" not in page

    def test_a_backtick_span_cannot_smuggle_markup_through(self):
        """The look-alike: escaping happens BEFORE the span conversion."""
        nasty = parse_scenario(
            SCENARIO_YAML.replace(
                "narration: The count is the thing to watch.",
                'narration: Watch `<script>alert(1)</script>` closely.',
            )
        )
        events, _ = parse_events(FULL_RUN)
        timeline = build_timeline(nasty, events)
        page = render_index(_fake_manifest(nasty, timeline), nasty)
        assert "<script>alert(1)</script>" not in page
        assert "&lt;script&gt;" in page

    def test_the_checkpoint_is_shown_as_a_place_to_resume_from(
        self, tmp_path, scenario
    ):
        run = _run(tmp_path, scenario, FULL_RUN, with_video=False)
        finalize_and_write(run, scenario)
        page = (run / "index.html").read_text(encoding="utf-8")
        assert "one task on the board" in page
        assert "resume from this state" in page


def _fake_manifest(scenario, timeline):
    from walkthrough_run import RunManifest

    return RunManifest(
        scenario_id=scenario.id,
        portable_digest=scenario.portable_digest(),
        title=scenario.title,
        driver="playwright-web",
        started_at="2026-08-15T18:00:00Z",
        outcome=timeline.outcome,
        duration_millis=timeline.duration_millis,
        steps=timeline.steps,
        artifacts=(Artifact(kind="index", path="index.html", media_type="text/html"),),
    )


def test_the_page_is_self_contained():
    """No CDN, no font host, no analytics: it must work off a USB stick."""
    scenario = parse_scenario(SCENARIO_YAML)
    events, _ = parse_events(FULL_RUN)
    page = render_index(_fake_manifest(scenario, build_timeline(scenario, events)), scenario)
    for forbidden in ["http://", "https://", "<link", "<script src"]:
        assert forbidden not in page
