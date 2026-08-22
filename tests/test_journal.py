"""The journal's durability contract: what it stamps, what it repairs, and
what it refuses to read."""

import json
import subprocess

import pytest

from ai_router import journal
from ai_router.journal import JournalCorrupt


def _actor():
    return journal.actor(journal.ACTOR_FRAMEWORK, "test")


def _checkpoint(root, note="working", run_id="r0001-demo"):
    return journal.append(
        root, event_type="run.checkpoint", run_id=run_id, attempt=1,
        actor=_actor(), summary=note,
        payload={"note": note, "ack_guidance_through": None},
    )


def test_append_stamps_the_envelope_and_reads_back(run_repo):
    root = journal.control_root()
    event = _checkpoint(root, "first")

    assert event["sequence"] == 1
    assert event["repository_id"].startswith("sha256:")
    assert event["occurred_at"][:2] == "20" and len(event["occurred_at"]) > 20
    assert journal.read_events(root) == [event]


def test_sequence_is_allocated_by_the_writer_not_the_caller(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    second = _checkpoint(root, "two")

    assert second["sequence"] == 2
    assert [e["sequence"] for e in journal.read_events(root)] == [1, 2]


def test_control_root_resolves_the_main_worktree_from_a_linked_one(
    run_repo, tmp_path, monkeypatch
):
    linked = tmp_path / "linked"
    subprocess.run(
        ["git", "-C", str(run_repo), "worktree", "add", "-q", "-b", "side",
         str(linked)],
        capture_output=True, check=True,
    )
    monkeypatch.chdir(linked)

    assert journal.control_root() == str(run_repo.resolve())


def test_a_torn_final_line_is_ignored_and_repaired_before_the_next_append(
    run_repo
):
    root = journal.control_root()
    _checkpoint(root, "one")
    path = journal.journal_path(root)
    with open(path, "ab") as handle:
        handle.write(b'{"schema_version": 1, "sequence": 2, "eve')

    assert [e["summary"] for e in journal.read_events(root)] == ["one"]

    _checkpoint(root, "two")
    events = journal.read_events(root)
    assert [e["sequence"] for e in events] == [1, 2]
    assert [e["summary"] for e in events] == ["one", "two"]
    assert b'"eve\n' not in path.read_bytes()


def test_a_complete_final_object_missing_its_newline_is_preserved(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    path = journal.journal_path(root)
    path.write_bytes(path.read_bytes().rstrip(b"\n"))

    assert [e["summary"] for e in journal.read_events(root)] == ["one"]

    _checkpoint(root, "two")
    raw = path.read_bytes()
    assert raw.endswith(b"\n")
    assert [e["summary"] for e in journal.read_events(root)] == ["one", "two"]
    assert b"}{" not in raw


def test_invalid_json_before_the_final_line_fails_closed(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    _checkpoint(root, "two")
    path = journal.journal_path(root)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(b"not json\n" + lines[1])

    with pytest.raises(JournalCorrupt, match="line 1"):
        journal.read_events(root)


def test_a_sequence_gap_fails_closed(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    _checkpoint(root, "two")
    path = journal.journal_path(root)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(lines[0] + lines[0].replace(b'"sequence":1', b'"sequence":3'))

    with pytest.raises(JournalCorrupt, match="gap-free"):
        journal.read_events(root)


def test_a_malformed_payload_is_refused_at_append(run_repo):
    root = journal.control_root()

    with pytest.raises(JournalCorrupt, match="payload"):
        journal.append(
            root, event_type="run.waiting", run_id="r0001-demo", attempt=1,
            actor=_actor(), summary="waiting",
            payload={"reason": "operator"},  # no question
        )
    assert journal.read_events(root) == []


def test_an_unknown_schema_version_is_never_coerced(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    path = journal.journal_path(root)
    path.write_bytes(
        path.read_bytes().replace(b'"schema_version":1', b'"schema_version":9')
    )

    with pytest.raises(JournalCorrupt, match="schema_version 9"):
        journal.read_events(root)


def test_read_after_returns_the_contiguous_suffix(run_repo):
    root = journal.control_root()
    for note in ("one", "two", "three"):
        _checkpoint(root, note)

    tail = journal.read_events(root, after=1)
    assert [e["sequence"] for e in tail] == [2, 3]


def test_a_run_filter_cannot_hide_a_gap(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one", run_id="r0001-demo")
    _checkpoint(root, "two", run_id="r0002-other")
    path = journal.journal_path(root)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(
        lines[0] + lines[1].replace(b'"sequence":2', b'"sequence":5')
    )

    with pytest.raises(JournalCorrupt):
        journal.read_events(root, run_id="r0001-demo")


def test_a_heartbeat_from_a_dead_owner_is_not_liveness(run_repo):
    root = journal.control_root()
    journal.write_heartbeat(root, "r0001-demo", "check/python")
    record = journal.read_heartbeat(root, "r0001-demo")
    assert journal.heartbeat_owner_alive(record)

    stopped = dict(record, pid=999999)
    assert not journal.heartbeat_owner_alive(stopped)


def test_appends_are_serialized_through_the_journal_lock(run_repo):
    root = journal.control_root()
    with journal.journal_lock(root):
        with pytest.raises(journal.LockContentionError):
            with journal.journal_lock(root, wait_seconds=0.05):
                pass


def test_events_are_written_as_one_object_per_line(run_repo):
    root = journal.control_root()
    _checkpoint(root, "one")
    _checkpoint(root, "two")

    lines = journal.journal_path(root).read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert all(json.loads(line)["schema_version"] == 1 for line in lines)


def test_a_lock_being_born_is_not_reclaimed(run_repo):
    """The window between creating the lock file and writing its record is
    the one a contender must not treat as abandonment — reclaiming it is how
    two writers come to believe they both hold the mutex."""
    root = journal.control_root()
    path = journal.machine_dir(root) / journal.LOCK_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")

    assert journal._lock_is_stale(path) is False
    with pytest.raises(journal.LockContentionError):
        with journal.journal_lock(root, wait_seconds=0.05):
            pass


def test_a_holder_never_deletes_a_lock_it_no_longer_owns(run_repo):
    """A holder reclaimed out from under itself must leave its successor's
    lock alone, so the mutex still admits one owner at a time."""
    root = journal.control_root()
    first = journal.journal_lock(root)
    first.__enter__()
    path = first.path
    path.unlink()  # a contender reclaimed it
    second = journal.journal_lock(root)
    second.__enter__()

    first.__exit__()
    assert path.is_file(), "the first holder deleted the second's lock"
    second.__exit__()
    assert not path.exists()


def test_organization_events_name_no_run(run_repo):
    root = journal.control_root()
    event = journal.append(
        root, event_type="organization.cancelled", run_id=None, attempt=1,
        actor=journal.actor(journal.ACTOR_OPERATOR, "operator"),
        summary="cancelled a session",
        payload={
            "target": "session", "set_slug": "001-default",
            "session_number": 1, "reason": "deferred",
        },
    )
    assert event["run_id"] is None
    assert journal.read_events(root)[0]["run_id"] is None


def test_every_other_event_must_name_a_run(run_repo):
    root = journal.control_root()
    with pytest.raises(JournalCorrupt, match="run_id"):
        journal.append(
            root, event_type="run.checkpoint", run_id=None, attempt=1,
            actor=journal.actor(journal.ACTOR_AGENT, "agent"),
            summary="orphan",
            payload={"note": "x", "ack_guidance_through": None},
        )
