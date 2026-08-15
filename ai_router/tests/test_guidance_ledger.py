"""Set 121 S2 — falsifiers for the guidance usage ledger and its retention rules.

Per L-112-1, every rule below gets **a planted violation that must fire
and a planted look-alike that must not**, and the structural assertion
sits beside the textual one. Per L-112-1's own encoded half
(``corpus_scan_guard``), any test that scans a corpus asserts the corpus
is non-empty first.

The spec named one falsifier explicitly, and it is
:meth:`TestUsesAreStringsNeverNumbers.test_session_ten_survives_a_write_read_cycle`:
plant ``"120-10"`` and assert it survives a write/read cycle **distinct
from** ``"120-01"``. That is not pedantry. ``120.10`` as a JSON number
round-trips through a float to ``120.1``, which reads back as session
**1** — a silent corruption of session 10 that no exception would ever
report.

Bare-filename imports per the package test convention.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import guidance_ledger as gl
from close_lock import LockContention, acquire_file_mutex, release_file_mutex


# --- fixtures ----------------------------------------------------------------


@pytest.fixture
def ledger_file(tmp_path: Path) -> str:
    target = tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME
    target.parent.mkdir(parents=True)
    return str(target)


def _read(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


# --- labels: dash-separated strings, never JSON numbers ----------------------


class TestUsesAreStringsNeverNumbers:
    """The spec's named falsifier, plus its look-alike."""

    def test_session_ten_survives_a_write_read_cycle(self, ledger_file):
        """PLANTED: session 10 must not collapse into session 1.

        ``120.10`` as a float is ``120.1``, which reads back as session
        1. The dash makes the non-numeric intent visible so no future
        reader or writer is tempted to treat the field as a number.
        """
        gl.record_citation(["L-1-1"], set_number=120, session_number=10,
                           path=ledger_file)
        gl.record_citation(["L-1-2"], set_number=120, session_number=1,
                           path=ledger_file)
        raw = _read(ledger_file)
        assert raw["entries"]["L-1-1"]["uses"] == ["120-10"]
        assert raw["entries"]["L-1-2"]["uses"] == ["120-01"]
        assert raw["entries"]["L-1-1"]["uses"] != raw["entries"]["L-1-2"]["uses"]
        # ...and they survive the read path as distinct sessions too.
        ledger, problems = gl.load_ledger(path=ledger_file)
        assert problems == []
        assert gl.parse_use_label(ledger.entries["L-1-1"].uses[0]) == (120, 10)
        assert gl.parse_use_label(ledger.entries["L-1-2"].uses[0]) == (120, 1)

    def test_every_written_use_is_a_json_string(self, ledger_file):
        """Structural, beside the textual assertion above."""
        gl.record_citation(["L-1-1"], set_number=99, session_number=3,
                           path=ledger_file)
        raw = _read(ledger_file)
        uses = raw["entries"]["L-1-1"]["uses"]
        assert uses, "corpus check: the ring must be non-empty to prove anything"
        assert all(isinstance(u, str) for u in uses)

    def test_a_numeric_use_is_refused_by_the_reader(self):
        """PLANTED VIOLATION: a hand-edited float must be reported.

        Silently coercing it would recreate the exact ambiguity the dash
        exists to prevent.
        """
        ledger, problems = gl.parse_ledger(
            {"schemaVersion": 1, "entries": {"L-1-1": {"kind": "instruction",
                                                       "uses": [120.10]}}}
        )
        assert any("not a\n" not in p and "JSON float" in p for p in problems), problems
        assert ledger.entries["L-1-1"].uses == []

    def test_a_dashed_string_is_not_refused(self):
        """PLANTED LOOK-ALIKE: the legal form must stay silent."""
        ledger, problems = gl.parse_ledger(
            {"schemaVersion": 1, "entries": {"L-1-1": {"kind": "instruction",
                                                       "uses": ["120-10"]}}}
        )
        assert problems == []
        assert ledger.entries["L-1-1"].uses == ["120-10"]

    def test_labels_still_sort_correctly_zero_padded(self):
        assert "099-01" < "120-02" < "120-10"

    @pytest.mark.parametrize("bad", ["120", "120-", "-01", "12-01", "120-1", "x-y"])
    def test_malformed_labels_are_refused(self, bad):
        _ledger, problems = gl.parse_ledger(
            {"entries": {"L-1-1": {"kind": "instruction", "uses": [bad]}}}
        )
        assert problems, f"{bad!r} should not have parsed as a use label"

    def test_use_label_refuses_non_numeric_input(self):
        with pytest.raises(ValueError):
            gl.use_label("twelve", 1)


# --- the ring: bounded, newest-first, append-ordered -------------------------


