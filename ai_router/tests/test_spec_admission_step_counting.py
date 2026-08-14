"""Falsifiers for what the admission test COUNTS and what it calls ceremony.

Set 132 Session 2. The size check shipped with two defects, both found by
using the instrument rather than by reading it:

**D1 — nested ordered lists were hoisted to top level.** ``_STEP_RE``
capped a step marker's indent at three characters, on the reasoning that
"4+ spaces is a nested list in Markdown". Under a *bullet* that is true;
under the ordinary ``2. `` parent the content column is **3**, which is
exactly where CommonMark nests a child list. So every nested ordered list
this repo's specs actually write was counted as top-level steps. Set 131's
Session 1 declared six steps, nested five precedence rules under step 2,
and was reported ``OVER CAP`` at eleven.

**D2 — ceremony was counted by mention, not by role.** Any step containing
"verification", "register" or "close" was charged as ceremony, so N — the
authored work-step count the budget is about — was deflated for every
session whose work happened to discuss a stage.

Both halves are tested the only way a gate can be tested (L-112-1): by
planting. Every rule here has a falsifier on each side — a shape that must
**not** inflate the count beside a genuinely oversized spec that must
**still** be refused, and a work step that quotes a ceremony word beside a
real ceremony step that must still classify as one. The two real specs
that exposed the defects are used as regression fixtures, because a
hand-written approximation of a bug is not the bug.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_router import spec_admission as sa


REPO_ROOT = Path(sa.__file__).resolve().parents[1]

SPEC_HEAD = """# Example Spec

> **Purpose:** example.

## Sessions

"""


def _write(tmp_path, body: str, status: str = "complete") -> str:
    """Write a spec whose set has a known status.

    Defaults to ``complete`` so the step-SHAPE check (Set 128 S1) is an
    informational note and cannot decide an assertion about the step
    COUNT. Tests that care about shape or about the CLI's exit code pass
    an explicit status.
    """
    path = tmp_path / "spec.md"
    path.write_text(SPEC_HEAD + body, encoding="utf-8")
    (tmp_path / "session-state.json").write_text(
        json.dumps({"schemaVersion": 4, "status": status}), encoding="utf-8"
    )
    return str(path)


def _repo_spec(slug: str) -> Path:
    spec = REPO_ROOT / "docs" / "session-sets" / slug / "spec.md"
    if not spec.is_file():
        pytest.skip(f"{slug}/spec.md is not present in this checkout")
    return spec


# The shape that produced the defect, reduced to its essentials: five
# sub-points numbered 1.-5. and indented to the parent's content column of
# three. Written as a literal rather than generated so the indentation
# under test is visible in the file.
SET_131_SHAPE = """### Session 1 of 1: The pin comes out

**Steps:**

1. Register.
2. **Write the delegation model, then encode it.** The precedence order
   is a contract, evaluated in order:

   1. **Authority veto.** The decision-rights rubric comes first.
   2. **Independence requirement.** Work whose *value is* an independent
      perspective is always routed: `session-verification`, code review,
      security review.
   3. **Risk gate.** Work is outsourceable when its failure mode is
      caught by something deterministic.
   4. **Context-footprint trigger.** Replaces the line-count threshold.
   5. **Model choice, last.** Only after eligibility.

3. **Bound the child.** `delegation.child_budget` caps a routed child's
   inferences.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out.**

