"""Session 3 verification driver — Set 035 (state-file sole truth).

Round A bundles the artifacts produced by Session 3:

  - docs/session-state-schema.md — UPDATED. Sessions 1+3 jointly
    rewrote the "Cancel / restore" section + bucketing-list first
    bullet + status-table footnote on `"cancelled"`. Session 3
    added the "Canonical reader" subsection (the readCancellationState
    contract), "Writer symmetry" subsection (the TS+Python writers
    keep state file and markdown in lockstep, parity confirmed in
    Session 2), and "Layer-3 coverage" subsection naming the new
    Playwright spec and its three scenarios.
  - docs/ai-led-session-workflow.md — UPDATED. Reframed
    "Cancelling and restoring a session set" to state-file-first:
    operator-trigger paragraph updated to make the state file the
    canonical signal; "Detection precedence" rewritten to consult
    `state.status` first with the legacy file-presence fallback
    last; Step 1 "find_active_session_set" bullet rewritten to
    drop the file-presence skip-on-CANCELLED.md path.
  - tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts —
    UPDATED (JSDoc only). Header-comment block clarifies the
    audit-trail-artifact role of the markdown files post-Set-035;
    `prependEntry`'s spec-link comment updated to reference the
    audit-history role rather than file-presence detection;
    `cancelSessionSet`'s JSDoc adds the writer-symmetry rationale
    ("both writes happen on every cancel"); `restoreSessionSet`'s
    JSDoc clarifies why `isCancelled` is still the right
    file-presence precondition; the in-body "rename last"
    sequence-comment rewritten so the explanation references the
    state-file-first contract directly.
  - tools/dabbler-ai-orchestration/src/test/playwright/cancellation-state-file.spec.ts —
    NEW. Three Layer-3 scenarios:
      1. status=cancelled with NO CANCELLED.md → Cancelled bucket
         (the new contract).
      2. No state file + CANCELLED.md present → Cancelled bucket
         (legacy fallback).
      3. status=complete + stray CANCELLED.md → Complete bucket
         (state-file wins; stray marker does NOT flip the bucket).

Ground truth bundled alongside:

  - Set 035 spec.md Session 3 — the contract this session closes.
  - cancelLifecycle.ts readCancellationState function body — the
    canonical reader the doc edits and the Layer-3 spec exercise.

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
EXT_ROOT = REPO_ROOT / "tools" / "dabbler-ai-orchestration"


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
Set 035 extends the H2 single-source-of-truth verdict from Set 033
Session 2 to the cancellation lifecycle. Session 1 (closed
2026-05-21) migrated the TypeScript reader at fileSystem.ts:276 to
consult session-state.json's status field first via the new
readCancellationState() helper. Session 2 (closed 2026-05-21)
confirmed the TS and Python writers produce byte-equivalent on-disk
shape and shipped the glossary-harvest tool.

Session 3 (THIS verification) is documentation alignment + Layer-3
Playwright coverage. Four deliverables:

1. **session-state-schema.md** — the "Cancel / restore" section
   already reframed in Session 1; Session 3 adds three subsections
   ("Canonical reader", "Writer symmetry", "Layer-3 coverage") that
   anchor the contract to the readCancellationState API, the TS +
   Python writer parity confirmed in Session 2, and the new
   Playwright spec.

2. **ai-led-session-workflow.md** — the "Cancelling and restoring
   a session set" narrative reframed to state-file-first. The
   operator-trigger paragraph now leads with editing
   session-state.json by hand; the "Detection precedence"
   subsection consults state.status first with the markdown
   marker as legacy fallback only; the Step 1 "find active session
   set" bullet drops the file-presence skip path.

3. **cancelLifecycle.ts JSDoc** — header comment + four function
   JSDoc blocks polished for clarity around the audit-trail-artifact
   role of the markdown files and the writer-symmetry rationale.

4. **cancellation-state-file.spec.ts** — three Layer-3 Playwright
   scenarios. Scenario 1 (state-file-only cancellation): cancelSet
   then delete CANCELLED.md → expect data-state=cancelled. Scenario 2
   (legacy fallback): cancelSet then delete session-state.json →
   expect data-state=cancelled via the isCancelled file-presence
   fallback. Scenario 3 (state-file wins): driveHappyPath through a
   1-session set to status=complete, then drop a stray CANCELLED.md
   → expect data-state=complete (NOT cancelled). All three green
   when run against a fresh dist/ build.

Pre-existing failures unchanged: 3 Layer-3 scenarios in
session-sets-tree.spec.ts have been failing since Session 1's empty-
state grey-gauge removal (the .acc-empty-cta locator queries find no
element under the in-progress row scenarios). These are out of scope
for Session 3 (cancellation docs + Layer-3 coverage of the new
contract); they belong with Set 034's styling iteration work or a
separate hot-fix.

Session 4 is final test sweep + change-log + dual-registry release.
""".strip()


