"""Falsifiers for the Set 120 S1 step-status vocabulary.

L-112-1: a validator that only ever passes proves nothing. Every rule
here is exercised by **planting** the defect it exists to refuse --- each
drifted token measured on disk on 2026-08-11 gets its own planted write
--- beside a positive case asserting the legitimate look-alike (the
canonical token) still lands. The structural assertions sit next to the
textual ones so the vocabulary holds however a caller spells its way
into it.

The measured drift these falsifiers reproduce:

    completed                       229 entries
    done                             42 entries
    complete-with-known-failures      1 entry
    prose (111-1,481 chars)           9 entries
    None                              4 entries

Session 119 S2 is the consequence: it wrote ``completed``, and the whole
session rendered as not-started with ``<- here`` stranded on step 1.
"""

import ast
import json
from pathlib import Path

import pytest

from ai_router.session_log import (
    ALLOWED_STEP_STATUSES,
    CANONICAL_STEP_STATUSES,
    InvalidStepStatusError,
    SessionLog,
    is_valid_step_status,
    require_step_status,
    suggest_step_status,
    validate_step_status,
)

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent

# The exact tokens measured on disk that no reader can name. Each is
# planted below; none may ever be written again.
DRIFTED_TOKENS = (
    "completed",
    "done",
    "complete-with-known-failures",
    "not-started",
    "in_progress",
    "started",
    "failed",
    # Measured on disk once, named in the Set 120 spec's candidate list,
    # and deliberately NOT in the vocabulary: no reader can name it.
    # Round 1 of verification found this independently on both lenses.
    "skipped",
)

# A status field carrying narrative, reproduced from the shape found in
# Set 110's log (the longest real one ran to 1,481 characters).
PROSE_STATUS = (
    "complete - the tree provider now renders session nodes, but the\n"
    "step ledger still disagrees with the Python checklist for any set "
    "whose activity log carries a token the reader cannot name, so the "
    "rendering is provisional until the writer is made strict."
)


def _entries(session_set_dir):
    with open(f"{session_set_dir}/activity-log.json", encoding="utf-8") as f:
        return json.load(f)["entries"]


def _plant(log, status):
    """Drive the PUBLIC entrypoint with a bad status (L-069-1)."""
    log.log_step(
        session_number=1,
        step_number=2,
        step_key="session-001/planted",
        description="A step whose status token is drift.",
        status=status,
    )


# ---------------------------------------------------------------------------
# Planted drift is refused at the writer
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("token", DRIFTED_TOKENS)
def test_log_step_refuses_each_drifted_token(tmp_path, token):
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, token)

    message = str(excinfo.value)
    for canonical in CANONICAL_STEP_STATUSES:
        assert f"'{canonical}'" in message, (
            f"the refusal of {token!r} must name the legal set; "
            f"{canonical!r} was missing from: {message}"
        )
    assert token in message


@pytest.mark.parametrize("token", DRIFTED_TOKENS)
def test_refused_token_never_reaches_disk(tmp_path, token):
    """The refusal must happen BEFORE the append, not after."""
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError):
        _plant(log, token)
    assert _entries(tmp_path) == []


def test_log_step_refuses_prose(tmp_path):
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, PROSE_STATUS)

    message = str(excinfo.value)
    assert "prose" in message
    assert "description" in message
    for canonical in CANONICAL_STEP_STATUSES:
        assert f"'{canonical}'" in message
    # A 1,000-character blob must not be echoed whole into the exception.
    assert len(message) < len(PROSE_STATUS) + 400
    assert _entries(tmp_path) == []


@pytest.mark.parametrize("value", [None, 1, True, ["complete"], {"status": "complete"}])
def test_log_step_refuses_non_strings(tmp_path, value):
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, value)
    assert "must be a string" in str(excinfo.value)
    assert _entries(tmp_path) == []


@pytest.mark.parametrize("value", ["", "   ", "\n"])
def test_log_step_refuses_empty(tmp_path, value):
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, value)
    assert "[?]" in str(excinfo.value)
    assert _entries(tmp_path) == []


