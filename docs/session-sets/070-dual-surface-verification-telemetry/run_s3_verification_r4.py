"""Set 070 S3 -- cross-provider session verification ROUND 4 (authoritative final
gate). R3 found 2 Major issues; both resolved. SUBSTANTIVE re-verify -> stay on the
verifier's tier (NO max_tier pin; L-064-7 as refined this session)."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

diff = subprocess.run(
    ["git", "diff", "--cached"], cwd=REPO, capture_output=True, check=True
).stdout.decode("utf-8", errors="replace")

CONVENTIONS = """\
=== UP-FRONT CONVENTIONS (Round 4, authoritative final gate) ===

ROUND 4. Rounds 1-3 (you, gpt-5-4) found issues; all resolved. SUITE: 2076 passed /
5 skipped, GREEN (5 skips = Set 069 S4 real-podman-on-Windows by-design). Version
bumped 0.23.0 -> 0.24.0 (pyproject + __init__.__version__ agree). PyPI publish is
OPERATOR-GATED, post-close. No extension change.

HOW R3'S TWO MAJOR ISSUES WERE RESOLVED:
- R3 Issue 1 (path-aware gate artifact kept being PRE-FIX): the path-aware critique is
  now honestly framed as an ITERATIVE DOGFOOD (change-log "Dogfood findings" section).
  Across rounds it caught + drove fixes for THREE real Majors (equal-arms scoring guard;
  surfaces-consistency; schema<->validator parity) the per-session routed verification
  missed. The committed path-aware-critique.json is the FINAL round over the
  post-all-fixes tree; path-aware-critique-prefix-dogfood.json preserves round 1 as
  evidence. The final round's residual findings are adjudicated below + in disposition.
- R3 Issue 2 (equal-arms guard trusted self-asserted booleans, "assumed not measured"):
  _arms_held_equal now IGNORES the providerEqual/modelEqual/framingEqual/bothAdversarial
  booleans and RE-DERIVES equality from the RAW per-arm attestation fields
  (requestedProvider/pushProvider/pullProvider, the model triple, pushFraming/pullFraming
  .strength), requiring them present and rejecting any provider/model/framing
  disagreement or non-adversarial framing. 8 negative tests (TestEqualArmsGuardOnScoring)
  including a "lying booleans caught by raw re-derivation" case; the schema example now
  carries the raw fields. REVIEW THIS GUARD for correctness.

ADJUDICATION OF THE FINAL PATH-AWARE ROUND'S RESIDUAL FINDINGS (so you need not
re-litigate them; confirm the adjudication is sound):
- (Minor, FIXED) the change-log described the FIRST version of the equal-arms guard
  ("requires the four booleans true"); reworded to describe the final raw-re-deriving
  guard.
- (Major, ADJUDICATED by-design) the dogfood dual-surface-comparison.json's six push
  findings are malformed-parse fallout: the push arm (gemini-2.5-pro, single-shot over
  the ~5.7k-line diff) emitted markdown that parse_verification_response parsed into
  empty-severity findings. This is a property of the DOGFOOD RUN, not the shipping code
  (merge/score/validate faithfully process whatever findings they receive, and the
  re-deriving guard + provenanceComplete=false keep the artifact honest). It is
  prominently caveated (change-log "Dogfood-artifact caveat"), the artifact is presented
  as a MECHANISM DEMONSTRATION (not a meaningful-findings datapoint, explicitly not
  powered telemetry), and a push-arm PARSE-QUALITY GUARD is recorded as a DEFERRED
  RESIDUAL for the next set (the L-069-1 "scope and record" discipline) rather than
  bolted on in close-out. The artifact is never edited after writing (L-064-3).

FOCUS: the re-deriving equal-arms guard (can it reject a legitimate held-equal artifact,
or accept a non-equal one?), the surfaces validator + schema uniqueItems, the schema
if/then constraint, internal doc consistency, and whether the malformed-artifact
adjudication is honest. Be a genuine devil's advocate. Output VERIFIED only if you
cannot find a real defect; else ISSUES FOUND with Issue N: / Category / Severity.
"""

PROMPT = CONVENTIONS + "\n\n=== STAGED DIFF (git diff --cached) ===\n\n" + diff

result = route(
    PROMPT,
    task_type="session-verification",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-verification-round-4.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_id}")
