"""Set 069 S3 -- routed next-session / next-orchestrator recommendation.

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
capabilities). Session 3 of 6 just shipped, VERIFIED (gpt-5-4, R1 FAIL 3 findings
-> R2 confirmed + 1 new finding -> R3 PASS): the probe-template lane. Concretely -
a new ai_router/probe_templates.py (operator-authored, VERSIONED probe templates +
typed-arg validation + a cage-backed runner + an in-cage driver harness invoked as
`python -m ai_router.probe_templates --run <id> <json-args>`); wired a
run_probe_template tool + cage dispatch + templateId evidence stamping into
pull_verifier.pull_route (each captured execution now carries its OWN replay
context repo/ref/caps -- the R2 fix); threaded a ProbeTemplateConfig +
--probe-templates CLI flag through the pull_critique producer; a seed library
(malformed_artifact_bytes, bad_parent_dir) that drives ai_router's own public
entrypoints -- and the dogfood SURFACED + FIXED a still-latent UnicodeError gap in
four path_aware_critique.py readers (the same 0.22.x class Set 068 fixed in
contract_gate). Full ai_router suite green (1820 passed / 1 skip). No release (PyPI
is S6).

Session 4 of 6 ("Podman model-authored-probe lane -- GATED on a green spike")
will: FIRST read docs/proposals/2026-06-16-pull-architecture-capabilities/
podman-spike/spike-result.json + the spike README. If the spike is NOT GREEN (or
absent), record a NO-GO in the close-out and SKIP the Podman work (the set
proceeds to S5 with rungs 1-3+5-6). If GREEN: graduate the spike harness into
ai_router/ as run_test_sandbox's sibling -- a digest-pinned no-secrets image; a
`podman run` cage (--network=none, read-only repo, tmpfs scratch, --cap-drop=ALL,
caps, crash-safe teardown); a tiny typed tool surface; wire it as the autonomous,
severity-gated rung-(b) lane with an AI safety check that is TRIAGE-ONLY (may
reject/escalate, never approve); evidence flows through the S1 protocol; add
--network=none / read-only / teardown + DISK-FOOTPRINT regression tests (0
leftover containers/volumes; image count == pinned set); carry the spike's three
findings (cgroup v2 + delegation for --memory/--pids-limit/--cpus; timeout/teardown
tuning ~10s rootless WSL; separate probe output from podman runtime warnings).
This is environment-sensitive systems coding (Podman/WSL2) with a hard
spike-gate decision up front, cross-provider verification REQUIRED (the diff trips
routed_gate), no metered model loop in unit. It is NOT an experiment.

Candidate engines: Claude (anthropic; opus-4-8 high / sonnet-4-6 high/medium),
Codex (openai; gpt-5.4 high), Gemini (google; gemini-2.5-pro). Judge on
capability-for-the-task and total cost (dollars + rework risk), per
docs/planning/orchestration-strategy.md. NOTE: tier-1 analysis models may return
stale model names; map any stale name to the closest current candidate and say so.
"""


def main():
    r = route(PROMPT, task_type="analysis", complexity_hint=42,
              session_set=str(HERE), session_number=3)
    out = HERE / "next-session-rec.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
