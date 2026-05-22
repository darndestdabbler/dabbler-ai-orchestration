"""Session 4a verification driver — Set 044 (AI chat-log discovery
and experiments).

Round A bundles the single S4a deliverable plus the load-bearing
S3 context it sits on:

  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      copilot-narration-results.md            (NEW, S4a)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      narration-design.md                     (LOCKED in S3 — the
                                                contract under
                                                test)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      smoke-probe-results.md                  (S3 — the pre-lock
                                                channel probe)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      spec.md  (Session 4 section)            (S4 scope expansion
                                                callout + S4a/S4b
                                                split default)

S4a is a measured-experiment session: Copilot baseline + Copilot
narrated + Claude baseline live runs against the synthetic-set,
plus the §6 per-objective coverage delta and §8 inherited-question
status updates. The verification target is "is the delta-headline
sound from the captured OTel evidence, is the per-objective
coverage table accurate against the LOCKED v1 contract, and are
the §7 confound notes appropriately calibrated?" The verifier
cannot see the raw OTel JSONL files (they're operator-local
scratch), so the doc's numeric claims must stand on their own.

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
Per memory `feedback_split_large_verification_bundles`: this
bundle is well under the 700-LOC slicing threshold.
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
Smoke probe surfaced architectural revision: Copilot harvester
surface is OTel JSONL `gen_ai.output.messages` with
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true, NOT
session-store.db turns.assistant_response. Live runs deferred to
S4 (operator approval).

S4a (THIS verification): the Copilot half of the originally-S4
scope, split per spec recommendation. S4a executed three matched
live runs against the synthetic-set at c:\\tmp\\dabbler-log-
harvest\\synthetic-set\\:

  (a) re-verified the S3 smoke probe (one trivial Copilot turn),
  (b) Copilot baseline (--no-custom-instructions, OTel content-
      capture ON, --effort medium),
  (c) Copilot narrated (AGENTS.md narration present, otherwise
      identical to (b)),
  (d) Claude baseline (claude -p headless, --effort medium, no
      scratch CLAUDE.md, captured to ~/.claude/projects/<slug>/
      <session-id>.jsonl) — to be consumed by S4b.

The S4a deliverable is `copilot-narration-results.md`. The
narrated/baseline delta on Copilot is the headline measurement;
the Claude baseline is captured as a sidebar (§9) so S4b can run
the matched Claude narrated experiment without redoing baseline.

S4b will own: Claude narrated run, Claude per-objective coverage
delta, cross-backend synthesis. S4a's close hands off to S4b
under the same claude/anthropic orchestrator identity (no
release_checkout — session 4 stays in-flight across the split).

Cumulative routed spend across S1+S2+S3 = $0.174 of $15.00 NTE.
S4a's only routed call so far is THIS Round A verification.
""".strip()


