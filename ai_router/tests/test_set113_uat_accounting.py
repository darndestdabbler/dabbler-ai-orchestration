"""Tests for the Set 113 S1 UAT accounting — record shape and inventory gate.

Set 111 S4 shipped a binary ``disposition.uat.status`` of
``walked | waived``. The operator retired it on 2026-08-10: a flag that
can always be bypassed — and always should be, to prevent impasses — is
not a requirement, and *"did UAT happen"* is the wrong question. The
right one is what **each component** got and from whom, because a session
touching five components may legitimately have five different answers.

Two mechanisms replace it, and they are tested separately because they
fail differently:

* :func:`disposition.validate_disposition` owns the **record shape** —
  facts only, a closed reviewer vocabulary, a closed component key set.
  It never reads ``spec.md``.
* :func:`gate_checks.check_uat_walk_recorded` owns **coverage** against
  the spec's declared ``uatComponents`` inventory. This is the
  load-bearing half. Consult round 3 named the failure it prevents: a
  gate that merely validates whatever records exist makes *an omitted
  component the new form of evaporation*, because the disposition would
  then declare both the question and the answer and could never disagree
  with itself.

Both halves carry falsifiers that PLANT the violation and assert the
refusal, plus the legitimate look-alike that must still pass (L-112-1) —
a gate that matches nothing looks identical to one that finds nothing.
"""

from __future__ import annotations

import pathlib
from pathlib import Path

import pytest

import json

import jsonschema

import gate_checks
from disposition import (
    UAT_METHODS,
    UAT_METHODS_ABSTAINED,
    UAT_METHODS_PERFORMED,
    UAT_REVIEWER_TYPES,
    _validate_uat_block,
    validate_disposition,
)
from spec_config import _parse_uat_components, parse_session_set_config
from test_set111_close_gates import _disp, _make_set


# ---------------------------------------------------------------------------
# Record-shape helpers
# ---------------------------------------------------------------------------


def _base(uat: dict) -> dict:
    """A minimal valid disposition carrying ``uat``.

    Every shape test asserts on the ``uat.*`` errors specifically, so the
    surrounding fields only have to be legal enough not to add noise.
    """
    return {
        "status": "completed",
        "summary": "s",
        "verification_method": "api",
        "files_changed": [],
        "verification_message_ids": [],
        "next_orchestrator": None,
        "blockers": [],
        "uat": uat,
    }


def _uat_errors(uat: dict) -> list:
    _passed, errors = validate_disposition(_base(uat))
    return [e for e in errors if "uat" in e]


def _performed(component: str = "Work Explorer", **over) -> dict:
    record = {
        "component": component,
        "method": "manual-walkthrough",
        "reviewers": [{"type": "developer", "count": 1}],
    }
    record.update(over)
    return record


def _abstained(component: str = "Work Explorer", **over) -> dict:
    record = {
        "component": component,
        "method": "none",
        "attestation": "no reviewer was available before the release",
    }
    record.update(over)
    return record


def _block(*components: dict) -> dict:
    return {
        "attestation": "operator reviewed the accounting 2026-08-15",
        "components": list(components),
    }


# ---------------------------------------------------------------------------
# The record shape
# ---------------------------------------------------------------------------


