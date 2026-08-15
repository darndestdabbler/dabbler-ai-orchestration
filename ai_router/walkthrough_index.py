"""The static index for one recorded run (Set 113 Session 3).

A single self-contained HTML file that puts the recording, the step list
and what actually happened on one page. The spec's non-goals refuse a
custom viewer application: *"a static generated index linking the video
and the steps is sufficient unless real use proves otherwise."* So this
is one file, no build step, no framework, no external request -- open it
and it works, including from a USB stick.

**It degrades honestly.** The whole point of the artifact-agnostic
manifest is that a run may produce no video at all, and this page must
be worth opening in that case rather than showing a broken player. With
no video it says so plainly, in the same place the player would have
been, and points at the walkthrough document that never needed one.

**The steps are on the page, not only in the caption track.** Chromium
refuses to load a ``<track>`` sidecar over ``file://`` (it is treated as
cross-origin), so a page opened straight off disk would show a video with
no captions. Rather than requiring a web server to read a local file, the
narration is rendered into the page itself and the caption track is
attached as a bonus for the case where it does load. Nothing is lost when
it does not.
"""

from __future__ import annotations

import html
import re
from typing import TYPE_CHECKING, List, Optional

from ai_router.scenario import Scenario

if TYPE_CHECKING:  # pragma: no cover - typing only, and avoids an import cycle
    from ai_router.walkthrough_run import RunManifest, StepRecord

#: Human labels for the machine outcomes, so a reader never has to know
#: the vocabulary. ``not-reached`` is the one that matters: it is the
#: state that would simply be missing if the index were assembled from
#: the event stream instead of from the authored step list.
OUTCOME_LABELS = {
    "completed": "done",
    "failed": "failed",
    "not-reached": "not reached",
    "incomplete": "interrupted",
}

RUN_OUTCOME_SUMMARY = {
    "completed": "Every step ran and the run finished.",
    "failed": "A step failed. The recording stops being a faithful "
    "demonstration from that point on.",
    "incomplete": "The run did not finish. Some steps were never reached.",
}


def _clock(millis: Optional[int]) -> str:
    """``m:ss`` for a reader; the machine times stay in the manifest."""
    if millis is None:
        return "--"
    total_seconds, _ = divmod(int(millis), 1000)
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes}:{seconds:02d}"


def _esc(text: str) -> str:
    return html.escape(text or "", quote=True)


#: Authored prose names exact on-screen text in backticks, because the
#: same sentence has to render as markdown in ``walkthrough.md``. Left
#: alone here the reader sees the punctuation instead of the emphasis it
#: stands for, so the one markdown construct the format actually uses is
#: honoured. Nothing else is: this is not a markdown renderer, and the
#: escaping happens FIRST so a backtick span can never smuggle in markup.
_CODE_SPAN = re.compile(r"`([^`]+)`")


def _rich(text: str) -> str:
    """Escaped prose, with backtick spans as ``<code>``."""
    return _CODE_SPAN.sub(r"<code>\1</code>", _esc(text))


def _step_section(
    record: "StepRecord", scenario: Scenario, seekable: bool
) -> List[str]:
    step = next((entry for entry in scenario.steps if entry.id == record.step_id), None)
    label = OUTCOME_LABELS.get(record.outcome, record.outcome)
    out: List[str] = []
    out.append(f'<li class="step is-{_esc(record.outcome)}" id="{_esc(record.step_id)}">')
    out.append('  <div class="step-head">')
    if record.reached and seekable:
        out.append(
            f'    <button class="seek" type="button" data-at="{record.start_millis}">'
            f"{_esc(_clock(record.start_millis))}</button>"
        )
    else:
        out.append(f'    <span class="seek is-flat">{_esc(_clock(record.start_millis))}</span>')
    out.append(
        f'    <h3>{record.position}. {_esc(record.title)}</h3>'
    )
    out.append(f'    <span class="badge">{_esc(label)}</span>')
    out.append("  </div>")
    if step is not None:
        out.append(f'  <p class="narration">{_rich(step.caption)}</p>')
        out.append(
            f'  <p class="do"><span class="tag">Do</span> {_rich(step.action)}</p>'
        )
        out.append(
            f'  <p class="see"><span class="tag">See</span> {_rich(step.expect)}</p>'
        )
        if step.checkpoint:
            out.append(
                f'  <p class="checkpoint">Checkpoint: {_rich(step.checkpoint)} '
                "-- you can stop here and resume from this state.</p>"
            )
    if record.error:
        out.append(f'  <p class="error">{_esc(record.error)}</p>')
    out.append("</li>")
    return out