class TestTheRingIsBoundedAndOrdered:
    def test_the_ring_caps_at_ten_and_drops_the_oldest(self, ledger_file):
        for session in range(1, 15):
            gl.record_citation(["L-1-1"], set_number=100, session_number=session,
                               path=ledger_file)
        ledger, _ = gl.load_ledger(path=ledger_file)
        uses = ledger.entries["L-1-1"].uses
        assert len(uses) == gl.RING_CAPACITY
        assert uses[0] == "100-14"      # newest first
        assert uses[-1] == "100-05"     # oldest survivor
        assert "100-04" not in uses     # evicted by the cap

    def test_a_repeat_use_does_not_consume_a_second_slot(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["L-1-1"].uses == ["100-01"]

    def test_re_using_an_older_label_moves_it_to_the_front(self):
        entry = gl.LedgerEntry(kind=gl.KIND_INSTRUCTION,
                               uses=["120-01", "119-02", "118-01"])
        assert gl.push_use(entry, "118-01") is True
        assert entry.uses == ["118-01", "120-01", "119-02"]

    def test_the_ring_records_APPEND_order_not_label_order(self, ledger_file):
        """PLANTED: set numbers are ALLOCATION order, not execution order.

        Set 121 S1 measured sets 115 and 118 executing after 119. A ring
        that sorted its labels would report the wrong "most recent use"
        for exactly those sets, and the retention decision reads that
        field.
        """
        gl.record_citation(["L-1-1"], set_number=119, session_number=1,
                           path=ledger_file)
        gl.record_citation(["L-1-1"], set_number=115, session_number=1,
                           path=ledger_file)
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["L-1-1"].uses == ["115-01", "119-01"]
        assert ledger.entries["L-1-1"].uses != sorted(
            ledger.entries["L-1-1"].uses, reverse=True
        )

    def test_an_over_long_ring_on_disk_is_reported(self):
        _ledger, problems = gl.parse_ledger(
            {"entries": {"L-1-1": {"kind": "instruction",
                                   "uses": [f"100-{i:02d}" for i in range(1, 13)]}}}
        )
        assert any("ring capacity" in p for p in problems)


# --- a use is a CITATION for an instruction and a FIRE for a check -----------


class TestRunsCannotMasqueradeAsFires:
    """The rule that makes check retention meaningful at all.

    Recording mere execution would be worthless: a check that runs in CI
    every session would look permanently in use. So the recorded event is
    that the check **caught** something — and that is enforced by the
    writer, not by convention.
    """

    def test_a_check_cannot_earn_a_use_by_being_cited(self, ledger_file):
        gl.upsert_entry("K-1-1", kind=gl.KIND_EXECUTABLE, cost=gl.COST_EXPENSIVE,
                        path=ledger_file)
        outcomes = gl.record_citation(["K-1-1"], set_number=120, session_number=1,
                                      path=ledger_file)
        assert outcomes["K-1-1"] == "kind-mismatch"
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["K-1-1"].uses == []

    def test_an_instruction_cannot_earn_a_use_by_firing(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=120, session_number=1,
                           path=ledger_file)
        outcomes = gl.record_fire(["L-1-1"], set_number=121, session_number=1,
                                  path=ledger_file)
        assert outcomes["L-1-1"] == "kind-mismatch"
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["L-1-1"].uses == ["120-01"]

    def test_the_look_alike_each_records_its_own_kind(self, ledger_file):
        gl.upsert_entry("K-1-1", kind=gl.KIND_EXECUTABLE, cost=gl.COST_EXPENSIVE,
                        path=ledger_file)
        assert gl.record_fire(["K-1-1"], set_number=120, session_number=1,
                              path=ledger_file)["K-1-1"] == "recorded"
        assert gl.record_citation(["L-1-1"], set_number=120, session_number=1,
                                  path=ledger_file)["L-1-1"] == "recorded"

    def test_an_executable_must_declare_a_cost(self, ledger_file):
        """The retention rule for a check is CHOSEN by its cost, so an
        undeclared cost is an ungoverned check."""
        with pytest.raises(ValueError, match="must declare a cost"):
            gl.upsert_entry("K-1-1", kind=gl.KIND_EXECUTABLE, path=ledger_file)
        _ledger, problems = gl.parse_ledger(
            {"entries": {"K-1-1": {"kind": "executable", "uses": []}}}
        )
        assert any("must declare a cost" in p for p in problems)


# --- retention: reports, never evicts ----------------------------------------


TIMELINE = [f"{s:03d}-{n:02d}" for s in range(130, 100, -1) for n in (3, 2, 1)]


def _report(ledger, **over):
    kwargs = dict(
        session_timeline=TIMELINE,
        instruction_window_sessions=30,
        check_window_sets=20,
    )
    kwargs.update(over)
    return {v.entry_id: v for v in gl.retention_report(ledger, **kwargs)}


class TestRetentionRules:
    def test_the_timeline_fixture_is_non_empty(self):
        """corpus check (L-112-1): a window over an empty timeline would
        mark everything a candidate and read as a working rule."""
        assert len(TIMELINE) == 90

    def test_an_instruction_used_inside_the_window_is_retained(self):
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["129-02"])
        })
        v = _report(ledger, governed_ids=["L-1-1"])["L-1-1"]
        assert v.status == gl.RETAIN
        assert v.uses_in_window == 1

    def test_an_instruction_used_only_outside_the_window_is_a_candidate(self):
        """PLANTED: 30 sessions back is ~10 sets, so 118-01 is outside."""
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["118-01"])
        })
        v = _report(ledger, governed_ids=["L-1-1"])["L-1-1"]
        assert v.status == gl.CANDIDATE
        assert "118-01" in v.reason

    def test_a_never_cited_instruction_is_distinguished_from_a_lapsed_one(self):
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=[])
        })
        assert _report(ledger, governed_ids=["L-1-1"])["L-1-1"].status == gl.UNUSED

    def test_a_cheap_check_is_permanent_even_having_never_fired(self):
        """LOOK-ALIKE for the expensive rule: cheap checks are free
        insurance that never expires and need no usage record at all."""
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE,
                                    cost=gl.COST_CHEAP, uses=[])
        })
        v = _report(ledger, governed_ids=[])["K-1-1"]
        assert v.status == gl.PERMANENT

    def test_an_expensive_check_that_never_fired_is_surfaced(self):
        """PLANTED: this is L-112-1 itself — a gate that never fires is
        indistinguishable from a useless one."""
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE,
                                    cost=gl.COST_EXPENSIVE, uses=[])
        })
        v = _report(ledger, governed_ids=[])["K-1-1"]
        assert v.status == gl.UNUSED
        assert "never" in v.reason

    def test_an_expensive_check_that_fired_recently_is_retained(self):
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE,
                                    cost=gl.COST_EXPENSIVE, uses=["128-01"])
        })
        assert _report(ledger, governed_ids=[])["K-1-1"].status == gl.RETAIN

    def test_an_expensive_check_that_last_fired_long_ago_is_a_candidate(self):
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE,
                                    cost=gl.COST_EXPENSIVE, uses=["105-01"])
        })
        assert _report(ledger, governed_ids=[])["K-1-1"].status == gl.CANDIDATE

    def test_an_archived_instruction_is_history_only(self):
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["105-01"])
        })
        assert _report(ledger, governed_ids=[])["L-1-1"].status == gl.NOT_IN_CORPUS

    def test_a_check_stays_governed_after_its_prose_is_archived(self):
        """PLANTED LOOK-ALIKE for the scoping rule.

        Encoding a lesson is precisely what archives its prose, so
        scoping a check by corpus membership would exempt every check the
        moment it did its job.
        """
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE,
                                    cost=gl.COST_EXPENSIVE, uses=["105-01"])
        })
        v = _report(ledger, governed_ids=[])["K-1-1"]
        assert v.status != gl.NOT_IN_CORPUS

    def test_retention_is_measured_in_sessions_not_elapsed_time(self):
        """A dormant repository must not lose its guidance to the calendar.

        The verdict depends only on the session timeline, so it is
        identical whether those sessions happened last week or last year:
        no timestamp reaches this function at all.
        """
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["129-02"])
        })
        first = _report(ledger, governed_ids=["L-1-1"])["L-1-1"]
        second = _report(ledger, governed_ids=["L-1-1"])["L-1-1"]
        assert first.status == second.status == gl.RETAIN

    def test_a_shorter_window_flips_the_verdict_and_proves_N_binds(self):
        """PLANTED: the window must actually be consulted.

        A rule that ignored N would return the same verdict for every N,
        which is how a retention rule silently becomes a no-op.
        """
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["125-01"])
        })
        wide = _report(ledger, governed_ids=["L-1-1"],
                       instruction_window_sessions=30)["L-1-1"]
        narrow = _report(ledger, governed_ids=["L-1-1"],
                         instruction_window_sessions=3)["L-1-1"]
        assert wide.status == gl.RETAIN
        assert narrow.status == gl.CANDIDATE