FOCUS_PROMPT = """
Bias cautions: This prompt was authored by an AI agent that may
have an opinion on the answer. Its framing may inadvertently
constrain you to in-scope refinements when the right answer is
to question the scope. The work being reviewed may be presented
as further along than it should be. Before answering as posed,
briefly check whether this is the right question. If a different
question would be more useful, answer that one too.

The verifier CANNOT inspect the raw OTel JSONL files referenced
in §4 of `copilot-narration-results.md` (they're operator-local
scratch in c:/tmp/dabbler-log-harvest/otel/). All numeric claims
in the results doc must be defensible from the doc text alone
(the verifier should flag anything that looks like an
unsupported claim).

---

ROUND A — Session 4a deliverable verification for Set 044
(AI chat-log discovery + experiments).

You are Gemini Pro, asked to verify that Session 4a of Set 044
ships defensible measured-experiment evidence for the Copilot
side of the originally-S4 scope.

S4a ships ONE primary doc (`copilot-narration-results.md`) plus
captured-but-not-yet-analyzed Claude baseline data sidebared in
§9. The verification target is the soundness of the §5
quantitative delta, the accuracy of the §6 per-objective
coverage table against the LOCKED v1 contract, the
appropriateness of the §7 confound notes, and the
calibration of §8's open-question status updates.

Verify:

A. **Run setup completeness (`copilot-narration-results.md` §2-§3).**

   1. §2.1 lists 11 held-constant items between baseline and
      narrated runs and §2.2 names exactly one treatment
      difference. Does the held-constant list cover everything
      design §8.1 requires? Anything design §8.1 enumerates
      that §2.1 doesn't?

   2. §3 task battery uses ONE prompt with 5 sub-tasks (rather
      than 5 separate prompts). Does this design choice
      introduce a confound the §7 notes miss? E.g., does
      bundling 5 tasks into 1 prompt mean the LLM only
      "opens" the session once and the C3 marker only ever
      lands on one chat span, suppressing the test of per-turn
      narration we'd actually need for Branch B verification
      later?

   3. The harvest-objective mapping at the end of §3 claims
      tasks 1-5 exercise B1, B2, B3, B4, B5, C1, C5. Is this
      mapping accurate? Anything claimed to be exercised that
      isn't actually exercised by the prompt as written?

B. **Quantitative delta defensibility (`copilot-narration-results.md` §5).**

   1. §5.1 span structure: 4 chat spans, 7 tool spans, 1
      invoke_agent in BOTH runs. Identical span shape claim. Is
      this conclusion safe from N=1 evidence per condition?
      What's the variance the doc isn't quantifying?

   2. §5.2 tool sequence table shows the apply_patch/powershell
      swap between baseline (positions 5 + 7) and narrated
      (positions 5 + 6). The doc reads this as "consistent with
      normal non-determinism." Is the alternative reading
      ("narration changes the LLM's task-decomposition order")
      adequately ruled out, or should the doc flag this as a
      candidate confound rather than dismissing as noise?

   3. §5.3 token deltas: +1,215 input (+2.0%), −7 output
      (−0.5%), −81 reasoning (−10.8%). The doc explains the
      input delta as "AGENTS.md inlining tax" (~290 tokens *
      4 turns ≈ 1160 + tokenizer overhead = ~1215). Is this
      arithmetic defensible? Does AGENTS.md get re-injected
      EVERY turn, or only on turn 0?

   4. §5.4 marker landing: 1 marker in gen_ai.output.messages
      (turn 0), 4 in gen_ai.system_instructions (turns 0-3 —
      template echo). The doc claims a parser scanning both
      surfaces would "double-count by 5x" — math check: 1 +
      4 = 5; a parser scanning both would emit 5 records vs the
      1 correct record; that's a 5x inflation, not "double" but
      "quintuple." Should the doc rephrase, or is the phrasing
      ambiguous-but-acceptable?

   5. §5.5 native A3 surface: gen_ai.request.reasoning_effort
      is None on every chat span in both runs, at explicit
      `--effort medium`. The doc concludes "the attribute
      appears absent regardless of explicit effort setting, at
      least at the medium level." Is the inference safe? It
      could also be that the attribute appears only when
      effort != default, and medium IS the default — in which
      case medium would BE the case where the attribute is
      omitted. The doc commits to "this still leaves the
      explicit-high case unmeasured" — is the framing correctly
      calibrated?

C. **Per-objective coverage table (`copilot-narration-results.md` §6).**

   1. The table claims 14 of 15 objectives are baseline-native
      and only C3 is moved by narration. Cross-check against
      `baseline-comparison.md` (S2 deliverable, also in
      context): does S2 §2 agree that 14 objectives are native
      under content-capture-ON? If S2 said some objectives are
      "TBD pending live runs," are those TBDs now empirically
      resolved by S4a's measurements?

   2. A3 row reads "Branch A simulated so no marker emit." The
      §6.3 design defaults Copilot A3 to "deferred to per-
      backend config flag." Is the §6 table coherent with the
      §6.3 design default, or does the table assume a Branch A
      activation that contradicts the design's deferral?

   3. C3 row is the headline: "narration closes the gap; this
      is the whole point of v1." Cross-check against §5.4
      marker landing: 1 marker landed in
      gen_ai.output.messages, 4 phantoms in
      gen_ai.system_instructions. With the design §5.4 parser-
      skip rule honored, the C3 claim holds. With the parser-
      skip rule NOT honored, the C3 claim still holds (5 vs 0)
      but with 4 false positives. Should the table cell
      acknowledge the parser-skip dependency?

D. **Confound notes calibration (`copilot-narration-results.md` §7).**

   1. §7.1 prompt-token delta = treatment effect, not confound.
      The framing is correct per design §8.3. ✓

   2. §7.3 turn-0 output-token delta of −118 tokens in narrated
      vs baseline. The doc reads this as "marker + commentary
      displaced some baseline commentary." Is this the
      best-fit reading? Could the cause be "narrated LLM cued
      to be terser by the AGENTS.md preamble" instead?

   3. §7.4 reasoning-token Δ caveat: "−10.8% but N=1 per
      condition, distribution is high-variance (range 0-516)."
      Is the caveat strong enough? Or should the doc commit
      to "this is uninformative" rather than just "flagged as
      a confound"?

   4. ANYTHING the §7 confound list MISSES that would change
      the §10 verdict if surfaced? E.g.: model-version drift
      between runs (gpt-5.4 is stable, but the per-turn
      sampling temperature might vary), Copilot CLI internal
      caching between consecutive runs against the same
      workspace.

E. **Open-question status updates (`copilot-narration-results.md` §8).**

   1. The table tracks 5 questions: Q1 (RESOLVED in S3), Q2
      (RESOLVED in S3), Q3 (Partially answered in S4a — medium
      omits the attribute), Q4 (NOT MEASURED in S4a), Q5 (NEW
      in S4a). Is Q5 a real new question or a restatement of
      Q3? Should Q3 + Q5 be merged?

   2. The doc inherits Q3/Q4 to S5+ "unless a S4b sidebar
      absorbs it." Is delegating to a future session correct,
      or should S4a have explicitly attempted the explicit-
      `--effort high` and `--effort low` runs while the
      orchestrator was warm?

F. **Sidebar accuracy (`copilot-narration-results.md` §9).**

   1. §9 documents the Claude baseline as captured-not-yet-
      analyzed. The JSONL path is operator-local; the §9
      summary claims 17 events with the composition (1 user.
      string, 1 assistant.thinking, 5 assistant.tool_use, 5
      user.tool_result, 1 assistant.text, 2 file-history-
      snapshot, 2 queue-operation). The verifier can't open
      the JSONL — is this composition claim consistent with
      what we'd expect from a 5-task battery driven through
      claude -p with permission-mode bypassPermissions?

   2. §9 commits Claude side as Branch B (narrated reasoning)
      because `--effort medium` is "NOT logged in the JSONL."
      The doc lists usage fields (`input_tokens`, `output_
      tokens`, `cache_creation_input_tokens`, `cache_read_
      input_tokens`, `cache_creation`, `service_tier`,
      `inference_geo`, `speed`, `server_tool_use`,
      `iterations`) and notes no reasoning-axis field. Is this
      sufficient evidence to confirm Claude Branch B (as
      design §6.3 default), or does the verifier want to see
      the explicit-high case here too?

G. **What's risky or missing.**

   1. The S4a runs all used `--effort medium`. The design §8.1
      checklist requires "same explicit effort setting" within
      a baseline/narrated pair, satisfied. But it does NOT
      require testing more than one effort level — so S4a's
      reasoning-token observations are all at one effort,
      which means the §5.5 finding "attribute is omitted at
      medium" carries no Branch A/B implication for high/low.
      Should the S4b plan explicitly include the missing
      effort-axis runs, or should that be its own S5 sidebar?

   2. The synthetic-set workspace was not git-init'd. Copilot's
      AGENTS.md search path is "git root and current working
      directory" — without a git root, only cwd was searched.
      Does this leave a gap (a real production workspace with
      a git root might pick up AGENTS.md from a different
      location than expected)? Should S4b's Claude run also
      avoid git-init for symmetry?

   3. The §5.5 reasoning-token observation per turn: in the
      narrated run, turn 2 had `reasoning.output_tokens=0`.
      Zero reasoning tokens on a chat span feels unusual; does
      it indicate a measurement artifact, or did the LLM
      genuinely produce that turn with no reasoning chain
      (e.g., the turn was a trivial summary)?

   4. AGENTS.md instructs the Copilot LLM to emit the marker
      with `set=001-synthetic-harvest-target session=1
      total=2`. These are synthetic values pinned to the
      synthetic-set's spec. The §5.4 marker emission therefore
      verifies that LLMs CAN emit the marker — but it doesn't
      verify the §7.5 parameterization mechanism (operator-
      side manual editing of AGENTS.md with the active session
      set's slug). Should the S5 proposal call out
      parameterization as a separate risk?

H. **Are these the right questions?**

   Per the bias-cautions preamble: if a different question
   would be more useful, answer that one too. Examples:
     - Should the S5 proposal scope be re-narrowed given that
       14 of 15 objectives are already native? Specifically:
       is the "watcher" piece (real-time conflict detection)
       still needed if the harvester only adds one signal?
     - Should the S4a/S4b split itself be reconsidered? S4a
       ran 3 hours of work and produced 1 doc; was the split
       a productive design choice or an overcorrection from
       the Round A verifier's "bloated" framing?
     - Is the C3 marker delivering on the original conflict-
       detection use case, or did the v1 scope narrowing
       eliminate enough signal that S5 has to ship something
       larger than v1 anyway?

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
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/copilot-narration-results.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/smoke-probe-results.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/baseline-comparison.md"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "round-a-session-4a-result.json"

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
