"""Set 069 S2 -- cross-provider session verification (Step 6, gated -> REQUIRED).

S2's diff wires the execution-evidence lanes into the shared pull adapter
(pull_verifier.py) + the producer (pull_critique.py) + a doc, spanning ai_router
+ docs across 7 files, so routed_gate trips REQUIRED (blast-radius cross-artifact
+ multi-module + breadth). The orchestrator is Anthropic/opus; the verifier
routes to a different provider.
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

EVIDENCE = (REPO / "ai_router/evidence_protocol.py").read_text(encoding="utf-8")

PROMPT = f"""\
You are the cross-provider session verifier for Session 2 of 6 of Set 069
(automated pull-critique capabilities) in the dabbler-ai-orchestration repo.
Return the structured verdict.

=== CONVENTIONS / BASELINE (read first; do NOT re-flag the agreed baseline) ===
- Suite baseline BEFORE this session: 1736 passed, 1 skipped (1 pre-existing,
  tracked). This session ADDS 26 unit tests; the full ai_router pytest suite is
  GREEN at this commit (1762 passed, 1 skipped). You are verifying CODE + DOCS,
  not re-running the suite.
- RELEASE CONTRACT: NO release this session. The ai_router PyPI release is
  Session 6; the version is intentionally unchanged. NO Marketplace / extension
  change (spec non-goal: no UI surface this whole set).
- BY-DESIGN SCOPE (Session 2 = "Trusted-command execution + diff-awareness +
  deeper probing"). IN scope: (a) wire TRIGGER-ONLY run_test execution into the
  producer (pull_critique); (b) add a get_diff tool (raw unified diff); (c) a
  blast-radius-budgeted multi-turn loop (caps per set); (d) findings from a
  triggered run flow through the Session-1 evidence protocol
  (ai_router/evidence_protocol.py -- INCLUDED below for reference; it was VERIFIED
  in S1, so verify only that S2 USES it correctly, do not re-audit it).
  DEFERRED (do NOT flag as gaps): the Podman model-authored-probe lane (S4), the
  ceiling->floor ratchet + replacement gate (S5), the probe-template lane (S3),
  and the PyPI release + dogfood (S6). The metered end-to-end agentic loop is NOT
  unit-tested (only the seams are); that is by design.
- ADDITIVITY IS A HARD REQUIREMENT: with NO RunTestConfig and NO DiffConfig the
  loop + the producer must be byte-for-byte the Set 067/068 read-only behavior
  (no new tool offered, no evidence fields emitted, caps unchanged). Confirm this.

=== WHAT TO VERIFY (cite file:line for any finding) ===

1. AGENT CANNOT SELF-GRANT REPRODUCED (the load-bearing trust property). In
   pull_verifier._stamp_evidence_tiers + _build_transcript + _run_pristine_replay:
   confirm REPRODUCED is conferred ONLY via authoritative_tier on a transcript
   that validate_transcript accepts, AND only after the ORCHESTRATOR replays the
   named command on a SECOND pristine checkout whose outputHash MATCHES. Is there
   ANY path where a finding is stamped REPRODUCED without a matching clean replay
   (a FALSE REPRODUCED)? Check: no execution recorded; wrong/unknown commandId;
   replay that errored / leaked / timed out / mismatched bytes; a flaky command
   (non-deterministic output) -- all must COLLAPSE to a read-claim (no field).

2. EXECUTION-CAPTURE INTEGRITY (_dispatch_run_test). An _Execution must be
   captured ONLY for a clean cage run (ran AND no cage error AND no teardown
   leak); a cage error / leak must yield execution=None (cannot back a
   reproduction). A FAILING falsifier (non-zero exit) is still a valid backing
   run. Confirm raw_output is the cage's RAW combined output (never summarized)
   and the outputHash is computed over it.

3. get_diff CORRECTNESS + RANGE PINNING. The diff RANGE must be operator-pinned
   (DiffConfig), NEVER model-authored argv (the tool takes no arguments). Confirm
   _dispatch_get_diff runs git directly (no model-touchable servant -> correctly
   OUTSIDE the byte-equality guard, same posture as run_test), surfaces a bad ref
   / timeout as a RAW ERROR the model can recover from, returns the RAW unified
   diff (not a summarized symbol map), is recorded as a real probe (raw=True), and
   the _range() helper is correct for base-only / base..head / pathspec.

4. ADDITIVITY / BACKWARD COMPATIBILITY. With run_test_config=None AND
   diff_config=None: run_test and get_diff are NOT offered; _stamp_evidence_tiers
   is NOT called (so an ASSERTED finding emits NO evidenceTier/transcript and is
   byte-identical to a pre-069 entry); caps stays None so pull_route resolves the
   configured ceiling unchanged. Confirm Finding.to_dict only emits evidenceTier /
   transcript when set.

5. BLAST-RADIUS BUDGET (budget_caps_for_paths + producer wiring). Confirm the
   factor mapping (required=1.0, advisory=0.6, none=0.4), the turn/token floors,
   that max_output_tokens (the per-CALL ceiling) is left intact, that it is
   applied ONLY when an execution lane is active and caps is None, and that an
   explicit caps= always wins. Is "not a magic constant" actually honored (it is
   derived from the set's files_changed via blast_radius)?

6. CLI (_build_exec_configs). Confirm run_test requires --exec-ref; a shell-style
   command is shlex-split into an argv with NO shell invoked; a malformed
   NAME=CMD (no '=' / empty NAME) is rejected; and no flags -> (None, None).

7. INDEX/PARITY ALIGNMENT. _stamp_evidence_tiers aligns the agent's raw
   submit_verdict findings (proposed evidenceTier/commandId) with the PARSED
   critique.findings by index. _parse_verdict preserves order 1:1 (it raises on a
   bad finding, never silently drops). Confirm the index alignment is sound and a
   missing/short raw_findings list cannot crash or mis-stamp.

8. DOC ACCURACY (ai_router/docs/pull-verifier.md "What Set 069 S2 added"). Does it
   match the code EXACTLY (the lanes, the orchestrator-tag rule, get_diff outside
   the guard, the budget)? Any claim of CURRENT behavior the code does not back
   (L-064-8)? Any overclaim of what S2 ships vs S3-S6?

9. TEST ADEQUACY. Do the new tests actually exercise the named behaviors (the
   false-REPRODUCED collapse paths, the agent-cannot-self-grant case, the
   additivity / read-only-unchanged case, get_diff on a real repo, the budget
   floors), or do any pass without exercising the behavior they name?

=== ai_router/evidence_protocol.py (Session 1, VERIFIED; included for reference) ===
{EVIDENCE}

=== STAGED DIFF (pull_verifier.py, pull_critique.py, both test files, pull-verifier.md) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=74,
        session_set=str(HERE),
        session_number=2,
    )
    out = HERE / "s2-verification.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
