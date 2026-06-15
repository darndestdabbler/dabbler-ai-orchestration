"""Set 065 S3 — cross-provider verification of the synthesis proposal.
Saves raw verifier output to disk first (L-064-3). Up-front conventions block
(L-064-10) so the verifier focuses on real defects, not the deliberate scope
boundaries of a proposal-only research set."""
from pathlib import Path
from ai_router import route

SET = Path("docs/session-sets/065-verification-surface-empirics")
PROP = Path("docs/proposals/2026-06-14-verification-surface-empirics/proposal.md")
OUT = SET / "s3-verification.md"

proposal = PROP.read_text(encoding="utf-8")

PROMPT = f"""You are the independent cross-provider verifier for the FINAL
session (Session 3 of 3) of an AI-led "session set" whose sole deliverable is a
**synthesis proposal**. Verify the proposal below for correctness, internal
consistency, faithfulness to its cited evidence, and soundness of its
recommendations. Return a verdict of VERIFIED or ISSUES_FOUND. If ISSUES_FOUND,
list each issue with a severity (Critical / Major / Minor) and a concrete fix.

=== CONVENTIONS / BASELINE (agreed; do NOT raise these as findings) ===
- This set ships NO production code. By design there are no edits to
  close_session, router-config.yaml, the extension, or guidance docs, and no
  release. "No implementation" is the intended scope, not an omission.
- The proposal SYNTHESIZES prior in-set evidence; it does not re-derive it. The
  evidence is established and may be treated as given:
  * S1 retrospective bake-off (harvester Sets 008-012, n=5): 12 unique real
    defects caught by path-aware critique that routed verification missed (mostly
    Major, two wrong-data/structural Criticals C9 and C3); ~92% (11/12) of those
    are "probeable" (a pre-committed deterministic check would catch them); both
    context-access (proven by 012 C3: same model GPT missed snippet-fed across 4
    routed rounds, caught with repo access) and provider-diversity (proven by
    010: Gemini-only catches) are real and entangled at n=5; whether routed
    verification has marginal value is UNANSWERED by the retrospective because of
    an order confound (routed always ran first on pre-remediation code,
    path-aware second on post-remediation code).
  * S2 spike: path-aware critique CAN be a headless routed call; a first-party
    httpx tool-loop adapter (~$0.024/run, Anthropic only exercised) and the
    GitHub Copilot CLI (subscription, Claude-only on the seat tested) both caught
    both catch-classes 3/3 with confirmed tool use.
- The proposal DELIBERATELY DEFERS the "keep/demote/retire per-session routed
  verification" decision to a forward A/B (Experiments A + B). Deferring it is a
  correct, intended choice (the retrospective cannot settle it), not a failure to
  decide. Do not score the deferral as indecision.
- It is acceptable that the spike exercised only Anthropic and that Copilot's
  multi-provider capability was plan-gated on the seat tested; the proposal
  states these caveats explicitly.

=== WHAT TO CHECK (raise findings here) ===
1. Internal consistency: do the recommendations (table in section 1, sections
   5-7, section 10) agree with each other and with the evidence summary?
2. Faithfulness: does any claim OVERSTATE the evidence (e.g. treat an
   order-confounded result as clean, claim a cross-provider proof the spike did
   not run, assert a causal estimate the n=5 data cannot support)?
3. Soundness of the rubric application in section 5 (are the four candidates
   scored correctly against the stated rubric; are the verdicts justified?).
4. Soundness of the open-question resolution (section 6) and the unifying
   single-predicate claim (section 7) — is "one blast-radius gate governs all
   three decisions" actually supported, or an over-unification?
5. Any logical gap, contradiction, or unsupported leap that would mislead a
   future implementer.

=== PROPOSAL UNDER REVIEW ===
{proposal}
=== END PROPOSAL ===

Be specific and terse. Quote the exact sentence for any issue. End with a line
of the form: "Verdict: VERIFIED" or "Verdict: ISSUES_FOUND".
"""

r = route(PROMPT, task_type="session-verification",
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 S3 — Proposal verification (round 1)\n\n"
    f"> Cross-provider session-verification. Model: {r.model_name} "
    f"({r.model_id}). Cost: ${r.cost_usd:.4f}\n\n---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
