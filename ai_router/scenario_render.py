"""Render one scenario source into four documents (Set 113 Session 2).

    python -m ai_router.scenario_render docs/walkthroughs/<id>
    python -m ai_router.scenario_render --check docs/walkthroughs

The four outputs, all generated, none hand-written:

======================  ===========================================
``walkthrough.md``      the manual UAT walkthrough -- do it yourself
``training.md``         the training document -- learn the workflow
``captions.vtt``        WebVTT cues, timed from each step's seconds
``chapters.json``       chapter metadata keyed by stable step id
======================  ===========================================

**Why generated and not written.** Spec decision 3: the scenario is
authored once and renders all four, because a video and an instruction
sheet that drift apart are worse than no video. ``--check`` is the half
that makes "cannot drift" true rather than aspirational -- it re-renders
in memory and refuses any committed file whose text differs, so a
hand-edit to a rendering and a source edit that was never re-rendered
both fail the same way.

**The comparison is by text, not by bytes, and that is deliberate.**
This repo sets ``core.autocrlf=true`` and its ``.gitattributes`` marks
only the stamped verification artifacts ``-text``, so a fresh Windows
clone lands these four files on disk with CRLF while the renderer emits
LF. A byte comparison would therefore fail on every such clone while
nothing had actually drifted -- the exact class of breakage Set 120 S3
paid for when a rebase rewrote stamped artifacts LF to CRLF. Reading
through Python's universal-newline translation compares the *content*,
which is what the gate is about; a single changed character in any of
the four still fails, and both directions are pinned by tests.

**The digest is over the portable half only.** Every rendering carries
``portable-digest: sha256:...``. Changing a Playwright selector under
``drivers:`` must NOT restale four documents -- that coupling is exactly
what the quarantine exists to prevent -- so the digest, like the
renderers, never sees the driver blocks.

**The written artifacts stand alone.** Spec decision 4: the video is an
enhancement, and the documents must be usable with no video at all.
Neither ``walkthrough.md`` nor ``training.md`` links a video or assumes
one was recorded; the caption and chapter files exist for when Session 3
records one, and their absence costs a reader nothing.

Output is ASCII-only on the console (L-079-1); the rendered documents
are written UTF-8 with explicit newlines so Windows checkouts and CI
agree byte for byte.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from ai_router.scenario import (
    SCENARIO_FILENAME,
    Scenario,
    ScenarioError,
    discover_scenarios,
    load_scenario,
)

#: The repo-relative home of authored scenarios.
WALKTHROUGHS_DIRNAME = "docs/walkthroughs"

WALKTHROUGH_FILENAME = "walkthrough.md"
TRAINING_FILENAME = "training.md"
CAPTIONS_FILENAME = "captions.vtt"
CHAPTERS_FILENAME = "chapters.json"

#: Every generated file, in the order ``--check`` reports them.
RENDERED_FILENAMES = (
    WALKTHROUGH_FILENAME,
    TRAINING_FILENAME,
    CAPTIONS_FILENAME,
    CHAPTERS_FILENAME,
)

_RENDER_COMMAND = "python -m ai_router.scenario_render"

#: The one sentence that keeps the operator's condition honest. Their
#: ruling of 2026-08-10 cut the synced window "as long as very clear,
#: step-by-step instructions are provided for the user to get to any
#: point in the video"; round 3 read that honestly as replaying a
#: documented prefix. Both reader-facing documents say so in these
#: words, so neither can imply a seek bar.
#: Spec decision 4 -- the written artifact is the durable deliverable and
#: the video is an enhancement -- said in one sentence, verbatim, in both
#: reader-facing documents. One constant rather than two paraphrases, so
#: a test can assert the promise was actually made and not merely meant.
NO_VIDEO_NOTICE = "No video is needed."

REPLAY_RULE = (
    "There is no way to jump into the middle of this. The product is "
    "stateful, so to reach any step you start from the baseline -- or from "
    "the nearest checkpoint before it -- and do the steps in order. That "
    "replay is short by design."
)


def _generated_note(kind: str) -> str:
    return (
        f"Generated from {SCENARIO_FILENAME} by `{_RENDER_COMMAND}`. "
        f"Do not edit this {kind}: edit the scenario and re-render. "
        f"`{_RENDER_COMMAND} --check` fails if they disagree."
    )


def _timestamp_ms(millis: int) -> str:
    """WebVTT ``HH:MM:SS.mmm`` from whole milliseconds.

    Milliseconds rather than seconds because the same writer serves two
    timing sources: the AUTHORED durations, which are whole seconds and
    an estimate, and a RECORDED run's real step boundaries, which are
    not (Set 113 S3). One writer, two sources -- a second copy of the
    cue-timing arithmetic is exactly how a caption file drifts away from
    the video it is a sidecar for.
    """
    if millis < 0:
        raise ValueError(f"cue timestamp cannot be negative: {millis}ms")
    seconds, remainder = divmod(int(millis), 1000)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{remainder:03d}"


def _timestamp(seconds: int) -> str:
    """WebVTT ``HH:MM:SS.mmm`` from whole seconds."""
    return _timestamp_ms(seconds * 1000)


def _one_line(text: str) -> str:
    """Collapse every run of whitespace to a single space.

    A caption payload must not contain a blank line (WebVTT reads one as
    the end of the cue) and a markdown table cell must not contain a
    newline (it ends the row). Authored prose legitimately wraps, so the
    renderers flatten rather than the model refusing.
    """
    return " ".join(text.split())


def _cell(text: str) -> str:
    """One markdown table cell: single-line, with pipes escaped."""
    return _one_line(text).replace("|", "\\|")


def _cue_windows(scenario: Scenario) -> List[Tuple[int, int]]:
    """``(start, end)`` seconds per step, from each step's declared duration."""
    windows: List[Tuple[int, int]] = []
    cursor = 0
    for step in scenario.steps:
        windows.append((cursor, cursor + step.seconds))
        cursor += step.seconds
    return windows


