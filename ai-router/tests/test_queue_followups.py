"""Tests for Session 2 of session set 001 — follow-ups + JSONL I/O.

Covers ``add_follow_up`` / ``read_follow_ups`` / max-rounds enforcement and
the ``--export-jsonl`` / ``--import-jsonl`` CLI exposed via ``main()``.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

import queue_db  # type: ignore[import-not-found]
from queue_db import (  # type: ignore[import-not-found]
    DEFAULT_MAX_FOLLOWUP_ROUNDS,
    MAX_FOLLOWUP_ROUNDS_REASON,
    FollowUp,
    ImportNotAllowedError,
    MaxFollowUpRoundsExceeded,
    QueueDB,
    main as queue_db_main,
)

AI_ROUTER_DIR = Path(queue_db.__file__).resolve().parent


@pytest.fixture
def qdb(tmp_path: Path) -> QueueDB:
    return QueueDB(provider="claude", base_dir=tmp_path / "provider-queues")


# --------------------------------------------------------------------------
# add_follow_up + read_follow_ups
# --------------------------------------------------------------------------

def test_round_trip_message_plus_three_follow_ups(qdb: QueueDB):
    mid = qdb.enqueue("codex", "session-verification", {"n": 1}, "k1")
    qdb.add_follow_up(mid, "claude", "first reply")
    qdb.add_follow_up(mid, "codex", "second reply")
    qdb.add_follow_up(mid, "claude", "third reply")
    fus = qdb.read_follow_ups(mid)
    assert len(fus) == 3
    assert [f.from_provider for f in fus] == ["claude", "codex", "claude"]
    assert [f.content for f in fus] == ["first reply", "second reply", "third reply"]
    # ids are monotonically increasing — chronological order is preserved
    assert fus[0].id < fus[1].id < fus[2].id
    # all three see the same parent message
    assert all(f.message_id == mid for f in fus)


def test_read_follow_ups_returns_empty_for_message_with_none(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    assert qdb.read_follow_ups(mid) == []


def test_read_follow_ups_returns_only_for_requested_message(qdb: QueueDB):
    a = qdb.enqueue("codex", "t", {}, "ka")
    b = qdb.enqueue("codex", "t", {}, "kb")
    qdb.add_follow_up(a, "claude", "for a")
    qdb.add_follow_up(b, "claude", "for b")
    assert [f.content for f in qdb.read_follow_ups(a)] == ["for a"]
    assert [f.content for f in qdb.read_follow_ups(b)] == ["for b"]


def test_count_follow_ups(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    assert qdb.count_follow_ups(mid) == 0
    qdb.add_follow_up(mid, "claude", "one")
    qdb.add_follow_up(mid, "claude", "two")
    assert qdb.count_follow_ups(mid) == 2


def test_add_follow_up_to_unknown_message_raises(qdb: QueueDB):
    with pytest.raises(ValueError):
        qdb.add_follow_up(
            "00000000-0000-0000-0000-000000000000", "claude", "hi"
        )


def test_add_follow_up_negative_max_rounds_rejected(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    with pytest.raises(ValueError):
        qdb.add_follow_up(mid, "claude", "x", max_rounds=-1)


# --------------------------------------------------------------------------
# max-rounds enforcement
# --------------------------------------------------------------------------

def test_max_rounds_default_is_three(qdb: QueueDB):
    """Spec line 110-111: 'Configurable max-rounds (default 3)'."""
    assert DEFAULT_MAX_FOLLOWUP_ROUNDS == 3
    mid = qdb.enqueue("codex", "t", {}, "k1")
    # default cap allows exactly 3
    qdb.add_follow_up(mid, "claude", "1")
    qdb.add_follow_up(mid, "claude", "2")
    qdb.add_follow_up(mid, "claude", "3")
    with pytest.raises(MaxFollowUpRoundsExceeded):
        qdb.add_follow_up(mid, "claude", "4")


def test_max_rounds_exceeded_fails_message_with_clear_reason(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=5)
    qdb.claim("worker-1")  # message in 'claimed' state
    qdb.add_follow_up(mid, "claude", "1", max_rounds=2)
    qdb.add_follow_up(mid, "claude", "2", max_rounds=2)
    with pytest.raises(MaxFollowUpRoundsExceeded) as excinfo:
        qdb.add_follow_up(mid, "claude", "3", max_rounds=2)
    assert excinfo.value.message_id == mid
    assert excinfo.value.current_count == 2
    assert excinfo.value.max_rounds == 2
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "failed"
    assert msg.failure_reason == MAX_FOLLOWUP_ROUNDS_REASON
    assert msg.completed_at is not None
    # the over-the-limit follow-up was NOT persisted — this is a refusal,
    # not a "we recorded but won't reply" outcome
    assert qdb.count_follow_ups(mid) == 2


def test_max_rounds_exceeded_does_not_bump_attempts(qdb: QueueDB):
    """Round-limit overflow is human-escalation, not retry failure."""
    mid = qdb.enqueue("codex", "t", {}, "k1", max_attempts=3)
    qdb.claim("worker-1")
    qdb.add_follow_up(mid, "claude", "1", max_rounds=1)
    with pytest.raises(MaxFollowUpRoundsExceeded):
        qdb.add_follow_up(mid, "claude", "2", max_rounds=1)
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "failed"
    assert msg.attempts == 0  # not bumped — this is not a retry failure


def test_max_rounds_zero_forbids_any_follow_up(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    with pytest.raises(MaxFollowUpRoundsExceeded):
        qdb.add_follow_up(mid, "claude", "no-go", max_rounds=0)
    assert qdb.count_follow_ups(mid) == 0
    msg = qdb.get_message(mid)
    # message was state='new' — overflow transitions it to 'failed'
    assert msg is not None
    assert msg.state == "failed"
    assert msg.failure_reason == MAX_FOLLOWUP_ROUNDS_REASON


def test_max_rounds_overflow_leaves_terminal_state_alone(qdb: QueueDB):
    """If the message is already completed/failed/timed_out, overflow
    must not rewrite it. Failure reason is recorded only when meaningful."""
    mid = qdb.enqueue("codex", "t", {}, "k1")
    qdb.claim("worker-1")
    qdb.complete(mid, "worker-1", {"verdict": "VERIFIED"})
    qdb.add_follow_up(mid, "claude", "post-completion clarification", max_rounds=1)
    with pytest.raises(MaxFollowUpRoundsExceeded):
        qdb.add_follow_up(mid, "claude", "second one over", max_rounds=1)
    msg = qdb.get_message(mid)
    assert msg is not None
    assert msg.state == "completed"  # untouched
    assert msg.result == {"verdict": "VERIFIED"}


# --------------------------------------------------------------------------
# export_jsonl / import_jsonl round-trip
# --------------------------------------------------------------------------

def _populate(qdb: QueueDB) -> tuple[str, str]:
    a = qdb.enqueue(
        "codex",
        "session-verification",
        {"files": ["a.py"]},
        "ka",
        session_set="docs/session-sets/foo",
        session_number=1,
    )
    b = qdb.enqueue("codex", "code-review", {"files": ["b.py"]}, "kb")
    qdb.add_follow_up(a, "claude", "clarify line 12")
    qdb.add_follow_up(a, "codex", "fixed in patch v2")
    qdb.claim("worker-1")  # claims a (oldest)
    qdb.complete(a, "worker-1", {"verdict": "VERIFIED"})
    return a, b


def test_export_jsonl_empty_db_returns_no_lines(qdb: QueueDB):
    assert qdb.export_jsonl() == []


def test_export_jsonl_groups_messages_with_follow_ups(qdb: QueueDB):
    a, b = _populate(qdb)
    lines = qdb.export_jsonl()
    parsed = [json.loads(line) for line in lines]
    types = [(p["type"], p.get("id"), p.get("message_id")) for p in parsed]
    # message a, then its 2 follow-ups, then message b (no follow-ups)
    assert types[0] == ("message", a, None)
    assert types[1][0] == "follow_up" and types[1][2] == a
    assert types[2][0] == "follow_up" and types[2][2] == a
    assert types[3] == ("message", b, None)
    assert len(parsed) == 4


def test_export_jsonl_is_deterministic(qdb: QueueDB):
    _populate(qdb)
    first = qdb.export_jsonl()
    second = qdb.export_jsonl()
    assert first == second  # byte-identical between runs


def test_export_jsonl_decodes_payload_and_result(qdb: QueueDB):
    a, _ = _populate(qdb)
    lines = qdb.export_jsonl()
    parsed = [json.loads(line) for line in lines]
    msg_a = next(p for p in parsed if p["type"] == "message" and p["id"] == a)
    # payload and result are real objects, not double-encoded JSON strings
    assert isinstance(msg_a["payload"], dict)
    assert msg_a["payload"] == {"files": ["a.py"]}
    assert isinstance(msg_a["result"], dict)
    assert msg_a["result"] == {"verdict": "VERIFIED"}
    # session metadata round-trips
    assert msg_a["session_set"] == "docs/session-sets/foo"
    assert msg_a["session_number"] == 1


def test_export_then_import_round_trip(tmp_path: Path):
    src = QueueDB(provider="claude", base_dir=tmp_path / "src")
    a, b = _populate(src)
    dump_path = tmp_path / "dump.jsonl"
    line_count = src.export_jsonl_to_path(dump_path)
    assert line_count == 4

    dst = QueueDB(provider="claude", base_dir=tmp_path / "dst")
    msg_count, fu_count = dst.import_jsonl_from_path(dump_path)
    assert (msg_count, fu_count) == (2, 2)

    # post-import, exporting from dst yields the same lines as src
    assert dst.export_jsonl() == src.export_jsonl()
    # state, result, and follow-up content all survived
    msg_a = dst.get_message(a)
    assert msg_a is not None
    assert msg_a.state == "completed"
    assert msg_a.result == {"verdict": "VERIFIED"}
    assert msg_a.session_set == "docs/session-sets/foo"
    fus = dst.read_follow_ups(a)
    assert [f.content for f in fus] == ["clarify line 12", "fixed in patch v2"]
    msg_b = dst.get_message(b)
    assert msg_b is not None and msg_b.state == "new"


def test_import_refuses_non_empty_target(tmp_path: Path):
    src = QueueDB(provider="claude", base_dir=tmp_path / "src")
    src.enqueue("codex", "t", {}, "k1")
    dump = tmp_path / "dump.jsonl"
    src.export_jsonl_to_path(dump)
    dst = QueueDB(provider="claude", base_dir=tmp_path / "dst")
    dst.enqueue("codex", "t", {}, "preexisting")
    with pytest.raises(ImportNotAllowedError):
        dst.import_jsonl_from_path(dump)


def test_import_skips_blank_and_comment_lines(qdb: QueueDB, tmp_path: Path):
    other = QueueDB(provider="codex", base_dir=tmp_path / "other")
    other.enqueue("claude", "t", {"x": 1}, "ko")
    dump_lines = other.export_jsonl()
    augmented = "\n".join(
        ["", "# header comment", *dump_lines, "", "# trailing"]
    )
    dump_path = tmp_path / "augmented.jsonl"
    dump_path.write_text(augmented, encoding="utf-8")
    msg_count, fu_count = qdb.import_jsonl_from_path(dump_path)
    assert msg_count == 1
    assert fu_count == 0


def test_import_unknown_record_type_raises(qdb: QueueDB, tmp_path: Path):
    bogus = tmp_path / "bogus.jsonl"
    bogus.write_text(
        json.dumps({"type": "wat", "id": 1}) + "\n", encoding="utf-8"
    )
    with pytest.raises(ValueError):
        qdb.import_jsonl_from_path(bogus)


# --------------------------------------------------------------------------
# CLI round-trip via main()
# --------------------------------------------------------------------------

def test_cli_export_then_import_round_trip(tmp_path: Path, capsys):
    src_root = tmp_path / "src"
    qdb = QueueDB(provider="claude", base_dir=src_root)
    a, _ = _populate(qdb)
    dump_path = tmp_path / "dump.jsonl"

    rc = queue_db_main(
        [
            "--base-dir",
            str(src_root),
            "export-jsonl",
            "claude",
            "--out",
            str(dump_path),
        ]
    )
    assert rc == 0
    assert dump_path.exists()
    contents = dump_path.read_text(encoding="utf-8")
    assert contents.endswith("\n")
    # all lines parse as JSON
    for line in contents.splitlines():
        if line.strip():
            json.loads(line)

    dst_root = tmp_path / "dst"
    rc = queue_db_main(
        [
            "--base-dir",
            str(dst_root),
            "import-jsonl",
            "claude",
            "--in",
            str(dump_path),
        ]
    )
    assert rc == 0

    dst = QueueDB(provider="claude", base_dir=dst_root)
    msg = dst.get_message(a)
    assert msg is not None
    assert msg.state == "completed"
    assert dst.export_jsonl() == qdb.export_jsonl()


def test_cli_export_to_stdout(tmp_path: Path, capsys):
    src_root = tmp_path / "src"
    qdb = QueueDB(provider="claude", base_dir=src_root)
    qdb.enqueue("codex", "t", {"x": 1}, "k1")
    rc = queue_db_main(
        ["--base-dir", str(src_root), "export-jsonl", "claude"]
    )
    assert rc == 0
    out = capsys.readouterr().out.strip().splitlines()
    assert len(out) == 1
    parsed = json.loads(out[0])
    assert parsed["type"] == "message"
    assert parsed["payload"] == {"x": 1}


def test_cli_via_subprocess(tmp_path: Path):
    """End-to-end smoke: invoke ``python queue_db.py`` as a subprocess."""
    src_root = tmp_path / "src"
    qdb = QueueDB(provider="claude", base_dir=src_root)
    qdb.enqueue("codex", "t", {"x": 1}, "k1")
    qdb.add_follow_up(
        qdb.get_by_idempotency_key("k1").id, "claude", "hello"
    )
    dump_path = tmp_path / "dump.jsonl"
    proc = subprocess.run(
        [
            sys.executable,
            str(AI_ROUTER_DIR / "queue_db.py"),
            "--base-dir",
            str(src_root),
            "export-jsonl",
            "claude",
            "--out",
            str(dump_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, (
        f"subprocess failed: stdout={proc.stdout!r} stderr={proc.stderr!r}"
    )
    assert dump_path.exists()
    lines = [
        json.loads(line)
        for line in dump_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(lines) == 2
    assert lines[0]["type"] == "message"
    assert lines[1]["type"] == "follow_up"


# --------------------------------------------------------------------------
# FollowUp dataclass smoke
# --------------------------------------------------------------------------

def test_follow_up_dataclass_round_trips_via_db(qdb: QueueDB):
    mid = qdb.enqueue("codex", "t", {}, "k1")
    fu_id = qdb.add_follow_up(mid, "claude", "x")
    fus = qdb.read_follow_ups(mid)
    assert len(fus) == 1
    fu = fus[0]
    assert isinstance(fu, FollowUp)
    assert fu.id == fu_id
    assert fu.message_id == mid
    assert fu.from_provider == "claude"
    assert fu.content == "x"
    assert fu.created_at  # ISO timestamp present
