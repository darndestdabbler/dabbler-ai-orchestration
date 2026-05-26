"""Set 047 Session 1 audit-pass cross-provider consensus driver.

Runs two-pass devil's-advocate verification on
[proposal.md](proposal.md):

  Pass A - straight cross-provider read (route + verify): "is this
           audit proposal sound?"
  Pass B - devil's-advocate framing (route + verify): the 6 biases
           in proposal section 8 + 4 open questions in section 9
           are explicitly called out as the pressure test.

Outputs four files alongside proposal.md (pass_a_primary.md,
pass_a_verify.md, pass_b_primary.md, pass_b_verify.md) and a
cost_summary.json so the running spend is observable.

Per feedback_split_large_verification_bundles the proposal is ~430
lines of markdown - safely under the 700-LOC bundle-split threshold,
so a single-shot route per pass is fine.

Per feedback_ai_router_route_result_handling the RouteResult is
dumped to JSON before any attribute access (lesson learned the
hard way).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

import ai_router  # noqa: E402
PROPOSAL_PATH = HERE / "proposal.md"
SESSION_SET = "047-state-file-schema-v4-audit"
SESSION_NUMBER = 1


def _dump(label: str, obj) -> None:
    """Dump any ai_router result object to JSON for inspection."""
    try:
        as_dict = {
            k: getattr(obj, k)
            for k in dir(obj)
            if not k.startswith("_") and not callable(getattr(obj, k))
        }
        print(f"\n=== {label} (fields) ===")
        for k, v in as_dict.items():
            preview = str(v)[:200]
            print(f"  {k}: {preview}")
    except Exception as exc:  # noqa: BLE001
        print(f"  (dump failed: {exc})")


def _write_response(out_path: Path, label: str, result, verifier=False) -> None:
    """Persist the model's text response to disk for audit-trail purposes."""
    text = (
        getattr(result, "raw_response", None)
        or getattr(result, "content", None)
        or getattr(result, "response", None)
        or getattr(result, "text", None)
        or getattr(result, "output", None)
        or ""
    )
    model = (
        getattr(result, "model_name", None)
        or getattr(result, "verifier_model", None)
        or getattr(result, "model", "unknown")
    )
    provider = (
        getattr(result, "verifier_provider", None)
        or getattr(result, "generator_provider", None)
        or getattr(result, "provider", "unknown")
    )
    cost = (
        getattr(result, "total_cost_usd", None)
        or getattr(result, "verifier_cost_usd", None)
        or getattr(result, "cost_usd", None)
        or getattr(result, "cost", None)
    )
    tokens_in = (
        getattr(result, "input_tokens", None)
        or getattr(result, "verifier_input_tokens", None)
    )
    tokens_out = (
        getattr(result, "output_tokens", None)
        or getattr(result, "verifier_output_tokens", None)
    )
    verdict = getattr(result, "verdict", None)
    header = [
        f"# {label}",
        "",
        f"- **Provider:** {provider}",
        f"- **Model:** {model}",
        f"- **Cost:** {cost}",
        f"- **Tokens (in/out):** {tokens_in}/{tokens_out}",
    ]
    if verifier:
        header.append(f"- **Verdict:** {verdict}")
    header.extend(["", "---", "", str(text)])
    out_path.write_text("\n".join(header), encoding="utf-8")
    print(f"  -> wrote {out_path.name} ({len(str(text))} chars)")


def run_pass(label: str, prompt: str, output_prefix: str) -> dict:
    """Route + verify a single pass; persist both responses; return cost dict."""
    print(f"\n========== {label}: ROUTE ==========")
    route_result = ai_router.route(
        content=prompt,
        task_type="analysis",
        context=(
            "This is a session-set scope-lock audit proposal. The author is "
            "Claude Opus 4.7. The audit needs a cross-provider read before "
            "the spec.md is rewritten to lock scope. Apply the bias-cautions "
            "framework where relevant."
        ),
        session_set=SESSION_SET,
        session_number=SESSION_NUMBER,
    )
    _dump(f"{label} route_result", route_result)
    _write_response(HERE / f"{output_prefix}_primary.md", f"{label} - Primary read", route_result)

    print(f"\n========== {label}: VERIFY ==========")
    verify_result = ai_router.verify(
        route_result=route_result,
        original_task=prompt,
        task_type="analysis",
        session_set=SESSION_SET,
        session_number=SESSION_NUMBER,
    )
    _dump(f"{label} verify_result", verify_result)
    _write_response(
        HERE / f"{output_prefix}_verify.md",
        f"{label} - Cross-provider verification",
        verify_result,
        verifier=True,
    )

    return {
        "label": label,
        "primary_model": getattr(route_result, "model_name", "unknown"),
        "primary_provider": getattr(route_result, "model_id", "unknown"),
        "primary_cost": getattr(route_result, "total_cost_usd", None),
        "verify_model": getattr(verify_result, "verifier_model", "unknown"),
        "verify_provider": getattr(verify_result, "verifier_provider", "unknown"),
        "verify_cost": getattr(verify_result, "verifier_cost_usd", None),
        "verify_verdict": getattr(verify_result, "verdict", None),
    }