def _checkpoint_table(scenario: Scenario) -> List[str]:
    """The "where to start" table -- the honest replacement for a seek bar."""
    lines = [
        "| Start here | What it is | Replay from there |",
        "| :--- | :--- | :--- |",
        "| The baseline | The state the setup steps leave you in | Steps 1 onward |",
    ]
    for step in scenario.checkpoints:
        position = scenario.step_index(step.id)
        remaining = (
            f"Steps {position + 1} onward"
            if position < len(scenario.steps)
            else "Nothing -- this is the last step"
        )
        lines.append(f"| After step {position} | {_cell(step.checkpoint)} | {remaining} |")
    return lines


def render_walkthrough(scenario: Scenario) -> str:
    """The manual UAT walkthrough: a reader drives the product themselves.

    Written for a reader with zero session context (project-guidance
    G-003): every step names what to do and what should then be on
    screen, so the reader can tell a product bug from their own
    misreading.
    """
    digest = scenario.portable_digest()
    out: List[str] = []
    out.append(f"# {scenario.title}")
    out.append("")
    out.append(f"<!-- {_generated_note('document')} -->")
    out.append(f"<!-- portable-digest: {digest} -->")
    out.append("")
    out.append(f"> **Do it yourself.** {scenario.summary}")
    out.append(">")
    out.append(
        f"> {NO_VIDEO_NOTICE} If one exists it shows exactly these steps, in "
        "this order, and it is an enhancement -- this document is the "
        "durable half."
    )
    out.append("")
    out.append(f"About **{scenario.total_seconds} seconds** of product time, "
               f"{len(scenario.steps)} steps.")
    out.append("")

    if scenario.prerequisites:
        out.append("## Before you start")
        out.append("")
        for entry in scenario.prerequisites:
            out.append(f"- {entry}")
        out.append("")

    out.append("## Get to the baseline")
    out.append("")
    out.append(scenario.baseline.description)
    out.append("")
    if scenario.baseline.setup:
        out.append("```bash")
        for command in scenario.baseline.setup:
            if command.cwd:
                out.append(f"cd {command.cwd}")
            out.append(command.command)
        out.append("```")
        out.append("")
    out.append(f"**You are at the baseline when:** {scenario.baseline.observable}")
    out.append("")

    out.append("## Where to start")
    out.append("")
    out.append(REPLAY_RULE)
    out.append("")
    out.extend(_checkpoint_table(scenario))
    out.append("")

    out.append("## The steps")
    out.append("")
    for position, step in enumerate(scenario.steps, start=1):
        out.append(f"### {position}. {step.title}")
        out.append("")
        out.append(f"<!-- step-id: {step.id} -->")
        out.append("")
        out.append(f"**Do:** {step.action}")
        out.append("")
        out.append(f"**You should see:** {step.expect}")
        if step.focus:
            out.append("")
            out.append(f"**Look at:** {step.focus}")
        if step.checkpoint:
            out.append("")
            out.append(
                f"> **Checkpoint -- {step.checkpoint}.** You can stop here and "
                "come back to this point by replaying the baseline and steps "
                f"1 to {position}."
            )
        out.append("")

    if scenario.reset:
        out.append("## Start over")
        out.append("")
        out.append(scenario.reset)
        out.append("")

    if scenario.recovery:
        out.append("## If something goes wrong")
        out.append("")
        out.append("| What you see | What to do |")
        out.append("| :--- | :--- |")
        for entry in scenario.recovery:
            out.append(f"| {_cell(entry.symptom)} | {_cell(entry.action)} |")
        out.append("")

    return "\n".join(out).rstrip("\n") + "\n"


