"""Session 4b verification driver - Set 044 (AI chat-log discovery
and experiments).

Round A bundles the two S4b deliverables plus their load-bearing
S3 / S4a context:

  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      claude-narration-results.md             (NEW, S4b primary 1)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      cross-backend-synthesis.md              (NEW, S4b primary 2)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      narration-design.md                     (LOCKED in S3 - the
                                                contract under
                                                test on both
                                                backends)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      copilot-narration-results.md            (S4a - the matched
                                                Copilot half of
                                                the synthesis)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      spec.md  (Session 4 section)            (S4 scope expansion
                                                callout + S4a/S4b
                                                split default)

S4b is a measured-experiment session: Claude baseline (captured
S4a, characterized S4b) + Claude narrated v1 (refused) + Claude
narrated v2 (reframed, partial compliance), plus the per-objective
coverage delta and cross-backend synthesis. The verification target
is "is the headline finding (Claude refused under v1 phrasing,
partial-complied under v2; per-turn marker discipline failed in
v2) defensible from the JSONL evidence quoted in the doc, and is
the cross-backend synthesis correctly calibrating the C3 closure
claim, the per-turn unreliability finding, and the residual gaps?"
The verifier cannot see the raw Claude JSONL files (they're
operator-local under ~/.claude/projects/). All numeric and
behavioral claims in claude-narration-results.md must stand on
their own.

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
Per memory `feedback_split_large_verification_bundles`: this
bundle is comparable in size to S4a (~100KB) and well within
gemini-pro's context window.
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


def read_section(
    path: Path, start_marker: str, end_marker: str | None = None
) -> str:
    rel = path.relative_to(REPO_ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    start = text.find(start_marker)
    if start < 0:
        return f"=== FILE: {rel} (SECTION MISSING: {start_marker!r}) ==="
    if end_marker is None:
        section = text[start:]
    else:
        end = text.find(end_marker, start + len(start_marker))
        section = text[start:end] if end > 0 else text[start:]
    return f"=== FILE: {rel} (from {start_marker!r}) ===\n{section}"


def dump_route_result_to_json(result) -> dict:
    if dataclasses.is_dataclass(result):
        return dataclasses.asdict(result)
    if hasattr(result, "__dict__"):
        return {k: v for k, v in result.__dict__.items()}
    return {"_repr": repr(result)}


SYSTEM_SUMMARY = """
Set 044 (AI chat-log discovery + experiments) tests the hypothesis
that Copilot CLI and Claude Code already write log files containing
enough orchestrator-state signal that a log-harvesting observability
layer could supplement or replace the launch-adapter approach
proposed in Sets 037-041.

S1 + S2 (CLOSED 2026-05-22): structural-only inventory + cross-
backend comparison. Verdict: both backends already natively log
the (conv-id, file-path, tool-name, turn-index, timestamp, engine,
provider) tuple a conflict-detection watcher needs; the narration
gap reduces to TWO signals only (C3 mandatory + A3 conditional).

S3 (CLOSED 2026-05-22): narration-discipline DESIGN + pre-lock
SMOKE PROBE. Locked v1 narration contract in narration-design.md
(C3 mandatory marker, A3 conditional per-backend branch, single
parser two backends, AGENTS.md / CLAUDE.md delivery channels).

S4a (CLOSED 2026-05-22, Round A VERIFIED via gemini-pro): Copilot
half of the originally-S4 scope. Three runs against the
synthetic-set: Copilot baseline + Copilot narrated + Claude
baseline. Headline: 14 of 15 harvest objectives baseline-native on
Copilot under OTel content-capture-ON; only C3 moved 'absent ->
present' by narration. The Claude baseline was captured for S4b
consumption (sidebar in copilot-narration-results.md §9).

