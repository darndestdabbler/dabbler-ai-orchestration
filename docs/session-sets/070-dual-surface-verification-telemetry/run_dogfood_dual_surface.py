"""Set 070 S3 DOGFOOD B -- run the NEW dual-surface mode over this set's OWN diff
and record the provenance-tagged comparison (spec S3 headline). This is a deliberate
operator OPT-IN run (tagged 'opt-in' = operational high-assurance, NOT folded into
unbiased telemetry). Push + pull arms held EQUAL (provider/model/framing); both
adversarial. NOT powered telemetry: the arms' findings carry no defectKey, so the
merge over-splits to single-surface entries (provenanceComplete=False) -- the honest
single self-referential datapoint the docs describe."""
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

import ai_router.dual_surface_verify as dsv  # noqa: E402

SET_DIR = HERE
SET_BASE = "e0acc8c"  # Set 069 close == the commit before Set 070 S1 (this set's base)
PROVIDER = "google"   # gemini-2.5-pro: converges cheaply as a pull prober (L-067-1)

# 1. Record the dualSurfaceMode durably (opt-in: a deliberate dogfood request).
recorded = dsv.resolve_and_record_dual_surface_mode(SET_DIR, cli_choice="opt-in")
print(f"dualSurfaceMode recorded={recorded!r} (None => a record already existed)")

# 2. Run both arms over the set's own diff (base..WORKTREE), equal-held + adversarial.
run = dsv.run_dual_surface(
    SET_DIR,
    base_ref=SET_BASE,
    head_ref="",                 # empty => committedRef recorded as base..WORKTREE
    provider=PROVIDER,
    require_equal=True,          # refuse if framing/provider/model not held equal
)
print(f"committedRef={run.committed_ref}")
print(f"push: {run.push.provider}/{run.push.model} {run.push.verdict} "
      f"({len(run.push.issues)} issues) framing={run.push.framing.strength}")
print(f"pull: {run.pull.provider}/{run.pull.model} {run.pull.verdict} "
      f"({len(run.pull.findings)} findings) ok={run.pull.ok} "
      f"framing={run.pull.framing.strength} stop={run.pull.stop_reason}")
print(f"attestation framingEqual={run.attestation['framingEqual']} "
      f"providerEqual={run.attestation['providerEqual']} "
      f"modelEqual={run.attestation['modelEqual']} "
      f"bothAdversarial={run.attestation['bothAdversarial']}")

# 3. Provenance merge (stable defectKey only; arms have none => honest over-split).
merge = dsv.merge_findings(run.push.issues, run.pull.findings)

# 4. Build + validate + write the comparison artifact (L-064-3: write utf-8 to disk).
compared_at = datetime.now(timezone.utc).isoformat()
artifact = dsv.build_comparison_artifact(
    run, merge, run_tag=dsv.RUN_TAG_OPT_IN, compared_at=compared_at,
    notes=("Set 070 S3 dogfood: dual-surface mode run over this set's own diff. "
           "A deliberate opt-in (operational) run; the arms' findings carry no "
           "defectKey, so the merge over-splits to single-surface entries "
           "(provenanceComplete=False) -- a single self-referential datapoint, NOT "
           "powered benchmark telemetry."),
)
validation = dsv.validate_comparison_artifact(artifact)
print(f"artifact valid={validation.ok} code={validation.code} "
      f"reasons={list(validation.reasons)}")

import json  # noqa: E402
out = SET_DIR / dsv.COMPARISON_ARTIFACT_FILENAME
out.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {out}")

# 5. Score it (the equal-arms guard added this session must pass on a held-equal run).
score = dsv.score_comparison(artifact)
print(f"score ok={score.ok} push_unique_hi={score.push_unique_high_sev} "
      f"pull_unique_hi={score.pull_unique_high_sev} shared_hi={score.shared_high_sev} "
      f"total_hi={score.total_high_sev} upper_bound={score.upper_bound} "
      f"provenance_complete={score.provenance_complete}")
print(f"score reasons={list(score.reasons)}")
