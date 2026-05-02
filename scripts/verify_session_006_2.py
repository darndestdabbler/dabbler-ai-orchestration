"""One-shot cross-provider verification for Set 006 / Session 2.

Routes a session-verification task to gemini-pro per the user's
session-pin ("for cross-provider verification, route to Gemini Pro").
Writes the verifier's response and cost line to stdout.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_ai_router():
    """Import ``ai_router`` directly. The previous ``importlib.util.spec_from_file_location`` shim,
    required when the package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the package is installable
    via ``pip install -e .`` from the repo root. The ``sys.path.insert`` covers the case
    where the script is run without the editable install.
    """
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    import ai_router
    return ai_router


def main() -> int:
    bundle_path = Path(os.environ.get("BUNDLE_PATH", "C:/temp/session-006-2-bundle.txt"))
    bundle = bundle_path.read_text(encoding="utf-8", errors="replace")

    context = (
        "Set 006 / Session 2 of `006-docs-fresh-turn-and-alignment-audit`. "
        "Spec at docs/session-sets/006-docs-fresh-turn-and-alignment-audit/spec.md. "
        "Goal of this session: wire the orchestration layer to spawn a fresh "
        "close-out turn after work verification terminates. Mode-aware: in "
        "outsource-first the orchestrator routes a new turn with "
        "task_type='session-close-out' so the close-out agent reads "
        "ai_router/docs/close-out.md; in outsource-last the orchestrator "
        "self-invokes close_session.run in-process (no fresh API turn). The "
        "reconciler from Set 3 (register_sweeper_hook) must be importable as "
        "an orchestrator-startup integration point, and a failed close-out "
        "hook must not strand the session — the next orchestrator startup's "
        "reconciler sweep recovers it.\n\n"
        "Deliverables expected:\n"
        "1. Add session-close-out task type to router-config.yaml "
        "(outsource-first routes to sonnet at low effort).\n"
        "2. New orchestrator wrapper hook (route_fresh_close_out_turn).\n"
        "3. Confirm reconciler register_sweeper_hook() is exported.\n"
        "4. End-to-end tests for both modes + failure path.\n"
        "5. Update Step 6 of docs/ai-led-session-workflow.md to reference "
        "orchestrator-driven close-out routing.\n\n"
        "Look for: regressions in existing flows, mode-detection bugs, the "
        "failure-path handling (does the hook ever raise?), cost-control "
        "drift (does outsource-last ever route a fresh turn?), missing "
        "tests for spec acceptance criteria, drift between the new module's "
        "comments/docstrings and what the code does."
    )
    content = (
        "Review the diff and new files below for correctness, regression risk, "
        "and faithfulness to the Session 2 spec. Be specific about file paths "
        "and line ranges. If you find no substantive issues, say VERIFIED.\n\n"
        f"```\n{bundle}\n```"
    )

    ar = load_ai_router()
    result = ar.query(
        model="gemini-pro",
        content=content,
        task_type="session-verification",
        context=context,
        session_set="006-docs-fresh-turn-and-alignment-audit",
        session_number=2,
    )

    print("=== VERIFIER RESPONSE ===")
    print(result.content)
    print()
    print("=== COST ===")
    print(
        f"model={result.model_name} "
        f"input_tokens={result.input_tokens} "
        f"output_tokens={result.output_tokens} "
        f"cost_usd={result.total_cost_usd:.4f} "
        f"stop_reason={result.escalation_history}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