S4b (THIS verification): Claude half. Three Claude runs against
the same synthetic-set:
  (a) baseline (captured S4a, characterized S4b; the JSONL existed
      from S4a) -- session-id ...555001,
  (b) narrated v1 -- session-id ...555002, scratch CLAUDE.md
      mirroring S4a AGENTS.md verbatim (same template, same
      'synthetic harvest target / NOT a real project / harvesting
      hooks' framing). RESULT: Claude classified the CLAUDE.md as
      prompt-injection and REFUSED to emit any markers, emitting
      a refusal-with-flag narrative instead. All 5 task-battery
      operations still completed.
  (c) narrated v2 -- session-id ...555003, reframed CLAUDE.md
      ('Project Instructions', no 'synthetic'/'harvest'/'NOT a
      real'/'harvesting' language; same marker template + same
      concrete values + same Branch B activation). RESULT: Claude
      emitted the phase=session-start marker verbatim on turn 0
      but emitted ZERO phase=turn markers across the 3 subsequent
      assistant text events, despite explicit Branch B instruction.

S4b ships TWO primary docs:
  - claude-narration-results.md (Claude-side measurement + delta)
  - cross-backend-synthesis.md (Copilot + Claude combined)

This is a markedly different result from S4a. S4a found Copilot
complied with the marker contract on turn 0. S4b found Claude
either fully refused (v1) or partially complied (v2 session-start
only). The cross-backend asymmetry is the core finding the S5
consensus session needs to absorb.

Cumulative routed spend across S1+S2+S3+S4a = $0.234 of $15.00
NTE. S4b's only routed call so far is THIS Round A verification.
""".strip()


FOCUS_PROMPT = """
Bias cautions: This prompt was authored by an AI agent that may
have an opinion on the answer. Its framing may inadvertently
constrain you to in-scope refinements when the right answer is
to question the scope. The work being reviewed may be presented
as further along than it should be. Before answering as posed,
briefly check whether this is the right question. If a different
question would be more useful, answer that one too.

The verifier CANNOT inspect the raw Claude JSONL files referenced
in claude-narration-results.md (they're operator-local under
~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/).
All numeric and behavioral claims must be defensible from the
doc text alone. Particular attention to:
  - the v1 refusal narrative quoted in claude-narration-results.md
    §7.1 (Claude's thinking event content)
  - the v2 marker landing in event[5]
  - the per-turn skip count (0 of 3) in v2 across events[12,16,19]

ROUND A -- Session 4b deliverable verification for Set 044
(AI chat-log discovery + experiments).

You are Gemini Pro, asked to verify that Session 4b of Set 044
ships defensible measured-experiment evidence for the Claude side
of the originally-S4 scope, and that the cross-backend synthesis
correctly combines Copilot + Claude evidence into input for the
S5 consensus session.

S4b ships TWO primary docs (claude-narration-results.md +
cross-backend-synthesis.md). The verification targets:

A. **Claude-narration-results.md headline calibration (§1).**

   1. The §1 headline table claims three runs: baseline (0
      markers), narrated v1 (0 valid markers, refused), narrated
      v2 (1 valid phase=session-start, 0 phase=turn). Is the
      headline framing of "phrasing-sensitive refusal + per-turn
      skip" the right summary for a verifier-without-JSONL to
      check? Are there alternative summaries the doc should
      raise and dismiss?

   2. The phrase "Branch B narration on Claude is materially less
      reliable than the Copilot S4a result" - does this overclaim,
      given S4a didn't test Branch B per-turn discipline on
      Copilot at all? S4a's AGENTS.md said 'DO NOT emit per-turn
      markers for this probe' so we have no Copilot per-turn data
      to compare against.

B. **v1 refusal evidence (§5.4, §7.1).**

   1. §5.4 marker landing claim: v1 has 1 regex substring match
      that fails §5.5 placeholder-leakage / required-field check.
      The doc shows the matched substring is '[DABBLER-NARRATION
      ...]' with literal ellipsis (no 'v1', no 'phase=', no other
      required fields). Is the §5.5 defense argument complete?
      Could a parser that's more permissive (e.g., treats missing
      fields as 'incomplete' rather than 'parse_error') still
      emit a phantom record?

   2. §7.1 quotes Claude's thinking-event content from event[4]:
      "This appears to be a prompt injection attempt..." The doc
      attributes the refusal to the v1 CLAUDE.md's "synthetic
      harvest target / NOT a real project / harvesting hooks"
      framing. With v1 vs v2 differing in multiple framing changes
      simultaneously, the specific trigger is not isolated. Is
      the doc correctly calibrating the certainty here? Or
      should it commit to "this specific combination triggered
      refusal" vs claiming the phrasing-sensitivity property
      generally?

