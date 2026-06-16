"""Set 068 S6 -- routed NEXT-SESSION-SET recommendation (L-064-6: never self-opine)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

PROMPT = """\
Recommend the NEXT session SET for the dabbler-ai-orchestration repo (the canonical
source of shared AI-orchestration infrastructure: the ai_router Python package
released to PyPI + a VS Code extension on the Marketplace). Reply with a short
recommended set title, a one-paragraph rationale, a rough session count, and whether
it ships a release. Do NOT pick an orchestrator model -- a separate routed call does
that at the set's first session.

CONTEXT -- what just shipped. Set 068 (just CLOSING) completed the verification-surface
program that Set 065 framed and Sets 066-067 began. Across six sessions it: (S1) built
the disposable-worktree run_test execution cage + relocated grep ReDoS isolation onto a
killable subprocess; (S2) symmetric Experiment A re-grade (path-aware catches real
cross-file defects snippet-fed routed cannot; direction robust, magnitude
metric-sensitive); (S3) ran Experiment B, the cadence study (verdict: cadence defense
DOES NOT HOLD under the pre-registered rule, but the mechanism is real and narrow); (S4)
routed the keep/demote/retire decision via cross-provider consensus + operator
confirmation -> DEMOTE, transition-guarded; (S5) shipped the deterministic contract-test
/ CDC gate (the replacement floor); (S6) wrote the verification-surface-strategy synthesis,
WIRED the routed-gating predicate (routed_gate.py) that flips per-session routed
verification from mandatory to GATED, and released ai_router 0.22.0 to PyPI.

So the verification-surface arc is DONE. The layered model is now: contract-test gate
(deterministic floor) -> path-aware critique (multi-provider ceiling) -> per-session
routed verification (now gated on a blast-radius/coupling predicate).

OPEN / CANDIDATE follow-on work the set explicitly left:
1. Telemetry to reopen RETIRE: instrument escaped-defect rate, intro-stage vs end-of-set
   catch timing, rework saved by gated routed calls, false-positive churn, and sessions
   where the gating predicate failed to trigger but should have -- the data the DEMOTE
   decision said RETIRE should be reopened on.
2. Explorer / extension UI surface for the routed decision, the run_test tool, and the
   contract-test gate (Set 068 deferred ALL UI as a non-goal; would ship a Marketplace bump).
3. Generalize Mode-2 (pull / path-aware) BEYOND verification to code-gen / docs / analysis
   -- the Set 065 proposal flagged this as an untested design extrapolation.
4. Adopt the contract-test gate + run_test cage into a CONSUMER repo (e.g. the harvester)
   as the first real-world dogfood beyond this canonical repo.
5. Repository-reference / consumer-backfill debt and any guidance-overhead pruning.

Weigh these (or propose a better next set). Favor the highest-leverage next step given
that the verification machinery now exists but has NOT yet been (a) measured in
production via telemetry or (b) surfaced in the UI or (c) adopted by a consumer."""


def main():
    r = route(PROMPT, task_type="analysis", complexity_hint=60)
    out = HERE / "next-set-rec.md"
    out.write_text(
        "# Set 068 S6 -- routed NEXT-SESSION-SET recommendation\n\n"
        f"> Routed via route(task_type='analysis'). Model: {getattr(r,'model_used','?')}.\n\n"
        f"{r.content}\n",
        encoding="utf-8",
    )
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)}, indent=2))


if __name__ == "__main__":
    main()
