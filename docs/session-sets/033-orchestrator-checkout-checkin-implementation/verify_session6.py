"""Session 6 verification driver — Set 033 (implementation cycle).

Round A bundles the artifacts produced by Session 6, the closing
session of Set 033:

  - ai_router/session_state.py (excerpt: _flip_state_to_closed) —
    UPDATED. Inserts `state["orchestrator"] = None` immediately
    before the snapshot write so every successful close clears the
    check-out (mid-set and final alike). Idempotent: a block
    that is already None lands the same write.
  - ai_router/tests/test_close_session_snapshot_flip.py (excerpt:
    new "Set 033 Session 6 — cross-tier orchestrator check-in"
    block) — NEW. Three tests: final close clears the block,
    mid-set close clears the block (per-session, not per-set
    release), tier-agnostic direct-helper test.
  - ai_router/tests/e2e/test_happy_3session.py (excerpt: post-close
    invariant assertion) — UPDATED. Flips the existing
    orchestrator-block-persists assertion to assert the block is
    None post-close.
  - docs/session-state-schema.md (excerpt: Check-out / check-in
    section) — UPDATED. Tightened Block-null invariant for tier
    symmetry; surfaced `work_checked_out` / `work_checked_in`
    alias names (OQ2); new Stranded-checkout recovery paragraph.
  - ai_router/docs/close-out.md (excerpts: Section 2 orchestrator
    check-in paragraph, Section 3 step 9 mention, Section 4
    stranded-check-out failure pattern) — UPDATED.
  - docs/ai-led-session-workflow.md (excerpt: new "Orchestrator
    check-out / check-in (Set 033)" subsection + Switching
    Orchestrators Between Sessions pointer) — UPDATED.
  - docs/cross-repo-checkout-notice.md — NEW. One-time copy source
    for the three consumer repos' CLAUDE.md files.
  - docs/session-sets/033-orchestrator-checkout-checkin-implementation/change-log.md
    — NEW. Final-session aggregation across S1-S6.
  - pyproject.toml + ai_router/CHANGELOG.md (0.6.0 entry) — version
    bump for the PyPI release.
  - tools/dabbler-ai-orchestration/package.json + CHANGELOG.md
    (0.18.0 entry) — version bump for the Marketplace release.
  - CLAUDE.md (excerpt: version walk) — UPDATED.

Ground truth bundled alongside:

  - Set 033 spec.md Session 6 — the contract this session closes.
  - The H1 + H3 + OQ2 verdicts (§9 of proposal-addendum.md).

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
PROPOSAL_DIR = (
    REPO_ROOT / "docs" / "proposals" / "2026-05-19-orchestrator-tracking-architecture"
)


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
Set 033 implements the orchestrator check-out / check-in migration
from the six verdicts the Set 032 audit locked.

Sessions 1-5 (CLOSED, summarized in disposition.json + activity-log):

  - S1 — start_session writer side: orchestrator block on
    session-state.json is the authoritative check-out record;
    start_session enforces H3 hard coordination + --force override;
    +2 nested timestamps (checkedOutAt + lastActivityAt) per OQ1.
  - S2 — TypeScript reader migration: per-set marker
    (.dabbler/orchestrator.json) retired (H2);
    resolveActiveSet -> listInProgressSets; tree provider renders
    N in-progress accordions; banner removed.
  - S3 — UI affordance migration (H1): hooks become invokers;
    dabbler.setOrchestrator renamed to dabbler.checkOutOrchestrator;
    new dabbler.releaseCheckOut Command Palette action.
  - S4 — Layer-3 Playwright coverage: 4 passing scenarios across
    the H3+H4 contract.
  - S5 — Queueing/polling: CheckoutPollService consumes JSON
    sentinels emitted by the invokers on EXIT_CHECKOUT_CONFLICT;
    Poll / Force / Dismiss UX; H4 identity gate on retry;
    configurable timeout default 30 min.

Session 6 (THIS verification) closes the migration:

  - Writer: _flip_state_to_closed now clears the orchestrator block
    on every successful close. The session boundary IS the release
    point. Idempotent (already-null = same write). Same code path
    serves Full tier (close_session) and Lightweight tier (humans
    follow the same rule by hand).
  - Tests: three new direct tests in
    test_close_session_snapshot_flip.py (final clear, mid-set
    clear, tier-agnostic direct-helper) + updated post-close
    invariant in test_happy_3session.py.
  - Docs: docs/session-state-schema.md "Check-out / check-in
    (Set 033)" section refined for tier symmetry + idempotence +
    OQ2 alias names + stranded-checkout recovery;
    ai_router/docs/close-out.md gets a Section 2 paragraph +
    Section 3 step 9 mention + Section 4 stranded-check-out
    failure pattern; docs/ai-led-session-workflow.md gets a new
    "Orchestrator check-out / check-in (Set 033)" subsection.
  - Cross-repo: docs/cross-repo-checkout-notice.md is the one-time
    copy source for the three consumer repos' CLAUDE.md files.
  - Release: pyproject.toml + ai_router/CHANGELOG.md flip to 0.6.0;
    package.json + tools/CHANGELOG.md flip to 0.18.0; CLAUDE.md
    version walk updated. Both pushes are operator-gated per the
    v0.17.x Marketplace pattern.

The full ai_router test suite passes (643 + 1 skipped) including
the three new tests and the updated e2e assertion.
""".strip()


