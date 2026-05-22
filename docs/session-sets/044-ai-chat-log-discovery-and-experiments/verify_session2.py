"""Session 2 verification driver — Set 044 (AI chat-log discovery
and experiments).

Round A bundles the three S2 deliverables (one new + one new + one
refined) plus the S1 Copilot side it's compared against:

  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      discovery-notes-claude.md                 (NEW, S2)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      baseline-comparison.md                    (NEW, S2)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      harvest-objectives-and-redaction.md       (REFINED in S2:
                                                 cross-backend
                                                 copy-exclusion table
                                                 + scrub rules 8/9/10)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      discovery-notes-copilot.md                (FROM S1, context for
                                                 the side-by-side
                                                 comparison claims)
  - Spec excerpt covering S2 only.

S2 is an INVESTIGATION session, like S1. Per operator scope decision
2026-05-22 made mid-session, S2 also did NOT run live harvest
turns — the live runs are deferred to S3 alongside the narration
design. The verification target is therefore "are the structural
claims about Claude Code's log surface accurate from the cited
evidence, is the per-objective coverage matrix and side-by-side
comparison defensible, and does the redaction-policy refinement
correctly cover Claude-specific risks that S1 didn't have to
consider?" — NOT "do tests pass" or "is code correct" (no code
shipped).

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
Per memory `feedback_split_large_verification_bundles`: this bundle
totals ~95 KB across 5 parts — within gemini-pro headroom; no need
to split.
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

Session 1 (CLOSED 2026-05-22): structural-only inventory of Copilot
CLI 1.0.51 ~/.copilot/. Verdict: 13 of 15 objectives surfaced
natively (9 unambiguous Yes + 2 Implicit + 1 Probably yes + 1
derivative); only A3 (effort) + C3 (set/session marker) unambiguously
need narration.

Session 2 (THIS verification): Claude Code log harvest + cross-
backend comparative analysis. Per the same operator scope decision
that turned S1 structural-only, S2 also did NOT run live harvest
turns — the deferred Copilot live-runs from S1 §6 plus a new Claude
harness are folded forward into S3 alongside narration design.
S2 deliverables:

  1. discovery-notes-claude.md — structural inventory of
     ~/.claude/ on the operator's real instance (~/.claude/ is
     NOT empty like ~/.copilot/ was; the operator has 121
     transcript artifacts for this repo alone). Reading-side
     discipline (Part 2 §"Reading-side discipline") was applied
     strictly: distinct-key-set enumeration, byte counts, enum-
     cardinality probes only — no transcript content was read
     into the conversation or quoted in the discovery file.
     16 artifact rows in the §1 inventory; 7 distinct JSONL
     `type` values and 9 distinct `toolUseResult` shapes
     characterized in §2; the Dabbler SessionStart hook
     integration characterized from the in-repo
     `installOrchestratorHookClaudeCode.ts` shim source in §3.
  2. baseline-comparison.md — side-by-side per-objective table
     (15 rows). Headline verdict: BOTH backends already surface
     the (conv-id, file-path, tool-name, turn-index, timestamp,
     engine, provider) tuple a conflict watcher needs. 9 of 15
     rows are symmetric; 6 are divergent and all in Claude's
     favor (A2, A5, B1, B4, B5, C5 — Claude is per-turn / inline
     where Copilot is per-session / opt-in). The narration gap
     is symmetric: A3 + C3 only.
  3. harvest-objectives-and-redaction.md refinement —
     cross-backend copy-exclusion table added under Part 2
     (Claude/Copilot IDE locks, Claude credentials, Claude
     file-history blob store), and three new scrub rules
     (8 = `file-history/` blob store, 9 = `plans/` filename
     leakage, 10 = `last-prompt` JSONL events) tagged
     "Added 2026-05-22 in Set 044 S2".

Subordinate findings worth checking:

  - Both backends use IDE-bridge lockfiles with plaintext bearer
    tokens (~/.claude/ide/*.lock authToken vs ~/.copilot/ide/*.lock
    headers.Authorization). Symmetric critical-redaction concern.
  - Claude's `~/.claude/file-history/<conv-uuid>/<hash>@v<N>`
    content-addressed pre-edit blob store has no Copilot
    equivalent. Big asymmetric redaction surface — biases the
    S5 proposal toward read-in-place + project-to-summary over
    copy-then-process.
  - Claude Code's per-turn JSONL inlines tool args and
    toolUseResult contents BY DEFAULT — there is no
    content-capture flag like Copilot's OTel
    OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT.
    Implication: Copilot-first POC keeps redaction surface area
    smaller.
  - Operator's ~/.claude/settings.json has no `hooks` block; the
    project-level .claude/settings.json on this repo also has
    no `hooks` block. The Dabbler SessionStart hook is opt-in
    and not currently installed for this repo. The
    `python -m ai_router.start_session` call that opened S2
    came from the orchestrator's explicit shell invocation, not
    a hook firing.

The conclusion drawn in baseline-comparison.md §1: "the harvest
hypothesis is on solid ground for both backends, and the design
problem reduces to designing narration for two signals (A3 + C3)
rather than for 5+ signals plus opt-in plumbing for every other
signal." This conclusion is the load-bearing claim for the S5
proposal — verify it does not over-reach beyond the structural
evidence.
""".strip()


