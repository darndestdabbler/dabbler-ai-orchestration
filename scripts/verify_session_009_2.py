"""End-of-session cross-provider verification for Set 9 Session 2 (D-1).

Builds a verification prompt that bundles the spec excerpt, the four
deliverables (proposal Q2 revision, close-out.md Section 6 addition,
ai-assignment.md Session 2 block, and the new failure-injection test),
and the test-suite result. Routes to a non-Anthropic verifier via
`route(task_type="session-verification")` per workflow Step 6 and saves
the raw verdict to `session-reviews/session-002.md`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SET_DIR = REPO / "docs" / "session-sets" / "009-alignment-audit-followups"


def _load_ai_router():
    """Import ``ai_router`` directly. The previous ``importlib.util.spec_from_file_location`` shim,
    required when the package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the package is installable
    via ``pip install -e .`` from the repo root. The ``sys.path.insert`` covers the case
    where the script is run without the editable install.
    """
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    import ai_router
    return ai_router


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _slice_proposal_q2(proposal: str) -> str:
    """Return the Open questions (revised) Q2 block including its
    new Resolution sub-section."""
    marker = "Open questions (revised)"
    start = proposal.find(marker)
    if start < 0:
        return "(could not locate Open questions (revised) section)"
    rest = proposal[start:]
    end = rest.find("## Approximate cost")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_closeout_section6(closeout: str) -> str:
    marker = "## Section 6 — Troubleshooting"
    start = closeout.find(marker)
    if start < 0:
        return "(could not locate Section 6)"
    return closeout[start:]


def _slice_session2_block(ai_assignment: str) -> str:
    marker = "## Session 2: D-1"
    start = ai_assignment.find(marker)
    if start < 0:
        return "(could not locate Session 2 block)"
    return ai_assignment[start:]


def _slice_scenario7(test_file: str) -> str:
    marker = "# Scenario 7: Cross-set parallel rejection"
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate Scenario 7)"
    rest = test_file[start:]
    end = rest.find("# Sanity: in-process full lifecycle")
    if end < 0:
        end = len(rest)
    # Extract the leading separator and the class up to the next big section.
    return rest[: end].rstrip() + "\n"


def main() -> int:
    ar = _load_ai_router()
    route = ar.route

    spec_md = _read(SET_DIR / "spec.md")
    proposal_md = _read(REPO / "docs" / "proposals" / "2026-04-29-session-close-out-reliability.md")
    closeout_md = _read(REPO / "ai_router" / "docs" / "close-out.md")
    ai_assignment_md = _read(SET_DIR / "ai-assignment.md")
    test_file = _read(REPO / "ai_router" / "tests" / "test_failure_injection.py")
    workflow_pointer = (
        "Workflow Step 6 (verification) is mode-aware; this set runs "
        "outsource-first and we are routing the verification synchronously."
    )

    # Acceptance criteria for Session 2, copied from spec.md
    acceptance = (
        "- Either: a `(repo, branch)` lock exists, is acquired at session "
        "admission, and is exercised by an executable failure-injection test\n"
        "- Or: the residual race is documented in close-out.md and the "
        "proposal's open-question answer is revised\n"
        "(Operator selected the second alternative — the doc-only path.)"
    )

    prompt_parts = [
        "## Session under verification",
        "Set 9 (`009-alignment-audit-followups`) Session 2 of 5 — drift "
        "item D-1 from the combined-design alignment audit. Audit document: "
        "`docs/proposals/2026-04-30-combined-design-alignment-audit.md` §5.2 "
        "(D-1 — `(repo, branch)` parallel-session exclusion is incomplete).",
        "",
        "## Path selected",
        "The spec offered two corrective options:",
        "  (a) widen the lock to acquire at session admission and scope it "
        "to `(repo, branch)`, with a new `repo_branch_lock.py` module and "
        "an executable `TestScenario7CrossSetParallelRejection` test, OR",
        "  (b) revise the agreed answer to acknowledge that close-out-only "
        "serialization is sufficient, document the residual race "
        "explicitly, and add an executable test that exercises the "
        "residual-race protection (the deterministic gate).",
        "",
        "**The operator selected option (b) — the doc-only path** — at "
        "session start to keep the change small and avoid introducing a "
        "new admission-time lock that could itself fail. The audit "
        "explicitly accepts either path.",
        "",
        "## Acceptance criteria for this session",
        acceptance,
        "",
        "## Files changed (deliverables)",
        "",
        "### 1. `docs/proposals/2026-04-29-session-close-out-reliability.md` "
        "— Open questions (revised) Q2 revised",
        "",
        "Original Q2 recommended rejecting parallel sessions on the same "
        "`(repo, branch)` via an advisory lock. Revised text adds a "
        "Resolution (2026-05-01, Set 9 Session 2 — doc-only path) "
        "sub-section explaining the narrower shipping contract:",
        "",
        "```markdown",
        _slice_proposal_q2(proposal_md),
        "```",
        "",
        "### 2. `ai_router/docs/close-out.md` Section 6 — new troubleshooting "
        "entry on cross-set parallelism",
        "",
        "```markdown",
        _slice_closeout_section6(closeout_md),
        "```",
        "",
        "### 3. `ai_router/tests/test_failure_injection.py` — new "
        "`TestScenario7CrossSetParallelRejection`",
        "",
        "```python",
        _slice_scenario7(test_file),
        "```",
        "",
        "### 4. `docs/session-sets/009-alignment-audit-followups/ai-assignment.md` "
        "— Session 2 block appended (with Session 1 actuals)",
        "",
        "```markdown",
        _slice_session2_block(ai_assignment_md),
        "```",
        "",
        "## Test result",
        "`python -m pytest ai_router/tests` → **670 passed in 57.06s** "
        "(669 pre-existing + 1 new Scenario 7).",
        "",
        "## Spec excerpt for Session 2",
        "```markdown",
        spec_md.split("### Session 2: D-1")[1].split("### Session 3:")[0],
        "```",
        "",
        f"## Workflow ordering note",
        workflow_pointer,
        "",
        "## Verification ask",
        "Evaluate whether the four deliverables together satisfy the "
        "spec's Session 2 acceptance criteria for the doc-only "
        "alternative. Specifically:",
        "",
        "  1. Is the residual race **documented clearly** in close-out.md "
        "Section 6 (operator-actionable, names the gate predicate, "
        "names the test, points at the audit drift item)?",
        "  2. Is the original proposal's Q2 answer **revised** to match "
        "the shipping contract (no longer claims an admission-time "
        "(repo, branch) lock; explains why; cross-references the doc and "
        "the test)?",
        "  3. Does `TestScenario7CrossSetParallelRejection` actually "
        "exercise the residual-race protection — i.e., does it create "
        "a real cross-set push race against a real bare remote, and "
        "does it assert that the loser's `check_pushed_to_remote` "
        "returns a clear non-fast-forward / rebase remediation?",
        "  4. Does the ai-assignment.md Session 2 block correctly "
        "record Session 1 actuals (cost, deviations) and document "
        "the routing-suspension deviation for Session 2?",
        "",
        "Flag any consistency drift between the four files (e.g., one "
        "naming a path the others don't; the test asserting a "
        "remediation message that close-out.md doesn't actually quote).",
    ]
    prompt = "\n".join(prompt_parts)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-002-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"wrote prompt: {prompt_path} ({len(prompt)} chars)")

    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=2,
    )

    review_path = out_dir / "session-002.md"
    review_path.write_text(result.content, encoding="utf-8")
    print(f"wrote review: {review_path}")
    print(f"model: {result.model_name}")
    print(f"input_tokens: {result.input_tokens}")
    print(f"output_tokens: {result.output_tokens}")
    print(f"cost_usd: {result.cost_usd}")

    # Also persist a small JSON sidecar for downstream automation.
    sidecar = {
        "model": result.model_name,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
    }
    (out_dir / "session-002-meta.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