class TestThereIsNoEvictPath:
    """Eviction is never automatic and never mid-session (standing
    decision 3). The specific defect that broke the old scheme was an
    orchestrator at 100% of a ceiling evicting prose under time pressure
    — which is how the instruction to run the path-aware critique was
    deleted and became the next round's Major. So the tool cannot do it."""

    def test_the_module_exposes_no_eviction_api(self):
        exported = set(gl.__all__)
        assert exported, "corpus check: __all__ must be non-empty"
        forbidden = {"evict", "prune", "drop_entry", "remove_entry", "archive"}
        assert exported & forbidden == set()

    def test_the_report_leaves_the_ledger_untouched(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        before = Path(ledger_file).read_bytes()
        ledger, _ = gl.load_ledger(path=ledger_file)
        _report(ledger, governed_ids=[])
        assert Path(ledger_file).read_bytes() == before

    def test_the_cli_has_no_evict_subcommand(self, ledger_file, capsys):
        with pytest.raises(SystemExit):
            gl.main(["evict", "L-1-1"])


# --- the writer: sanctioned, locked, atomic ----------------------------------


class TestWriterDiscipline:
    def test_a_held_lock_refuses_a_second_writer(self, ledger_file):
        """PLANTED: two sessions closing minutes apart is not hypothetical
        in this repo. A read-modify-write race would silently drop one
        session's usage record."""
        handle = acquire_file_mutex(gl.lock_path_for(ledger_file),
                                    timeout_seconds=0)
        try:
            with pytest.raises(LockContention):
                gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                                   path=ledger_file, timeout_seconds=0)
        finally:
            release_file_mutex(handle)

    def test_the_lock_is_released_so_the_next_writer_proceeds(self, ledger_file):
        """LOOK-ALIKE: a lock that never released would fail identically
        on the first call and look like correct mutual exclusion."""
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file, timeout_seconds=0)
        gl.record_citation(["L-1-2"], set_number=100, session_number=2,
                           path=ledger_file, timeout_seconds=0)
        ledger, problems = gl.load_ledger(path=ledger_file)
        assert problems == []
        assert set(ledger.entries) == {"L-1-1", "L-1-2"}
        assert not os.path.exists(gl.lock_path_for(ledger_file))

    def test_an_unchanged_record_does_not_rewrite_the_file(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        before = os.stat(ledger_file).st_mtime_ns
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        assert os.stat(ledger_file).st_mtime_ns == before

    def test_a_missing_ledger_is_an_empty_ledger_not_an_error(self, tmp_path):
        ledger, problems = gl.load_ledger(path=str(tmp_path / "nope.json"))
        assert ledger.entries == {} and problems == []

    def test_no_temp_file_survives_a_write(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=100, session_number=1,
                           path=ledger_file)
        assert not os.path.exists(ledger_file + ".tmp")

    def test_a_future_schema_version_is_refused_rather_than_guessed(self):
        _ledger, problems = gl.parse_ledger(
            {"schemaVersion": gl.SCHEMA_VERSION + 1, "entries": {}}
        )
        assert any("newer than this reader" in p for p in problems)

    def test_an_id_outside_the_lesson_namespace_is_accepted(self, ledger_file):
        """The ledger must accept project-guidance ids without a change.

        ``project-guidance.md`` is the SINK lessons are promoted into, so
        a lesson-specific ledger would have guaranteed a rewrite one
        session later.
        """
        gl.record_citation(["G-001"], set_number=121, session_number=3,
                           path=ledger_file)
        ledger, problems = gl.load_ledger(path=ledger_file)
        assert problems == []
        assert ledger.entries["G-001"].uses == ["121-03"]


# --- the active-session timeline ---------------------------------------------


def _events(path: Path, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


class TestTheTimelineIsExecutionOrder:
    def test_sets_are_ordered_by_close_timestamp_not_by_number(self, tmp_path):
        """PLANTED: the exact shape Set 121 S1 measured.

        Set 115 was EXECUTED after set 119. A set-number sort would place
        119's sessions ahead of 115's and put the wrong sessions in the
        retention window.
        """
        base = tmp_path / "docs" / "session-sets"
        _events(base / "119-x" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-10T19:39:00-04:00"},
        ])
        _events(base / "115-y" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-12T09:00:00-04:00"},
        ])
        timeline = gl.active_session_timeline(str(tmp_path))
        assert timeline, "corpus check: no close events were read at all"
        assert timeline == ["115-01", "119-01"]
        assert timeline != sorted(timeline, reverse=True)

    def test_a_repaired_close_counts_as_one_active_session(self, tmp_path):
        """LOOK-ALIKE: a session that closed twice is still one session."""
        base = tmp_path / "docs" / "session-sets"
        _events(base / "120-z" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 2,
             "timestamp": "2026-08-01T10:00:00-04:00"},
            {"event_type": "closeout_succeeded", "session_number": 2,
             "timestamp": "2026-08-01T11:00:00-04:00"},
        ])
        assert gl.active_session_timeline(str(tmp_path)) == ["120-02"]

    def test_non_close_events_do_not_enter_the_timeline(self, tmp_path):
        base = tmp_path / "docs" / "session-sets"
        _events(base / "120-z" / "session-events.jsonl", [
            {"event_type": "work_started", "session_number": 1,
             "timestamp": "2026-08-01T10:00:00-04:00"},
            {"event_type": "closeout_failed", "session_number": 1,
             "timestamp": "2026-08-01T10:30:00-04:00"},
        ])
        assert gl.active_session_timeline(str(tmp_path)) == []

    def test_the_legacy_event_key_is_read_too(self, tmp_path):
        """Older ledgers spell it ``event``/``session``, not
        ``event_type``/``session_number``."""
        base = tmp_path / "docs" / "session-sets"
        _events(base / "028-a" / "session-events.jsonl", [
            {"event": "closeout_succeeded", "session": 1,
             "timestamp": "2026-05-16T18:00:00-04:00"},
        ])
        assert gl.active_session_timeline(str(tmp_path)) == ["028-01"]

    def test_a_corrupt_line_does_not_break_the_timeline(self, tmp_path):
        base = tmp_path / "docs" / "session-sets"
        path = base / "120-z" / "session-events.jsonl"
        path.parent.mkdir(parents=True)
        path.write_text(
            "{not json\n"
            + json.dumps({"event_type": "closeout_succeeded",
                          "session_number": 1,
                          "timestamp": "2026-08-01T10:00:00-04:00"}) + "\n",
            encoding="utf-8",
        )
        assert gl.active_session_timeline(str(tmp_path)) == ["120-01"]

    def test_set_timeline_dedupes_and_keeps_order(self):
        assert gl.active_set_timeline(
            ["120-03", "120-01", "119-02", "121-01"]
        ) == ["120", "119", "121"]