@pytest.mark.parametrize("value", ["Complete", "COMPLETE", " complete", "complete "])
def test_log_step_refuses_near_miss_spellings(tmp_path, value):
    """Readers would render these; the writer still refuses them.

    A near-miss admitted here is a near-miss on disk forever, and the
    whole point of the vocabulary is one spelling per meaning.
    """
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, value)
    assert "Did you mean 'complete'?" in str(excinfo.value)
    assert _entries(tmp_path) == []


# ---------------------------------------------------------------------------
# The legitimate look-alike still lands
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("token", CANONICAL_STEP_STATUSES)
def test_every_canonical_token_is_still_accepted(tmp_path, token):
    log = SessionLog(str(tmp_path))
    log.log_step(
        session_number=1,
        step_number=1,
        step_key="session-001/work",
        description="Real work.",
        status=token,
    )
    assert _entries(tmp_path)[-1]["status"] == token


def test_a_step_may_move_from_in_progress_to_complete(tmp_path):
    """The ordinary lifecycle is not collateral damage of strictness."""
    log = SessionLog(str(tmp_path))
    for status in ("pending", "in-progress", "complete"):
        log.log_step(1, 2, "session-001/build", "Building.", status)
    assert [e["status"] for e in _entries(tmp_path)] == [
        "pending",
        "in-progress",
        "complete",
    ]


# ---------------------------------------------------------------------------
# append_entry: the second SessionLog door
# ---------------------------------------------------------------------------


def _bookkeeping_entry(status):
    return {
        "sessionNumber": 1,
        "stepNumber": 1,
        "stepKey": "session-001/planted",
        "description": "Seeded.",
        "status": status,
        "kind": "plan-step",
    }


@pytest.mark.parametrize("token", DRIFTED_TOKENS)
def test_append_entry_refuses_drifted_status(tmp_path, token):
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        log.append_entry(_bookkeeping_entry(token))
    assert "entry['status']" in str(excinfo.value)
    assert _entries(tmp_path) == []


def test_append_entry_accepts_a_canonical_status(tmp_path):
    log = SessionLog(str(tmp_path))
    log.append_entry(_bookkeeping_entry("pending"))
    assert _entries(tmp_path)[-1]["status"] == "pending"


def test_append_entry_still_tolerates_an_absent_status(tmp_path):
    """Absence is a different problem, and Session 3 owns it.

    Refusing a status-less bookkeeping entry here would break callers
    over a defect this session did not measure.
    """
    entry = _bookkeeping_entry("pending")
    del entry["status"]
    log = SessionLog(str(tmp_path))
    log.append_entry(entry)
    assert "status" not in _entries(tmp_path)[-1]


# ---------------------------------------------------------------------------
# Structural assertions (L-112-1: hold however a thing is spelled)
# ---------------------------------------------------------------------------


def test_the_vocabulary_is_exactly_the_measured_canonical_set():
    """Locks the legal set so a later edit is a deliberate decision.

    Four tokens: measured in use across every activity log in the repo on
    2026-08-11 **and** named by every reader. Adding a fifth is a
    vocabulary change, and changing this assertion is how it gets made on
    purpose.
    """
    assert ALLOWED_STEP_STATUSES == frozenset(
        {"complete", "in-progress", "pending", "blocked"}
    )
    assert len(CANONICAL_STEP_STATUSES) == len(ALLOWED_STEP_STATUSES)


def test_every_accepted_token_is_renderable_by_the_reader():
    """The invariant that makes the vocabulary *coherent*, not just closed.

    A token the writer accepts but no reader can name produces exactly
    the failure this session exists to prevent --- a legal write that
    renders as ``[?]``, indistinguishable from corrupt data. Round 1 of
    verification found `skipped` in that state on both discovery lenses,
    which is why this assertion exists rather than a comment.

    This is the coupling to state: the vocabulary is the INTERSECTION of
    what was measured and what the readers understand. Widen the writer
    without teaching the reader and this fails.
    """
    from ai_router.session_checklist import STATUS_BOXES, UNKNOWN_BOX

    unrenderable = [
        token
        for token in CANONICAL_STEP_STATUSES
        if STATUS_BOXES.get(token.lower(), UNKNOWN_BOX) == UNKNOWN_BOX
    ]
    assert unrenderable == [], (
        "these tokens are legal at the writer but render as the "
        f"corrupt-data glyph: {unrenderable}"
    )


