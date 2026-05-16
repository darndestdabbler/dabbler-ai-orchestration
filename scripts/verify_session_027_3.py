"""Cross-provider verification for Set 027 Session 3.

Verifies the @vscode/test-electron tree-provider harness (TS) and its
Python CLI shim (harness_cli.py). Split into three sub-rounds per the
memory note about >700 LOC bundle timeouts with gpt-5-4.

Usage:
    python scripts/verify_session_027_3.py [--round A|B|C]

Default: all three rounds sequentially.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import ai_router as ar  # type: ignore[import-not-found]


SESSION3_CONTEXT = (
    "Set 027 Session 3 of 4 — @vscode/test-electron tree-provider harness.\n"
    "Reference: docs/session-sets/027-orchestrator-e2e-harness/spec.md\n"
    "Session 3 section.\n\n"
    "Goal: add an extension-side test suite asserting on\n"
    "`SessionSetsProvider.getChildren()` against fixture state. The CLI\n"
    "driving still happens via Python subprocess (no mocking); only the\n"
    "assertion side runs in TS. The Python shim\n"
    "(`ai_router/tests/e2e/harness_cli.py`) wraps the Session 1/2 fixture\n"
    "helpers as a JSON-over-stdout CLI so Node can invoke them.\n\n"
    "Architecture chosen:\n"
    "  * `harness_cli.py` (Python) — JSON-RPC-style CLI dispatcher.\n"
    "    Subcommands: make-set, start, make-activity, make-disposition,\n"
    "    make-change-log, close, cancel, restore, make-additional-set,\n"
    "    make-sibling-worktree. Each emits one JSON object to stdout.\n"
    "    sys.path is patched at module load to find both ai_router/\n"
    "    and ai_router/tests/e2e/ (bare-import convention used by\n"
    "    fixtures.py which the shim delegates to).\n"
    "  * `e2eHarness.ts` (TS) — runHarness() spawns Python subprocess,\n"
    "    parses last stdout line as JSON. Exports typed wrappers:\n"
    "    makeSet, startSession, makeActivity, makeDisposition,\n"
    "    makeChangeLog, closeSession, cancelSet, restoreSet,\n"
    "    makeAdditionalSet, makeSiblingWorktree, driveHappyPath.\n"
    "    Also: replaceWorkspaceFolders (mutates workspaceFolders + waits\n"
    "    for the onDidChangeWorkspaceFolders event), buildProvider\n"
    "    (constructs a fresh SessionSetsProvider for assertions),\n"
    "    cleanupTmpDir (best-effort rmSync swallowing Windows EBUSY).\n"
    "  * Five test files exercising distinct scenarios:\n"
    "    - treeProvider-happy: 6 tests covering not-started, in-flight,\n"
    "      between-sessions, done, refresh-cache invalidation.\n"
    "    - treeProvider-cancel: 4 tests covering cancelled-bucket-only-\n"
    "      when-nonempty, cancel mid-set, restore, cancel not-started.\n"
    "    - treeProvider-force: 3 tests covering mid-set force (downgrade\n"
    "      to In Progress + [FORCED] badge), healthy close negative\n"
    "      control, force tooltip diagnostic.\n"
    "    - treeProvider-multiset: 3 tests covering 3-distinct-states,\n"
    "      alphabetical sort, cancelled-among-three-sets.\n"
    "    - treeProvider-worktree: 3 tests covering sibling worktree\n"
    "      discovery, dedup by name across worktrees, primary-only\n"
    "      negative control.\n"
    "  * `src/test/suite/index.ts` — extended Mocha discovery to recurse\n"
    "    into subdirectories (needed for `e2e/`).\n"
    "  * `src/test/vscode-stub.js` — extended with mutable\n"
    "    workspaceFolders + updateWorkspaceFolders + listener firing,\n"
    "    so `npm run test:unit` exercises the e2e tests without a real\n"
    "    test-electron run (test-electron is broken on this Windows\n"
    "    host — Code.exe 1.120 rejects test-electron 2.5.2's launch\n"
    "    args; pre-existing environment issue, not introduced by\n"
    "    Session 3).\n"
    "  * `package.json` — `test:unit` script fixed to load the vscode-\n"
    "    stub and use TDD ui; was previously broken (missing both).\n\n"
    "Behavioral discoveries made during Session 3 (drift the harness\n"
    "is designed to catch — pinned as test assertions):\n"
    "  1. `register_session_start` (session_state.py:237) OMITS\n"
    "     `completedSessions` key when the value is an empty list,\n"
    "     citing 'absent means none closed yet' schema-doc convention.\n"
    "     The Set 022 in-flight predicate\n"
    "     (SessionSetsProvider.ts:32) requires Array.isArray(...) and\n"
    "     so returns false on a fresh-start snapshot. Result: the\n"
    "     production session-1-of-a-fresh-set view shows '0/N' WITHOUT\n"
    "     the 'session N in flight' annotation the Set 022 unit tests\n"
    "     assume. Session 3 pins the *current* shape and documents the\n"
    "     discrepancy in test comments — not fixed in this session.\n"
    "  2. `isMidSetComplete` (utils/fileSystem.ts:87) returns true\n"
    "     (downgrade to in-progress) whenever currentSession <\n"
    "     totalSessions, regardless of forceClosed/status. Result:\n"
    "     a force-closed mid-set lands in In Progress with [FORCED]\n"
    "     badge, NOT in Done. This is the truthful display the\n"
    "     SessionSetsProvider.ts:36 comment promises but was previously\n"
    "     unverified end-to-end.\n\n"
    "Test results on this host:\n"
    "  * `npm run test:unit` (mocha + ts-node + vscode-stub):\n"
    "    19 new e2e tests pass + 306 existing tests still pass (325\n"
    "    total). 2 pre-existing failures unrelated to this session\n"
    "    (configEditor-foundation ViewColumn.One; notificationsSection\n"
    "    button-disabled regex) — failed before Session 3 changes too.\n"
    "  * `npm test` (full test-electron): blocked by pre-existing\n"
    "    Code.exe/test-electron incompatibility on Windows 11 + VS Code\n"
    "    1.120; documented but not fixed in this session.\n\n"
    "Out of scope for Session 3:\n"
    "  * Fixing the test-electron Windows launch issue.\n"
    "  * Fixing the completedSessions[] omission or the predicate\n"
    "    (both pinned as current behavior — change needs Set 026-style\n"
    "    care with backward-compat).\n"
    "  * Playwright Electron layer (Session 4)."
)

VERIFICATION_ASKS = (
    "Verification asks (think like a verifier on a fast PR review):\n"
    "1. Python shim (harness_cli.py): sys.path mutation at module-load\n"
    "   time. Does it correctly find fixtures.py via the bare-import\n"
    "   convention (`import fixtures`)? Any failure modes when launched\n"
    "   from cwds other than repo root? Any environment variable that\n"
    "   could leak from parent process to break a sub-round's\n"
    "   determinism?\n"
    "2. JSON dispatch contract: each subcommand emits exactly ONE\n"
    "   JSON object via _emit(). The TS side takes the LAST line of\n"
    "   stdout (`lines[lines.length - 1]`) as defense against stray\n"
    "   prints/git output. Is this robust? Could a child process write\n"
    "   non-JSON last-line text in any code path (e.g., git push\n"
    "   warnings on Windows)?\n"
    "3. TS harness (e2eHarness.ts):\n"
    "   (a) REPO_ROOT computed as `path.resolve(__dirname, '..', '..',\n"
    "       '..', '..', '..', '..')` — 6 levels up from\n"
    "       out/test/suite/e2e/. Verify against tsconfig.json (rootDir\n"
    "       src, outDir out). Any off-by-one risk on the path resolution?\n"
    "   (b) replaceWorkspaceFolders awaits the\n"
    "       onDidChangeWorkspaceFolders event. Is the listener\n"
    "       single-fire (sub.dispose() inside callback)? Could a stale\n"
    "       listener from a prior test leak across mocha test\n"
    "       boundaries?\n"
    "   (c) buildProvider constructs a fresh SessionSetsProvider per\n"
    "       test rather than reusing the extension-registered one.\n"
    "       Per-test isolation good — but does the production extension\n"
    "       behavior diverge in any way the tests miss (e.g., the file\n"
    "       watcher's debounce that wires `refresh()` automatically)?\n"
    "4. Mocha discovery (index.ts): recursive `findTestFiles` walks\n"
    "   subdirectories unbounded. Any risk of picking up node_modules\n"
    "   .test.js files? (out/ does NOT contain node_modules.)\n"
    "5. vscode-stub.js extension: workspaceFolders mutation + listener\n"
    "   firing. The stub fires listeners synchronously after mutating\n"
    "   the array. Real VS Code fires asynchronously. Could any test\n"
    "   accidentally depend on async fire ordering that breaks under\n"
    "   real test-electron when it actually runs?\n"
    "6. Are the assertions in each test specific enough to catch the\n"
    "   exact regressions the harness exists for (silent display\n"
    "   drift)? Or are any so loose they'd silently accept a\n"
    "   regressed shape?\n"
    "7. Per-test isolation: tmpdir per test, cleanupTmpDir on\n"
    "   teardown. Could a prior test's workspaceFolders state leak\n"
    "   into the next (the stub's listeners array is shared at module\n"
    "   scope)?\n"
    "8. Edge cases missing from any of the five test files. Especially:\n"
    "   - Cancelled set sort order (lastTouched DESC). Tested in\n"
    "     multiset? Not explicitly — surfaces only as 'one cancelled\n"
    "     row in the bucket' which doesn't exercise sort.\n"
    "   - Worktree where the same slug exists but is cancelled in one\n"
    "     and active in the other (STATE_RANK precedence rule).\n"
    "9. Any documentation drift: the spec mentioned\n"
    "   `dabbler.refreshSessionSets` as the refresh command but the\n"
    "   actual registered command is `dabblerSessionSets.refresh`. The\n"
    "   harness tests bypass commands entirely (uses provider.refresh()\n"
    "   directly) — is that the right call?\n\n"
    "If you find no substantive issues, say VERIFIED. Otherwise list\n"
    "each finding with severity (Blocker / Major / Minor) and\n"
    "file:line references."
)


def _run_round(label: str, bundle: str, session_number: int = 3) -> dict:
    context = f"{SESSION3_CONTEXT}\n\n{VERIFICATION_ASKS}"
    content = (
        f"Review the following Session 3 code ({label}) against the\n"
        f"criteria above. Be specific about file paths and line numbers.\n\n"
        f"{bundle}"
    )
    result = ar.route(
        content=content,
        task_type="session-verification",
        context=context,
        session_set="027-orchestrator-e2e-harness",
        session_number=session_number,
    )
    dump_path = (
        REPO_ROOT / "scripts" / f"verify_session_027_3_result_{label.lower()}.json"
    )
    try:
        as_dict = dataclasses.asdict(result)
    except TypeError:
        as_dict = {k: v for k, v in vars(result).items()}
    cleaned: dict = {}
    for k, v in as_dict.items():
        try:
            json.dumps(v)
            cleaned[k] = v
        except TypeError:
            cleaned[k] = repr(v)
    dump_path.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"  Dumped to {dump_path.name}")
    data = json.loads(dump_path.read_text(encoding="utf-8"))
    print("  === VERIFIER RESPONSE ===")
    print(data.get("content", "<no content>"))
    print()
    print(
        f"  model={data.get('model_name')} "
        f"input_tokens={data.get('input_tokens')} "
        f"output_tokens={data.get('output_tokens')} "
        f"cost_usd={data.get('total_cost_usd')}"
    )
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", choices=["A", "B", "C"], default=None)
    args = parser.parse_args()

    harness_cli_text = (REPO_ROOT / "ai_router/tests/e2e/harness_cli.py").read_text("utf-8")
    e2e_harness_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/e2eHarness.ts"
    ).read_text("utf-8")
    index_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/index.ts"
    ).read_text("utf-8")

    happy_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-happy.test.ts"
    ).read_text("utf-8")
    cancel_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-cancel.test.ts"
    ).read_text("utf-8")
    force_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-force.test.ts"
    ).read_text("utf-8")

    multiset_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-multiset.test.ts"
    ).read_text("utf-8")
    worktree_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-worktree.test.ts"
    ).read_text("utf-8")
    stub_text = (
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/vscode-stub.js"
    ).read_text("utf-8")

    rounds = {
        "A": (
            "Round A: harness_cli.py + e2eHarness.ts + index.ts (test driver layer)",
            (
                f"=== ai_router/tests/e2e/harness_cli.py ===\n{harness_cli_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/e2eHarness.ts ===\n{e2e_harness_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/suite/index.ts ===\n{index_text}\n"
            ),
        ),
        "B": (
            "Round B: treeProvider-happy + treeProvider-cancel + treeProvider-force",
            (
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-happy.test.ts ===\n{happy_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-cancel.test.ts ===\n{cancel_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-force.test.ts ===\n{force_text}\n"
            ),
        ),
        "C": (
            "Round C: treeProvider-multiset + treeProvider-worktree + vscode-stub.js (extended)",
            (
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-multiset.test.ts ===\n{multiset_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/suite/e2e/treeProvider-worktree.test.ts ===\n{worktree_text}\n\n"
                f"=== tools/dabbler-ai-orchestration/src/test/vscode-stub.js ===\n{stub_text}\n"
            ),
        ),
    }

    to_run = [args.round] if args.round else ["A", "B", "C"]
    all_ok = True
    for key in to_run:
        label, bundle = rounds[key]
        print(f"\n{'='*60}")
        print(f"Running {label} ...")
        try:
            _run_round(key, bundle)
        except Exception as exc:
            print(f"ERROR: {exc}")
            all_ok = False

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