# --- backfill ----------------------------------------------------------------


class TestBackfillFromRecordedHistory:
    def test_history_becomes_a_recency_ordered_ring(self, tmp_path):
        base = tmp_path / "docs" / "session-sets"
        _events(base / "119-a" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-01T10:00:00-04:00",
             "lessons_cited": ["L-1-1", "L-1-2"]},
        ])
        _events(base / "120-b" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 2,
             "timestamp": "2026-08-05T10:00:00-04:00",
             "lessons_cited": ["L-1-1"]},
        ])
        target = str(tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME)
        stats = gl.backfill(str(tmp_path), path=target)
        assert stats["ids"] == 2
        ledger, problems = gl.load_ledger(path=target)
        assert problems == []
        assert ledger.entries["L-1-1"].uses == ["120-02", "119-01"]
        assert ledger.entries["L-1-2"].uses == ["119-01"]

    def test_backfill_is_idempotent(self, tmp_path):
        base = tmp_path / "docs" / "session-sets"
        _events(base / "119-a" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-01T10:00:00-04:00",
             "lessons_cited": ["L-1-1"]},
        ])
        target = str(tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME)
        gl.backfill(str(tmp_path), path=target)
        first = Path(target).read_text(encoding="utf-8")
        gl.backfill(str(tmp_path), path=target)
        assert Path(target).read_text(encoding="utf-8") == first

    def test_backfill_preserves_a_registered_kind(self, tmp_path):
        """LOOK-ALIKE: re-running the migration must not demote a check
        back to an instruction line and hand it the wrong retention rule."""
        base = tmp_path / "docs" / "session-sets"
        _events(base / "119-a" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-01T10:00:00-04:00",
             "lessons_cited": ["L-1-1"]},
        ])
        target = str(tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME)
        gl.upsert_entry("L-1-1", kind=gl.KIND_EXECUTABLE, cost=gl.COST_CHEAP,
                        path=target)
        gl.backfill(str(tmp_path), path=target)
        ledger, _ = gl.load_ledger(path=target)
        assert ledger.entries["L-1-1"].kind == gl.KIND_EXECUTABLE
        assert ledger.entries["L-1-1"].cost == gl.COST_CHEAP


