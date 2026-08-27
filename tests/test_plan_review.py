"""Plan review: the free checks, the fixed-checklist reviewer, the
anti-grind bounce, and risk-triggered escalation."""

import json

import pytest

from ai_router import plan_review
from ai_router.approved_plan import (
    approve_plan,
    effective_plan,
    new_plan,
    read_plan,
    write_plan,
)

SPEC = """\
### Session 1 of 1: Build the thing

1. Register.
2. Add the widget to `ai_router/widget.py`, with a real test behind it. (slug: add-widget)
3. Rename the knob in `docs/knobs.md`. (slug: rename-knob)
4. Affected tests as preverify.
5. Cross-provider verification.
6. Full test suite, recorded as the `final-full` run of record.
7. Close-out.
8. Technical/educational documentation.
"""


def _step(step_id, envelope, kinds=("deterministic",), intent="Do it."):
    return {
        "step_id": step_id,
        "intent": intent,
        "file_envelope": list(envelope),
        "evidence_contract": [
            {"description": f"proof {i}", "kind": k}
            for i, k in enumerate(kinds)
        ],
        "risk_flags": [],
    }


def _plan(steps):
    return new_plan("144-x", 1, "build-the-thing", steps)


def _clean_plan():
    """A plan every free check passes: one step per spec goal, keyed by the
    same six-word truncation the activity log seeds."""
    return _plan([
        _step("add-widget", ["ai_router/widget.py"]),
        _step("rename-knob", ["docs/knobs.md"]),
    ])


def _written(tmp_path, plan):
    """Risk flags are derived at write time, so a plan the free checks see
    must be one that went through the writer."""
    return write_plan(tmp_path, plan)


class _Result:
    def __init__(self, content, model="cheap-1", provider="openai"):
        self.content = content
        self.model_name = model
        self.provider = provider
        self.transport = "api"


def _recorder(content, roles_seen):
    def dispatch(prompt, *, role, session_set, session_number, transport):
        roles_seen.append(role)
        return _Result(content)
    return dispatch


def _approve_all(*step_ids):
    return "\n\n".join(
        f"STEP: {s}\nVERDICT: approve\nFIELDS:\nWHY: the evidence binds."
        for s in step_ids
    )


class TestGoals:
    def test_lifecycle_steps_are_not_goals(self):
        # The ceremony every session pays has no envelope and no evidence
        # of its own, so it never enters a plan and is never a goal a plan
        # must cover.
        goals = plan_review.session_goals(SPEC, 1)
        assert [g.key for g in goals] == [
            "add-widget",
            "rename-knob",
        ]


class TestFreeChecks:
    def test_a_goal_with_no_step_is_found_for_free(self, tmp_path):
        plan = _written(tmp_path, _plan([
            _step("add-widget",
                  ["ai_router/widget.py"]),
        ]))
        findings = plan_review.free_checks(plan, SPEC, 1, tmp_path)
        assert [f.check for f in findings] == [
            plan_review.CHECK_GOAL_WITHOUT_STEP
        ]
        assert findings[0].step_id == "rename-knob"

    def test_a_step_answering_no_goal_is_found_for_free(self, tmp_path):
        plan = _written(tmp_path, _plan([
            _step("add-widget",
                  ["ai_router/widget.py"]),
            _step("rename-knob", ["docs/knobs.md"]),
            _step("tidy-up-while-were-here", ["ai_router/other.py"]),
        ]))
        checks = [f.check for f in
                  plan_review.free_checks(plan, SPEC, 1, tmp_path)]
        assert checks == [plan_review.CHECK_STEP_WITHOUT_GOAL]

    def test_a_file_the_spec_names_must_be_in_some_envelope(self, tmp_path):
        plan = _written(tmp_path, _plan([
            _step("add-widget", ["ai_router/elsewhere.py"]),
            _step("rename-knob", ["docs/knobs.md"]),
        ]))
        findings = plan_review.free_checks(plan, SPEC, 1, tmp_path)
        assert [f.check for f in findings] == [
            plan_review.CHECK_ENVELOPE_OMITS_NAMED_FILE
        ]
        assert "ai_router/widget.py" in findings[0].detail

    def test_declared_risk_flags_that_are_not_the_derived_ones_are_found(
        self, tmp_path
    ):
        # write_plan derives them, so this is a plan edited after the fact:
        # a supervisor does not get the last word on its own risk.
        plan = _written(tmp_path, _clean_plan())
        plan["steps"][0]["risk_flags"] = ["sensitive-path"]
        findings = plan_review.free_checks(plan, SPEC, 1, tmp_path)
        assert [f.check for f in findings] == [
            plan_review.CHECK_RISK_FLAGS_NOT_DERIVED
        ]

    def test_a_step_with_no_evidence_is_refused_by_the_schema_alone(self):
        # The schema is the one implementation of that rule; the free
        # checks report it rather than re-stating it.
        plan = _plan([_step("add-widget",
                            ["ai_router/widget.py"])])
        plan["steps"][0]["evidence_contract"] = []
        findings = plan_review.free_checks(plan, SPEC, 1, None)
        assert any(f.check == plan_review.CHECK_SCHEMA for f in findings)


