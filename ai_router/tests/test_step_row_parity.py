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
both halves compare the same five fields again. :data:`SHARED_ROW_FIELDS`
is therefore the WHOLE row on both sides, which is the state a parity
gate should be in — nothing declared, nothing projected out.
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

#: The row fields, which are now the WHOLE row on both sides (Set 115 S4
#: removed ``isHere``, the last field only one language produced). A field
#: added to ``ChecklistRow`` and not to this tuple silently stops being
#: compared, so :func:`test_the_shared_fields_are_the_whole_python_row`
#: pins the tuple against the dataclass itself.
SHARED_ROW_FIELDS = (
    "stepNumber",
    "stepKey",
    "description",
    "status",
    "isPlanned",
)


def _materialize(case: dict, tmp_path) -> str:
    """Write *case* to a session-set directory and return its path."""
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
    return str(set_dir)


def _as_dict(row: session_checklist.ChecklistRow) -> Dict[str, object]:
    return {
        "stepNumber": row.step_number,
        "stepKey": row.step_key,
        "description": row.description,
        "status": row.status,
        "isPlanned": row.is_planned,
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
    """A new row field must be added to the parity comparison, not just the row.

    Without this, adding a field to ``ChecklistRow`` would leave it
    uncompared and the two implementations free to disagree about it
    forever — the silent divergence the corpus exists to make impossible.
    Asserted against the dataclass rather than a hand-written list, so
    the check cannot go stale.
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
    }
    assert required <= {c["name"] for c in CASES}


def test_every_case_carries_its_reason():
    """A corpus entry with no ``why`` is a regression nobody can triage."""
    for case in CASES:
        assert case.get("why", "").strip(), f"{case['name']} has no `why`"