FOCUS_PROMPT = """
ROUND A — Session 6 implementation faithfulness for the cross-tier
close-out check-in + canonical doc updates.

You are Gemini Pro, asked to verify that Session 6 of Set 033 ships
a correct, idempotent, tier-symmetric check-in on close-out plus
canonical doc updates that match the spec.

Verify:

A. **Writer-side check-in is correct.**

   1. _flip_state_to_closed sets state["orchestrator"] = None
      unconditionally just before the snapshot file write. The
      assignment happens AFTER the conditional forceClosed write
      (so a forced close still clears the block) and BEFORE the
      json.dump call (so the cleared value lands on disk).
   2. The clear applies to BOTH branches the writer takes:
      mid-set close (status stays in-progress; sessions[] reflects
      a per-session close) and final close (status flips to
      complete; lifecycleState flips to closed). Confirm no branch
      omits the clear.
   3. Idempotence: a state file where orchestrator is already None
      reaches the assignment and re-writes None -> None. No
      exception is raised, no second close-out event is emitted,
      and the gate path returns "succeeded".
   4. Tier symmetry: _flip_state_to_closed is the SHARED writer
      path for Full and Lightweight close-outs. Confirm no
      conditional that would skip the clear on a Lightweight-
      shaped fixture (e.g., absence of an events ledger, manual
      completedSessions[]).

B. **Tests pin the new contract correctly.**

   1. test_close_session_clears_orchestrator_block_on_final_close
      asserts the block is None AFTER the final close via the
      gate-running close_session.run() — not by calling
      _flip_state_to_closed directly. This catches a regression
      where the gate path could short-circuit the writer.
   2. test_close_session_clears_orchestrator_block_on_mid_set_close
      asserts the block is None AFTER a mid-set close (no
      change-log.md; SET stays in-progress; SESSION clears the
      block). Confirms the release is per-session, not per-set.
   3. test_close_session_orchestrator_clear_is_idempotent_tier_agnostic
      directly invokes _flip_state_to_closed on a synthetic state
      file (no gates, no events ledger plumbing) in two cases:
      block populated (asserts cleared) and block already None
      (asserts the no-op write lands cleanly). Verify the second
      case actually exercises the writer (the file is written,
      not skipped) — a subtle correctness check.
   4. test_happy_3session_full_cycle's updated assertion now reads
      state.get("orchestrator") is None after each close iteration
      AND the next iteration's start_session repopulates the block
      (the existing _assert_in_flight_snapshot helper covers this).

C. **Schema doc matches the writer behavior.**

   1. The Block-null invariant text says the block is cleared on
      EVERY close (mid-set and final) and is idempotent. It says
      tier-symmetrically: writer does it on Full; human does it on
      Lightweight at the same boundary. No claim that conflicts
      with the writer behavior in (A).
   2. The OQ2 documentation-alias text names
      `work_checked_out` ↔ `work_started` and
      `work_checked_in` ↔ `closeout_succeeded` explicitly. It
      says the ledger event names are unchanged (no schema break).
   3. The Stranded-checkout recovery subsection names both release
      paths: `start_session --force` AND the "Release Check-Out"
      Command Palette action. Both append to
      `~/.dabbler/orchestrator-writer.log`. Neither alters the
      events ledger.

D. **Close-out doc matches the writer behavior.**

   1. Section 2's new "Orchestrator check-in" paragraph says
      close_session clears the block on every successful close,
      idempotent, cross-tier. It points at the schema doc's
      "Check-out / check-in (Set 033)" section. It is in the body
      of Section 2 (the section close_session --help echoes
      verbatim), not buried elsewhere.
   2. Section 3 step 9 (mark_session_complete bullet) says the
      flip also clears the orchestrator block. The wording does
      not promise event emission for the clear (per OQ2 — no
      schema change).
   3. Section 4's new "Stranded check-out" failure pattern names
      the two recovery paths and notes that close_session never
      fires for a stranded set (the H3 refusal hits at the next
      start_session, not at close-out). The recovery paragraph
      says a returning original holder is a fresh check-out (no
      special reclaim path).

E. **Workflow doc matches the writer behavior.**

   1. The new "Orchestrator check-out / check-in (Set 033)"
      subsection codifies BOTH invariants: within-set sequential
      (at most one in-progress session per set) AND across-set
      parallel (different sets can each have their own in-progress
      session). Force-override is named as the one explicit
      deviation.
   2. The H4 identity rule says `engine + provider` composite
      (NOT engine alone, NOT engine+provider+model).
   3. Tier symmetry is stated explicitly: Full-tier writer does
      it automatically; Lightweight humans write
      `orchestrator: null` by hand at the same boundary.
   4. The "Switching Orchestrators Between Sessions" section
      points at the new subsection so the two surfaces don't
      drift.

F. **Cross-repo notice is self-contained.**

   1. The pastable snippet between the horizontal-rule lines is
      self-contained: it references the dabbler-ai-orchestration
      repo URLs absolutely (not via relative paths the consumer
      repo wouldn't resolve). It mentions all three consumer
      repos by name in the audience list.
   2. The snippet names the new versions (`dabbler-ai-router
      0.6.0`, `dabbler-ai-orchestration 0.18.0`) so a paster can
      verify their consumer has compatible deps.
   3. The Lightweight-tier caveat in the "Notes for the paster"
      section names dabbler-homehealthcare-accessdb explicitly
      and clarifies the Wait-and-retry / Poll-for-release line
      remains accurate but applies to Full-tier orchestrators.

G. **Version bumps + CHANGELOG entries are consistent.**

   1. pyproject.toml version is "0.6.0" (was 0.5.1) — a minor
      bump for a feature release.
   2. ai_router/CHANGELOG.md 0.6.0 entry: Added section names the
      writer change + nested timestamps + cross-tier check-in
      with idempotence. Changed section names H4 holder identity
      + OQ2 aliases. Migration section names the pre-0.6.0
      in-flight-set tolerance + stranded-checkout recovery.
   3. tools/dabbler-ai-orchestration/package.json version is
      "0.18.0" (was 0.17.1) — minor bump for the migration
      shipping across all six sessions.
   4. tools/dabbler-ai-orchestration/CHANGELOG.md 0.18.0 entry
      covers the user-facing surface: command rename, new
      releaseCheckOut command, multi-in-progress rendering, the
      polling/queueing service, marker retirement, the layer-3
      coverage, the consumer-repo migration step.
   5. CLAUDE.md "Extension versioning" section: 0.18.0 entry
      added to the version walk with the Set 033 migration
      summary; "Current" line bumped from 0.17.1 to 0.18.0;
      mentions the companion 0.6.0 PyPI release.

H. **What's risky or missing.** Any edge case that would bite a
   real run?

   - The H3 refusal in start_session at S1 was added BEFORE S6's
     close-out check-in shipped. Was there ever a state-shape
     where an in-flight set's orchestrator block held a stale
     identity (e.g., crashed mid-S5 verifier) that the S6
     close-out path would be asked to operate on? The idempotent
     null-on-null clear should handle it, but verify.
   - If a future writer path adds another _flip_state_to_closed
     callsite (e.g., a hypothetical "force-recover" CLI), the
     clear-on-write semantics propagate automatically. Worth
     a one-line comment in the writer pointing future authors at
     the Session 6 reasoning? (Existing comment is good but could
     be more emphatic about "every write through this path".)
   - The cross-repo notice's GitHub URLs target `master`. If the
     consumer repos pin against a specific tag, the paster's
     adjustment notes cover the per-consumer case — but verify
     the doc-link strategy is defensible vs. embedding the
     prose directly in the consumer repos.
   - The change-log.md aggregates 6 sessions; per the
     change_log_fresh close-out gate, the file must be present
     BEFORE close_session runs. Verify the change-log is
     committed before the final pre-close commit (else the gate
     fails on the final close).
   - The 0.18.0 CHANGELOG entry mentions "Cross-tier
     close_session check-in shipped in companion
     `dabbler-ai-router 0.6.0`". Verify that statement is
     internally consistent — i.e., the extension itself does NOT
     call close_session; the writer in the router is the sole
     surface. The extension's role is the H1+H3+H4 user-facing
     side; the check-in is a writer-side feature consumed
     transparently.
   - Verification round budgeting: the operator's NTE for this
     set is $1.25; Round A on S5 cost $0.032; cumulative Set 033
     spend was ~$0.165 entering S6. Round A on S6 is within
     budget. If you flag a must-fix, Round B is forecast at
     $0.05-$0.15.

Format the verdict as:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes.)
  - REJECTED: <bulleted list of must-fix issues>.

Cite specific quoted phrases / file:line references when flagging
issues; skip stylistic nits. Session 6 is the close of Set 033 — a
must-fix here blocks the dual-registry publish, which is
operator-gated and already queued behind your verdict.
""".strip()