FOCUS_PROMPT = """
ROUND A — Session 3 implementation faithfulness for documentation
alignment + Layer-3 Playwright coverage.

You are Gemini Pro, asked to verify that Session 3 of Set 035 ships
canonical docs that faithfully reflect the implemented contract,
JSDoc polish that accurately describes the post-Set-035 invariants,
and a Layer-3 Playwright spec whose three scenarios exercise the
state-file-first contract correctly.

Verify:

A. **session-state-schema.md alignment.**

   1. The "Cancel / restore" section's lede correctly names
      ``status: "cancelled"`` as the canonical signal and
      cross-references the Set 033 Session 2 H2 verdict.
   2. The new "Canonical reader" subsection accurately documents
      ``readCancellationState`` in `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts`:
      the four return values (``"cancelled"``, ``"restored"``,
      ``"active"``, ``"unknown"``) match the
      ``CancellationState`` type union in the source; the table's
      semantics match the implementation; the legacy-fallback
      callout names the right caller (`fileSystem.ts:readSessionSets`).
   3. The new "Writer symmetry" subsection correctly cites the
      TS writer (`cancelLifecycle.ts:cancelSessionSet` /
      `restoreSessionSet`) and the Python mirror
      (`ai_router/session_lifecycle.py:cancel_session_set` /
      `restore_session_set`); the byte-level claims (LF newlines,
      UTF-8 no BOM, local-time ISO-8601 with second precision and
      ±HH:MM offset) match Session 2's verified parity table; the
      reasoning that an asymmetric state-vs-marker disagreement
      can ONLY come from a legacy file or a manual edit is sound.
   4. The new "Layer-3 coverage" subsection accurately summarizes
      the three Playwright scenarios at
      `tools/dabbler-ai-orchestration/src/test/playwright/cancellation-state-file.spec.ts`.
   5. The legacy-fallback section's claim that the
      "state-file-first contract intentionally does NOT consult
      CANCELLED.md presence when the state file declares a
      non-cancelled status" matches the actual behavior in
      `fileSystem.ts:readSessionSets` (the cancelled-bucket fallback
      fires only on the ``"unknown"`` branch).

B. **ai-led-session-workflow.md alignment.**

   1. "Cancelling and restoring a session set" → "How the operator
      triggers it" — the two bullets now correctly describe a
      right-click that flips the state file AND prepends to
      ``CANCELLED.md``, plus a hand-edit affordance that flips the
      state file (with the markdown audit entry strongly
      recommended). The bullet about "drop a `CANCELLED.md` file"
      from the prior revision must be gone or correctly downgraded
      (hand-dropping only the marker does NOT flip the bucket).
   2. "Detection precedence" — the three-tier ladder is named
      correctly and matches `fileSystem.ts:readSessionSets`. Tier 1
      ``state.status === "cancelled"``; tier 2 non-cancelled
      ``state.status`` falls through to the normal status ladder
      with no CANCELLED.md override; tier 3 fallback fires only
      on no usable state file + CANCELLED.md present.
   3. The Step 1 "find_active_session_set" bullet no longer says
      "CANCELLED.md present = skip"; it says
      ``status: "cancelled"`` = skip, with the marker fallback
      pointed out as not-the-routine-path.
   4. ``RESTORED.md`` continues to be described as audit-only with
      its rename-on-restore behavior; the "or done / in-progress /
      not-started" trio uses the canonical token "complete" (the
      legacy "done" carryover doesn't sneak back in).

C. **cancelLifecycle.ts JSDoc polish.**

   1. The header comment block (lines 4-11 after the polish) now
      explicitly states that the markdown files are durable audit-
      history artifacts post-Set-035 with the state file as the
      canonical bucketing signal; the byte-equivalence pin
      (lines 13-22) names Session 2's verified parity.
   2. `prependEntry`'s JSDoc no longer attributes "filename
      presence is what matters" as the prepend-logic motivation;
      the rewritten copy correctly frames the prepend as
      preserving the operator-readable audit history.
   3. `cancelSessionSet`'s JSDoc explains BOTH writes (markdown +
      state file) as the writer-symmetry contract that
      readCancellationState relies on.
   4. `restoreSessionSet`'s JSDoc explains why ``isCancelled`` is
      still the right precondition (writer needs the file to
      rename, not the bucketing signal).
   5. The "Sequence: write RESTORED.md, then update
      session-state.json, then unlink CANCELLED.md" comment in
      `restoreSessionSet` is reframed against the state-file-first
      contract — the crash-safety argument now references both
      readers (canonical and legacy-fallback).

D. **cancellation-state-file.spec.ts scenarios.**

   1. **Scenario 1** (state-file-only cancellation, "new contract")
      — calls `cancelSet(h)` (which writes both signals via the
      canonical writer) then `fs.unlinkSync(cancelledPath)`. The
      state file's `status` field is now "cancelled" with no
      CANCELLED.md on disk. Assertions:
      ``data-state="cancelled"`` on the row;
      "Cancelled  (1)" bucket header visible. This exercises the
      `readCancellationState === "cancelled"` branch in
      fileSystem.ts:readSessionSets.
   2. **Scenario 2** (legacy fallback) — calls `cancelSet(h)`
      then `fs.unlinkSync(statePath)`. The state file is gone,
      CANCELLED.md remains. Assertions: ``data-state="cancelled"``
      on the row; "Cancelled  (1)" bucket header visible. This
      exercises the `cancellation === "unknown" && isCancelled(dir)`
      branch in fileSystem.ts:readSessionSets, including the
      console.warn diagnostic trail.
   3. **Scenario 3** (state-file wins) — creates a 1-session set,
      runs `driveHappyPath(h, 1)` to land status=complete +
      lifecycleState=closed, then writes a stray CANCELLED.md by
      hand. Assertions: state.status verified as "complete" before
      launch; row's ``data-state="complete"`` (NOT cancelled); no
      Cancelled bucket header rendered; Complete bucket header
      "Complete  (1)" visible.
   4. Each scenario uses the established `electronLaunch.ts`
      helpers (`makeSet`, `cancelSet`, `driveHappyPath`,
      `launchVSCode`, `openSessionSetsView`, `triggerRefresh`,
      `closeVSCode`, `cleanupTmpDir`) consistently with the other
      Layer-3 specs.
   5. Per-test setup uses a fresh `makeTmpDir` per scenario so
      they don't fight over a shared workspace; teardown closes
      VS Code and removes the tmpdir.

E. **What's risky or missing.** Any edge case that would bite a
   real run?

   - The Scenario 2 legacy-fallback path depends on `readSessionSets`
     reaching the `cancellation === "unknown" && isCancelled(dir)`
     branch when no state file is present. Confirm that no
     intervening code in `readSessionSets` lazy-synthesizes the
     state file before `readCancellationState` is called, which
     would change the branch and bypass the legacy fallback.
   - The Scenario 3 stray-marker case writes a hand-rolled
     CANCELLED.md body via `fs.writeFileSync(... "# Cancellation
     history\\n\\nCancelled on 2026-05-21T10:00:00-04:00\\nstray
     marker (test)\\n\\n", "utf8")`. Confirm the test does not
     assert anything about the marker's content (it only asserts
     the marker DOESN'T flip the bucket), so the hand-rolled
     format doesn't need to match the canonical writer's prepend
     shape byte-for-byte.
   - The schema doc's "Canonical reader" table mirrors the source
     comments closely. Confirm no contract drift between the doc
     table and the actual `CancellationState` type union — a
     future code-side change to the four return values should
     update this table too. (No present drift; this is a future-
     proofing note.)
   - The workflow doc's "Edit `session-state.json` by hand" bullet
     mentions `preCancelStatus` as optional. Confirm this matches
     the writer's behavior: the canonical writer DOES set
     `preCancelStatus`, but a hand-edit that flips only `status`
     to "cancelled" without setting `preCancelStatus` will still
     bucket as cancelled (the reader's contract only cares about
     `status`). A later restore from such a hand-edit would fall
     through `inferStatusFromFiles` per the existing restore-
     inference contract, which is preserved.
   - The Set 033 disposition pattern carried `preCancelStatus`
     across re-cancels; confirm the new docs don't contradict
     that. (The schema doc's "Writer symmetry" subsection cites
     `preCancelStatus` captured on cancel and restored on restore,
     matching the source.)
   - The three pre-existing Layer-3 failures
     (session-sets-tree.spec.ts: ARIA tree structure /
     orchestrator block provider sublabel / empty-state CTA
     fallback) are flagged as out-of-scope in the SYSTEM_SUMMARY.
     Confirm they are independent of the cancellation code path
     (no touch on cancelLifecycle.ts, fileSystem.ts cancellation
     branch, or session-state-schema.md cancel section). If you
     think one of them DOES intersect, surface it.

Format the verdict as:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.

Cite specific quoted phrases / file:line references when flagging
issues; skip stylistic nits.
""".strip()


