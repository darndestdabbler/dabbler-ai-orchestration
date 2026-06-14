"""Set 065 S1 verification — Round 2 (confirm R1 remediations).

Same verifier (gpt-5.4, openai), direct call_model (no router escalation).
Shows the R1 findings + the updated deliverables; asks for confirmation that
each is resolved and whether any fix introduced a new problem.
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

R1 = """\
Your Round-1 verdict was ISSUES_FOUND with these four findings:
1. [Major] forward-ab-design.md claimed the blind same-frozen-tree A/B would
   settle routed's marginal value, but it holds cadence constant and so tests
   capability, not cadence (routed's named surviving defense).
2. [Minor] '010 cleanly isolates provider-multiplicity' overstated — it shows
   provider-diversity / a provider-specific blind spot, not the two-reviewer
   multiplicity effect.
3. [Minor] 'the expensive agent is strictly needed for only ~8%' too absolute —
   the 92% is post-hoc; pre-authorability not shown.
4. [Minor] 'cadence, not unique capability' overstated — no clean unique-capability
   evidence here is not the same as cadence being the only defense.
"""

SYSTEM_PROMPT = (
    "You are the same independent cross-provider verifier (gpt-5.4) doing Round 2. "
    "Confirm whether each Round-1 finding is now resolved by the revised "
    "deliverables, and whether any revision introduced a NEW logical or "
    "consistency problem. Be concise. End with a JSON verdict block: "
    '{"verdict":"VERIFIED"|"ISSUES_FOUND","resolved":["1","2",...],'
    '"remaining":[{"severity":"...","problem":"...","fix":"..."}]}.'
)

USER = f"""{R1}

The author revised the deliverables. Key changes: forward-ab-design.md now splits
the study into **Experiment A** (capability — the blind same-frozen-tree 2x2) and
a new **Experiment B** (cadence — a staged-snapshot intervention study measuring
cumulative defect burden / rework / cost for per-session-routed vs end-of-set
path-aware), and states keep-or-drop-routed needs BOTH. The results.md wording on
010 (provider-diversity), the ~8% (post-hoc caveat), and routed's defense
(only-evidenced-here-is-cadence) was softened accordingly.

=== REVISED bake-off-results.md ===
{results_md}

=== REVISED forward-ab-design.md ===
{ab_md}

Confirm each of the four R1 findings is resolved (or not), flag any new issue,
and give the JSON verdict."""


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
        max_tokens=6000,
        config=pcfg,
        generation_params={},
    )
    out = HERE / "s1-verification-r2.md"
    out.write_text(
        f"# Set 065 S1 — Cross-provider verification Round 2 (gpt-5.4)\n\n{result.content}\n",
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