def render_training(scenario: Scenario) -> str:
    """The training document: read it to learn the workflow, not to test it.

    Same source, different reader. The walkthrough asks someone to
    reproduce a state and judge it; this asks someone to understand what
    the product does and why the steps are in this order. It is narration
    first, and it still says what appears on screen -- decision 5 says a
    generated video is a UAT aid and not published training material, so
    the text has to carry the training on its own.
    """
    digest = scenario.portable_digest()
    out: List[str] = []
    out.append(f"# {scenario.title}")
    out.append("")
    out.append(f"<!-- {_generated_note('document')} -->")
    out.append(f"<!-- portable-digest: {digest} -->")
    out.append("")
    out.append(f"**Who this is for.** {scenario.audience}")
    out.append("")
    out.append(scenario.summary)
    out.append("")
    out.append(
        f"Reading it takes a couple of minutes; doing it takes about "
        f"{scenario.total_seconds} seconds. **{NO_VIDEO_NOTICE}** If you have "
        "one, it narrates the same steps in the same order, and it carries no "
        "information this page leaves out."
    )
    out.append("")

    out.append("## What you need first")
    out.append("")
    if scenario.prerequisites:
        for entry in scenario.prerequisites:
            out.append(f"- {entry}")
    else:
        out.append("- Nothing beyond the product itself.")
    out.append("")

    out.append("## Where the walkthrough starts")
    out.append("")
    out.append(scenario.baseline.description)
    out.append("")
    if scenario.baseline.setup:
        out.append("```bash")
        for command in scenario.baseline.setup:
            if command.cwd:
                out.append(f"cd {command.cwd}")
            out.append(command.command)
        out.append("```")
        out.append("")
    out.append(f"**You have arrived when:** {scenario.baseline.observable}")
    out.append("")
    out.append(REPLAY_RULE)
    out.append("")

    out.append("## The walkthrough")
    out.append("")
    for position, step in enumerate(scenario.steps, start=1):
        out.append(f"### {position}. {step.title}")
        out.append("")
        out.append(f"<!-- step-id: {step.id} -->")
        out.append("")
        out.append(step.caption)
        out.append("")
        out.append(f"**To do it.** {step.action}")
        out.append("")
        out.append(f"**What happens.** {step.expect}")
        if step.checkpoint:
            out.append("")
            out.append(
                f"This is the **{step.checkpoint}** checkpoint -- a sensible "
                "place to stop, and the place to resume from."
            )
        out.append("")

    out.append("## Doing it yourself")
    out.append("")
    out.append(
        f"[`{WALKTHROUGH_FILENAME}`]({WALKTHROUGH_FILENAME}) is the same "
        "scenario written as instructions to follow, with the recovery steps "
        "for when something does not look right. It is generated from the "
        "same source as this page, so the two cannot disagree."
    )
    out.append("")

    return "\n".join(out).rstrip("\n") + "\n"


