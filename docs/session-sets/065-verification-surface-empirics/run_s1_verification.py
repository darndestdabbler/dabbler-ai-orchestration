"""Set 065 S1 cross-provider session-verification.

Independent verifier: gpt-5.4 (openai) — cross-provider for the Claude
orchestrator. Reviews the S1 bake-off analysis for logical validity, internal
consistency, defensibility of the headline figures, overclaim, and A/B-design
soundness. Persists raw output to s1-verification.md BEFORE printing (L-064-3).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

import yaml
from ai_router import providers

results_md = (HERE / "bake-off-results.md").read_text(encoding="utf-8")
ab_md = (HERE / "forward-ab-design.md").read_text(encoding="utf-8")
data_json = (HERE / "bake-off-data.json").read_text(encoding="utf-8")

BIAS_CAUTIONS = (
    "Bias cautions: this analysis was authored by an AI agent (Claude Opus 4.8) "
    "that has an opinion on the outcome and helps maintain the workflow under "
    "study. Its framing may over-state how settled the conclusions are. Before "
    "answering as posed, check whether the right question is being asked; if a "
    "different one is more useful, answer that too."
)

CONVENTIONS = """\
CONVENTIONS (read first — do NOT spend findings on these; they are disclosed and
are the central thesis, not defects):
- This is a RETROSPECTIVE with n=5 and FIVE named confounds (context-access,
  provider-multiplicity, cadence, round-count, order). The deliverables
  EXPLICITLY disclaim causal claims and frame the work as existence-proof +
  hypothesis-generation + a forward-A/B design. "Small n" / "confounded" /
  "not causally clean" are acknowledged, not omissions.
- The "is per-session routed verification worth keeping" question is
  DELIBERATELY left open (the A/B is designed to settle it). Not an incompleteness.
- Per-set finding extraction was delegated to sub-agents over the harvester
  artifacts; the two headline cases (C9 in 011, C3 in 012) and the same-provider
  isolation were verified against the source artifacts directly. You do NOT have
  repo access — judge the LOGIC and INTERNAL CONSISTENCY of the analysis against
  the data in bake-off-data.json, not the ground-truth of each harvester finding.

FOCUS your review on:
1. Logical validity of the de-confounding: does 012 C3 actually isolate
   context-access (same-provider GPT, snippet-miss vs repo-catch)? Does 010
   actually isolate provider-multiplicity (GPT-path-aware also missed; Gemini-only
   caught)? Is "both effects real, entangled, unseparable at n=5" supported?
2. Defensibility of the ~92%-probeable figure (11/12). Is any catch mislabeled
   probeable/novel? Does the conclusion (falsifier/contract-test lever) follow?
3. Internal consistency of the bucket counts and aggregate vs bake-off-data.json.
4. OVERCLAIM in the recommendations ("promote path-aware: strongly supported";
   "multi-provider"; "routed unanswered"). Is each warranted by the evidence shown?
5. Soundness of the forward-A/B design: does blind/same-frozen-tree + the 2x2 +
   seeded-defects actually control the five confounds and solve the oracle problem?
   Any flaw that would invalidate the experiment?
"""

SYSTEM_PROMPT = (
    "You are a senior research-methodology and software-verification reviewer "
    "giving an independent cross-provider verification of a completed analysis "
    "session (Set 065, Session 1). You did not author it. Be rigorous and "
    "concrete: cite the specific claim/section. Distinguish a real logical or "
    "consistency defect from a presentation nit. End with a JSON verdict block: "
    '{"verdict":"VERIFIED"|"ISSUES_FOUND","issues":[{"severity":'
    '"Critical|Major|Minor","claim":"<what>","problem":"<why>","fix":"<how>"}]}.'
)

USER = f"""{BIAS_CAUTIONS}

{CONVENTIONS}

=== DELIVERABLE 1: bake-off-results.md ===
{results_md}

=== DELIVERABLE 2: forward-ab-design.md ===
{ab_md}

=== DELIVERABLE 3: bake-off-data.json (per-set + aggregate data backing the above) ===
{data_json}

Review the analysis per the FOCUS list. Return your findings then the JSON verdict block."""


def main():
    cfg = yaml.safe_load(
        (REPO / "ai_router" / "router-config.yaml").read_text(encoding="utf-8")
    )
    pcfg = cfg["providers"]["openai"]
    model = next(m for m in cfg["models"].values() if m.get("model_id") == "gpt-5.4")
    result = providers.call_model(
        provider_name="openai",
        model_id="gpt-5.4",
        system_prompt=SYSTEM_PROMPT,
        user_message=USER,
        max_tokens=9000,
        config=pcfg,
        generation_params={},
    )
    out = HERE / "s1-verification.md"
    out.write_text(
        f"# Set 065 S1 — Cross-provider verification (gpt-5.4)\n\n"
        f"> Independent verifier: gpt-5.4 (openai), cross-provider for the Claude\n"
        f"> orchestrator. Round 1.\n\n{result.content}\n",
        encoding="utf-8",
    )
    in_cost = model["input_cost_per_1m"] / 1_000_000 * result.input_tokens
    out_cost = model["output_cost_per_1m"] / 1_000_000 * result.output_tokens
    print(f"Wrote {out} ({len(result.content)} chars)")
    print(json.dumps({
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": round(in_cost + out_cost, 6),
        "stop_reason": result.stop_reason,
    }, indent=2))


if __name__ == "__main__":
    main()
