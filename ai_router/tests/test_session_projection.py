"""Set 120 S3 — the progress projection: parity, absence states, staleness.

**Who uses this:** CI and the full-pytest close gate.
**See also:** ``ai_router/session_projection.py`` (what it tests);
``ai_router/tests/fixtures/session-step-parity.json`` (the corpus reused
here, so parity is measured against the same inputs the cross-language
gate uses); ``docs/session-progress-schema.md``.

---

The set's test budget is 40 functions across three sessions and S1/S2
spent 33, so the coverage here is chosen rather than accumulated: one
test per property the spec's four progress keys name, each written as a
falsifier (L-112-1) rather than as a confirmation. Every case plants the
defect — a corrupt ledger, an unnameable token, a mutated input, a
reintroduced marker — and asserts the projection says so.
"""

from __future__ import annotations

import json
import os

import pytest

from ai_router import session_checklist as sc
from ai_router import session_projection as sp
from ai_router.tests.test_step_row_parity import CASES, CASE_IDS, _materialize


def _write_set(tmp_path, entries, *, name="120-fixture", sessions=None):
    set_dir = tmp_path / name
    set_dir.mkdir(parents=True, exist_ok=True)
    with open(set_dir / "activity-log.json", "w", encoding="utf-8") as fh:
        json.dump({"sessionSetName": name, "entries": entries}, fh, indent=2)
    with open(set_dir / "session-state.json", "w", encoding="utf-8") as fh:
        json.dump(
            {
                "schemaVersion": 4,
                "sessionSetName": name,
                "status": "in-progress",
                "sessions": sessions
                or [{"number": 1, "status": "in-progress"}],
            },
            fh,
            indent=2,
        )
    return str(set_dir)


def _entry(step, key, status, session=1, description="d"):
    return {
        "sessionNumber": session,
        "stepNumber": step,
        "stepKey": key,
        "description": description,
        "status": status,
    }


# ---------------------------------------------------------------------------
# pythonParity
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_the_projection_carries_exactly_what_the_renderer_shows(case, tmp_path):
    """Parity, over the same corpus the cross-language gate uses.

    The projection must reproduce what ``session_checklist`` renders for
    the same inputs — **including the ``[?]`` posture for unknown
    tokens**, which is the case that matters: a projection that quietly
    healed a bad token would be a third opinion about the data, not one
    answer.

    Asserted as "every field the renderer consumes, in the renderer's
    order", not by re-running the formatter: re-deriving ``render``'s
    loop inside the test would prove the test can format, not that the
    projection is sufficient to be formatted. The boxes are then checked
    against the rendered TEXT so the ordering claim is anchored to real
    output.
    """
    set_dir = _materialize(case, tmp_path)
    rows = sc.build_rows(set_dir, case["sessionNumber"])
    projected = sp.project_session(set_dir, case["sessionNumber"])["steps"]

    assert [
        (s["box"], s["stepKey"], s["description"], s["status"], s["isPlanned"])
        for s in projected
    ] == [
        (r.box, r.step_key, r.description, r.status, r.is_planned) for r in rows
    ], case["why"]

    rendered = sc.render(rows, case["sessionNumber"])
    assert [
        line.strip()[:3] for line in rendered.splitlines()[2:]
    ] == [s["box"] for s in projected], case["why"]


def test_the_serialized_file_is_a_lossless_round_trip(tmp_path):
    """Written, read back, still the same answer.

    This is the property a later set needs before it can delete the
    TypeScript derivation: the *file* has to be sufficient, not just the
    in-memory computation. A serializer that dropped a field would pass
    every parity test above and fail here.
    """
    set_dir = _write_set(
        tmp_path,
        [
            _entry(1, "register", "complete"),
            _entry(2, "build", "in-progress"),
            _entry(3, "close", "pending"),
        ],
    )
    live = sp.build_projection(set_dir)
    assert sp.write_projection(set_dir) == sp.projection_path(set_dir)
    reloaded = sp.read_projection(set_dir)

    assert reloaded is not None
    assert reloaded["sessions"] == live["sessions"]
    assert reloaded["derived"] is True
    assert reloaded["regenerateWith"] == sp.REGENERATE_COMMAND
    # A cache that cannot be told apart from a source is a second source
    # of truth wearing a disguise. Both marks are load-bearing.
    assert set(reloaded["inputs"]) == set(sp.INPUT_FILENAMES)