FOCUS_PROMPT = """
ROUND A — Session 2 investigation faithfulness for Set 044
(AI chat-log discovery + experiments).

You are Gemini Pro, asked to verify that Session 2 of Set 044 ships
defensible artifacts for an investigation-heavy session where the
spec demands "Claude Code log surface characterized, baseline
comparison written, redaction policy refined if Claude-specific
risks appear" — all without live runs (deferred to S3 per the
same scope-decision pattern S1 set).

This session ships NO code, NO tests. The verification target is
the quality of the claims in the three S2 documents
(`discovery-notes-claude.md`, `baseline-comparison.md`,
`harvest-objectives-and-redaction.md` refinements) and their
consistency with the S1 Copilot baseline they're compared against.

Verify:

A. **Claude Code log-surface inventory accuracy
   (discovery-notes-claude.md §1 + §2).**

   1. The §1 table has 16 artifact rows. Each row is populated
      with the 8 columns Part 3 of harvest-objectives-and-
      redaction.md prescribes (Artifact, Format, Trigger, Per-
      process?, Schema, Surfaces signals, Redaction risk, Sample
      size). Confirm one-to-one alignment and that no rows are
      missing a column.
   2. The §2 JSONL schema captures 7 distinct `type` values
      (assistant, user-prompt, user-tool-result-bearing,
      ai-title, last-prompt, file-history-snapshot, attachment,
      queue-operation — the user variants are tabulated together
      → 7 distinct values + the user split). The structural
      claim: each event's top-level key-set is enumerated from
      a 713-line sample. Is this the right way to characterize
      a Claude Code JSONL? Are any events expected by Claude
      Code's documented schema that the sample missed?
   3. The §2 `toolUseResult` shape enumeration (9 distinct
      shapes mapped to tools: Edit/Write/Bash/Bash-older/Grep/
      LS/AskUserQuestion/TodoWrite/Read). The shape→tool
      inference is by-key-set heuristic. Is the inference sound?
      Any wrong tool mapping?
   4. The §3 hook-integration characterization is from
      installOrchestratorHookClaudeCode.ts and
      claude-session-start-invoker.js — the shim source files
      shipped in this repo. The discovery doc claims:
        (a) the hook is opt-in (Get Started wizard installs it)
        (b) the operator's instance has NO hooks installed for
            this repo, so the S2 start_session call did NOT
            come from a hook firing
        (c) the hook itself adds no JSONL signal of its own;
            the invoker logs to stderr and exits 0
      Verify all three claims from the shim source.

B. **Per-objective coverage matrix accuracy
   (discovery-notes-claude.md §4, 15 rows).**

   For each of A1-A5, B1-B5, C1-C5, scrutinize:

   1. A2 ("Yes, per-turn — assistant.message.model on every
      assistant event"). The schema dump shows model literally
      as "claude-opus-4-7" — defensible.
   2. A3 ("Partial — process-default in settings.json
      effortLevel, per-turn TBD"). settings.json was inspected
      and has effortLevel. Per-turn TBD is the right verdict
      pending S3 live run.
   3. A5 ("Yes, every event"). sessionId is in the top-level
      key-set of every event-type — defensible.
   4. B1 ("Yes inline by default — tool_use carries name +
      input"). The tool_use key-set is (caller, id, input,
      name, type). `input` carries args; for Edit/Write it
      includes full file content. Defensible.
   5. B4 ("Yes — Bash tool_use with input.command matching
      ai_router.start_session"). Observable in S2's own
      transcript (this session). Defensible.
   6. B5 ("Yes — toolUseResult Edit-shape carries filePath +
      oldString + newString + structuredPatch"). The shape is
      tabulated in §2. Defensible.
   7. C3 ("No, narration required"). Same disposition as
      Copilot. Defensible.
   8. C5 ("Yes — explicit linked events with
      sourceToolAssistantUUID back-pointer"). Defensible from
      the §2 user-variant key-set.

   The coverage-summary sentence claims 14 of 15 surfaced
   natively (11 unambiguous Yes + 2 Implicit + 1 Partial + 1
   gap). Count the row verdicts and verify the arithmetic.

C. **Cross-backend comparison defensibility
   (baseline-comparison.md §1-§4).**

   1. The §2 side-by-side table has 15 rows mapping S1's
      Copilot verdict against S2's Claude verdict. The
      symmetry tally claims 9 symmetric, 6 divergent (with
      Claude stronger). Spot-check the 6 divergent claims
      (A2, A5, B1, B4, B5, C5 — all in Claude's favor):
        - A2: Claude per-turn `message.model` vs Copilot OTel-
          opt-in `gen_ai.request.model`. Defensible.
        - A5: Claude per-event `sessionId` vs Copilot
          `sessions.id` row. Defensible.
        - B1: Claude inline-by-default `tool_use.input` vs
          Copilot OTel-opt-in args via
          OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT.
          Defensible.
        - B4: Claude confirmed (S2 own transcript) vs Copilot
          "Probably yes — TBD in live run". Defensible.
        - B5: Claude full diff inline (`oldString` +
          `newString` + `structuredPatch`) vs Copilot
          tool_name + filepath only. Defensible.
        - C5: Claude explicit linked-event via
          `sourceToolAssistantUUID` vs Copilot OTel span
          parent-child reconstruction. Defensible.
      Are any of these overstatements? Is "all divergences
      favor Claude" the actual evidence, or are there
      Copilot-favor divergences hiding?

   2. The §3 "Invariants" section claims 4 invariants:
        - Always-on per-turn structured log surface
        - IDE-bridge lockfiles with plaintext auth tokens
        - OAuth credential storage at well-known paths
        - C3 narration-required
      Each is defensible from S1+S2's evidence — confirm.

   3. The §3 "Divergences" section enumerates 5 (inline-by-
      default vs opt-in; explicit event link vs span hierarchy;
      rollback artifact heaviness — Claude file-history/ vs no
      Copilot equivalent; hook integration shape — Claude has
      SessionStart hook surface, Copilot does not; telemetry
      shape — Claude has separate telemetry surface). Are
      these the right 5? Anything missing? E.g., the FTS5
      search_index in Copilot's session-store.db has no Claude
      equivalent — is that worth calling out, or noise?

   4. The §4 testable-vs-not split has 4 testable-today claims
      and 2 needs-narration claims. Confirm each "testable
      today" claim actually IS testable from native logs only,
      and confirm each "needs narration" claim is genuinely
      not-testable.

   5. The §5 "narration design implications" reduces S3's
      design scope to TWO signals (C3 mandatory; A3 conditional).
      Is this scope-reduction load-bearing for the rest of the
      set? Anything that should also be in S3's narration scope
      that this section dismisses?

D. **Redaction-policy additions (harvest-objectives-and-
   redaction.md, Part 2 refinements).**

   1. Three new scrub rules (8, 9, 10) target Claude-specific
      surfaces:
        - 8: file-history/ blob store as copy-exclusion zone
        - 9: plans/ filename slug-leak (filenames embed prompt
          paraphrases)
        - 10: last-prompt JSONL event-type filtering
      Confirm each addresses a Claude-side surface that has no
      Copilot equivalent (or has stronger surface-level risk
      than its Copilot analogue).
   2. The cross-backend copy-exclusion table lists 4 paths:
        - ~/.copilot/ide/*.lock
        - ~/.claude/ide/*.lock
        - ~/.claude/.credentials.json
        - ~/.claude/file-history/
      Confirm: (a) each path is real and contains what claimed,
      (b) nothing else is missing from the list. In particular:
      what about Copilot's OAuth credentials? Where does the
      Copilot CLI store its bearer/refresh tokens?
   3. The S2-refinement language explicitly says "Refinement
      window: closed after Session 2. Past that, new harvest
      objectives require an explicit spec addendum." This is
      a tightening from S1's "Refinement window: Session 2".
      Defensible? Or does S3's narration design conceivably
      need to refine the redaction policy further (e.g., the
      narration-emitted JSON-line marker creates a new
      log-surface that has its own redaction needs)?

E. **Reading-side-discipline self-compliance (across all three
   files).**

   The S1 close-out asserted that no transcript content was
   read into the conversation or quoted verbatim. The same
   claim is restated in S2's discovery-notes-claude.md preface.
   Spot-check whether the S2 docs actually keep that discipline:
     - No verbatim prompt strings copied?
     - No verbatim assistant text copied?
     - No verbatim tool-call args (file contents in Edit
       `oldString`) copied?
     - No verbatim tool-call results (Bash stdout) copied?
     - Path names that ARE quoted (e.g., the synthetic-set path
       `C:\\tmp\\dabbler-log-harvest\\`) — are these
       operator-content or path-shape? The redaction rule 5
       says `denmi` username should not appear in any
       committed text — confirm.

F. **What's risky or missing.**

   1. Does the S2 "no live runs" stance over-defer? S1's stance
      was justified by "we haven't locked the harvest policy
      yet." S2's stance is justified by "structural is enough
      for the comparative finding, and S3 needs a baseline
      anyway." Is the second justification stronger or weaker
      than the first? Could there be an empirical question that
      only an isolated synthetic-set live run can answer cheaply
      that gets harder if punted to S3 alongside the narration
      design?
   2. The bottom-line claim in baseline-comparison.md §1:
      "design problem reduces to designing narration for two
      signals." Is this overstated? E.g., does narration also
      need to address signals that are inline-by-default on
      Claude but opt-in on Copilot — i.e., does asymmetric
      *availability* (rather than absolute presence/absence)
      itself require narration to harmonize?
   3. The "all 6 divergences favor Claude" claim is striking.
      Is it accurate or biased by the fact that S2 had access
      to Claude's full empirical state (operator's real instance,
      121 transcripts) while S1 was working from an empty
      Copilot instance + docs? Could the asymmetry partly be a
      methodology artifact rather than a true backend
      asymmetry?
   4. Anything in the §4 coverage verdict that relies on
      schema/docs rather than empirical observation, where
      that gap matters? In particular, A3 "Partial — per-turn
      TBD in usage/stop_details" — is the per-turn-effort
      uncertainty actually resolvable structurally (i.e., does
      the captured assistant.message.usage key-set include or
      exclude such a field, and the discovery-notes-claude
      didn't dig deep enough)?

Format the verdict as:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_section(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/spec.md",
            "### Session 2 of 6:",
            "### Session 3 of 6:",
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/harvest-objectives-and-redaction.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/discovery-notes-copilot.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/discovery-notes-claude.md"
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
    out_path = out_dir / "round-a-session-2-result.json"

    print(f"\n{'='*60}\n[Round A] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="044-ai-chat-log-discovery-and-experiments",
        session_number=2,
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