# --- config + the derived numbers --------------------------------------------


# --- round 1 / round 2 remediation falsifiers --------------------------------


class TestLiveIdsAbsentFromTheLedgerAreNotInvisible:
    """Round 1 (two findings, one root cause).

    ``retention_report`` iterated the LEDGER, so a live instruction line
    with no ledger entry — a brand-new lesson, or one of Session 3's
    project-guidance ids — was neither reported nor counted against the
    cap. The anti-rebloat gate could pass on a corpus it could not see.
    """

    def test_an_unregistered_live_id_is_surfaced(self):
        ledger = gl.Ledger(entries={})
        verdicts = _report(ledger, governed_ids=["L-9-9"])
        assert verdicts["L-9-9"].status == gl.UNREGISTERED

    def test_an_unregistered_live_id_counts_against_the_cap(self):
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION, uses=["129-01"]),
        })
        assert gl.instruction_count(ledger, ["L-1-1", "L-9-9"]) == 2

    def test_a_registered_check_is_not_counted_as_an_instruction_line(self):
        """PLANTED LOOK-ALIKE: an encoded check in the corpus is not prose.

        Counting it would inflate the cap's numerator with the very
        entries the encode-or-drop rule removed from the preload.
        """
        ledger = gl.Ledger(entries={
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE, cost=gl.COST_CHEAP),
        })
        assert gl.instruction_count(ledger, ["K-1-1"]) == 0

    def test_the_report_surfaces_an_unregistered_id_without_failing(
        self, tmp_path, capsys
    ):
        """It is COUNTED and NAMED, but it does not fail the command.

        A repo that has not cited anything yet has no ledger at all --
        the normal starting state for every consumer repo, and a gate
        that refuses all of them guards nothing. The failing conditions
        are a malformed ledger and a corpus over its cap.
        """
        planning = tmp_path / "docs" / "planning"
        planning.mkdir(parents=True)
        (planning / "lessons-learned.md").write_text(
            '## A\n<!-- lesson: id="L-9-9" added-set="009" -->\n', encoding="utf-8"
        )
        rc = gl.main(["report", "--repo-root", str(tmp_path)])
        out = capsys.readouterr().out
        assert "unregistered" in out
        assert "instruction lines in the live corpus: 1 / cap" in out
        assert rc == 0

    def test_an_over_cap_corpus_of_unregistered_ids_still_fails(
        self, tmp_path, capsys
    ):
        """LOOK-ALIKE: not failing on 'unregistered' must not disable the
        cap for exactly the entries the cap most needs to see."""
        planning = tmp_path / "docs" / "planning"
        planning.mkdir(parents=True)
        (planning / "lessons-learned.md").write_text(
            "".join(
                f'## L{i}\n<!-- lesson: id="L-9-{i}" added-set="009" -->\n\n'
                for i in range(30)
            ),
            encoding="utf-8",
        )
        rc = gl.main(["report", "--repo-root", str(tmp_path)])
        assert "OVER CAP" in capsys.readouterr().out
        assert rc == 1