def _bundle() -> str:
    parts = [
        # Primary deliverable — writer change.
        read_section(
            REPO_ROOT / "ai_router" / "session_state.py",
            "def _flip_state_to_closed(",
            "\n\ndef mark_session_complete(",
        ),
        # New tests — full section.
        read_section(
            REPO_ROOT / "ai_router" / "tests" / "test_close_session_snapshot_flip.py",
            "# Set 033 Session 6 — cross-tier orchestrator check-in",
        ),
        # Updated e2e assertion — full section.
        read_section(
            REPO_ROOT / "ai_router" / "tests" / "e2e" / "test_happy_3session.py",
            "# Full state-invariant bundle. Set 030 Session 2 dual-write",
            "        if not is_final:",
        ),
        # Schema doc — full Check-out / check-in section.
        read_section(
            REPO_ROOT / "docs" / "session-state-schema.md",
            "### Check-out / check-in (Set 033)",
            "### Dual-write legacy fields",
        ),
        # Close-out doc — Section 2 paragraph.
        read_section(
            REPO_ROOT / "ai_router" / "docs" / "close-out.md",
            "Orchestrator check-in (Set 033 Session 6).",
            "---\n\n## Section 3",
        ),
        # Close-out doc — Section 3 step 9 update.
        read_section(
            REPO_ROOT / "ai_router" / "docs" / "close-out.md",
            "9. **Idempotent writes.**",
            "10. **Emit",
        ),
        # Close-out doc — Section 4 stranded check-out.
        read_section(
            REPO_ROOT / "ai_router" / "docs" / "close-out.md",
            "**Stranded check-out (Set 033 Session 6).**",
            "\n\n---\n\n## Section 5",
        ),
        # Workflow doc — new subsection.
        read_section(
            REPO_ROOT / "docs" / "ai-led-session-workflow.md",
            "### Orchestrator check-out / check-in (Set 033)",
            "### Cancelling and restoring",
        ),
        # Workflow doc — Switching Orchestrators pointer.
        read_section(
            REPO_ROOT / "docs" / "ai-led-session-workflow.md",
            "### Switching Orchestrators Between Sessions",
            "---\n\n## AI Router Details",
        ),
        # New file: cross-repo notice.
        read_file(REPO_ROOT / "docs" / "cross-repo-checkout-notice.md"),
        # New file: Set 033 change-log.
        read_file(SET_DIR / "change-log.md"),
        # Version bumps.
        read_section(
            REPO_ROOT / "pyproject.toml",
            'name = "dabbler-ai-router"',
            "description =",
        ),
        read_section(
            EXT_ROOT / "package.json",
            '"name": "dabbler-ai-orchestration"',
            '"publisher":',
        ),
        # Router CHANGELOG 0.6.0 entry.
        read_section(
            REPO_ROOT / "ai_router" / "CHANGELOG.md",
            "## [0.6.0]",
            "## [0.5.1]",
        ),
        # Extension CHANGELOG 0.18.0 entry.
        read_section(
            EXT_ROOT / "CHANGELOG.md",
            "## [0.18.0]",
            "## [0.17.1]",
        ),
        # Top-level CLAUDE.md version walk.
        read_section(
            REPO_ROOT / "CLAUDE.md",
            "## Extension versioning",
            "- Publisher: `DarndestDabbler`",
        ),
        # Ground truth — Session 6 spec contract.
        read_section(
            SET_DIR / "spec.md",
            "## Session 6 of 6:",
            "---\n\n## Risks",
        ),
        # Ground truth — locked verdicts §9.
        read_section(
            PROPOSAL_DIR / "proposal-addendum.md",
            "## 9. Audit resolution (Set 032 Session 1, 2026-05-19)",
            "## Round-2 questions (HISTORICAL — superseded by §9)",
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
        session_set="033-orchestrator-checkout-checkin-implementation",
        session_number=6,
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
        print("Usage: python verify_session6.py round-a [round-b]", file=sys.stderr)
        sys.exit(2)

    sub = sys.argv[1]
    bundle = _bundle()
    print(f"Bundle size: {len(bundle):,} chars")
    if sub == "round-a":
        run_round(
            "Round A",
            bundle,
            FOCUS_PROMPT,
            out_dir / "round-a-session-6-result.json",
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
            out_dir / "round-b-session-6-result.json",
        )
    else:
        print(f"Unknown subcommand: {sub}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
