"""The artifacts of one recorded walkthrough run (Set 113 Session 3).

:mod:`ai_router.scenario` owns what a human does and what they should
then see. This module owns what happened when a machine did it: a
timestamped **step-event stream** keyed by the same stable step ids, and
a **run manifest** that can reference zero or more artifacts of any kind.

**Zero or more, and not necessarily an MP4.** The manifest is this set's
one paid-for hedge against platform uncertainty, so it is written as a
list of typed artifacts with explicit media types rather than a record
with a ``video`` field. Session 3's browser recorder produces WebM;
Session 4 may produce something else, or nothing; a terminal cast is not
a video at all. **An empty artifact list is valid**, because failure to
record must never fail the walkthrough -- the Session 2 documents stand
alone with no recording in existence, and a run that captured nothing is
a run that produced exactly what those documents already promised.

**The inventory is the scenario, not the stream.** A timeline carries one
record per authored step, so a step the run never reached is *present and
marked* rather than absent. That is Session 1's finding applied one layer
down: a report assembled from whatever records exist makes an omitted
item indistinguishable from a passing one.

**Timing is anchored, not assumed.** Video recording starts when the
browser context is created, and nothing reports the exact instant it
began. The driver therefore brackets that call and reports the interval;
``anchor.uncertaintyMillis`` is how far the cue times may be out, carried
in the manifest instead of being quietly rounded away. Cue windows are
derived from each step's ``started`` event and run to the **next** step's
start, so captions cover the run continuously -- a caption that blinks
off during driver overhead reads as a bug in the video.

**Staleness is detectable.** Round 3 of this set's consults killed the
claim that on-demand regeneration makes staleness impossible. It does
not, so the manifest records the ``portableDigest`` of the scenario the
run was made from and :func:`finalize_run` refuses to assemble artifacts
whose scenario has changed underneath them. A stale recording is
regenerated, never patched.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from ai_router.scenario import Scenario, ScenarioError, load_scenario

#: The driver's raw output. Written by whatever drove the product; read
#: here and never written here, so each file has exactly one writer.
DRIVER_OUTPUT_FILENAME = "driver-output.json"

#: The step-event stream, one JSON object per line. Also driver-written.
EVENTS_FILENAME = "events.jsonl"

#: The validated run record. Written by :func:`finalize_run`'s caller.
MANIFEST_FILENAME = "manifest.json"

#: The retimed caption sidecar, and the static index.
CAPTIONS_FILENAME = "captions.vtt"
INDEX_FILENAME = "index.html"

MANIFEST_SCHEMA_VERSION = 1

#: Event kinds, closed. ``run-started`` anchors every other timestamp;
#: the three step kinds are the ones the spec names.
RUN_STARTED = "run-started"
RUN_FINISHED = "run-finished"
STEP_STARTED = "started"
STEP_COMPLETED = "completed"
STEP_FAILED = "failed"

EVENT_KINDS = frozenset(
    {RUN_STARTED, RUN_FINISHED, STEP_STARTED, STEP_COMPLETED, STEP_FAILED}
)
STEP_EVENT_KINDS = frozenset({STEP_STARTED, STEP_COMPLETED, STEP_FAILED})

#: Keys one event may carry. Unknown keys are refused: the driver and
#: this reader are both ours, so an unrecognised key is a typo or a
#: half-landed change, never a message from the future.
EVENT_KEYS = frozenset({"event", "atMillis", "stepId", "error", "bounds"})

#: Bounding-box keys. Recorded per step and consumed by NOTHING yet --
#: it is the operator's 2026-08-15 cheap hedge that keeps post-processing
#: zoom (tier 2) possible later without re-recording anything. Capture-time
#: zoom was refused outright, and in-page emphasis (tier 1) is the driver's
#: job, not this module's.
BOUNDS_KEYS = frozenset({"x", "y", "width", "height"})

#: Artifact kinds, closed, and deliberately naming media that are not
#: video. Adding a kind is a code change, which is the point.
ARTIFACT_KINDS = frozenset(
    {
        "browser-video",
        "os-video",
        "terminal-cast",
        "captions",
        "screenshot",
        "transcript",
        "index",
    }
)

ARTIFACT_KEYS = frozenset({"kind", "path", "mediaType", "bytes", "note"})

#: Per-step outcomes. ``not-reached`` is why the inventory is the
#: scenario: a run that died at step 2 must still account for steps 3-5.
STEP_COMPLETED_OUTCOME = "completed"
STEP_FAILED_OUTCOME = "failed"
STEP_NOT_REACHED = "not-reached"
STEP_INCOMPLETE = "incomplete"

#: Run outcomes. ``incomplete`` is a run whose stream simply stops -- the
#: driver was killed, or the machine went away.
RUN_COMPLETED = "completed"
RUN_FAILED = "failed"
RUN_INCOMPLETE = "incomplete"

DRIVER_OUTPUT_KEYS = frozenset(
    {
        "scenarioId",
        "scenarioPath",
        "portableDigest",
        "driver",
        "target",
        "startedAt",
        "finishedAt",
        "anchor",
        "artifacts",
        "notes",
    }
)
REQUIRED_DRIVER_OUTPUT_KEYS = (
    "scenarioId",
    "portableDigest",
    "driver",
    "startedAt",
)

ANCHOR_KEYS = frozenset({"basis", "uncertaintyMillis"})


class RunError(ValueError):
    """A run artifact contradicts itself, or contradicts its scenario."""

    def __init__(self, message: str, source: Optional[Path] = None) -> None:
        self.source = Path(source) if source else None
        super().__init__(f"{source}: {message}" if source else message)


# ---------------------------------------------------------------------------
# The step-event stream
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StepEvent:
    """One line of the stream."""

    kind: str
    at_millis: int
    step_id: Optional[str] = None
    error: Optional[str] = None
    bounds: Optional[Mapping[str, float]] = None

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"event": self.kind, "atMillis": self.at_millis}
        if self.step_id is not None:
            out["stepId"] = self.step_id
        if self.error is not None:
            out["error"] = self.error
        if self.bounds is not None:
            out["bounds"] = dict(self.bounds)
        return out


def _parse_bounds(
    value: Any, line_no: int, source: Optional[Path]
) -> Mapping[str, float]:
    if not isinstance(value, Mapping):
        raise RunError(f"line {line_no}: 'bounds' must be an object", source)
    unknown = sorted(set(value) - BOUNDS_KEYS)
    if unknown:
        raise RunError(
            f"line {line_no}: unknown bounds key(s) {unknown}; expected "
            f"{sorted(BOUNDS_KEYS)}",
            source,
        )
    missing = sorted(BOUNDS_KEYS - set(value))
    if missing:
        raise RunError(
            f"line {line_no}: bounds is missing {missing}; a partial box "
            "cannot be used to crop or zoom, so a partial box is refused",
            source,
        )
    out: Dict[str, float] = {}
    for key in sorted(BOUNDS_KEYS):
        number = value[key]
        if isinstance(number, bool) or not isinstance(number, (int, float)):
            raise RunError(f"line {line_no}: bounds.{key} must be a number", source)
        out[key] = float(number)
    return out


def parse_events(
    text: str, source: Optional[Path] = None
) -> Tuple[List[StepEvent], List[str]]:
    """Parse the stream. Returns ``(events, notes)``.

    **Lenient about truncation, strict about contradiction.** This is a
    machine-written record, and the way it goes wrong is that the writer
    dies -- so a final line that is not valid JSON is dropped with a note
    rather than refused, and a run whose stream simply stops is a legal
    ``incomplete`` run. Everything else is refused with the fix named: an
    unknown event kind, an out-of-order timestamp, a terminal event for a
    step that never started, a second ``started`` for one step. Those are
    not truncation, they are a driver disagreeing with itself, and
    silently averaging over them would put wrong times under a video a
    reviewer is about to trust.
    """
    notes: List[str] = []
    raw_lines = text.splitlines()
    records: List[Tuple[int, Mapping[str, Any]]] = []
    for index, line in enumerate(raw_lines, start=1):
        if not line.strip():
            continue
        try:
            decoded = json.loads(line)
        except json.JSONDecodeError as exc:
            if index == len(raw_lines):
                notes.append(
                    "the last line of the step-event stream was incomplete and "
                    "was dropped; the run was interrupted while writing it"
                )
                continue
            raise RunError(f"line {index} is not valid JSON: {exc}", source) from exc
        if not isinstance(decoded, Mapping):
            raise RunError(f"line {index} is not a JSON object", source)
        records.append((index, decoded))

    if not records:
        raise RunError(
            "the step-event stream is empty; a run always emits at least "
            f"'{RUN_STARTED}'",
            source,
        )

    events: List[StepEvent] = []
    started_steps: Dict[str, int] = {}
    finished_steps: set = set()
    previous_millis = -1
    for line_no, record in records:
        unknown = sorted(set(record) - EVENT_KEYS)
        if unknown:
            raise RunError(
                f"line {line_no}: unknown event key(s) {unknown}; expected "
                f"{sorted(EVENT_KEYS)}",
                source,
            )
        kind = record.get("event")
        if kind not in EVENT_KINDS:
            raise RunError(
                f"line {line_no}: unknown event '{kind}'; expected one of "
                f"{sorted(EVENT_KINDS)}",
                source,
            )
        at_millis = record.get("atMillis")
        if isinstance(at_millis, bool) or not isinstance(at_millis, int):
            raise RunError(
                f"line {line_no}: 'atMillis' must be a whole number of "
                "milliseconds since the run anchor",
                source,
            )
        if at_millis < 0:
            raise RunError(
                f"line {line_no}: 'atMillis' is {at_millis}; timestamps are "
                "relative to the run anchor and cannot precede it",
                source,
            )
        if at_millis < previous_millis:
            raise RunError(
                f"line {line_no}: 'atMillis' {at_millis} is before the "
                f"previous event's {previous_millis}; the stream is append-only "
                "and must be non-decreasing",
                source,
            )
        previous_millis = at_millis

        step_id = record.get("stepId")
        if kind in STEP_EVENT_KINDS:
            if not isinstance(step_id, str) or not step_id:
                raise RunError(
                    f"line {line_no}: '{kind}' must carry a 'stepId'", source
                )
        elif step_id is not None:
            raise RunError(
                f"line {line_no}: '{kind}' is a run-level event and must not "
                "carry a 'stepId'",
                source,
            )

        if kind == RUN_STARTED and events:
            raise RunError(
                f"line {line_no}: '{RUN_STARTED}' must be the first event and "
                "may appear once",
                source,
            )
        if kind != RUN_STARTED and not events:
            raise RunError(
                f"line {line_no}: the stream opens with '{kind}'; the first "
                f"event must be '{RUN_STARTED}', which anchors every timestamp",
                source,
            )
        if events and events[-1].kind == RUN_FINISHED:
            raise RunError(
                f"line {line_no}: '{kind}' follows '{RUN_FINISHED}'; nothing "
                "may be appended after the run ends",
                source,
            )

        if kind == STEP_STARTED:
            if step_id in started_steps:
                raise RunError(
                    f"line {line_no}: step '{step_id}' already started on line "
                    f"{started_steps[step_id]}; a step starts once per run",
                    source,
                )
            started_steps[step_id] = line_no
        elif kind in (STEP_COMPLETED, STEP_FAILED):
            if step_id not in started_steps:
                raise RunError(
                    f"line {line_no}: '{kind}' for step '{step_id}', which never "
                    f"emitted '{STEP_STARTED}'",
                    source,
                )
            if step_id in finished_steps:
                raise RunError(
                    f"line {line_no}: step '{step_id}' already ended earlier in "
                    "the stream",
                    source,
                )
            finished_steps.add(step_id)

        error = record.get("error")
        if error is not None and not isinstance(error, str):
            raise RunError(f"line {line_no}: 'error' must be a string", source)
        if kind == STEP_FAILED and not error:
            raise RunError(
                f"line {line_no}: '{STEP_FAILED}' must carry a non-empty "
                "'error'; a failure nobody described is not a record",
                source,
            )
        bounds = record.get("bounds")
        if bounds is not None:
            if kind != STEP_STARTED:
                raise RunError(
                    f"line {line_no}: 'bounds' belongs on '{STEP_STARTED}', "
                    "which is when the target was located",
                    source,
                )
            bounds = _parse_bounds(bounds, line_no, source)

        events.append(
            StepEvent(
                kind=kind,
                at_millis=at_millis,
                step_id=step_id,
                error=error,
                bounds=bounds,
            )
        )

    return events, notes


def load_events(path: Path) -> Tuple[List[StepEvent], List[str]]:
    """Read and parse :data:`EVENTS_FILENAME` at *path*."""
    path = Path(path)
    if path.is_dir():
        path = path / EVENTS_FILENAME
    if not path.exists():
        raise RunError(f"no step-event stream at {path}", path)
    return parse_events(path.read_text(encoding="utf-8"), source=path)


def format_events(events: Sequence[StepEvent]) -> str:
    """Serialise a stream back to JSONL (used by the tests and by fixtures)."""
    return "".join(
        json.dumps(event.payload(), ensure_ascii=False, sort_keys=True) + "\n"
        for event in events
    )


# ---------------------------------------------------------------------------
# The timeline
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StepRecord:
    """What the run did with one AUTHORED step -- including nothing."""

    step_id: str
    position: int
    title: str
    outcome: str
    start_millis: Optional[int] = None
    end_millis: Optional[int] = None
    error: Optional[str] = None
    bounds: Optional[Mapping[str, float]] = None

    @property
    def reached(self) -> bool:
        return self.start_millis is not None

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "stepId": self.step_id,
            "position": self.position,
            "title": self.title,
            "outcome": self.outcome,
            "startMillis": self.start_millis,
            "endMillis": self.end_millis,
        }
        if self.error is not None:
            out["error"] = self.error
        if self.bounds is not None:
            out["bounds"] = dict(self.bounds)
        return out


@dataclass(frozen=True)
class RunTimeline:
    """The scenario's steps, married to what the stream says happened."""

    scenario_id: str
    steps: Tuple[StepRecord, ...]
    outcome: str
    duration_millis: int
    notes: Tuple[str, ...] = ()

    @property
    def reached(self) -> Tuple[StepRecord, ...]:
        return tuple(step for step in self.steps if step.reached)

    def cue_windows(self) -> List[Optional[Tuple[int, int]]]:
        """One caption window per authored step; ``None`` where unreached."""
        return cue_windows(self.steps, self.duration_millis)


