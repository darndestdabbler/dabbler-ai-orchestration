"""Set 070 S3 -- cross-provider session verification ROUND 3. R2 (gpt-5-4) found 2
issues (path-aware gate-artifact staleness + change-log footer corruption); both
resolved. Since R2 the path-aware dogfood also drove TWO more real code/schema fixes
(surfaces-consistency + schema parity). This round confirms all resolutions on the
final tree. SUBSTANTIVE re-verify -> stay on the R1/R2 verifier tier (NO max_tier
pin; L-064-7 as refined this session)."""
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
=== UP-FRONT CONVENTIONS (Round 3; do not re-litigate the baseline) ===

ROUND 3 of the Set 070 S3 cross-provider verification. Rounds 1-2 (you, gpt-5-4) found
issues; all are resolved. This round confirms the resolutions + reviews the additional
code/schema fixes the path-aware dogfood drove since R2.

SUITE BASELINE: full ai_router suite 2073 passed / 5 skipped, GREEN. The 5 skips are
the Set 069 S4 real-podman-on-Windows by-design skips. Test growth this session: +10
(5 equal-arms-guard + 3 surfaces-consistency + 2 schema-parity negative tests).

RELEASE CONTRACT: FINAL session of Set 070. ai_router version bumped 0.23.0 -> 0.24.0
(pyproject.toml + ai_router/__init__.__version__, which agree). The PyPI publish is
OPERATOR-GATED and runs POST-CLOSE on the tagged green-Test SHA. No extension change.

WHAT WAS RESOLVED SINCE ROUND 2:
- R2 Issue 1 (path-aware gate artifact was captured PRE-FIX): the path-aware critique
  was RE-RUN on the post-fix tree; the pre-fix run is preserved as
  path-aware-critique-prefix-dogfood.json (the dogfood evidence that caught the
  equal-arms defect); path-aware-critique.json is now the post-fix gate artifact. The
  change-log "Dogfood findings" section documents the iterative trajectory honestly.
- R2 Issue 2 (change-log footer stale + stray </content>/</invoke> markup): the stray
  markup is removed and the footer now states the final 2073/5 totals and the +10 test
  delta.

ADDITIONAL FIXES the iterative path-aware dogfood drove since R2 (review these):
- surfaces-consistency (Major): MergedFinding.surfaces now emits DISTINCT surfaces
  (an intra-arm duplicate key kept duplicate labels); _validate_merged_finding now
  rejects duplicate surfaces AND surfaces that disagree with the contributors'
  distinct surfaces; the JSON Schema adds uniqueItems. +3 tests.
- schema<->validator parity (Major): the Python validator rejects provenanceComplete
  =true with a nonzero unkeyed count, but the JSON Schema did not. Added an if/then
  constraint tying provenanceComplete=true to pushUnkeyed=0 AND pullUnkeyed=0 (the
  cross-array "no unkeyed finding" half stays runtime-only, since JSON Schema cannot
  express it). +2 parity tests; description updated.

ALSO IN THE FINAL DIFF: the equal-arms scoring guard (_arms_held_equal) from the first
dogfood round; the dogfood artifacts (path-aware-critique.json [post-fix gate],
path-aware-critique-prefix-dogfood.json [pre-fix evidence], dual-surface-comparison.json
[the mode run; provenanceComplete=false, total_high_sev=0]); the change-log
"Dogfood-artifact caveat" honestly recording that the dual-surface dogfood's push arm
parsed into empty-severity findings (a known-malformed parse over a large markdown
response) + a recorded DEFERRED RESIDUAL (a push parse-quality guard) -- so the
artifact demonstrates the mechanism but is explicitly NOT clean defect evidence.

Be a genuine devil's advocate: assume the resolutions and the new code/schema changes
are flawed and try to prove it. Pay attention to whether the if/then JSON Schema
constraint is correct and whether the surfaces validator change can reject a LEGITIMATE
artifact. Output VERIFIED only if you cannot find a real defect; else ISSUES FOUND with
Issue N: / Category / Severity.
"""

PROMPT = CONVENTIONS + "\n\n=== STAGED DIFF (git diff --cached) ===\n\n" + diff

result = route(
    PROMPT,
    task_type="session-verification",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-verification-round-3.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_id}")
