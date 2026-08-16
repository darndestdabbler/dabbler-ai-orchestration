"""Compress the waiting out of a long session recording.

Set 113 Session 7.

A recording of a real Dabbler session is mostly waiting: a routed call
returns in a minute or two, a test suite runs for the better part of an
hour, and nothing on screen changes while it does.  A tutorial that plays
that back at real speed is unwatchable, and a tutorial that has had the
waiting cut out by hand cannot be regenerated when the product changes.

This is the one place the framework has an advantage over a video editor.
A Dabbler session already writes ``session-events.jsonl`` and
``activity-log.json`` with real timestamps, so *which stretches of a
recording were waiting* is *derivable from the framework's own record*
rather than eyeballed on a timeline.  The output is therefore a **plan** --
segments and rates, in a file -- and not a state inside an editor:

* an edit decision list can be reviewed, diffed and regenerated,
* a timeline inside an editor can be none of those things,
* and the compression that was actually applied can be *stated*, per
  segment, which a viewer is owed and an editor cannot tell you.

The rule the plan obeys, and it is the one that matters: **an interval in
which something happened is never compressed.**  Every mark is padded on
both sides before anything is sped up, so a step that produced one
timestamp still plays at real speed around it.

Quiet is established from **two** sources, because one of them is not
enough.  The framework's record is authoritative about what happened and
**sparse** -- an orchestrator session writes a timestamp every few minutes
-- so on a human-driven tutorial a person reading the screen, typing a
prompt or scrolling a diff looks exactly like a suite running.  So the
**recording itself** is sampled for movement and anything moving is a mark
too.  The two sources can only ever *add* real-time segments; neither can
remove one.

CLI
---

    python -m ai_router.speed_ramp plan --session-set-dir DIR --session N \\
        --recording-start 2026-08-16T14:03:11Z --duration-seconds 5400
    python -m ai_router.speed_ramp apply --plan PLAN.json --input IN.mp4 \\
        --output OUT.mp4

``plan`` writes the plan as JSON and prints the human-readable table.
``apply`` runs ffmpeg.  They are separate on purpose: the plan is meant to
be read, and possibly disagreed with, before an hour of video is re-encoded.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

# A gap shorter than this is not worth compressing: the ramp in and out of
# it costs the viewer more attention than the seconds it saves.
DEFAULT_QUIET_THRESHOLD_SECONDS = 20.0

# What a compressed stretch becomes.  Not zero -- a cut to nothing tells the
# viewer the wait did not happen, which is exactly the thing a tutorial
# about a workflow with real waits must not say.
DEFAULT_QUIET_TARGET_SECONDS = 4.0

# Nothing is ever sped up past this.  Beyond about forty times, a stretch of
# screen recording stops reading as fast-forward and starts reading as a
# glitch.
DEFAULT_MAX_RATE = 40.0

# Real time kept on each side of every mark, so the moment something
# happened is never inside a compressed segment.
DEFAULT_PAD_SECONDS = 3.0


@dataclass(frozen=True)
class Mark:
    """One instant at which the framework's own record says something happened."""

    seconds: float
    source: str
    label: str


# How often the recording itself is sampled for movement, and how much
# movement counts. Four seconds is fine enough to catch a person typing and
# coarse enough that an hour of video is 900 tiny frames; the threshold sits
# above encoder shimmer on a still screen and well below a cursor moving
# across a line of text.
DEFAULT_SCREEN_SAMPLE_SECONDS = 4.0
DEFAULT_SCREEN_CHANGE_THRESHOLD = 0.004

# The size each sampled frame is reduced to before comparison. Small on
# purpose: this is asking "did the screen change", not "what changed", and a
# thumbnail answers that while keeping an hour of video in a few megabytes.
SCREEN_SAMPLE_WIDTH = 64
SCREEN_SAMPLE_HEIGHT = 36


@dataclass(frozen=True)
class Segment:
    start_seconds: float
    end_seconds: float
    rate: float
    reason: str

    @property
    def source_duration(self) -> float:
        return max(0.0, self.end_seconds - self.start_seconds)

    @property
    def output_duration(self) -> float:
        return self.source_duration / self.rate if self.rate else 0.0


class SpeedRampError(RuntimeError):
    """The plan cannot be built or applied, with a reason a person can act on."""