class TestCitationHistoryIsNotFireHistory:
    """Round 2. A guidance item that becomes an encoded check must not
    inherit its prose-era citations as *fires*: an expensive check that
    had never caught anything would be retained on the strength of having
    once been prose somebody mentioned."""

    def test_reclassifying_to_a_check_clears_the_citation_ring(self, ledger_file):
        gl.record_citation(["L-1-1"], set_number=129, session_number=1,
                           path=ledger_file)
        assert gl.upsert_entry("L-1-1", kind=gl.KIND_EXECUTABLE,
                               cost=gl.COST_EXPENSIVE,
                               path=ledger_file) == "reclassified"
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["L-1-1"].uses == []
        assert _report(ledger, governed_ids=[])["L-1-1"].status == gl.UNUSED

    def test_backfill_does_not_hand_a_check_citation_labels(self, tmp_path):
        base = tmp_path / "docs" / "session-sets"
        _events(base / "129-a" / "session-events.jsonl", [
            {"event_type": "closeout_succeeded", "session_number": 1,
             "timestamp": "2026-08-01T10:00:00-04:00",
             "lessons_cited": ["L-1-1"]},
        ])
        target = str(tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME)
        gl.upsert_entry("L-1-1", kind=gl.KIND_EXECUTABLE,
                        cost=gl.COST_EXPENSIVE, path=target)
        gl.backfill(str(tmp_path), path=target)
        ledger, _ = gl.load_ledger(path=target)
        assert ledger.entries["L-1-1"].uses == []

    def test_an_instruction_keeps_its_ring_across_a_no_op_upsert(self, ledger_file):
        """PLANTED LOOK-ALIKE: re-registering the SAME kind must not wipe
        real history."""
        gl.record_citation(["L-1-1"], set_number=129, session_number=1,
                           path=ledger_file)
        assert gl.upsert_entry("L-1-1", kind=gl.KIND_INSTRUCTION,
                               path=ledger_file) == "updated"
        ledger, _ = gl.load_ledger(path=ledger_file)
        assert ledger.entries["L-1-1"].uses == ["129-01"]

    def test_the_shipped_checks_carry_no_citation_derived_uses(self):
        """Self-application, on the ledger this session actually ships."""
        repo_root = Path(__file__).resolve().parents[2]
        ledger, problems = gl.load_ledger(
            path=str(repo_root / "docs" / "planning" / gl.LEDGER_FILENAME)
        )
        assert problems == []
        checks = {k: v for k, v in ledger.entries.items()
                  if v.kind == gl.KIND_EXECUTABLE}
        assert checks, "corpus check: the repo must ship at least one check"
        for entry_id, entry in checks.items():
            assert entry.uses == [], (
                f"{entry_id} carries uses that no fire produced"
            )