def render_index(manifest: "RunManifest", scenario: Scenario) -> str:
    """One self-contained HTML page for *manifest*."""
    video = manifest.video
    captions = manifest.artifact("captions")
    seekable = video is not None

    out: List[str] = []
    out.append("<!doctype html>")
    out.append('<html lang="en">')
    out.append("<head>")
    out.append('<meta charset="utf-8">')
    out.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    out.append(f"<title>{_esc(manifest.title)}</title>")
    out.append("<style>")
    out.append(_STYLE)
    out.append("</style>")
    out.append("</head>")
    out.append("<body>")
    out.append("<main>")

    out.append(f"<h1>{_esc(manifest.title)}</h1>")
    out.append(f'<p class="summary">{_rich(scenario.summary)}</p>')

    if video is not None:
        out.append('<div class="player">')
        out.append('  <video id="recording" controls preload="metadata">')
        out.append(
            f'    <source src="{_esc(video.path)}" '
            f'type="{_esc(video.media_type)}">'
        )
        if captions is not None:
            # A child of <video>, which is the only place a track is read.
            out.append(
                f'    <track default kind="captions" srclang="en" label="Steps" '
                f'src="{_esc(captions.path)}">'
            )
        out.append("  </video>")
        out.append("</div>")
    else:
        out.append('<div class="no-video">')
        out.append("  <h2>No recording</h2>")
        out.append(
            "  <p>This run produced no video. That is a supported outcome, not "
            "an error: the walkthrough document is the deliverable and a "
            "recording is an enhancement. Everything below is the same "
            "walkthrough, and you can follow it as it stands.</p>"
        )
        out.append("</div>")

    out.append('<section class="meta">')
    out.append("  <h2>This run</h2>")
    out.append("  <dl>")
    out.append(f"    <dt>Outcome</dt><dd>{_esc(OUTCOME_LABELS.get(manifest.outcome, manifest.outcome))} "
               f"-- {_esc(RUN_OUTCOME_SUMMARY.get(manifest.outcome, ''))}</dd>")
    out.append(f"    <dt>Started</dt><dd>{_esc(manifest.started_at)}</dd>")
    out.append(f"    <dt>Ran for</dt><dd>{_esc(_clock(manifest.duration_millis))}</dd>")
    out.append(f"    <dt>Driver</dt><dd>{_esc(manifest.driver)}</dd>")
    if manifest.target:
        target = ", ".join(f"{key}: {value}" for key, value in sorted(manifest.target.items()))
        out.append(f"    <dt>Target</dt><dd>{_esc(target)}</dd>")
    out.append(
        f"    <dt>Scenario</dt><dd><code>{_esc(manifest.scenario_id)}</code> "
        f"at <code>{_esc(manifest.portable_digest)}</code></dd>"
    )
    if manifest.anchor:
        out.append(
            "    <dt>Timing</dt><dd>Times are measured from "
            f"{_esc(str(manifest.anchor.get('basis')))}, accurate to within "
            f"{_esc(str(manifest.anchor.get('uncertaintyMillis')))}ms.</dd>"
        )
    out.append("  </dl>")
    out.append("</section>")

    out.append('<section class="steps">')
    out.append("  <h2>The steps</h2>")
    if seekable:
        out.append(
            '  <p class="hint">Click a time to jump the recording to that '
            "step.</p>"
        )
    out.append('  <ol class="step-list">')
    for record in manifest.steps:
        out.extend("    " + line for line in _step_section(record, scenario, seekable))
    out.append("  </ol>")
    out.append("</section>")

    # The index is itself a manifest artifact -- a consumer looking for
    # "where is the page" should find it there rather than guess. It is
    # skipped HERE because you are reading it.
    listed = [entry for entry in manifest.artifacts if entry.kind != "index"]
    if listed:
        out.append('<section class="artifacts">')
        out.append("  <h2>Files</h2>")
        out.append("  <ul>")
        for entry in listed:
            size = f" ({entry.size_bytes} bytes)" if entry.size_bytes is not None else ""
            out.append(
                f'    <li><a href="{_esc(entry.path)}">{_esc(entry.path)}</a> '
                f"&mdash; {_esc(entry.kind)}, {_esc(entry.media_type)}{_esc(size)}</li>"
            )
        out.append("  </ul>")
        out.append("</section>")

    if manifest.notes:
        out.append('<section class="notes">')
        out.append("  <h2>Notes</h2>")
        out.append("  <ul>")
        for note in manifest.notes:
            out.append(f"    <li>{_esc(note)}</li>")
        out.append("  </ul>")
        out.append("</section>")

    out.append('<footer><p>Generated from the scenario source and this run\'s '
               "step-event stream. Nothing on this page was written by hand, and "
               "editing it changes nothing: re-run the driver instead.</p></footer>")
    out.append("</main>")
    if seekable:
        out.append("<script>")
        out.append(_SCRIPT)
        out.append("</script>")
    out.append("</body>")
    out.append("</html>")
    return "\n".join(out) + "\n"


