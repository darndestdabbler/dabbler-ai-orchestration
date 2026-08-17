"""One full REAL session on a scratch project (Session 3 exit criterion).

Same lifecycle as e2e_sandbox.py but nothing is faked: the verification
round routes a real cross-provider call (orchestrator registers as
anthropic, so the verifier must resolve to a different provider whose
key is present). Requires at least one non-Anthropic DABBLER_* key.

    .venv/Scripts/python scripts/e2e_real_session.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_router import ledger  # noqa: E402
from ai_router.session import close, start  # noqa: E402
from ai_router.verify import run_round  # noqa: E402

SPEC = """# Scratch set

## Sessions

### Session 1 of 1: Add a clamp helper
1. Register.
2. Implement clamp(value, low, high) with tests.
3. Cross-provider verification.
4. Close-out.
"""

CLAMP = '''"""Tiny numeric helpers for the scratch project."""


def clamp(value, low, high):
    """Return *value* bounded to the inclusive range [low, high].

    Raises ValueError when low > high, so a caller cannot silently
    invert the range and get an arbitrary bound back.
    """
    if low > high:
        raise ValueError(f"empty range: low={low!r} > high={high!r}")
    if value < low:
        return low
    if value > high:
        return high
    return value
'''

TESTS = '''from helpers import clamp

import pytest


def test_inside_range_passes_through():
    assert clamp(5, 0, 10) == 5


def test_bounds_are_inclusive():
    assert clamp(0, 0, 10) == 0
    assert clamp(10, 0, 10) == 10


def test_below_and_above_clamp():
    assert clamp(-3, 0, 10) == 0
    assert clamp(99, 0, 10) == 10


def test_inverted_range_raises():
    with pytest.raises(ValueError):
        clamp(1, 10, 0)
'''


def _git(cwd, *args):
    result = subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )
    if result.returncode != 0 and args[0] not in ("push",):
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr}")
    return result


def expect(condition, message):
    if not condition:
        raise SystemExit(f"REAL-E2E FAIL: {message}")
    print(f"  ok: {message}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="dabbler-real-e2e-") as tmp:
        tmp_path = Path(tmp)
        repo = tmp_path / "repo"
        set_dir = repo / "docs" / "session-sets" / "001-scratch"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text(SPEC, encoding="utf-8")
        (repo / ".gitignore").write_text(".dabbler/\n", encoding="utf-8")
        _git(repo, "init", "-q", "-b", "main")
        _git(repo, "config", "user.email", "e2e@example.invalid")
        _git(repo, "config", "user.name", "E2E")
        _git(repo, "config", "commit.gpgsign", "false")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "seed")
        remote = tmp_path / "remote.git"
        subprocess.run(["git", "init", "-q", "--bare", str(remote)],
                       capture_output=True)
        _git(repo, "remote", "add", "origin", str(remote))
        _git(repo, "push", "-q", "-u", "origin", "main")

        print("1) start session (orchestrator: anthropic)")
        code = start(set_dir, engine="claude-code", provider="anthropic")
        expect(code == 0, "session 1 registered")

        print("2) do the work — small and correct, uncommitted, as verified")
        (repo / "helpers.py").write_text(CLAMP, encoding="utf-8")
        (repo / "test_helpers.py").write_text(TESTS, encoding="utf-8")

        print("3) verification rounds (REAL cross-provider calls)")
        rounds_run = 0
        exit_code = 4
        while rounds_run < 3:
            exit_code = run_round(set_dir)
            rounds_run += 1
            rows = ledger.read_rounds(repo, "001-scratch", 1)
            last = rows[-1]
            print(
                f"  round {rounds_run}: exit={exit_code} "
                f"verdict={last['verdict']} verifier={last['verifier_provider']}"
                f"/{last['verifier_model']} cost={last.get('cost_usd')}"
            )
            expect(
                last["verifier_provider"] != "anthropic",
                "verifier provider differs from the orchestrator's",
            )
            if exit_code == 0:
                break
        expect(exit_code == 0, f"verification clean within {rounds_run} rounds")

        print("4) commit + push the verified work, then close")
        _git(repo, "add", "helpers.py", "test_helpers.py")
        _git(repo, "commit", "-q", "-m", "clamp helper (verified)")
        _git(repo, "push", "-q")
        expect(close(set_dir) == 0, "close succeeds")

        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        expect(state["status"] == "complete", "set flipped to complete")
        expect(
            state["sessions"][0]["verificationVerdict"] == "VERIFIED",
            "verdict stamped from the ledger",
        )
        local = _git(repo, "rev-parse", "HEAD").stdout.strip()
        pushed = subprocess.run(
            ["git", "-C", str(remote), "rev-parse", "refs/heads/main"],
            capture_output=True, text=True,
        ).stdout.strip()
        expect(local == pushed, "close commit pushed to the remote")

        print("\nREAL-E2E OK: full lifecycle with a real cross-provider "
              "verification call.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
