"""Falsifiers for the Set 120 S2 drift inventory and scoped migration.

L-112-1: a migration that runs cleanly over a repo whose drift it already
fixed looks **identical** to one that does nothing, and reading its
regexes reads as confirmation. So every rule here is exercised by
planting the thing it must refuse, beside the legitimate look-alike it
must ignore:

- a file the raw scan cannot explain (a stray ``"status"`` member the
  parser does not see as an entry status) --- refused, not written;
- an escaped ``\\"status\\": \\"completed\\"`` quoted *inside* a
  description --- ignored, because it is text, not structure;
- a step whose owning session never completed, and a step re-logged
  later as ``blocked`` --- both flagged by the premise check, which is
  the check that would have stopped the migration had the ruling's
  premise been false.

The byte-level tests plant the three formatting shapes actually measured
across this repo's 109 activity logs on 2026-08-11 --- CRLF endings, a
missing trailing newline, and Set 028's ``ensure_ascii=False`` arrow ---
because those are precisely what a parse-mutate-``json.dump`` migration
would have quietly rewritten.
"""

import json
from pathlib import Path

import pytest

from ai_router.step_status_drift import (
    KIND_ABSENT,
    KIND_CANONICAL,
    KIND_LOADED,
    KIND_LOSSLESS,
    SIGNAL_SESSION_NOT_COMPLETE,
    SIGNAL_SUPERSEDED,
    check_premise,
    inventory,
    is_excluded_path,
    migrate_all,
    migrate_file,
    premise_blockers,
    read_file_inventory,
    scan_status_members,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REPO_SESSION_SETS = REPO_ROOT / "docs" / "session-sets"

#: A status field carrying narrative rather than a token, reproduced from
#: the shape found in Set 110's log. It embeds an escaped status member,
#: which is exactly the look-alike the raw scan must not fire on.
PROSE_STATUS = (
    'complete - the seeder wrote {"stepKey": "x", "sessionNumber": 1, '
    '"status": "completed"} into the ledger, so the row renders [?] until '
    "the writer is made strict."
)


def _entry(session, step, key, status, description="A step.", omit_status=False):
    entry = {
        "sessionNumber": session,
        "stepNumber": step,
        "stepKey": key,
        "dateTime": "2026-08-11T00:00:00.000000-04:00",
        "description": description,
    }
    if not omit_status:
        entry["status"] = status
    return entry


def _write_log(set_dir: Path, entries, *, crlf=True, trailing_newline=False,
               ensure_ascii=True) -> Path:
    """Write an activity log in one of the on-disk shapes measured in this
    repo, byte-for-byte, without going through any writer that would
    normalise it."""
    set_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "sessionSetName": set_dir.name,
        "createdDate": "2026-08-11T00:00:00.000000-04:00",
        "totalSessions": 1,
        "entries": entries,
    }
    text = json.dumps(payload, indent=2, ensure_ascii=ensure_ascii)
    if trailing_newline:
        text += "\n"
    if crlf:
        text = text.replace("\n", "\r\n")
    path = set_dir / "activity-log.json"
    path.write_bytes(text.encode("utf-8"))
    return path


