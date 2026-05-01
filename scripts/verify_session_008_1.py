"""One-shot cross-provider verification for Set 008 / Session 1.

Routes a session-verification call. Per the user's standing
cost-containment rule, ai-router is invoked at end-of-session only.
Writes the verifier's raw response to session-reviews/session-001.md
and the cost line to stdout.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_ai_router():
    init = REPO_ROOT / "ai-router" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "ai_router",
        str(init),
        submodule_search_locations=[str(init.parent)],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router"] = mod
    spec.loader.exec_module(mod)
    return mod


SESSION_SET = "docs/session-sets/008-cancelled-session-set-status"


SPEC_EXCERPT = """\
### Session 1: File-shape helpers + Python parallel + tests

**Goal:** Land the canonical shape on disk and the read/write helpers,
in both TypeScript (for the extension) and Python (for
`print_session_set_status` and any future close-out integration).

**Deliverables:**
- `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts`:
  - `isCancelled(folder: string): boolean`
  - `wasRestored(folder: string): boolean`
  - `cancelSessionSet(folder, reason?: string): Promise<void>`
    - If `RESTORED.md` exists, rename it to `CANCELLED.md` first.
    - If neither exists, create `CANCELLED.md` with header.
    - Prepend `Cancelled on <ISO-8601 local>\\n<reason or "">\\n\\n`.
  - `restoreSessionSet(folder, reason?: string): Promise<void>`
    - Requires `CANCELLED.md` to exist; throws otherwise.
    - Rename `CANCELLED.md` to `RESTORED.md`.
    - Prepend `Restored on <ISO-8601 local>\\n<reason or "">\\n\\n`.
- `ai-router/session_lifecycle.py` (new module):
  - Same three predicates and two write functions as TS.
  - Reused by `print_session_set_status` to render `[!]` for
    cancelled sets in the ASCII status table.
- Update `print_session_set_status` in `ai-router/__init__.py`:
  - Cancelled sets render with `[!]` glyph.
  - Cancelled sets sort to the bottom of the table.
- Unit tests in both languages covering:
  - First-time cancel (no prior file) creates `CANCELLED.md`
  - Cancel after restore renames `RESTORED.md` -> `CANCELLED.md`
    with history preserved + new entry prepended
  - Restore renames + prepends
  - Restore without `CANCELLED.md` throws
  - Empty reason is valid
  - Multi-cycle (cancel -> restore -> cancel -> restore) preserves
    all four history entries in order

**Acceptance:**
- File shape matches the documented format byte-for-byte (TS and
  Python both write the same line-ending, prefix, and timestamp
  format).
- All unit tests pass in both languages.
"""


# In-scope items from the spec's top-level "In scope" block that are
# load-bearing for Session 1's design choices, even though the per-
# session deliverables list above does not enumerate them. The
# verifier should evaluate Session 1 against both lists.
IN_SCOPE_NOTES = """\
From the spec's top-level "In scope" block:

- session-state.json field plumbing (riding on Set 7's "file always
  exists" invariant):
  - On cancel, capture the current `status` value into a new
    `preCancelStatus` field, then set `status: "cancelled"`.
  - On restore, read `preCancelStatus`, write it back to `status`,
    clear `preCancelStatus`.
  - Two separate fields, not a composite "cancelled @ in-progress"
    string -- readers that want a display label render
    "Cancelled (was in-progress)" from the pair.
  - If `preCancelStatus` is missing (e.g., manually-edited file),
    fall back to file-presence detection.

The orchestrator chose to land this state-file plumbing IN
Session 1 (alongside the markdown file-shape helpers) rather than
deferring it to Session 2 or Session 3, because (a) the helpers
already touch the session-set folder and the additional read/write
is a small extension, and (b) Session 2's UI work and Session 3's
docs/cross-provider work do not enumerate the plumbing either, so
landing it later would leave the state-file contract incomplete.
"""


ORCHESTRATOR_NOTES = """\
Implementation notes from the orchestrator (for verifier context, not
to be taken on faith):

1. Per the user's standing cost-containment rule, the AI router is
   invoked only at end-of-session for cross-provider verification.
   Step 3.5 (route an `analysis` task to author `ai-assignment.md`)
   was therefore SKIPPED this session, and there is no
   `ai-assignment.md` in this set's folder. Same divergence as set 007
   session 3; documented for the human at close-out. This is NOT a
   defect to flag.

2. Build/test status:
   - `python -m pytest ai-router/tests/`: 663 passed in 58s (16 new
     in test_session_lifecycle.py; no regressions in the prior 647).
   - `npx tsc --noEmit -p tools/dabbler-ai-orchestration`: clean.
   - `npx mocha --ui tdd --require ts-node/register
     'src/test/suite/cancelLifecycle.test.ts'
     'src/test/suite/metrics.test.ts'`: 22 passing
     (15 new cancelLifecycle + 7 existing metrics — only the
     vscode-import-free unit tests run via `test:unit`; the
     vscode-tainted suites still require the extension test host,
     same pre-existing limitation noted in set 007 session 3).
   - Smoke test: `print_session_set_status` invoked against the live
     repo with no cancelled sets renders unchanged (no `[!]` row, no
     `[!]` legend column). Verified visually.

3. Cross-language byte-parity: both writers produce LF newlines
   (utf-8, no BOM) and second-precision local-time ISO-8601
   timestamps. The Python writer uses `open(..., "wb")` and an
   explicit utf-8 encode to bypass Python's text-mode CRLF
   translation on Windows. The TS writer uses `fs.writeFileSync`
   with utf-8 encoding (Node.js does not translate). A
   `test_writer_emits_lf_only_no_crlf` test asserts the byte-level
   contract.

4. session-state.json plumbing:
   - Cancel: captures `status` -> `preCancelStatus`, then sets
     `status: "cancelled"`. A re-cancel without an intervening
     restore preserves the original `preCancelStatus` rather than
     overwriting it with `"cancelled"` (which would lose the original
     status across a restore).
   - Restore: reads `preCancelStatus`; if missing, empty, or
     literally `"cancelled"` (a defensive guard against malformed
     state files), falls back to file-presence inference (Set 7
     backfill rules). Then clears `preCancelStatus`.
   - Both helpers are tolerant of an absent state file (markdown
     side still writes; state.json update is a no-op).

5. Atomicity: both writers use unique-temp-file + rename. PID +
   random suffix uniqueness avoids the temp-file collision risk
   noted in `_atomic_write_json` in session_state.py. Restore's
   "rename CANCELLED.md to RESTORED.md" is implemented as
   "atomically write new file under target name, then unlink the
   source name" so a crash mid-sequence leaves both files present
   (subsequent restore is then a no-op via the
   `is_cancelled`-false guard, and detection precedence -- CANCELLED
   wins -- is unaffected).

6. `print_session_set_status` precedence: `is_cancelled(path)` --
   the marker file -- is checked BEFORE `read_status` so a state
   file with stale `status: "in-progress"` (e.g., a manually edited
   file, or a folder where the markdown was created by hand) still
   renders cancelled. The cancelled bucket sorts last; the legend's
   `[!] cancelled` column only renders when the bucket is non-empty
   (parallels the spec's tree-view rule for the extension's
   Cancelled group, which Session 2 will wire).

7. NOT touched in Session 1 (Session 2 / 3 deliverables):
   - `tools/dabbler-ai-orchestration/src/types.ts` `SessionState`
     union (Session 2)
   - `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`
     state detection / tree groups (Session 2)
   - `media/cancelled.svg` icon (Session 2)
   - Right-click `Cancel`/`Restore` commands + dialogs (Session 2)
   - Workflow doc note + README screenshots (Session 3)
"""


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def main() -> int:
    diff_path = Path(os.environ.get("DIFF_PATH", "/tmp/session-1-bundle.diff"))
    diff = read_file(diff_path) if diff_path.exists() else "(no diff file found)"

    cancel_ts = read_file(
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts"
    )
    cancel_test_ts = read_file(
        REPO_ROOT / "tools/dabbler-ai-orchestration/src/test/suite/cancelLifecycle.test.ts"
    )
    lifecycle_py = read_file(REPO_ROOT / "ai-router/session_lifecycle.py")
    lifecycle_test_py = read_file(REPO_ROOT / "ai-router/tests/test_session_lifecycle.py")

    bundle_parts = [
        "## Spec excerpt for Session 1\n\n" + SPEC_EXCERPT,
        "## In-scope notes (state-file plumbing rationale)\n\n" + IN_SCOPE_NOTES,
        "## Orchestrator implementation notes\n\n" + ORCHESTRATOR_NOTES,
        "## NEW `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts` (full)\n\n"
        "```typescript\n" + cancel_ts + "\n```\n",
        "## NEW `tools/dabbler-ai-orchestration/src/test/suite/cancelLifecycle.test.ts` (full)\n\n"
        "```typescript\n" + cancel_test_ts + "\n```\n",
        "## NEW `ai-router/session_lifecycle.py` (full)\n\n"
        "```python\n" + lifecycle_py + "\n```\n",
        "## NEW `ai-router/tests/test_session_lifecycle.py` (full)\n\n"
        "```python\n" + lifecycle_test_py + "\n```\n",
        "## Full unified diff for everything else (notably ai-router/__init__.py)\n\n"
        "```diff\n" + diff + "\n```\n",
    ]
    bundle = "\n\n---\n\n".join(bundle_parts)

    context = (
        "Set 008 / Session 1 of `008-cancelled-session-set-status`. "
        "Spec at docs/session-sets/008-cancelled-session-set-status/spec.md. "
        "Session 1 lands the on-disk cancel/restore file shape (CANCELLED.md "
        "/ RESTORED.md), TS + Python parallel writers, the new "
        "session-state.json `preCancelStatus` field plumbing, and the "
        "`print_session_set_status` update to render cancelled sets with "
        "`[!]`. No UI changes (Session 2's job). Verify (a) byte-for-byte "
        "parity between the TS and Python writers (header text, prepend "
        "semantics, timestamp format, line endings), (b) the precedence "
        "rule that CANCELLED.md wins over every other state signal -- both "
        "in `is_cancelled` use-sites and in the print_session_set_status "
        "ordering, (c) the prepend logic is robust to malformed prior "
        "content (manual edits), (d) the state-file plumbing handles all "
        "three corner cases: re-cancel preserves original preCancelStatus, "
        "restore with missing preCancelStatus falls back to file-presence "
        "inference, and absent state file is a no-op for the JSON side, "
        "(e) the test coverage actually exercises each acceptance criterion "
        "from the spec. The orchestrator skipped Step 3.5 (ai-assignment.md "
        "via routed analysis) per the user's cost-containment rule -- this "
        "is intentional, not a defect to flag. Do flag any other deviation "
        "from the spec's Session 1 acceptance criteria, including "
        "out-of-scope work that should have been deferred to Session 2 / 3."
    )
    content = (
        "Verify the changes below for the Session 1 acceptance criteria. "
        "Use the structured response format (VERIFIED or ISSUES FOUND, "
        "then categorized findings: Critical / Major / Minor / Nitpick). "
        "Be specific about file paths and line numbers / code snippets "
        "in any finding.\n\n" + bundle
    )

    ar = load_ai_router()
    result = ar.route(
        content=content,
        task_type="session-verification",
        context=context,
        complexity_hint=70,
        session_set=SESSION_SET,
        session_number=1,
    )

    out_path = REPO_ROOT / "docs/session-sets/008-cancelled-session-set-status/session-reviews/session-001.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(result.content, encoding="utf-8")

    print("=== VERIFIER RESPONSE (also saved to session-001.md) ===")
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