def _bundle() -> str:
    parts = [
        # Primary deliverable A — schema doc Cancel/restore + subsections.
        read_section(
            REPO_ROOT / "docs" / "session-state-schema.md",
            "## Cancel / restore",
            "\n## Lazy synthesis",
        ),
        # Primary deliverable A — bucketing-list first bullet (Set 035 anchor).
        read_section(
            REPO_ROOT / "docs" / "session-state-schema.md",
            "## Bucketing in the Session Sets Explorer (v3)",
            "\n---",
        ),
        # Primary deliverable B — workflow doc Cancelling/restoring section.
        read_section(
            REPO_ROOT / "docs" / "ai-led-session-workflow.md",
            "### Cancelling and restoring a session set",
            "---\n\n## Setting Up a New Session Set",
        ),
        # Primary deliverable B — workflow doc Step 1 find_active_session_set.
        read_section(
            REPO_ROOT / "docs" / "ai-led-session-workflow.md",
            "### Step 1: Identify the Active Session Set",
            "### Step 2",
        ),
        # Primary deliverable C — cancelLifecycle.ts (full file, JSDoc polish).
        read_file(
            EXT_ROOT / "src" / "utils" / "cancelLifecycle.ts",
        ),
        # Primary deliverable D — full Layer-3 Playwright spec.
        read_file(
            EXT_ROOT / "src" / "test" / "playwright" / "cancellation-state-file.spec.ts",
        ),
        # Ground truth — fileSystem.ts readSessionSets cancellation branch.
        read_section(
            EXT_ROOT / "src" / "utils" / "fileSystem.ts",
            "// Set 035: state-file-first cancellation detection.",
            "\n    let totalSessions",
        ),
        # Ground truth — Session 3 spec contract.
        read_section(
            SET_DIR / "spec.md",
            "## Session 3 of 4: Documentation + Layer-3 coverage",
            "---\n\n## Session 4 of 4:",
        ),
    ]
    return "\n\n".join(parts)