class TestRecordShape:
    def test_a_performed_review_with_reviewers_passes(self):
        assert _uat_errors(_block(_performed())) == []

    @pytest.mark.parametrize("method", UAT_METHODS_PERFORMED)
    def test_every_performed_method_is_accepted(self, method):
        assert _uat_errors(_block(_performed(method=method))) == []

    @pytest.mark.parametrize("method", UAT_METHODS_ABSTAINED)
    def test_every_abstained_method_passes_with_an_attestation(self, method):
        """"No UAT" is a valid, attested, PASSING value.

        This is the operator's ruling of 2026-08-10 in executable form,
        and it is the case most likely to regress into a refusal by
        someone tightening the gate later: nothing here blocks on how
        much UAT was done, only on whether an answer was given.
        """
        record = _abstained(method=method)
        assert _uat_errors(_block(record)) == []

    @pytest.mark.parametrize("method", UAT_METHODS_ABSTAINED)
    def test_an_abstention_without_an_attestation_fails(self, method):
        """The passing-none path has exactly one obligation: say why.

        Without it, ``none`` decays back into an absence with a default
        value standing in front of it — which is the evaporation the
        whole mechanism exists to close.
        """
        record = _abstained(method=method)
        del record["attestation"]
        errors = _uat_errors(_block(record))
        assert any("attestation" in e for e in errors), errors

    def test_an_abstention_listing_reviewers_fails(self):
        record = _abstained(reviewers=[{"type": "developer", "count": 1}])
        errors = _uat_errors(_block(record))
        assert any("no reviewers" in e for e in errors), errors

    def test_a_performed_method_without_reviewers_fails(self):
        record = _performed()
        del record["reviewers"]
        errors = _uat_errors(_block(record))
        assert any("reviewers" in e for e in errors), errors

    def test_an_unknown_method_fails(self):
        errors = _uat_errors(_block(_performed(method="glanced-at-it")))
        assert any("method must be one of" in e for e in errors), errors

    def test_a_missing_attestation_on_the_block_fails(self):
        block = _block(_performed())
        del block["attestation"]
        errors = _uat_errors(block)
        assert any("uat.attestation" in e for e in errors), errors

    def test_components_must_be_a_list(self):
        errors = _uat_errors(
            {"attestation": "a", "components": {"component": "x"}}
        )
        assert any("must be a list" in e for e in errors), errors

    def test_a_duplicate_component_fails(self):
        """One component gets one record, so two different answers for the
        same component can never both be true."""
        errors = _uat_errors(_block(_performed(), _abstained()))
        assert any("repeats component" in e for e in errors), errors

    def test_the_operators_worked_example_passes(self):
        """The allocation the binary could not express, recorded.

        One developer watches walkthroughs of the low-risk components and
        performs a manual walkthrough of the high-risk one — the
        operator's own 2026-08-10 example of a rational allocation of a
        scarce reviewer.
        """
        block = _block(
            _performed(
                "Static index",
                method="watched",
                reviewers=[{"type": "developer", "count": 1}],
            ),
            _performed(
                "Windows recorder",
                method="manual-walkthrough",
                reviewers=[{"type": "developer", "count": 1}],
                findings=["chapter markers drifted by about a second"],
            ),
            _abstained("Caption renderer"),
        )
        assert _uat_errors(block) == []

    def test_several_independent_business_users_are_expressible(self):
        block = _block(
            _performed(
                method="systematic-exploration",
                reviewers=[
                    {"type": "business-user", "count": 4},
                    {"type": "developer", "count": 1},
                ],
            )
        )
        assert _uat_errors(block) == []


class TestRetiredBinary:
    def test_the_retired_status_key_is_refused_by_name(self):
        """A stranded reader must not be left guessing why last month's
        shape stopped working."""
        block = _block(_performed())
        block["status"] = "walked"
        errors = _uat_errors(block)
        assert any("uat.status was removed" in e for e in errors), errors
        assert any("uat.components" in e for e in errors), errors


class TestNoScoresFalsifier:
    """L-112-1: plant the violation, then plant the legitimate look-alike."""

    @pytest.mark.parametrize(
        "smuggled",
        [
            {"confidence": 0.8},
            {"confidenceScore": "medium"},
            {"debt": "high"},
            {"riskLevel": 3},
            {"marginalConfidence": "medium"},
        ],
    )
    def test_a_self_assessed_score_cannot_be_recorded(self, smuggled):
        """All three consult rounds and the operator agreed to keep scores
        out. A closed key set is what makes that structural: there is no
        spelling of a score this record accepts, so adding one has to be a
        deliberate edit to the vocabulary rather than a field somebody
        slipped into a JSON blob."""
        errors = _uat_errors(_block(_performed(**smuggled)))
        assert any("unknown key" in e for e in errors), errors

    def test_the_legitimate_lookalike_still_passes(self):
        """The rule is "no score FIELD", not "no mention of confidence".

        A finding written in prose that happens to use the word is a fact
        a reviewer reported, and refusing it would be the gate matching
        the wrong thing.
        """
        block = _block(
            _performed(
                findings=[
                    "low confidence in the occlusion path; only tried once"
                ],
                evidence=[],
            )
        )
        assert _uat_errors(block) == []