**Creates:** nothing.
**Touches:** `docs/ai-led-session-workflow.md`
"""


class TestNestedOrderedListsAreNotSteps:
    """D1, both directions: nesting must not inflate, size must still bite."""

    def test_the_set_131_shape_counts_six_steps_not_eleven(self, tmp_path):
        spec = _write(tmp_path, SET_131_SHAPE)
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert plan.step_count == 6, (
            "a sub-list indented to its parent's content column was hoisted "
            f"to top level again; steps parsed: {plan.steps}"
        )
        assert plan.steps[2].startswith("**Bound the child.**")

    def test_the_real_set_131_spec_parses_at_its_declared_six(self):
        """The regression fixture, not an approximation of it.

        Set 131's Session 1 is the spec that was reported ``OVER CAP``
        while sitting inside the budget. All three of its sessions declare
        six steps; only Session 1 carries a nested ordered list, which is
        why Sessions 2 and 3 always parsed correctly and the defect looked
        like a one-off.
        """
        text = _repo_spec("131-outsourcing-policy-restoration").read_text(
            encoding="utf-8"
        )
        plans = sa.parse_session_plans(text)
        assert [p.step_count for p in plans] == [6, 6, 6]
        assert [p.work_step_count for p in plans] == [2, 2, 2]

    def test_a_genuinely_oversized_spec_is_still_refused(self, tmp_path):
        """The other side of the falsifier pair.

        A fix that makes a counter count *fewer* things is one edit away
        from a counter that refuses nothing. Nine real top-level steps,
        no nesting anywhere, must still be a violation.
        """
        steps = "".join(
            f"{i}. Do the genuinely distinct thing number {i}.\n"
            for i in range(1, 10)
        )
        spec = _write(tmp_path, f"### Session 1 of 1: Too big\n\n{steps}")
        result = sa.check_spec(spec, max_steps=sa.DEFAULT_MAX_STEPS)
        assert [p.step_count for p in result.sessions] == [9]
        assert [p.number for p in result.violations] == [1]
        assert not result.passed

    def test_an_oversized_spec_whose_steps_are_nested_is_not_refused(
        self, tmp_path
    ):
        """Same nine items, nested — the count must follow the structure.

        This is the pair to the test above and the reason it is not enough
        on its own: identical text, one level of indentation apart, must
        give different answers. If both spellings pass or both fail, the
        parser is not reading nesting at all.
        """
        nested = "".join(
            f"   {i}. Do the sub-thing number {i}.\n" for i in range(1, 10)
        )
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Detailed\n\n1. Register.\n"
            f"2. One step with detail:\n\n{nested}\n"
            "3. **Cross-provider verification.**\n"
            "4. **Required portion of the full test suite.**\n"
            "5. **Close-out.**\n",
        )
        result = sa.check_spec(spec, max_steps=sa.DEFAULT_MAX_STEPS)
        assert [p.step_count for p in result.sessions] == [5]
        assert result.violations == []

    def test_sub_steps_stay_inside_their_parent_step_text(self, tmp_path):
        """Not counted is not the same as discarded.

        ``parse_step_texts`` is also what seeds ``activity-log.json``
        (Set 114 S2), so a sub-step that vanished from the step text would
        trade a miscount for a silent loss of the plan.
        """
        spec = _write(tmp_path, SET_131_SHAPE)
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert "Authority veto" in plan.steps[1]
        assert "Model choice, last" in plan.steps[1]

    def test_an_ordered_list_nested_under_a_bullet_is_not_a_step(
        self, tmp_path
    ):
        """The pre-skeleton shape that Set 002 wrote.

        Its Session 4 has no step list at all: six numbered *test
        scenarios* sit under a ``- Test scenarios:`` bullet, and the old
        cap counted them as the session's six steps.
        """
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Deliverables\n\n"
            "**Deliverables:**\n"
            "- Test scenarios:\n"
            "  1. Lease expiration.\n"
            "  2. Heartbeat timeout.\n"
            "  3. Truncated SQLite recovery.\n",
        )
        plans = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )
        assert plans[0].step_count == 0

    def test_top_level_steps_resume_after_a_nested_block(self, tmp_path):
        """Closing the sub-list must not close the session's own list."""
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Resume\n\n"
            "1. First.\n"
            "   1. Detail.\n"
            "   2. Detail.\n"
            "2. Second.\n"
            "   - a bullet\n"
            "     1. deeper detail\n"
            "3. Third.\n",
        )
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert plan.step_count == 3
        assert [s.split(".")[0] for s in plan.steps] == [
            "First",
            "Second",
            "Third",
        ]

    def test_restarted_numbering_still_counts_both(self, tmp_path):
        """Documented behaviour, preserved.

        Two ``1.`` items at top level are two things the session must do;
        the honest reading counts both, and the nesting fix must not
        quietly turn the second list into a child of the first.
        """
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Restarted\n\n"
            "1. First.\n"
            "2. Second.\n\n"
            "Some prose in column zero.\n\n"
            "1. Third, renumbered.\n"
            "2. Fourth.\n",
        )
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert plan.step_count == 4

    def test_a_four_space_marker_with_nothing_open_is_not_a_step(
        self, tmp_path
    ):
        """The one thing the old whitespace cap got right, kept.

        Four columns with no enclosing list item is an indented code
        block in Markdown, not a list.
        """
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Indented\n\n"
            "Prose introducing a sample.\n\n"
            "    1. Not a step, a code block.\n"
            "    2. Also not a step.\n",
        )
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert plan.step_count == 0

    def test_a_wrapped_sentence_beginning_with_a_paren_number_is_not_a_step(
        self, tmp_path
    ):
        """``1)`` is a legal CommonMark marker and deliberately not one here.

        Four specs in this repo wrap prose onto a continuation line that
        begins ``023) that clamps the union to ...`` — the fixture below
        is Set 023's, indentation and all. Admitting the paren form while
        fixing a hoisting bug would inflate the very count being
        corrected, and would split a step's text mid-sentence.
        """
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Wrapped\n\n"
            "1. A real step whose prose mentions an earlier set (see Set\n"
            "  023) that clamps the union to `[1..totalSessions]` and warns\n"
            "  on anything outside it.\n",
        )
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert plan.step_count == 1
        assert "clamps the union" in plan.steps[0]

    def test_the_trailer_still_ends_the_last_step(self, tmp_path):
        """A column-zero line closes the list, as it always did."""
        spec = _write(tmp_path, SET_131_SHAPE)
        plan = sa.parse_session_plans(
            Path(spec).read_text(encoding="utf-8")
        )[0]
        assert "Creates" not in plan.steps[-1]
        assert plan.steps[-1] == "**Close-out.**"


