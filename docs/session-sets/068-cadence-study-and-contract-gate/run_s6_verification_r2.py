"""Set 068 S6 -- cross-provider session verification (Step 6, gated -> REQUIRED).

S6's own diff trips the routed_gate predicate (multi-module + blast-radius +
breadth + build-config), so per-session routed verification is REQUIRED. The
orchestrator is Anthropic/opus; the verifier routes to a different provider.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402


def read(rel: str) -> str:
    return (REPO / rel).read_text(encoding="utf-8")


ROUTED_GATE = read("ai_router/routed_gate.py")
TEST_ROUTED_GATE = read("ai_router/tests/test_routed_gate.py")
STRATEGY = read("docs/verification-surface-strategy.md")

# Targeted diffs (the changed prose surfaces) so the verifier can check the
# cut-over consistency without the whole files.
import subprocess  # noqa: E402

DIFF = subprocess.run(
    ["git", "diff", "--cached", "--",
     "docs/ai-led-session-workflow.md",
     "ai_router/router-config.yaml",
     "ai_router/docs/close-out.md",
     "ai_router/docs/pull-verifier.md",
     "ai_router/CHANGELOG.md",
     "pyproject.toml",
     "ai_router/__init__.py"],
    cwd=str(REPO), capture_output=True, text=True,
).stdout

PROMPT = f"""\
You are the cross-provider session verifier for Session 6 (the FINAL session) of
Set 068 in the dabbler-ai-orchestration repo. This is ROUND 2. Return the
structured verdict.

=== WHAT CHANGED SINCE ROUND 1 (your two findings were accepted and fixed) ===
- Finding 1 (build-ci-config under-implemented): `_BUILD_CI_CONFIG_SIGNALS` now
  covers the repo config surfaces DIRECTLY -- router-config.yaml(.yml/.local),
  package.json, package-lock.json, .pre-commit-config -- so an isolated
  config-only diff trips the NAMED build-ci-config trigger, not only the
  blast_radius INDEX signal. New regression test
  test_isolated_router_config_trips_build_ci_config_directly.
- Finding 2 (tests didn't prove what they name): the three weak tests are
  strengthened -- test_overrides_cannot_lower_a_tripped_diff now enables ALL
  overrides on an already-REQUIRED diff and asserts the base triggers remain a
  subset; test_triggers_in_exact_canonical_order asserts the EXACT trigger tuple;
  test_at_least_one_reason_per_tripped_trigger asserts reasons >= triggers and
  names the expected triggers.
Verify the FIXES are correct and complete; do not re-litigate accepted findings.

=== CONVENTIONS / BASELINE (read first; do NOT re-flag the agreed baseline) ===
- Suite baseline BEFORE this session: 1641 passed, 1 skipped (the 1 skip is
  pre-existing and tracked). This session ADDS 26 tests in test_routed_gate.py
  -> the full suite is GREEN at 1667 passed, 1 skipped (orchestrator confirmed).
  You are verifying the CODE + DOCS, not re-running the suite.
- RELEASE CONTRACT: this set ships ai_router 0.22.0 to PyPI ONLY (operator pushes
  tag v0.22.0 on a green-Test commit). NO Marketplace / extension change this set
  -- that is by design (spec non-goal: no UI surface this set).
- BY-DESIGN SCOPE: the set is ADDITIVE. S6's one genuine code change is the
  routed_gate predicate that executes the S4 DEMOTE cut-over (per-session routed
  verification: mandatory -> gated). No experiment is re-run; the synthesis doc
  re-states already-verified S1-S5 findings.
- The per-session routed verification policy itself is being CHANGED this session
  (that is the point); do not flag "routed verification changed" as a defect --
  verify the change is implemented CONSISTENTLY and SOUNDLY.

=== WHAT TO VERIFY ===
Focus on these load-bearing properties (cite file:line for any finding):

1. CORRECTNESS of the gating predicate (ai_router/routed_gate.py): does
   evaluate_routed_gate trip REQUIRED on the S4-named triggers (blast-radius
   core via blast_radius.classify_paths, multi-module span, diff breadth,
   build/CI/config, and the 3 overrides) and bypass ONLY a small single-module
   probe-covered diff? Can the 3 operator override flags ever LOWER the verdict
   (they must only RAISE it)? Is the CLI exit-code contract (0 REQUIRED / 10
   SKIP; --json exits 0) correct? Is the dedupe / module-root logic right? Any
   way a session that SHOULD be verified bypasses (bypass set too wide)?

2. CUT-OVER CONSISTENCY (the diffs below). The DEMOTE went from
   "transition-guarded, NOT in effect, MANDATORY" to "cut over, gated". Are there
   STALE ECHOES still saying per-session routed verification is mandatory /
   unchanged, or that the transition guard is still pending, in
   docs/ai-led-session-workflow.md, ai_router/router-config.yaml,
   ai_router/docs/, or docs/verification-surface-strategy.md? (L-065-1: a
   consistency claim is rarely local.)

3. SYNTHESIS ACCURACY (docs/verification-surface-strategy.md): does it state the
   findings HONESTLY (Exp A direction-not-magnitude; Exp B cadence does-not-hold
   via B3 but mechanism real; E not a perfect ceiling; small-n) without
   overclaiming? Does it inherit any claim that is no longer true (L-064-8)? Are
   its file/behavior references accurate to the code?

4. RELEASE HONESTY (CHANGELOG + pyproject diff): version 0.21.1 -> 0.22.0; does
   the 0.22.0 entry describe exactly what shipped (run_test cage, contract gate,
   routed_gate cut-over) with no API overclaim and the routed-status change
   stated?

5. TEST ADEQUACY (test_routed_gate.py): do the 26 tests actually exercise the
   behaviors they name (override-raise-only, bypass, breadth threshold, trigger
   order, CLI exit codes), or do any pass without exercising the named behavior?

=== ai_router/routed_gate.py ===
{ROUTED_GATE}

=== ai_router/tests/test_routed_gate.py ===
{TEST_ROUTED_GATE}

=== docs/verification-surface-strategy.md ===
{STRATEGY}

=== DIFFS (workflow doc, router-config, close-out.md, pull-verifier.md, CHANGELOG, pyproject, __init__) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(HERE),
        session_number=6,
    )
    out = HERE / "s6-verification-round-2.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)}, indent=2))


if __name__ == "__main__":
    main()
