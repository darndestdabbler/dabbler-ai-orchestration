"""Tests for the Set 113 S2 portable scenario model.

The model's whole job is to be the ONE source four documents come from,
so the properties worth pinning are the ones that make that claim true:

* the portable half is closed -- an unknown key is refused, not ignored,
  because a field nobody validates is how a confidence score or a stray
  selector arrives without anyone deciding to add it (Session 1's
  finding, applied to a second surface);
* stable ids are really stable -- unique, kebab-case, and the thing every
  rendering addresses a step by;
* the digest is over the portable half ONLY, which is what lets a driver
  block change without restaling four committed documents.

Falsifiers plant the violation and assert the refusal; each one has a
legitimate look-alike that must still parse (L-112-1).
"""

from __future__ import annotations

import textwrap

import pytest

from scenario import (
    DEFAULT_STEP_SECONDS,
    SUGGESTED_MAX_SECONDS,
    Scenario,
    ScenarioError,
    load_scenario,
    parse_scenario,
)

MINIMAL = """
id: minimal-scenario
title: A minimal scenario
summary: One step, so the required half is visible.
audience: Whoever reads the tests.
baseline:
  description: Nothing needs staging.
  observable: The application is open.
steps:
  - id: only-step
    title: The only step
    action: Do the thing.
    expect: The thing is done.
"""


def parse(text: str) -> Scenario:
    return parse_scenario(textwrap.dedent(text))


class TestRequiredShape:
    def test_the_minimal_scenario_parses(self):
        scenario = parse(MINIMAL)
        assert scenario.id == "minimal-scenario"
        assert len(scenario.steps) == 1
        assert scenario.steps[0].seconds == DEFAULT_STEP_SECONDS
        assert scenario.drivers == {}

    @pytest.mark.parametrize(
        "key", ["id", "title", "summary", "audience", "baseline", "steps"]
    )
    def test_a_missing_required_key_is_refused_by_name(self, key: str):
        block = [line for line in MINIMAL.strip().splitlines()]
        # Drop the key and any indented block belonging to it.
        kept, skipping = [], False
        for line in block:
            if line.startswith(f"{key}:"):
                skipping = True
                continue
            if skipping and (line.startswith(" ") or line.startswith("-")):
                continue
            skipping = False
            kept.append(line)
        with pytest.raises(ScenarioError) as excinfo:
            parse_scenario("\n".join(kept))
        assert key in str(excinfo.value)

    def test_an_empty_step_list_is_refused(self):
        with pytest.raises(ScenarioError, match="non-empty list"):
            parse(MINIMAL.replace("steps:", "steps: []").split("  - id:")[0])


class TestClosedVocabulary:
    def test_an_unknown_top_level_key_is_refused_and_named(self):
        # PLANTED: exactly the shape decision 2 of the operator notes and
        # round 3 both refused -- a self-assessed confidence score.
        with pytest.raises(ScenarioError) as excinfo:
            parse(MINIMAL + "\nconfidence: 0.8\n")
        assert "confidence" in str(excinfo.value)

    def test_an_unknown_step_key_is_refused_and_named(self):
        with pytest.raises(ScenarioError) as excinfo:
            parse(MINIMAL + "    selector: '.row'\n")
        assert "selector" in str(excinfo.value)

    def test_the_legitimate_look_alike_still_parses(self):
        # Every optional key at once: none of them is "unknown", and a
        # closed vocabulary that refused these would be useless.
        scenario = parse(
            MINIMAL
            + """    narration: A line for the caption.
    seconds: 12
    checkpoint: after the only step
    focus: the middle of the screen
prerequisites:
  - The application is installed.
reset: Close it and start again.
recovery:
  - symptom: Nothing happened.
    action: Try again.
drivers:
  playwright-web:
    steps:
      only-step:
        selector: '[data-testid="thing"]'
"""
        )
        step = scenario.steps[0]
        assert step.seconds == 12
        assert step.checkpoint == "after the only step"
        assert step.focus == "the middle of the screen"
        assert scenario.prerequisites == ("The application is installed.",)
        assert scenario.reset == "Close it and start again."
        assert scenario.recovery[0].symptom == "Nothing happened."
        assert "playwright-web" in scenario.drivers