class TestReviewResponse:
    def test_an_unanswered_step_is_not_an_approval(self):
        verdicts = plan_review.parse_review_response(
            "STEP: one\nVERDICT: approve\nFIELDS:\nWHY: fine.",
            ["one", "two"],
        )
        assert verdicts[0].verdict == "approve"
        assert verdicts[1].verdict == "human"
        assert verdicts[1].objected_fields == list(
            plan_review.OBJECTABLE_FIELDS
        )

    def test_an_ambiguous_verdict_does_not_become_an_approval(self):
        # A combined or hedged token is not one of the three answers, and
        # reading the leading word out of it would let a reviewer that
        # could not decide approve a weak evidence contract.
        verdicts = plan_review.parse_review_response(
            "STEP: one\nVERDICT: approve/amend\n"
            "FIELDS: evidence_contract\nWHY: ambiguous.",
            ["one"],
        )
        assert verdicts[0].verdict == "human"


    def test_an_approval_that_names_objections_fails_closed(self):
        # Two answers in one block. Keeping the approval would discard the
        # objection the reviewer itself just raised.
        verdicts = plan_review.parse_review_response(
            "STEP: one\nVERDICT: approve\n"
            "FIELDS: evidence_contract\nWHY: the proof is thin.",
            ["one"],
        )
        assert verdicts[0].verdict == "human"
        assert verdicts[0].objected_fields == ["evidence_contract"]


class TestRounds:
    def test_free_findings_settle_the_round_without_a_model(self, tmp_path):
        plan = _written(tmp_path, _plan([
            _step("add-widget",
                  ["ai_router/widget.py"]),
        ]))

        def explode(*a, **k):  # pragma: no cover - must never run
            raise AssertionError("a model was called on a free finding")

        row = plan_review.review_round(
            tmp_path, plan, SPEC, 1, workspace_root=tmp_path, dispatch=explode
        )
        assert row["outcome"] == "amend"
        assert row["model_called"] is False
        assert row["free_findings"]

    def test_a_resubmission_bounces_without_a_model_call(self, tmp_path):
        plan = _written(tmp_path, _clean_plan())
        seen = []
        first = plan_review.review_round(
            tmp_path, plan, SPEC, 1, workspace_root=tmp_path,
            dispatch=_recorder(
                "STEP: add-widget\nVERDICT: amend\n"
                "FIELDS: evidence_contract\nWHY: proof would pass anyway.\n\n"
                "STEP: rename-knob\nVERDICT: approve\n"
                "FIELDS:\nWHY: fine.",
                seen,
            ),
        )
        assert first["outcome"] == "amend"
        assert first["objected_field_digests"]

        def explode(*a, **k):  # pragma: no cover - must never run
            raise AssertionError("a model was called on a resubmission")

        # The same plan again: nothing the reviewer objected to moved.
        second = plan_review.review_round(
            tmp_path, plan, SPEC, 1, workspace_root=tmp_path, dispatch=explode
        )
        assert second["outcome"] == "bounced"
        assert second["model_called"] is False

        # Touching the objected field earns a model call again.
        revised = json.loads(json.dumps(plan))
        revised["steps"][0]["evidence_contract"].append(
            {"description": "a real falsifier", "kind": "deterministic"}
        )
        revised = _written(tmp_path, revised)
        third = plan_review.review_round(
            tmp_path, revised, SPEC, 1, workspace_root=tmp_path,
            dispatch=_recorder(
                _approve_all("add-widget",
                             "rename-knob"),
                seen,
            ),
        )
        assert third["outcome"] == "approved"
        assert third["model_called"] is True

    def test_a_high_risk_flag_routes_to_the_premium_model(self, tmp_path):
        spec = SPEC.replace(
            "Rename the knob in `docs/knobs.md`.",
            "Rename the knob in `pyproject.toml`.",
        )
        plan = _written(tmp_path, _plan([
            _step("add-widget",
                  ["ai_router/widget.py"]),
            _step("rename-knob", ["pyproject.toml"]),
        ]))
        seen = []
        row = plan_review.review_round(
            tmp_path, plan, spec, 1, workspace_root=tmp_path,
            dispatch=_recorder(
                _approve_all("add-widget",
                             "rename-knob"),
                seen,
            ),
        )
        assert seen == [plan_review.ROLE_PLAN_REVIEW_ESCALATED]
        assert row["escalation_triggers"] == ["high-risk-flag"]

    def test_two_rejected_revisions_escalate_and_record_the_trigger(
        self, tmp_path
    ):
        objection = (
            "STEP: add-widget\nVERDICT: amend\n"
            "FIELDS: intent\nWHY: two things at once.\n\n"
            "STEP: rename-knob\nVERDICT: approve\n"
            "FIELDS:\nWHY: fine."
        )
        seen = []
        for attempt in range(2):
            plan = _written(tmp_path, _plan([
                _step("add-widget",
                      ["ai_router/widget.py"], intent=f"Do it {attempt}."),
                _step("rename-knob", ["docs/knobs.md"]),
            ]))
            row = plan_review.review_round(
                tmp_path, plan, SPEC, 1, workspace_root=tmp_path,
                dispatch=_recorder(objection, seen),
            )
            assert row["escalation_triggers"] == []
        assert seen == [plan_review.ROLE_PLAN_REVIEW, plan_review.ROLE_PLAN_REVIEW]

        plan = _written(tmp_path, _plan([
            _step("add-widget",
                  ["ai_router/widget.py"], intent="Do one thing."),
            _step("rename-knob", ["docs/knobs.md"]),
        ]))
        third = plan_review.review_round(
            tmp_path, plan, SPEC, 1, workspace_root=tmp_path,
            dispatch=_recorder(
                _approve_all("add-widget",
                             "rename-knob"),
                seen,
            ),
        )
        assert third["escalation_triggers"] == ["repeat-objection"]
        assert seen[-1] == plan_review.ROLE_PLAN_REVIEW_ESCALATED
        assert third["reviewer"]["role"] == (
            plan_review.ROLE_PLAN_REVIEW_ESCALATED
        )

    def test_a_malformed_recorded_row_is_refused_not_skipped(self, tmp_path):
        plan_review.review_path(tmp_path).write_text(
            json.dumps({"schema_version": 1, "round": 1}) + "\n",
            encoding="utf-8",
        )
        with pytest.raises(plan_review.PlanReviewError):
            plan_review.read_rounds(tmp_path)


