"""Set 071 S3 -- route the NEXT-SESSION-SET recommendation (L-064-6: never
self-opine; produce it via routed analysis). Set 071 closes here."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

PROMPT = """\
You are recommending the NEXT SESSION SET to run in the dabbler-ai-orchestration
repo, now that Set 071 is closing. Give one concrete recommendation (a slug + a
one-paragraph scope) plus one or two defensible alternatives. Be objective; do not
pad. The output is read by a human operator deciding what to author next.

WHERE THE PROGRAM STANDS:
- The Set 065->069 verification-surface program settled a three-layer model
  (floor = contract-test/CDC gate; ceiling = path-aware critique, now EXECUTABLE;
  targeted = per-session routed, DEMOTED to a blast-radius-gated check).
- Set 070 (ai_router 0.24.0) gave the PUSH surface a fair shake: steelman push
  (verification.md at strong devil's-advocate framing) + the dual-surface
  ("overdetermined") verification mode + fair-shake scoring over the Set 069
  seeded+holdout benchmark + the recorded dualSurfaceMode option.
- Set 071 (closing now, ai_router 0.25.0 STAGED -- publish operator-deferred) is the
  CALIBRATION layer on that strong framing: the field test of Set 070's framing
  confirmed it lifts the catch rate AND manufactures Minor/false-positive churn (the
  canonical case: three re-verify rounds on `pytest` vs `python -m pytest -v`). Set
  071 shipped: a materiality "so what?" gate in BOTH reviewer templates; a
  severity-anchored blocking classifier (is_blocking_verdict -- severity-DERIVED not
  token-derived; Minor-only = non-blocking) + a cross-round issue ledger
  (reconcile_issue_ledger, no resurrection under fresh wording); the re-verify loop
  discipline in workflow Step 6; a merge-impact / plausible-path-to-harm
  anti-laundering guardrail. Binary verdict grammar KEPT (cross-provider-confirmed).
  All additive over strong framing (L-069-2); the framing pins stay green.

HONEST TELEMETRY STATUS (unchanged by Set 071): the dual-surface instrument is BUILT
and dogfooded but NO powered benchmark-scored datapoint exists yet. The Set 069
seeded+holdout benchmark is NOT populated with real-workload cases, so
score_against_benchmark is INCONCLUSIVE by construction. RETIRE of the gated push
layer stays CLOSED, reopenable only on accumulated telemetry.

EXPLICITLY DEFERRED / FLAGGED AS DOWNSTREAM (carried from Set 070):
- The consumer-repo FIELD PILOTS (adopt the latest ai_router in a complex
  modernization project + the dabbler-access-harvester; populate the replacement-gate
  benchmark; collect the first sampled dual-surface telemetry). Those are consumer-repo
  efforts, not canonical-repo apparatus work -- but they are where the powered
  telemetry that reopens RETIRE actually comes from.
- A DEFERRED RESIDUAL recorded in Set 070 S2 (per L-069-1): the same non-list `entries`
  iteration pattern hardened in dual_surface_verify.py still exists in the PRE-EXISTING
  sibling readers ai_router/path_aware_critique.py and ai_router/dedicated_verification.py
  -- a latent close-out-crash bug class, candidate for a small hardening pass.
- Set 071's own residual: the materiality gate's effect is observed only anecdotally
  (the tires-repo field instance + Set 071's own verification loops). There is no
  measured before/after on re-verify-round COUNT or on false-positive RATE.

QUESTION: What is the highest-value next session set for the CANONICAL repo? Weigh:
the field pilots are where the powered telemetry actually comes from (but they are
consumer-repo work); the deferred sibling-reader residual is a real latent bug class
in this repo; the materiality-gate effect is unmeasured; and there may be other
consolidation/synthesis the program now needs. Recommend the next set, name whether it
belongs in this repo or a consumer repo, and say what would make it worth doing now vs.
waiting.
"""

result = route(
    PROMPT,
    task_type="analysis",
    session_set="071-verifier-materiality-and-nitpick-discipline",
    session_number=3,
)

out = HERE / "s3-next-session-set.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={getattr(result, 'model_id', '?')} tier={getattr(result, 'tier', '?')} "
      f"cost=${getattr(result, 'cost', 0.0):.4f}")
