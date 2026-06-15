"""Set 065 S3 — round-4 verification: confirm the final R3 overhead-placement
consistency fixes landed. Saves raw output to disk first (L-064-3)."""
from pathlib import Path
from ai_router import route

SET = Path("docs/session-sets/065-verification-surface-empirics")
PROP = Path("docs/proposals/2026-06-14-verification-surface-empirics/proposal.md")
OUT = SET / "s3-verification-r4.md"

proposal = PROP.read_text(encoding="utf-8")

PROMPT = f"""Round 3 left ONE open item on this proposal (overhead-placement
inconsistency); now claimed fixed in three places:
- Candidate 2 "Where it lands": now splits independently-authored (out-of-band)
  vs same-agent low-blast-radius (upfront in-band, temporal-sep + immutability)
  vs working-agent-mid-session (in-band, self-defeating).
- Candidate 3 "Where it lands": gate execution out-of-band; test authoring split
  the same way as Candidate 2.
- §10 + §8: broadened the in-band exception from "falsifier authoring" to
  "contract/falsifier authoring".

Re-verify the CURRENT proposal below: is the overhead-placement description now
internally consistent across the exec-summary, §5 (Candidates 2 & 3), §8, and
§10, with no new inconsistency? Do NOT re-raise the agreed round-1 scope
conventions. Be terse; quote exact sentences for anything still open. End with a
line of the form "Verdict: VERIFIED" or "Verdict: ISSUES_FOUND".

=== CURRENT PROPOSAL ===
{proposal}
=== END PROPOSAL ===
"""

r = route(PROMPT, task_type="session-verification", max_tier=3,
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 S3 — Proposal verification (round 4)\n\n"
    f"> Cross-provider session-verification. Model: {r.model_name} "
    f"({r.model_id}). Cost: ${r.cost_usd:.4f}\n\n---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