def render_captions(
    scenario: Scenario,
    windows_ms: Optional[Sequence[Tuple[int, int]]] = None,
    timing_note: Optional[str] = None,
) -> str:
    """WebVTT cues, one per step, keyed by the stable step id.

    The step list is the caption source (spec decision 3). Auto-captions
    on a copy someone uploaded to Stream are a bonus and never the
    artifact, or the video and the walkthrough can drift.

    *windows_ms* replaces the AUTHORED cue windows with real ones -- one
    ``(start, end)`` pair in milliseconds per step, in order. Set 113 S3
    passes the boundaries a recorded run actually measured, so a video's
    sidecar says when things happened rather than when the author
    guessed they would. Omitted, the authored durations are used and the
    output is the committed, ``--check``-gated rendering.

    An entry may be ``None``, meaning that step has no window: a run that
    failed at step 2 never reached steps 3 to 5, and inventing cues for
    them would caption a video over footage that does not exist.

    *timing_note* replaces the "edit the scenario and re-render" note,
    which is true of the committed file and false of a run artifact that
    nothing re-renders.
    """
    if windows_ms is not None and len(windows_ms) != len(scenario.steps):
        raise ValueError(
            f"windows_ms has {len(windows_ms)} entries for "
            f"{len(scenario.steps)} steps; pass one window per step, in order"
        )
    windows = (
        [None if window is None else tuple(window) for window in windows_ms]
        if windows_ms is not None
        else [(start * 1000, end * 1000) for start, end in _cue_windows(scenario)]
    )
    digest = scenario.portable_digest()
    out: List[str] = ["WEBVTT", ""]
    out.append(f"NOTE {timing_note or _generated_note('file')}")
    out.append("")
    out.append(f"NOTE portable-digest: {digest}")
    out.append("")
    for step, window in zip(scenario.steps, windows):
        if window is None:
            continue
        start, end = window
        out.append(step.id)
        out.append(f"{_timestamp_ms(start)} --> {_timestamp_ms(end)}")
        # Flattened: a blank line inside a payload ends the cue, so an
        # authored block scalar that wraps must not become two cues.
        out.append(_one_line(step.caption))
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