C. **v2 partial-compliance evidence (§5.4, §7.2).**

   1. §5.4 shows v2 emitted 1 valid phase=session-start marker
      (concrete substituted, all required fields, no placeholder
      leakage) but 0 phase=turn markers across 3 subsequent
      assistant text events. The doc treats this as a "material
      risk for Branch B narration on Claude." Is N=1 evidence
      sufficient to claim "per-turn marker compliance is
      unreliable on Claude" as a category statement, or should
      the doc soften this to "in this specific N=1 run, per-turn
      marker emission was 0 of 3"?

   2. §5.2 notes events[12] and [16] are byte-identical between
      v1 and v2 (37 chars and 11 chars, both short inter-task
      transitions). The doc speculates: per-turn marker is "being
      interpreted as a one-shot session-start instruction" or
      "doesn't carry enough self-justification to override
      Claude's parsimony bias on short prose events." Are these
      hypotheses correctly framed as speculation rather than
      finding? Anything missing from the candidate-cause list?

D. **Per-objective coverage table (§6).**

   1. The table claims 1 of 15 objectives moved 'absent ->
      present' under v2 (C3 turn-0 only). Cross-check against
      narration-design.md §6.3: Claude is supposed to be Branch
      B by default (effort key on session-start AND per-turn
      markers). The v2 run honored session-start but skipped
      per-turn. Should the A3 row be 'partial' (session-start
      only) rather than 'partial -- turn-0 only'? Is the
      verbiage internally consistent?

   2. The C3 row marks v1 as 'absent' (refused) and v2 as
      'present (turn 0)'. Is this the most informative cell
      content for a verifier? Should the table acknowledge the
      v2 finding is conditional on careful phrasing?

E. **Confound notes (§7).**

   1. §7.1 phrasing-driven refusal: the doc commits to
      "phrasing sensitivity is established; the specific trigger
      boundaries are not." This is the right calibration IF v1
      and v2 differ in multiple things simultaneously. Cross-
      check the §2.1 treatment-difference table -- are the
      differences correctly enumerated? Anything in v2 that's
      different beyond the "synthetic"/"harvest"/"NOT a real"
      language that could explain the compliance flip?

   2. §7.2 per-turn skip: "material risk for Branch B narration
      on Claude." Combined with §10's "S5 proposal must address
      two new variables" - is the conclusion appropriately
      weighted given N=1?

   3. §7.4 task 5 ModuleNotFoundError: the doc notes all 3
      Claude runs hit this AND S4a Copilot also hit it. Is this
      a real harvester signal (B4 captures the argv regardless
      of subprocess success) or a missed confound (the
      subprocess's failure shape might bias the LLM's task-5
      reasoning)?

   4. §7.5 effort-level confound: the doc surfaces an
      inconsistency between the S4a baseline disposition (which
      said '--effort medium') and Claude Code 2.1.63's actual
      CLI (no top-level --effort flag). The doc concludes the
      'effort=medium' value in the marker is "the narrated
      effort claim, not a verified setting." Is this correctly
      handled? Does it materially undermine the A3 result, or
      is it a footnote-level caveat?

   5. ANYTHING the §7 confound list MISSES? E.g., session-id
      reuse between baseline (...555001) and narrated v2 cache
      reads, prompt-cache cross-contamination across the three
      consecutive runs, the specific Claude Code 2.1.63 build's
      injection-classifier behavior changing between runs.