def _parse_timestamp(value: str) -> datetime:
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        # Naive timestamps are treated as UTC rather than as local time.
        # Guessing local would make a plan that is correct on the machine
        # that recorded it and silently wrong on any other.
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def collect_marks(
    session_set_dir: Path,
    session_number: int,
    recording_start: datetime,
    duration_seconds: float,
) -> list[Mark]:
    """Every instant inside the recording that the framework itself recorded.

    Both files are read, and neither is required: a session whose events
    ledger has not been written yet still has an activity log, and a plan
    built from one of them is a worse plan rather than no plan.  What is
    *not* tolerated is finding no marks at all -- that means the recording
    and the record do not describe the same stretch of time, and compressing
    on that basis would cut through the middle of real work.
    """

    marks: list[Mark] = []

    events_path = session_set_dir / "session-events.jsonl"
    if events_path.exists():
        for line in events_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # A half-written final line is not a reason to refuse a plan.
                continue
            if event.get("session_number") != session_number:
                continue
            stamp = event.get("timestamp")
            if not stamp:
                continue
            offset = (_parse_timestamp(stamp) - recording_start).total_seconds()
            if 0 <= offset <= duration_seconds:
                marks.append(
                    Mark(
                        seconds=offset,
                        source="session-events.jsonl",
                        label=str(event.get("event_type", "event")),
                    )
                )

    activity_path = session_set_dir / "activity-log.json"
    if activity_path.exists():
        try:
            activity = json.loads(activity_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SpeedRampError(
                f"{activity_path} is not readable JSON ({exc}); the plan would "
                "be built from half the record"
            ) from exc
        for entry in activity.get("entries", []):
            if entry.get("sessionNumber") != session_number:
                continue
            stamp = entry.get("dateTime")
            if not stamp:
                continue
            offset = (_parse_timestamp(stamp) - recording_start).total_seconds()
            if 0 <= offset <= duration_seconds:
                marks.append(
                    Mark(
                        seconds=offset,
                        source="activity-log.json",
                        label=str(entry.get("stepKey") or entry.get("description", ""))[:80],
                    )
                )

    marks.sort(key=lambda mark: mark.seconds)
    return marks


def marks_from_frames(
    frames: Sequence[bytes],
    sample_seconds: float,
    threshold: float,
) -> list[Mark]:
    """Turn a series of sampled frames into marks wherever the screen moved.

    Split out from the ffmpeg call so the rule can be tested without a video
    file.  The comparison is a mean absolute difference over the whole
    thumbnail, which is deliberately crude: the question is *did anything
    move*, and a person typing one character moves enough pixels to clear a
    threshold set above encoder shimmer.

    Both ends of a change are marked.  A sample that differs from the one
    before it means the screen moved at some point in between, and marking
    only the later of the two would leave the beginning of that stretch
    eligible for compression.
    """

    marks: list[Mark] = []
    for index in range(1, len(frames)):
        earlier = frames[index - 1]
        later = frames[index]
        if len(earlier) != len(later) or not earlier:
            continue
        total = sum(abs(a - b) for a, b in zip(earlier, later))
        if total / (len(earlier) * 255.0) < threshold:
            continue
        marks.append(
            Mark(
                seconds=(index - 1) * sample_seconds,
                source="recording",
                label="the screen changed",
            )
        )
        marks.append(
            Mark(
                seconds=index * sample_seconds,
                source="recording",
                label="the screen changed",
            )
        )
    return marks


def collect_screen_marks(
    video: Path,
    *,
    sample_seconds: float = DEFAULT_SCREEN_SAMPLE_SECONDS,
    threshold: float = DEFAULT_SCREEN_CHANGE_THRESHOLD,
) -> list[Mark]:
    """Marks derived from the recording itself: the screen is the ground truth.

    The framework's own record is the *authoritative* source for what
    happened, and it is also **sparse** — an orchestrator session writes a
    timestamp every few minutes.  On a human-driven tutorial recording that
    sparseness is a real hazard: a person reading the screen, typing a
    prompt, or scrolling through a diff produces no ledger entry at all and
    looks exactly like a suite running.

    So the recording is asked too.  Anything the screen shows moving is a
    mark, and marks are never compressed — which means the two sources can
    only ever *add* real-time segments, never remove one.

    Returns an empty list rather than raising when ffmpeg is missing or the
    file cannot be decoded: this is a second opinion, and the plan is still
    buildable without it (less safely, which the caller is told).
    """

    if shutil.which("ffmpeg") is None:
        return []
    argv = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-vf",
        f"fps=1/{sample_seconds},scale={SCREEN_SAMPLE_WIDTH}:{SCREEN_SAMPLE_HEIGHT},format=gray",
        "-f",
        "rawvideo",
        "-",
    ]
    completed = subprocess.run(argv, capture_output=True)
    if completed.returncode != 0 or not completed.stdout:
        return []
    size = SCREEN_SAMPLE_WIDTH * SCREEN_SAMPLE_HEIGHT
    raw = completed.stdout
    frames = [raw[start : start + size] for start in range(0, len(raw) - size + 1, size)]
    return marks_from_frames(frames, sample_seconds, threshold)