# The exact sentence that exposed D2: a work step whose *value* is that it
# defines when routing happens, misread as a verification step because it
# names three kinds of review.
INDEPENDENCE_REQUIREMENT = (
    "**Independence requirement.** Work whose *value is* an independent "
    "perspective is always routed: `session-verification`, code review, "
    "security review."
)


class TestCeremonyIsARoleNotAMention:
    """D2, both directions: quoting a stage is not being one."""

    def test_the_independence_requirement_step_is_work(self):
        steps = (
            "Register.",
            INDEPENDENCE_REQUIREMENT,
            "Cross-provider verification.",
            "Required portion of the full test suite.",
            "Close-out.",
        )
        roles = sa.classify_steps(steps)
        assert roles[1] == sa.WORK, (
            "the step that defines WHEN work is routed was charged as a "
            "verification step because it names three kinds of review"
        )
        assert sa.work_step_count(steps) == 1

    @pytest.mark.parametrize(
        "step_text",
        [
            "**Remove `not computed` from the close-out readiness row.** "
            "Operator ruling, 2026-08-14: the row already renders in a gray "
            "slot.",
            "**Fix D2 - classify ceremony by role, not by mention.** "
            '`intents_named` tags any step containing "verification", '
            '"register" or "close" as ceremony.',
            "**Design the causal question, with a cross-provider panel.** "
            "The author chooses N knowing the work.",
        ],
    )
    def test_a_work_step_that_quotes_a_ceremony_word_is_work(self, step_text):
        """The three from this set's own spec, misread on the words they quote."""
        steps = (
            "Register.",
            step_text,
            "Cross-provider verification.",
            "Required portion of the full test suite.",
            "Close-out.",
        )
        assert sa.classify_steps(steps)[1] == sa.WORK

    def test_the_ceremony_slots_are_still_ceremony(self):
        """The other side: a fix that calls everything work counts nothing."""
        steps = (
            "Register.",
            "Do the work.",
            "Cross-provider verification.",
            "Required portion of the full test suite.",
            "Close-out.",
        )
        assert sa.classify_steps(steps) == (
            sa.REGISTER,
            sa.WORK,
            sa.VERIFICATION,
            sa.FULL_SUITE,
            sa.CLOSE_OUT,
        )
        assert sa.work_step_count(steps) == 1

    def test_position_alone_does_not_make_a_step_ceremony(self):
        """Role is position CONFIRMED BY naming, not position alone.

        A position-only rule would charge every session for four ceremony
        steps whether or not it declared them, which is the same error as
        counting by mention with the sign flipped.
        """
        steps = (
            "Do the first thing.",
            "Do the second thing.",
            "Do the third thing.",
            "Do the fourth thing.",
            "Do the fifth thing.",
        )
        assert sa.classify_steps(steps) == (sa.WORK,) * 5
        assert sa.work_step_count(steps) == 5

    def test_a_compressed_tail_is_one_ceremony_step_not_three(self):
        """The pre-skeleton shape, counted honestly.

        Set 127 S2 wrote "Full pytest and the Layer 3 run recorded as runs
        of record; verify; close." as a single step. It is one ceremony
        step, and the two work steps beside it are work: N = 2. A
        position-only rule would charge this session for three tail steps
        it never declared and report N = 1.
        """
        steps = (
            "Register.",
            "Do the first thing.",
            "Do the second thing.",
            "Full pytest and the Layer 3 run recorded as runs of record; "
            "verify; close.",
        )
        roles = sa.classify_steps(steps)
        assert roles[0] == sa.REGISTER
        assert roles[1] == sa.WORK
        assert roles[2] == sa.WORK
        assert roles[3] in sa.TAIL_INTENTS
        assert sa.work_step_count(steps) == 2

    def test_the_tail_is_aligned_to_the_end_not_counted_forward(self):
        """A short plan still gets close-out in its last slot."""
        steps = ("Register.", "Cross-provider verification.", "Close-out.")
        assert sa.classify_steps(steps) == (
            sa.REGISTER,
            sa.VERIFICATION,
            sa.CLOSE_OUT,
        )

    def test_intents_named_still_reports_mentions(self):
        """The primitive is unchanged, and must stay that way.

        ``check_step_shape`` asks "does the step in the close-out slot say
        close-out?", where mention is exactly the right test. Narrowing
        ``intents_named`` to fix D2 would have broken the shape check
        instead of the count.
        """
        assert sa.VERIFICATION in sa.intents_named(INDEPENDENCE_REQUIREMENT)
        assert sa.intents_named("Close-out.") == (sa.CLOSE_OUT,)
        assert sa.intents_named("Do the work.") == ()


