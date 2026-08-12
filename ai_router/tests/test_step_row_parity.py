"""Set 114 S3 — the Python half of the cross-language step-row parity gate.

**Who uses this:** CI and the full-pytest close gate.
**See also:** ``ai_router/tests/fixtures/session-step-parity.json`` (the
corpus, whose ``_readme`` explains the mechanism);
``tools/dabbler-ai-orchestration/src/test/suite/sessionStepModel.test.ts``
(the TypeScript half, asserting the same corpus).

---

Session 3 renders an in-flight session's steps in the Work Explorer. The
Explorer is TypeScript and this checklist is Python, so the rule that
decides which rows exist now has two implementations — the
duplicate-parser defect this repo repeats most (L-069-1), taken
deliberately and recorded in ``decisions.jsonl``.

The mitigation Set 114 S2's routed ``ai-assignment.md`` named is a shared
fixture that proves the two agree row-for-row. This file is one of its two
halves: it drives the REAL :func:`session_checklist.build_rows` and
:func:`session_checklist.read_spec_steps` — through the on-disk path, not
a hand-fed list — against the corpus's expectations.

Neither language owns the corpus. Change Python alone and this fails;
change TypeScript alone and its test fails; change the corpus alone and
both fail.

One removal, finished (Sets 120 S3 + 115 S4)
--------------------------------------------
The corpus used to carry an ``isHere`` field that only one language
produced. The operator ruled the ``<- here`` marker out on 2026-08-11;
Set 120 S3 removed ``session_checklist._mark_here`` and
``ChecklistRow.is_here`` but could not touch the extension (its standing
decision 3), so the corpus kept the field for the TypeScript half alone
and this docstring declared the divergence.

Set 115 S4 finished it: ``markHere``, the ``isHere`` field and the tree's
``HERE_MARKER`` are gone, the corpus no longer carries the field, and
both halves compare the same five fields again.

One field-set split, opened and closed (Sets 127 S1 + S2)
---------------------------------------------------------
Set 127 S1 derived two new facts onto ``ChecklistRow`` — the active step
and each started row's start time — with the TypeScript mirror scheduled
for Session 2. That was a one-session window in which Python had fields
the extension did not, so the split was declared (``SHARED_ROW_FIELDS``
versus a ``DERIVED_ROW_FIELDS`` tuple) rather than left implicit, and a
test proved the undeclared fields were provably INERT on every case here:
the corpus modelled no ``session-state.json`` and no entry ``dateTime``,
so both derived to their null answer.

Session 2 closed it, exactly as that test's docstring said it would.
The corpus now carries both inputs (a case may declare ``sessionState``,
and an entry may carry ``dateTime``), the mirror produces both fields,
and they are compared in both languages like every other field. There is
one field set again, and ``DERIVED_ROW_FIELDS`` is gone with the window
it described.
"""

from __future__ import annotations

import dataclasses
import json
import os
from typing import Dict, List

import pytest

from ai_router import session_checklist


FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "fixtures",
    "session-step-parity.json",
)


def _load_corpus() -> List[dict]:
    with open(FIXTURE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)["cases"]


CASES = _load_corpus()
CASE_IDS = [c["name"] for c in CASES]

#: Every row field the corpus pins, in BOTH languages — the RECORD half of
#: a row (what ``build_rows`` reads off the ledger) plus the DERIVED half
#: (what it computes from those rows and ``session-state.json``). A field
#: added to ``ChecklistRow`` and not declared here silently stops being
#: compared, so :func:`test_the_shared_fields_are_the_whole_python_row`
#: pins this tuple against the dataclass itself.
SHARED_ROW_FIELDS = (
    "stepNumber",
    "stepKey",
    "description",
    "status",
    "isPlanned",
    "isActive",
    "startedAt",
)


def _materialize(case: dict, tmp_path) -> str:
    """Write *case* to a session-set directory and return its path.

    ``sessionState`` is written only when the case declares one, and its
    ABSENCE is a modelled case rather than a gap: an absent (or
    unreadable) ``session-state.json`` is what a legacy or mid-scaffold
    set really has, and both languages must answer it with no derivation
    at all.
    """
    set_dir = tmp_path / case["name"]
    set_dir.mkdir(parents=True, exist_ok=True)
    (set_dir / "spec.md").write_text(case["specMarkdown"], encoding="utf-8")
    log = {
        "sessionSetName": case["name"],
        "createdDate": "2026-08-10T00:00:00-04:00",
        "totalSessions": 3,
        "entries": case["entries"],
    }
    with open(set_dir / "activity-log.json", "w", encoding="utf-8") as fh:
        json.dump(log, fh, indent=2)
    if case.get("sessionState") is not None:
        with open(set_dir / "session-state.json", "w", encoding="utf-8") as fh:
            json.dump(case["sessionState"], fh, indent=2)
    return str(set_dir)


