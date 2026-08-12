"""Falsifiers for the session step-shape check (Set 128 S1).

L-112-1: a gate that only ever passes is indistinguishable from one that
checks nothing, and reading its regexes reads as confirmation. So every
rule here is proved by **planting the malformation** and asserting the
check fires, paired with the legitimate look-alike that must not fire.
The weight is deliberately on the negative direction.

The malformation that matters most is not hypothetical. Set 127 Session 2
declared

    5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.

and the orchestrator followed the spec's letter over the ordering policy
that outranks it, spending a 752-second pytest run and a 350-second
Playwright run that a blocking verification finding immediately staled.
Set 112 S3 had already done the same into 15 runs and 186 minutes. That
exact step text is planted below, verbatim.

Two dimensions are isolated from each other here, the same way
``test_spec_admission.py`` isolates size from shape: these specs are
sized well inside the cap, so a size violation can never be what makes a
shape assertion pass.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_router import spec_admission as sa


SPEC_HEAD = """# Example Spec

> **Purpose:** example.

## Sessions

"""

REGISTER = "Register."
VERIFY = "**Cross-provider verification.**"
SUITE = "**Required portion of the full test suite.**"
CLOSE = "**Close-out.**"


def _spec(tmp_path, *step_lists, extra: str = "", status: object = "unstarted"):
    """Write a spec of one session per step list; return its path.

    ``status`` is the set's ``session-state.json`` status. The default
    ``"unstarted"`` writes **no state file at all** — the primary
    authoring-time case, and the one where a shape departure blocks.
    """
    body = ""
    total = len(step_lists)
    for n, steps in enumerate(step_lists, start=1):
        numbered = "".join(f"{i}. {s}\n" for i, s in enumerate(steps, start=1))
        body += f"### Session {n} of {total}: Planted {n}\n\n{numbered}\n"
    path = tmp_path / "spec.md"
    path.write_text(SPEC_HEAD + body + extra, encoding="utf-8")
    if status != "unstarted":
        (tmp_path / "session-state.json").write_text(
            json.dumps({"schemaVersion": 4, "status": status}),
            encoding="utf-8",
        )
    return str(path)


CONFORMING = [REGISTER, "Do the work.", "Do more work.", VERIFY, SUITE, CLOSE]


class TestTheCheckFires:
    """The planted malformations. Each one must be caught."""

    def test_the_set_127_s2_compressed_step_fires_verbatim(self, tmp_path):
        """The incident shape, in the incident's own words.

        This is the one thing that must not regress: a step that folds
        verification and the full suite into one instruction, in any
        order.
        """
        spec = _spec(
            tmp_path,
            [
                REGISTER,
                "**Mirror the derivation in `sessionStepModel.ts`,** the model "
                "the tree actually reads.",
                "**Falsify in TypeScript with the same both-direction pairs.**",
                "**Layer 3 rendering smoke**, then the human look.",
                "Full pytest and the Layer 3 run recorded as runs of record; "
                "verify; close.",
            ],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert result.restructuring_required
        compressions = [
            f for f in result.shape_findings if "compresses" in f.problem
        ]
        assert compressions, result.shape_findings
        assert compressions[0].position == 5
        # The CLI is the surface an author actually runs.
        assert sa.run(["--spec", spec, "--check", "--max-steps", "7"]) == 1

    def test_a_compressed_step_fires_in_either_internal_order(self, tmp_path):
        """'Verify then full suite' is as wrong as 'full suite then verify'.

        The check is an unordered intent test precisely so an author
        cannot slip the retired ordering past it by rewording.
        """
        spec = _spec(
            tmp_path,
            [
                REGISTER,
                "Do the work.",
                "Do more work.",
                VERIFY,
                "Verify the fix, then run the full test suite.",
                CLOSE,
            ],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert any("compresses" in f.problem for f in result.shape_findings)

    def test_a_tail_in_the_wrong_order_fires(self, tmp_path):
        spec = _spec(
            tmp_path,
            [REGISTER, "Do the work.", SUITE, VERIFY, CLOSE],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert [f.position for f in result.shape_findings] == [3, 4]

    def test_a_missing_tail_step_fires(self, tmp_path):
        """Verification and close-out, with no full-suite step between."""
        spec = _spec(tmp_path, [REGISTER, "Do the work.", VERIFY, CLOSE])
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert result.restructuring_required

    @pytest.mark.parametrize(
        "step",
        [
            "Run the full suites, then cross-provider verification.",
            "Run all tests, then verify with a different provider.",
            "Verify the change, then run every test.",
            "Cross-provider verification, then the whole suite.",
            "Verify, then the entire test suite.",
        ],
        ids=["full-suites", "all-tests", "every-test", "whole-suite", "entire-suite"],
    )
    def test_the_full_suite_intent_is_not_defeated_by_ordinary_wording(
        self, tmp_path, step
    ):
        """Round 1, findings 1-2: the recogniser was too literal.

        ``\\bsuite\\b`` does not match "suites", and nothing matched "all
        tests" — so the exact compression this check exists to refuse
        passed whenever the author used the plural or the commonest
        engine phrasing. This set's OWN spec calls the bad shape "full
        suites; verify; close", which is the version that slipped
        through.
        """
        spec = _spec(tmp_path, [REGISTER, "Do the work.", step, SUITE, CLOSE])
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert any("compresses" in f.problem for f in result.shape_findings), (
            result.shape_findings
        )

    @pytest.mark.parametrize(
        "step",
        [
            "Close the tracking issue.",
            "Close remaining docs.",
            "Close the loop with the consumer repos.",
        ],
        ids=["tracking-issue", "remaining-docs", "the-loop"],
    )
    def test_a_bare_close_on_an_unrelated_object_is_not_close_out(
        self, tmp_path, step
    ):
        """Round 2: "close" + a noun is not the close-out stage.

        An unqualified ``\\bclose\\b`` let any final work step satisfy the
        skeleton, so a spec that declares NO close-out passed the gate
        meant to require one — a false all-clear, which is strictly worse
        than the prose it replaced.
        """
        spec = _spec(tmp_path, [REGISTER, "Do the work.", VERIFY, SUITE, step])
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert any(f.position == 5 for f in result.shape_findings)

    def test_work_after_close_out_fires(self, tmp_path):
        spec = _spec(
            tmp_path,
            [REGISTER, "Do the work.", VERIFY, SUITE, CLOSE, "One more thing."],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert any(f.position == 6 for f in result.shape_findings)

    def test_a_session_that_never_registers_fires(self, tmp_path):
        spec = _spec(tmp_path, ["Do the work.", VERIFY, SUITE, CLOSE])
        result = sa.check_spec(spec, max_steps=7)
        assert [f.position for f in result.shape_findings] == [1]
        assert "Register" in result.shape_findings[0].problem

    def test_fewer_steps_than_the_ceremony_fires(self, tmp_path):
        spec = _spec(tmp_path, [REGISTER, VERIFY, CLOSE])
        result = sa.check_spec(spec, max_steps=7)
        assert not result.passed
        assert result.shape_findings[0].position == 0


class TestTheCheckDoesNotFire:
    """The legitimate look-alikes. None of these may be caught."""

    def test_a_conforming_spec_at_the_budget_passes(self, tmp_path):
        """Three work steps plus the four baked-in ones: the budget."""
        spec = _spec(tmp_path, CONFORMING)
        result = sa.check_spec(spec, max_steps=7)
        assert result.shape_findings == []
        assert result.passed
        assert sa.run(["--spec", spec, "--check", "--max-steps", "7"]) == 0

    def test_a_conforming_spec_with_a_declared_exception_passes(self, tmp_path):
        """Over the cap, shape-clean, and excepted: still admitted."""
        spec = _spec(
            tmp_path,
            [
                REGISTER,
                "Work one.",
                "Work two.",
                "Work three.",
                "Work four.",
                VERIFY,
                SUITE,
                CLOSE,
            ],
            extra="\nsessionSizeException: 1 - four work steps, justified\n",
        )
        result = sa.check_spec(spec, max_steps=7)
        assert result.shape_findings == []
        assert result.passed
        assert [p.number for p in result.excepted] == [1]

    def test_the_tail_is_recognised_by_intent_not_by_prose(self, tmp_path):
        """An author who writes 'Close out' must not fail on a hyphen.

        None of these four steps uses the canonical wording, and every
        one of them declares its stage unambiguously.
        """
        spec = _spec(
            tmp_path,
            [
                "Session registration, then triage the review queue.",
                "Do the work.",
                "Verify the change with a different effective provider.",
                "Record the runs of record this session owes.",
                "Close out and fire the notification.",
            ],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert result.shape_findings == []

    @pytest.mark.parametrize(
        "step",
        ["Close-out.", "Close out and notify.", "Closeout.", "Closing out the set.",
         "Commit, push, and close.", "Close the session."],
        ids=["hyphen", "two-words", "one-word", "closing-out", "trailing", "session"],
    )
    def test_close_out_is_still_recognised_however_it_is_spelled(
        self, tmp_path, step
    ):
        """The round-2 tightening must not cost the legitimate spellings.

        Narrowing a recogniser to kill a false positive is exactly where
        a false NEGATIVE gets introduced, so every phrasing the repo
        actually uses is asserted here rather than assumed.
        """
        spec = _spec(tmp_path, [REGISTER, "Do the work.", VERIFY, SUITE, step])
        result = sa.check_spec(spec, max_steps=7)
        assert result.shape_findings == [], step

    def test_a_work_step_that_describes_the_ceremony_is_prose(self, tmp_path):
        """The documented scope boundary, and this repo's own case.

        Set 128's Session 1 declares a falsifier step whose text names
        'verify + full suite' while describing what the check must catch.
        Reading a work step as ceremony would fail the very spec that
        ships the check, so the compression rule reads the tail region
        only; a work step that *orders* an early full suite is an A2
        ordering concern owned by Session 2.
        """
        spec = _spec(
            tmp_path,
            [
                REGISTER,
                "**Falsify in both directions.** FIRES: a spec that compresses "
                "verify + full suite into one step.",
                VERIFY,
                SUITE,
                CLOSE,
            ],
        )
        result = sa.check_spec(spec, max_steps=7)
        assert result.shape_findings == []


class TestRestructuringIsRequiredOnlyOfUnstartedSets:
    """The operator's ratification, 2026-08-12, proved in both directions."""

    @pytest.mark.parametrize(
        "status", ["unstarted", "not-started"], ids=["no-state-file", "not-started"]
    )
    def test_an_unstarted_set_requires_restructuring(self, tmp_path, status):
        spec = _spec(
            tmp_path, [REGISTER, "Do the work.", "Then close."], status=status
        )
        result = sa.check_spec(spec, max_steps=7)
        assert not result.set_started
        assert result.restructuring_required
        assert not result.passed
        out = _report(result)
        assert "REQUIRES RESTRUCTURING" in out
        assert "refus" not in out.lower()

    @pytest.mark.parametrize(
        "status",
        ["in-progress", "complete", "cancelled"],
        ids=["in-progress", "complete", "cancelled"],
    )
    def test_a_started_set_gets_an_informational_note_only(self, tmp_path, status):
        """Not a warning. A different time, a different approach."""
        spec = _spec(
            tmp_path, [REGISTER, "Do the work.", "Then close."], status=status
        )
        result = sa.check_spec(spec, max_steps=7)
        assert result.set_started
        assert result.shape_findings
        assert result.restructuring_required == []
        assert result.passed
        out = _report(result)
        assert "authored before the step skeleton" in out
        assert "REQUIRES RESTRUCTURING" not in out
        for word in ("warn", "violation", "must"):
            assert word not in out.lower()
        assert sa.run(["--spec", spec, "--check", "--max-steps", "7"]) == 0

    @pytest.mark.parametrize(
        "status",
        ["completed", "done"],
        ids=["completed", "done"],
    )
    def test_a_past_participle_status_alias_still_reads_as_started(
        self, tmp_path, status
    ):
        """Round 1, finding 3: one canonicalizer, used everywhere.

        This repo already maps ``done`` / ``completed`` onto ``complete``
        on read, because a hand-written state file carrying a
        past-participle token is drift that has happened before. A second,
        stricter notion of "what status means" here would read such a set
        as never started and demand restructuring of a spec whose sessions
        are closed — the exact outcome the operator's ratification
        excludes.
        """
        spec = _spec(
            tmp_path, [REGISTER, "Do the work.", "Then close."], status=status
        )
        result = sa.check_spec(spec, max_steps=7)
        assert result.set_status == "complete"
        assert result.set_started
        assert result.restructuring_required == []
        assert result.passed

    def test_a_corrupt_state_file_reads_as_started_not_as_unstarted(
        self, tmp_path
    ):
        """A state-file bug must not become a blocking finding.

        Only ``start_session`` creates the file, so its presence is
        itself evidence the set was registered.
        """
        spec = _spec(
            tmp_path, [REGISTER, "Do the work.", "Then close."], status="complete"
        )
        (tmp_path / "session-state.json").write_text("{not json", encoding="utf-8")
        result = sa.check_spec(spec, max_steps=7)
        assert result.set_status == "in-progress"
        assert result.restructuring_required == []


class TestStructural:
    """L-112-1's structural half: the shipping set passes its own gate."""

    def test_this_sets_own_sessions_conform_to_the_skeleton(self):
        repo_root = Path(sa.__file__).resolve().parents[1]
        spec = repo_root / "docs" / "session-sets" / (
            "128-session-step-skeleton-and-test-ordering"
        ) / "spec.md"
        result = sa.check_spec(str(spec), max_steps=sa.DEFAULT_MAX_STEPS)
        assert result.error is None
        assert len(result.sessions) == 3
        assert result.shape_findings == []
        assert result.passed

    def test_the_default_cap_is_the_ceremony_plus_the_ratified_budget(self):
        """N = 3 work steps, ratified by the operator on 2026-08-12."""
        assert sa.WORK_STEP_BUDGET == 3
        assert sa.CEREMONY_STEPS == 4
        assert sa.DEFAULT_MAX_STEPS == 7


def _report(result: sa.SpecAdmission) -> str:
    out = sa.format_report(result)
    out.encode("cp1252")  # L-079-1: the console text layer on Windows
    return out