def main() -> int:
    proposal_text = PROPOSAL_PATH.read_text(encoding="utf-8")
    print(f"Proposal loaded: {len(proposal_text)} chars, "
          f"{len(proposal_text.splitlines())} lines")

    pass_a_prompt = (
        "# Audit task: cross-provider read of Set 047 scope-lock proposal\n\n"
        "Below is a Pass A audit proposal for Session Set 047 (State-File\n"
        "Schema v4 + Lightweight-Tier Parity). The proposal scope-locks a\n"
        "stub-mode session set whose audit scope was substantially expanded\n"
        "mid-session by an operator directive (see section 2). Please read\n"
        "it as an independent reviewer and report:\n\n"
        "1. **Soundness of the v4 schema dispositions (Group A, sections\n"
        "   4.A1-4.A5).** Are the shape-of-v4, cancellation-marker,\n"
        "   blocked-on-prereqs, migration-sequencing, and migrator-scope\n"
        "   dispositions sound? Flag any that are mis-scoped.\n"
        "2. **Soundness of the Lightweight-parity dispositions (Group B,\n"
        "   sections 5.B1-5.B4).** The operator-locked premises in section\n"
        "   2 are NOT open to challenge - but the consequences the\n"
        "   drafter draws from them ARE. Specifically, weigh whether the\n"
        "   package split (B1 Path 1) is the right architecture, whether\n"
        "   the right-click copyable-prompt surface (B2) is the right\n"
        "   placement, whether the suggested-state enum (B3) is the right\n"
        "   shape, and whether the doc-revision pass (B4) is well-scoped.\n"
        "3. **The critical scope decision (section 6).** Should Set 047\n"
        "   stay one bundled audit-and-implementation arc (Shape 1), or\n"
        "   split into Set 047 (v4 schema) + sibling Set 048 (Lightweight\n"
        "   parity) per the drafter's recommendation (Shape 2)? Is Shape 3\n"
        "   (Lightweight first, v4 second) defensible?\n"
        "4. **Session breakdown (section 7).** Is the 6-session arc for\n"
        "   Set 047 balanced? Is any session over- or under-scoped?\n"
        "5. **Any missing audit topic** the proposal failed to surface.\n"
        "   Pay particular attention to interactions between v4 schema\n"
        "   work and the package split.\n\n"
        "Return a verdict (ENDORSE / ENDORSE WITH REVISIONS / REJECT) at\n"
        "the top of your response, then itemize specific concerns.\n\n"
        "---\n\n"
        + proposal_text
    )

    pass_b_prompt = (
        "# Devil's-advocate audit task: pressure-test the Set 047 scope-lock proposal\n\n"
        "Below is a Pass A audit proposal for Session Set 047. Pass A has\n"
        "already been read by an independent provider. This is Pass B: a\n"
        "**devil's-advocate** pass.\n\n"
        "The proposal author (Claude Opus 4.7) flagged six specific biases\n"
        "in section 8 and four open questions in section 9. Your job is to\n"
        "specifically **invert** each bias-cautioned choice and argue why\n"
        "the inverted choice may be correct. Then opine on whether the\n"
        "proposal's choice or its inversion should win.\n\n"
        "The six biases to pressure-test (verbatim from section 8):\n\n"
        "1. **Bias 1** - Drafter prefers clean architectural splits\n"
        "   (section B1 Path 1, separate `dabbler-session-state` package).\n"
        "2. **Bias 2** - Drafter prefers derive-over-denormalize\n"
        "   (section A1, endorsing the derivation table).\n"
        "3. **Bias 3** - Drafter prefers explicit operator action over\n"
        "   auto-prompts (section B2, right-click context menu for\n"
        "   copyable prompts).\n"
        "4. **Bias 4** - Drafter prefers reader-first migration\n"
        "   (section A4, reader-first then migrator then writer-flip).\n"
        "5. **Bias 5** - Drafter prefers split over bundle (section 6,\n"
        "   Shape 2: 047 v4 schema, 048 Lightweight parity).\n"
        "6. **Bias 6** - Drafter dropped the migrator's recognition of\n"
        "   Lightweight shapes (section A5).\n\n"
        "For each: state the inverted position, give the strongest argument\n"
        "for the inversion, then state whether you'd flip the proposal's\n"
        "choice or stand by it. End with a single bottom-line verdict:\n"
        "ENDORSE PROPOSAL AS-IS / ENDORSE WITH SPECIFIC BIAS FLIPS / REJECT.\n\n"
        "Also opine on the four open questions in section 9.\n\n"
        "---\n\n"
        + proposal_text
    )

    pass_a_summary = run_pass("PASS A", pass_a_prompt, "pass_a")
    pass_b_summary = run_pass("PASS B (devil's-advocate)", pass_b_prompt, "pass_b")

    summary = {
        "session_set": SESSION_SET,
        "session_number": SESSION_NUMBER,
        "passes": [pass_a_summary, pass_b_summary],
    }
    (HERE / "cost_summary.json").write_text(
        json.dumps(summary, indent=2, default=str), encoding="utf-8"
    )
    print("\n========== SUMMARY ==========")
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