class TestStableIds:
    def test_a_duplicate_step_id_is_refused(self):
        with pytest.raises(ScenarioError, match="repeats step id"):
            parse(
                MINIMAL
                + """  - id: only-step
    title: A second step wearing the first one's id
    action: Do it again.
    expect: It happened again.
"""
            )

    @pytest.mark.parametrize("bad", ["Only-Step", "only_step", "only step", "only--step"])
    def test_a_non_kebab_step_id_is_refused(self, bad: str):
        with pytest.raises(ScenarioError, match="kebab-case"):
            parse(MINIMAL.replace("id: only-step", f"id: {bad}"))

    def test_a_kebab_id_with_digits_is_accepted(self):
        # The legitimate look-alike: `step-2b` is not a violation.
        assert parse(MINIMAL.replace("only-step", "step-2b")).steps[0].id == "step-2b"

    def test_step_index_is_one_based_for_replay_prose(self):
        scenario = parse(
            MINIMAL
            + """  - id: second-step
    title: The second step
    action: Do the next thing.
    expect: The next thing is done.
"""
        )
        assert scenario.step_index("only-step") == 1
        assert scenario.step_index("second-step") == 2


class TestSeconds:
    @pytest.mark.parametrize("bad", ["0", "-4", "true", "'8'", "8.5"])
    def test_a_non_positive_or_non_integer_duration_is_refused(self, bad: str):
        with pytest.raises(ScenarioError, match="positive whole number"):
            parse(MINIMAL + f"    seconds: {bad}\n")

    def test_the_length_design_check_warns_and_never_refuses(self):
        # A scenario over the sub-minute convention still PARSES. This set's
        # finding is that a gate forcing an unpleasant outcome gets routed
        # around rather than satisfied, so authored length is advice.
        scenario = parse(MINIMAL + f"    seconds: {SUGGESTED_MAX_SECONDS + 1}\n")
        assert scenario.total_seconds == SUGGESTED_MAX_SECONDS + 1
        assert any("design check" in note for note in scenario.warnings())

    def test_a_scenario_inside_the_convention_warns_about_nothing(self):
        assert parse(MINIMAL).warnings() == []


class TestDriverQuarantine:
    """The digest is the mechanism; these are its two directions."""

    def test_the_portable_payload_does_not_contain_drivers(self):
        scenario = parse(
            MINIMAL
            + """drivers:
  playwright-web:
    steps:
      only-step:
        selector: '.monaco-list-row'
"""
        )
        assert "drivers" not in scenario.portable_payload()
        assert "monaco" not in repr(scenario.portable_payload())

    def test_changing_a_selector_does_not_move_the_digest(self):
        before = parse(
            MINIMAL + "drivers:\n  web:\n    steps:\n      only-step:\n        selector: '#a'\n"
        )
        after = parse(
            MINIMAL + "drivers:\n  web:\n    steps:\n      only-step:\n        selector: '#b'\n"
        )
        assert before.portable_digest() == after.portable_digest()

    def test_changing_a_portable_word_does_move_the_digest(self):
        # The look-alike direction: a digest that never moves is a digest
        # that proves nothing.
        before = parse(MINIMAL)
        after = parse(MINIMAL.replace("Do the thing.", "Do the other thing."))
        assert before.portable_digest() != after.portable_digest()

    def test_reformatting_the_source_does_not_move_the_digest(self):
        # The digest is taken over the PARSED model, so re-wrapping a block
        # scalar or reordering two keys must not restale four documents.
        reordered = """
        title: A minimal scenario
        id: minimal-scenario
        audience: Whoever reads the tests.
        summary: >-
          One step, so the required half
          is visible.
        steps:
          - id: only-step
            title: The only step
            expect: The thing is done.
            action: Do the thing.
        baseline:
          observable: The application is open.
          description: Nothing needs staging.
        """
        assert parse(reordered).portable_digest() == parse(MINIMAL).portable_digest()

    def test_a_driver_key_that_is_not_kebab_case_is_refused(self):
        with pytest.raises(ScenarioError, match="kebab-case"):
            parse(MINIMAL + "drivers:\n  Playwright_VSCode:\n    steps: {}\n")


