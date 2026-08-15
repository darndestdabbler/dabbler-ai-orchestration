"""The divergence gate: four renderings that cannot drift from one source.

Set 113 Session 2, step 4 -- *"add a test that fails if the renderings
can diverge."* Drift has exactly three shapes and each gets its own
falsifier:

1. someone edits a generated document by hand;
2. someone edits the scenario and forgets to re-render;
3. a rendering quietly stops carrying part of the source at all.

(1) and (2) are the same defect seen from two sides and both are caught
by re-rendering in memory and comparing the text. (3) is the one that
comparison cannot see on its own -- a renderer that ignores a field
agrees with itself forever -- so each rendering is separately shown to
MOVE when the part of the source it claims to carry moves.

Two look-alikes must NOT be flagged, and each is its own test. A
**driver-only edit** leaves all four documents identical: that is the
quarantine stated as a test rather than as a convention. A **line-ending
translation** leaves them identical too, because git rewrites these
files LF-to-CRLF on a Windows clone by this repo's own policy; the
companion test proves one changed word in a CRLF file still fails, so
the tolerance is exactly line endings and nothing more.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

import scenario_render
from scenario import discover_scenarios, load_scenario, parse_scenario
from scenario_render import (
    CAPTIONS_FILENAME,
    CHAPTERS_FILENAME,
    NO_VIDEO_NOTICE,
    RENDERED_FILENAMES,
    RENDERERS,
    REPLAY_RULE,
    TRAINING_FILENAME,
    WALKTHROUGH_FILENAME,
    check_scenario_dir,
    main,
    render_all,
    write_all,
)

#: The committed corpus. A repo-rooted constant on purpose: this is the
#: tree that can silently stop matching, and the tree the close gate
#: cares about.
WALKTHROUGHS_ROOT = Path(__file__).resolve().parents[2] / "docs" / "walkthroughs"

SOURCE = """
id: divergence-fixture
title: A fixture scenario
summary: Two steps, so timing arithmetic has something to add up.
audience: The divergence test.
prerequisites:
  - The application is installed.
baseline:
  description: Start it from a shortcut.
  observable: The main window is open.
steps:
  - id: first-step
    title: The first step
    action: Press the green button.
    expect: A panel opens on the right.
    narration: The green button is the way in.
    seconds: 5
    checkpoint: panel open
  - id: second-step
    title: The second step
    action: Type your name into the box.
    expect: The name appears in the header.
    narration: Anything you type shows up above.
    seconds: 7
reset: Close the window and open it again.
recovery:
  - symptom: The panel does not open.
    action: Press the green button a second time.
drivers:
  playwright-web:
    steps:
      first-step:
        selector: '#green-button'