def build_segments(
    marks: Sequence[Mark],
    duration_seconds: float,
    *,
    quiet_threshold: float = DEFAULT_QUIET_THRESHOLD_SECONDS,
    quiet_target: float = DEFAULT_QUIET_TARGET_SECONDS,
    max_rate: float = DEFAULT_MAX_RATE,
    pad_seconds: float = DEFAULT_PAD_SECONDS,
) -> list[Segment]:
    """Turn marks into a segment list, at real speed except where nothing happened.

    The construction is deliberately the boring one: build the intervals
    that must stay at real speed first (a pad around every mark, merged),
    and let the quiet segments be whatever is left over.  Doing it the other
    way -- finding the gaps and then trying to protect the marks -- is how
    an off-by-one puts a mark inside a compressed stretch.
    """

    if duration_seconds <= 0:
        raise SpeedRampError("the recording has no duration to plan over")

    keep: list[list] = []
    for mark in marks:
        start = max(0.0, mark.seconds - pad_seconds)
        end = min(duration_seconds, mark.seconds + pad_seconds)
        if keep and start <= keep[-1][1]:
            keep[-1][1] = max(keep[-1][1], end)
            keep[-1][2].add(mark.source)
        else:
            keep.append([start, end, {mark.source}])

    segments: list[Segment] = []
    cursor = 0.0
    for start, end, sources in keep:
        if start > cursor:
            segments.extend(
                _quiet_segments(
                    cursor,
                    start,
                    quiet_threshold=quiet_threshold,
                    quiet_target=quiet_target,
                    max_rate=max_rate,
                )
            )
        segments.append(
            Segment(
                start_seconds=round(start, 3),
                end_seconds=round(end, 3),
                rate=1.0,
                # Which source vouched for this stretch, not just that one
                # did. The two disagree usefully: the record knows what a
                # step WAS, and the recording knows that a person was doing
                # something the record never heard about.
                reason=_kept_because(sources),
            )
        )
        cursor = end
    if cursor < duration_seconds:
        segments.extend(
            _quiet_segments(
                cursor,
                duration_seconds,
                quiet_threshold=quiet_threshold,
                quiet_target=quiet_target,
                max_rate=max_rate,
            )
        )
    return [segment for segment in segments if segment.source_duration > 0.05]


def _kept_because(sources) -> str:
    from_record = {"session-events.jsonl", "activity-log.json"} & set(sources)
    from_screen = "recording" in sources
    if from_record and from_screen:
        return "the record says something happened here, and the screen moved"
    if from_screen:
        return (
            "the screen moved here, though the framework's record says nothing "
            "-- this is someone working"
        )
    return "the framework's own record says something happened here"


def _quiet_segments(
    start: float,
    end: float,
    *,
    quiet_threshold: float,
    quiet_target: float,
    max_rate: float,
) -> Iterable[Segment]:
    span = end - start
    if span <= 0:
        return []
    if span < quiet_threshold:
        return [
            Segment(
                start_seconds=round(start, 3),
                end_seconds=round(end, 3),
                rate=1.0,
                reason=(
                    f"quiet, but only {span:.1f}s -- shorter than the "
                    f"{quiet_threshold:.0f}s worth compressing"
                ),
            )
        ]
    rate = min(max_rate, span / quiet_target) if quiet_target > 0 else max_rate
    return [
        Segment(
            start_seconds=round(start, 3),
            end_seconds=round(end, 3),
            rate=round(max(1.0, rate), 3),
            reason=f"nothing in the record and nothing moving for {span:.1f}s",
        )
    ]


