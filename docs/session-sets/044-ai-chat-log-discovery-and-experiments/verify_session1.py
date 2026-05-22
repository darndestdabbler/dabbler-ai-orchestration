"""Session 1 verification driver — Set 044 (AI chat-log discovery
and experiments).

Round A bundles the two locked S1 deliverables:

  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      harvest-objectives-and-redaction.md       (CREATED)
  - docs/session-sets/044-ai-chat-log-discovery-and-experiments/
      discovery-notes-copilot.md                (CREATED)

Plus context that matters for the verifier:

  - The S1 spec excerpt from
      docs/session-sets/044-.../spec.md
  - The .gitignore addition for the scratch dir
  - The scratch README + setup script (referenced inline so the
    verifier can confirm the scaffolding is self-consistent)

S1 is an INVESTIGATION session, not a code-implementation session.
The verification target is therefore "are the claims about Copilot
CLI 1.0.51 accurate, is the per-objective coverage matrix defensible
from the cited evidence, and is the redaction policy structurally
sound?" — NOT "do tests pass" or "is the code correct" (no code
shipped).

Per memory `feedback_ai_router_route_result_handling`: dump
RouteResult to JSON before any attribute access.
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
Set 044 (AI chat-log discovery + experiments) tests a hypothesis:
that Copilot CLI and Claude Code already write log files containing
enough orchestrator-state signal that a log-harvesting observability
layer could *supplement or replace* the launch-adapter approach
proposed in Sets 037-041. The hypothesis matters because the launch-
adapter approach is much heavier engineering, and a working
"read-side-only" alternative would reshape the roadmap.

Set 044 has 6 sessions:

  S1 (THIS verification): Copilot log harvest + scope/redaction framing.
     Outputs: harvest-objectives-and-redaction.md (Parts 1-3 lock
     objectives + redaction + inventory methodology),
     discovery-notes-copilot.md (Part 1-7 inventory of ~/.copilot/
     artifacts + OTel exporter contract + per-objective coverage
     verdict).
  S2: Claude Code log harvest + comparative analysis.
  S3: Narration design + Copilot narration experiment.
  S4: Claude narration experiment + cross-backend synthesis.
  S5: Concrete proposal + cross-provider consensus ($15 NTE).
  S6: Conditional implementation + close-out.

Per operator decision 2026-05-22, S1 produces STRUCTURAL inventory
only — no live Copilot turns driven from S1. The live-run harvest
is folded into S2 alongside the Claude Code live runs (S2 will do
both backends in parallel against the same synthetic session set).

Per the redaction discipline (Part 2 of harvest-objectives-and-
redaction.md), nothing harvested enters the repo verbatim. Discovery
notes characterize SCHEMAS (column names, field shapes, byte counts,
log levels) — not payloads.

The key empirical findings in discovery-notes-copilot.md:

  1. ~/.copilot/session-store.db is the rich-signal artifact —
     SQLite with sessions, turns, session_files, session_refs,
     checkpoints, dynamic_context_items, FTS5 search_index. The
     `session_files(session_id, file_path, tool_name, turn_index,
     first_seen_at)` table is the harvest-objective B1+B2+B3 in
     storage form: "which tool touched which file on which turn."
     This is the conflict-detection signal the launch-adapter design
     would have had to synthesize from scratch.
  2. OTel JSONL exporter (via COPILOT_OTEL_FILE_EXPORTER_PATH) emits
     OTel GenAI Semantic Conventions spans: invoke_agent > chat
     <model> + execute_tool <tool>. Content capture is OFF by
     default; the harvest leaves it off to keep redaction risk low.
  3. ~/.copilot/ide/*.lock contains plaintext bearer tokens in
     headers.Authorization. The harvest policy explicitly excludes
     this directory from any copy-to-scratch operation.
  4. Per-objective coverage matrix (Part 4): 9 of 13 objectives are
     surfaced natively. The only structural gap is C3 (Dabbler set/
     session boundary marker) — Copilot has no model of session
     sets. C3 is the narration target S3 will pilot.

A3 (effort/reasoning level) is uncertain pending S2's live OTel
capture — the contract is unclear on whether OTel carries
gen_ai.request.reasoning_effort.

The conclusion drawn in §4 is that the harvest hypothesis is on
FIRMER ground for Copilot than the spec assumed: only A3 and C3
unambiguously need narration; everything else is in the native
session-store.db or OTel surface.

Bundled with S1: the .gitignore now excludes `dabbler-log-harvest/`
at the repo root as belt-and-suspenders (the real scratch path is
C:\\tmp\\dabbler-log-harvest\\, outside the repo).
""".strip()


