"""One-shot cross-provider verification for Set 006 / Session 3.

Routes a session-verification task to gemini-pro per the user's
session-pin ("for cross-provider verification, route to Gemini Pro").
Writes the verifier's response and cost line to stdout.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_ai_router():
    init = REPO_ROOT / "ai-router" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "ai_router",
        str(init),
        submodule_search_locations=[str(init.parent)],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    audit_path = REPO_ROOT / "docs/proposals/2026-04-30-combined-design-alignment-audit.md"
    spec_path = REPO_ROOT / "docs/session-sets/009-alignment-audit-followups/spec.md"
    activity_log_path = REPO_ROOT / "docs/session-sets/006-docs-fresh-turn-and-alignment-audit/activity-log.json"

    bundle_parts = [
        "=== docs/proposals/2026-04-30-combined-design-alignment-audit.md ===",
        audit_path.read_text(encoding="utf-8"),
        "",
        "=== docs/session-sets/009-alignment-audit-followups/spec.md ===",
        spec_path.read_text(encoding="utf-8"),
        "",
        "=== docs/session-sets/006-docs-fresh-turn-and-alignment-audit/activity-log.json (session-3 entries only) ===",
        activity_log_path.read_text(encoding="utf-8"),
    ]
    bundle = "\n".join(bundle_parts)

    context = (
        "Set 006 / Session 3 of `006-docs-fresh-turn-and-alignment-audit`. "
        "Spec at docs/session-sets/006-docs-fresh-turn-and-alignment-audit/spec.md. "
        "Goal of this session: produce the cross-provider alignment audit doc, "
        "re-run the 6 failure-injection scenarios, route the audit to BOTH "
        "Gemini Pro and GPT-5.4 for review, append both reviews verbatim, "
        "and either mark the combined design complete (if both said FULLY "
        "ALIGNED) or enumerate drift items as follow-ups (if either flagged "
        "drift).\n\n"
        "Outcome: Gemini Pro returned ALIGNED WITH MINOR DRIFT (2 follow-ups); "
        "GPT-5.4 returned MATERIAL DRIFT (4 corrective actions). Per spec "
        "acceptance criteria, the combined design is NOT marked complete; "
        "instead a corrective session-set spec was created at "
        "docs/session-sets/009-alignment-audit-followups/spec.md covering 5 "
        "sessions (3 corrective + 1 follow-up + 1 re-audit).\n\n"
        "Look for: misclassified drift items (corrective vs follow-up), "
        "factual errors in the audit's implementation citations, missing "
        "drift items the reviewers raised that didn't make it into Section "
        "5.2, missing or inconsistent completion-stamp logic, the corrective "
        "spec's session decomposition (does it actually address each "
        "corrective drift item with concrete acceptance criteria?), drift "
        "between the audit's executive summary and Section 5.3 synthesis."
    )
    content = (
        "Review the alignment audit, the corrective session-set spec, and "
        "the session 3 activity-log entries below. Verify that: (1) the "
        "audit honestly reflects both reviewer verdicts; (2) the drift "
        "classification (corrective vs follow-up) is reasonable; (3) the "
        "corrective spec actually addresses each corrective drift item; "
        "(4) no claimed deliverable is missing. If you find no substantive "
        "issues, say VERIFIED.\n\n"
        f"```\n{bundle}\n```"
    )

    ar = load_ai_router()
    result = ar.query(
        model="gemini-pro",
        content=content,
        task_type="session-verification",
        context=context,
        session_set="006-docs-fresh-turn-and-alignment-audit",
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
        f"cost_usd={result.total_cost_usd:.4f} "
        f"stop_reason={result.escalation_history}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