def _as_dict(row: session_checklist.ChecklistRow) -> Dict[str, object]:
    return {
        "stepNumber": row.step_number,
        "stepKey": row.step_key,
        "description": row.description,
        "status": row.status,
        "isPlanned": row.is_planned,
        "isActive": row.is_active,
        "startedAt": row.started_at,
    }


def _shared(expected: dict) -> Dict[str, object]:
    """*expected* restricted to the fields both implementations produce."""
    return {k: expected[k] for k in SHARED_ROW_FIELDS}


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_spec_steps_match_the_corpus(case, tmp_path):
    """``read_spec_steps`` still parses each case's spec the recorded way.

    Asserted separately from the rows because it is the input that decides
    whether ordinal reconciliation is trusted. A spec parser that quietly
    starts returning ``[]`` would turn ordinal matching off everywhere and
    the row expectations alone would not say why.
    """
    set_dir = _materialize(case, tmp_path)
    assert (
        session_checklist.read_spec_steps(set_dir, case["sessionNumber"])
        == case["expectedSpecSteps"]
    ), case["why"]


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_rows_match_the_corpus(case, tmp_path):
    """``build_rows`` still produces the recorded rows, in order."""
    set_dir = _materialize(case, tmp_path)
    rows = [
        _as_dict(r)
        for r in session_checklist.build_rows(set_dir, case["sessionNumber"])
    ]
    assert rows == [_shared(e) for e in case["expectedRows"]], case["why"]


def test_the_shared_fields_are_the_whole_python_row():
    """A new row field must be declared, not just added to the row.

    Without this, adding a field to ``ChecklistRow`` would leave it
    uncompared and the two implementations free to disagree about it
    forever — the silent divergence the corpus exists to make impossible.
    Asserted against the dataclass rather than a hand-written list, so
    the check cannot go stale.

    Set 127 S2 closed the one-session split its S1 opened, so there is
    one category again: every field is COMPARED in both languages, and a
    field in neither the dataclass nor the tuple fails this.
    """
    fields = [f.name for f in dataclasses.fields(session_checklist.ChecklistRow)]
    camel = [
        "".join(w if i == 0 else w.capitalize() for i, w in enumerate(f.split("_")))
        for f in fields
    ]
    assert sorted(camel) == sorted(SHARED_ROW_FIELDS), (
        "ChecklistRow gained or lost a field; add it to SHARED_ROW_FIELDS "
        "(and to the corpus + the TypeScript half) or the parity gate "
        "stops proving it"
    )


def test_the_corpus_carries_no_field_only_one_language_produces():
    """The anti-resurrection guard for the marker (L-112-1, planted).

    ``isHere`` was the one field the corpus pinned that only the
    extension produced, and carrying it is what let the two languages
    drift for a whole set. Re-adding any such field — this one or a
    successor — puts the gate back into a state where one half asserts
    something the other cannot, so the corpus is asserted to contain
    exactly the fields both halves compare.
    """
    extra = {
        key
        for case in CASES
        for row in case["expectedRows"]
        for key in row
        if key not in SHARED_ROW_FIELDS
    }
    assert not extra, (
        f"expectedRows carries {sorted(extra)}, which SHARED_ROW_FIELDS does "
        "not compare. Either both implementations produce it (add it to "
        "SHARED_ROW_FIELDS and to the TypeScript half) or only one does, "
        "which is the divergence the corpus exists to prevent"
    )
    missing = {
        field
        for case in CASES
        for row in case["expectedRows"]
        for field in SHARED_ROW_FIELDS
        if field not in row
    }
    assert not missing, f"expectedRows lost {sorted(missing)}"


