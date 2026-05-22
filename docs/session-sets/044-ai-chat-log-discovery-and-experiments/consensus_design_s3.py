"""Session 3 design-consensus driver — Set 044 (AI chat-log discovery).

Routes the narration-design.md draft through cross-provider consensus
before locking. Per spec.md:165 ("This is a candidate site for piloting
the bias-cautions preamble") and operator approval 2026-05-22.

Two providers (Tier-2 cost envelope; Opus 4.6 max-effort is reserved
for S5 per spec.md:237):

  - gemini-pro (Google)
  - gpt-5-4 (OpenAI)

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.

The bias-cautions preamble (canonical text per
docs/ai-led-session-workflow.md:2044-2050) is prepended to every
consensus prompt.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

import ai_router  # noqa: E402  type: ignore


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SET_DIR = Path(__file__).resolve().parent


def read_file(path: Path) -> str:
    rel = path.relative_to(REPO_ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    return f"=== FILE: {rel} ===\n{text}"


def dump_route_result_to_json(result) -> dict:
    if dataclasses.is_dataclass(result):
        return dataclasses.asdict(result)
    if hasattr(result, "__dict__"):
        return {k: v for k, v in result.__dict__.items()}
    return {"_repr": repr(result)}


BIAS_CAUTIONS_PREAMBLE = """
Bias cautions: This prompt was authored by an AI agent that may have
an opinion on the answer. Its framing may inadvertently constrain you
to in-scope refinements when the right answer is to question the
scope. The work being reviewed may be presented as further along than
it should be. Before answering as posed, briefly check whether this
is the right question. If a different question would be more useful,
answer that one too.
""".strip()


SYSTEM_SUMMARY = """
Set 044 (AI chat-log discovery + experiments) tests the hypothesis
that Copilot CLI and Claude Code already write log files containing
enough orchestrator-state signal that a log-harvesting observability
layer could supplement or replace the launch-adapter approach
proposed in Sets 037-041.

Sessions 1 and 2 (CLOSED 2026-05-22): structural-only inventory and
cross-backend comparison. Verdict: both backends already natively log
the (conv-id, file-path, tool-name, turn-index, timestamp, engine,
provider) tuple a conflict-detection watcher needs. The narration
design problem reduces to filling exactly TWO native gaps:

  C3 — Dabbler set/session boundary marker (mandatory; neither
       backend models session sets natively)
  A3 — Per-turn reasoning effort level (conditional; native on
       Claude only for fast/standard axis; high/medium/low absent
       on both backends pending Copilot OTel empirical resolution)

Session 3 (current) designs the narration discipline. This document
(narration-design.md) is the draft being routed through consensus.
The deferred live runs from S1 + S2 will follow AFTER lock, per the
"Option 2 with refinement" sequencing call (lock contract first; do
baselines second; do narrated reruns third; A3 is a predeclared
conditional branch, not a guessed empirical fact).

The narration design must produce ONE parser function that works
identically across both backends. Format choices, placement choices,
content-discipline choices, and the A3 conditional-branch RULE are
all in the draft.

Once locked, this document is the contract that S3 (Copilot
narrated reruns) and S4 (Claude narrated reruns) measure against.
Changes after lock force a marker version bump (v1 → v2) and
re-running both baselines — explicitly NOT a low-cost change. Get
the lock right.
""".strip()


FOCUS_PROMPT = f"""{BIAS_CAUTIONS_PREAMBLE}

---

You are reviewing the draft narration-design.md for Session 3 of
Set 044. Your job is to find substantive issues with the design
BEFORE it is locked.

The review target is not "does this look reasonable" — it's
"would this design survive contact with the live runs in S3 + S4,
and is it minimal-yet-sufficient for the C3 + A3 gap it claims to
fill?".

Verify or contest each of the following load-bearing decisions in
the draft:

**1. The marker format.**

  Format: `[DABBLER-NARRATION v1 key=value key=value ...]`

  Is this the right shape? Alternatives explicitly rejected in §2:
  free-form English, JSON line, YAML/TOML stanza, HTML/XML tag.
  The rationale: regex-parseable, LLM-stable when copied verbatim
  from instructions. Are there failure modes the draft misses?
  E.g., what if the LLM renders the marker in a code fence and the
  rendering pipeline strips brackets? What if the LLM substitutes
  curly-quotes? What if the marker lands in a tool-call argument
  rather than the conversation text? Identify the highest-impact
  marker-survival risk the draft has not addressed.

**2. The placement scheme (§3).**

  Three emit sites: `session-start` (1x mandatory), `session-end`
  (1x mandatory), `phase=turn` (conditional, per-turn when A3
  narration is active). Pre/post-tool-call placement is
  intentionally not part of the contract. The rationale: tool-call
  ordering is reconstructable from native data (C5 native on both
  backends), so the marker doesn't need to encode it.

  Is the placement minimum (start + end) actually sufficient for
  C3? Or does the boundary between "Set 044 Session 2 ending" and
  "Set 044 Session 3 starting" need an explicit cross-session
  link beyond the two markers?

  Conversely, is per-turn-when-A3-active too aggressive — would
  per-tool-call narration suffice (only narrating effort when
  actually invoking a tool, not on pure-text turns)?

