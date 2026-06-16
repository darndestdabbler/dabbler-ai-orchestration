"""Set 070 S3 -- cross-provider session verification ROUND 2. R1 (gpt-5-4) found 3
issues; this round re-verifies the fixes + the new CODE change the dogfood drove.
L-064-7 (refined this very session): a SUBSTANTIVE re-verify must stay on the R1
verifier's tier -- do NOT pin max_tier below it. So no max_tier here."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

# Capture as BYTES and decode utf-8 (the staged diff includes unicode from the
# routed-output JSON artifacts; the default cp1252 locale decode crashes -- L-064-3).
diff = subprocess.run(
    ["git", "diff", "--cached"], cwd=REPO, capture_output=True, check=True
).stdout.decode("utf-8", errors="replace")

CONVENTIONS = """\
=== UP-FRONT CONVENTIONS (Round 2; do not re-litigate the baseline) ===

This is ROUND 2 of the Set 070 S3 cross-provider verification. Round 1 (you, gpt-5-4)
returned ISSUES FOUND with three findings; all three are now resolved -- confirm the
resolutions and review the NEW code change the dogfood drove.

SUITE BASELINE: full ai_router suite 2068 passed / 5 skipped, GREEN (was 2063/5 at
R1; +5 are the new equal-arms-guard negative tests below). The 5 skips are the
Set 069 S4 real-podman-on-Windows by-design skips.

RELEASE CONTRACT: FINAL session of Set 070. ai_router version bumped 0.23.0 -> 0.24.0
(pyproject.toml + ai_router/__init__.__version__, which must agree). The PyPI publish
is OPERATOR-GATED and runs POST-CLOSE (on the tagged green-Test SHA); this session
bumps the version + writes the change-log. No extension / Marketplace change.

WHAT CHANGED SINCE ROUND 1 (review these):
1. R1 Issue 2 (release/status tense): change-log.md reworded -- S3 status is now
   "VERIFIED; closing", the release is "version bumped this session; PyPI publish
   operator-gated, post-close" (header, status line, Release bullet, deliverables
   table). Confirm no remaining claim that 0.24.0 is already published or that S3 is
   already closed.
2. R1 Issue 3 (additive overclaim): the "byte-for-byte unchanged" claim is narrowed
   in change-log.md intro + pull-verifier.md final paragraph to the DUAL-SURFACE MODE
   only, explicitly acknowledging verification.md's framing IS an intended behavioral
   change (the steelman-push deliverable). Confirm.
3. R1 Issue 1 (dogfood claimed but not done): the dogfood has now RUN. Two artifacts
   are added: path-aware-critique.json (the required end-of-set multi-provider gate
   artifact) and dual-surface-comparison.json (the dual-surface mode run over this
   set's own diff, runTag opt-in, provenanceComplete=false, total_high_sev=0 -- an
   honest single underpowered datapoint). The docs' "dogfooded" claims are now
   substantiated by these committed artifacts.
4. NEW CODE CHANGE (the dogfood headline): the path-aware critique (gpt-5.4) caught a
   REAL Major contract-drift the S2 routed verification missed -- the scorers
   (score_comparison / score_against_benchmark) ignored the attestation, so an
   inspection-only require_equal=False artifact (explicitly "never RETIRE evidence")
   could be scored as valid telemetry. FIX: a new _arms_held_equal guard in
   ai_router/dual_surface_verify.py requires all four attestation booleans
   (providerEqual/modelEqual/framingEqual/bothAdversarial) to be STRICTLY true before
   either scorer treats an artifact as telemetry; otherwise score_comparison returns
   ok=False and score_against_benchmark returns INCONCLUSIVE. Five negative tests
   added (TestEqualArmsGuardOnScoring). REVIEW THIS CODE CHANGE for correctness.
   (A second path-aware finding -- that record_dual_surface_mode is mutable -- was
   adjudicated a FALSE POSITIVE: record_* is the low-level always-append "sanctioned
   writer"; immutability lives in resolve_and_record_dual_surface_mode, exactly the
   established path_aware_critique / verification_mode sibling pattern.)

Be a genuine devil's advocate on the NEW code change and the resolutions: assume they
are flawed and try to prove it. Output VERIFIED only if you cannot find a real defect;
otherwise ISSUES FOUND with Issue N: / Category / Severity.
"""

PROMPT = CONVENTIONS + "\n\n=== STAGED DIFF (git diff --cached) ===\n\n" + diff

result = route(
    PROMPT,
    task_type="session-verification",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-verification-round-2.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_id}")