def cue_windows(
    steps: Sequence["StepRecord"], duration_millis: int
) -> List[Optional[Tuple[int, int]]]:
    """One caption window per authored step; ``None`` where unreached.

    A reached step's cue runs from its own ``started`` to the NEXT
    reached step's ``started`` -- not to its own ``completed`` -- so the
    captions cover the recording continuously. The gap between one step
    ending and the next beginning is driver overhead that is nonetheless
    on screen, and a caption track that goes blank across it looks broken
    rather than precise. The true per-step boundaries are not lost: they
    are the manifest's ``startMillis`` and ``endMillis``.
    """
    starts = [step.start_millis for step in steps]
    windows: List[Optional[Tuple[int, int]]] = []
    for index, step in enumerate(steps):
        if step.start_millis is None:
            windows.append(None)
            continue
        following = [value for value in starts[index + 1 :] if value is not None]
        end = following[0] if following else duration_millis
        # A zero-length cue is not displayable; give it 1ms so a
        # degenerate run still produces a readable file.
        windows.append((step.start_millis, max(end, step.start_millis + 1)))
    return windows


def build_timeline(
    scenario: Scenario,
    events: Sequence[StepEvent],
    notes: Sequence[str] = (),
) -> RunTimeline:
    """Marry the authored inventory to the recorded stream.

    Every event's ``stepId`` must name a step the scenario declares. An
    unmatched id is refused rather than ignored -- it is a driver keyed
    to a step that was renamed or removed, which is exactly the drift
    this set exists to prevent.
    """
    known = {step.id for step in scenario.steps}
    for event in events:
        if event.step_id is not None and event.step_id not in known:
            raise RunError(
                f"the stream reports step '{event.step_id}', which scenario "
                f"'{scenario.id}' does not declare; the driver is keyed to a "
                "step that was renamed or removed -- re-record after fixing it"
            )

    started: Dict[str, StepEvent] = {}
    terminal: Dict[str, StepEvent] = {}
    for event in events:
        if event.kind == STEP_STARTED:
            started[event.step_id] = event
        elif event.kind in (STEP_COMPLETED, STEP_FAILED):
            terminal[event.step_id] = event

    finished = bool(events) and events[-1].kind == RUN_FINISHED
    duration = events[-1].at_millis if events else 0

    records: List[StepRecord] = []
    for position, step in enumerate(scenario.steps, start=1):
        begin = started.get(step.id)
        end = terminal.get(step.id)
        if begin is None:
            outcome = STEP_NOT_REACHED
        elif end is None:
            outcome = STEP_INCOMPLETE
        elif end.kind == STEP_FAILED:
            outcome = STEP_FAILED_OUTCOME
        else:
            outcome = STEP_COMPLETED_OUTCOME
        records.append(
            StepRecord(
                step_id=step.id,
                position=position,
                title=step.title,
                outcome=outcome,
                start_millis=begin.at_millis if begin else None,
                end_millis=end.at_millis if end else None,
                error=end.error if end else None,
                bounds=begin.bounds if begin else None,
            )
        )

    if any(record.outcome == STEP_FAILED_OUTCOME for record in records):
        run_outcome = RUN_FAILED
    elif not finished or any(
        record.outcome in (STEP_NOT_REACHED, STEP_INCOMPLETE) for record in records
    ):
        run_outcome = RUN_INCOMPLETE
    else:
        run_outcome = RUN_COMPLETED

    return RunTimeline(
        scenario_id=scenario.id,
        steps=tuple(records),
        outcome=run_outcome,
        duration_millis=duration,
        notes=tuple(notes),
    )