def render_chapters(scenario: Scenario) -> str:
    """Chapter metadata: stable ids, titles and the window each occupies."""
    payload = {
        "generated": _generated_note("file"),
        "portableDigest": scenario.portable_digest(),
        "scenarioId": scenario.id,
        "title": scenario.title,
        "totalSeconds": scenario.total_seconds,
        "chapters": [
            {
                "stepId": step.id,
                "title": step.title,
                "startSeconds": start,
                "endSeconds": end,
                "checkpoint": step.checkpoint,
            }
            for step, (start, end) in zip(scenario.steps, _cue_windows(scenario))
        ],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


#: Filename -> renderer. The ONLY place a rendering is registered, so a
#: fifth output cannot be added without ``--check`` learning about it.
RENDERERS: Dict[str, Callable[[Scenario], str]] = {
    WALKTHROUGH_FILENAME: render_walkthrough,
    TRAINING_FILENAME: render_training,
    CAPTIONS_FILENAME: render_captions,
    CHAPTERS_FILENAME: render_chapters,
}


def render_all(scenario: Scenario) -> Dict[str, str]:
    """Every rendering, by filename.

    **Renderers are handed a driver-free copy**, not the scenario the
    caller loaded. Saying "no renderer reads ``drivers``" of an object
    that carries them is a claim about today's code that the next
    renderer can quietly break; handing over a copy whose ``drivers`` is
    empty makes it a property of the call. Together with
    ``portable_digest`` -- which never sees driver blocks either -- that
    is what makes a selector edit leave all four outputs identical, and
    the test replaces the whole driver block to prove it.
    """
    portable = replace(scenario, drivers={})
    return {name: renderer(portable) for name, renderer in RENDERERS.items()}


def write_all(scenario: Scenario, out_dir: Path) -> List[Path]:
    """Write every rendering into *out_dir*, returning the paths written."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []
    for name, text in render_all(scenario).items():
        path = out_dir / name
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    return written


def check_scenario_dir(scenario_path: Path) -> List[str]:
    """Return one problem string per rendering that has drifted.

    Empty list means every committed rendering is byte-identical to what
    the current source renders. This is the divergence gate.
    """
    scenario_path = Path(scenario_path)
    out_dir = scenario_path.parent
    scenario = load_scenario(scenario_path)
    problems: List[str] = []
    for name, text in render_all(scenario).items():
        path = out_dir / name
        if not path.exists():
            problems.append(f"{path}: missing -- run `{_RENDER_COMMAND} {out_dir}`")
            continue
        actual = path.read_text(encoding="utf-8")
        if actual != text:
            problems.append(
                f"{path}: does not match {SCENARIO_FILENAME}. Either it was "
                f"edited by hand, or the scenario changed and nothing "
                f"re-rendered. Fix: `{_RENDER_COMMAND} {out_dir}`"
            )
    return problems


class EmptyCorpusError(ScenarioError):
    """The default walkthroughs directory exists but holds no scenario.

    Distinct from "there is no walkthroughs directory here", which is the
    ordinary state of a pip-installed router in a repo that authors none.
    A directory that exists and is empty is the fail-open a corpus gate
    must refuse: it would otherwise pass having examined nothing, which
    is indistinguishable from passing having examined everything.
    """


def _targets(paths: Sequence[str], repo_root: Path) -> List[Path]:
    """Resolve CLI arguments to scenario source files."""
    if not paths:
        default_root = repo_root / WALKTHROUGHS_DIRNAME
        if not default_root.exists():
            return []
        found = discover_scenarios(default_root)
        if not found:
            raise EmptyCorpusError(
                f"{WALKTHROUGHS_DIRNAME} exists but holds no "
                f"{SCENARIO_FILENAME}. Either the corpus was deleted or this "
                "command is pointed at the wrong tree; refusing rather than "
                "reporting success over nothing"
            )
        return found
    resolved: List[Path] = []
    for raw in paths:
        candidate = Path(raw)
        if candidate.is_dir():
            found = discover_scenarios(candidate)
            if not found:
                raise ScenarioError(f"no {SCENARIO_FILENAME} under {candidate}")
            resolved.extend(found)
        else:
            resolved.append(candidate)
    return resolved


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="scenario_render",
        description=(
            "Render a walkthrough scenario into its four documents, or "
            "check that the committed ones still match their source."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help=(
            "scenario.yaml files or directories containing them "
            f"(default: every scenario under {WALKTHROUGHS_DIRNAME})"
        ),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit non-zero if any rendering has drifted",
    )
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    try:
        targets = _targets(args.paths, repo_root)
    except EmptyCorpusError as exc:
        print(f"[scenario_render] REFUSED {exc}")
        return 1
    except ScenarioError as exc:
        print(f"[scenario_render] {exc}")
        return 2
    if not targets:
        print(
            f"[scenario_render] no {WALKTHROUGHS_DIRNAME} directory here - "
            "nothing to do."
        )
        return 0

    failures = 0
    for scenario_path in targets:
        try:
            scenario = load_scenario(scenario_path)
        except ScenarioError as exc:
            print(f"[scenario_render] REFUSED {exc}")
            failures += 1
            continue
        for note in scenario.warnings():
            print(f"[scenario_render] warning: {scenario.id}: {note}")
        if args.check:
            problems = check_scenario_dir(scenario_path)
            if problems:
                failures += 1
                for problem in problems:
                    print(f"[scenario_render] DRIFTED {problem}")
            else:
                print(f"[scenario_render] ok {scenario.id} ({len(RENDERERS)} renderings)")
        else:
            written = write_all(scenario, scenario_path.parent)
            print(
                f"[scenario_render] rendered {scenario.id}: "
                + ", ".join(path.name for path in written)
            )
    return 1 if failures else 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    sys.exit(main())
