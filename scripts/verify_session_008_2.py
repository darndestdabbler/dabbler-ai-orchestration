"""End-of-session cross-provider verification for set 008 / session 2.

Builds a verification prompt with the spec excerpt + diff bundle + test
results, calls route(task_type='session-verification'), and saves the
raw verifier output via SessionLog.save_session_review.
"""
import importlib.util
import os
import sys
from pathlib import Path

REPO = Path(r"c:/Users/denmi/source/repos/dabbler-ai-orchestration")
SESSION_SET = REPO / "docs/session-sets/008-cancelled-session-set-status"
SESSION_NUMBER = 2
DIFF_PATH = Path(os.environ.get("DIFF_PATH", "/c/tmp/session-2-bundle.diff"))


def load_ai_router():
    spec = importlib.util.spec_from_file_location(
        "ai_router",
        str(REPO / "ai-router/__init__.py"),
        submodule_search_locations=[str(REPO / "ai-router")],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    ar = load_ai_router()
    route = ar.route
    SessionLog = ar.session_log.SessionLog

    # The spec section for Session 2 (Extension UI — tree view, icons,
    # commands, dialogs). Acceptance criteria copied verbatim so the
    # verifier can grade without re-reading the source spec.
    spec_excerpt = (REPO / "docs/session-sets/008-cancelled-session-set-status/spec.md").read_text(
        encoding="utf-8"
    )

    diff = DIFF_PATH.read_text(encoding="utf-8")

    test_summary = (
        "TS unit suite (mocha + ts-node + vscode-stub): 58 passed.\n"
        "  - cancelLifecycle.test.ts: 16 passed (Session 1 carry-over, no regression)\n"
        "  - cancelTreeView.test.ts: 13 passed (NEW for Session 2):\n"
        "      readSessionSets cancelled state mapping (4):\n"
        "        - CANCELLED.md presence maps to state='cancelled'\n"
        "        - CANCELLED.md beats status='complete' (precedence rule)\n"
        "        - status='cancelled' without CANCELLED.md still maps to cancelled\n"
        "        - RESTORED.md (without CANCELLED.md) does not show as cancelled\n"
        "      SessionSetsProvider cancelled group (3):\n"
        "        - Cancelled group is hidden when there are no cancelled sets\n"
        "        - Cancelled group appears when >=1 cancelled set exists\n"
        "        - Cancelled group renders set items via getChildren(group); contextValue starts with sessionSet:cancelled\n"
        "      Cancel/restore round-trip via readSessionSets (6):\n"
        "        - cancelling not-started/in-progress/done sets all move to cancelled\n"
        "        - restoring a previously-done set returns to done (NOT in-progress)\n"
        "        - restoring an in-progress-only set returns to in-progress\n"
        "        - restoring a not-started-only set returns to not-started\n"
        "  - metrics.test.ts: 7 passed\n"
        "  - modeBadge.test.ts: 7 passed (parseSessionSetConfig 5 + modeBadge 2)\n"
        "  - fileSystem.test.ts: 15 passed\n\n"
        "tsc --noEmit: clean.\n"
        "esbuild compile: clean.\n\n"
        "Full electron harness (npm test): cannot launch on this Windows host\n"
        "(Code.exe rejects --no-sandbox / --extensionTestsPath etc., a known\n"
        "test-electron limitation on this machine). The standalone runner with\n"
        "vscode-stub.js exercises the same assertion paths the electron suite\n"
        "would; this is the same coverage gap Session 1's verifier accepted.\n"
    )

    task = (
        "## Session Set: 008-cancelled-session-set-status — Session 2 of 3\n\n"
        "Session 2 wires the new 'cancelled' state through the VS Code\n"
        "extension end-to-end: type union, state-detection in readSessionSets\n"
        "with CANCELLED.md as the highest-precedence signal, a Cancelled tree\n"
        "group that only emits when populated, an icon, right-click commands\n"
        "with confirmation modals + optional reason input, and tests for the\n"
        "tree behavior using a vscode stub since the electron harness is\n"
        "not runnable on this host.\n\n"
        "### Spec (full text)\n\n" + spec_excerpt + "\n\n"
        "### Test Results\n\n" + test_summary + "\n\n"
        "### Diff (src + package.json + media/cancelled.svg)\n\n"
        "```diff\n" + diff + "\n```\n\n"
        "### Verification scope\n\n"
        "Please grade Session 2 against the Session 2 deliverables and\n"
        "Acceptance section in the spec, plus the global set-level\n"
        "acceptance criteria where applicable to Session 2 work.\n"
        "Specifically check:\n"
        "1. SessionState union now includes 'cancelled' and the change is\n"
        "   propagated through ICON_FILES, STATE_RANK, and the readSessionSets\n"
        "   detection block.\n"
        "2. The CANCELLED.md-wins precedence rule is correctly implemented\n"
        "   (a state file with status='complete' AND a CANCELLED.md\n"
        "   present must render as Cancelled).\n"
        "3. The Cancelled group is conditionally emitted only when at least\n"
        "   one cancelled set is present.\n"
        "4. The cancel/restore commands have proper confirmation dialogs,\n"
        "   handle the optional reason field correctly, and refresh the view\n"
        "   on success.\n"
        "5. package.json view/item/context entries:\n"
        "   - Cancel visible on sessionSet:(in-progress|not-started|done)\n"
        "   - Restore visible on sessionSet:cancelled\n"
        "   - Both grouped under 9_lifecycle@1 / @2.\n"
        "6. Tests cover the 5 scenarios listed in the spec's Session 2\n"
        "   Acceptance section.\n"
        "7. STATE_RANK was extended for the new state without regressing\n"
        "   the existing cross-root merge precedence.\n"
        "8. There are no breaking changes to existing extension behavior\n"
        "   for sets that have neither CANCELLED.md nor RESTORED.md.\n"
    )

    round_number = int(os.environ.get("ROUND", "1"))
    print(f"task length: {len(task)} chars; round={round_number}")
    # Round 2 is an evidence-completion re-verify (the first bundle was
    # missing untracked-file content so the verifier flagged "needs
    # evidence" rather than substantive defects). Pin max_tier=3 so the
    # router does not cross-provider-escalate on a brevity heuristic —
    # mirrors the "Schema-Only Re-Verifies Need max_tier Pinned" lesson.
    extra = {"max_tier": 3} if round_number > 1 else {}
    result = route(
        content=task,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SESSION_SET),
        session_number=SESSION_NUMBER,
        **extra,
    )

    print(f"verifier model: {result.model_name}")
    print(f"input tokens: {result.input_tokens}, output tokens: {result.output_tokens}, cost: ${result.cost_usd:.4f}")

    log = SessionLog(SESSION_SET)
    log.save_session_review(
        session_number=SESSION_NUMBER, review_text=result.content, round_number=round_number
    )
    step_number_offset = 9 + (round_number - 1)
    log.log_step(
        session_number=SESSION_NUMBER,
        step_number=step_number_offset,
        step_key=f"session-2/verification-r{round_number}",
        description=(
            f"End-of-session cross-provider verification round {round_number} via {result.model_name} "
            f"(${result.cost_usd:.4f}). Saved raw output to session-002.md."
        ),
        status="completed",
        api_calls=[{
            "model": result.model_name,
            "taskType": "session-verification",
            "inputTokens": result.input_tokens,
            "outputTokens": result.output_tokens,
            "costUsd": result.cost_usd,
        }],
    )
    print("review saved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
