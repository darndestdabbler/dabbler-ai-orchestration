"""Set 065 S3 — round-2 verification: confirm the R1 findings are resolved and
no new inconsistency was introduced. Saves raw output to disk first (L-064-3)."""
from pathlib import Path
from ai_router import route

SET = Path("docs/session-sets/065-verification-surface-empirics")
PROP = Path("docs/proposals/2026-06-14-verification-surface-empirics/proposal.md")
OUT = SET / "s3-verification-r2.md"

proposal = PROP.read_text(encoding="utf-8")

PROMPT = f"""You verified an earlier draft of the proposal below and returned
ISSUES_FOUND with these findings (all now claimed fixed):

1. (Major) "One predicate" rule internally inconsistent — ambiguity/novelty were
   outside the stated predicate P.
2. (Major) Set-level gating ("compute P once per set") contradicted task-level
   delegation ("choose per task").
3. (Major) Candidate 2 scored against a stricter rule (author-independence as
   make-or-break) than §6 actually adopts (same-agent OK for low-blast-radius).
4. (Major) Overhead/cost overstated — "zero marginal cost" and "nothing lands
   in-band" conflicted with operator-minutes and same-agent authoring.
5. (Major) Mode-2 generalization beyond verification overstated the evidence.
6. (Minor) Candidate 1 mislabeled "deterministic harness" (critique is
   model-based).

How they were addressed:
1 & 2: §7 now defines a core predicate P with `P_task` (task-level: delegation
mode + author independence) and `P_set = any(P_task)` (set-level: pathAware
`required`), plus an explicit *heuristic extension* (ambiguity/novelty) that
fires for author-independence ONLY, labelled as outside the deterministic core.
The exec-summary "unifying insight" and §9 step 3 were updated to match.
3: Candidate 2's verdict now states the load-bearing invariant is
pre-commitment + immutability (sufficient for low-blast-radius same-agent work),
with author-independence the make-or-break caveat ONLY under gated high-risk
conditions; the mid-session per-claim form is still rejected.
4: "zero marginal cost" → "zero marginal metered-API cost (operator-minutes)";
§8 now explicitly carves out the in-band same-agent authoring cost as the one
honest exception.
5: §2 now frames the cross-task-type generalization as an untested hypothesis;
evidence-backed scope limited to path-aware critique (verification).
6: exec-summary row (a) verdict → "out-of-band, gated; deterministic tooling
layer — the critique itself is model-based".

Re-verify the CURRENT proposal below. Confirm whether each of the six findings
is resolved, and whether any fix introduced a NEW inconsistency or overclaim. Do
NOT raise the agreed scope conventions from round 1 (no production code, evidence
given, routed decision deliberately deferred, Anthropic-only spike) as findings.
Be terse; quote exact sentences for any remaining issue. End with a line of the
form "Verdict: VERIFIED" or "Verdict: ISSUES_FOUND".

=== CURRENT PROPOSAL ===
{proposal}
=== END PROPOSAL ===
"""

# Verifier (gpt-5-4) is already the top tier in its provider lane; pin max_tier
# to keep this a focused re-check, not an escalation (L-064-7).
r = route(PROMPT, task_type="session-verification", max_tier=3,
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 S3 — Proposal verification (round 2)\n\n"
    f"> Cross-provider session-verification. Model: {r.model_name} "
    f"({r.model_id}). Cost: ${r.cost_usd:.4f}\n\n---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
