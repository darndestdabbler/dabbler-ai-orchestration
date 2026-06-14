"""Set 065 S2 cross-provider session-verification.

Independent verifier: gpt-5.4 (openai) — cross-provider for the Claude
orchestrator. Reviews the S2 integration-surface spike for logical validity,
whether the GO verdict + recommendation follow from the captured measurements,
overclaim, and internal consistency. Persists raw output BEFORE printing
(L-064-3).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

import yaml
from ai_router import providers

report = (HERE / "spike-report.md").read_text(encoding="utf-8")
adapter = (HERE / "spike_first_party_adapter.py").read_text(encoding="utf-8")
fp_trace = (HERE / "first-party-trace-sample.json").read_text(encoding="utf-8")

# Compact measurements digest (the empirical evidence the report rests on).
DIGEST = """\
MEASUREMENTS DIGEST (captured this session; the verifier has NO host/trace
access beyond what is pasted here — judge the LOGIC and INTERNAL CONSISTENCY of
the report against this digest + the adapter source + the first-party trace
sample, not the ground-truth of the runs):

Host surface survey:
- copilot CLI 1.0.51: present, headless OK, subscription-authed.
- claude -p 2.1.63: present; REFUSES to nest in a Claude Code session.
- codex CLI, gemini CLI: absent on PATH.
- claude-agent-sdk: pip dry-run = 20 transitive deps + wraps Node claude CLI.
- first-party adapter: built (spike_first_party_adapter.py), httpx-only.

Copilot CLI runs (default model claude-sonnet-4.6), 3 repeats on a 4-file fixture:
- run1: 6 tool calls (report_intent + dir-list + 4 file reads), premiumRequests=1, api 25.2s, verdict ISSUES_FOUND, caught BOTH seeded bugs.
- run2: 6 tool calls, premiumRequests=1, api 23.0s, ISSUES_FOUND, BOTH.
- run3: 5 tool calls, premiumRequests=1, api 18.3s, ISSUES_FOUND, BOTH.
- model swap attempts gpt-5 / gpt-5.2 / claude-opus-4.1 / gemini-2.5-pro => all "Model not available" on this subscription.

First-party adapter runs (claude-sonnet-4-6 via Anthropic API), 3 repeats same fixture:
- run1: 4 read_file calls, in=2755 out=1067 tok, cost $0.02427, 21.6s, ISSUES_FOUND, BOTH + bonus (dead recursion guard).
- run2: 4 read_file calls, cost $0.02398, 20.2s, ISSUES_FOUND, BOTH + bonus.
- run3: 4 read_file calls, cost $0.02192, 17.2s, ISSUES_FOUND, BOTH.

Seeded defects: (probeable) build_unresolved_index walks only body_refs -> drops
unresolved header ref CurrencyTable, while index.json claims complete superset;
(novel-reasoning) resolve_chain does `depth < config["max_depth"]` while config.py
defaults max_depth=None ("unbounded") -> latent TypeError on the documented
default path that __main__ never exercises.
"""

BIAS_CAUTIONS = (
    "Bias cautions: this spike was authored by an AI agent (Claude Opus 4.8) that "
    "helps maintain the workflow under study and has a stake in a GO outcome. Its "
    "framing may over-state how settled the feasibility conclusion is, or favor "
    "the first-party option it built. Before answering as posed, check whether the "
    "right question is being asked; if a different one is more useful, answer that too."
)

CONVENTIONS = """\
CONVENTIONS (read first — do NOT spend findings on these; they are disclosed,
in-scope-by-design, or explicit non-goals):
- This is a FEASIBILITY SPIKE, not a benchmark: 1 host, 1 small fixture (4 files,
  one defect per S1 class), 3 repeats per surface. The report's job is an
  existence-proof that "path-aware critique can be a routed call" + a surface
  recommendation, NOT a statistically-powered comparison. Small-n / single-fixture
  is acknowledged, not an omission.
- NON-GOALS (per spec): shipping any production adapter; a full provider x surface
  matrix; editing any production code. The adapter (spike_first_party_adapter.py)
  is intentionally ~150 LOC throwaway demo code — do NOT review it as production
  (no need for retries/telemetry/packaging); only judge whether it does what the
  report claims (deterministic-servant tool loop, instrumentation, metered cost).
- The rung-2 (semantic indexing) limitation is DISCLOSED: the 4-file fixture
  cannot test large-repo retrieval; the report defers that to the S1 forward A/B.
  Do not treat the disclosed limitation as an overclaim.
- The verifier has no repo/host access; judge logic + internal consistency of the
  report against the DIGEST, the adapter source, and the trace sample.

FOCUS your review on:
1. Does the GO verdict follow from the measurements? Is "both surfaces caught
   both catch-classes 3/3" consistent with the digest?
2. Is the recommendation defensible: first-party PRIMARY (multi-provider control,
   anti-bias deterministic servant, httpx-only footprint) vs Copilot ALTERNATIVE
   (subscription $0-marginal, but plan-gated to Claude-only here, vendor servant)?
   Any logical gap, or a better reading of the same data?
3. Internal consistency: do the cost / tool-call / billing claims in the report
   match the digest + trace sample? Any number that contradicts itself?
4. OVERCLAIM check: especially "path-awareness empirically confirmed (probes
   run, not afforded)", the rung-1-sufficient-for-both-classes claim, and the
   "SDK=>metered is false" claim. Each warranted by the evidence shown?
5. Any flaw that would make the go/no-go or the surface recommendation unsafe to
   carry into the S3 synthesis proposal.
"""

SYSTEM_PROMPT = (
    "You are a senior software-verification and research-methodology reviewer "
    "giving an independent cross-provider verification of a completed spike "
    "session (Set 065, Session 2). You did not author it. Be rigorous and "
    "concrete: cite the specific claim/section. Distinguish a real logical or "
    "consistency defect from a presentation nit. End with a JSON verdict block: "
    '{"verdict":"VERIFIED"|"ISSUES_FOUND","issues":[{"severity":'
    '"Critical|Major|Minor","claim":"<what>","problem":"<why>","fix":"<how>"}]}.'
)

USER = f"""{BIAS_CAUTIONS}

{CONVENTIONS}

{DIGEST}

=== DELIVERABLE 1: spike-report.md ===
{report}

=== DELIVERABLE 2: spike_first_party_adapter.py (the first-party surface) ===
{adapter}

=== DELIVERABLE 3: first-party-trace-sample.json (run-1 trace) ===
{fp_trace}

Review per the FOCUS list. Return your findings then the JSON verdict block."""


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
    out = HERE / "s2-verification.md"
    out.write_text(
        f"# Set 065 S2 — Cross-provider verification (gpt-5.4)\n\n"
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
