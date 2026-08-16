"""Falsifiers for the event-derived speed ramp (Set 113 Session 7).

The load-bearing claim this module makes is a *negative* one -- **no
interval in which something happened is ever compressed** -- and a negative
claim is exactly the kind that reads as true when the code is wrong.  So
each rule here gets two tests in the shape L-112-1 asks for: one that plants
the violation and asserts the ramp refuses to produce it, and one that
plants the legitimate look-alike and asserts it is allowed through.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from ai_router import speed_ramp

BASE = datetime(2026, 8, 16, 12, 0, 0, tzinfo=timezone.utc)


def _mark(seconds: float, label: str = "step") -> speed_ramp.Mark:
    return speed_ramp.Mark(seconds=seconds, source="test", label=label)


def _write_set(tmp_path, *, events=(), activity=(), session=1):
    (tmp_path / "session-events.jsonl").write_text(
        "".join(
            json.dumps(
                {
                    "timestamp": (BASE + timedelta(seconds=offset))
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "session_number": session,
                    "event_type": "work_started",
                }
            )
            + "\n"
            for offset in events
        ),
        encoding="utf-8",
    )
    (tmp_path / "activity-log.json").write_text(
        json.dumps(
            {
                "sessionSetName": "test",
                "createdDate": BASE.isoformat(),
                "totalSessions": 1,
                "entries": [
                    {
                        "sessionNumber": session,
                        "stepNumber": index,
                        "stepKey": f"step-{index}",
                        "dateTime": (BASE + timedelta(seconds=offset)).isoformat(),
                        "description": "did a thing",
                        "status": "complete",
                    }
                    for index, offset in enumerate(activity, start=1)
                ],
            }
        ),
        encoding="utf-8",
    )
    return tmp_path


class TestNothingThatHappenedIsCompressed:
    """The one rule the whole module exists to keep."""

    @pytest.mark.parametrize(
        "marks",
        [
            [0.0, 600.0],
            [5.0, 5.2, 5.4, 900.0],
            [0.0, 61.0, 62.0, 400.0, 401.0, 1200.0],
            [1199.0],
            [0.0, 1200.0],
        ],
    )
    def test_no_mark_falls_inside_a_compressed_segment(self, marks):
        segments = speed_ramp.build_segments(
            [_mark(value) for value in marks], duration_seconds=1200.0
        )
        for segment in segments:
            if segment.rate <= 1.0:
                continue
            for value in marks:
                assert not (
                    segment.start_seconds < value < segment.end_seconds
                ), (
                    f"mark at {value}s is inside a {segment.rate}x segment "
                    f"{segment.start_seconds}-{segment.end_seconds}"
                )

    def test_the_padding_around_a_mark_is_real_time_on_both_sides(self):
        segments = speed_ramp.build_segments(
            [_mark(600.0)], duration_seconds=1200.0, pad_seconds=3.0
        )
        covering = [
            segment
            for segment in segments
            if segment.start_seconds <= 597.0 and segment.end_seconds >= 603.0
        ]
        assert covering, "the pad around the mark is not a single real-time segment"
        assert covering[0].rate == 1.0

    def test_the_falsifier_a_ramp_that_ignored_marks_would_fail_this(self):
        # The look-alike: the SAME quiet span with no mark in it is compressed.
        # If this did not compress, the test above would pass vacuously.
        segments = speed_ramp.build_segments([_mark(0.0)], duration_seconds=1200.0)
        assert any(segment.rate > 1.0 for segment in segments), (
            "nothing was compressed at all, so 'no mark was compressed' proves "
            "nothing"
        )


class TestQuietThreshold:
    def test_a_gap_just_under_the_threshold_is_left_alone(self):
        segments = speed_ramp.build_segments(
            [_mark(0.0), _mark(25.0)],
            duration_seconds=30.0,
            quiet_threshold=20.0,
            pad_seconds=3.0,
        )
        # marks at 0 and 25 with 3s pads leave a 19s gap: under the bar.
        assert all(segment.rate == 1.0 for segment in segments)

    def test_a_gap_just_over_the_threshold_is_compressed(self):
        segments = speed_ramp.build_segments(
            [_mark(0.0), _mark(27.0)],
            duration_seconds=32.0,
            quiet_threshold=20.0,
            pad_seconds=3.0,
        )
        assert any(segment.rate > 1.0 for segment in segments)

    def test_rate_never_exceeds_the_cap(self):
        segments = speed_ramp.build_segments(
            [_mark(0.0), _mark(100000.0)],
            duration_seconds=100000.0,
            max_rate=12.0,
        )
        assert segments
        assert max(segment.rate for segment in segments) <= 12.0

    def test_a_compressed_stretch_is_shortened_not_removed(self):
        segments = speed_ramp.build_segments(
            [_mark(0.0)], duration_seconds=600.0, quiet_target=4.0
        )
        compressed = [segment for segment in segments if segment.rate > 1.0]
        assert compressed
        for segment in compressed:
            assert segment.output_duration > 0.5, (
                "a wait compressed to nothing tells the viewer it did not happen"
            )


class TestMarkCollection:
    def test_marks_come_from_both_of_the_frameworks_own_files(self, tmp_path):
        _write_set(tmp_path, events=[10.0], activity=[20.0])
        marks = speed_ramp.collect_marks(tmp_path, 1, BASE, 60.0)
        sources = {mark.source for mark in marks}
        assert sources == {"session-events.jsonl", "activity-log.json"}

    def test_another_sessions_marks_are_not_borrowed(self, tmp_path):
        _write_set(tmp_path, events=[10.0], activity=[20.0], session=4)
        assert speed_ramp.collect_marks(tmp_path, 1, BASE, 60.0) == []

    def test_marks_outside_the_recording_are_ignored(self, tmp_path):
        _write_set(tmp_path, events=[-30.0, 10.0], activity=[9999.0])
        marks = speed_ramp.collect_marks(tmp_path, 1, BASE, 60.0)
        assert [mark.seconds for mark in marks] == [10.0]

    def test_a_naive_timestamp_is_read_as_utc_not_as_local_time(self, tmp_path):
        # A local-time reading would put this mark hours away and silently
        # drop it, which is the failure that makes a plan correct on the
        # machine that recorded it and wrong everywhere else.
        (tmp_path / "activity-log.json").write_text(
            json.dumps(
                {
                    "entries": [
                        {
                            "sessionNumber": 1,
                            "dateTime": "2026-08-16T12:00:30",
                            "stepKey": "naive",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        marks = speed_ramp.collect_marks(tmp_path, 1, BASE, 60.0)
        assert [mark.seconds for mark in marks] == [30.0]

    def test_a_truncated_final_event_line_does_not_lose_the_plan(self, tmp_path):
        _write_set(tmp_path, events=[10.0], activity=[])
        with (tmp_path / "session-events.jsonl").open("a", encoding="utf-8") as fh:
            fh.write('{"timestamp": "2026-08-16T12:00:2')
        marks = speed_ramp.collect_marks(tmp_path, 1, BASE, 60.0)
        assert [mark.seconds for mark in marks] == [10.0]


class TestRefusals:
    def test_no_marks_at_all_is_refused_rather_than_compressed_entirely(
        self, tmp_path
    ):
        _write_set(tmp_path, events=[], activity=[])
        with pytest.raises(speed_ramp.SpeedRampError) as excinfo:
            speed_ramp.build_plan(tmp_path, 1, BASE, 600.0)
        assert "no evidence" in str(excinfo.value)

    def test_a_zero_length_recording_is_refused(self):
        with pytest.raises(speed_ramp.SpeedRampError):
            speed_ramp.build_segments([_mark(0.0)], duration_seconds=0.0)

    def test_applying_an_empty_plan_is_refused(self, tmp_path):
        with pytest.raises(speed_ramp.SpeedRampError):
            speed_ramp.apply_plan(
                {"segments": []}, tmp_path / "in.mp4", tmp_path / "out.mp4"
            )


class TestFilterGraph:
    def test_every_segment_becomes_one_trim_and_one_setpts(self):
        segments = [
            {"start_seconds": 0.0, "end_seconds": 5.0, "rate": 1.0},
            {"start_seconds": 5.0, "end_seconds": 65.0, "rate": 12.0},
        ]
        graph = speed_ramp.ffmpeg_filter(segments)
        assert graph.count("trim=") == 2
        assert graph.count("setpts=") == 2
        assert "concat=n=2:v=1:a=0" in graph

    def test_the_rate_reaches_the_filter_as_a_divisor_of_pts(self):
        graph = speed_ramp.ffmpeg_filter(
            [{"start_seconds": 0.0, "end_seconds": 60.0, "rate": 12.0}]
        )
        assert "setpts=(PTS-STARTPTS)/12.0" in graph

    def test_audio_is_never_asked_for(self):
        # Structural, beside the textual assertion above: these recordings
        # have no audio track, and a concat that asked for one would fail at
        # the far end of an hour-long encode rather than here.
        graph = speed_ramp.ffmpeg_filter(
            [{"start_seconds": 0.0, "end_seconds": 1.0, "rate": 1.0}]
        )
        assert ":a=0" in graph
        assert "[0:a]" not in graph


class TestPlanShape:
    def test_the_plan_states_how_much_it_compressed(self, tmp_path):
        _write_set(tmp_path, events=[0.0], activity=[600.0])
        plan = speed_ramp.build_plan(tmp_path, 1, BASE, 600.0)
        assert 0.0 < plan["compressedSourceFraction"] <= 1.0
        assert plan["outputDurationSeconds"] < plan["sourceDurationSeconds"]

    def test_a_heavily_compressed_plan_says_so_in_words(self, tmp_path):
        _write_set(tmp_path, events=[0.0], activity=[])
        plan = speed_ramp.build_plan(tmp_path, 1, BASE, 3600.0)
        assert "READ THE SEGMENTS" in speed_ramp.render_plan(plan)

    def test_a_lightly_compressed_plan_does_not_cry_wolf(self, tmp_path):
        _write_set(tmp_path, events=[0.0, 10.0, 20.0], activity=[30.0, 40.0, 50.0])
        plan = speed_ramp.build_plan(tmp_path, 1, BASE, 60.0)
        assert "READ THE SEGMENTS" not in speed_ramp.render_plan(plan)

    def test_the_segments_tile_the_whole_recording_without_gaps(self, tmp_path):
        _write_set(tmp_path, events=[0.0, 400.0], activity=[900.0])
        plan = speed_ramp.build_plan(tmp_path, 1, BASE, 1200.0)
        segments = plan["segments"]
        assert segments[0]["start_seconds"] == pytest.approx(0.0, abs=0.1)
        assert segments[-1]["end_seconds"] == pytest.approx(1200.0, abs=0.1)
        for earlier, later in zip(segments, segments[1:]):
            assert later["start_seconds"] == pytest.approx(
                earlier["end_seconds"], abs=0.06
            ), "a gap between segments is a stretch of video that vanishes"


class TestScreenDerivedMarks:
    """The record is authoritative and sparse; the screen fills the gap.

    A person reading the screen, typing a prompt or scrolling a diff writes
    no ledger entry and looks exactly like a suite running.  These are the
    falsifiers for the second source that fixes that -- including the one
    that matters most: a still screen must NOT produce marks, or the fix
    would simply refuse to compress anything and look like it worked.
    """

    @staticmethod
    def _frame(value: int, size: int = 16) -> bytes:
        return bytes([value] * size)

    def test_a_still_screen_produces_no_marks(self):
        frames = [self._frame(120) for _ in range(6)]
        assert speed_ramp.marks_from_frames(frames, 4.0, 0.004) == []

    def test_encoder_shimmer_is_not_movement(self):
        # One level of drift across the whole thumbnail is 1/255 = 0.0039,
        # just under the bar. The look-alike for real movement.
        frames = [self._frame(120), self._frame(121), self._frame(120)]
        assert speed_ramp.marks_from_frames(frames, 4.0, 0.004) == []

    def test_a_screen_that_moved_produces_marks(self):
        frames = [self._frame(120), self._frame(200), self._frame(200)]
        marks = speed_ramp.marks_from_frames(frames, 4.0, 0.004)
        assert marks, "movement produced no mark, so nothing would be protected"
        assert all(mark.source == "recording" for mark in marks)

    def test_both_ends_of_a_change_are_marked(self):
        # Marking only the later sample would leave the beginning of the
        # stretch -- where the movement actually started -- compressible.
        frames = [self._frame(120), self._frame(200)]
        seconds = sorted(
            mark.seconds for mark in speed_ramp.marks_from_frames(frames, 4.0, 0.004)
        )
        assert seconds == [0.0, 4.0]

    def test_ragged_or_empty_frames_are_skipped_not_crashed_on(self):
        frames = [b"", self._frame(120), bytes([1, 2, 3])]
        assert speed_ramp.marks_from_frames(frames, 4.0, 0.004) == []

    def test_screen_marks_protect_a_stretch_the_record_would_compress(self, tmp_path):
        _write_set(tmp_path, events=[0.0], activity=[])
        record_only = speed_ramp.build_segments(
            speed_ramp.collect_marks(tmp_path, 1, BASE, 600.0), 600.0
        )
        with_screen = speed_ramp.build_segments(
            speed_ramp.collect_marks(tmp_path, 1, BASE, 600.0)
            + [_mark(300.0), _mark(304.0)],
            600.0,
        )
        compressed_before = sum(
            segment.source_duration for segment in record_only if segment.rate > 1.0
        )
        compressed_after = sum(
            segment.source_duration for segment in with_screen if segment.rate > 1.0
        )
        assert compressed_after < compressed_before, (
            "adding evidence that a person was working did not protect anything"
        )

    def test_a_plan_built_without_sampling_the_recording_says_so(self, tmp_path):
        _write_set(tmp_path, events=[0.0], activity=[600.0])
        plan = speed_ramp.build_plan(tmp_path, 1, BASE, 600.0)
        assert plan["screenMarksUsed"] is False
        assert "NOT sampled" in speed_ramp.render_plan(plan)

    def test_a_segment_says_which_source_vouched_for_it(self, tmp_path):
        _write_set(tmp_path, events=[0.0], activity=[])
        segments = speed_ramp.build_segments(
            speed_ramp.collect_marks(tmp_path, 1, BASE, 600.0)
            + [
                speed_ramp.Mark(
                    seconds=300.0, source="recording", label="the screen changed"
                )
            ],
            600.0,
        )
        reasons = " ".join(segment.reason for segment in segments)
        assert "the screen moved here" in reasons, (
            "a stretch kept only because the screen moved is reported as though "
            "the record had vouched for it"
        )


class TestTheResidualThisCannotSee:
    """A person reading a static screen writes nothing and moves nothing.

    Neither evidence source can see them, so the threshold carries a margin
    instead: anything under it plays at real speed even if it really was a
    wait.  These pin that margin, because it is a number whose whole value
    is being larger than a plausible read.
    """

    def test_a_stretch_of_reading_length_is_never_compressed(self):
        # Forty-odd seconds of nothing: no timestamp, no movement, and a
        # person perfectly capable of having spent it reading a plan.
        segments = speed_ramp.build_segments(
            [_mark(0.0), _mark(46.0)], duration_seconds=50.0
        )
        assert all(segment.rate == 1.0 for segment in segments), (
            "a stretch short enough to have been someone reading was sped up"
        )

    def test_a_wait_long_enough_to_be_a_suite_still_is_compressed(self):
        # The look-alike. If this did not compress, the test above would be
        # satisfied by a ramp that never compresses anything.
        segments = speed_ramp.build_segments(
            [_mark(0.0), _mark(600.0)], duration_seconds=610.0
        )
        assert any(segment.rate > 1.0 for segment in segments)

    def test_an_animated_wait_errs_toward_a_longer_video(self):
        # A spinner or a scrolling log registers as movement, so it is kept
        # at real speed. That is the safe direction and it is worth pinning:
        # the dangerous error is compressing work, not failing to compress a
        # wait.
        moving = [bytes([120] * 16), bytes([200] * 16), bytes([120] * 16)]
        assert speed_ramp.marks_from_frames(moving, 4.0, 0.004), (
            "an animated wait produced no marks, so it would be compressed "
            "along with everything else"
        )
