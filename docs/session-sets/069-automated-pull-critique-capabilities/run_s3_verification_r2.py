"""Set 069 S3 -- cross-provider re-verification round 2 (substantive: 2 fixes).

R1 (gpt-5-4) returned FAIL with 3 findings (finding 3 = the test gap for findings
1+2). All fixed. SUBSTANTIVE re-verify (not wording-only), so normal escalation
applies (no max_tier pin).
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

FILES = [
    "ai_router/probe_templates.py",
    "ai_router/pull_verifier.py",
    "ai_router/pull_critique.py",
    "ai_router/path_aware_critique.py",
    "ai_router/docs/pull-verifier.md",
    "ai_router/tests/test_probe_templates.py",
    "ai_router/tests/test_pull_verifier.py",
    "ai_router/tests/test_pull_critique.py",
    "ai_router/tests/test_path_aware_critique.py",
]
DIFF = subprocess.run(
    ["git", "diff", "--cached", "--", *FILES],
    cwd=str(REPO), capture_output=True, text=True,
).stdout

R1 = (HERE / "s3-verification.md").read_text(encoding="utf-8")

PROMPT = f"""\
You are the cross-provider RE-verifier (Round 2) for Session 3 of 6 of Set 069
(automated pull-critique capabilities -- the probe-template lane),
dabbler-ai-orchestration. Round 1 (you, gpt-5-4) returned FAIL with three
findings; all are now fixed. Confirm each fix is correct AND complete, and return
the structured verdict. Do NOT re-flag the agreed baseline; do NOT raise NEW
issues outside these areas unless they are genuine correctness defects you can
cite by file:line.

=== BASELINE (unchanged) ===
- Suite GREEN: 1819 passed, 1 skipped (1814 before R1 fixes + 5 new tests). No
  release this session (PyPI is S6); no UI change (spec non-goal).
- DEFERRED, not gaps: Podman lane (S4), ratchet + replacement gate (S5), release
  + dogfood (S6). The metered agentic loop + the full real-cage integration of the
  seed templates are not unit-tested (the driver probe bodies are tested
  in-process against the real public entrypoints, both directions); by design.

=== R1 FINDINGS + THE FIXES TO CONFIRM ===

FINDING 1 (FAIL -> fixed): a clean run_probe_template cage run was captured
regardless of the probe's exit code, so a ROBUST run (exit 0 -> no defect) or a
PROBE-INTERNAL ERROR (exit 2) could back a REPRODUCED claim if the replay hash
matched. FIX: `probe_templates.run_probe_template` now captures a `ProbeRun` ONLY
when `res.exit_code == PROBE_REPRODUCED_EXIT` (1) (in addition to the
ran/no-error/no-leak guards); an exit-2 run is additionally flagged `is_error`
(surfaced as an error tool result). CONFIRM: exit 0 and exit 2 runs no longer back
a reproduction; only exit 1 does. Is there ANY residual false-REPRODUCED path for
a template finding?

FINDING 2 (FAIL -> fixed): `commandId` and `templateId` were matched through one
untyped string map (`match_id`), so a command id colliding with a template id
could cross-bind a finding to the wrong execution, and a finding with both ids
resolved via the wrong lane. FIX: `_stamp_evidence_tiers` now builds TWO lane-keyed
maps (`by_command` from command-kind executions, `by_template` from
template-kind); a `commandId` resolves ONLY against `by_command`, a `templateId`
ONLY against `by_template`; if BOTH ids are present the finding is AMBIGUOUS and
collapses to a read-claim. CONFIRM: a cross-lane id collision can no longer
mis-bind, and the both-ids case collapses.

FINDING 3 (FAIL -> fixed): the tests missed both negative cases. FIX: added
`test_robust_exit0_run_not_captured`, `test_probe_error_exit2_not_captured_and_flagged`
(probe_templates), and `TestEvidenceLaneMatching` with
`test_both_ids_collapse_to_read_claim`,
`test_commandid_does_not_bind_template_execution`,
`test_templateid_binds_template_lane_when_ids_collide` (pull_verifier). CONFIRM
these exercise the named behaviors.

Also re-confirm the still-PASS areas were not regressed by these edits (the model
never authors argv; typed-arg validation; deterministic probe output; meta-oracle;
cage reuse; additivity; the path_aware_critique UnicodeError fix; doc accuracy).

=== ROUND 1 VERDICT (for reference) ===
{R1}

=== STAGED DIFF (all S3 files) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=72,
        session_set=str(HERE),
        session_number=3,
    )
    out = HERE / "s3-verification-round-2.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
