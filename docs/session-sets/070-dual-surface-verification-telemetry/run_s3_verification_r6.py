"""Set 070 S3 -- cross-provider session verification ROUND 6 (authoritative final
gate). R4 found 2 issues (equal-arms guard over-strict on requested id; schema parity
incomplete for unkeyed findings); both resolved. SUBSTANTIVE re-verify -> stay on the
verifier's tier (NO max_tier pin; L-064-7)."""
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
=== UP-FRONT CONVENTIONS (Round 6, authoritative final gate) ===

ROUND 6. SUITE: 2079 passed / 5 skipped, GREEN (5 skips = Set 069 S4
real-podman-on-Windows by-design). Version 0.23.0 -> 0.24.0 (pyproject + __init__ agree).
PyPI publish OPERATOR-GATED, post-close. No extension change.

R5 found ONE Minor doc-accuracy issue: the _arms_held_equal docstring + change-log
item 1 still described the guard as consulting requestedProvider/requestedModel. Both
are now corrected to state equality is judged on ACTUAL arms (push vs pull) only;
requested* are provenance-only, not consulted. NO code/test change since R5 (suite
still 2079/5). Confirm the docs now match the shipped guard.

HOW R4'S TWO ISSUES WERE RESOLVED (context):
- R4 Issue 1 (Medium): _arms_held_equal() was over-strict - it required the REQUESTED
  provider/model to match both arms. It now judges equality on the ACTUAL arm
  identities only (pushProvider == pullProvider, pushModel == pullModel) + equal
  strong-adversarial framing; requestedProvider/requestedModel are recorded for
  provenance but no longer required to match (the live runner still pins to the request
  at PRODUCTION time; the scorer judges the recorded reality). A new test confirms an
  artifact whose arms agree but differ from the request string still scores.
- R4 Issue 2 (Major): the schema<->validator parity for provenanceComplete was
  completed. The schema's if/then now also forbids an unkeyed finding (defectKey == "")
  when provenanceComplete=true, via not/contains over findings (JSON Schema CAN express
  this cross-array half - the earlier "runtime-only" claim was wrong and is corrected in
  the schema description + change-log). A parity test confirms jsonschema AND the Python
  validator both reject provenanceComplete=true with an unkeyed finding.

STANDING ADJUDICATIONS (from earlier rounds; confirm still sound, do not re-litigate):
- The path-aware critique is the ITERATIVE end-of-set DOGFOOD; the committed
  path-aware-critique.json is its final round (the gate artifact, a VALID multi-provider
  artifact); path-aware-critique-prefix-dogfood.json preserves round 1. It is a
  different verification surface from this cross-provider gate and need not post-date
  these cross-provider fixes; all its findings are adjudicated in disposition.json.
- The dogfood dual-surface-comparison.json is a MECHANISM DEMONSTRATION (arms held
  equal, valid artifact); its six push findings are malformed-parse fallout (gemini
  markdown over a 5.7k-line diff), prominently caveated, with a push parse-quality guard
  recorded as a DEFERRED RESIDUAL. The shipping merge/score/validate code is correct;
  the artifact is never edited after writing (L-064-3).

FOCUS: confirm the two R4 fixes are correct and complete; check the equal-arms guard
cannot now accept a genuinely-unequal artifact, and that the schema not/contains is
well-formed. Be a genuine devil's advocate. Output VERIFIED only if you cannot find a
real defect; else ISSUES FOUND with Issue N: / Category / Severity.
"""

PROMPT = CONVENTIONS + "\n\n=== STAGED DIFF (git diff --cached) ===\n\n" + diff

result = route(
    PROMPT,
    task_type="session-verification",
    session_set="070-dual-surface-verification-telemetry",
    session_number=3,
)

out = HERE / "s3-verification-round-6.md"
out.write_text(result.content, encoding="utf-8")
print(f"Wrote {out} ({len(result.content)} chars)")
print(f"model={result.model_id}")
