"""Round 2 cross-provider verification for Set 9 Session 3 (D-2).

Round 1 raised four issues:
- Two were context-gaps (fileSystem.ts loader and the close-out.md
  combination-rules block were already updated, but not included in
  the Round 1 prompt). Round 2 surfaces them.
- Two were genuine: pre-mutation rejection tests lacked a "no lock
  acquired" assertion, and there was no unified CLI-level happy-path
  test exercising all three artifacts (WARNING + event + forceClosed).
  Both are fixed in Round 2 deliverables.

The Round 2 prompt narrows the verification ask to the four issues
specifically (rather than re-asking the full Round 1 ask) so the
verifier can confirm or reject the resolutions cleanly.
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


def _slice_filesystem_ts_state_block(filesystem_ts: str) -> str:
    """Return the session-state.json read block in fileSystem.ts."""
    marker = "if (fs.existsSync(statePath)) {"
    start = filesystem_ts.find(marker)
    if start < 0:
        return "(could not locate state-read block)"
    rest = filesystem_ts[start:]
    end = rest.find("    const config = parseSessionSetConfig(specPath);")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_section2(closeout_md: str) -> str:
    marker = "## Section 2 — How to run close-out"
    start = closeout_md.find(marker)
    if start < 0:
        return "(could not locate Section 2)"
    rest = closeout_md[start:]
    end = rest.find("## Section 3 — What the script does")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_unified_cli_test(test_file: str) -> str:
    marker = "def test_force_cli_happy_path_emits_all_artifacts_together("
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate unified CLI test)"
    rest = test_file[start:]
    end = rest.find("def test_force_force_closed_flag_written_via_mark_session_complete")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_no_lock_rejection_tests(test_file: str) -> str:
    """Return the two rejection tests that now assert no-lock-acquired."""
    marker = "def test_force_rejected_without_env_var("
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate rejection tests)"
    rest = test_file[start:]
    end = rest.find("def test_force_rejected_without_reason_file(")
    second_start = end
    end_second = rest.find("def test_force_force_closed_flag_written_via_mark_session_complete(", second_start)
    if end_second < 0:
        end_second = len(rest)
    return rest[:end_second]


def main() -> int:
    ar = _load_ai_router()
    route = ar.route

    filesystem_ts = _read(REPO / "tools" / "dabbler-ai-orchestration" / "src" / "utils" / "fileSystem.ts")
    closeout_md = _read(REPO / "ai-router" / "docs" / "close-out.md")
    skeleton_tests = _read(REPO / "ai-router" / "tests" / "test_close_session_skeleton.py")

    prompt_parts = [
        "## Round 2 verification — Set 9 Session 3 (D-2 hard-scoping of `--force`)",
        "",
        "Round 1 returned four issues. Two were context-gaps (the loader "
        "mapping and the combination-rules doc block were already updated "
        "but not included in Round 1's prompt slices); two were genuine "
        "test-coverage gaps (pre-mutation rejection didn't assert no-lock-"
        "acquired; no unified CLI happy-path test). All four are addressed "
        "below — please confirm or reject.",
        "",
        "## Issue 1 (context-gap): `fileSystem.ts` loader mapping",
        "",
        "Round 1 verbatim issue:",
        "",
        "> tools/dabbler-ai-orchestration/src/fileSystem.ts (or whatever "
        "loads session-state.json into LiveSession) → The runtime mapping "
        "for forceClosed is not shown in the deliverables. types.ts and "
        "SessionSetsProvider.ts can compile and unit-test cleanly while "
        "the real explorer still never sees the field.",
        "",
        "Resolution: the loader mapping was already in place but not "
        "included in the Round 1 prompt. Excerpt below — note the "
        "`forceClosed?: boolean` on the JSON parse-time type and the "
        "`forceClosed: sd.forceClosed ?? null` on the LiveSession "
        "assignment. The badge code reads `set.liveSession?.forceClosed "
        "=== true`, so the loader's `?? null` keeps legacy snapshots "
        "(no `forceClosed` field) reading as `null` rather than `false` "
        "so the type stays accurate to disk shape.",
        "",
        "```typescript",
        _slice_filesystem_ts_state_block(filesystem_ts),
        "```",
        "",
        "## Issue 2 (context-gap): close-out.md §2 combination-rules block",
        "",
        "Round 1 verbatim issue:",
        "",
        "> ai-router/docs/close-out.md combination-rules section/list → "
        "_validate_args now rejects --force with --interactive, "
        "--manual-verify, and --repair, but the shown doc changes only "
        "cover the §2 summary row and §5 narrative. The acceptance "
        "check explicitly asks that the combination-rules list agree.",
        "",
        "Resolution: the combination-rules list IS updated alongside the "
        "flag-summary row — Round 1 sliced only the row and missed the "
        "list. Full §2 below; the relevant addition is the second bullet "
        "(`**--force is hard-scoped to incident recovery**`) which "
        "explicitly names the env-var and `--reason-file` gates and "
        "points readers at §5 for the full contract.",
        "",
        "```markdown",
        _slice_section2(closeout_md),
        "```",
        "",
        "## Issue 3 (genuine fix): rejection tests now assert no-lock-acquired",
        "",
        "Round 1 verbatim issue:",
        "",
        "> ai-router/tests/test_close_session_skeleton.py → The new "
        "rejection tests prove 'no events emitted,' but they do not "
        "prove 'no lock acquired,' which is part of the verification "
        "ask for pre-mutation rejection.",
        "",
        "Resolution: both rejection tests now also assert that "
        "`<session-set>/.close_session.lock` does NOT exist after the "
        "`invalid_invocation` return. Checking the file's absence is "
        "stronger than monkeypatching `acquire_lock` because a "
        "regression that delayed the env-var check past lock "
        "acquisition would leave behind a real `.close_session.lock` "
        "file on disk even after the rejection — exactly the failure "
        "mode the test should catch.",
        "",
        "```python",
        _slice_no_lock_rejection_tests(skeleton_tests),
        "```",
        "",
        "## Issue 4 (genuine fix): unified CLI happy-path test",
        "",
        "Round 1 verbatim issue:",
        "",
        "> Happy-path coverage is split across two layers: run() proves "
        "warning + ledger reason, while mark_session_complete(force=True) "
        "proves forceClosed. That leaves no single operator-path test "
        "showing close_session --force yields all required artifacts "
        "together. **Fix:** add one CLI-level force test that drives "
        "run(args) through a failing-gate scenario and then asserts: "
        "exactly one closeout_force_used event with reason, a WARNING "
        "message, and session-state.json.forceClosed is True.",
        "",
        "Resolution: added `test_force_cli_happy_path_emits_all_artifacts_together` "
        "in `test_close_session_skeleton.py`. Note one deliberate "
        "difference from the verifier's specification: the test asserts "
        "TWO `closeout_force_used` events, not one. The orchestrator's "
        "force-close-out flow runs both layers (`close_session.run` "
        "for the gate/event surface, then `mark_session_complete` for "
        "the snapshot flip), and each layer emits its own "
        "`closeout_force_used` with a distinct payload (`reason` from "
        "the CLI; `failed_checks` from the snapshot-flip). Two events "
        "from two origins is the right forensic granularity — collapsing "
        "to one would lose the per-origin trace. The test asserts both "
        "are present and that their distinct payloads land where "
        "expected.",
        "",
        "```python",
        _slice_unified_cli_test(skeleton_tests),
        "```",
        "",
        "## Test result",
        "",
        "`python -m pytest ai-router/tests` → **676 passed in 55.27s** "
        "(+1 vs Round 1's 675; the new unified CLI test). Extension "
        "TypeScript still typechecks clean (`npx tsc --noEmit -p "
        "tsconfig.json` exits 0).",
        "",
        "## Round 2 verification ask",
        "",
        "Confirm or reject each of the four resolutions above:",
        "",
        "  1. Does the `fileSystem.ts` excerpt show the runtime mapping "
        "from `session-state.json.forceClosed` into "
        "`liveSession.forceClosed`? (Issue 1 closed?)",
        "  2. Does the close-out.md §2 combination-rules block name the "
        "env-var gate AND the reason-file requirement, with a pointer "
        "to §5? (Issue 2 closed?)",
        "  3. Do the rejection tests' new assertions correctly catch "
        "the pre-mutation invariant (lock file does not exist after "
        "rejection)? (Issue 3 closed?)",
        "  4. Does the unified CLI test exercise the full operator path "
        "and assert all required artifacts? Is the deliberate two-event "
        "expectation defensible (one per origin, distinct payloads)? "
        "(Issue 4 closed?)",
        "",
        "Reply with `VERIFIED` if every resolution holds, or "
        "`ISSUES_FOUND` with specific dissents.",
    ]
    prompt = "\n".join(prompt_parts)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-003-round-2-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"wrote prompt: {prompt_path} ({len(prompt)} chars)")

    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=3,
    )

    review_path = out_dir / "session-003-round-2.md"
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
    (out_dir / "session-003-round-2-meta.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