def test_a_skipped_step_can_no_longer_reach_disk(tmp_path):
    """The round-1 finding, closed and pinned.

    `skipped` reached disk once (Set 009 S4, an operator-decided session
    skip logged as a step). Both readers render it `[?]`, and at the time
    of the ruling neither counted it as terminal --- so it stole the
    current-step marker from real work. (Set 120 S3 has since removed
    that marker from the Python reader; the `[?]` half stands and the
    ruling was not reopened.) Operator ruling 2026-08-11: refuse it until
    both readers learn it.
    """
    log = SessionLog(str(tmp_path))
    with pytest.raises(InvalidStepStatusError) as excinfo:
        _plant(log, "skipped")

    message = str(excinfo.value)
    assert "deliberately excluded" in message
    assert "DESCRIPTION" in message, "the refusal must say what to do instead"
    assert _entries(tmp_path) == []
    assert not is_valid_step_status("skipped")
    # And it must not be quietly suggested as a normalization target.
    assert suggest_step_status("skipped") is None


def test_a_skipped_step_cannot_hide_what_is_in_flight(tmp_path):
    """The second half of the round-1 acceptance criterion.

    With ``skipped`` unwritable, the step the checklist shows as in
    flight is real work rather than a step nobody will do. The original
    form of this test asserted it through the ``<- here`` marker; Set
    120 S3 removed the marker, so it now asserts the fact that replaced
    it — the ``in-progress`` box, read off the real renderer's rows.
    """
    from ai_router.session_checklist import (
        IN_PROGRESS_BOX,
        UNKNOWN_BOX,
        build_rows,
    )

    log = SessionLog(str(tmp_path))
    log.log_step(1, 1, "session-001/register", "Registered.", "complete")
    log.log_step(1, 2, "session-001/build", "Building.", "in-progress")

    rows = build_rows(str(tmp_path), 1)
    in_flight = [r for r in rows if r.box == IN_PROGRESS_BOX]
    assert len(in_flight) == 1
    assert in_flight[0].step_key == "session-001/build"
    assert in_flight[0].box != UNKNOWN_BOX


def _non_canonical_status_writes(py_file: Path) -> list:
    """Return every ``"status": "<literal>"`` in an activity-log ENTRY dict
    in *py_file* whose literal is outside the vocabulary.

    An entry dict is recognised structurally --- it carries both
    ``stepKey`` and ``sessionNumber`` --- so a ``session-state.json``
    object, whose ``status`` field is a legitimately different
    vocabulary (``not-started`` / ``in-progress`` / ``complete``), is not
    swept up by it.
    """
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    offenders = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        keys = {
            k.value
            for k in node.keys
            if isinstance(k, ast.Constant) and isinstance(k.value, str)
        }
        if not {"stepKey", "sessionNumber"} <= keys:
            continue
        for key, value in zip(node.keys, node.values):
            if not (isinstance(key, ast.Constant) and key.value == "status"):
                continue
            if isinstance(value, ast.Constant) and not is_valid_step_status(value.value):
                offenders.append(f"{py_file.name}:{value.lineno} status={value.value!r}")
    return offenders


def test_no_production_writer_hardcodes_a_non_canonical_status():
    """The sibling-site guard (L-069-1), asserted structurally.

    Four modules do their own read-modify-write of ``activity-log.json``
    rather than going through :class:`SessionLog`. An allowlist at one
    entry point is worthless if another path writes the file directly, so
    this walks the AST of every production module and refuses any
    string-literal ``"status": "<token>"`` outside the vocabulary. It
    holds for a writer nobody has written yet.
    """
    offenders = []
    for py_file in AI_ROUTER_DIR.rglob("*.py"):
        if (AI_ROUTER_DIR / "tests") in py_file.parents:
            continue
        offenders.extend(_non_canonical_status_writes(py_file))
    assert offenders == [], (
        "activity-log writers must use the step vocabulary:\n  "
        + "\n  ".join(offenders)
    )


