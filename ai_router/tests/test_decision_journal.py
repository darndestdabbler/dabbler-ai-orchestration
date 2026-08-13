"""Layer-1 tests for the Set 111 S3 decision journal and decision rights.

Two things are under test, and they are not the same thing:

- the **journal** round-trips (a record written is a record read back,
  with every field the rubric requires), and
- the **carve-out** is structural: a verification-reducing decision
  cannot be self-authorized, and the refusal is a refusal to *write* -
  no partial line is left behind.

No metered calls: everything is local file I/O in ``tmp_path``.
"""

import json

import pytest

from ai_router import decision_journal as dj


SET_SLUG = "111-verification-loop-and-ceremony-simplification"


def _options():
    return [
        {
            "option": "Keep the helper in utils.py",
            "consequence": "One fewer module; utils.py grows past 800 lines.",
            "reversible": True,
        },
        {
            "option": "Extract a parsers/ package",
            "consequence": "One more import surface; utils.py stays small.",
            "reversible": True,
        },
    ]


def _ai_record(**overrides):
    payload = dict(
        session_set=SET_SLUG,
        session_number=3,
        question="Where should the criterion parser live?",
        decision="Extract a parsers/ package.",
        authority="ai",
        rubric_line="simpler-code",
        options=_options(),
        reversibility="reversible",
        verification_effect="none",
    )
    payload.update(overrides)
    return dj.make_record(**payload)


# --- Round-trip ---------------------------------------------------------


def test_journal_round_trips_every_rubric_field(tmp_path):
    """A written record reads back with all six required fields intact."""
    record = _ai_record()
    path = dj.record_decision(record, session_set_dir=tmp_path)

    assert path == tmp_path / "decisions.jsonl"
    rows = dj.read_decisions(tmp_path)
    assert len(rows) == 1
    row = rows[0]

    assert row["question"] == "Where should the criterion parser live?"
    assert row["decision"] == "Extract a parsers/ package."
    assert row["authority"] == "ai"
    assert row["rubric_line"] == "simpler-code"
    assert row["reversibility"] == "reversible"
    assert row["verification_effect"] == "none"
    assert row["session_set"] == SET_SLUG
    assert row["session_number"] == 3
    assert row["timestamp"]

    # The options are the part a later auditor actually needs: what was
    # on the table, not just what was picked.
    assert [o["option"] for o in row["options"]] == [
        "Keep the helper in utils.py",
        "Extract a parsers/ package",
    ]
    assert all("consequence" in o and "reversible" in o for o in row["options"])


def test_journal_is_append_only_and_preserves_order(tmp_path):
    dj.record_decision(_ai_record(decision="First."), session_set_dir=tmp_path)
    dj.record_decision(_ai_record(decision="Second."), session_set_dir=tmp_path)
    dj.record_decision(_ai_record(decision="Third."), session_set_dir=tmp_path)

    rows = dj.read_decisions(tmp_path)
    assert [r["decision"] for r in rows] == ["First.", "Second.", "Third."]


def test_one_unreadable_line_does_not_hide_the_rest(tmp_path):
    """The journal is an audit trail; one bad line must not blind it."""
    dj.record_decision(_ai_record(decision="Good one."), session_set_dir=tmp_path)
    path = dj.journal_path_for(tmp_path)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write("{not json at all\n")
    dj.record_decision(_ai_record(decision="Good two."), session_set_dir=tmp_path)

    rows = dj.read_decisions(tmp_path)
    assert [r["decision"] for r in rows] == ["Good one.", "Good two."]


def test_missing_journal_reads_as_empty(tmp_path):
    assert dj.read_decisions(tmp_path) == []
    assert dj.uat_decide_items(tmp_path) == []


