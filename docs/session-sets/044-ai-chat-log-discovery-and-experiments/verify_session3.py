"""Session 3 verification driver — Set 044 (AI chat-log discovery
and experiments).

Round A bundles the three S3 deliverables (1 new + 1 new + edits)
plus the load-bearing S2 context they sit on:

  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      narration-design.md                       (NEW, S3, LOCKED)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      smoke-probe-results.md                    (NEW, S3)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      spec.md                                   (EDITED, S3 +
                                                 S4 scope notes)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      baseline-comparison.md                    (FROM S2, the
                                                 design's
                                                 constraining
                                                 reference)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      verification-output/consensus-design-result-gpt-5-4-manual.md
                                                (NEW, S3, GPT
                                                 manual paste)

S3 is a DESIGN + PRE-LOCK SMOKE PROBE session. No code shipped.
Per operator decision 2026-05-22 made mid-session, the deferred
live runs + Copilot narrated experiment + cross-backend synthesis
all consolidate into S4. The verification target is therefore
"is the locked narration contract defensible against the
consensus journal + smoke probe findings, and does the spec
update accurately reflect the scope split?" — NOT "do tests
pass" or "does the harvester work end-to-end" (neither shipped).

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
Per memory `feedback_split_large_verification_bundles`: this
bundle is ~95 KB; within gemini-pro headroom.
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
Live runs deferred S1→S2→S3.

S3 (THIS verification): narration-discipline design + pre-lock
smoke probe. Three S3-side deliverables:

  1. narration-design.md — LOCKED 2026-05-22. Specifies the
     `[DABBLER-NARRATION v1 ...]` token format, placement rules
     (session-start mandatory + per-turn conditional; no
     session-end marker, open-interval rule for crashes), content
     discipline (effort restricted to low/medium/high reasoning
     axis only — speed axis is always native; outcome field cut
     from v1 after consensus), parser contract (regex + tolerance
     rules + 6 semantic validation tags including placeholder-
     leakage), A3 conditional branch as a rule (not guess) with
     per-backend config flag, per-backend application
     (AGENTS.md on Copilot; CLAUDE.md on Claude), comparability
     checklist + acknowledged confounds, pre-lock smoke probe
     protocol, and consensus journal documenting all 10 must-fix
     items applied across both gemini-pro and gpt-5-4 verdicts.

  2. smoke-probe-results.md — pre-lock smoke probe executed
     against synthetic-set at c:\\tmp\\dabbler-log-harvest\\
     synthetic-set\\. Findings: marker emission PASSED (verbatim
     concrete-value substitution, first text output, no code
     fence). Persistent surface DID NOT MATCH the pre-probe
     assumption: session-store.db turns.assistant_response
     captures only the LLM's final formatted output, not the
     marker-bearing first emission. Marker IS captured in OTel
     JSONL gen_ai.output.messages — but only with
     OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true.
     Bonus discovery: gen_ai.usage.reasoning.output_tokens is a
     per-turn native signal not documented in S1 — qualifies as
     a Branch A proximate for Copilot A3 pending explicit-effort
     runs.

  3. spec.md edits — S3 marked as "design + smoke probe only";
     S4 absorbed the deferred live runs (Copilot baseline +
     Claude baseline + Copilot narrated + Claude narrated +
     cross-backend synthesis). The deferral pattern is now
     "S1-S3 do design/contract work; S4 does live runs."

Cross-provider consensus (gemini-pro via ai_router; gpt-5-4
via operator's manual ChatGPT paste — router timed out twice):
both verdicts were APPROVED WITH REVISIONS, with 10 total
must-fix items (5 from each verdict, 3 of them convergent).
All 10 applied; design is narrower than the pre-consensus
draft. Audit trail at verification-output/.

Cumulative S3 routed spend: $0.021 (gemini-pro consensus only;
gpt-5-4 was zero-cost via operator's ChatGPT). Set 044
cumulative across S1+S2+S3: $0.137 of $15.00 NTE budget.

The conclusion from S3: a single-parser narration contract works
across both backends with one substantive caveat the smoke probe
caught — on Copilot, the harvester surface must be OTel JSONL
with content capture enabled. This is empirical, not theoretical:
the smoke probe demonstrated marker emission works, but only
the OTel-with-content-capture surface preserves the emission.
""".strip()


