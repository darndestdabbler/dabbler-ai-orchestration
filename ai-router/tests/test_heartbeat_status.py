"""Tests for ai-router/heartbeat_status.py — Set 005 / Session 1.

Coverage shape:
* collect_status() shape (extension's JSON contract).
* Provider discovery via capacity_signal.jsonl presence.
* Field naming with the lookback embedded (e.g. completions_in_last_60min).
* Disclaimer field is present on both the top-level payload and per-provider.
* CLI smoke test (json + text).
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import capacity  # type: ignore[import-not-found]
import heartbeat_status  # type: ignore[import-not-found]


AI_ROUTER_DIR = Path(capacity.__file__).resolve().parent


@pytest.fixture
def base_dir(tmp_path: Path) -> Path:
    return tmp_path / "provider-queues"


def _emit_signal(base_dir: Path, provider: str, **fields):
    capacity.write_capacity_signal(
        provider, fields, base_dir=str(base_dir)
    )


# --------------------------------------------------------------------------
# collect_status
# --------------------------------------------------------------------------

def test_collect_status_no_base_dir_returns_empty(tmp_path: Path):
    payload = heartbeat_status.collect_status(
        base_dir=tmp_path / "nope",
    )
    assert payload["providers"] == {}
    assert payload["_disclaimer"] == heartbeat_status.DISCLAIMER


def test_collect_status_discovers_signal_files(base_dir: Path):
    _emit_signal(
        base_dir, "anthropic",
        task_type="session-verification",
        tokens_input=100, tokens_output=50,
    )
    _emit_signal(
        base_dir, "openai",
        task_type="documentation",
        tokens_input=200, tokens_output=80,
    )
    payload = heartbeat_status.collect_status(base_dir=base_dir)
    assert set(payload["providers"].keys()) == {"anthropic", "openai"}


def test_collect_status_emits_lookback_in_field_names(base_dir: Path):
    _emit_signal(base_dir, "anthropic", tokens_input=10, tokens_output=20)
    payload = heartbeat_status.collect_status(
        base_dir=base_dir, lookback_minutes=42
    )
    info = payload["providers"]["anthropic"]
    assert "completions_in_last_42min" in info
    assert "tokens_in_last_42min" in info
    assert info["lookback_minutes"] == 42


def test_collect_status_disclaimer_present_at_both_levels(base_dir: Path):
    _emit_signal(base_dir, "anthropic", tokens_input=1, tokens_output=1)
    payload = heartbeat_status.collect_status(base_dir=base_dir)
    assert payload["_disclaimer"] == heartbeat_status.DISCLAIMER
    assert (
        payload["providers"]["anthropic"]["_disclaimer"]
        == heartbeat_status.DISCLAIMER
    )


def test_collect_status_minutes_since_last_completion(base_dir: Path):
    # Emit a signal — minutes_since should be 0 or very small.
    _emit_signal(base_dir, "anthropic", tokens_input=5, tokens_output=5)
    payload = heartbeat_status.collect_status(base_dir=base_dir)
    info = payload["providers"]["anthropic"]
    assert info["last_completion_at"] is not None
    assert info["signal_file_present"] is True
    assert info["minutes_since_last_completion"] is not None
    assert info["minutes_since_last_completion"] >= 0


def test_collect_status_provider_filter_missing_provider(base_dir: Path):
    payload = heartbeat_status.collect_status(
        base_dir=base_dir, provider_filter="nonexistent"
    )
    info = payload["providers"]["nonexistent"]
    assert info["signal_file_present"] is False
    assert info["last_completion_at"] is None
    assert info["minutes_since_last_completion"] is None


def test_collect_status_invalid_lookback_raises(base_dir: Path):
    with pytest.raises(ValueError, match="lookback_minutes must be positive"):
        heartbeat_status.collect_status(base_dir=base_dir, lookback_minutes=0)


def test_collect_status_completions_count_in_window(base_dir: Path):
    for _ in range(3):
        _emit_signal(base_dir, "anthropic", tokens_input=10, tokens_output=20)
    payload = heartbeat_status.collect_status(
        base_dir=base_dir, lookback_minutes=60
    )
    info = payload["providers"]["anthropic"]
    assert info["completions_in_last_60min"] == 3
    assert info["tokens_in_last_60min"] == 90  # 3 * (10 + 20)


# --------------------------------------------------------------------------
# CLI smoke
# --------------------------------------------------------------------------

def test_cli_json_format(base_dir: Path):
    _emit_signal(base_dir, "anthropic", tokens_input=10, tokens_output=20)
    proc = subprocess.run(
        [
            sys.executable, "-m", "heartbeat_status",
            "--base-dir", str(base_dir),
            "--format", "json",
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(proc.stdout)
    assert "providers" in payload
    assert "_disclaimer" in payload
    assert payload["_disclaimer"] == heartbeat_status.DISCLAIMER
    assert "anthropic" in payload["providers"]


def test_cli_text_format_runs_with_disclaimer(base_dir: Path):
    _emit_signal(base_dir, "anthropic", tokens_input=10, tokens_output=20)
    proc = subprocess.run(
        [
            sys.executable, "-m", "heartbeat_status",
            "--base-dir", str(base_dir),
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    assert "anthropic" in proc.stdout
    assert "Observational only" in proc.stdout


def test_cli_empty_workspace_still_renders_disclaimer(base_dir: Path):
    proc = subprocess.run(
        [
            sys.executable, "-m", "heartbeat_status",
            "--base-dir", str(base_dir),
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    assert "Observational only" in proc.stdout