"""


def stage(tmp_path: Path, source: str = SOURCE) -> Path:
    """Write *source* into a scenario dir, render it, return the source path."""
    scenario_path = tmp_path / "scenario.yaml"
    scenario_path.write_text(textwrap.dedent(source), encoding="utf-8")
    write_all(load_scenario(scenario_path), tmp_path)
    return scenario_path


class TestTheCommittedCorpus:
    """The gate, pointed at the real tree."""

    def test_every_committed_scenario_still_matches_its_renderings(self):
        scenarios = discover_scenarios(WALKTHROUGHS_ROOT)
        # A corpus scan that came back empty would pass having examined
        # nothing (L-112-1, and `corpus_scan_guard` enforces this).
        assert scenarios, f"no scenarios found under {WALKTHROUGHS_ROOT}"
        problems = []
        for scenario_path in scenarios:
            problems.extend(check_scenario_dir(scenario_path))
        assert not problems, "\n".join(problems)

    def test_every_committed_scenario_renders_all_four_documents(self):
        scenarios = discover_scenarios(WALKTHROUGHS_ROOT)
        assert scenarios, f"no scenarios found under {WALKTHROUGHS_ROOT}"
        for scenario_path in scenarios:
            for name in RENDERED_FILENAMES:
                assert (scenario_path.parent / name).exists(), (
                    f"{scenario_path.parent / name} is missing"
                )


class TestDriftIsCaught:
    def test_a_freshly_rendered_scenario_is_clean(self, tmp_path):
        # The control. Without it every falsifier below is satisfied by a
        # check that simply always fails.
        assert check_scenario_dir(stage(tmp_path)) == []

    @pytest.mark.parametrize("filename", RENDERED_FILENAMES)
    def test_a_hand_edited_rendering_is_caught(self, tmp_path, filename: str):
        # PLANTED: shape 1, in the form it most often actually arrives --
        # an editor that adds a final newline on save. Every generated file
        # is compared in full, so the smallest possible edit to any of the
        # four is caught, not just a wording change to the prose ones.
        scenario_path = stage(tmp_path)
        target = tmp_path / filename
        target.write_text(target.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        problems = check_scenario_dir(scenario_path)
        assert len(problems) == 1
        assert filename in problems[0]
        assert "edited by hand" in problems[0]

    def test_a_reworded_document_is_caught(self, tmp_path):
        # PLANTED: shape 1 as somebody actually means it -- improving the
        # wording in the generated file instead of in the source.
        scenario_path = stage(tmp_path)
        target = tmp_path / WALKTHROUGH_FILENAME
        target.write_text(
            target.read_text(encoding="utf-8").replace(
                "green button", "big green button"
            ),
            encoding="utf-8",
        )
        problems = check_scenario_dir(scenario_path)
        assert len(problems) == 1
        assert WALKTHROUGH_FILENAME in problems[0]

    def test_a_source_edit_that_was_never_re_rendered_is_caught(self, tmp_path):
        # PLANTED: shape 2. The scenario moved on; the documents did not.
        scenario_path = stage(tmp_path)
        scenario_path.write_text(
            textwrap.dedent(SOURCE).replace(
                "Press the green button.", "Press the blue button."
            ),
            encoding="utf-8",
        )
        problems = check_scenario_dir(scenario_path)
        # The action reaches the walkthrough and the training document.
        assert {WALKTHROUGH_FILENAME, TRAINING_FILENAME} <= {
            name for name in RENDERED_FILENAMES for problem in problems if name in problem
        }

    @pytest.mark.parametrize("filename", RENDERED_FILENAMES)
    def test_a_deleted_rendering_is_caught(self, tmp_path, filename: str):
        scenario_path = stage(tmp_path)
        (tmp_path / filename).unlink()
        problems = check_scenario_dir(scenario_path)
        assert len(problems) == 1
        assert "missing" in problems[0]

    def test_line_ending_translation_alone_is_not_drift(self, tmp_path):
        # The LEGITIMATE LOOK-ALIKE that a byte comparison would fail.
        # This repo sets core.autocrlf=true and exempts only the stamped
        # verification artifacts in .gitattributes, so a fresh Windows
        # clone lands these four files with CRLF while the renderer emits
        # LF. Nothing has drifted; the CONTENT is identical.
        scenario_path = stage(tmp_path)
        for name in RENDERED_FILENAMES:
            path = tmp_path / name
            path.write_bytes(path.read_text(encoding="utf-8").replace("\n", "\r\n").encode("utf-8"))
        assert check_scenario_dir(scenario_path) == []

    def test_a_content_change_is_still_caught_in_a_crlf_checkout(self, tmp_path):
        # ...and the tolerance is only for line endings. One changed word
        # in a CRLF file still fails, so the paragraph above is not a hole.
        scenario_path = stage(tmp_path)
        target = tmp_path / WALKTHROUGH_FILENAME
        crlf = target.read_text(encoding="utf-8").replace("\n", "\r\n")
        target.write_bytes(crlf.replace("green button", "blue button").encode("utf-8"))
        assert len(check_scenario_dir(scenario_path)) == 1

    def test_a_driver_only_edit_is_not_drift(self, tmp_path):
        # The LEGITIMATE LOOK-ALIKE. A selector change is the one edit that
        # must leave every document alone -- otherwise the quarantine buys
        # nothing and four documents restale every time a driver is tuned.
        scenario_path = stage(tmp_path)
        before = {name: (tmp_path / name).read_bytes() for name in RENDERED_FILENAMES}
        scenario_path.write_text(
            textwrap.dedent(SOURCE).replace("'#green-button'", "'#the-green-button'"),
            encoding="utf-8",
        )
        assert check_scenario_dir(scenario_path) == []
        rerendered = render_all(load_scenario(scenario_path))
        for name in RENDERED_FILENAMES:
            assert rerendered[name].encode("utf-8") == before[name], name

    def test_replacing_the_entire_driver_block_is_not_drift(self, tmp_path):
        # Stronger than tuning one selector: swap the whole block for
        # unrelated content under a differently-named driver. If any
        # renderer ever starts reading `drivers`, this fails -- which is
        # the point, since `render_all` hands over a driver-free copy
        # precisely so the claim is a property of the call and not of
        # today's renderer bodies.
        scenario_path = stage(tmp_path)
        before = {name: (tmp_path / name).read_bytes() for name in RENDERED_FILENAMES}
        replaced = textwrap.dedent(SOURCE).split("drivers:")[0] + textwrap.dedent(
            """drivers:
              obs-windows:
                sceneName: Walkthrough
                websocketPort: 4455
                steps:
                  first-step:
                    boundingBox: [10, 20, 300, 40]
                  second-step:
                    highlight: true
            """
        )
        scenario_path.write_text(replaced, encoding="utf-8")
        assert "obs-windows" in load_scenario(scenario_path).drivers
        assert check_scenario_dir(scenario_path) == []
        rerendered = render_all(load_scenario(scenario_path))
        for name in RENDERED_FILENAMES:
            assert rerendered[name].encode("utf-8") == before[name], name

    def test_a_renderer_cannot_see_driver_blocks_at_all(self, tmp_path):
        # The structural half stated directly: whatever `render_all` hands
        # a renderer carries no drivers, however many the source declared.
        seen = []
        original = dict(RENDERERS)
        try:
            RENDERERS[WALKTHROUGH_FILENAME] = lambda s: seen.append(dict(s.drivers)) or ""
            render_all(parse_scenario(textwrap.dedent(SOURCE)))
        finally:
            RENDERERS.clear()
            RENDERERS.update(original)
        assert seen == [{}]


class TestEveryRenderingCarriesTheSource:
    """Shape 3: a renderer that ignores a field agrees with itself forever."""

    @pytest.mark.parametrize(
        "old,new,expected",
        [
            # An action is instruction: it belongs in both prose documents.
            (
                "Press the green button.",
                "Press the red button.",
                {WALKTHROUGH_FILENAME, TRAINING_FILENAME},
            ),
            # An expected result is what makes the walk usable with no video.
            (
                "A panel opens on the right.",
                "A panel opens on the left.",
                {WALKTHROUGH_FILENAME, TRAINING_FILENAME},
            ),
            # Narration is the caption source (spec decision 3).
            (
                "The green button is the way in.",
                "The green button is the only way in.",
                {CAPTIONS_FILENAME, TRAINING_FILENAME},
            ),
            # A title names a chapter and heads a section.
            (
                "The first step",
                "The opening step",
                {WALKTHROUGH_FILENAME, TRAINING_FILENAME, CHAPTERS_FILENAME},
            ),
            # Duration drives cue windows and chapter windows.
            ("seconds: 5", "seconds: 9", {CAPTIONS_FILENAME, CHAPTERS_FILENAME}),
        ],
    )
    def test_the_renderings_that_claim_a_field_move_when_it_moves(
        self, old: str, new: str, expected: set
    ):
        before = render_all(parse_scenario(textwrap.dedent(SOURCE)))
        after = render_all(parse_scenario(textwrap.dedent(SOURCE).replace(old, new)))
        moved = {name for name in RENDERED_FILENAMES if before[name] != after[name]}
        # The digest stamp moves in ALL of them, which is correct and is
        # also why this compares the BODY: a stamp-only change would let a
        # renderer that dropped the field pass.
        bodies_moved = {
            name
            for name in moved
            if _body(before[name], name) != _body(after[name], name)
        }
        assert expected <= bodies_moved, f"{expected - bodies_moved} did not carry it"

    def test_every_step_id_appears_in_every_rendering(self):
        scenario = parse_scenario(textwrap.dedent(SOURCE))
        rendered = render_all(scenario)
        for step in scenario.steps:
            for name, text in rendered.items():
                assert step.id in text, f"{step.id} missing from {name}"

    def test_all_four_carry_the_same_portable_digest(self):
        scenario = parse_scenario(textwrap.dedent(SOURCE))
        digest = scenario.portable_digest()
        for name, text in render_all(scenario).items():
            assert digest in text, f"{name} carries no portable-digest stamp"


def _body(text: str, name: str) -> str:
    """The rendering with its digest stamp removed."""
    if name == CHAPTERS_FILENAME:
        payload = json.loads(text)
        payload.pop("portableDigest", None)
        return json.dumps(payload, sort_keys=True)
    return "\n".join(
        line for line in text.splitlines() if "portable-digest" not in line
    )


class TestTiming:
    def test_cue_windows_are_contiguous_and_sum_to_the_total(self):
        scenario = parse_scenario(textwrap.dedent(SOURCE))
        chapters = json.loads(render_chapters_text(scenario))["chapters"]
        assert [c["startSeconds"] for c in chapters] == [0, 5]
        assert [c["endSeconds"] for c in chapters] == [5, 12]
        assert chapters[-1]["endSeconds"] == scenario.total_seconds

    def test_captions_use_the_same_windows_as_the_chapters(self):
        scenario = parse_scenario(textwrap.dedent(SOURCE))
        captions = render_all(scenario)[CAPTIONS_FILENAME]
        assert "00:00:00.000 --> 00:00:05.000" in captions
        assert "00:00:05.000 --> 00:00:12.000" in captions

    def test_a_step_with_no_narration_still_gets_a_cue(self):
        source = textwrap.dedent(SOURCE).replace(
            "    narration: The green button is the way in.\n", ""
        )
        captions = render_all(parse_scenario(source))[CAPTIONS_FILENAME]
        assert "Press the green button." in captions

    def test_a_wrapped_narration_becomes_exactly_one_cue(self):
        # A blank line inside a payload ENDS the cue, so an authored block
        # scalar that wraps must be flattened or one step silently becomes
        # two cues, the second with no timing at all.
        source = textwrap.dedent(SOURCE).replace(
            "    narration: The green button is the way in.\n",
            "    narration: |\n"
            "      The green button is the way in.\n"
            "\n"
            "      It is the only one on that panel.\n",
        )
        captions = render_all(parse_scenario(source))[CAPTIONS_FILENAME]
        # Two cue-timing lines for two steps, and no stray blank-line split.
        assert captions.count(" --> ") == 2
        assert (
            "The green button is the way in. It is the only one on that panel."
            in captions
        )


def render_chapters_text(scenario) -> str:
    return render_all(scenario)[CHAPTERS_FILENAME]


class TestTheWrittenArtifactsStandAlone:
    """Spec decision 4: usable with no video at all."""

    @pytest.mark.parametrize("filename", [WALKTHROUGH_FILENAME, TRAINING_FILENAME])
    def test_neither_prose_document_depends_on_a_media_file(self, filename: str):
        text = render_all(parse_scenario(textwrap.dedent(SOURCE)))[filename]
        for extension in (".mp4", ".webm", ".mov", ".gif"):
            assert extension not in text
        assert CAPTIONS_FILENAME not in text
        assert CHAPTERS_FILENAME not in text

    @pytest.mark.parametrize("filename", [WALKTHROUGH_FILENAME, TRAINING_FILENAME])
    def test_both_prose_documents_say_no_video_is_needed(self, filename: str):
        # Verbatim, in both, from one constant -- a promise a reader can
        # find rather than a property only the renderer knows about.
        text = render_all(parse_scenario(textwrap.dedent(SOURCE)))[filename]
        assert NO_VIDEO_NOTICE in text

    @pytest.mark.parametrize("filename", [WALKTHROUGH_FILENAME, TRAINING_FILENAME])
    def test_both_prose_documents_state_the_replay_rule(self, filename: str):
        # The operator's condition of 2026-08-10, honoured in what the
        # documents actually SAY rather than in a design note: reaching an
        # arbitrary point means replaying a prefix, not seeking to it.
        text = render_all(parse_scenario(textwrap.dedent(SOURCE)))[filename]
        assert REPLAY_RULE in text

    def test_the_walkthrough_offers_the_checkpoint_as_the_shorter_replay(self):
        text = render_all(parse_scenario(textwrap.dedent(SOURCE)))[WALKTHROUGH_FILENAME]
        assert "panel open" in text
        assert "After step 1" in text

    def test_table_cells_survive_pipes_and_wrapped_prose(self):
        # A recovery action naming a command with a pipe, and a checkpoint
        # authored as a wrapped block scalar. Unescaped, either one breaks
        # the generated table into nonsense.
        source = textwrap.dedent(SOURCE).replace(
            "    action: Press the green button a second time.",
            "    action: Run `npm run walk | tee walk.log` and try again.",
        ).replace(
            "    checkpoint: panel open",
            "    checkpoint: >-\n      the panel is open\n      and settled",
        )
        text = render_all(parse_scenario(source))[WALKTHROUGH_FILENAME]
        rows = [line for line in text.splitlines() if line.startswith("|")]
        # Every row keeps its own column count: 2-column recovery rows and
        # 3-column checkpoint rows, none of them split by stray pipes.
        assert all(row.count("|") - row.count("\\|") in (3, 4) for row in rows), rows
        assert "npm run walk \\| tee walk.log" in text
        assert "| the panel is open and settled |" in text

    def test_a_scenario_with_no_checkpoints_still_offers_the_baseline(self):
        source = textwrap.dedent(SOURCE).replace("    checkpoint: panel open\n", "")
        text = render_all(parse_scenario(source))[WALKTHROUGH_FILENAME]
        assert "| The baseline |" in text
        assert "Steps 1 onward" in text


class TestCli:
    def test_check_passes_on_a_clean_directory(self, tmp_path, capsys):
        stage(tmp_path)
        assert main(["--check", str(tmp_path)]) == 0
        assert "ok divergence-fixture" in capsys.readouterr().out

    def test_check_fails_and_names_the_fix(self, tmp_path, capsys):
        stage(tmp_path)
        (tmp_path / WALKTHROUGH_FILENAME).write_text("edited", encoding="utf-8")
        assert main(["--check", str(tmp_path)]) == 1
        out = capsys.readouterr().out
        assert "DRIFTED" in out
        assert "scenario_render" in out

    def test_render_writes_every_document(self, tmp_path, capsys):
        (tmp_path / "scenario.yaml").write_text(textwrap.dedent(SOURCE), encoding="utf-8")
        assert main([str(tmp_path)]) == 0
        for name in RENDERED_FILENAMES:
            assert (tmp_path / name).exists()

    def test_a_refused_scenario_exits_non_zero_without_writing(self, tmp_path, capsys):
        (tmp_path / "scenario.yaml").write_text("id: x\n", encoding="utf-8")
        assert main([str(tmp_path)]) == 1
        assert "REFUSED" in capsys.readouterr().out
        assert not (tmp_path / WALKTHROUGH_FILENAME).exists()

    def test_a_directory_with_no_scenario_is_reported_not_silently_skipped(
        self, tmp_path, capsys
    ):
        assert main([str(tmp_path)]) == 2
        assert "no scenario.yaml" in capsys.readouterr().out

    def test_the_default_corpus_going_empty_is_refused_not_reported_clean(
        self, tmp_path, capsys, monkeypatch
    ):
        # PLANTED: the exemplar and its outputs are deleted. A whole-tree
        # `--check` that answered "ok" here would pass having examined
        # nothing, which reads identical to passing having examined
        # everything (L-112-1).
        fake_repo = tmp_path / "repo"
        (fake_repo / "docs" / "walkthroughs").mkdir(parents=True)
        monkeypatch.setattr(
            scenario_render, "__file__", str(fake_repo / "ai_router" / "x.py")
        )
        assert main(["--check"]) == 1
        assert "REFUSED" in capsys.readouterr().out

    def test_no_walkthroughs_directory_at_all_is_nothing_to_do(
        self, tmp_path, capsys, monkeypatch
    ):
        # The legitimate look-alike: a pip-installed router in a repo that
        # authors no scenarios must not fail a check it was never asked for.
        fake_repo = tmp_path / "repo"
        (fake_repo / "ai_router").mkdir(parents=True)
        monkeypatch.setattr(
            scenario_render, "__file__", str(fake_repo / "ai_router" / "x.py")
        )
        assert main(["--check"]) == 0
        assert "nothing to do" in capsys.readouterr().out

    def test_the_length_warning_reaches_the_console(self, tmp_path, capsys):
        stage(tmp_path, SOURCE.replace("seconds: 7", "seconds: 70"))
        main(["--check", str(tmp_path)])
        assert "design check" in capsys.readouterr().out