class TestTheCorpusScanIsDocumentAgnostic:
    """Round 1. ``project-guidance.md`` is the SINK lessons are promoted
    into, and its entries are bullets under level-3 sections — a
    heading-bound scan returns zero ids there while looking like it
    worked, which is L-112-1's exact shape."""

    def test_a_marker_on_a_bullet_is_found(self):
        from guidance_meta import scan_ids

        text = (
            "### Conventions\n\n"
            "- **A rule.** Body text.\n"
            '  <!-- lesson: id="C-003" added-set="121" -->\n'
        )
        assert scan_ids(text) == ["C-003"]

    def test_a_heading_bound_parser_would_have_missed_it(self):
        """The planted contrast that proves the fix is load-bearing."""
        from guidance_meta import parse_document, scan_ids

        text = (
            "### Conventions\n\n"
            "- **A rule.** Body text.\n"
            '  <!-- lesson: id="C-003" added-set="121" -->\n'
        )
        assert [e.meta.id for e in parse_document(text) if e.meta] == []
        assert scan_ids(text) == ["C-003"]

    def test_prose_that_merely_mentions_a_marker_is_not_an_id(self):
        """LOOK-ALIKE: a sentence about the format is not a marker."""
        from guidance_meta import scan_ids

        text = 'Each entry carries `<!-- lesson: id="L-NNN-N" -->` under it.\n'
        assert scan_ids(text) == []

    def test_a_two_segment_project_guidance_id_validates(self):
        from guidance_meta import LessonMeta, validate_meta

        assert validate_meta(LessonMeta(id="C-003")) == []
        assert validate_meta(LessonMeta(id="G-001")) == []
        assert validate_meta(LessonMeta(id="K-121-1")) == []

    def test_a_bare_word_is_still_malformed(self):
        from guidance_meta import LessonMeta, validate_meta

        assert any("malformed" in e for e in validate_meta(LessonMeta(id="banana")))


class TestTheValidationGateSeesProjectGuidance:
    """Round 3 (fix-rejected on L4, correctly).

    The corpus scan and the citation path were made document-agnostic,
    but ``validate_documents`` still walked the heading-bound model and
    ``validate_guidance_meta`` still defaulted to the two lessons files.
    So the gate that is supposed to catch a malformed or duplicated
    project-guidance id would have reported success having inspected
    none of them — the same root cause, one sibling site further on.
    """

    PG = (
        "## Conventions\n\n"
        "### Code Style\n\n"
        "- **A rule.** Body.\n"
        '  <!-- lesson: id="C-003" added-set="121" -->\n'
        "- **Another rule.** Body.\n"
        '  <!-- lesson: id="banana" added-set="121" -->\n'
    )

    def test_a_malformed_bullet_level_id_is_an_error(self):
        from guidance_meta import validate_documents

        result = validate_documents([("project-guidance.md", self.PG)])
        assert "C-003" in result.ids, "corpus check: nothing was scanned"
        assert any("malformed" in e for e in result.errors)

    def test_a_heading_bound_walk_would_have_reported_success(self):
        """The planted contrast: the OLD model validates nothing here."""
        from guidance_meta import parse_document

        assert [e for e in parse_document(self.PG) if e.meta is not None] == []

    def test_duplicate_ids_across_documents_are_caught(self):
        """PLANTED: project-guidance is the SINK lessons are promoted into,
        so it shares the id namespace and a collision must be an error."""
        from guidance_meta import validate_documents

        lessons = '## A\n<!-- lesson: id="C-003" added-set="121" -->\n'
        result = validate_documents([
            ("lessons-learned.md", lessons),
            ("project-guidance.md", self.PG),
        ])
        assert any("duplicate id" in e for e in result.errors)

    def test_a_quoted_marker_in_prose_is_not_validated(self):
        """LOOK-ALIKE: the header block of every guidance file documents
        the marker format inside a code span. Validating it would make
        every guidance file fail on its own instructions."""
        from guidance_meta import validate_documents

        text = (
            "- Every lesson carries a one-line id marker:\n"
            '  `<!-- lesson: id="L-<set>-<seq>" added-set="NNN" -->`.\n'
        )
        result = validate_documents([("lessons-learned.md", text)])
        assert result.ok and result.ids == ()

    def test_the_cli_validates_project_guidance_by_default(self, tmp_path):
        import validate_guidance_meta

        planning = tmp_path / "docs" / "planning"
        planning.mkdir(parents=True)
        (planning / "lessons-learned.md").write_text(
            '## A\n<!-- lesson: id="L-1-1" added-set="001" -->\n', encoding="utf-8"
        )
        (planning / "project-guidance.md").write_text(self.PG, encoding="utf-8")
        paths = validate_guidance_meta._default_files(str(tmp_path))
        assert any(p.endswith("project-guidance.md") for p in paths)
        assert validate_guidance_meta.main([str(p) for p in paths]) == 1

    def test_the_real_repo_corpus_validates_clean(self):
        """Self-application: the corpus this session ships must pass the
        widened gate, on the real files rather than a fixture."""
        import validate_guidance_meta

        repo_root = Path(__file__).resolve().parents[2]
        paths = validate_guidance_meta._default_files(str(repo_root))
        assert len(paths) >= 2, "corpus check: no guidance files were found"
        assert validate_guidance_meta.main([*paths, "--quiet"]) == 0


