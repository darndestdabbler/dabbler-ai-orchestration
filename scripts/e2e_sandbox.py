"""End-to-end sandbox run (Session 2 exit criterion).

Builds a throwaway git repo with a bare remote, then drives the full
lifecycle: start session -> make a change -> verification round 1 blocks
(scripted fake verifier) -> remediate -> round 2 clean (fix-delta) ->
gates pass -> close flips state and commits/pushes. No network.

    .venv/Scripts/python scripts/e2e_sandbox.py
"""

from __future__ import annotations

import importlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_router import ledger  # noqa: E402
from ai_router.route import RouteResult  # noqa: E402
from ai_router.session import close, register_session_start, start  # noqa: E402
from ai_router.verify import run_round  # noqa: E402

SPEC = """# Sandbox set

## Sessions

### Session 1 of 1: Build the widget
1. Register.
2. Build the widget.
3. Cross-provider verification.
4. Close-out.
"""

BLOCKING = """ISSUES FOUND

- **Issue 1:** widget divides by zero on empty input
  - **Severity:** Major
  - **Failure scenario:** any empty batch crashes
"""

CLEAN = "VERIFIED — attacked the fix delta and could not break it."


def _git(cwd, *args):
    result = subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )
    if result.returncode != 0 and args[0] not in ("push",):
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr}")
    return result


def fake_route(responses):
    queue = list(responses)

    def _route(content, **kwargs):
        return RouteResult(
            content=queue.pop(0), model_name="gpt-5-4", model_id="gpt-5.4",
            provider="openai", tier=3, input_tokens=1000, output_tokens=300,
            cost_usd=0.04, cost_status="measured", complexity_score=70,
            escalated=False, escalation_history=[], elapsed_seconds=0.5,
            transport="api",
        )

    return _route


def expect(condition, message):
    if not condition:
        raise SystemExit(f"E2E FAIL: {message}")
    print(f"  ok: {message}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="dabbler-e2e-") as tmp:
        tmp_path = Path(tmp)
        repo = tmp_path / "repo"
        set_dir = repo / "docs" / "session-sets" / "001-sandbox"
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

        print("1) start session")
        code = start(set_dir, engine="claude-code", provider="anthropic")
        expect(code == 0, "session 1 registered")

        print("2) do the work (with a bug) — uncommitted, as verified")
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs)\n", encoding="utf-8"
        )

        route_mod = importlib.import_module("ai_router.route")
        route_mod.route = fake_route([BLOCKING, CLEAN])

        print("3) verification round 1 (blocks)")
        expect(run_round(set_dir) == 4, "round 1 exits 4 (blocking)")

        print("4) remediate")
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )

        print("5) verification round 2 (fix delta, clean)")
        expect(run_round(set_dir) == 0, "round 2 exits 0 (clean)")
        rounds = ledger.read_rounds(repo, "001-sandbox", 1)
        expect(len(rounds) == 2, "two rounds in the machine ledger")
        expect(rounds[1]["previous_tree"] == rounds[0]["completion_tree"],
               "round 2 anchored on round 1's tree")

        print("6) commit + push the verified work, then close")
        _git(repo, "add", "widget.py")
        _git(repo, "commit", "-q", "-m", "widget (verified)")
        _git(repo, "push", "-q")
        expect(close(set_dir, dry_run=True) == 0, "dry-run gates all pass")
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

        print("\nE2E OK: full lifecycle ran clean in the sandbox.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
