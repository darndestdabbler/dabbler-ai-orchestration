"""Set 086 S1 — Copilot-CLI auth-preflight tests.

The preflight (``copilot_preflight.run_preflight``) gates session start on a
mis-authed seat: binary present -> credential present -> a live probe
authenticates. Every branch is driven off injected seams (``which``,
``credential_dir``, a fake ``spawner``) so the real CLI is never invoked.
"""

from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field
from typing import Optional, Sequence

import copilot_preflight as cp
from cli_transport import ERROR_CLASS_AUTH, ERROR_CLASS_INVALID_MODEL


# ---------------------------------------------------------------------------
# Minimal subprocess fakes (mirrors test_cli_transport; kept local so this
# module never imports another test module).
# ---------------------------------------------------------------------------


class _FakeStream:
    def __init__(self, lines):
        self._lines = iter(lines)

    def readline(self, size: int = -1) -> str:
        try:
            return next(self._lines)
        except StopIteration:
            return ""


@dataclass
class _FakeProcess:
    stdout_lines: list = field(default_factory=list)
    stderr_lines: list = field(default_factory=list)
    exit_code: int = 0
    stdout: _FakeStream = field(init=False)
    stderr: _FakeStream = field(init=False)
    _waited: bool = False

    def __post_init__(self):
        self.stdout = _FakeStream(self.stdout_lines)
        self.stderr = _FakeStream(self.stderr_lines)

    def poll(self) -> Optional[int]:
        return self.exit_code if self._waited else None

    def kill(self) -> None:
        self.exit_code = -9

    def wait(self, timeout: Optional[float] = None) -> int:
        self._waited = True
        return self.exit_code


class _FakeSpawner:
    def __init__(self, process: _FakeProcess):
        self._process = process
        self.calls: list = []

    def __call__(self, argv: Sequence[str], env: Optional[dict]) -> _FakeProcess:
        self.calls.append(list(argv))
        return self._process


_SUCCESS_STDOUT = [
    '{"type": "session.start", "sessionId": "sid-1"}\n',
    '{"type": "assistant.message", "data": {"content": "OK", "model": '
    '"claude-sonnet-4.6", "outputTokens": 1}}\n',
    '{"type": "result", "sessionId": "sid-1", "usage": {"premiumRequests": 1}}\n',
]


def _present_which(name: str) -> Optional[str]:
    return f"/usr/bin/{name}"


def _missing_which(name: str) -> Optional[str]:
    return None


# ---------------------------------------------------------------------------
# Binary stage
# ---------------------------------------------------------------------------


def test_binary_missing_blocks(tmp_path):
    result = cp.run_preflight(
        which=_missing_which,
        credential_dir=tmp_path,  # would pass, but binary check comes first
        spawner=_FakeSpawner(_FakeProcess(stdout_lines=_SUCCESS_STDOUT)),
    )
    assert result.ok is False
    assert result.stage == cp.STAGE_BINARY
    assert result.error_class == cp.ERROR_CLASS_BINARY_MISSING
    assert "npm install -g @github/copilot" in result.message
    assert cp.CHECKLIST_DOC in result.message


# ---------------------------------------------------------------------------
# Credential stage
# ---------------------------------------------------------------------------


def test_credential_missing_blocks_and_skips_probe(tmp_path):
    absent = tmp_path / "no-such-copilot-dir"
    spawner = _FakeSpawner(_FakeProcess(stdout_lines=_SUCCESS_STDOUT))
    result = cp.run_preflight(
        which=_present_which,
        credential_dir=absent,
        spawner=spawner,
    )
    assert result.ok is False
    assert result.stage == cp.STAGE_CREDENTIAL
    assert result.error_class == cp.ERROR_CLASS_CREDENTIAL_MISSING
    assert "copilot login --host" in result.message
    # No billed probe when we can already prove the seat never logged in.
    assert spawner.calls == []


# ---------------------------------------------------------------------------
# Live-probe stage
# ---------------------------------------------------------------------------


def test_live_probe_success_passes(tmp_path):
    spawner = _FakeSpawner(_FakeProcess(stdout_lines=_SUCCESS_STDOUT))
    result = cp.run_preflight(
        model="claude-sonnet-4.6",
        which=_present_which,
        credential_dir=tmp_path,  # exists -> credential present
        spawner=spawner,
    )
    assert result.ok is True
    assert result.stage == cp.STAGE_LIVE_PROBE
    assert result.error_class is None
    assert len(spawner.calls) == 1  # the probe actually dispatched
    # The probe used the requested model.
    assert "claude-sonnet-4.6" in spawner.calls[0]


def test_live_probe_auth_failure_blocks(tmp_path):
    spawner = _FakeSpawner(
        _FakeProcess(
            exit_code=1,
            stderr_lines=["No authentication information found\n"],
        )
    )
    result = cp.run_preflight(
        which=_present_which,
        credential_dir=tmp_path,
        spawner=spawner,
    )
    assert result.ok is False
    assert result.stage == cp.STAGE_LIVE_PROBE
    assert result.error_class == ERROR_CLASS_AUTH
    assert "copilot login --host" in result.message
    # The auth-class re-probe diagnostic ran and is surfaced.
    assert result.details.get("reprobed") is True


def test_live_probe_invalid_model_blocks_with_models_hint(tmp_path):
    spawner = _FakeSpawner(
        _FakeProcess(
            exit_code=1,
            stderr_lines=["The model X from --model flag is not available\n"],
        )
    )
    result = cp.run_preflight(
        which=_present_which,
        credential_dir=tmp_path,
        spawner=spawner,
    )
    assert result.ok is False
    assert result.stage == cp.STAGE_LIVE_PROBE
    assert result.error_class == ERROR_CLASS_INVALID_MODEL
    assert "/models" in result.message


def test_no_live_probe_flag_stops_after_credential(tmp_path):
    spawner = _FakeSpawner(_FakeProcess(stdout_lines=_SUCCESS_STDOUT))
    result = cp.run_preflight(
        which=_present_which,
        credential_dir=tmp_path,
        spawner=spawner,
        run_live_probe=False,
    )
    assert result.ok is True
    assert result.stage == cp.STAGE_CREDENTIAL
    assert spawner.calls == []  # the billed probe was skipped


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------


def test_main_json_output_ok(tmp_path, monkeypatch, capsys):
    # Force the free-checks-only path so main() never shells out.
    monkeypatch.setattr(cp.shutil, "which", _present_which)
    monkeypatch.setattr(
        cp, "_DEFAULT_CREDENTIAL_DIR", tmp_path, raising=True
    )
    rc = cp.main(["--no-live-probe", "--json"])
    assert rc == 0
    out = capsys.readouterr().out
    assert '"ok": true' in out


def test_main_binary_missing_nonzero(monkeypatch, capsys):
    monkeypatch.setattr(cp.shutil, "which", _missing_which)
    rc = cp.main(["--no-live-probe"])
    assert rc == 1
    err = capsys.readouterr().err
    assert "binary stage" in err


def test_blank_model_falls_back_to_default(tmp_path):
    # Round-6 finding: a missing/blank model must not probe an empty --model;
    # it falls back to DEFAULT_PROBE_MODEL instead of failing dispatch.
    for blank in (None, "", "   "):
        spawner = _FakeSpawner(_FakeProcess(stdout_lines=_SUCCESS_STDOUT))
        result = cp.run_preflight(
            model=blank,
            which=_present_which,
            credential_dir=tmp_path,
            spawner=spawner,
        )
        assert result.ok is True
        assert cp.DEFAULT_PROBE_MODEL in spawner.calls[0]