class TestReviewerVocabularyFalsifier:
    @pytest.mark.parametrize(
        "ai_type",
        ["ai-agent", "ai", "agent", "llm", "claude", "AI-Agent"],
    )
    def test_no_ai_reviewer_type_is_accepted(self, ai_type):
        """Spec decision 9 and consult round 3: agent-driven exploration is
        not UAT and must never count as a human reviewer. A closed
        vocabulary is the only version of that rule a schema can enforce."""
        errors = _uat_errors(
            _block(_performed(reviewers=[{"type": ai_type, "count": 1}]))
        )
        assert any("type must be one of" in e for e in errors), errors

    @pytest.mark.parametrize("human_type", UAT_REVIEWER_TYPES)
    def test_every_human_reviewer_type_is_accepted(self, human_type):
        errors = _uat_errors(
            _block(_performed(reviewers=[{"type": human_type, "count": 2}]))
        )
        assert errors == []

    @pytest.mark.parametrize("bad_count", [0, -1, "2", 1.5, None, True])
    def test_a_count_that_is_not_a_positive_integer_fails(self, bad_count):
        """``True`` is in this list deliberately: bool is an int subclass,
        so an unguarded check would read it as a count of 1."""
        errors = _uat_errors(
            _block(
                _performed(
                    reviewers=[{"type": "developer", "count": bad_count}]
                )
            )
        )
        assert any("count must be an integer" in e for e in errors), errors

    def test_an_unknown_reviewer_key_fails(self):
        errors = _uat_errors(
            _block(
                _performed(
                    reviewers=[
                        {"type": "developer", "count": 1, "confidence": 0.9}
                    ]
                )
            )
        )
        assert any("unknown key" in e for e in errors), errors


class TestEvidenceAndFindingsShape:
    @pytest.mark.parametrize("key", ["evidence", "findings"])
    def test_must_be_a_list_of_strings(self, key):
        errors = _uat_errors(_block(_performed(**{key: "a string"})))
        assert any(f".{key} must be a list of strings" in e for e in errors)

    @pytest.mark.parametrize("key", ["evidence", "findings"])
    def test_absent_is_fine(self, key):
        record = _performed()
        record.pop(key, None)
        assert _uat_errors(_block(record)) == []


# ---------------------------------------------------------------------------
# The inventory gate — the load-bearing half
# ---------------------------------------------------------------------------


