"""One-shot cross-provider verification for Set 005 / Session 3.

Routes a code-review task to gemini-pro per the user's session-pin
("route only the cross-provider verification, route to Gemini Pro").
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
    bundle_path = Path(os.environ.get("BUNDLE_PATH", "C:/temp/session-3-bundle.txt"))
    bundle = bundle_path.read_text(encoding="utf-8", errors="replace")

    context = (
        "Set 005 / Session 3 of `005-vscode-extension-and-queue-views`. "
        "Spec at docs/session-sets/005-vscode-extension-and-queue-views/spec.md. "
        "Goal of this session: add a `Provider Heartbeats` tree view (shells out to "
        "`python -m ai_router.heartbeat_status --format json`), mode badges "
        "(`[FIRST]` / `[LAST]` from each spec's `outsourceMode`) on the existing "
        "`Session Sets` tree, and updated docs/tests. The view must frame heartbeat "
        "data as observational only — the cross-provider review of the v1 plan "
        "explicitly rejected predictive framings (subscription-window exhaustion, "
        "throttle risk). Look for: regressions in the existing `Session Sets` / "
        "`Provider Queues` flows, predictive framings that crept into the heartbeats "
        "view, broken type-checks, missed acceptance criteria from the Session 3 "
        "deliverables in spec.md, and bugs in the lookback-N normalization."
    )
    content = (
        "Review the diff and new files below for correctness, regression risk, "
        "and faithfulness to the Session 3 spec. Be specific about file paths "
        "and line ranges. If you find no substantive issues, say VERIFIED.\n\n"
        f"```\n{bundle}\n```"
    )

    ar = load_ai_router()
    result = ar.query(
        model="gemini-pro",
        content=content,
        task_type="code-review",
        context=context,
        session_set="005-vscode-extension-and-queue-views",
        session_number=3,
    )

    print("=== VERIFIER RESPONSE ===")
    print(result.content)
    print()
    print("=== COST ===")
    print(
        f"model={result.model_name} "
        f"input_tokens={result.input_tokens} "
        f"output_tokens={result.output_tokens} "
        f"cost_usd={result.total_cost_usd:.4f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
