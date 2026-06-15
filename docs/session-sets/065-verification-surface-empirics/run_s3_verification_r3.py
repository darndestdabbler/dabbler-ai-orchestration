"""Set 065 S3 — round-3 verification: confirm the 3 residual R2 items are
resolved with no new inconsistency. Saves raw output to disk first (L-064-3)."""
from pathlib import Path
from ai_router import route

SET = Path("docs/session-sets/065-verification-surface-empirics")
PROP = Path("docs/proposals/2026-06-14-verification-surface-empirics/proposal.md")
OUT = SET / "s3-verification-r3.md"

proposal = PROP.read_text(encoding="utf-8")

PROMPT = f"""Round 2 of your review left exactly three open items on this
proposal; all are now claimed fixed:

(R2-1) Bottom line (§10) re-overclaimed the §7 rule by collapsing the heuristic
extension → FIX: §10 now reads "One core blast-radius predicate — plus an
explicit heuristic extension for author-independence — governs all three
decisions".
(R2-4) Overhead placement still said "every adopted mechanism is out-of-band"
and exec-summary (d) implied falsifiers are purely out-of-band → FIX: §10 and
exec-summary row (d) now carry the same-agent in-band authoring exception
explicitly.
(R2-new) Candidate 3 hard-coded universal independent test authorship,
conflicting with §6's gated same-agent rule → FIX: Candidate 3's description now
gates test authorship by `P_task` / ambiguity-novelty (independent when it
holds; same-agent under temporal-separation + immutability for low-blast-radius).

Re-verify the CURRENT proposal below. Confirm whether each of these three items
is now resolved and whether any fix introduced a NEW inconsistency or overclaim.
Do NOT re-raise the agreed round-1 scope conventions (no production code,
evidence given, routed decision deliberately deferred, Anthropic-only spike).
Be terse; quote exact sentences for anything still open. End with a line of the
form "Verdict: VERIFIED" or "Verdict: ISSUES_FOUND".

=== CURRENT PROPOSAL ===
{proposal}
=== END PROPOSAL ===
"""

r = route(PROMPT, task_type="session-verification", max_tier=3,
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 S3 — Proposal verification (round 3)\n\n"
    f"> Cross-provider session-verification. Model: {r.model_name} "
    f"({r.model_id}). Cost: ${r.cost_usd:.4f}\n\n---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
