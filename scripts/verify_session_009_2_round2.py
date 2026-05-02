"""Round 2 cross-provider verification for Set 9 Session 2 after applying
issue fixes from Round 1.

Bundles:
  * The four deliverables, refreshed (proposal Q2 with the shipped
    contract leading and the original recommendation kept as
    superseded history; close-out.md Section 6 troubleshooting +
    normalized .close_session.lock references; Session 2
    ai-assignment block; Scenario 7 with narrowed scope claim).
  * The Session 1 'Actuals' sub-section so the verifier can confirm
    Session 1 actuals were backfilled.
  * issues-002.json (the Round 1 issue log) so the verifier can
    confirm each fix maps to the corresponding finding.
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
    marker = "Open questions (revised)"
    start = proposal.find(marker)
    rest = proposal[start:]
    end = rest.find("## Approximate cost")
    return rest[: end if end > 0 else len(rest)]


def _slice_closeout_section6(closeout: str) -> str:
    marker = "## Section 6 — Troubleshooting"
    start = closeout.find(marker)
    return closeout[start:]


def _slice_session1_actuals(ai_assignment: str) -> str:
    """The Session 1 Actuals sub-section, ending where the Session 2 block
    begins."""
    actuals_start = ai_assignment.find("### Actuals (filled after the session)")
    if actuals_start < 0:
        return "(could not locate Session 1 Actuals)"
    rest = ai_assignment[actuals_start:]
    end = rest.find("\n---\n")
    return rest[: end if end > 0 else len(rest)]


def _slice_session2_block(ai_assignment: str) -> str:
    marker = "## Session 2: D-1"
    start = ai_assignment.find(marker)
    return ai_assignment[start:]


def _slice_scenario7(test_file: str) -> str:
    marker = "# Scenario 7: Cross-set parallel rejection"
    start = test_file.find(marker)
    rest = test_file[start:]
    end = rest.find("# Sanity: in-process full lifecycle")
    return rest[: end if end > 0 else len(rest)].rstrip() + "\n"


def _slice_lock_refs(closeout: str) -> str:
    """Return the three pre-existing lock-filename references plus the
    new Section 6 entry, so the verifier can confirm normalization."""
    lines = closeout.splitlines()
    out = []
    for i, ln in enumerate(lines):
        if ".close" in ln and ".lock" in ln:
            out.append(f"L{i+1}: {ln}")
    return "\n".join(out)


def main() -> int:
    ar = _load_ai_router()
    route = ar.route

    proposal_md = _read(REPO / "docs" / "proposals" / "2026-04-29-session-close-out-reliability.md")
    closeout_md = _read(REPO / "ai_router" / "docs" / "close-out.md")
    ai_assignment_md = _read(SET_DIR / "ai-assignment.md")
    test_file = _read(REPO / "ai_router" / "tests" / "test_failure_injection.py")
    issues_md = _read(SET_DIR / "session-reviews" / "issues-002.json")
    spec_md = _read(SET_DIR / "spec.md")

    prompt_parts = [
        "## Round 2 verification — Set 9 Session 2 (D-1, doc-only path)",
        "",
        "Round 1 (`session-002.md`) returned **ISSUES_FOUND** with four "
        "issues. All four have been addressed; the diff for each is "
        "presented below. The ask for Round 2 is to confirm that the "
        "applied fixes resolve the findings without introducing new "
        "drift.",
        "",
        "## Issue log from Round 1 (with applied fixes annotated)",
        "",
        "```json",
        issues_md,
        "```",
        "",
        "## Refreshed deliverables",
        "",
        "### 1. Proposal Q2 — fully replaced (shipped contract leads, "
        "original recommendation kept as 'History — superseded recommendation')",
        "",
        "```markdown",
        _slice_proposal_q2(proposal_md),
        "```",
        "",
        "### 2. ai_router/docs/close-out.md Section 6 (full text, post-fix)",
        "",
        "```markdown",
        _slice_closeout_section6(closeout_md),
        "```",
        "",
        "### 3. Lock-filename references in close-out.md (every line that "
        "matches `.close*.lock`, with line numbers — should all read "
        "`.close_session.lock` now to match `close_lock.LOCK_FILENAME`)",
        "",
        "```",
        _slice_lock_refs(closeout_md),
        "```",
        "",
        "### 4. Session 1 'Actuals' block in ai-assignment.md (the part "
        "Round 1 could not see — confirms cost + routing-suspension "
        "deviation were backfilled)",
        "",
        "```markdown",
        _slice_session1_actuals(ai_assignment_md),
        "```",
        "",
        "### 5. Session 2 ai-assignment block (unchanged from Round 1)",
        "",
        "```markdown",
        _slice_session2_block(ai_assignment_md),
        "```",
        "",
        "### 6. TestScenario7CrossSetParallelRejection (with narrowed "
        "docstring scope claim)",
        "",
        "```python",
        _slice_scenario7(test_file),
        "```",
        "",
        "## Test result",
        "`python -m pytest ai_router/tests/test_failure_injection.py` → "
        "**8 passed in 7.80s** (full suite remains green at 670 passed; "
        "the docstring edit was the only post-Round-1 code change).",
        "",
        "## Spec excerpt for Session 2 acceptance criteria (unchanged)",
        "",
        "```markdown",
        spec_md.split("### Session 2: D-1")[1].split("### Session 3:")[0],
        "```",
        "",
        "## Verification ask",
        "",
        "  1. **Issue 1 (Q2 lead).** Does the refreshed Q2 lead with the "
        "shipping contract and present the original lock recommendation "
        "only as superseded history?",
        "  2. **Issue 2 (lock filename).** Do all `.close*.lock` "
        "references in close-out.md now read `.close_session.lock`?",
        "  3. **Issue 3 (test scope claim).** Are the 'exercised by "
        "Scenario 7' claims in close-out.md, the proposal Q2 resolution, "
        "and the test docstring now narrowed to what the test actually "
        "asserts (the gate predicate's rejection-and-remediation in the "
        "cross-set push-race), explicitly delegating the 'close_session "
        "exits 1 without flipping state' invariant to the existing "
        "`test_mark_session_complete_gate.py` + close-out integration "
        "tests?",
        "  4. **Issue 4 (Session 1 actuals).** Does the Session 1 "
        "Actuals block now show a real total routed cost ($0.1910) and "
        "the routing-suspension deviation, satisfying Session 1's "
        "ai-assignment.md schema in retrospect?",
        "",
        "If all four are addressed cleanly, return **VERIFIED**. If any "
        "fix is still incomplete or the fixes introduced new drift, "
        "return **ISSUES FOUND** with the specific gap.",
    ]
    prompt = "\n".join(prompt_parts)

    out_dir = SET_DIR / "session-reviews"
    prompt_path = out_dir / "session-002-round-2-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"wrote prompt: {prompt_path} ({len(prompt)} chars)")

    # Pin max_tier to the verifier's tier (3 for GPT-5.4) per the
    # lessons-learned.md "schema-only re-verifies" rule — the Round 2
    # response is short by design; do not let escalation cross-provider.
    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        max_tier=3,
        session_set=str(SET_DIR),
        session_number=2,
    )

    review_path = out_dir / "session-002-round-2.md"
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
    (out_dir / "session-002-round-2-meta.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
