"""Set 069 S3 -- cross-provider re-verification round 3 (one substantive fix).

R2 (gpt-5-4) confirmed all three R1 fixes AND raised ONE new finding: a residual
template-lane replay defect when both lanes are active with different configs.
Fixed by capturing each execution's OWN replay context. SUBSTANTIVE re-verify.
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

R2 = (HERE / "s3-verification-round-2.md").read_text(encoding="utf-8")

PROMPT = f"""\
You are the cross-provider RE-verifier (Round 3) for Session 3 of 6 of Set 069
(the probe-template lane), dabbler-ai-orchestration. Round 2 (you, gpt-5-4)
CONFIRMED all three R1 fixes and raised ONE new finding; it is now fixed. Confirm
the fix is correct AND complete and return the structured verdict. Do NOT re-flag
the agreed baseline or the already-confirmed R1 fixes; do NOT raise NEW issues
outside this area unless they are genuine correctness defects you can cite by
file:line.

=== BASELINE (unchanged) ===
- Suite GREEN: 1820 passed, 1 skipped (1819 + 1 new replay-context test). No
  release this session (PyPI is S6); no UI change (spec non-goal).
- DEFERRED, not gaps: Podman lane (S4), ratchet + replacement gate (S5), release
  + dogfood (S6). The metered agentic loop + the full real-cage integration of the
  seed templates are not unit-tested (by design).

=== R2 FINDING + THE FIX TO CONFIRM ===

R2 FINDING (FAIL -> fixed): a residual template-lane replay defect remained when
both lanes were enabled -- `pull_route` passed a single shared `replay_cfg`
(preferring `run_test_config`) into evidence stamping, so a `kind="template"`
execution would be replayed/stamped against the run_test lane's `ref`/`repo_root`
if the two configs differed -> a false REPRODUCED or false downgrade against the
wrong tree.

THE FIX (store the replay context ON each execution): `_Execution` now carries
`repo_root` / `ref` / `caps`, set at capture time from the lane that ran the probe
(`_dispatch_run_test` from the `RunTestConfig`, `_dispatch_run_probe_template` from
the `ProbeTemplateConfig`). `_run_pristine_replay(execution)` and
`_build_transcript(execution)` are now CFG-FREE -- they replay against and stamp
`pinnedRef` from the EXECUTION'S OWN `repo_root`/`ref`/`caps`.
`_stamp_evidence_tiers(critique, payload, executions)` dropped its `cfg` param;
`pull_route` calls it with no shared cfg.

CONFIRM:
1. There is NO remaining path where a template execution is replayed or stamped
   against a DIFFERENT lane's repo/ref/caps. Each execution's transcript
   `pinnedRef` and its pristine replay both derive from that execution's own
   captured context.
2. The command (run_test) lane is unchanged in behavior: a command execution
   still replays against the RunTestConfig's repo/ref/caps (now via the
   execution's captured copy of them), and its transcript still uses
   `test_entrypoint` + the argv.
3. Additivity holds: with no execution lane, `_stamp_evidence_tiers` is not called
   and the read-only surface is byte-for-byte unchanged.
4. The new test `test_replay_uses_executions_own_repo_and_ref` actually proves the
   replay targets the execution's own repo/ref (it records the args
   `run_test_in_cage` is called with). The existing S2 tests were updated to the
   cfg-free signatures (the `_exec` helper now carries repo/ref); confirm those
   updates are sound and not masking anything.

=== ROUND 2 VERDICT (for reference) ===
{R2}

=== STAGED DIFF (all S3 files) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=66,
        session_set=str(HERE),
        session_number=3,
    )
    out = HERE / "s3-verification-round-3.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