class TestAmendments:
    def _approved(self, tmp_path):
        _written(tmp_path, _clean_plan())
        return approve_plan(tmp_path)

    def test_only_the_amended_step_is_re_checked(self, tmp_path):
        self._approved(tmp_path)
        prompts = []

        def dispatch(prompt, *, role, session_set, session_number, transport):
            prompts.append(prompt)
            return _Result(_approve_all("add-widget"))

        row, plan = plan_review.review_amendment(
            tmp_path, SPEC, 1, step_id="add-widget",
            reason="the widget needs its own config",
            added_files=["ai_router/widget_config.py"],
            workspace_root=tmp_path, dispatch=dispatch,
        )
        assert row["outcome"] == plan_review.OUTCOME_APPROVED
        assert row["reviewed_steps"] == ["add-widget"]
        assert [v["step_id"] for v in row["step_verdicts"]] == ["add-widget"]
        # The unchanged step is not in the prompt: re-approving what was
        # already approved is the ceremony this design spends less of.
        assert "add-widget" in prompts[0]
        assert "STEP: rename-knob" not in prompts[0]
        assert plan["amendments"][0]["added_files"] == [
            "ai_router/widget_config.py"
        ]
        assert effective_plan(plan)["steps"][0]["file_envelope"] == [
            "ai_router/widget.py", "ai_router/widget_config.py"
        ]

    def test_a_rejected_amendment_leaves_the_plan_alone(self, tmp_path):
        approved = self._approved(tmp_path)
        objection = (
            "STEP: add-widget\nVERDICT: amend\nFIELDS: evidence_contract\n"
            "WHY: nothing here would fail if the step were done wrong."
        )
        row, plan = plan_review.review_amendment(
            tmp_path, SPEC, 1, step_id="add-widget", reason="widen it",
            added_files=["ai_router/widget_config.py"],
            workspace_root=tmp_path, dispatch=_recorder(objection, []),
        )
        assert row["outcome"] == plan_review.OUTCOME_AMEND
        assert plan is None
        on_disk = read_plan(tmp_path)
        assert on_disk["amendments"] == []
        assert on_disk["plan_hash"] == approved["plan_hash"]

    def test_an_amendment_that_reaches_a_sensitive_path_escalates(
        self, tmp_path
    ):
        # Risk is re-derived from the widened envelope, so a supervisor
        # cannot amend its way past the review its own risk earns.
        self._approved(tmp_path)
        seen = []
        row, _ = plan_review.review_amendment(
            tmp_path, SPEC, 1, step_id="add-widget",
            reason="the widget reads the router config",
            added_files=["router-config.yaml"],
            workspace_root=tmp_path,
            dispatch=_recorder(_approve_all("add-widget"), seen),
        )
        assert seen == [plan_review.ROLE_PLAN_REVIEW_ESCALATED]
        assert row["escalation_triggers"] == ["high-risk-flag"]

    def test_an_amendment_must_carry_a_change(self, tmp_path):
        self._approved(tmp_path)
        with pytest.raises(ValueError, match="must carry a change"):
            plan_review.review_amendment(
                tmp_path, SPEC, 1, step_id="add-widget", reason="just because",
            )

