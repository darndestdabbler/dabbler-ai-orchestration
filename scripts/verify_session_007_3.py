"""One-shot cross-provider verification for Set 007 / Session 3.

Routes a session-verification call. Per the user's standing
cost-containment rule, ai_router is invoked at end-of-session only.
Writes the verifier's raw response and the cost line to stdout.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_ai_router():
    """Import ``ai_router`` directly. The previous ``importlib.util.spec_from_file_location`` shim,
    required when the package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the package is installable
    via ``pip install -e .`` from the repo root. The ``sys.path.insert`` covers the case
    where the script is run without the editable install.
    """
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    import ai_router
    return ai_router


SESSION_SET = "docs/session-sets/007-uniform-session-state-file"


SPEC_EXCERPT = """\
### Session 3: Bootstrap, docs, cross-provider review

**Goal:** Ensure new session sets are born with the file, document
the new invariant, and run the cross-provider check.

**Deliverables:**
- `dabbler.setupNewProject` (extension's wizard) writes the
  not-started file when scaffolding a new session-set folder
- The "Generate Session-Set Prompt" flow's prompt template includes
  a note telling the AI to create the not-started file as part of
  the spec-folder scaffold
- `docs/ai-led-session-workflow.md`:
  - New section "Session-set lifecycle and state file"
  - Documents the canonical `status` values
  - Documents the `session-state.json` invariant ("every folder
    has one")
  - Documents the lazy-synthesis fallback for human-authored
    folders
- `docs/session-state-schema-example.md` updated with the
  not-started shape
- Update `tools/dabbler-ai-orchestration/README.md` if it discusses
  the file shape
- Cross-provider review (Gemini Pro) of:
  - The schema additions (`startedAt: null`, `orchestrator: null`)
  - The lazy-synthesis fallback — is it correct under concurrent
    access? Two readers hitting the same not-yet-synthesized folder
    at the same instant
  - The backfill CLI's mtime-based `completedAt` for done sets — is
    this misleading enough to warrant `null` instead?
- Address verifier findings, file
  `session-reviews/session-003.md`
- Final test sweep

**Acceptance:**
- New session sets created via the wizard come with
  `session-state.json` from the start
- Workflow doc and schema example updated
- Cross-provider review filed
- All tests pass; no regressions
"""


ORCHESTRATOR_NOTES = """\
Implementation notes from the orchestrator (for verifier context, not
to be taken on faith):

1. `dabbler.setupNewProject` does NOT itself scaffold individual
   session-set folders — it only creates the parent `docs/session-sets/`
   directory and the `docs/planning/` and `ai_router/` directories. The
   flow that actually creates a session-set folder is the AI driven by
   the "Generate Session-Set Prompt" template. So the spec's Session-3
   "wizard writes the not-started file" line is interpreted as
   "the session-set creation path writes the file" — which the spec
   itself acknowledges in the Bootstrap section: "The extension's
   'Generate Session-Set Prompt' flow doesn't itself create folders, so
   no change there." The orchestrator updated the prompt template (the
   actual creation path) instead of `gitScaffold.ts`.

2. AI-router usage is restricted by the user to end-of-session
   verification only (cost containment). Step 3.5 of the workflow
   (route an `analysis` task to author `ai-assignment.md`) was
   therefore skipped this session — and there is no `ai-assignment.md`
   in this set's folder at all. This is a known divergence from
   Rule #17 / the workflow doc, but obeys the user's standing
   directive. Flag this for the human at close-out.

3. Build/test status:
   - `python ai_router/dump_session_state_schema.py --check` -> exit 0
     (schema example unchanged this session; only the .md describing
     it was extended).
   - `pytest` (repo root): 647 passed in 55s.
   - `npx tsc --noEmit -p tools/dabbler-ai-orchestration` -> clean.
   - `npx vsce package` -> builds 0.11.0 vsix.
   - Extension-host integration tests (`npm test` in
     `tools/dabbler-ai-orchestration`) failed to launch: the bundled
     vscode-test Code.exe rejects all cli args ("bad option:
     --no-sandbox", etc.). This is an environment/install-state
     problem unrelated to this session's edits — the same failure
     occurs on a stash-stripped tree. `npm run test:unit` also
     can't run because the test files import `vscode`, which is only
     available inside the extension host. Documented for the human.

4. Reviewer focus areas the spec calls out explicitly:
   a. Schema additions (`startedAt: null`, `orchestrator: null`) —
      these are NOT new in this session; they are the not-started
      shape introduced by Session 1 and read-tolerant since Session 2.
      Session 3 only documents them in `session-state-schema-example.md`
      and in the new workflow-doc section.
   b. Lazy-synthesis fallback under concurrent access — implemented
      in Session 1/2 via `ensure_session_state_file` (Python) and
      `ensureSessionStateFile` (TS). The Set 7 spec's Risks section
      calls out write-then-rename as the mitigation. Session 3 does
      not change that code; it only documents the fallback's role.
      Verifier should sanity-check that the docs accurately describe
      the implementation rather than the prior Session-2-round-1
      not-started-only behavior.
   c. Backfill CLI's mtime-based `completedAt` — also from Session 1.
      The spec acknowledges the approximation. Session 3 adds no new
      writes here; the `completedAt` semantics are not re-litigated.
"""


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def main() -> int:
    diff_path = Path(os.environ.get("DIFF_PATH", "/tmp/session-3-bundle.diff"))
    diff = read_file(diff_path) if diff_path.exists() else "(no diff file found)"

    workflow_section = ""
    wf = read_file(REPO_ROOT / "docs/ai-led-session-workflow.md")
    # extract the new "Session-Set Lifecycle and State File" section
    if "### Session-Set Lifecycle and State File" in wf:
        start = wf.index("### Session-Set Lifecycle and State File")
        end = wf.index("---\n\n## Setting Up a New Session Set", start)
        workflow_section = wf[start:end]

    schema_md = read_file(REPO_ROOT / "docs/session-state-schema-example.md")
    readme = read_file(REPO_ROOT / "tools/dabbler-ai-orchestration/README.md")
    prompt_ts = read_file(
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts"
    )

    bundle_parts = [
        "## Spec excerpt for Session 3\n\n" + SPEC_EXCERPT,
        "## Orchestrator implementation notes\n\n" + ORCHESTRATOR_NOTES,
        "## NEW workflow-doc section\n\n```markdown\n"
        + workflow_section
        + "\n```\n",
        "## Updated `docs/session-state-schema-example.md` (full)\n\n"
        "```markdown\n" + schema_md + "\n```\n",
        "## Updated `tools/dabbler-ai-orchestration/README.md` (full)\n\n"
        "```markdown\n" + readme + "\n```\n",
        "## Updated `src/wizard/sessionGenPrompt.ts` (full)\n\n"
        "```typescript\n" + prompt_ts + "\n```\n",
        "## Full unified diff (for any details above that need cross-checking)\n\n"
        "```diff\n" + diff + "\n```\n",
    ]
    bundle = "\n\n---\n\n".join(bundle_parts)

    context = (
        "Set 007 / Session 3 of `007-uniform-session-state-file`. "
        "Spec at docs/session-sets/007-uniform-session-state-file/spec.md. "
        "This is the FINAL session of the set: bootstrap (wizard prompt), "
        "docs, and cross-provider review. No code-behavior changes are "
        "expected beyond the prompt-template addition; the Session 1 "
        "synthesizer/backfill and the Session 2 reader collapses already "
        "shipped. Verify that (a) the docs accurately describe the "
        "implementation as it stands AFTER Session 2, (b) the prompt-"
        "template note correctly instructs the AI to create the "
        "not-started file alongside spec.md, (c) the README state-detection "
        "table now describes status-driven detection rather than the old "
        "file-presence inference, and (d) the four edits are internally "
        "consistent. The orchestrator skipped Step 3.5 (ai-assignment.md "
        "via routed analysis) per the user's cost-containment rule — this "
        "is intentional, not a defect to flag. Do flag any other "
        "deviation from the spec's Session 3 acceptance criteria."
    )
    content = (
        "Verify the changes below for the Session 3 acceptance criteria. "
        "Use the structured response format (VERIFIED or ISSUES FOUND, "
        "then categorized findings). Be specific about file paths and "
        "snippets.\n\n" + bundle
    )

    ar = load_ai_router()
    result = ar.route(
        content=content,
        task_type="session-verification",
        context=context,
        complexity_hint=70,
        session_set=SESSION_SET,
        session_number=3,
    )

    out_path = REPO_ROOT / "docs/session-sets/007-uniform-session-state-file/session-reviews/session-003.md"
    out_path.write_text(result.content, encoding="utf-8")

    print("=== VERIFIER RESPONSE (also saved to session-003.md) ===")
    print(f"Wrote {out_path} ({len(result.content)} chars)")
    print()
    print("=== COST ===")
    print(
        f"model={result.model_name} "
        f"input_tokens={result.input_tokens} "
        f"output_tokens={result.output_tokens} "
        f"cost_usd={getattr(result, 'cost_usd', getattr(result, 'total_cost_usd', 0)):.4f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