**3. The A3 conditional branch as a rule, not a guess (§6).**

  The draft locks A3 as a predeclared branch: Branch A (native A3,
  narration omits effort) vs. Branch B (narrated A3, narration
  emits effort). Per-backend `a3_source` flag selects the active
  branch.

  The hybrid case (Claude has native fast/standard but absent
  high/medium/low) is supported via vocabulary overload — `effort`
  values `low|medium|high` come from narration; `fast|standard`
  come from native.

  Critique this design. Is the overload sound, or does it create
  ambiguity? What happens if narration emits `effort=fast` (which
  the parser would route to the native fast/standard axis but
  the narration says it's from the assistant's self-report)?
  Is the precedence rule clear?

**4. Content discipline (§4) — fields explicitly excluded.**

  Engine, provider, model, conversation id, file paths, tool
  names, and timestamps are NOT in the marker. The reasoning:
  native data already carries them, including them in the marker
  duplicates signal and introduces self-report-vs-native drift
  risk.

  Is this exclusion list correct, or is there a field that
  SHOULD be in the marker because the cross-backend native join
  on it is unreliable? E.g., is the "this is the same conversation
  the marker refers to" join trivial via native conv-id, or does
  it need a marker-emitted disambiguation key for some edge case
  the draft missed?

**5. Single-parser-two-backends claim (§5).**

  The design goal is that ONE parser function handles both
  backends. Is this claim genuinely achievable given the marker
  contract as drafted, or does it leak backend-specific behavior?
  Specifically, the `turn_context` construction is acknowledged
  as backend-specific (Copilot pulls from session-store.db;
  Claude pulls from JSONL). Is "one parser, two context builders"
  actually a single parser, or is the design hiding the seam?

**6. The §7 application channel for Copilot.**

  The draft acknowledges TBDs in §7.1: the Copilot 1.0.51 system-
  prompt / custom-instructions surface is unconfirmed. Candidates
  named: config.json, workspace-scoped copilot.md, or
  COPILOT_SYSTEM_PROMPT env var. The draft claims the contract
  is invariant of which channel S3 resolves.

  Is that claim true? Could the chosen channel constrain marker
  emission in a way that re-opens the design? E.g., if the only
  available surface is a system message that doesn't allow
  multi-paragraph instructions, the §7 instruction text would
  need to be shortened — does shortening force redesign of the
  marker?

**7. Scope creep beyond C3 + A3.**

  The draft restricts narration to two signals per
  baseline-comparison.md §5. Are there signals the design has
  *implicitly* added narration for? E.g., does the `outcome=`
  field on session-end markers ("complete" | "stopped" |
  "cancelled") count as a third narrated signal? Is that
  necessary, or is it scope creep that should be cut?

**8. Comparability checklist (§8).**

  The "only one variable changes between baseline and narrated"
  rule lists 5 hold-constant items. Is the list complete? Is
  there a hidden variable change that the checklist doesn't
  catch? E.g., adding narration instructions to a system prompt
  *also* costs tokens — does the resulting prompt-size delta
  affect measurement?

**9. Are these the right two questions to be asking?**

  Per the bias-cautions preamble: if a different question would
  be more useful, answer that one too. Examples:
    - Should narration design be skipped entirely and the
      harvester ship with C3+A3 missing (deferred to a future
      set when native A3 lands upstream)?
    - Should narration target a third signal not in the draft?
    - Should the design defer to Set 045's harvester
      implementation rather than locking now?

Format your verdict as either:
  - APPROVED for LOCK: <bulleted summary of why; optional nice-to-haves>
  - APPROVED with REVISIONS: <numbered must-fix list before lock>
  - REJECTED: <reframe the question or scope; explain why>

If there are nice-to-have suggestions that don't block lock,
list them separately and label them NICE-TO-HAVE.
""".strip()


def main() -> int:
    bundle_parts = [
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)

    models = ["gemini-pro", "gpt-5-4"]
    for model in models:
        out_path = out_dir / f"consensus-design-result-{model}.json"
        print(f"\n{'='*60}\n[Consensus] sending to {model}...\n{'='*60}")
        try:
            result = ai_router.query(
                model=model,
                content=FOCUS_PROMPT,
                task_type="architecture",
                context=f"{SYSTEM_SUMMARY}\n\n--- DRAFT START ---\n{bundle}\n--- DRAFT END ---",
                session_set="044-ai-chat-log-discovery-and-experiments",
                session_number=3,
            )
        except Exception as e:
            print(f"[Consensus] {model} call FAILED: {type(e).__name__}: {e}")
            out_path.write_text(
                json.dumps(
                    {"error": f"{type(e).__name__}: {e}", "model": model},
                    default=str,
                    indent=2,
                ),
                encoding="utf-8",
            )
            continue

        result_dict = dump_route_result_to_json(result)
        out_path.write_text(
            json.dumps(result_dict, default=str, indent=2), encoding="utf-8"
        )
        print(f"Wrote {out_path.relative_to(REPO_ROOT).as_posix()}")
        print(f"Provider: {result_dict.get('provider')}")
        print(
            f"Model: {result_dict.get('model') or result_dict.get('model_name')}"
        )
        print(
            "Tokens: "
            f"in={result_dict.get('input_tokens', '?')}, "
            f"out={result_dict.get('output_tokens', '?')}"
        )
        print(
            f"Cost: ${result_dict.get('cost_usd', result_dict.get('cost', '?'))}"
        )
        print(f"Latency: {result_dict.get('latency_ms', '?')} ms")
        text = (
            result_dict.get("response")
            or result_dict.get("text")
            or result_dict.get("content")
        )
        if isinstance(text, str):
            print(f"\n--- {model} OUTPUT ---\n{text}\n--- end ---")

    return 0


if __name__ == "__main__":
    sys.exit(main())
