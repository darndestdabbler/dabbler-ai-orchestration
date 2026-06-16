"""Set 069 S2 -- cross-provider re-verification round 2 (substantive: 3 fixes).

R1 (gpt-5-4) returned FAIL with 3 real findings; all fixed. This is a
SUBSTANTIVE re-verify (not wording-only), so normal escalation applies (no
max_tier pin). Finding 8 was UNVERIFIED in R1 only because the doc edit landed
after staging; the doc IS in this staged diff.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

DIFF = subprocess.run(
    ["git", "diff", "--cached", "--",
     "ai_router/pull_verifier.py",
     "ai_router/pull_critique.py",
     "ai_router/tests/test_pull_verifier.py",
     "ai_router/tests/test_pull_critique.py",
     "ai_router/docs/pull-verifier.md"],
    cwd=str(REPO), capture_output=True, text=True,
).stdout

R1 = (HERE / "s2-verification.md").read_text(encoding="utf-8")

PROMPT = f"""\
You are the cross-provider RE-verifier (Round 2) for Session 2 of 6 of Set 069
(automated pull-critique capabilities), dabbler-ai-orchestration. Round 1 (you,
gpt-5-4) returned FAIL with three findings; all are now fixed. Confirm each fix
is correct AND complete, re-check the doc (UNVERIFIED in R1 because the doc edit
landed after staging - it IS in this diff), and return the structured verdict.
Do NOT re-flag the agreed baseline; do NOT raise NEW issues outside these areas
unless they are genuine correctness defects you can cite by file:line.

=== BASELINE (unchanged) ===
- Suite GREEN: 1767 passed, 1 skipped (1762 before R1 fixes + 5 new tests). No
  release this session (PyPI is S6); no UI change (spec non-goal).
- DEFERRED, not gaps: Podman lane (S4), ratchet + replacement gate (S5),
  probe-template lane (S3), release + dogfood (S6). The metered agentic loop is
  not unit-tested (only the seams).

=== R1 FINDINGS + THE FIXES TO CONFIRM ===

FINDING 1 (FAIL -> fixed): an UNKNOWN run_test `name` silently runs the DEFAULT
command but was captured as the model's unmatched string, letting a false
`commandId` back a REPRODUCED claim. FIX: added `RunTestConfig.resolve_id(name)`
returning the TRUSTED id actually run (a configured name, else "default");
`_dispatch_run_test` now captures `command_id = cfg.resolve_id(name)` (and
`requested_name` only for a real configured name). CONFIRM: an unknown name now
yields command_id="default", so a verdict claiming the unmatched name no longer
matches any execution and collapses to a read-claim. Is there ANY residual path
to a false REPRODUCED?

FINDING 2 (FAIL -> fixed): the `submit_verdict` schema always advertised
`evidenceTier` / `commandId`, changing the no-config agent-facing surface. FIX:
`_verdict_tool_schema(allow_evidence=False)` gates those fields; `pull_route`
passes `allow_evidence=(run_test_config is not None)`. CONFIRM: with no
run_test_config the offered submit_verdict schema is byte-for-byte the pre-069
read-only shape (no evidence fields), and they appear only when the run_test lane
is active.

FINDING 3 (FAIL -> fixed): the unknown-commandId test fabricated an _Execution
and never drove the real fallback. FIX: added `resolve_id` unit coverage,
`test_unknown_name_captures_resolved_default_id` (drives `_dispatch_run_test`
with `{{"name":"missing"}}` against a real repo and asserts command_id=="default"),
`test_unknown_name_claim_collapses`, and verdict-schema-gating tests. CONFIRM the
regression path is now exercised.

FINDING 8 (UNVERIFIED in R1): re-check `ai_router/docs/pull-verifier.md` "What
Set 069 S2 added" against the code EXACTLY - the lanes, the orchestrator-tag
rule (agent cannot self-grant REPRODUCED; pristine replay; collapse), get_diff
running git directly outside the byte-equality guard, the blast-radius budget.
Any claim of CURRENT behavior the code does not back (L-064-8)? Any overclaim of
what S2 ships vs S3-S6?

Also re-confirm the still-PASS areas were not regressed by these edits
(execution-capture integrity, get_diff, additivity, blast-radius budget, CLI,
index/parity alignment).

=== ROUND 1 VERDICT (for reference) ===
{R1}

=== STAGED DIFF (pull_verifier.py, pull_critique.py, both test files, pull-verifier.md) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(HERE),
        session_number=2,
    )
    out = HERE / "s2-verification-round-2.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