def run_round(label: str, code_block: str, focus_prompt: str, out_path: Path) -> dict:
    print(f"\n{'='*60}\n[{label}] sending verification call to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=focus_prompt,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE ---\n{code_block}",
        session_set="035-state-file-sole-truth-marker-retirement",
        session_number=3,
    )
    dumped = dump_route_result_to_json(result)
    out_path.write_text(json.dumps(dumped, default=str, indent=2), encoding="utf-8")
    cost = dumped.get("cost_usd") or dumped.get("cost") or "?"
    model = dumped.get("model") or dumped.get("model_name") or "?"
    tokens = (
        f"in={dumped.get('input_tokens', '?')}, "
        f"out={dumped.get('output_tokens', '?')}"
    )
    print(f"[{label}] model={model} cost=${cost} tokens={tokens}")
    print(f"[{label}] full response saved to: {out_path}")
    text = dumped.get("response") or dumped.get("text") or dumped.get("content")
    if isinstance(text, str):
        print(f"\n--- [{label}] VERIFIER OUTPUT ---\n{text}\n--- end [{label}] ---")
    return dumped


def main() -> None:
    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)

    if len(sys.argv) < 2:
        print("Usage: python verify_session3.py round-a [round-b]", file=sys.stderr)
        sys.exit(2)

    sub = sys.argv[1]
    bundle = _bundle()
    print(f"Bundle size: {len(bundle):,} chars")
    if sub == "round-a":
        run_round(
            "Round A",
            bundle,
            FOCUS_PROMPT,
            out_dir / "round-a-session-3-result.json",
        )
    elif sub == "round-b":
        focus = (
            "ROUND B — confirm the must-fix issues from Round A are "
            "addressed in the updated code.\n\n"
            "For each Round-A must-fix, confirm the fix is present "
            "and doesn't introduce a new contradiction. Format: "
            "VERIFIED or REJECTED with cited quotes; skip stylistic "
            "nits."
        )
        run_round(
            "Round B",
            bundle,
            focus,
            out_dir / "round-b-session-3-result.json",
        )
    else:
        print(f"Unknown subcommand: {sub}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
