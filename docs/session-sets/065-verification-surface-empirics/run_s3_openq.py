"""Set 065 S3 — route the open design question (spec step 4) for independent
cross-provider input before the orchestrator self-opines. Saves raw output to
disk first (L-064-3) then prints a short confirmation."""
import os
from pathlib import Path
from ai_router import route

OUT = Path(__file__).parent / "s3-openq-analysis.md"

PROMPT = r"""You are advising on a workflow-design question for an AI-led
software-development framework ("Dabbler AI Orchestration"). Answer ONLY the
question below, concisely and decisively, as an independent analyst. Do not
restate the framing back to me at length.

BACKGROUND (established by empirical work; treat as given):
- A retrospective bake-off (n=5) found that a "path-aware" adversarial critique
  (a verifier given a tool loop — read_file/grep/list/run_test — that PULLS
  ground truth from the repo itself) catches a class of real, high-severity
  defects that a "routed" snippet-fed verifier (context PUSHED to it by the
  author) misses. ~92% of those unique catches are "probeable": a cheap,
  pre-committed DETERMINISTIC falsifier (count assert, dup-key assert,
  parser/round-trip test) would have caught them in retrospect. ~8% are
  "novel-reasoning" (no pre-authored probe would anticipate them).
- One candidate design is a CONTRACT-TEST / CDC gate (consumer-driven-contract
  style): (1) the orchestrator defines a contract/API (or, for non-coding work,
  the deliverable's falsifiable claims); (2) an INDEPENDENT engine writes
  critical tests/falsifiers against that contract; (3) the orchestrator
  implements and may add its own tests but CANNOT modify the independent ones;
  (4) close-out gate = the independent tests pass.
- A second candidate is TDD-as-PRE-REGISTERED-FALSIFIERS: stating, before "done",
  the executable observations that would prove the claims wrong (Popperian
  pre-registration, not xUnit-for-its-own-sake).
- Known failure modes already catalogued: Hole 1 = bias moves UP to contract
  DESIGN, which the orchestrator authors (independent tests then validate
  conformance to a possibly-wrong contract -> green-but-wrong; a MISSING-
  capability bug is an absence in the contract, uncatchable by any contract
  test). Hole 3 = Goodhart: if the orchestrator can SEE the frozen tests it
  teaches to them.
- Governing constraint: a complexity/quality rubric — prefer machinery that is
  deterministic + OUT-OF-BAND (off the working agent's token/time critical path)
  + gated by blast-radius + net-neutral-or-negative. Reject in-band + universal
  + additive-only.

THE OPEN QUESTION (answer this):
Can a SINGLE agent both (a) author the contract / pre-registered falsifiers AND
(b) implement against them, and STILL obtain the genuine pre-commitment
(bias-reduction) benefit? Or does Hole 1 (contract-design bias) force the
contract/falsifier author to be a DIFFERENT engine than the implementer?

Address explicitly:
1. Is same-agent-authors-and-implements ever sufficient, and under exactly what
   conditions (e.g. strict temporal ordering / immutability of the falsifiers
   once written, spec-time authoring before any implementation, blast-radius)?
2. When does it FAIL and independence become mandatory? Tie this to the
   probeable-vs-novel split and to cross-artifact / high-blast-radius work.
3. Give a concrete, rubric-respecting RECOMMENDATION the framework can adopt as
   a rule (when same-agent is allowed, when a different engine is required, and
   how the independent author should be sourced cheaply — e.g. the cheap routed
   pass vs the path-aware critic).
Keep it under ~600 words. End with a one-line BOTTOM LINE.
"""

r = route(PROMPT, task_type="analysis", complexity_hint=70,
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 S3 — Open-question analysis (routed)\n\n"
    f"> Routed via route(task_type='analysis'). Model: {r.model_name} "
    f"({r.model_id}). Cost: ${r.cost_usd:.4f}\n\n"
    f"---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