def test_uat_deferrals_are_tagged_and_filterable(tmp_path):
    """S4 assembles the UAT Decide section from this filter."""
    dj.record_decision(
        _ai_record(decision="Ordinary call."), session_set_dir=tmp_path
    )
    dj.record_decision(
        _ai_record(
            question="Should the walk open on the tree or the editor?",
            decision="Deferred: the operator sees it in the UAT walk.",
            uat_decide=True,
        ),
        session_set_dir=tmp_path,
    )

    deferred = dj.uat_decide_items(tmp_path)
    assert len(deferred) == 1
    assert deferred[0]["question"].startswith("Should the walk open")
    assert len(dj.read_decisions(tmp_path)) == 2


def test_extra_keys_survive_but_cannot_shadow_a_required_field(tmp_path):
    record = dj.make_record(
        session_set=SET_SLUG,
        session_number=3,
        question="Q?",
        decision="D.",
        authority="ai",
        rubric_line="goal-over-letter",
        options=_options(),
        reversibility="reversible",
        verification_effect="none",
        ticket="ABC-1",
    )
    dj.record_decision(record, session_set_dir=tmp_path)
    row = dj.read_decisions(tmp_path)[0]
    assert row["ticket"] == "ABC-1"
    assert row["rubric_line"] == "goal-over-letter"


def test_an_extra_cannot_overwrite_an_explicit_field():
    """The explicit field always wins; an extra can only add."""
    record = dj.DecisionRecord(
        timestamp=dj.now_iso(),
        session_set=SET_SLUG,
        session_number=3,
        question="Q?",
        decision="The real decision.",
        authority="ai",
        rubric_line="simpler-code",
        options=(dj.DecisionOption("A", "cost A", True),),
        reversibility="reversible",
        verification_effect="none",
        extra={"decision": "a shadow", "authority": "human"},
    )
    payload = record.to_dict()
    assert payload["decision"] == "The real decision."
    assert payload["authority"] == "ai"


# --- Authority routing --------------------------------------------------


def test_a_plain_judgment_call_is_ai_decidable():
    ruling = dj.classify_authority()
    assert ruling.authority == "ai"
    assert not ruling.is_human
    assert ruling.rubric_line == "goal-over-letter"


@pytest.mark.parametrize(
    "kwarg,expected_line",
    [
        ("external_consequence", "external-consequence"),
        ("value_trade_off", "value-trade-off"),
        ("accountability_sign_off", "accountability-sign-off"),
        ("reduces_verification", "verification-reduction"),
    ],
)
def test_each_human_class_routes_to_the_operator(kwarg, expected_line):
    ruling = dj.classify_authority(**{kwarg: True})
    assert ruling.is_human
    assert ruling.rubric_line == expected_line


def test_the_carve_out_is_named_first_when_several_triggers_fire():
    """The carve-out can never be delegated back, so it is the honest label."""
    ruling = dj.classify_authority(
        reduces_verification=True,
        external_consequence=True,
        value_trade_off=True,
    )
    assert ruling.rubric_line == "verification-reduction"


def test_the_tiebreaks_are_ordered_as_the_proposal_specifies():
    assert dj.AI_TIEBREAKS == (
        "goal-over-letter",
        "prefer-reversible",
        "simpler-code",
        "defer-to-existing-gate",
        "cross-provider-consensus",
        "escalate-to-human",
    )


# --- The carve-out, enforced -------------------------------------------


def test_a_verification_reducing_decision_cannot_be_self_authorized(tmp_path):
    """The spec'd refusal: routed to the rubric under AI authority -> refused."""
    record = _ai_record(
        question="Can this session run one discovery pass instead of two?",
        decision="Run a single discovery pass.",
        verification_effect="reduces",
    )
    with pytest.raises(dj.VerificationReductionRefused) as excinfo:
        dj.record_decision(record, session_set_dir=tmp_path)

    assert "operator" in str(excinfo.value).lower()
    # A refusal is a refusal to WRITE - nothing is left on disk.
    assert not dj.journal_path_for(tmp_path).exists()
    assert dj.read_decisions(tmp_path) == []


