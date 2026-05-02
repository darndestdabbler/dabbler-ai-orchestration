"""Unit tests for ai_router/capacity.py — Set 004 / Session 2.

Coverage:

* ``write_capacity_signal`` round-trips through ``read_capacity_summary``.
* All four ``CapacitySummary`` time fields make sense at boundaries
  (no completions, single completion, in-window vs out-of-window).
* Window math against an injected ``now`` is deterministic.
* Best-effort writes do not raise on a missing parent (we create it)
  and do not crash the caller on permission errors.
* Malformed lines in the .jsonl log are skipped, not fatal.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import capacity  # noqa: E402  (conftest puts ai_router/ on sys.path)
from capacity import (
    CAPACITY_SIGNAL_FILENAME,
    DEFAULT_LOOKBACK_MINUTES,
    CapacitySummary,
    read_capacity_summary,
    write_capacity_signal,
)


# --------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------

@pytest.fixture
def queues_dir(tmp_path: Path) -> Path:
    """An empty ``provider-queues/`` for one test."""
    d = tmp_path / "provider-queues"
    d.mkdir()
    return d


def _signal_lines(queues_dir: Path, provider: str) -> list[dict]:
    path = queues_dir / provider / CAPACITY_SIGNAL_FILENAME
    if not path.is_file():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(json.loads(line))
    return out


# ====================================================================
# write_capacity_signal
# ====================================================================

class TestWriteCapacitySignal:
    def test_creates_provider_dir_if_missing(self, queues_dir: Path):
        # Provider dir does not exist yet.
        assert not (queues_dir / "openai").exists()
        write_capacity_signal(
            "openai",
            {"task_type": "verification", "tokens_input": 10,
             "tokens_output": 5, "elapsed_seconds": 1.5,
             "model_name": "gpt-x"},
            base_dir=str(queues_dir),
        )
        assert (queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME).is_file()

    def test_record_shape_is_complete(self, queues_dir: Path):
        write_capacity_signal(
            "openai",
            {"task_type": "verification", "tokens_input": 10,
             "tokens_output": 5, "elapsed_seconds": 1.5,
             "model_name": "gpt-x"},
            base_dir=str(queues_dir),
        )
        recs = _signal_lines(queues_dir, "openai")
        assert len(recs) == 1
        rec = recs[0]
        assert rec["provider"] == "openai"
        assert rec["task_type"] == "verification"
        assert rec["tokens_input"] == 10
        assert rec["tokens_output"] == 5
        assert rec["elapsed_seconds"] == 1.5
        assert rec["model_name"] == "gpt-x"
        # Timestamp parses as ISO-8601 with offset.
        ts = datetime.fromisoformat(rec["timestamp"])
        assert ts.tzinfo is not None

    def test_missing_metadata_fields_become_null(self, queues_dir: Path):
        write_capacity_signal(
            "openai",
            {"task_type": "verification"},  # everything else absent
            base_dir=str(queues_dir),
        )
        rec = _signal_lines(queues_dir, "openai")[0]
        assert rec["tokens_input"] is None
        assert rec["tokens_output"] is None
        assert rec["elapsed_seconds"] is None
        assert rec["model_name"] is None

    def test_unknown_metadata_keys_are_ignored(self, queues_dir: Path):
        # Schema is fixed — extra keys must not bleed through.
        write_capacity_signal(
            "openai",
            {"task_type": "verification", "junk_key": "should_not_persist"},
            base_dir=str(queues_dir),
        )
        rec = _signal_lines(queues_dir, "openai")[0]
        assert "junk_key" not in rec

    def test_appends_one_line_per_call(self, queues_dir: Path):
        for i in range(3):
            write_capacity_signal(
                "openai", {"task_type": f"task-{i}"},
                base_dir=str(queues_dir),
            )
        assert len(_signal_lines(queues_dir, "openai")) == 3

    def test_oserror_is_swallowed(self, monkeypatch, queues_dir: Path):
        # The heartbeat must never crash the role-loop. Patch open() to
        # raise so any actual filesystem write would fail; the function
        # should still return without raising.
        def _boom(*args, **kwargs):
            raise OSError("simulated FS hiccup")

        monkeypatch.setattr("builtins.open", _boom)
        # Should not raise. Path is returned unconditionally.
        path = write_capacity_signal(
            "openai", {"task_type": "verification"},
            base_dir=str(queues_dir),
        )
        assert "openai" in path


# ====================================================================
# read_capacity_summary — empty / missing
# ====================================================================

class TestReadCapacitySummaryEmpty:
    def test_no_signal_file_yet(self, queues_dir: Path):
        s = read_capacity_summary("openai", base_dir=str(queues_dir))
        assert isinstance(s, CapacitySummary)
        assert s.signal_file_present is False
        assert s.last_completion_at is None
        assert s.time_since_last_seconds is None
        assert s.completions_in_window == 0
        assert s.tokens_in_window == 0
        assert s.lookback_minutes == DEFAULT_LOOKBACK_MINUTES

    def test_empty_log_file(self, queues_dir: Path):
        # File exists but is empty (could happen if a daemon was
        # initialized but produced nothing).
        (queues_dir / "openai").mkdir()
        (queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME).write_text(
            "", encoding="utf-8",
        )
        s = read_capacity_summary("openai", base_dir=str(queues_dir))
        assert s.signal_file_present is True
        assert s.last_completion_at is None
        assert s.completions_in_window == 0


# ====================================================================
# read_capacity_summary — single completion
# ====================================================================

class TestReadCapacitySummarySingle:
    def test_in_window_completion(self, queues_dir: Path):
        now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        # Write one signal whose timestamp is 5 minutes before now.
        five_min_ago = (now - timedelta(minutes=5)).isoformat()
        (queues_dir / "openai").mkdir()
        rec = {
            "timestamp": five_min_ago,
            "provider": "openai",
            "task_type": "verification",
            "tokens_input": 100,
            "tokens_output": 50,
            "elapsed_seconds": 2.0,
            "model_name": "gpt-x",
        }
        (queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME).write_text(
            json.dumps(rec) + "\n", encoding="utf-8",
        )
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=now,
        )
        assert s.completions_in_window == 1
        assert s.tokens_in_window == 150
        assert s.last_completion_at == five_min_ago
        # 5 minutes = 300 seconds (within tolerance).
        assert s.time_since_last_seconds == pytest.approx(300.0, abs=0.5)

    def test_out_of_window_completion(self, queues_dir: Path):
        now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        two_hours_ago = (now - timedelta(hours=2)).isoformat()
        (queues_dir / "openai").mkdir()
        rec = {
            "timestamp": two_hours_ago,
            "provider": "openai", "task_type": "verification",
            "tokens_input": 100, "tokens_output": 50,
            "elapsed_seconds": None, "model_name": None,
        }
        (queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME).write_text(
            json.dumps(rec) + "\n", encoding="utf-8",
        )
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=now,
        )
        # Completion is older than the lookback window.
        assert s.completions_in_window == 0
        assert s.tokens_in_window == 0
        # But the absolute "last completion" is still tracked.
        assert s.last_completion_at == two_hours_ago
        assert s.time_since_last_seconds == pytest.approx(
            7200.0, abs=0.5
        )


# ====================================================================
# read_capacity_summary — multiple completions
# ====================================================================

class TestReadCapacitySummaryMulti:
    def test_aggregates_in_window_only(self, queues_dir: Path):
        now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        (queues_dir / "openai").mkdir()
        path = queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME
        records = [
            # In-window
            {"timestamp": (now - timedelta(minutes=5)).isoformat(),
             "provider": "openai", "task_type": "v",
             "tokens_input": 10, "tokens_output": 20,
             "elapsed_seconds": None, "model_name": None},
            # In-window
            {"timestamp": (now - timedelta(minutes=30)).isoformat(),
             "provider": "openai", "task_type": "v",
             "tokens_input": 100, "tokens_output": 200,
             "elapsed_seconds": None, "model_name": None},
            # Out-of-window
            {"timestamp": (now - timedelta(minutes=120)).isoformat(),
             "provider": "openai", "task_type": "v",
             "tokens_input": 9999, "tokens_output": 9999,
             "elapsed_seconds": None, "model_name": None},
        ]
        path.write_text(
            "\n".join(json.dumps(r) for r in records) + "\n",
            encoding="utf-8",
        )
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=now,
        )
        assert s.completions_in_window == 2
        assert s.tokens_in_window == 10 + 20 + 100 + 200
        # Latest stamp is the 5-minute-ago one.
        assert s.last_completion_at == (
            now - timedelta(minutes=5)
        ).isoformat()


# ====================================================================
# Robustness
# ====================================================================

class TestReadCapacitySummaryRobustness:
    def test_malformed_line_is_skipped(self, queues_dir: Path):
        now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        (queues_dir / "openai").mkdir()
        path = queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME
        good = json.dumps({
            "timestamp": (now - timedelta(minutes=5)).isoformat(),
            "provider": "openai", "task_type": "v",
            "tokens_input": 1, "tokens_output": 2,
            "elapsed_seconds": None, "model_name": None,
        })
        # A torn write or a corrupt line — must not poison the read.
        path.write_text(
            "not-json-at-all\n" + good + "\n{partial",
            encoding="utf-8",
        )
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=now,
        )
        assert s.completions_in_window == 1
        assert s.tokens_in_window == 3

    def test_missing_token_fields_count_as_zero(self, queues_dir: Path):
        now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        (queues_dir / "openai").mkdir()
        path = queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME
        rec = {
            "timestamp": (now - timedelta(minutes=5)).isoformat(),
            "provider": "openai", "task_type": "v",
            "tokens_input": None, "tokens_output": None,
            "elapsed_seconds": None, "model_name": None,
        }
        path.write_text(json.dumps(rec) + "\n", encoding="utf-8")
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=now,
        )
        # Completion still counts; tokens contribute zero.
        assert s.completions_in_window == 1
        assert s.tokens_in_window == 0

    def test_naive_now_against_aware_record_does_not_crash(
        self, queues_dir: Path,
    ):
        # Records on disk are always offset-aware (we write
        # ``_utc_now().isoformat()``). A test (or older caller) that
        # injects a NAIVE ``now`` should still produce a sane
        # ``time_since_last`` rather than raising the
        # "can't subtract offset-naive and offset-aware datetimes"
        # error from ``datetime``. Regression for the readability
        # refactor of the timezone-normalization block (verifier
        # finding #1, Set 004 / Session 2).
        aware_now = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        record_ts = (aware_now - timedelta(minutes=5)).isoformat()
        (queues_dir / "openai").mkdir()
        (queues_dir / "openai" / CAPACITY_SIGNAL_FILENAME).write_text(
            json.dumps({
                "timestamp": record_ts,
                "provider": "openai", "task_type": "v",
                "tokens_input": 1, "tokens_output": 1,
                "elapsed_seconds": None, "model_name": None,
            }) + "\n",
            encoding="utf-8",
        )
        # Inject a naive ``now`` matching the same wall-clock instant.
        naive_now = aware_now.replace(tzinfo=None)
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir), now=naive_now,
        )
        assert s.time_since_last_seconds == pytest.approx(300.0, abs=0.5)
        assert s.completions_in_window == 1

    def test_zero_lookback_rejected(self, queues_dir: Path):
        with pytest.raises(ValueError):
            read_capacity_summary(
                "openai", lookback_minutes=0, base_dir=str(queues_dir),
            )

    def test_negative_lookback_rejected(self, queues_dir: Path):
        with pytest.raises(ValueError):
            read_capacity_summary(
                "openai", lookback_minutes=-5,
                base_dir=str(queues_dir),
            )


# ====================================================================
# Round-trip (write -> read same data)
# ====================================================================

class TestRoundTrip:
    def test_write_then_read_observes_one_completion(
        self, queues_dir: Path,
    ):
        # Real wall clock; just check the round-trip is observable.
        write_capacity_signal(
            "openai",
            {"task_type": "verification", "tokens_input": 100,
             "tokens_output": 200, "elapsed_seconds": 1.5,
             "model_name": "gpt-x"},
            base_dir=str(queues_dir),
        )
        s = read_capacity_summary(
            "openai", lookback_minutes=60,
            base_dir=str(queues_dir),
        )
        assert s.signal_file_present is True
        assert s.completions_in_window == 1
        assert s.tokens_in_window == 300
        assert s.last_completion_at is not None
        # Time since last is >= 0 and small — recently written.
        assert s.time_since_last_seconds is not None
        assert s.time_since_last_seconds < 5.0

    def test_to_dict_preserves_fields(self, queues_dir: Path):
        # We need at least one record so to_dict has every field.
        write_capacity_signal(
            "openai", {"task_type": "v", "tokens_input": 1,
                       "tokens_output": 2},
            base_dir=str(queues_dir),
        )
        s = read_capacity_summary(
            "openai", base_dir=str(queues_dir),
        )
        d = s.to_dict()
        assert set(d.keys()) == {
            "provider",
            "signal_file_present",
            "last_completion_at",
            "time_since_last_seconds",
            "completions_in_window",
            "tokens_in_window",
            "lookback_minutes",
        }
