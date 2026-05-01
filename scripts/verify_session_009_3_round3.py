"""Round 3 cross-provider verification for Set 9 Session 3 (D-2).

Round 2 confirmed three of four resolutions. The remaining Minor
issue (rejection tests should spy on ``acquire_lock`` rather than
relying on on-disk file absence) is now fixed: both rejection tests
monkeypatch ``close_session.acquire_lock`` to a spy and assert it was
never invoked, with the on-disk absence check kept as a secondary
defensive assertion. This minimal Round 3 prompt asks only for
confirmation of that single fix.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SET_DIR = REPO / "docs" / "session-sets" / "009-alignment-audit-followups"


def _load_ai_router():
    spec = importlib.util.spec_from_file_location(
        "ai_router",
        str(REPO / "ai-router" / "__init__.py"),
        submodule_search_locations=[str(REPO / "ai-router")],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router"] = mod
    spec.loader.exec_module(mod)
    return mod


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _slice_two_rejection_tests(test_file: str) -> str:
    marker = "def test_force_rejected_without_env_var("
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate rejection tests)"
    rest = test_file[start:]
    end = rest.find("def test_force_rejected_with_non_one_env_var(")
    second_block = rest[end:]
    third_marker = "def test_force_cli_happy_path_emits_all_artifacts_together("
    end_second = second_block.find(third_marker)
    if end_second < 0:
        end_second = len(second_block)
    return rest[:end] + second_block[:end_second]


def main() -> int:
    ar = _load_ai_router()
    route = ar.route

    skeleton_tests = _read(REPO / "ai-router" / "tests" / "test_close_session_skeleton.py")

    prompt_parts = [
        "## Round 3 verification — Set 9 Session 3 (D-2 hard-scoping)",
        "",
        "Round 2 confirmed Issues 1, 2, and 4. Issue 3 (rejection tests "
        "should spy on `acquire_lock` rather than relying on on-disk "
        "file absence) is now fixed below. This focused Round 3 asks "
        "only for confirmation of that fix.",
        "",
        "## Round 2 verbatim issue (the one being re-verified)",
        "",
        "> **Issue** → the new assertions do **not** fully prove the "
        "original invariant 'no lock acquired.'",
        "> **Location** → ai-router/tests/test_close_session_skeleton.py "
        "(test_force_rejected_without_env_var, "
        "test_force_rejected_without_reason_file)",
        "> **Fix** → asserting that .close_session.lock is absent *after* "
        "rejection only proves no lock file remained on disk. It does "
        "**not** catch a regression where acquire_lock() is called and "
        "then released before returning invalid_invocation. Add an "
        "explicit spy/monkeypatch around acquire_lock and assert it was "
        "never invoked. Keeping the on-disk absence check as a "
        "secondary assertion is fine.",
        "",
        "## Resolution",
        "",
        "Both rejection tests now:",
        "",
        "  1. Capture `close_session.acquire_lock` and replace it with a "
        "spy that records call args. The spy delegates to the real "
        "implementation if invoked (so the test would fail loudly with "
        "real lock-file artifacts, not silently dodge them) but the "
        "primary assertion is `acquire_calls == []`.",
        "  2. Keep the on-disk absence check (`os.path.exists("
        "<set>/.close_session.lock)` is False) as a secondary defensive "
        "assertion — covers the case where the spy targets the wrong "
        "symbol (e.g. a future refactor that imports acquire_lock under "
        "a different name).",
        "",
        "```python",
        _slice_two_rejection_tests(skeleton_tests),
        "```",
        "",
        "## Test result",
        "",
        "All 34 tests in `test_close_session_skeleton.py` pass. Full "
        "suite still at 676 passed.",
        "",
        "## Verification ask",
        "",
        "Confirm that the spy/monkeypatch resolution closes Issue 3. "
        "Reply `VERIFIED` if so. If anything else surfaces, reply "
        "`ISSUES_FOUND` with the specific dissent.",
    ]
    prompt = "\n".join(prompt_parts)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-003-round-3-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"wrote prompt: {prompt_path} ({len(prompt)} chars)")

    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=3,
    )

    review_path = out_dir / "session-003-round-3.md"
    review_path.write_text(result.content, encoding="utf-8")
    print(f"wrote review: {review_path}")
    print(f"model: {result.model_name}")
    print(f"input_tokens: {result.input_tokens}")
    print(f"output_tokens: {result.output_tokens}")
    print(f"cost_usd: {result.cost_usd}")

    sidecar = {
        "model": result.model_name,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
    }
    (out_dir / "session-003-round-3-meta.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