_STYLE = """
:root { color-scheme: light dark; --ink: #1f2328; --muted: #59636e;
        --line: #d8dee4; --page: #ffffff; --panel: #f6f8fa; }
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6edf3; --muted: #9198a1; --line: #30363d;
          --page: #0d1117; --panel: #161b22; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 20px 64px; background: var(--page);
       color: var(--ink);
       font: 16px/1.6 "Segoe UI", system-ui, sans-serif; }
main { max-width: 780px; margin: 0 auto; }
h1 { font-size: 28px; margin: 0 0 8px; }
h2 { font-size: 19px; margin: 40px 0 12px; }
h3 { font-size: 16px; margin: 0; font-weight: 600; }
.summary { color: var(--muted); margin: 0 0 28px; }
video { width: 100%; border: 1px solid var(--line); border-radius: 8px;
        background: #000; }
.no-video { border: 1px solid var(--line); border-radius: 8px;
            background: var(--panel); padding: 20px 24px; }
.no-video h2 { margin-top: 0; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px;
     margin: 0; }
dt { color: var(--muted); }
dd { margin: 0; }
code { font-size: 13px; word-break: break-all; }
.hint { color: var(--muted); margin: 0 0 16px; }
.step-list { list-style: none; margin: 0; padding: 0; }
.step { border-top: 1px solid var(--line); padding: 16px 0; }
.step-head { display: flex; align-items: baseline; gap: 12px; }
.seek { font: 13px/1 ui-monospace, Consolas, monospace; padding: 5px 8px;
        border: 1px solid var(--line); border-radius: 6px;
        background: var(--panel); color: inherit; cursor: pointer; }
.seek.is-flat { cursor: default; opacity: 0.6; }
.badge { margin-left: auto; font-size: 12px; text-transform: uppercase;
         letter-spacing: 0.04em; color: var(--muted); }
.is-failed .badge { color: #cf222e; }
.is-not-reached { opacity: 0.6; }
.narration { margin: 10px 0 12px; }
.do, .see, .checkpoint, .error { margin: 4px 0; color: var(--muted); }
.tag { display: inline-block; min-width: 34px; font-size: 12px;
       text-transform: uppercase; letter-spacing: 0.04em; }
.error { color: #cf222e; }
.artifacts li, .notes li { margin: 4px 0; }
footer { margin-top: 48px; border-top: 1px solid var(--line); padding-top: 16px;
         color: var(--muted); font-size: 14px; }
""".strip()


_SCRIPT = """
// Seek the recording to a step. The times come from the run's own
// step-event stream, so they point at what actually happened rather than
// at what the author estimated.
document.addEventListener('click', function (event) {
  var button = event.target.closest('.seek[data-at]');
  if (!button) return;
  var video = document.getElementById('recording');
  if (!video) return;
  video.currentTime = Number(button.dataset.at) / 1000;
  video.play();
});
""".strip()
