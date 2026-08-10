"""Set 058 S3 — cold-start acceptance test (D5).

Boots a throwaway consumer repo from the committed golden render
(``test-fixtures/cold-start/full/`` — the SAME artifacts the TS snapshot test
proves the shared writer emits) and walks the cold-start chain end to end:

    engine file -> docs/dabbler/start-here.md -> active spec.md
        -> start_session -> close via the shared gate.

This is the regression guard for the operator failure that motivated the set:
a freshly scaffolded repo whose missing engine files / start-here left the
orchestrator with no next step. The test asserts the rendered artifacts
(a) carry the cold-start pointers and the verbatim active-set rule, and
(b) register and close cleanly through the sanctioned lifecycle.

Set 112 deleted the Lightweight tier, so the ``lightweight`` fixture tree and
the tier-drives-router-mode link are gone. The router mode is now decided by
the CLI flag / env var alone, which ``test_runtime_mode`` owns.
"""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest

import close_session

# Package-qualified imports on purpose. start_session.main() does
# `from .runtime_mode import ...`, which only resolves when start_session is
# loaded as part of the ai_router package (the production / pip-install path);
# a bare `import start_session` would leave that relative import to
# fail-and-swallow, masking the very tier->mode plumbing this test proves. We
# read the mode through the SAME `ai_router.runtime_mode` object the entry
# point mutates, so the assertion does not depend on the conftest's
# bare-name aliasing holding.
from ai_router import runtime_mode, start_session
from close_session import GateResult, _build_parser, run
from ai_router.runtime_mode import ENV_VAR_NAME
from disposition import Disposition, write_disposition
from session_events import read_events
from session_log import find_active_session_set
from session_state import read_status

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_ROOT = REPO_ROOT / "test-fixtures" / "cold-start"
SET_SLUG = "001-sample-feature"


@pytest.fixture(autouse=True)
def _reset_runtime_mode(monkeypatch):
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    runtime_mode.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()


def _boot_repo(tmp_path: Path) -> Path:
    """Copy the golden render into a throwaway repo dir."""
    src = GOLDEN_ROOT / "full"
    assert src.is_dir(), (
        "golden render missing; regenerate with "
        '"UPDATE_GOLDEN=1 npm run test:unit"'
    )
    dst = tmp_path / "cold-start-repo"
    shutil.copytree(src, dst)
    return dst


def _stub_gates(monkeypatch):
    monkeypatch.setattr(
        close_session,
        "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )
    import session_state

    monkeypatch.setattr(session_state, "_flip_state_to_closed", lambda *_a, **_kw: None)


def _close_args(set_dir: str, **overrides):
    parser = _build_parser()
    args = parser.parse_args(["--session-set-dir", set_dir])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def test_cold_start_chain(tmp_path: Path, monkeypatch):
    repo = _boot_repo(tmp_path)
    set_dir = repo / "docs" / "session-sets" / SET_SLUG

    # --- Link 1: the engine files all hand off to the cold-start doc. ---
    for engine_file in ("CLAUDE.md", "AGENTS.md", "GEMINI.md"):
        body = (repo / engine_file).read_text(encoding="utf-8")
        assert "docs/dabbler/start-here.md" in body, (
            f"{engine_file} does not point to the cold-start operative doc"
        )

    # --- Link 2: start-here.md states the chain + the verbatim active-set rule. ---
    start_here = (repo / "docs" / "dabbler" / "start-here.md").read_text(encoding="utf-8")
    assert "The active session set is the single directory" in start_here
    assert 'status: "in-progress"' in start_here
    assert "exactly one active set" in start_here  # the verbatim CI rule
    assert "lowest" in start_here  # the tie-break: lowest NNN- prefix
    assert "start_session" in start_here and "close_session" in start_here

    # --- Link 3: resolve THE active set from state (one not-started set). ---
    active = find_active_session_set(base_dir=str(repo / "docs" / "session-sets"))
    assert Path(active).name == SET_SLUG
    assert read_status(str(set_dir)) == "not-started"

    # --- Link 4: a scaffolded repo leaves the router ENABLED. ---
    # Set 112: no spec field can switch it off, so a fresh consumer repo is
    # never silently in a no-dispatch mode it did not ask for.
    assert (
        runtime_mode.resolve_no_router_mode(cli_flag=False, session_set_dir=set_dir)
        is False
    ), "a scaffolded repo must resolve router-enabled"
    runtime_mode.reset_for_tests()  # let the real CLI entry re-resolve below

    # --- Link 5: register via the REAL start_session CLI entry point. ---
    # main() resolves+caches the mode, then run() does the boundary write.
    # start_session makes no external calls, so this is hermetic.
    rc = start_session.main(
        [
            "--session-set-dir",
            str(set_dir),
            "--engine",
            "claude-code",
            "--provider",
            "anthropic",
        ]
    )
    assert rc == 0, f"start_session.main exited {rc}"
    assert runtime_mode.is_no_router_mode() is False
    assert read_status(str(set_dir)) == "in-progress"
    assert any(e.event_type == "work_started" for e in read_events(str(set_dir))), (
        "start_session did not append a work_started event"
    )

    # --- Link 6: close via the shared gate (non-final close of session 1). ---
    write_disposition(
        str(set_dir),
        Disposition(
            status="completed",
            summary="cold-start acceptance",
            verification_method="manual-via-other-engine",
            files_changed=["src/feature.py"],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
        ),
    )
    _stub_gates(monkeypatch)
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)  # non-interactive

    reason = set_dir / "reason.md"
    reason.write_text("cold-start manual attestation\n", encoding="utf-8")
    outcome = run(
        _close_args(str(set_dir), manual_verify=True, reason_file=str(reason))
    )

    assert outcome.result == "succeeded", (
        f"close did not succeed: {outcome.result} / {outcome.messages}"
    )