# ---------------------------------------------------------------------------
# absenceStates
# ---------------------------------------------------------------------------


def test_no_work_and_cannot_read_the_evidence_are_different_answers(tmp_path):
    """The defect both Set 115 reviewers named independently.

    ``read_activity_log`` returns ``None`` for "absent" and for "there
    but corrupt" alike, so an unreadable ledger rendered as an empty
    session row — indistinguishable from a session that logged nothing.
    Planted three ways, because the look-alike is the whole point: a
    projection that reported ``unreadable`` for all three would look
    equally "fixed" and be equally wrong.
    """
    empty = tmp_path / "no-log"
    empty.mkdir()
    assert sp.evidence_state(str(empty)) == sp.EVIDENCE_ABSENT

    corrupt = tmp_path / "corrupt"
    corrupt.mkdir()
    (corrupt / "activity-log.json").write_text("{not json", encoding="utf-8")
    assert sp.evidence_state(str(corrupt)) == sp.EVIDENCE_UNREADABLE

    real = _write_set(tmp_path, [_entry(1, "a", "complete")])
    assert sp.evidence_state(real) == sp.EVIDENCE_READ

    # And an entry that names no session is hidden by every reader in
    # both languages, so the projection counts it rather than letting it
    # vanish (Set 028's four absent-status entries are exactly this).
    orphaned = _write_set(
        tmp_path,
        [_entry(1, "a", "complete"), {"stepKey": "nameless"}],
        name="orphans",
    )
    assert sp.build_projection(orphaned)["orphanEntries"] == 1
    assert sp.build_projection(real)["orphanEntries"] == 0


def test_an_unnameable_token_projects_as_unknown_without_being_healed(tmp_path):
    """The 15 entries Set 120 S2 preserved, projected honestly.

    Two directions, deliberately. The drifted and loaded tokens must
    project ``unknown`` and keep their raw text — normalising them here
    would launder exactly the entries the operator ruled must not be
    laundered. The lenient spellings the renderer still boxes must NOT
    project ``unknown``, or the projection would be stricter than the
    reader it has to reproduce.
    """
    unnameable = (
        "skipped",
        "complete-with-known-failures",
        "completed",
        "A multi-paragraph prose blob written into the status field.",
        "",
    )
    for token in unnameable:
        assert sp.normalize_step_state(token) == sp.STEP_STATE_UNKNOWN, token

    for token, expected in (
        ("complete", "complete"),
        ("done", "complete"),
        ("in-progress", "in-progress"),
        ("in_progress", "in-progress"),
        ("started", "in-progress"),
        ("pending", "pending"),
        ("not-started", "pending"),
        ("blocked", "blocked"),
        ("failed", "blocked"),
    ):
        assert sp.normalize_step_state(token) == expected, token

    set_dir = _write_set(
        tmp_path,
        [_entry(1, "loaded", "complete-with-known-failures")],
    )
    step = sp.project_session(set_dir, 1)["steps"][0]
    assert step["state"] == sp.STEP_STATE_UNKNOWN
    assert step["box"] == sc.UNKNOWN_BOX
    assert step["status"] == "complete-with-known-failures"
    assert step["isTerminal"] is False
    assert sp.project_session(set_dir, 1)["counts"]["unknown"] == 1
    # Every state is always present, so `counts.get(state, 0)` and a
    # missing key can never disagree.
    assert set(sp.project_session(set_dir, 1)["counts"]) == {
        "pending", "in-progress", "complete", "blocked", "unknown", "total",
    }