class TestRetentionSettings:
    def test_the_shipped_config_carries_the_derived_numbers(self):
        """The derivation is only real if the shipped config uses it."""
        import config as router_config

        settings = gl.retention_settings(router_config.load_config())
        assert settings == (30, 20, 25)

    def test_a_missing_block_falls_back_to_the_defaults(self):
        assert gl.retention_settings(None) == (
            gl.DEFAULT_INSTRUCTION_WINDOW_SESSIONS,
            gl.DEFAULT_CHECK_WINDOW_SETS,
            gl.DEFAULT_INSTRUCTION_LINE_CAP,
        )
        assert gl.retention_settings({"guidance": {}}) == (
            gl.DEFAULT_INSTRUCTION_WINDOW_SESSIONS,
            gl.DEFAULT_CHECK_WINDOW_SETS,
            gl.DEFAULT_INSTRUCTION_LINE_CAP,
        )

    @pytest.mark.parametrize("bad", [0, -1, True, "30", 30.0, None])
    def test_a_malformed_value_falls_back_rather_than_corrupting_the_window(
        self, bad
    ):
        settings = gl.retention_settings(
            {"guidance": {"retention": {"instruction_window_sessions": bad}}}
        )
        assert settings[0] == gl.DEFAULT_INSTRUCTION_WINDOW_SESSIONS

    def test_instruction_count_is_scoped_to_the_live_corpus(self):
        ledger = gl.Ledger(entries={
            "L-1-1": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION),
            "L-1-2": gl.LedgerEntry(kind=gl.KIND_INSTRUCTION),
            "K-1-1": gl.LedgerEntry(kind=gl.KIND_EXECUTABLE, cost=gl.COST_CHEAP),
        })
        assert gl.instruction_count(ledger) == 2
        assert gl.instruction_count(ledger, ["L-1-1"]) == 1


# --- the CLI -----------------------------------------------------------------


class TestTheCli:
    def test_validate_passes_on_the_real_repo_ledger(self):
        """Self-application: the ledger this session shipped must be valid
        by its own validator."""
        repo_root = Path(__file__).resolve().parents[2]
        target = str(repo_root / "docs" / "planning" / gl.LEDGER_FILENAME)
        assert os.path.isfile(target), (
            "corpus check: the repo ledger must exist for this to prove "
            "anything"
        )
        ledger, problems = gl.load_ledger(path=target)
        assert problems == []
        assert ledger.entries, "the shipped ledger must not be empty"
        assert gl.main(["validate", "--repo-root", str(repo_root)]) == 0

    def test_validate_fails_on_a_planted_numeric_use(self, tmp_path, capsys):
        target = tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME
        target.parent.mkdir(parents=True)
        target.write_text(
            json.dumps({"schemaVersion": 1,
                        "entries": {"L-1-1": {"kind": "instruction",
                                              "uses": [120.10]}}}),
            encoding="utf-8",
        )
        assert gl.main(["validate", "--repo-root", str(tmp_path)]) == 1
        assert "INVALID" in capsys.readouterr().out

    def test_report_flags_an_over_cap_corpus(self, tmp_path, capsys):
        target = tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME
        target.parent.mkdir(parents=True)
        entries = {
            f"L-1-{i}": {"kind": "instruction", "uses": ["120-01"]}
            for i in range(30)
        }
        target.write_text(json.dumps({"schemaVersion": 1, "entries": entries}),
                          encoding="utf-8")
        (target.parent / "lessons-learned.md").write_text(
            "".join(
                f'## L{i}\n<!-- lesson: id="L-1-{i}" added-set="001" -->\n\n'
                for i in range(30)
            ),
            encoding="utf-8",
        )
        rc = gl.main(["--repo-root", str(tmp_path), "report"])
        out = capsys.readouterr().out
        assert "OVER CAP" in out
        assert rc == 1

    def test_report_is_quiet_under_the_cap(self, tmp_path, capsys):
        target = tmp_path / "docs" / "planning" / gl.LEDGER_FILENAME
        target.parent.mkdir(parents=True)
        target.write_text(
            json.dumps({"schemaVersion": 1,
                        "entries": {"L-1-1": {"kind": "instruction",
                                              "uses": ["120-01"]}}}),
            encoding="utf-8",
        )
        rc = gl.main(["--repo-root", str(tmp_path), "report"])
        assert "OVER CAP" not in capsys.readouterr().out
        assert rc == 0