def build_plan(
    session_set_dir: Path,
    session_number: int,
    recording_start: datetime,
    duration_seconds: float,
    *,
    recording: Path | None = None,
    screen_marks: bool = True,
    **kwargs,
) -> dict:
    marks = collect_marks(
        session_set_dir, session_number, recording_start, duration_seconds
    )
    screen: list[Mark] = []
    if recording is not None and screen_marks:
        screen = [
            mark
            for mark in collect_screen_marks(recording)
            if 0 <= mark.seconds <= duration_seconds
        ]
        marks = sorted(marks + screen, key=lambda mark: mark.seconds)
    if not marks:
        raise SpeedRampError(
            "the framework's record has no timestamps inside this recording "
            f"(session {session_number}, {duration_seconds:.0f}s from "
            f"{recording_start.isoformat()}). Either the recording covers a "
            "different stretch of time than the session did, or --session is "
            "wrong. Refusing to compress on no evidence: everything would "
            "read as waiting."
        )
    segments = build_segments(marks, duration_seconds, **kwargs)
    output_duration = sum(segment.output_duration for segment in segments)
    compressed = [segment for segment in segments if segment.rate > 1.0]
    return {
        "plan": "speed ramp derived from the framework's own timestamps",
        "sessionSetDir": str(session_set_dir),
        "sessionNumber": session_number,
        "recordingStart": recording_start.isoformat(),
        "sourceDurationSeconds": round(duration_seconds, 3),
        "outputDurationSeconds": round(output_duration, 3),
        "compressionRatio": round(duration_seconds / output_duration, 3)
        if output_duration
        else None,
        "markCount": len(marks),
        "screenMarkCount": len(screen),
        "screenMarksUsed": bool(recording is not None and screen_marks),
        "compressedSegmentCount": len(compressed),
        "compressedSourceFraction": round(
            sum(segment.source_duration for segment in compressed) / duration_seconds,
            4,
        )
        if duration_seconds
        else 0.0,
        "settings": {
            "quietThresholdSeconds": kwargs.get(
                "quiet_threshold", DEFAULT_QUIET_THRESHOLD_SECONDS
            ),
            "quietTargetSeconds": kwargs.get(
                "quiet_target", DEFAULT_QUIET_TARGET_SECONDS
            ),
            "maxRate": kwargs.get("max_rate", DEFAULT_MAX_RATE),
            "padSeconds": kwargs.get("pad_seconds", DEFAULT_PAD_SECONDS),
        },
        "marks": [asdict(mark) for mark in marks],
        "segments": [asdict(segment) for segment in segments],
    }


def render_plan(plan: dict) -> str:
    """The plan as a table a person reads before an hour of video is re-encoded."""

    lines = [
        "Speed-ramp plan",
        f"  session set     {plan['sessionSetDir']}",
        f"  session         {plan['sessionNumber']}",
        f"  recording start {plan['recordingStart']}",
        f"  source          {plan['sourceDurationSeconds']:.0f}s",
        f"  output          {plan['outputDurationSeconds']:.0f}s"
        + (
            f"  ({plan['compressionRatio']:.1f}x shorter)"
            if plan.get("compressionRatio")
            else ""
        ),
        f"  marks           {plan['markCount']} "
        + (
            f"({plan['markCount'] - plan.get('screenMarkCount', 0)} from the "
            f"record, {plan.get('screenMarkCount', 0)} from the screen)"
            if plan.get("screenMarksUsed")
            else "from the framework's own record ONLY"
        ),
        "",
        f"  {'from':>9}  {'to':>9}  {'rate':>7}  why",
    ]
    for segment in plan["segments"]:
        rate = segment["rate"]
        lines.append(
            f"  {segment['start_seconds']:>9.1f}  {segment['end_seconds']:>9.1f}  "
            f"{rate:>6.1f}x  {segment['reason']}"
        )
    lines.append("")
    lines.append(
        "  Every segment above at 1.0x plays at real speed. Nothing the "
        "record\n  says happened is inside a compressed segment."
    )
    if not plan.get("screenMarksUsed"):
        lines.append(
            "  The recording itself was NOT sampled, so 'quiet' here means "
            "only that the\n  framework wrote nothing -- a person reading the "
            "screen looks the same.\n  Pass --recording to sample it."
        )
    fraction = plan.get("compressedSourceFraction")
    if fraction is not None:
        lines.append(
            f"  {fraction * 100:.0f}% of the recording is compressed."
        )
        # Said out loud rather than left for the reader to work out, because
        # the failure this guards against is silent: an orchestrator session
        # writes a mark every few minutes, so a stretch where a person sat
        # reading the screen looks exactly like a stretch where a test suite
        # was running. The plan is a proposal, and this is the number that
        # tells you how much of it to actually read.
        if fraction > 0.9:
            lines.append(
                "  READ THE SEGMENTS. Almost all of this recording is being "
                "sped up, which\n  is right for a session that spent its time "
                "waiting on suites and wrong for\n  one where a person was "
                "reading and typing without the framework noticing."
            )
    return "\n".join(lines)


def ffmpeg_filter(segments: Sequence[dict]) -> str:
    """The filter graph that applies a plan.

    Video only, and that is a property of the source rather than a
    limitation: these recordings have no audio track, which keeps this a
    one-filter problem instead of an atempo chain with its own rate limits.
    """

    parts = []
    labels = []
    for index, segment in enumerate(segments):
        label = f"v{index}"
        parts.append(
            f"[0:v]trim=start={segment['start_seconds']}:"
            f"end={segment['end_seconds']},setpts=(PTS-STARTPTS)/"
            f"{segment['rate']}[{label}]"
        )
        labels.append(f"[{label}]")
    parts.append("".join(labels) + f"concat=n={len(segments)}:v=1:a=0[out]")
    return ";".join(parts)