def test_a_touched_input_makes_the_projection_stale(tmp_path):
    """A cache that cannot be checked against its inputs is a source.

    The falsifier pair L-112-1 asks for: a re-read that changes nothing
    must stay ``fresh`` (the legitimate look-alike), and a real input
    change must report ``stale`` — otherwise "fresh" would be a constant
    and this check would prove nothing.
    """
    set_dir = _write_set(tmp_path, [_entry(1, "a", "in-progress")])
    assert sp.projection_state(set_dir) == sp.PROJECTION_ABSENT

    sp.write_projection(set_dir)
    assert sp.projection_state(set_dir) == sp.PROJECTION_FRESH
    assert sp.projection_state(set_dir) == sp.PROJECTION_FRESH  # look-alike

    with open(os.path.join(set_dir, "activity-log.json"), encoding="utf-8") as fh:
        log = json.load(fh)
    log["entries"].append(_entry(2, "b", "pending"))
    with open(
        os.path.join(set_dir, "activity-log.json"), "w", encoding="utf-8"
    ) as fh:
        json.dump(log, fh, indent=2)

    assert sp.projection_state(set_dir) == sp.PROJECTION_STALE
    sp.write_projection(set_dir)
    assert sp.projection_state(set_dir) == sp.PROJECTION_FRESH

    # An input that APPEARS is a change too -- spec.md did not exist for
    # any of the above, and a digest map keyed only on what was present
    # would miss it.
    (tmp_path / "120-fixture" / "spec.md").write_text("# Spec\n", encoding="utf-8")
    assert sp.projection_state(set_dir) == sp.PROJECTION_STALE

    # A projection this code cannot understand is regenerated, not guessed.
    with open(sp.projection_path(set_dir), "w", encoding="utf-8") as fh:
        json.dump({"schemaVersion": sp.PROJECTION_SCHEMA_VERSION + 1}, fh)
    assert sp.projection_state(set_dir) == sp.PROJECTION_UNREADABLE


# ---------------------------------------------------------------------------
# projection / hereMarkerRemoved
# ---------------------------------------------------------------------------


def test_what_is_current_is_read_not_inferred(tmp_path):
    """Zero, one and two in flight — all of them real answers.

    The removed ``<- here`` marker had to name exactly one row, so it
    invented a current step for a session that had not started one and
    could not describe a session working two. ``current`` is the
    ``in-progress`` rows, and nothing else. The serialized file is
    scanned for the marker's literal too: deleting a constant is
    invisible if something writes the string back.
    """
    nothing_started = _write_set(
        tmp_path, [_entry(1, "a", "pending"), _entry(2, "b", "pending")],
        name="none",
    )
    assert sp.project_session(nothing_started, 1)["current"] == []
    assert sp.project_session(nothing_started, 1)["remaining"] == ["a", "b"]

    one = _write_set(
        tmp_path, [_entry(1, "a", "complete"), _entry(2, "b", "in-progress")],
        name="one",
    )
    assert sp.project_session(one, 1)["current"] == ["b"]
    assert sp.project_session(one, 1)["remaining"] == ["b"]

    two = _write_set(
        tmp_path,
        [_entry(1, "a", "in-progress"), _entry(2, "b", "in-progress")],
        name="two",
    )
    assert sp.project_session(two, 1)["current"] == ["a", "b"]

    sp.write_projection(two)
    with open(sp.projection_path(two), encoding="utf-8") as fh:
        serialized = fh.read()
    assert "<- here" not in serialized
    assert "isHere" not in serialized


def test_the_close_time_write_is_declared_and_therefore_exempt(tmp_path):
    """The freshness claim, checked rather than asserted in prose.

    ``close_session`` writes this file AFTER the verification round that
    reviewed the work. If the declaration were not discovered, every
    close would stale its own stamp and send the backstop into a fresh
    metered round — the exact failure Sets 111 S2, 112 S3 and 114 S1 each
    paid for, and one that no test would otherwise notice because the
    close still succeeds.

    Planted at the level that actually decides it: the pathspec
    ``verification_stamp`` builds. The declaration is also pinned against
    the constant, because ``ast.literal_eval`` cannot read a name and a
    drifted literal would exempt a filename nothing writes.
    """
    from ai_router import verification_stamp as vs

    assert sp.CLOSE_MANDATED_WRITES[0]["path"] == sp.PROJECTION_FILENAME
    excludes = vs.close_mandated_excludes("docs/session-sets/anything")
    assert f"docs/session-sets/anything/{sp.PROJECTION_FILENAME}" in excludes
    # Set-scoped, so it is never applied repo-wide.
    assert sp.PROJECTION_FILENAME not in vs.close_mandated_excludes(None)