def test_a_refusal_does_not_truncate_an_existing_journal(tmp_path):
    dj.record_decision(_ai_record(decision="Kept."), session_set_dir=tmp_path)
    with pytest.raises(dj.VerificationReductionRefused):
        dj.record_decision(
            _ai_record(
                decision="Lower the remediation-review bound to one cycle.",
                verification_effect="reduces",
            ),
            session_set_dir=tmp_path,
        )
    rows = dj.read_decisions(tmp_path)
    assert [r["decision"] for r in rows] == ["Kept."]


def test_the_carve_out_rubric_line_is_refused_under_ai_authority(tmp_path):
    """Naming the carve-out line while claiming AI authority is incoherent."""
    record = _ai_record(
        rubric_line="verification-reduction",
        verification_effect="none",
        question="Who owns this?",
        decision="I do.",
    )
    with pytest.raises(dj.VerificationReductionRefused):
        dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


@pytest.mark.parametrize(
    "line", ["external-consequence", "value-trade-off", "accountability-sign-off"]
)
def test_other_human_lines_are_refused_under_ai_authority(tmp_path, line):
    with pytest.raises(ValueError):
        dj.record_decision(
            _ai_record(rubric_line=line), session_set_dir=tmp_path
        )
    assert dj.read_decisions(tmp_path) == []


def test_the_operator_may_record_a_verification_reduction_with_attestation(
    tmp_path,
):
    record = _ai_record(
        question="Can this session run one discovery pass instead of two?",
        decision="Authorized: one discovery pass for this session only.",
        authority="human",
        rubric_line="verification-reduction",
        verification_effect="reduces",
        operator_attestation=(
            "Operator, 2026-08-07: the diff is a docs-only rename; one pass."
        ),
    )
    dj.record_decision(record, session_set_dir=tmp_path)
    row = dj.read_decisions(tmp_path)[0]
    assert row["authority"] == "human"
    assert row["verification_effect"] == "reduces"
    assert row["operator_attestation"].startswith("Operator, 2026-08-07")


def test_an_operator_reduction_without_attestation_is_refused(tmp_path):
    """'The operator said so' has to name what the operator said."""
    record = _ai_record(
        authority="human",
        rubric_line="verification-reduction",
        verification_effect="reduces",
        operator_attestation="   ",
    )
    with pytest.raises(ValueError, match="operator_attestation"):
        dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


# --- The escalate-only screen ------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Skip the verification round for this session.",
        "Bypass the close backstop until Set 112.",
        "Close with --manual-verify to save a round.",
        "Lower the bound to one remediation-review cycle.",
        "Use same-provider verification because the seat is cheaper.",
    ],
)
def test_the_screen_escalates_a_careless_none_declaration(tmp_path, text):
    record = _ai_record(decision=text, verification_effect="none")
    with pytest.raises(dj.VerificationReductionRefused) as excinfo:
        dj.record_decision(record, session_set_dir=tmp_path)
    assert "never permits" in str(excinfo.value)
    assert dj.read_decisions(tmp_path) == []


def test_the_screen_only_ever_escalates_never_permits(tmp_path):
    """A wording the screen does not know still cannot slip past the guard.

    The screen is a backstop, so its incompleteness must not weaken the
    guard. Here the text is a verification reduction the proximity rule
    has no verb for; the mandatory declaration catches it anyway, because
    the caller has to state 'reduces' and 'reduces' under AI authority is
    refused outright.
    """
    exotic = "Retire the second reviewer wholesale, effective immediately."
    assert dj.screen_for_verification_reduction(exotic) is None

    with pytest.raises(dj.VerificationReductionRefused):
        dj.record_decision(
            _ai_record(decision=exotic, verification_effect="reduces"),
            session_set_dir=tmp_path,
        )
    assert dj.read_decisions(tmp_path) == []