class TestCheckpoints:
    def test_checkpoints_are_the_named_steps_in_order(self):
        scenario = parse(
            MINIMAL
            + """    checkpoint: first stop
  - id: second-step
    title: The second step
    action: Do the next thing.
    expect: The next thing is done.
  - id: third-step
    title: The third step
    action: Do the last thing.
    expect: The last thing is done.
    checkpoint: second stop
"""
        )
        assert [step.checkpoint for step in scenario.checkpoints] == [
            "first stop",
            "second stop",
        ]

    def test_a_blank_checkpoint_is_refused_rather_than_ignored(self):
        # An empty string would render a checkpoint row with no name in it.
        with pytest.raises(ScenarioError, match="omit the key"):
            parse(MINIMAL + "    checkpoint: ''\n")


class TestDuplicateKeys:
    """PyYAML's default is last-one-wins, silently (S2 verification, round 2)."""

    def test_a_duplicated_step_key_is_refused_rather_than_dropped(self):
        with pytest.raises(ScenarioError, match="duplicate key 'action'"):
            parse(MINIMAL + "    action: Do something else entirely.\n")

    def test_a_duplicated_top_level_key_is_refused(self):
        with pytest.raises(ScenarioError, match="duplicate key 'title'"):
            parse(MINIMAL + "title: A second title nobody would ever see.\n")

    def test_the_message_names_the_line_and_the_consequence(self):
        with pytest.raises(ScenarioError) as excinfo:
            parse(MINIMAL + "    expect: Something else happened.\n")
        assert "drop the content above it" in str(excinfo.value)

    def test_the_same_key_in_two_different_steps_is_fine(self):
        # The legitimate look-alike: every step has an `action`.
        scenario = parse(
            MINIMAL
            + """  - id: second-step
    title: The second step
    action: Do the next thing.
    expect: The next thing is done.
"""
        )
        assert len(scenario.steps) == 2


class TestCaptionSafety:
    """A caption payload has to survive WebVTT (S2 verification, round 1)."""

    def test_narration_containing_the_cue_arrow_is_refused(self):
        with pytest.raises(ScenarioError, match="cue-timing arrow"):
            parse(MINIMAL + "    narration: Drag the file --> then drop it.\n")

    def test_action_containing_the_cue_arrow_is_refused(self):
        # `action` is the caption FALLBACK, so it reaches a cue too.
        with pytest.raises(ScenarioError, match="cue-timing arrow"):
            parse(MINIMAL.replace("Do the thing.", "Go to File --> Open."))

    def test_the_message_names_the_replacement(self):
        with pytest.raises(ScenarioError) as excinfo:
            parse(MINIMAL + "    narration: Go A --> B.\n")
        assert "'->'" in str(excinfo.value)

    def test_a_single_arrow_and_an_expect_arrow_are_both_fine(self):
        # The legitimate look-alikes: `->` is not WebVTT's arrow, and
        # `expect` never becomes a cue payload.
        scenario = parse(
            MINIMAL.replace("The thing is done.", "The panel shows A --> B.")
            + "    narration: Choose File -> Open.\n"
        )
        assert scenario.steps[0].caption == "Choose File -> Open."


class TestCaptionFallback:
    def test_a_step_without_narration_captions_its_action(self):
        assert parse(MINIMAL).steps[0].caption == "Do the thing."

    def test_narration_wins_when_authored(self):
        assert parse(MINIMAL + "    narration: Watch this.\n").steps[0].caption == (
            "Watch this."
        )


class TestLoading:
    def test_a_directory_resolves_to_its_scenario_file(self, tmp_path):
        (tmp_path / "scenario.yaml").write_text(MINIMAL, encoding="utf-8")
        assert load_scenario(tmp_path).id == "minimal-scenario"

    def test_a_missing_source_names_the_path(self, tmp_path):
        with pytest.raises(ScenarioError, match="no scenario source"):
            load_scenario(tmp_path / "nope")
