"""Set 070 S3 -- cross-provider session verification (routed_gate = REQUIRED:
blast-radius + multi-module + breadth + build-ci-config). Orchestrator = Claude
(Anthropic), so the verifier is a DIFFERENT provider. L-064-3: write raw output to
disk first. L-064-10: up-front conventions block. L-064-9: diff is STAGED so
untracked deliverables are included."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

diff = subprocess.run(
    ["git", "diff", "--cached"], cwd=REPO, capture_output=True, text=True, check=True
).stdout

CONVENTIONS = """\
=== UP-FRONT CONVENTIONS (read before reviewing; do not spend findings here) ===

SUITE BASELINE: full ai_router suite is 2063 passed / 5 skipped, GREEN on this diff.
The 5 skips are the Set 069 S4 real-podman-on-Windows by-design skips (the cage-
mechanics regressions need a real podman + built image; they run on Linux CI/WSL and
skip on the Windows host). No NEW tests this session -- it is docs + a version bump.

RELEASE CONTRACT: this is the FINAL session of Set 070. ai_router bumps 0.23.0 ->
0.24.0 (minor: the set shipped new public API in S1-S2 -- dual_surface_verify, the
steelman-push template, the contractGate-seed fix). The PyPI publish itself is
operator-gated (the operator pushes/approves the tag on a green-Test-on-the-tagged-SHA
commit, the Set 068 lesson); this session bumps the version strings + writes the
change-log. NO extension / Marketplace change (the Explorer/UI is a stated non-goal).

BY-DESIGN SCOPE (NOT defects): This session ships NO production code-logic change.
The behavioral deliverables (verification.md devil's-advocate framing; the
dual_surface_verify.py runner + provenance merge + scoring + mode; the start_session
contractGate-seed fix) all shipped + were independently VERIFIED in Sessions 1 and 2.
S3 is synthesis + release + dogfood. Two artifacts in the diff are NOT prose to
fact-check for correctness: `s3-next-session-set.md` is verbatim routed-analysis
output (the next-set recommendation), and `run_next_set.py` / `run_s3_verification.py`
are throwaway routing harnesses. The DOGFOOD (end-of-set path-aware critique + a
dual-surface-mode run over this set's own diff) runs AFTER this verification, at close.

=== WHAT TO VERIFY (the real review) ===

1. CORRECTNESS of the doc claims against the code that shipped in S1-S2. Do
   verification-surface-strategy.md S5.1/S5.2 and pull-verifier.md's "What Set 070
   added" section describe dual_surface_verify.py / verification.md / the recorded
   dualSurfaceMode / the scoring honesty rules ACCURATELY? Any claim that overstates
   what was built, or contradicts the as-built behavior, is a real finding.
2. The HONEST TELEMETRY STATUS. The docs + change-log claim the instrument is BUILT
   and dogfooded but that NO powered benchmark datapoint exists yet
   (score_against_benchmark INCONCLUSIVE, real_cases = 0; RETIRE stays closed). Is
   that framing internally consistent and not overclaiming?
3. INTERNAL CONSISTENCY (L-065-1): the same claims are echoed in the strategy doc
   (S0 TL;DR, S3 targeted-layer bullet, S5.1, S5.2), pull-verifier.md, and the
   change-log. Flag any stale echo or contradiction between them.
4. The VERSION BUMP: 0.23.0 -> 0.24.0 in both pyproject.toml and
   ai_router/__init__.__version__ (they must agree -- a Set 069 S6 dogfood caught a
   __version__ drift). Minor-bump appropriate for net-new public API?
5. The L-064-7 lesson refinement: is the added "symmetric failure (Set 070 S2)"
   note accurate and does it sharpen (not contradict) the existing lesson?

Be a genuine devil's advocate: assume the work is flawed and try to prove it. A
rubber-stamp is a failure. Output VERIFIED only if you cannot find a real defect;
otherwise output ISSUES FOUND with Issue N: / Category / Severity for each.
"""

PROMPT = CONVENTIONS + "\n\n=== STAGED DIFF (git diff --cached) ===\n\n" + diff

result = route(
    PROMPT,
    task_type="session-verification",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-verification.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_id} cost=${getattr(result, 'cost', 0.0):.4f}")