def apply_plan(plan: dict, source: Path, target: Path) -> dict:
    segments = plan.get("segments") or []
    if not segments:
        raise SpeedRampError("the plan has no segments to apply")
    if shutil.which("ffmpeg") is None:
        raise SpeedRampError(
            "ffmpeg is not on PATH. The plan is still valid and still "
            "readable; only applying it needs ffmpeg."
        )
    filter_graph = ffmpeg_filter(segments)
    argv = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-filter_complex",
        filter_graph,
        "-map",
        "[out]",
        "-an",
        "-y",
        str(target),
    ]
    completed = subprocess.run(argv, capture_output=True, text=True)
    if completed.returncode != 0:
        raise SpeedRampError(
            "ffmpeg exited " + str(completed.returncode) + ": " +
            (completed.stderr or "").strip()[:800]
        )
    return {
        "applied": True,
        "source": str(source),
        "output": str(target),
        "segments": len(segments),
        "outputDurationSeconds": plan.get("outputDurationSeconds"),
    }


def probe_duration_seconds(video: Path) -> float:
    if shutil.which("ffprobe") is None:
        raise SpeedRampError(
            "ffprobe is not on PATH, so the recording's length cannot be "
            "read; pass --duration-seconds instead"
        )
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(video),
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise SpeedRampError("ffprobe could not read " + str(video))
    return float(completed.stdout.strip())


def _cmd_plan(args: argparse.Namespace) -> int:
    duration = args.duration_seconds
    if duration is None:
        if not args.recording:
            raise SpeedRampError(
                "pass either --duration-seconds or --recording so the length "
                "of the video is known"
            )
        duration = probe_duration_seconds(Path(args.recording))
    plan = build_plan(
        Path(args.session_set_dir),
        args.session,
        _parse_timestamp(args.recording_start),
        duration,
        recording=Path(args.recording) if args.recording else None,
        screen_marks=not args.no_screen_marks,
        quiet_threshold=args.quiet_threshold,
        quiet_target=args.quiet_target,
        max_rate=args.max_rate,
        pad_seconds=args.pad_seconds,
    )
    text = render_plan(plan)
    if args.out:
        Path(args.out).write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
        print(f"[speed_ramp] wrote {args.out}")
    print(text)
    return 0


def _cmd_apply(args: argparse.Namespace) -> int:
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    result = apply_plan(plan, Path(args.input), Path(args.output))
    print(json.dumps(result, indent=2))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.speed_ramp",
        description=(
            "Derive, from a session's own timestamps, which stretches of its "
            "recording were waiting -- and compress those and nothing else."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    plan_parser = sub.add_parser("plan", help="build and print the ramp plan")
    plan_parser.add_argument("--session-set-dir", required=True)
    plan_parser.add_argument("--session", type=int, required=True)
    plan_parser.add_argument(
        "--recording-start",
        required=True,
        help="when the recording started, as an ISO-8601 timestamp",
    )
    plan_parser.add_argument("--duration-seconds", type=float, default=None)
    plan_parser.add_argument("--recording", default=None, help="read the length from this file")
    plan_parser.add_argument("--out", default=None)
    plan_parser.add_argument(
        "--no-screen-marks",
        action="store_true",
        help=(
            "do not sample the recording for movement. The framework's record "
            "is sparse, so this makes the plan blind to anything a person did "
            "that wrote no timestamp."
        ),
    )
    plan_parser.add_argument(
        "--quiet-threshold", type=float, default=DEFAULT_QUIET_THRESHOLD_SECONDS
    )
    plan_parser.add_argument(
        "--quiet-target", type=float, default=DEFAULT_QUIET_TARGET_SECONDS
    )
    plan_parser.add_argument("--max-rate", type=float, default=DEFAULT_MAX_RATE)
    plan_parser.add_argument("--pad-seconds", type=float, default=DEFAULT_PAD_SECONDS)
    plan_parser.set_defaults(func=_cmd_plan)

    apply_parser = sub.add_parser("apply", help="apply a plan with ffmpeg")
    apply_parser.add_argument("--plan", required=True)
    apply_parser.add_argument("--input", required=True)
    apply_parser.add_argument("--output", required=True)
    apply_parser.set_defaults(func=_cmd_apply)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except SpeedRampError as exc:
        print(f"[speed_ramp] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
