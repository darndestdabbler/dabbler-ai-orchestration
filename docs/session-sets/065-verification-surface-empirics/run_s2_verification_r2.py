"""Set 065 S2 cross-provider verification, ROUND 2 (confirm R1 fixes).

Same verifier (gpt-5.4). Shows the three R1 findings + the exact edits made,
asks whether each is resolved and whether any NEW issue was introduced. Direct
call_model (no route()) so there is no auto-escalation (L-064-7 N/A). Persists
raw output before printing (L-064-3).
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

R1_AND_FIXES = """\
ROUND 1 returned ISSUES_FOUND with 3 issues (1 Major, 2 Minor), all
confidence-calibration. The author applied these edits to spike-report.md:

[Major] first-party "delivers S1's multi-provider requirement deterministically"
  overstated (only Anthropic was exercised).
  FIX: TL;DR, the first-party "Harness vs. model" bullet, the decision-matrix
  multi-provider row, and Go/No-Go item 1 now all say first-party "best
  preserves / is architecturally enabled for" multi-provider routing under our
  control, and explicitly state "this spike exercised only Anthropic; other
  providers' bindings were not run here."

[Minor] "full determinism over 3 repeats" overstated (tool counts 6/6/5,
  severity labels varied).
  FIX: TL;DR now says "repeat-stable verdicts ... (outcomes stable; tool counts
  and severity labels varied slightly)"; the Instrumentation section now says
  "identical verdict every run, with small behavioral variance ... stable
  outcomes, not bit-for-bit determinism."

[Minor] Copilot "--allow-all-tools grants shell/edit by default" relied on
  product knowledge not in the pasted evidence.
  FIX: Sandbox section now says "treat that mode as permissive unless explicitly
  constrained ... (Exact default-granted tool set on this version was not
  separately captured; the operational rule — constrain it — holds regardless)."

Also anchored the "~3.8k tokens" envelope line to run-1's exact counts.
"""

SYSTEM_PROMPT = (
    "You are the same independent cross-provider verifier (gpt-5.4) confirming "
    "round-1 fixes for Set 065 Session 2. Judge ONLY: (1) is each of the 3 R1 "
    "issues now resolved by the revised text? (2) did any fix introduce a new "
    "inconsistency or overclaim? Be concise. End with a JSON verdict block: "
    '{"verdict":"VERIFIED"|"ISSUES_FOUND","issues":[...]} where issues is empty '
    "if all three are resolved and nothing new was introduced."
)

USER = f"""{R1_AND_FIXES}

=== REVISED spike-report.md (full) ===
{report}

Confirm whether the three R1 issues are resolved and no new issue was
introduced. Return the JSON verdict block."""


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
        max_tokens=4000,
        config=pcfg,
        generation_params={},
    )
    out = HERE / "s2-verification-r2.md"
    out.write_text(
        f"# Set 065 S2 — Cross-provider verification (gpt-5.4), Round 2\n\n"
        f"> Confirms the three R1 fixes. Direct call_model (no escalation).\n\n"
        f"{result.content}\n",
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