FOCUS_PROMPT = """
ROUND A — Session 1 design + investigation faithfulness for Set 044
(AI chat-log discovery + experiments).

You are Gemini Pro, asked to verify that Session 1 of Set 044 ships
defensible artifacts for an investigation-heavy session where the
spec demands "scope-locked, redaction-locked, inventory-characterized"
deliverables BEFORE any live runs.

This session ships NO code, NO tests. The verification target is the
quality of the design + claims in two markdown documents. Use the
spec excerpt + the inline document text as ground truth.

Verify:

A. **Harvest objectives (Part 1 of harvest-objectives-and-redaction.md).**

   1. The objective tables (A/B/C/D groupings — identity, action,
      boundary, conflict-detection requirements) cover what a
      conflict-detection watcher would actually need. In particular,
      check that the minimum-viable triple stated in §D (timestamp +
      engine+provider + set/session id) is the right minimum.
   2. The "out of scope" carve-outs at the bottom of Part 1 are
      defensible:
        - Token counts / latency / cost (already in router metrics).
        - Embedding vectors / model-internal state.
        - Prompt content (deliberately redacted).
      Are any of these accidentally load-bearing for the harvest
      hypothesis? E.g., does the proposal need token counts after
      all?
   3. Any harvest objective that is structurally important but
      missing from A/B/C/D? Examples worth checking: error-rate
      signals (would conflict detection need to know that a tool
      call FAILED, not just that it happened?); the "agent ended
      mid-tool-call" / crash-detection signal; cross-session
      relationships (was this Copilot session a continuation of
      that one?).

B. **Redaction discipline (Part 2 of harvest-objectives-and-
   redaction.md).**

   1. The two-tier storage rule (scratch outside repo + synthesis
      layer inside repo) is structurally sound. Confirm: nothing in
      the discovery-notes-*.md output should leak verbatim prompts/
      responses/file-contents/tokens.
   2. The scrub rules (7 of them, numbered 1-7) cover all the
      sensitive-content classes that ~/.copilot/ is known to hold.
      Check against the discovery-notes-copilot.md inventory:
        - turns.user_message / turns.assistant_response (rule #1, #2)
        - file contents in session-state/<uuid>/files/ (rule #3)
        - headers.Authorization in ide/*.lock (rule #4)
        - operator-local paths (rule #5)
      Any class missing? E.g., the session-store.db
      `dynamic_context_items.content` field — does rule #3 cover it?
   3. The reading-side discipline ("never `cat` an entire log
      file") is enforced by the SHAPE of the discovery-notes-
      copilot.md content. Spot-check whether discovery-notes-
      copilot.md leaks any verbatim content that the policy
      forbids. Examples:
        - It cites byte counts and column names — fine.
        - It cites the OTel help text verbatim — confirm this is
          help-system text the operator's machine emits when typing
          a documented help command, not user-content; verify it's
          covered.
        - It does NOT quote any value out of config.json — confirm.
        - It does NOT quote any process-log line content — confirm
          (the per-line probe quoted line lengths and starts_with/
          ends_with prefixes of length 2 only, not contents).

C. **Inventory methodology (Part 3 of harvest-objectives-and-
   redaction.md vs. §1 of discovery-notes-copilot.md).**

   1. The methodology defines 8 columns per artifact row; the §1
      table in discovery-notes-copilot.md actually populates 8
      columns per row for every artifact listed. Confirm one-to-one
      alignment.
   2. The artifact list in §1 is reasonably complete for Copilot
      CLI 1.0.51. Is anything missing? Cross-reference against the
      copilot help output (described in the documents). The list
      includes:
        - config.json
        - logs/process-*.log
        - session-state/<conv-uuid>/{workspace.yaml, checkpoints/,
          files/, research/}
        - session-store.db (SQLite with FTS5)
        - ide/<conv-uuid>.lock
        - OTel JSONL export
        - --output-format json stdout
      Anything else `copilot --help` documents that the harvest
      should consider?

D. **Per-objective coverage matrix accuracy (§4 of discovery-notes-
   copilot.md).**

   For each of the 13 rows (A1-A5, B1-B5, C1-C5):

   1. Is the "Native?" verdict defensible from the cited surface?
      In particular, scrutinize:
        - A2 "Yes via OTel" — is `chat <model>` span name +
          gen_ai.request.model attr the right citation? Does
          GitHub Copilot CLI 1.0.51's OTel implementation actually
          follow GenAI SemConv 1.x for model name?
        - A3 "No in default; maybe in OTel via
          gen_ai.request.reasoning_effort" — is the GenAI SemConv
          stable on this attribute name? The verifier may have
          knowledge of the actual semconv state in 2026-05.
        - B4 "Probably yes — would be a execute_tool <bash> span
          with the command string in OTel attrs" — verify the
          inference; would the bash subprocess invocation really
          surface its argv in an OTel span?
        - B5 "Yes — session_files.tool_name + file_path" — verify
          this answers "writes that bypass the writer" rather than
          just "files the assistant read."
        - C3 "No, narration required" — verify this is correct;
          confirm Copilot CLI really has no awareness of Dabbler
          session sets and no env-var or config knob exposes
          something equivalent.
   2. The "Coverage summary" sentence below the table claims 9 of
      13 objectives. Count the row verdicts and verify the count.

E. **Scaffolding correctness (§6 of discovery-notes-copilot.md).**

   1. The S2 harvest-harness recipe is technically executable:
      - Setting COPILOT_HOME isolates the live runs from the
        operator's real ~/.copilot — confirm the env var name is
        accurate (copilot help environment confirms it).
      - Setting COPILOT_OTEL_FILE_EXPORTER_PATH auto-enables OTel
        AND selects the file exporter (confirmed in copilot help
        monitoring).
      - The "do NOT snapshot $COPILOT_HOME\\ide\\" guardrail is
        correctly callout-ed.
   2. The synthetic-set seed content (spec.md + state.json at
      not-started, no other artifacts) is the minimum the harvest
      needs. Is there anything else S2 will need that S1 should
      have pre-staged? (Example: a CLAUDE.md? An AGENTS.md? Any
      lockfiles or markers that would change Copilot's behavior in
      a way that affects the harvest signal?)

F. **What's risky or missing.** Any edge case that would bite the
   downstream sessions if not surfaced now?

   - Does S1's "no live runs" stance accidentally over-defer? E.g.,
     is there a critical empirical question that ONLY S1 could
     answer cheaply (because the inventory is fresh) that gets
     harder if punted to S2?
   - The discovery notes' Open Questions list (§7) — are these the
     RIGHT open questions, or are there sharper ones we should be
     opening?
   - The harvest hypothesis "9 of 13 objectives surfaced natively"
     is a strong claim. Is the verdict overstated anywhere? E.g.,
     A1 (engine name) is "implicit — file location alone identifies
     Copilot" — but if a harvester walks across BOTH backends'
     logs, the file location IS the engine signal; do we count
     that as native or as "structural by virtue of where the log
     lives"?
   - The conclusion in §4 ("the harvest hypothesis is on much
     firmer ground for Copilot than the spec assumed") — does the
     evidence in §1-§3 actually support that conclusion, or is it
     ahead of the evidence (e.g., relying on schema rather than
     row content; relying on documented OTel exports rather than
     empirically captured spans)?

Format the verdict as:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_section(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/spec.md",
            "### Session 1 of 6:",
            "### Session 2 of 6:",
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/harvest-objectives-and-redaction.md"
        ),
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/discovery-notes-copilot.md"
        ),
        # Inline-quote the gitignore addition rather than reading
        # the whole .gitignore (which has nothing else relevant).
        "=== EXCERPT: .gitignore (Set 044 addition only) ===\n"
        "# Set 044 (AI chat-log discovery + experiments). The scratch dir holds\n"
        "# raw harvested logs / transcripts / sqlite dumps from the discovery\n"
        "# runs. Lives outside the repo at C:\\\\tmp\\\\dabbler-log-harvest\\\\, but the\n"
        "# entry below is belt-and-suspenders against an accidental symlink /\n"
        "# relocation that lands it under the repo root. See\n"
        "# docs/session-sets/044-.../harvest-objectives-and-redaction.md Part 2.\n"
        "dabbler-log-harvest/\n",
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "round-a-session-1-result.json"

    print(f"\n{'='*60}\n[Round A] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="044-ai-chat-log-discovery-and-experiments",
        session_number=1,
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