@pytest.mark.parametrize(
    "text",
    [
        # Each of these is a spelling a literal-phrase list would have
        # had to grow an entry for. The proximity rule covers the class.
        "Bypass the close backstop until Set 112.",
        "Disable that redundant second critique.",
        "Relax the enforced discovery cap for docs-only sets.",
        "Weaken the remediation-review cycle requirement.",
        "Suppress the supplementary pass on small diffs.",
        "Turn off the verification stamp for Lightweight sets.",
        "Drop one of the two discovery passes.",
    ],
)
def test_the_proximity_rule_covers_the_class_not_a_phrase_list(text):
    assert dj.screen_for_verification_reduction(text) is not None


@pytest.mark.parametrize(
    "text",
    [
        # Tiebreak 3's own wording must not trip the screen, or the rubric
        # could not be journaled in its own vocabulary.
        "Chose the option with fewer branches and fewer tests to hold it true.",
        "Remove the dead helper so the module reads straight through.",
        "Reduce the retry ceiling from five attempts to three.",
    ],
)
def test_the_screen_leaves_ordinary_engineering_wording_alone(text):
    assert dj.screen_for_verification_reduction(text) is None


def test_the_screen_does_not_fire_on_an_ordinary_decision(tmp_path):
    record = _ai_record(
        question="Should the harness force-refresh its worktree cache?",
        decision="No: the cache is keyed by tree sha, so a stale hit is impossible.",
    )
    dj.record_decision(record, session_set_dir=tmp_path)
    assert len(dj.read_decisions(tmp_path)) == 1


def test_a_strengthening_decision_is_not_screened(tmp_path):
    """Adding verification is always in scope; only reduction is carved out."""
    record = _ai_record(
        question="Should the harness also run criteria on the supplementary round?",
        decision="Yes - one more baseline-discriminated run per finding.",
        verification_effect="strengthens",
    )
    dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path)[0]["verification_effect"] == "strengthens"


# --- Field validation ---------------------------------------------------