def test_the_structural_guard_fires_on_a_planted_writer(tmp_path):
    """L-112-1: a scan that matches nothing looks exactly like one that
    finds nothing. Plant a bypass writer and prove the scan sees it."""
    planted = tmp_path / "rogue_writer.py"
    planted.write_text(
        'ENTRY = {\n'
        '    "sessionNumber": 1,\n'
        '    "stepNumber": 1,\n'
        '    "stepKey": "session-001/rogue",\n'
        '    "description": "Wrote around log_step.",\n'
        '    "status": "completed",\n'
        '}\n',
        encoding="utf-8",
    )
    offenders = _non_canonical_status_writes(planted)
    assert len(offenders) == 1
    assert "'completed'" in offenders[0]


def test_the_structural_guard_ignores_the_legitimate_look_alike(tmp_path):
    """A ``session-state.json`` object's ``status`` is a DIFFERENT
    vocabulary, in which ``not-started`` is canonical. The scan must not
    fire on it, or the guard becomes noise nobody reads."""
    look_alike = tmp_path / "state_writer.py"
    look_alike.write_text(
        'STATE = {\n'
        '    "schemaVersion": 4,\n'
        '    "sessionSetName": "demo",\n'
        '    "status": "not-started",\n'
        '    "sessions": [{"number": 1, "status": "not-started"}],\n'
        '}\n',
        encoding="utf-8",
    )
    assert _non_canonical_status_writes(look_alike) == []


def test_every_sibling_writer_routes_through_the_chokepoint():
    """Naming the four bypass writers so a fifth cannot arrive quietly."""
    siblings = (
        "contract_gate.py",
        "path_aware_critique.py",
        "dual_surface_verify.py",
        "suggestion_disposition.py",
    )
    for name in siblings:
        source = (AI_ROUTER_DIR / name).read_text(encoding="utf-8")
        assert "require_step_status" in source, (
            f"{name} writes activity-log entries directly; its status must "
            "go through require_step_status"
        )


def test_suggest_step_status_is_advisory_only():
    """It informs a refusal; it must never be a normalization path."""
    assert suggest_step_status("completed") == "complete"
    assert suggest_step_status("done") == "complete"
    assert suggest_step_status("complete-with-known-failures") == "complete"
    assert suggest_step_status("in_progress") == "in-progress"
    assert suggest_step_status("not-started") == "pending"
    assert suggest_step_status("failed") == "blocked"
    assert suggest_step_status("banana") is None
    assert suggest_step_status(None) is None
    # Suggesting a token is not accepting it.
    for drifted in DRIFTED_TOKENS:
        assert not is_valid_step_status(drifted)
        assert validate_step_status(drifted) is not None


def test_require_step_status_returns_the_token_unchanged():
    for token in CANONICAL_STEP_STATUSES:
        assert require_step_status(token) == token


def test_readers_stay_lenient_about_history():
    """Standing decision 1: the writer is strict, readers are not.

    History on disk carries ~281 drifted entries and ~9 prose blobs. A
    reader hardened alongside the writer would stop rendering Set 119's
    logs entirely, so leniency is asserted here rather than left to
    survive by accident.
    """
    from ai_router.session_checklist import ChecklistRow, STATUS_BOXES, UNKNOWN_BOX

    for token in DRIFTED_TOKENS + (PROSE_STATUS, ""):
        row = ChecklistRow(
            step_number=1,
            step_key="session-001/historical",
            description="Logged before the vocabulary existed.",
            status=token,
        )
        assert row.box in set(STATUS_BOXES.values()) | {UNKNOWN_BOX}

    # The tokens the reader can still name render as done, not as [?].
    assert STATUS_BOXES["done"] == "[x]"
    assert STATUS_BOXES["complete"] == "[x]"
    # And the one that stranded Set 119 S2 is exactly the [?] case the
    # writer now prevents from being created in the first place.
    assert (
        ChecklistRow(
            step_number=1,
            step_key="k",
            description="d",
            status="completed",
        ).box
        == UNKNOWN_BOX
    )