# ---------------------------------------------------------------------------
# Artifacts and the manifest
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Artifact:
    """One file this run produced. There may be none."""

    kind: str
    path: str
    media_type: str
    size_bytes: Optional[int] = None
    note: Optional[str] = None

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "kind": self.kind,
            "path": self.path,
            "mediaType": self.media_type,
        }
        if self.size_bytes is not None:
            out["bytes"] = self.size_bytes
        if self.note is not None:
            out["note"] = self.note
        return out


def parse_artifact(value: Any, run_dir: Path, source: Optional[Path] = None) -> Artifact:
    """Validate one artifact entry, including that the file is really there."""
    if not isinstance(value, Mapping):
        raise RunError("each artifact must be an object", source)
    unknown = sorted(set(value) - ARTIFACT_KEYS)
    if unknown:
        raise RunError(
            f"unknown artifact key(s) {unknown}; expected {sorted(ARTIFACT_KEYS)}",
            source,
        )
    kind = value.get("kind")
    if kind not in ARTIFACT_KINDS:
        raise RunError(
            f"unknown artifact kind '{kind}'; expected one of "
            f"{sorted(ARTIFACT_KINDS)}. Adding a kind is a code change, so that "
            "a new medium is a decision rather than a typo",
            source,
        )
    path = value.get("path")
    if not isinstance(path, str) or not path:
        raise RunError(f"artifact '{kind}' is missing 'path'", source)
    if Path(path).is_absolute() or "\\" in path or path.startswith("/"):
        raise RunError(
            f"artifact path '{path}' must be relative to the run directory and "
            "use forward slashes; an absolute path stops the run directory "
            "being movable or shareable",
            source,
        )
    run_root = Path(run_dir).resolve()
    resolved = (run_root / path).resolve()
    if run_root not in resolved.parents:
        raise RunError(f"artifact path '{path}' escapes the run directory", source)
    if not resolved.exists():
        raise RunError(
            f"artifact '{kind}' claims '{path}', which does not exist. A "
            "manifest that lists a file nobody wrote is worse than one that "
            "lists nothing",
            source,
        )
    media_type = value.get("mediaType")
    if not isinstance(media_type, str) or not media_type:
        raise RunError(
            f"artifact '{kind}' is missing 'mediaType'; nothing here assumes an "
            "artifact is an MP4, so every artifact says what it is",
            source,
        )
    size = value.get("bytes")
    if size is not None and (isinstance(size, bool) or not isinstance(size, int)):
        raise RunError(f"artifact '{kind}': 'bytes' must be a whole number", source)
    note = value.get("note")
    if note is not None and not isinstance(note, str):
        raise RunError(f"artifact '{kind}': 'note' must be a string", source)
    return Artifact(
        kind=kind,
        path=path,
        media_type=media_type,
        size_bytes=size,
        note=note,
    )