def _mixed_log(set_dir: Path, **kwargs) -> Path:
    """A log carrying one of each population: canonical, both lossless
    synonyms, and every loaded shape the repo actually holds."""
    return _write_log(
        set_dir,
        [
            _entry(1, 1, "s1/canonical", "complete"),
            _entry(1, 2, "s1/lossless-completed", "completed"),
            _entry(1, 3, "s1/lossless-done", "done"),
            _entry(1, 4, "s1/loaded-qualified", "complete-with-known-failures"),
            _entry(1, 5, "s1/loaded-skipped", "skipped"),
            _entry(1, 6, "s1/loaded-prose", PROSE_STATUS),
            _entry(1, 7, "s1/loaded-list", ["complete", "complete"]),
            _entry(1, 8, "s1/loaded-absent", None, omit_status=True),
            _entry(1, 9, "s1/canonical-blocked", "blocked"),
        ],
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


def test_inventory_sorts_every_entry_into_its_ruled_population(tmp_path):
    """The ruling splits the drift in two and treats the halves oppositely,
    so mis-sorting one entry is the whole defect."""
    _mixed_log(tmp_path / "001-demo")
    inv = inventory(str(tmp_path))

    by_kind = {}
    for occ in inv.occurrences:
        by_kind.setdefault(occ.kind, []).append(occ.step_key)

    assert sorted(by_kind[KIND_CANONICAL]) == ["s1/canonical", "s1/canonical-blocked"]
    assert sorted(by_kind[KIND_LOSSLESS]) == [
        "s1/lossless-completed",
        "s1/lossless-done",
    ]
    assert sorted(by_kind[KIND_LOADED]) == [
        "s1/loaded-list",
        "s1/loaded-prose",
        "s1/loaded-qualified",
        "s1/loaded-skipped",
    ]
    assert by_kind[KIND_ABSENT] == ["s1/loaded-absent"]

    occ = next(o for o in inv.occurrences if o.step_key == "s1/lossless-done")
    assert (occ.set_slug, occ.session_number, occ.step_number) == ("001-demo", 1, 3)


# ---------------------------------------------------------------------------
# The migration rewrites the ruled tokens and only those
# ---------------------------------------------------------------------------


def test_migration_normalises_the_lossless_synonyms_and_nothing_else(tmp_path):
    path = _mixed_log(tmp_path / "001-demo")
    result = migrate_file(str(path), in_place=True)

    assert (result.rewritten, result.preserved, result.written) == (2, 5, True)
    statuses = {
        e["stepKey"]: e.get("status", "<absent>")
        for e in json.loads(path.read_text(encoding="utf-8"))["entries"]
    }
    assert statuses["s1/lossless-completed"] == "complete"
    assert statuses["s1/lossless-done"] == "complete"
    assert statuses["s1/loaded-qualified"] == "complete-with-known-failures"
    assert statuses["s1/loaded-skipped"] == "skipped"
    assert statuses["s1/loaded-prose"] == PROSE_STATUS
    assert statuses["s1/loaded-list"] == ["complete", "complete"]
    assert statuses["s1/loaded-absent"] == "<absent>"


def test_the_loaded_entries_come_out_byte_identical(tmp_path):
    """The ruling's own acceptance condition, asserted on raw bytes.

    Not "the values are equal after a reparse" --- equal bytes. A
    re-serializing migration passes the reparse check while having
    rewritten the loaded entries' formatting, which is exactly the
    outcome the operator ruled against.
    """
    path = _mixed_log(tmp_path / "001-demo")
    before = path.read_bytes()

    text = before.decode("utf-8")
    loaded_fragments = [
        text[occ.span[0]:occ.span[1]].encode("utf-8")
        for occ in read_file_inventory(str(path)).loaded
        if occ.span is not None
    ]
    # Three of the five loaded entries have a string status and therefore
    # a span; the fourth is a JSON array and the fifth has no status field
    # at all. Both are covered by the whole-file assertion below, which is
    # the stronger claim anyway.
    assert len(loaded_fragments) == 3

    migrate_file(str(path), in_place=True)
    after = path.read_bytes()

    assert after != before
    for fragment in loaded_fragments:
        assert before.count(fragment) == 1
        assert after.count(fragment) == 1

    expected = before.replace(
        b'"status": "completed"', b'"status": "complete"'
    ).replace(b'"status": "done"', b'"status": "complete"')
    assert after == expected, (
        "the migrated file must differ from the original at the ruled "
        "status tokens and nowhere else"
    )


@pytest.mark.parametrize(
    "shape",
    [
        {"crlf": True, "trailing_newline": False},
        {"crlf": True, "trailing_newline": True},
        {"crlf": False, "trailing_newline": True},
        {"crlf": True, "trailing_newline": False, "ensure_ascii": False},
    ],
)
def test_the_file_shape_survives_the_rewrite(tmp_path, shape):
    """Line endings, the trailing newline, and non-ASCII written raw all
    survive. Measured across this repo's 109 logs: 108 CRLF, 39 with a
    trailing newline and 69 without, and Set 028 carrying a literal
    U+2192 that a default re-serialize would escape."""
    entries = [
        _entry(1, 1, "s1/lossless", "completed", description="Bump 0.3.1 \u2192 0.3.2."),
        _entry(1, 2, "s1/canonical", "complete", description="Arrow \u2192 kept."),
    ]
    path = _write_log(tmp_path / "001-demo", entries, **shape)
    before = path.read_bytes()

    assert migrate_file(str(path), in_place=True).rewritten == 1
    after = path.read_bytes()

    assert after == before.replace(b'"status": "completed"', b'"status": "complete"')
    assert after.count(b"\r\n") == before.count(b"\r\n")
    assert after.endswith(b"\n") == before.endswith(b"\n")
    assert (b"\xe2\x86\x92" in after) == (b"\xe2\x86\x92" in before)


def test_a_dry_run_writes_nothing(tmp_path):
    path = _mixed_log(tmp_path / "001-demo")
    before = path.read_bytes()

    result = migrate_file(str(path), in_place=False)

    assert (result.rewritten, result.changed, result.written) == (2, True, False)
    assert path.read_bytes() == before


def test_the_migration_is_idempotent(tmp_path):
    """A record-rewriting migration that is not re-runnable is one
    interrupted run away from an unrecoverable half-state."""
    path = _mixed_log(tmp_path / "001-demo")
    migrate_file(str(path), in_place=True)
    once = path.read_bytes()

    second = migrate_file(str(path), in_place=True)

    assert (second.rewritten, second.changed, second.written) == (0, False, False)
    assert path.read_bytes() == once


# ---------------------------------------------------------------------------
# Planted violations: the scan must refuse what it cannot explain (L-112-1)
# ---------------------------------------------------------------------------


def test_a_file_the_scan_cannot_explain_is_refused_not_rewritten(tmp_path):
    """Plant a ``"status"`` member the parser does not see as an entry
    status. The raw-scan/parser cross-check must catch the disagreement
    and refuse the file rather than rewrite blind."""
    path = _write_log(
        tmp_path / "001-demo",
        [_entry(1, 1, "s1/lossless", "completed")],
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["summary"] = {"status": "completed"}
    path.write_bytes(json.dumps(payload, indent=2).encode("utf-8"))
    before = path.read_bytes()

    file_inv = read_file_inventory(str(path))
    assert file_inv.problem is not None
    assert "refusing to rewrite" in file_inv.problem

    result = migrate_file(str(path), in_place=True)
    assert result.problem is not None
    assert result.rewritten == 0
    assert path.read_bytes() == before


def test_a_status_quoted_inside_a_description_is_not_structure(tmp_path):
    """The legitimate look-alike. A description that quotes an entry
    carries ``\\"status\\": \\"completed\\"`` escaped; the scan must read
    that as text, or it would corrupt prose while claiming to fix enums."""
    quoted = (
        'The seeder emitted {"stepKey": "x", "sessionNumber": 1, '
        '"status": "completed"} and the row rendered [?].'
    )
    path = _write_log(
        tmp_path / "001-demo",
        [
            _entry(1, 1, "s1/canonical", "complete", description=quoted),
            _entry(1, 2, "s1/lossless", "completed"),
        ],
    )

    assert [value for _, _, value in scan_status_members(
        path.read_text(encoding="utf-8"))] == ["complete", "completed"]

    assert migrate_file(str(path), in_place=True).rewritten == 1
    entries = json.loads(path.read_text(encoding="utf-8"))["entries"]
    assert entries[0]["description"] == quoted
    assert entries[1]["status"] == "complete"


# ---------------------------------------------------------------------------
# The premise check: it must be able to find a counter-example
# ---------------------------------------------------------------------------


def test_the_premise_check_finds_a_planted_counter_example(tmp_path):
    """The check that guards the ruling. Plant both structural signals ---
    a 'completed' step inside a session that never closed, and a step
    re-logged later as blocked --- and prove each fires. A premise check
    that cannot fail is not evidence the premise holds."""
    set_dir = tmp_path / "001-demo"
    _write_log(
        set_dir,
        [
            _entry(1, 1, "s1/reopened", "completed"),
            _entry(1, 1, "s1/reopened", "blocked", description="Could not finish."),
            _entry(2, 1, "s2/open", "done"),
        ],
    )
    (set_dir / "session-state.json").write_text(
        json.dumps({
            "schemaVersion": 4,
            "sessionSetName": "001-demo",
            "status": "in-progress",
            "sessions": [
                {"number": 1, "title": "One", "status": "complete"},
                {"number": 2, "title": "Two", "status": "in-progress"},
            ],
        }),
        encoding="utf-8",
    )

    flags = check_premise(str(tmp_path))
    signals = {(f.signal, f.occurrence.step_key) for f in flags}

    assert (SIGNAL_SUPERSEDED, "s1/reopened") in signals
    assert (SIGNAL_SESSION_NOT_COMPLETE, "s2/open") in signals
    assert all(f.adjudication is None for f in flags)


def test_the_premise_check_is_silent_on_history_that_holds(tmp_path):
    """The negative half: a completed session whose steps stayed
    completed produces no flag, so a flag means something."""
    set_dir = tmp_path / "001-demo"
    _write_log(
        set_dir,
        [
            _entry(1, 1, "s1/one", "completed"),
            _entry(1, 2, "s1/two", "done"),
        ],
    )
    (set_dir / "session-state.json").write_text(
        json.dumps({
            "schemaVersion": 4,
            "sessionSetName": "001-demo",
            "status": "complete",
            "sessions": [{"number": 1, "title": "One", "status": "complete"}],
        }),
        encoding="utf-8",
    )

    assert check_premise(str(tmp_path)) == []


def test_an_unadjudicated_premise_flag_refuses_the_write(tmp_path):
    """The round-1 finding, planted.

    The premise check is a **precondition**, not a companion command. A
    module that documents "falsify before acting" while leaving
    ``--migrate --in-place`` a separate branch has not implemented it:
    the next caller launders exactly the outcome the check exists to
    protect. Plant a flagged occurrence and prove BOTH entry points --
    the per-file one and the whole-scan one -- refuse and write nothing.
    """
    clean = tmp_path / "001-clean"
    _write_log(clean, [_entry(1, 1, "s1/fine", "completed")])
    (clean / "session-state.json").write_text(
        json.dumps({
            "schemaVersion": 4,
            "sessionSetName": "001-clean",
            "status": "complete",
            "sessions": [{"number": 1, "title": "One", "status": "complete"}],
        }),
        encoding="utf-8",
    )

    flagged = tmp_path / "002-flagged"
    flagged_log = _write_log(flagged, [_entry(1, 1, "s1/open", "completed")])
    (flagged / "session-state.json").write_text(
        json.dumps({
            "schemaVersion": 4,
            "sessionSetName": "002-flagged",
            "status": "in-progress",
            "sessions": [{"number": 1, "title": "One", "status": "in-progress"}],
        }),
        encoding="utf-8",
    )

    assert premise_blockers(str(tmp_path))
    before = {p: p.read_bytes() for p in (clean / "activity-log.json", flagged_log)}

    direct = migrate_file(str(flagged_log), in_place=True)
    assert direct.rewritten == 0 and not direct.written
    assert "unadjudicated premise flag" in direct.problem

    results = migrate_all(str(tmp_path), in_place=True)
    assert all(r.problem and r.rewritten == 0 for r in results), (
        "one flagged occurrence must refuse the whole scan: the ruling was "
        "given for a population falsified as lossless"
    )
    for path, raw in before.items():
        assert path.read_bytes() == raw

    # And the negative half: with the flagged set out of scope, the clean
    # set migrates normally, so the refusal is about the evidence and not
    # a tool that never writes.
    assert migrate_all(str(tmp_path), in_place=True, only=["001-clean"])[0].rewritten == 1


def test_an_excluded_fixture_is_never_migrated_whatever_scan_says(tmp_path):
    """The round-2 finding, planted.

    An exclusion that holds only while nobody passes ``--scan`` is a
    comment, not an exclusion. The real case: the repo's pinned UAT
    fixture carries two 'completed' tokens, and ``--scan .`` would have
    rewritten an extension test fixture from inside a Python-only
    history migration.
    """
    fixture_log = _write_log(
        tmp_path / "tools" / "test-fixtures" / "uat" / "001-fixture",
        [_entry(1, 1, "s1/fixture", "completed")],
    )
    real_log = _write_log(
        tmp_path / "sets" / "001-real", [_entry(1, 1, "s1/real", "completed")]
    )
    before = fixture_log.read_bytes()

    assert is_excluded_path(str(fixture_log))
    assert not is_excluded_path(str(real_log))

    results = {r.set_slug: r for r in migrate_all(str(tmp_path), in_place=True)}

    assert results["001-fixture"].excluded is True
    assert results["001-fixture"].rewritten == 0
    assert fixture_log.read_bytes() == before
    assert results["001-real"].rewritten == 1

    # It is reported, not silently dropped -- an invisible exclusion is
    # how a residual becomes an oversight.
    inv = inventory(str(tmp_path))
    assert [f.set_slug for f in inv.excluded_files] == ["001-fixture"]
    assert all(o.set_slug != "001-fixture" for o in inv.occurrences)


# ---------------------------------------------------------------------------
# The repo's own history, after the migration
# ---------------------------------------------------------------------------


def test_no_lossless_synonym_survives_and_re_migrating_is_a_no_op():
    """The migration's durable outcome, and the regression guard for it.

    Two claims in one pass because they are the same claim from either
    side: the inventory finds no ``completed`` / ``done`` left in the
    repo's history, and running the real migrator over the real tree in
    dry-run finds nothing to do. The strict writer stops new drift; this
    fails, naming the file, if any arrives by another route.
    """
    inv = inventory(str(REPO_SESSION_SETS))
    survivors = [
        f"{o.set_slug} session {o.session_number} step {o.step_number}: {o.token}"
        for o in inv.occurrences
        if o.kind == KIND_LOSSLESS
    ]
    assert survivors == [], "lossless synonyms must be migrated:\n  " + "\n  ".join(
        survivors
    )

    changed = [
        f"{r.set_slug}: rewritten={r.rewritten} problem={r.problem}"
        for r in migrate_all(str(REPO_SESSION_SETS), in_place=False)
        if r.changed or r.problem
    ]
    assert changed == []


def test_the_semantically_loaded_entries_are_still_there():
    """The other half of the ruling, which is the easier one to lose: a
    later well-meaning sweep that 'finishes the job' would erase the
    qualified outcomes this session deliberately preserved."""
    inv = inventory(str(REPO_SESSION_SETS))
    preserved = {o.token for o in inv.occurrences if o.kind in (KIND_LOADED, KIND_ABSENT)}

    assert "complete-with-known-failures" in preserved
    assert "skipped" in preserved
    assert "<absent>" in preserved
    assert any(t.startswith("<prose:") for t in preserved)
    assert "<list>" in preserved
    assert sum(
        1 for o in inv.occurrences if o.kind in (KIND_LOADED, KIND_ABSENT)
    ) == 15