@pytest.mark.parametrize(
    "overrides,match",
    [
        ({"authority": "orchestrator"}, "authority must be one of"),
        ({"rubric_line": "vibes"}, "rubric_line must be one of"),
        ({"verification_effect": "maybe"}, "verification_effect must be one of"),
        ({"reversibility": "sort of"}, "reversibility must be one of"),
        ({"question": "  "}, "question must be non-empty"),
        ({"decision": ""}, "decision must be non-empty"),
        ({"options": []}, "not a decision"),
    ],
)
def test_malformed_records_are_refused(tmp_path, overrides, match):
    with pytest.raises(ValueError, match=match):
        dj.record_decision(_ai_record(**overrides), session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


def test_verification_effect_has_no_default():
    """The declaration is the primary control, so it cannot be omitted."""
    with pytest.raises(TypeError):
        dj.make_record(
            session_set=SET_SLUG,
            session_number=3,
            question="Q?",
            decision="D.",
            authority="ai",
            rubric_line="simpler-code",
            options=_options(),
            reversibility="reversible",
        )


def test_an_option_missing_a_key_is_refused():
    with pytest.raises(ValueError, match="reversible"):
        dj.make_record(
            session_set=SET_SLUG,
            session_number=3,
            question="Q?",
            decision="D.",
            authority="ai",
            rubric_line="simpler-code",
            options=[{"option": "A", "consequence": "B"}],
            reversibility="reversible",
            verification_effect="none",
        )


# --- The journal is bookkeeping, not work ------------------------------


def test_the_journal_is_registered_as_loop_bookkeeping():
    """Journaling an adjudication must not stale the round it adjudicates.

    The rubric makes waiver adjudications AI-decidable, and those happen
    after a verification round by definition. If ``decisions.jsonl``
    staled the work diff, the sanctioned flow would invalidate its own
    stamp and send the close backstop into a fresh, unbounded metered
    round.
    """
    from ai_router.verification_stamp import WORK_DIFF_SET_BOOKKEEPING

    assert dj.JOURNAL_FILENAME in WORK_DIFF_SET_BOOKKEEPING


# --- Cross-field coherence (S3 round 1, Major) -------------------------


def test_the_carve_out_line_cannot_declare_no_reduction(tmp_path):
    """Round-1 scenario 1: a carve-out record that skips the attestation.

    ``rubric_line='verification-reduction'`` with
    ``verification_effect='none'`` used to be accepted under human
    authority with NO ``operator_attestation``, because the attestation
    requirement is keyed on the declared effect. That writes a carve-out
    to the ledger with nothing attesting to it.
    """
    record = _ai_record(
        authority="human",
        rubric_line="verification-reduction",
        verification_effect="none",
        operator_attestation=None,
        question="Who authorized dropping a discovery pass?",
        decision="Dropped it.",
    )
    with pytest.raises(ValueError, match="must be\n?\\s*'reduces'|'reduces'"):
        dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


def test_an_escalation_cannot_be_recorded_as_an_ai_call(tmp_path):
    """Round-1 scenario 2: tiebreak 6 mislabelled as an AI decision.

    ``escalate-to-human`` lives in ``AI_TIEBREAKS`` (it is the sixth
    tiebreak), so the human-trigger check did not catch it. But the
    tiebreak IS the escalation: the operator decided. Recording it as
    ``[A]`` under-counts operator stops in exactly the ledger built to
    expose them.
    """
    record = _ai_record(
        rubric_line="escalate-to-human",
        authority="ai",
        question="Consensus split on the harness timeout - who decides?",
        decision="Escalated; the operator picked 120s.",
    )
    with pytest.raises(ValueError, match="authority must be 'human'"):
        dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


def test_an_escalation_recorded_as_a_human_call_is_accepted(tmp_path):
    record = _ai_record(
        rubric_line="escalate-to-human",
        authority="human",
        question="Consensus split on the harness timeout - who decides?",
        decision="Escalated; the operator picked 120s.",
    )
    dj.record_decision(record, session_set_dir=tmp_path)
    row = dj.read_decisions(tmp_path)[0]
    assert row["authority"] == "human"
    assert row["rubric_line"] == "escalate-to-human"


def test_a_human_decision_cannot_cite_an_ai_tiebreak(tmp_path):
    """If the operator decided, the record must say why they were needed."""
    record = _ai_record(authority="human", rubric_line="simpler-code")
    with pytest.raises(ValueError, match="routes to the operator"):
        dj.record_decision(record, session_set_dir=tmp_path)
    assert dj.read_decisions(tmp_path) == []


# --- Freshness exemption is not an evidence exclusion (S3 round 2) -----


def test_the_journal_is_freshness_exempt_but_stays_in_phased_evidence():
    """Round-2 scenario: suppressing the journal from review is a reduction.

    Freshness-exemption and evidence-exclusion are different questions.
    A record ABOUT the work can be exempt from staling a stamp, because
    the work it describes binds on its own. It must NOT be exempt from
    the verifier's evidence: the AI-authority decision record is exactly
    what a reviewer should read, and suppressing it is a verification
    reduction no orchestrator may self-authorize.
    """
    from ai_router.verification_stamp import (
        EVIDENCE_VISIBLE_BOOKKEEPING,
        PHASED_EVIDENCE_SET_EXCLUDES,
        WORK_DIFF_SET_BOOKKEEPING,
    )

    assert dj.JOURNAL_FILENAME in WORK_DIFF_SET_BOOKKEEPING
    assert dj.JOURNAL_FILENAME in EVIDENCE_VISIBLE_BOOKKEEPING
    assert dj.JOURNAL_FILENAME not in PHASED_EVIDENCE_SET_EXCLUDES


def test_the_two_lists_differ_only_by_the_visible_entries():
    """Derived, not hand-maintained, so shared entries cannot drift (L-069-1)."""
    from ai_router.verification_stamp import (
        EVIDENCE_VISIBLE_BOOKKEEPING,
        PHASED_EVIDENCE_SET_EXCLUDES,
        WORK_DIFF_SET_BOOKKEEPING,
    )

    assert set(WORK_DIFF_SET_BOOKKEEPING) - set(PHASED_EVIDENCE_SET_EXCLUDES) == set(
        EVIDENCE_VISIBLE_BOOKKEEPING
    )
    # Every other loop artifact stays excluded from phased evidence.
    for name in ("s*-verification*.md", "s*-issues*.json", "s*-rounds.jsonl"):
        assert name in PHASED_EVIDENCE_SET_EXCLUDES


def test_phased_evidence_actually_uses_the_evidence_list_not_the_freshness_one():
    """The consumer must be wired to the right constant, not just defined.

    Defining ``PHASED_EVIDENCE_SET_EXCLUDES`` and leaving the evidence
    bundle pointed at the freshness list would reproduce the exact defect
    with a new name, and every other test here would still pass.

    Set 128 S2 moved the wiring out of ``run`` and into
    ``build_phase_round_inputs``, the single phase assembly the CLI and
    the close backstop now share. The assertion follows the wiring rather
    than the old address: checking the assembly is strictly more precise,
    because it is the only place either caller can get its exclusions
    from. ``run`` is still checked for the WRONG constant, so pointing it
    back at the freshness list would still fail.
    """
    import inspect

    from ai_router import verify_session as vs

    assembly = inspect.getsource(vs.build_phase_round_inputs)
    assert "PHASED_EVIDENCE_SET_EXCLUDES" in assembly
    assert "WORK_DIFF_SET_BOOKKEEPING" not in assembly
    assert "WORK_DIFF_SET_BOOKKEEPING" not in inspect.getsource(vs.run)


# --- CLI ----------------------------------------------------------------


def test_cli_rubric_needs_no_session_set_dir(capsys):
    assert dj.main(["--rubric"]) == 0
    out = capsys.readouterr().out
    assert "verification-reduction" in out
    assert "cross-provider-consensus" in out


def test_cli_requires_a_set_dir_outside_rubric_mode(capsys):
    assert dj.main([]) == 2
    assert "--session-set-dir" in capsys.readouterr().out


def test_cli_appends_and_lists(tmp_path, capsys):
    payload = json.dumps(
        {
            "session_set": SET_SLUG,
            "session_number": 3,
            "question": "Where does the parser live?",
            "decision": "In parsers/.",
            "authority": "ai",
            "rubric_line": "simpler-code",
            "options": _options(),
            "reversibility": "reversible",
            "verification_effect": "none",
        }
    )
    assert dj.main(
        ["--session-set-dir", str(tmp_path), "--append-json", payload]
    ) == 0
    capsys.readouterr()

    assert dj.main(["--session-set-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "[A]" in out
    assert "In parsers/." in out


def test_cli_refuses_a_self_authorized_reduction_with_exit_5(tmp_path, capsys):
    payload = json.dumps(
        {
            "session_set": SET_SLUG,
            "session_number": 3,
            "question": "Fewer rounds?",
            "decision": "Run one discovery pass.",
            "authority": "ai",
            "rubric_line": "simpler-code",
            "options": _options(),
            "reversibility": "reversible",
            "verification_effect": "reduces",
        }
    )
    assert dj.main(
        ["--session-set-dir", str(tmp_path), "--append-json", payload]
    ) == 5
    assert "REFUSED" in capsys.readouterr().out
    assert dj.read_decisions(tmp_path) == []


def test_cli_uat_filter(tmp_path, capsys):
    dj.record_decision(
        _ai_record(decision="Ordinary."), session_set_dir=tmp_path
    )
    dj.record_decision(
        _ai_record(decision="Deferred to the walk.", uat_decide=True),
        session_set_dir=tmp_path,
    )
    assert dj.main(
        ["--session-set-dir", str(tmp_path), "--uat-decide-only"]
    ) == 0
    out = capsys.readouterr().out
    assert "Deferred to the walk." in out
    assert "Ordinary." not in out
    assert "[UAT]" in out


def test_cli_rejects_non_object_json(tmp_path, capsys):
    assert dj.main(
        ["--session-set-dir", str(tmp_path), "--append-json", "[1, 2]"]
    ) == 2
    assert "JSON object" in capsys.readouterr().out