class TestInventoryGate:
    def test_an_armed_set_with_no_declared_inventory_is_refused(
        self, tmp_path
    ):
        """The gate's own precondition, checked before anything else.

        Defaulting a missing inventory to "nothing is in scope" would
        disarm the gate at precisely the point where the author was least
        deliberate — so the refusal names the fix instead.
        """
        set_dir = _make_set(tmp_path / "r", components=None)
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat=_block(_abstained()))
        )
        assert not passed
        assert "uatComponents" in remediation

    def test_a_non_final_session_is_not_blocked_by_a_missing_inventory(
        self, tmp_path
    ):
        """Scope still decides WHICH sessions owe an accounting.

        Set 113's own Session 1 is this case: the set declares
        ``uatScope: per-set``, so a mid-set session must not be refused
        over an inventory only the final session will be asked for.
        """
        set_dir = _make_set(
            tmp_path / "r", components=None, current=1, total=4
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert passed, remediation

    def test_an_explicitly_empty_inventory_passes_with_an_empty_accounting(
        self, tmp_path
    ):
        """The operator's "no UI component at all -> zero marginal
        confidence" row. It is a real answer and it passes."""
        set_dir = _make_set(tmp_path / "r", components=[])
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat={
                    "attestation": "no human-observable surface in this set",
                    "components": [],
                }
            ),
        )
        assert passed, remediation

    def test_an_empty_inventory_still_requires_the_block(self, tmp_path):
        """Empty is something the author SAID; it is not permission to say
        nothing at all."""
        set_dir = _make_set(tmp_path / "r", components=[])
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert not passed
        assert "disposition.uat is absent" in remediation

    def test_an_omitted_component_is_refused_and_named(self, tmp_path):
        """The falsifier for the whole design.

        Consult round 3: a gate that merely validates whatever records
        exist makes an omitted component the new form of evaporation.
        Plant exactly that — a well-formed, internally consistent
        accounting that is simply missing one declared component.
        """
        set_dir = _make_set(
            tmp_path / "r", components=["Work Explorer", "Static index"]
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat=_block(_performed("Work Explorer"))),
        )
        assert not passed
        assert "Static index" in remediation

    def test_the_complete_accounting_of_the_same_inventory_passes(
        self, tmp_path
    ):
        """The legitimate look-alike for the test above — same set, same
        shape, one more record."""
        set_dir = _make_set(
            tmp_path / "r", components=["Work Explorer", "Static index"]
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat=_block(
                    _performed("Work Explorer"),
                    _abstained("Static index"),
                )
            ),
        )
        assert passed, remediation

    def test_an_abstention_satisfies_the_inventory(self, tmp_path):
        """Coverage is the obligation; effort is not. A component whose
        answer is "nobody looked" is fully accounted for."""
        set_dir = _make_set(
            tmp_path / "r", components=["Work Explorer", "Static index"]
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat=_block(
                    _abstained("Work Explorer"),
                    _abstained("Static index"),
                )
            ),
        )
        assert passed, remediation

    def test_a_record_for_an_undeclared_component_is_refused(self, tmp_path):
        """Usually a typo — and a typo is dangerous here, because the
        mis-spelled record would otherwise sit there looking like coverage
        while the real component went unaccounted for."""
        set_dir = _make_set(tmp_path / "r", components=["Work Explorer"])
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat=_block(
                    _performed("Work Explorer"),
                    _abstained("Work Explorerr"),
                )
            ),
        )
        assert not passed
        assert "Work Explorerr" in remediation

    def test_a_misspelt_record_is_reported_as_the_missing_component(
        self, tmp_path
    ):
        """The single-typo case: the missing-component message fires first
        and names what is actually unaccounted for, which is the more
        useful of the two things wrong."""
        set_dir = _make_set(tmp_path / "r", components=["Work Explorer"])
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat=_block(_performed("Work Explorerr")))
        )
        assert not passed
        assert "Work Explorer" in remediation

    def test_the_retired_binary_does_not_satisfy_the_inventory(
        self, tmp_path
    ):
        set_dir = _make_set(tmp_path / "r", components=["Work Explorer"])
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat={"status": "walked", "attestation": "walked it"}),
        )
        assert not passed
        assert "components" in remediation


class TestEvidenceExistence:
    """What Set 111 S4's ``walkArtifact`` check bought, generalised.

    A record naming a walk file that does not exist is a FALSE record,
    and a false record is worse than a missing one because it reads as
    evidence.
    """

    def test_an_existing_evidence_file_passes(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        (set_dir / "s2-uat-walk.md").write_text("# walk\n", encoding="utf-8")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat=_block(_performed(evidence=["s2-uat-walk.md"]))),
        )
        assert passed, remediation

    def test_a_dangling_evidence_file_is_refused(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat=_block(_performed(evidence=["s2-uat-walk.md"]))),
        )
        assert not passed
        assert "do not exist" in remediation

    @pytest.mark.parametrize(
        "off_disk",
        [
            "https://contoso.sharepoint.com/sites/x/walk.mp4",
            "Team Recordings > walkthrough 0.51.0.mp4",
            "Teams channel: AI Workflow, pinned post",
        ],
    )
    def test_evidence_that_is_not_a_local_path_is_not_checked(
        self, tmp_path, off_disk
    ):
        """The operator's standing convention is that sub-minute videos are
        uploaded by hand to SharePoint or a Teams channel. A gate that went
        looking for those on disk would refuse the most likely real
        evidence this record will ever carry."""
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat=_block(_performed(evidence=[off_disk]))),
        )
        assert passed, remediation

    def test_an_existing_directory_counts_as_evidence(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        (set_dir / "walk-screens").mkdir()
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat=_block(_performed(evidence=["walk-screens"]))),
        )
        assert passed, remediation