def test_the_corpus_pins_the_derivation_in_both_directions():
    """A derivation only one direction of which is tested proves nothing.

    L-112-1, applied to a corpus rather than a regex: cases where the
    active step FIRES and cases where it must NOT are both required by
    name, because a mirror that never derives anything would pass a
    corpus made only of the negative half, and one that derives
    everywhere would pass a corpus made only of the positive half.

    The structural claim is asserted over every case rather than named:
    **at most one** row per case may be active, whatever the ledger
    contains. That is the spec's one-thing-that-must-not-regress, and it
    holds however a status happens to be spelled.
    """
    fires = {
        case["name"]
        for case in CASES
        if any(row["isActive"] for row in case["expectedRows"])
    }
    assert "the-active-step-is-derived-where-the-record-is-silent" in fires
    assert "an-unfinished-planned-row-breaks-the-start-time-chain" in fires
    assert "a-prose-status-is-evidence-of-nothing" in fires

    for name in (
        "a-closed-session-derives-no-active-step-but-keeps-its-times",
        "a-blocked-row-is-not-overwritten-by-the-derivation",
        "in-flight-is-the-logged-step-not-an-earlier-pending-plan-row",
        "no-state-file-means-no-derivation-at-all",
    ):
        case = next(c for c in CASES if c["name"] == name)
        assert not any(row["isActive"] for row in case["expectedRows"]), (
            f"{name} is one of the corpus's DOES-NOT-FIRE cases and it now "
            "derives an active step"
        )

    for case in CASES:
        active = [row for row in case["expectedRows"] if row["isActive"]]
        assert len(active) <= 1, (
            f"{case['name']} expects {len(active)} active rows; exactly one "
            "row per session may ever be derived in flight"
        )


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_a_case_with_no_state_file_derives_no_active_step(case, tmp_path):
    """The state file is the ONLY thing that can arm the derivation.

    Runs every case a second time with ``session-state.json`` withheld,
    whatever the case declares, and asserts nothing is ever active. That
    falsifies the failure this set's spec calls strictly worse than the
    silence it replaced — a derivation that fires on a session nobody
    said was in flight — over the whole corpus rather than on the one
    case written for it.
    """
    stripped = {k: v for k, v in case.items() if k != "sessionState"}
    set_dir = _materialize(stripped, tmp_path)
    assert not os.path.exists(os.path.join(set_dir, "session-state.json"))
    rows = session_checklist.build_rows(set_dir, case["sessionNumber"])
    assert not any(r.is_active for r in rows), case["why"]


def test_the_corpus_still_pins_a_step_in_flight():
    """What replaced the marker has to be covered by something.

    The tree draws its in-progress glyph from a row whose recorded status
    is ``in-progress``. If no case produced one, the corpus would prove
    the rows exist and say nothing about the signal an operator actually
    reads — the same "a gate that only ever passes" failure L-112-1
    names, one level up.
    """
    in_flight = [
        (case["name"], row["stepKey"])
        for case in CASES
        for row in case["expectedRows"]
        if row["status"] == "in-progress"
    ]
    assert in_flight, "no case renders a step in flight"
    assert any(
        name == "in-flight-is-the-logged-step-not-an-earlier-pending-plan-row"
        for name, _key in in_flight
    ), (
        "the case that pins an in-flight LOGGED row below an unstarted "
        "planned one is gone; that is the exact defect the removed marker "
        "produced, and the glyph's correctness on it is unproven without it"
    )


def test_the_corpus_covers_the_cases_the_tree_depends_on():
    """A corpus that shrinks is a parity gate that quietly stops proving.

    Named cases, not a count: a rename is a decision, and a deletion of
    any one of these removes a rule the Work Explorer's fifth tree level
    relies on. L-112-1's point applies to a fixture as much as to a regex —
    a gate whose corpus can be emptied proves nothing.
    """
    required = {
        "plan-only",
        "plan-partly-executed-ordinal",
        "identity-beats-ordinal",
        "plan-moved-under-the-session",
        "bookkeeping-cannot-claim-a-planned-row",
        "legacy-set-with-no-seeded-plan",
        "repeated-key-collapses-to-the-latest-at-the-first-position",
        "anonymous-steps-are-not-collapsed",
        "everything-finished-has-nothing-in-flight",
        "in-flight-is-the-logged-step-not-an-earlier-pending-plan-row",
        "steps-in-a-fenced-block-are-not-this-specs-steps",
        "a-falsy-non-string-kind-is-no-kind-at-all",
        "falsy-non-string-fields-read-as-empty",
        "a-session-with-no-entries-renders-nothing",
        # Set 127 S2 — the derivation, both directions and both fields.
        "the-active-step-is-derived-where-the-record-is-silent",
        "a-closed-session-derives-no-active-step-but-keeps-its-times",
        "a-blocked-row-is-not-overwritten-by-the-derivation",
        "a-prose-status-is-evidence-of-nothing",
        "an-unfinished-planned-row-breaks-the-start-time-chain",
        "a-bookkeeping-record-is-transparent-to-the-start-time-chain",
        "a-plan-less-state-file-still-dates-the-first-row",
        "no-state-file-means-no-derivation-at-all",
        "the-start-time-chain-does-not-read-the-status-vocabulary",
    }
    assert required <= {c["name"] for c in CASES}


def test_every_case_carries_its_reason():
    """A corpus entry with no ``why`` is a regression nobody can triage."""
    for case in CASES:
        assert case.get("why", "").strip(), f"{case['name']} has no `why`"