@dataclass(frozen=True)
class RunManifest:
    """The validated record of one run. Serialised as ``manifest.json``."""

    scenario_id: str
    portable_digest: str
    title: str
    driver: str
    started_at: str
    outcome: str
    duration_millis: int
    steps: Tuple[StepRecord, ...]
    artifacts: Tuple[Artifact, ...] = ()
    finished_at: Optional[str] = None
    target: Optional[Mapping[str, Any]] = None
    anchor: Optional[Mapping[str, Any]] = None
    notes: Tuple[str, ...] = ()
    schema_version: int = MANIFEST_SCHEMA_VERSION

    def artifact(self, kind: str) -> Optional[Artifact]:
        for entry in self.artifacts:
            if entry.kind == kind:
                return entry
        return None

    @property
    def video(self) -> Optional[Artifact]:
        """The one video, if the run produced one. It may well not have."""
        return self.artifact("browser-video") or self.artifact("os-video")

    def payload(self) -> Dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "scenarioId": self.scenario_id,
            "portableDigest": self.portable_digest,
            "title": self.title,
            "driver": self.driver,
            "target": dict(self.target) if self.target else None,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "outcome": self.outcome,
            "durationMillis": self.duration_millis,
            "anchor": dict(self.anchor) if self.anchor else None,
            "steps": [step.payload() for step in self.steps],
            "artifacts": [entry.payload() for entry in self.artifacts],
            "notes": list(self.notes),
        }


