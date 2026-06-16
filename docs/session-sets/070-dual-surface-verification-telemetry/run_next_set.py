"""Set 070 S3 -- route the NEXT-SESSION-SET recommendation (L-064-6: never
self-opine; produce it via routed analysis). Set 070 closes here."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

PROMPT = """\
You are recommending the NEXT SESSION SET to run in the dabbler-ai-orchestration
repo, now that Set 070 is closing. Give one concrete recommendation (a slug + a
one-paragraph scope) plus one or two defensible alternatives. Be objective; do not
pad. The output is read by a human operator deciding what to author next.

WHERE THE PROGRAM STANDS:
- The Set 065->069 verification-surface program settled a three-layer model
  (floor = contract-test/CDC gate; ceiling = path-aware critique, now EXECUTABLE
  via the Set 069 evidence protocol + probe/Podman lanes + the ceiling->floor
  ratchet + the measured replacement gate; targeted = per-session routed, DEMOTED
  to a blast-radius-gated check). ai_router shipped 0.23.0 (Set 069).
- Set 070 (closing now, ai_router 0.24.0) gave the PUSH surface a fair shake:
  (1) steelman push (verification.md upgraded to strong devil's-advocate framing,
  pinned by a test); (2) the dual-surface ("overdetermined") verification mode
  (ai_router/dual_surface_verify.py) -- runs push + pull adversarially over the
  same committed state, provider/model/framing held EQUAL, emits a
  provenance-tagged merged comparison (push-only/pull-only/both, stable defectKey
  never free-text); (3) the fair-shake scoring over the Set 069 seeded+holdout
  benchmark (underpowered->INCONCLUSIVE, sampled never pooled with opt-in, push
  never retired by the machinery); (4) the recorded dualSurfaceMode option + CLI.
- HONEST TELEMETRY STATUS: the instrument is BUILT and dogfooded over Set 070's own
  diff, but NO powered benchmark-scored datapoint exists yet. The Set 069
  seeded+holdout benchmark is NOT populated with real-workload cases, so
  score_against_benchmark is INCONCLUSIVE by construction (real_cases = 0). RETIRE of
  the gated push layer stays CLOSED, reopenable only on accumulated telemetry.

EXPLICITLY DEFERRED / FLAGGED AS DOWNSTREAM:
- Set 070 declared its NON-GOAL to be the consumer-repo FIELD PILOTS (adopt 0.24.0
  in a complex modernization project + the dabbler-access-harvester; populate the
  replacement-gate benchmark; collect the first sampled dual-surface telemetry).
  Those are consumer-repo efforts, not canonical-repo apparatus work.
- A DEFERRED RESIDUAL recorded in Set 070 S2 (per L-069-1): the same non-list
  `entries` iteration pattern that was hardened in dual_surface_verify.py still
  exists in the PRE-EXISTING sibling readers ai_router/path_aware_critique.py
  (~lines 145, 209) and ai_router/dedicated_verification.py (~lines 178, 243) --
  a latent close-out-crash bug class, candidate for a small hardening pass.

QUESTION: What is the highest-value next session set for the CANONICAL repo? Weigh:
the field pilots are where the powered telemetry actually comes from (but they are
consumer-repo work); the deferred sibling-reader residual is a real latent bug class
in this repo; and there may be other consolidation/synthesis the program now needs.
Recommend the next set, name whether it belongs in this repo or a consumer repo, and
say what would make it worth doing now vs. waiting.
"""

result = route(
    PROMPT,
    task_type="analysis",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-next-session-set.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_used} tier={getattr(result, 'tier', '?')} "
      f"cost=${getattr(result, 'cost', 0.0):.4f}")