FOCUS_PROMPT = """
Bias cautions: This prompt was authored by an AI agent that may
have an opinion on the answer. Its framing may inadvertently
constrain you to in-scope refinements when the right answer is
to question the scope. The work being reviewed may be presented
as further along than it should be. Before answering as posed,
briefly check whether this is the right question. If a different
question would be more useful, answer that one too.

---

ROUND A — Session 3 deliverable verification for Set 044
(AI chat-log discovery + experiments).

You are Gemini Pro, asked to verify that Session 3 of Set 044
ships defensible artifacts for a design + pre-lock smoke probe
session where the spec demands "narration design + Copilot
narration experiment" but the as-shipped scope is design +
smoke probe only (the experiment piece deferred to S4 with
operator approval).

This session ships NO code, NO tests, NO end-to-end live runs.
The verification target is the quality of the locked narration
contract (`narration-design.md`), the empirical findings from
the smoke probe (`smoke-probe-results.md`), and the accuracy of
the spec edits documenting the scope split.

Verify:

A. **Narration contract defensibility (`narration-design.md`).**

   1. §1 scope claim — narration fills exactly TWO native gaps:
      C3 (mandatory) and A3 reasoning-axis (conditional). The
      speed axis (fast|standard) is excluded from narration;
      outcome is excluded; everything natively present on both
      backends is excluded. Is this scope coherent against
      baseline-comparison.md §5's framing? Anything that
      *should* be narrated that v1 excludes?

   2. §2 format token — `[DABBLER-NARRATION v1 key=value ...]`
      with canonical strict emission + lenient parser
      (whitespace around `=`, optional quotes, case-insensitive
      keys). The bracket-sigil-kvp shape was selected over
      free-form, JSON-line, YAML, and HTML/XML alternatives.
      Is the parser regex (§2.3) actually correct for the
      tolerance rules described? Does it handle the edge cases
      it claims to? Is there an obvious LLM emission failure
      mode the regex misses?

   3. §3 placement — session-start marker (1x mandatory),
      phase=turn marker (conditional, per-turn when A3
      narration is active), NO session-end marker (open-
      interval rule for crashed/interrupted runs). The
      pre-consensus draft included a session-end marker; it was
      cut. Is the cut justifiable, or does the open-interval
      rule leave a real signal gap?

   4. §4 content discipline — effort restricted to
      low|medium|high (reasoning axis only); speed axis never
      narrated; outcome cut; placeholder-leakage prohibition
      via parser semantic validation. Is the prohibition strong
      enough to actually catch the substitution-failure case
      that gpt-5-4 flagged?

   5. §5 parser contract — single parser, two backend-specific
      input adapters. §5.5 lists six semantic validation tags
      (`placeholder-leakage`, `unknown-phase`,
      `unknown-effort-enum`, `session-exceeds-total`,
      `non-integer-session`, `non-integer-total`). Is this set
      sufficient, or is there an obvious domain check missing?

   6. §6 A3 conditional branch — Branch A (native A3, narration
      omits) vs Branch B (narrated A3, narration emits).
      Defaults: Claude on Branch B (empirically confirmed
      absent natively); Copilot DEFERRED to per-backend config
      flag pending explicit-effort runs (smoke probe found
      reasoning.output_tokens as a candidate Branch A signal).
      Is the deferral coherent or does it leave the parser
      contract under-specified?

   7. §7 per-backend application — AGENTS.md on Copilot
      (channel resolved from `copilot help environment`);
      scratch CLAUDE.md on Claude. §7.4 compact contingency
      drafted; §7.5 parameterization mechanism committed to
      per-run manual editing for v1. Is the AGENTS.md choice
      sound? Are there other channels (e.g.,
      .github/copilot-instructions.md, COPILOT_CUSTOM_INSTRUCTIONS_DIRS
      env var) that should be tried before AGENTS.md or that
      change the parameterization story?

   8. §8 comparability checklist — held-constant items include
      version, workspace, task battery, content-capture flag,
      harvest method, measurement metric, tool-permission mode,
      explicit effort setting. Acknowledged confounds: prompt-
      token-count, compliance behavior, turn segmentation. Is
      this comprehensive, or are there confounds the checklist
      misses that would invalidate the eventual delta
      measurement?

   9. §9 lock criteria — all four boxes checked: consensus
      complete, channel resolved, smoke probe passes, operator
      approval. The contract is now LOCKED. Is the lock
      premature given the smoke probe surfaced a §5.1 surface
      change AFTER consensus had completed (which means
      consensus didn't have visibility into the empirical
      surface choice)?

   10. §10 smoke probe protocol — updated post-probe to read
       OTel JSONL gen_ai.output.messages (NOT session-store.db
       turns.assistant_response which the pre-probe text said).
       Step 4 explicitly warns about the assistant_response
       false-negative. Is the updated protocol complete enough
       that a future operator could re-run the probe from this
       doc alone?

   11. §13 consensus journal — 10 must-fix items applied
       (gemini-pro 5 + gpt-5-4 5, of which 3 are convergent).
       Is the journal accurate against the verification-output
       artifacts (consensus-design-result-gemini-pro.json +
       consensus-design-result-gpt-5-4-manual.md)?

B. **Smoke probe findings defensibility
   (`smoke-probe-results.md`).**

   1. §1 headline verdict claims PASS for emission /
      ARCHITECTURAL REVISION REQUIRED for surface. Is the
      headline accurate from the §2-§3 evidence? Specifically:
      (a) marker emission is verbatim from the §2.3 stdout
      quote; (b) marker missing from session-store.db is
      empirically confirmed by §3.1; (c) marker present in OTel
      JSONL gen_ai.output.messages is confirmed by §3.2; (d)
      bonus discovery of reasoning.output_tokens is verified by
      §3.4. All defensible.

   2. §3.1 — `assistant_response` is 48 bytes and contains only
      the post-marker text. The hypothesis that Copilot makes
      two LLM round-trips per turn and persists only the last
      one comes from the process-log showing two "Sending
      request to the AI model" events. Is this hypothesis
      sufficiently supported, or is it speculation that should
      be flagged as TBD?

   3. §3.2 — marker found at byte offset 57 in
      gen_ai.output.messages and byte offset 29182 in
      gen_ai.system_instructions. The latter is the AGENTS.md
      template echoed back. The parser must skip
      gen_ai.system_instructions. Is this hazard properly
      addressed in §5.4 of the design?

   4. §3.4 — `reasoning.output_tokens=270` (of 378 total) at
      default effort. The S3 commits this as "candidate Branch
      A signal pending explicit-effort runs." Is the commitment
      well-calibrated? Could 270 tokens be entirely default-
      effort behavior unrelated to any "effort level" setting?

   5. §4 design implications — all five (§5.1, §5.4, §6, §8,
      §10.1) folded back into narration-design.md. Spot-check
      that each implication was actually applied — not just
      noted.

C. **Spec edits accuracy (`spec.md`).**

   1. S3 was edited to add a "shipped only design + smoke probe;
      live runs absorbed into S4" callout. Is the rationale
      ("smoke probe surfaced substantive design implication, so
      running the experiment alongside the design lock would
      have measured against an unstable contract") defensible?

   2. S4 was edited to add a "scope-expanded; absorbs four
      previously-deferred live-run packets" callout. Does S4
      now span a credible scope, or is it bloated to the point
      where it needs to be split into 4a/4b?

D. **Consensus-and-smoke-probe interaction quality.**

   1. Cross-provider consensus completed BEFORE the smoke probe.
      Did the smoke-probe-driven design changes (§5.1, §5.4,
      §6.3) re-open any of the items the consensus settled?
      Specifically: gemini-pro flagged "channel invariance
      claim too strong" — is the post-smoke §5.1 surface change
      consistent with that flag's spirit, or did the smoke
      probe surface something gemini-pro did NOT flag?

   2. gpt-5-4 flagged "make marker-emission reliability a lock
      gate, not a post-lock empirical question." The smoke probe
      arguably FOUND a post-lock surface-architecture issue
      (the gpt-5-4-flagged class of "syntactically valid but
      semantically bogus emission"). Did the smoke probe
      successfully catch the right class of bug, or did it
      reveal that the lock-gate framing itself needs refinement?

E. **What's risky or missing.**

   1. The smoke probe ran ONE Copilot turn (not multiple, not
      with explicit effort levels, not with multiple sessions
      consecutively). Does the §1 PASS headline overstate the
      evidence? Should the design be locked-pending-additional-
      smoke-runs?

   2. AGENTS.md was placed at the synthetic-set workspace root
      with no enclosing git repo (synthetic-set is outside any
      repo). Copilot's documented search path is "git root and
      current working directory" — without a git root,
      AGENTS.md was picked up from cwd. Does the live-run
      scenario (S4) require git-init'ing the synthetic-set, or
      is cwd-pickup sufficient?

   3. The narration design assumes the harvester reads OTel
      JSONL produced by Copilot at the time the turn runs. In
      production, Copilot's OTel exporter is opt-in; consumers
      would need to flip the env vars per-shell. Is this
      operational requirement called out anywhere, or is the
      design implicitly assuming "harvester operator turns OTel
      on for all Copilot sessions"?

   4. Anything in the contract that's locked too tight to
      v1-specific Copilot behavior and should have been left
      flexible? E.g., the §5.1 "Copilot makes two LLM round-
      trips per turn" hypothesis — if Copilot changes its turn
      protocol in 1.1.x, does the design break?

F. **Are these the right questions?**

   Per the bias-cautions preamble: if a different question
   would be more useful, answer that one too. Examples:
     - Should the design contract be deferred to S4 (after the
       live runs) rather than locked here? gpt-5-4's lock-first
       advice was strong; but the smoke probe found a real
       surface issue that consensus hadn't flagged. Was the
       lock-first sequencing correct, or should the empirical
       phase precede the lock?
     - Should the Set 044 proposal in S5 be rescoped given
       what S3 already established about the redaction-cost
       increase for the Copilot harvester?
     - Is there a 12th must-fix that neither consensus
       provider nor the smoke probe caught that the eventual
       harvester implementation will discover?

Format the verdict as either:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_section(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/spec.md",
            "### Session 3 of 6:",
            "### Session 5 of 6:",
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
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/verification-output/consensus-design-result-gpt-5-4-manual.md"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "round-a-session-3-result.json"

    print(f"\n{'='*60}\n[Round A] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="044-ai-chat-log-discovery-and-experiments",
        session_number=3,
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