def _parse_anchor(value: Any, source: Optional[Path]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise RunError("'anchor' must be an object", source)
    unknown = sorted(set(value) - ANCHOR_KEYS)
    if unknown:
        raise RunError(
            f"unknown anchor key(s) {unknown}; expected {sorted(ANCHOR_KEYS)}",
            source,
        )
    basis = value.get("basis")
    if not isinstance(basis, str) or not basis:
        raise RunError(
            "'anchor.basis' must name what time zero is measured from", source
        )
    uncertainty = value.get("uncertaintyMillis")
    if isinstance(uncertainty, bool) or not isinstance(uncertainty, int):
        raise RunError(
            "'anchor.uncertaintyMillis' must be a whole number of milliseconds. "
            "Nothing reports the exact instant a recording began, so the driver "
            "brackets that call and reports the width of the bracket rather "
            "than implying a frame accuracy it does not have",
            source,
        )
    if uncertainty < 0:
        raise RunError("'anchor.uncertaintyMillis' cannot be negative", source)
    return {"basis": basis, "uncertaintyMillis": uncertainty}


def load_driver_output(run_dir: Path) -> Dict[str, Any]:
    """Read and shape-check the driver's raw output."""
    run_dir = Path(run_dir)
    source = run_dir / DRIVER_OUTPUT_FILENAME
    if not source.exists():
        raise RunError(f"no driver output at {source}", source)
    try:
        raw = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RunError(f"driver output is not valid JSON: {exc}", source) from exc
    if not isinstance(raw, Mapping):
        raise RunError("driver output must be a JSON object", source)
    unknown = sorted(set(raw) - DRIVER_OUTPUT_KEYS)
    if unknown:
        raise RunError(
            f"unknown driver-output key(s) {unknown}; expected "
            f"{sorted(DRIVER_OUTPUT_KEYS)}",
            source,
        )
    for key in REQUIRED_DRIVER_OUTPUT_KEYS:
        if not raw.get(key):
            raise RunError(f"driver output is missing '{key}'", source)
    return dict(raw)


def finalize_run(
    run_dir: Path,
    scenario: Optional[Scenario] = None,
    extra_artifacts: Sequence[Artifact] = (),
) -> RunManifest:
    """Validate a finished run and assemble its manifest.

    *scenario* defaults to the one the driver named in its output. The
    run is refused when that scenario's portable digest has moved since
    the recording was made: the video shows one thing and the documents
    now say another, and no amount of re-rendering fixes a recording.
    """
    run_dir = Path(run_dir).resolve()
    raw = load_driver_output(run_dir)
    source = run_dir / DRIVER_OUTPUT_FILENAME

    if scenario is None:
        scenario_path = raw.get("scenarioPath")
        if not scenario_path:
            raise RunError(
                "driver output carries no 'scenarioPath', so the scenario "
                "cannot be re-read; pass one explicitly",
                source,
            )
        scenario = load_scenario(Path(scenario_path))

    if scenario.id != raw["scenarioId"]:
        raise RunError(
            f"the run was made against scenario '{raw['scenarioId']}' but "
            f"'{scenario.id}' was supplied",
            source,
        )
    if scenario.portable_digest() != raw["portableDigest"]:
        raise RunError(
            f"scenario '{scenario.id}' has changed since this run was recorded "
            f"(run: {raw['portableDigest']}, now: {scenario.portable_digest()}). "
            "A stale recording is regenerated, never patched -- re-run the "
            "driver rather than re-finalising this directory",
            source,
        )

    events, event_notes = load_events(run_dir)
    timeline = build_timeline(scenario, events, notes=event_notes)

    artifacts: List[Artifact] = [
        parse_artifact(entry, run_dir, source) for entry in raw.get("artifacts") or []
    ]
    artifacts.extend(extra_artifacts)

    notes = [str(note) for note in raw.get("notes") or []]
    for note in event_notes:
        if note not in notes:
            notes.append(note)

    anchor = _parse_anchor(raw["anchor"], source) if raw.get("anchor") else None

    return RunManifest(
        scenario_id=scenario.id,
        portable_digest=scenario.portable_digest(),
        title=scenario.title,
        driver=str(raw["driver"]),
        started_at=str(raw["startedAt"]),
        finished_at=raw.get("finishedAt"),
        outcome=timeline.outcome,
        duration_millis=timeline.duration_millis,
        steps=timeline.steps,
        artifacts=tuple(artifacts),
        target=raw.get("target"),
        anchor=anchor,
        notes=tuple(notes),
    )


# ---------------------------------------------------------------------------
# Writing the run out
# ---------------------------------------------------------------------------

#: The caption sidecar of a RUN is not the committed rendering, and must
#: not claim to be: nothing re-renders it and ``--check`` does not gate it.
RUN_CAPTION_NOTE = (
    "Timed from this run's own step-event stream, not from the authored "
    "durations. Generated by `python -m ai_router.walkthrough_run finalize`; "
    "re-run the driver rather than editing this file."
)


def finalize_and_write(
    run_dir: Path, scenario: Optional[Scenario] = None
) -> RunManifest:
    """Validate the run, write its derived artifacts, return the manifest.

    Writes, in order: the retimed captions (only when there is a video for
    them to be a sidecar to), the static index, and ``manifest.json``. Each
    derived file is registered through the same validator the driver's own
    artifacts go through, so "the manifest lists it" and "the file is
    there" cannot come apart.
    """
    from ai_router.scenario_render import render_captions
    from ai_router.walkthrough_index import render_index

    run_dir = Path(run_dir).resolve()
    manifest = finalize_run(run_dir, scenario)
    resolved = scenario
    if resolved is None:
        resolved = load_scenario(Path(load_driver_output(run_dir)["scenarioPath"]))

    artifacts: List[Artifact] = list(manifest.artifacts)

    if manifest.video is not None:
        captions_text = render_captions(
            resolved,
            windows_ms=cue_windows(manifest.steps, manifest.duration_millis),
            timing_note=RUN_CAPTION_NOTE,
        )
        (run_dir / CAPTIONS_FILENAME).write_text(
            captions_text, encoding="utf-8", newline="\n"
        )
        artifacts.append(
            parse_artifact(
                {
                    "kind": "captions",
                    "path": CAPTIONS_FILENAME,
                    "mediaType": "text/vtt",
                    "bytes": (run_dir / CAPTIONS_FILENAME).stat().st_size,
                    "note": "cue times measured from the run, not authored",
                },
                run_dir,
            )
        )
        manifest = replace(manifest, artifacts=tuple(artifacts))

    index_html = render_index(manifest, resolved)
    (run_dir / INDEX_FILENAME).write_text(index_html, encoding="utf-8", newline="\n")
    artifacts.append(
        parse_artifact(
            {
                "kind": "index",
                "path": INDEX_FILENAME,
                "mediaType": "text/html",
                "bytes": (run_dir / INDEX_FILENAME).stat().st_size,
            },
            run_dir,
        )
    )
    manifest = replace(manifest, artifacts=tuple(artifacts))

    (run_dir / MANIFEST_FILENAME).write_text(
        json.dumps(manifest.payload(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


# ---------------------------------------------------------------------------
# The driver plan
#
# A driver needs the portable steps AND its own quarantined block. It does
# not need a second scenario parser: this repo has exactly one, in Python,
# and a Node reimplementation of it would be a drift surface with nothing
# to gain. So the plan is emitted as JSON here and consumed there.
#
# The quarantine survives the trip. The driver block is passed through
# VERBATIM and never inspected -- this module has no opinion about what a
# selector is, which is the whole point of the seam Session 2 authored.
# ---------------------------------------------------------------------------


def build_plan(scenario: Scenario, driver: str, scenario_path: Path) -> Dict[str, Any]:
    """The JSON a driver needs to reproduce *scenario* on one target."""
    if driver not in scenario.drivers:
        declared = sorted(scenario.drivers) or ["none"]
        raise RunError(
            f"scenario '{scenario.id}' declares no driver '{driver}'; it "
            f"declares {declared}. A driver block is authored in the "
            "scenario's quarantined half, under `drivers:`"
        )
    return {
        "scenarioId": scenario.id,
        "scenarioPath": str(scenario_path),
        "portableDigest": scenario.portable_digest(),
        "title": scenario.title,
        "driver": driver,
        "steps": [
            {
                "id": step.id,
                "title": step.title,
                "action": step.action,
                "expect": step.expect,
                "caption": step.caption,
                # The authored on-screen budget. A driver holds each step
                # for at least this long so the recording is watchable;
                # it is a floor, never the recorded truth, which is why
                # the captions are retimed from the event stream.
                "seconds": step.seconds,
                "focus": step.focus,
                "checkpoint": step.checkpoint,
            }
            for step in scenario.steps
        ],
        # Verbatim, uninspected, unvalidated by this module.
        "driverBlock": scenario.drivers[driver],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[Sequence[str]] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.walkthrough_run",
        description=(
            "Run artifacts for a walkthrough scenario: emit the plan a driver "
            "needs, and assemble the manifest, captions and index a driver "
            "produced."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    plan = sub.add_parser(
        "plan",
        help="emit the JSON a driver needs to reproduce a scenario",
    )
    plan.add_argument("scenario", help="scenario directory or scenario.yaml")
    plan.add_argument(
        "--driver",
        required=True,
        help="which driver block to hand over (e.g. playwright-web)",
    )
    plan.add_argument("--out", help="write here instead of stdout")

    finalize = sub.add_parser(
        "finalize",
        help="validate a finished run and write its manifest, captions and index",
    )
    finalize.add_argument("run_dir", help="the run output directory")
    finalize.add_argument(
        "--scenario",
        help="scenario directory (defaults to the path the driver recorded)",
    )

    args = parser.parse_args(argv)

    try:
        if args.command == "plan":
            scenario_path = Path(args.scenario)
            scenario = load_scenario(scenario_path)
            payload = build_plan(scenario, args.driver, scenario_path)
            text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
            if args.out:
                Path(args.out).parent.mkdir(parents=True, exist_ok=True)
                Path(args.out).write_text(text, encoding="utf-8", newline="\n")
            else:
                sys.stdout.write(text)
            return 0

        scenario = load_scenario(Path(args.scenario)) if args.scenario else None
        manifest = finalize_and_write(Path(args.run_dir), scenario)
        video = manifest.video
        print(
            f"[walkthrough_run] {manifest.scenario_id}: {manifest.outcome}, "
            f"{len(manifest.steps)} steps, {len(manifest.artifacts)} artifact(s)"
        )
        print(
            f"[walkthrough_run] recording: "
            + (f"{video.path} ({video.media_type})" if video else "none - the walkthrough document stands alone")
        )
        print(f"[walkthrough_run] index: {Path(args.run_dir) / INDEX_FILENAME}")
        return 0
    except (RunError, ScenarioError) as exc:
        print(f"[walkthrough_run] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