class TestVocabularyIsClosed:
    def test_methods_partition_into_performed_and_abstained(self):
        assert set(UAT_METHODS) == set(UAT_METHODS_PERFORMED) | set(
            UAT_METHODS_ABSTAINED
        )
        assert not set(UAT_METHODS_PERFORMED) & set(UAT_METHODS_ABSTAINED)

    def test_no_reviewer_type_names_a_machine(self):
        joined = " ".join(UAT_REVIEWER_TYPES).lower()
        for token in ("ai", "agent", "model", "bot", "llm"):
            assert token not in joined.split("-"), token


# ---------------------------------------------------------------------------
# Round-1 and supplementary verification regressions
#
# Five blocking findings, all real, all fixed. Four of the five were one
# underlying mistake wearing two hats: a rule enforced in one place and not
# the other, so the shape that should have been refused sailed through the
# path nobody was looking at. The corpus test at the end attacks that CLASS
# rather than the five reported instances (G-008).
# ---------------------------------------------------------------------------


class TestInventoryParserFailsTowardDeclaringMore:
    """Round 1 found TWO Criticals here, and they were the same error.

    The first parser terminated its scan on INDENTATION, so both a valid
    indentationless sequence and a comment line between entries silently
    produced a SHORTER inventory than the author wrote. A short inventory
    is the worst possible failure for this feature: the close gate passes
    while a declared component goes unaccounted for. Every ambiguity here
    must resolve toward declaring MORE.
    """

    def test_an_indentationless_sequence_is_a_real_inventory(self):
        """CRITICAL (round 1). `- item` flush with the key is valid YAML and
        is what most YAML emitters write. It used to parse as ()."""
        assert _parse_uat_components(
            "uatComponents:\n- Work Explorer\n- Static index\n"
        ) == ("Work Explorer", "Static index")

    def test_a_comment_between_entries_does_not_truncate(self):
        """CRITICAL (round 1). The scan used to stop at the first
        comment-only line and return everything before it."""
        assert _parse_uat_components(
            "uatComponents:\n  - A\n  # why B matters\n  - B\n"
        ) == ("A", "B")

    def test_a_comment_before_the_first_entry_does_not_empty_it(self):
        assert _parse_uat_components(
            "uatComponents:\n  # the observable surfaces\n  - A\n"
        ) == ("A",)

    def test_a_trailing_comment_is_not_part_of_the_component_name(self):
        """MAJOR (round 1), and it broke the authoring guide's own example:
        the guide annotates each entry, so the documented shape produced
        names with the comment attached and the gate then refused the clean
        name the same guide told the author to record."""
        assert _parse_uat_components(
            "uatComponents:\n  - Work Explorer tree # human-observable\n"
        ) == ("Work Explorer tree",)

    def test_a_quoted_name_may_contain_a_hash(self):
        assert _parse_uat_components(
            'uatComponents:\n  - "Sprint #4 board"\n'
        ) == ("Sprint #4 board",)

    def test_an_unspaced_hash_is_literal_not_a_comment(self):
        """YAML needs whitespace before `#` for a comment. `A#B` is a name."""
        assert _parse_uat_components("uatComponents:\n  - A#B\n") == ("A#B",)

    def test_a_bare_key_is_undeclared_not_explicitly_empty(self):
        """A bare `uatComponents:` reads as an unfinished edit, not as a
        deliberate "nothing is observable" — and the two must not be the
        same answer, because one refuses and the other passes. The
        deliberate form is one keystroke away."""
        assert _parse_uat_components("uatComponents:\nuatScope: per-set\n") is None

    def test_an_explicit_empty_list_still_declares_empty(self):
        assert _parse_uat_components("uatComponents: []") == ()

    @pytest.mark.parametrize(
        "block",
        [
            "uatComponents:\n  - A\nprerequisites:\n  - slug: x\n    condition: complete\n",
            "uatComponents:\n- A\nprerequisites:\n- slug: x\n",
        ],
        ids=["indented", "flush"],
    )
    def test_a_neighbouring_list_key_is_not_swallowed(self, block):
        """The legitimate look-alike for the two Criticals above.

        `prerequisites:` is a `- ` list too. Loosening termination from
        indentation to shape must not start absorbing it, or the gate would
        refuse the close over components nobody declared.
        """
        assert _parse_uat_components(block) == ("A",)

    def test_the_authoring_guides_own_example_parses_to_clean_names(self):
        """The documented shape has to be a working shape. This is the
        assertion that would have caught the round-1 Major."""
        guide = pathlib.Path(
            "docs/planning/session-set-authoring-guide.md"
        ).read_text(encoding="utf-8")
        start = guide.index("uatComponents:           # REQUIRED")
        assert _parse_uat_components(guide[start : start + 400]) == (
            "Work Explorer tree",
            "Static index",
        )

    def test_this_sets_own_spec_declares_its_four_components(self):
        cfg = parse_session_set_config(
            pathlib.Path(
                "docs/session-sets/113-narrated-video-walkthroughs/spec.md"
            )
        )
        assert cfg.uat_components is not None
        assert len(cfg.uat_components) == 4
        assert all("#" not in c for c in cfg.uat_components)