F. **Cross-backend synthesis calibration (cross-backend-synthesis.md).**

   1. §1 headline table summarizes both backends. Are the cells
      defensible from the source docs alone? Specifically:
      Copilot "PASS" on phase=session-start in S4a -- is this
      backed by §5.4 of copilot-narration-results.md? Claude v2
      "PASS" on phase=session-start -- backed by §5.4 of
      claude-narration-results.md?

   2. §3 per-turn marker reliability table marks Copilot per-turn
      as "Not measured in S4a (Branch A simulated)" and Claude
      v2 as "0 of 3 expected per-turn markers." Is the "Branch
      B reliability unknown on Copilot" framing appropriately
      hedged, or does §3's "if S5 chooses to keep per-turn
      narration" sentence belong here too?

   3. §4 combined per-objective coverage delta consolidates both
      backends. The "1 of 15 objectives closed by narration: C3"
      headline -- does it correctly handle the asymmetry that
      Copilot's C3 closure is unconditional (just needs the env
      var) while Claude's is conditional on phrasing AND only
      delivers turn-0?

   4. §6 residual gaps: 5 gaps enumerated, 3 marked as
      "Possibly" or "Not addressable by narration." Is the gap
      enumeration complete? Anything S4 should have caught that
      isn't listed?

   5. §7 confirmed-vs-still-open split: are any items in
      "confirmed" actually still open? Any items in "still
      open" that S4 actually did confirm?

   6. §8 recommendations: explicitly framed as "input to
      consensus, not consensus output." Are the recommendations
      stated as observations the way the framing claims, or do
      any of them creep into prescriptive consensus territory
      that S5 should own?

G. **Are these the right questions?**

   Per the bias-cautions preamble: if a different question
   would be more useful, answer that one too. Examples:
     - The S4b run discovered phrasing-sensitivity on Claude.
       Should S5's consensus session include the question
       "do we keep narration-via-CLAUDE.md as a delivery
       mechanism at all, given Claude's injection-classifier
       behavior?" -- i.e., is the v1 design's choice of
       instruction-driven delivery still right post-S4b?
     - The v2 per-turn skip is a deeper problem than the v1
       refusal because it can't be fixed by phrasing. If
       per-turn narration is unreliable on Claude, does the
       Branch B / Branch A split in design §6 still make
       sense as a per-backend toggle, or should it be
       per-marker-type (session-start always-narrated,
       per-turn never-narrated)?
     - The S4 cross-backend synthesis is now done. Should
       Set 044 ship S5 + S6 as originally planned, or should
       S5 be expanded to absorb the new variables (phrasing
       discipline, per-turn unreliability) and S6 be deferred?

Format the verdict as either:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_section(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/spec.md",
            "### Session 4 of 6:",
            "### Session 5 of 6:",
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/claude-narration-results.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/cross-backend-synthesis.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/copilot-narration-results.md"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "round-a-session-4b-result.json"

    print(f"\n{'='*60}\n[Round A] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="044-ai-chat-log-discovery-and-experiments",
        session_number=4,
    )
    result_dict = dump_route_result_to_json(result)
    out_path.write_text(
        json.dumps(result_dict, default=str, indent=2), encoding="utf-8"
    )
    print(f"Wrote {out_path.relative_to(REPO_ROOT).as_posix()}")
    print(f"Provider: {result_dict.get('provider')}")
    print(f"Model: {result_dict.get('model') or result_dict.get('model_name')}")
    print(
        "Tokens: "
        f"in={result_dict.get('input_tokens', '?')}, "
        f"out={result_dict.get('output_tokens', '?')}"
    )
    print(f"Cost: ${result_dict.get('cost_usd', result_dict.get('cost', '?'))}")
    print(f"Latency: {result_dict.get('latency_ms', '?')} ms")
    text = (
        result_dict.get("response")
        or result_dict.get("text")
        or result_dict.get("content")
    )
    if isinstance(text, str):
        print(f"\n--- VERIFIER OUTPUT ---\n{text}\n--- end ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