class TestTheCorrectedNForThisSet:
    """The instrument, turned on the spec that specified it."""

    def test_set_132_declares_two_three_and_three_work_steps(self):
        text = _repo_spec(
            "132-session-length-and-explorer-captions"
        ).read_text(encoding="utf-8")
        plans = sa.parse_session_plans(text)
        assert [p.number for p in plans] == [1, 2, 3]
        assert [p.step_count for p in plans] == [6, 7, 7]
        assert [p.work_step_count for p in plans] == [2, 3, 3], (
            "run against this spec before the fix, the classifier called "
            "three of its eight work steps ceremony"
        )

    def test_every_session_in_this_set_is_inside_the_ratified_budget(self):
        spec = _repo_spec("132-session-length-and-explorer-captions")
        result = sa.check_spec(str(spec), max_steps=sa.DEFAULT_MAX_STEPS)
        assert result.error is None
        assert result.violations == []
        over = [
            p.number
            for p in result.sessions
            if p.work_step_count > sa.WORK_STEP_BUDGET
        ]
        assert over == []

    def test_the_report_states_n_beside_the_step_count(self, tmp_path):
        """N is what the budget is about, so the author sees it."""
        spec = _write(tmp_path, SET_131_SHAPE)
        report = sa.format_report(
            sa.check_spec(spec, max_steps=sa.DEFAULT_MAX_STEPS)
        )
        assert "Session 1: 6 steps (N=2)" in report


class TestCliExitCodes:
    """Set 132 S2, journaled: --spec is a verdict, --all is a census."""

    OVERSIZED = "### Session 1 of 1: Too big\n\n" + "".join(
        f"{i}. Do the genuinely distinct thing number {i}.\n"
        for i in range(1, 10)
    )
    CLEAN = (
        "### Session 1 of 1: Fine\n\n"
        "1. Register.\n"
        "2. Do the work.\n"
        "3. Cross-provider verification.\n"
        "4. Required portion of the full test suite.\n"
        "5. Close-out.\n"
    )

    def test_spec_mode_exits_non_zero_on_a_violation(self, tmp_path, capsys):
        spec = _write(tmp_path, self.OVERSIZED)
        assert sa.run(["--spec", spec]) == 1
        assert "OVER CAP" in capsys.readouterr().out

    def test_spec_mode_exits_zero_on_a_clean_spec(self, tmp_path):
        """Without this the gate is 'always fails', which proves nothing."""
        spec = _write(tmp_path, self.CLEAN)
        assert sa.run(["--spec", spec]) == 0

    def test_all_mode_stays_a_census_unless_check(self, tmp_path, capsys):
        root = tmp_path / "repo"
        set_dir = root / "docs" / "session-sets" / "001-oversized"
        set_dir.mkdir(parents=True)
        _write(set_dir, self.OVERSIZED)
        assert sa.run(["--all", "--repo-root", str(root)]) == 0
        assert "OVER CAP" in capsys.readouterr().out

    def test_all_mode_with_check_still_gates(self, tmp_path):
        root = tmp_path / "repo"
        set_dir = root / "docs" / "session-sets" / "001-oversized"
        set_dir.mkdir(parents=True)
        _write(set_dir, self.OVERSIZED)
        assert sa.run(["--all", "--check", "--repo-root", str(root)]) == 1

    def test_spec_mode_exits_non_zero_when_restructuring_is_required(
        self, tmp_path
    ):
        """The size check is not the only thing --spec now reports on."""
        spec = _write(
            tmp_path,
            "### Session 1 of 1: Wrong shape\n\n"
            "1. Do the work.\n"
            "2. Do more work.\n"
            "3. Do yet more work.\n"
            "4. Do the last of the work.\n",
            status="not-started",
        )
        result = sa.check_spec(spec, max_steps=sa.DEFAULT_MAX_STEPS)
        assert result.restructuring_required
        assert sa.run(["--spec", spec]) == 1