class TestValidatorAndSchemaAgree:
    """Round 1 (Major) and supplementary (Major): two validators
    disagreeing about one file.

    The first version closed the COMPONENT record's key set while leaving
    the block around it open, and tested abstained `reviewers` for
    truthiness rather than presence and type. Both let a shape pass the
    Python validator that `disposition.schema.json` rejects — so a consumer
    running schema-based CI and a consumer running the router got opposite
    answers during an explicitly breaking migration.
    """

    @pytest.fixture(scope="class")
    def uat_validator(self):
        schema = json.loads(
            pathlib.Path(
                "ai_router/schemas/disposition.schema.json"
            ).read_text(encoding="utf-8")
        )
        sub = {"$defs": schema["$defs"], **schema["properties"]["uat"]}
        return jsonschema.validators.validator_for(sub)(sub)

    def test_a_top_level_confidence_score_is_refused(self):
        """The closed component record was pointless while the block above
        it would take any key at all."""
        errors = _validate_uat_block(
            {"attestation": "a", "components": [], "confidence": 0.8}
        )
        assert any("unknown key" in e for e in errors), errors

    def test_a_stale_walkartifact_is_refused_by_name(self):
        """The likeliest Set 111 migration residue."""
        errors = _validate_uat_block(
            {"attestation": "a", "components": [], "walkArtifact": "s1.md"}
        )
        assert any("walkArtifact" in e for e in errors), errors

    @pytest.mark.parametrize("null_ish", [None, False, 0, {}, "none"])
    def test_an_abstention_with_a_non_list_reviewers_is_refused(
        self, null_ish
    ):
        """`reviewers: null` is what a nullable-field serializer emits, and
        a truthiness test waves it straight through."""
        errors = _validate_uat_block(
            _block(_abstained(reviewers=null_ish))
        )
        assert any("reviewers" in e for e in errors), errors

    @pytest.mark.parametrize("permitted", [[], None])
    def test_an_abstention_may_omit_reviewers_or_pass_an_empty_list(
        self, permitted
    ):
        """The legitimate look-alike. Tightening must not start refusing
        the two shapes the schema actually accepts."""
        record = _abstained()
        if permitted is not None:
            record["reviewers"] = permitted
        assert _uat_errors(_block(record)) == []

    # The corpus. Every shape either validator has an opinion about, run
    # through BOTH. This is the class-level falsifier: it fails on any
    # future rule added to one path and not the other, which is the actual
    # bug, rather than on the five instances that happened to be reported.
    CORPUS = [
        ("empty inventory accounting", {"attestation": "a", "components": []}),
        ("retired status", {"status": "walked", "attestation": "a"}),
        (
            "top-level confidence",
            {"attestation": "a", "components": [], "confidence": 0.8},
        ),
        (
            "stale walkArtifact",
            {"attestation": "a", "components": [], "walkArtifact": "s1.md"},
        ),
        ("missing attestation", {"components": []}),
        ("performed, valid", _block(_performed())),
        ("performed, no reviewers", _block(_performed(reviewers=[]))),
        ("performed, null reviewers", _block(_performed(reviewers=None))),
        (
            "performed, ai reviewer",
            _block(_performed(reviewers=[{"type": "ai-agent", "count": 1}])),
        ),
        (
            "performed, zero count",
            _block(_performed(reviewers=[{"type": "developer", "count": 0}])),
        ),
        (
            "performed, bool count",
            _block(_performed(reviewers=[{"type": "developer", "count": True}])),
        ),
        ("abstained, valid", _block(_abstained())),
        ("abstained, no attestation", _block({"component": "x", "method": "none"})),
        ("abstained, null reviewers", _block(_abstained(reviewers=None))),
        ("abstained, empty reviewers", _block(_abstained(reviewers=[]))),
        (
            "abstained, real reviewers",
            _block(_abstained(reviewers=[{"type": "developer", "count": 1}])),
        ),
        ("component confidence", _block(_abstained(confidence=0.8))),
        ("unknown method", _block(_performed(method="glanced-at-it"))),
        ("evidence not a list", _block(_performed(evidence="s1.md"))),
        ("findings not a list", _block(_performed(findings="fine"))),
        ("component empty", _block(_performed(component=""))),
    ]

    @pytest.mark.parametrize(
        "label, block", CORPUS, ids=[c[0] for c in CORPUS]
    )
    def test_python_and_json_schema_reach_the_same_verdict(
        self, uat_validator, label, block
    ):
        python_accepts = not _validate_uat_block(block)
        try:
            uat_validator.validate(block)
            schema_accepts = True
        except jsonschema.ValidationError:
            schema_accepts = False
        assert python_accepts == schema_accepts, (
            f"{label}: python "
            f"{'accepts' if python_accepts else 'rejects'} but schema "
            f"{'accepts' if schema_accepts else 'rejects'}"
        )

    def test_the_corpus_is_not_vacuous(self):
        """A corpus that accidentally became all-accepting would make the
        parity test above pass while checking nothing (L-112-1)."""
        verdicts = {
            not _validate_uat_block(block) for _label, block in self.CORPUS
        }
        assert verdicts == {True, False}, (
            "the parity corpus must contain both accepted and rejected "
            "shapes, or it proves nothing"
        )


class TestInventoryGateAfterTheParserFix:
    def test_an_indentationless_inventory_still_refuses_an_omission(
        self, tmp_path
    ):
        """The end-to-end shape of round 1's first Critical: the spec
        declared two components in valid YAML, and the gate passed a
        disposition that accounted for neither."""
        set_dir = _make_set(tmp_path / "r", components=None)
        spec = set_dir / "spec.md"
        spec.write_text(
            spec.read_text(encoding="utf-8").replace(
                "requiresE2E: false",
                "requiresE2E: false\nuatComponents:\n- Work Explorer\n- Static index",
            ),
            encoding="utf-8",
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat={"attestation": "nothing observable", "components": []}),
        )
        assert not passed
        assert "Work Explorer" in remediation
        assert "Static index" in remediation

    def test_a_bare_inventory_key_is_refused_as_undeclared(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", components=None)
        spec = set_dir / "spec.md"
        spec.write_text(
            spec.read_text(encoding="utf-8").replace(
                "requiresE2E: false", "requiresE2E: false\nuatComponents:"
            ),
            encoding="utf-8",
        )
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat={"attestation": "nothing observable", "components": []}),
        )
        assert not passed
        assert "uatComponents" in remediation
