"""Set 069 S2 -- routed next-session / next-orchestrator recommendation.

Rule #17 / L-064-6: never self-opine on which engine is cheapest-capable.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

PROMPT = """\
Recommend the cheapest-CAPABLE orchestrator engine + reasoning effort for the
NEXT session of this session set, and a one-paragraph rationale. Return a short
structured recommendation (engine, model tier, effort, why), nothing else.

Context: dabbler-ai-orchestration, Set 069 (automated pull-critique
capabilities). Session 2 of 6 just shipped, VERIFIED (gpt-5-4, R1 FAIL -> 3 fixes
-> R2 PASS): trusted-command execution + diff-awareness wired into the producer.
Concretely - pull_verifier.py: a get_diff tool (raw unified diff, dispatched
directly like run_test, outside the byte-equality guard); _dispatch_run_test now
captures a clean-run _Execution with the RESOLVED trusted command id; the S1
evidence protocol is wired (the agent PROPOSES evidenceTier/commandId, the
orchestrator confers REPRODUCED only via a pristine REPLAY whose output hash
matches, else collapses to a read-claim; submit_verdict's evidence fields are
gated behind an active run_test lane so the read-only path is byte-identical).
pull_critique.py: threads run_test_config/diff_config/caps to pull_route, adds
blast-radius-budgeted caps (budget_caps_for_paths) + CLI flags. Full ai_router
suite green (1767 passed / 1 skip). No release (PyPI is S6).

Session 3 of 6 ("The probe-template lane -- the missing middle") will: build an
operator-authored, VERSIONED probe-template surface (e.g. "invoke validator on
this malformed-bytes artifact", "call X with a bad parent dir") the critic
invokes with TYPED, VALIDATED args -- the harness is human-authored (stays in the
trusted-command model); the model supplies only typed inputs. Define the
declaration + typed-arg validation + loop wiring; ship the templates that would
have caught the 0.22.x bugs as the first library + regression coverage. This is
real coding in ai_router (pull_verifier.py / pull_critique.py + a new
template-lane module), no metered calls in unit, with cross-provider verification
REQUIRED (the diff trips routed_gate). It is NOT an experiment and NOT the Podman
lane (that is S4, gated on a green spike).

Candidate engines: Claude (anthropic; opus-4-8 high / sonnet-4-6 high/medium),
Codex (openai; gpt-5.4 high), Gemini (google; gemini-2.5-pro). Judge on
capability-for-the-task and total cost (dollars + rework risk), per
docs/planning/orchestration-strategy.md. NOTE: tier-1 analysis models may return
stale model names; map any stale name to the closest current candidate and say so.
"""


def main():
    r = route(PROMPT, task_type="analysis", complexity_hint=40,
              session_set=str(HERE), session_number=2)
    out = HERE / "next-session-rec.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
