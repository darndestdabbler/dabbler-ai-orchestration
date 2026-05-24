"""Cross-provider verification for Set 036 Session 7.

Verifies the final-session release artifacts: change-log aggregation,
version bumps, CHANGELOG entries, CLAUDE.md walk extension. Scope:

  * NEW final-session change-log:
    * `docs/session-sets/036-.../change-log.md` — aggregates all 7
      sessions per [[project_final_session_changelog_pre_close]]
      pattern. Header (status, created, cost, NTE, forecast vs
      actual), Context, per-session sections (Shipped + Verification),
      What ships across the framework, Risks closed, Follow-ups.

  * Version bumps:
    * `pyproject.toml` 0.6.0 → 0.7.0 (minor — feature release for
      chatSessionId + new_chat_id CLI + lifecycle lock + Q4 payload).
    * `tools/dabbler-ai-orchestration/package.json` 0.19.0 → 0.20.0
      (minor — feature release for takeover UX + watcher retirement
      + orchestrator-agnostic UI cleanup). Note: spec said
      "0.18.x → 0.19.0" but Set 034 already shipped 0.19.0 (verified
      in CHANGELOG.md), so this set bumps to 0.20.0 (documented).

  * CHANGELOG entries:
    * `ai_router/CHANGELOG.md` 0.7.0 entry — Added (chatSessionId
      field, --chat-session-id CLI arg, TTY takeover prompt + exit
      codes 5/6, new_chat_id CLI, per-set lifecycle lock,
      closeout_succeeded Q4 payload), Changed (H4 composite refined,
      refusal message, force-override audit log), Migration
      (tolerant-on-read, lock-file alias), Release notes.
    * `tools/dabbler-ai-orchestration/CHANGELOG.md` 0.20.0 entry —
      Added (modal, ReadOnlyIntentService, newChatIdWorkflowToast,
      watcherInventory test), Changed (CheckoutPollService schema +
      routing, checkOutOrchestrator mismatch routing, invoker
      session_id pass-through + H4 gating), Removed (Codex watcher,
      signalKind, orphan accordion source, indicator.css dir, tree.css
      trim), Migration, Internal.

  * `CLAUDE.md` Extension versioning walk:
    * Current bumped to v0.20.0 with full Set 036 summary.
    * 0.19.0 (Set 034) and 0.18.1 (Set 035) preserved in the walk.

Test posture: full sweep passed before this verification:
pytest 693+1, tsc --noEmit clean, npm test:unit 531+2 (same
pre-existing failures unchanged through the set),
npm test:playwright 24+2 (2 skipped are same pre-existing test.skip
notes).

PyPI release + Marketplace publish are operator-gated and fire after
this verification's verdict lands. close_session for S7 fires last.

Usage:
    python scripts/verify_session_036_7.py [--round A|B]
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import ai_router as ar  # type: ignore[import-not-found]


SESSION_CONTEXT = (
    "Set 036 Session 7 of 7 — Final tests + change-log + dual-\n"
    "registry release. Reference:\n"
    "docs/session-sets/036-chatsessionid-and-watcher-scope-implementation/\n"
    "spec.md (Session 7 section).\n\n"
    "Prerequisites (all CLOSED):\n"
    "  * Sessions 1-6 closed per session-state.json.\n"
    "  * Cumulative routed spend through S6 Round A: $3.4106 of $5\n"
    "    NTE (68% utilization); S7 verification + close fits inside\n"
    "    the $1.59 headroom.\n\n"
    "Audit-locked verdicts the release artifacts must reflect\n"
    "(cumulative across the set):\n"
    "  * H4 holder identity — `engine + provider + chatSessionId`\n"
    "    composite (Set 036 refinement of Set 033's `engine + provider`).\n"
    "  * Q1 chatSessionId source — Claude Code: SessionStart hook\n"
    "    payload's `session_id`; all others: new_chat_id CLI.\n"
    "  * Q3 Takeover UX — modal in IDE; CLI prompt at TTY; toast\n"
    "    secondary only.\n"
    "  * Q4 chatSessionId on close — cleared from session-state.json;\n"
    "    persisted in closeout_succeeded event payload alongside\n"
    "    engine + provider + (optional) model.\n"
    "  * Q5 Hybrid migration tolerance — explicit cross-process\n"
    "    serialization (per-set lifecycle lock; .lifecycle.lock).\n"
    "  * D1 Watcher-scope discipline — Codex config-toml watcher\n"
    "    RETIRED; signalKind enum + UI variants RETIRED.\n"
    "  * Q7 — watcher-inventory convention test enforces D1 at\n"
    "    code-review time.\n\n"
    "Set 034 (closed 2026-05-21) shipped extension 0.19.0 retiring\n"
    "the per-row accordion at the render surface; Set 036 S6 follows\n"
    "through by deleting the now-orphan source (OrchestratorAccordion.ts +\n"
    "detectOrchestrators.ts + media/orchestrator-indicator/) per the\n"
    "operator-locked YAGNI disposition.\n\n"
    "Test sweep results pre-verification:\n"
    "  * python -m pytest: 693 passed + 1 skipped\n"
    "  * npx tsc --noEmit: clean\n"
    "  * npm run test:unit: 531 passing + 2 pre-existing failures\n"
    "    (configEditor-foundation + notificationsSection scaffolding\n"
    "    gaps that have been carried through the whole set)\n"
    "  * npm run test:playwright: 24 passed + 2 skipped (same\n"
    "    pre-existing test.skip notes on releaseCheckOut + the\n"
    "    second-orchestrator-polls scenario)\n"
)


VERIFICATION_ASKS = (
    "Specific things to check:\n\n"
    "1. change-log.md aggregation accuracy:\n"
    "   * Each session 1-6 summary correctly reflects what the\n"
    "     activity-log + spec say shipped? Spot-check S1's per-set\n"
    "     lifecycle lock (`.lifecycle.lock` rename, dual-acquire,\n"
    "     EXIT_LOCK_CONTENTION=5), S4's takeover modal (three\n"
    "     buttons + Q6 REJECTED + Read-Only intent service), S6's\n"
    "     orphan-source deletion (496 LOC OrchestratorAccordion.ts +\n"
    "     137 LOC detectOrchestrators.ts + 8 tests).\n"
    "   * Verification verdicts cited match activity-log's\n"
    "     routedApiCalls (S1: gpt-5-4 Round A + Round B; S2: same;\n"
    "     S3: Round A only; S4: Round A + Round B, Round C skipped\n"
    "     due to 429; S5: opus Round A only after 429; S6: gemini-pro\n"
    "     Round A only).\n"
    "   * What ships across framework summary is complete (no\n"
    "     headline-level miss like 'forgot to mention TTY prompt or\n"
    "     read-only intent service')?\n"
    "   * Cost summary cites the right cumulative ($3.4106 through\n"
    "     S6) and acknowledges actual-over-forecast with the reason\n"
    "     (verifier surfacing real Major defects + opus fallback on\n"
    "     S5 429)?\n\n"
    "2. Version-bump correctness:\n"
    "   * pyproject.toml: 0.6.0 → 0.7.0 (minor for feature release\n"
    "     is the right semver call)?\n"
    "   * tools/dabbler-ai-orchestration/package.json: 0.19.0 →\n"
    "     0.20.0 (NOT 0.19.0 as spec said — Set 034 already shipped\n"
    "     0.19.0). The change-log + CHANGELOG entries both document\n"
    "     this divergence.\n"
    "   * Cross-link: ai_router/CHANGELOG.md 0.7.0 cites companion\n"
    "     Marketplace `0.20.0`; extension CHANGELOG.md 0.20.0 cites\n"
    "     companion PyPI `0.7.0`. Both should be present and\n"
    "     correctly named.\n\n"
    "3. ai_router/CHANGELOG.md 0.7.0 entry:\n"
    "   * Added section enumerates: chatSessionId field on\n"
    "     orchestrator block; --chat-session-id CLI arg; TTY\n"
    "     takeover prompt + EXIT_LOCK_CONTENTION=5 + EXIT_READ_ONLY=6\n"
    "     exit codes; new_chat_id CLI (UUID v4, --export, --shell,\n"
    "     idempotency); per-set lifecycle lock (.lifecycle.lock,\n"
    "     dual-acquire, legacy alias); closeout_succeeded Q4 payload\n"
    "     extension (snapshot before clear, legacy degradation).\n"
    "   * Changed section: H4 composite refinement, refusal message,\n"
    "     force-override audit log.\n"
    "   * Migration section: tolerant-on-read for pre-0.7.0 state\n"
    "     files, lock-file alias contract.\n"
    "   * Release notes: no breaking changes for non-block readers,\n"
    "     schema v3 unchanged.\n\n"
    "4. tools/dabbler-ai-orchestration/CHANGELOG.md 0.20.0 entry:\n"
    "   * Added section: chatSessionMismatchModal.ts (three buttons,\n"
    "     surfaces from CheckoutPollService AND manual checkOutOrchestrator\n"
    "     via maybeShowChatSessionMismatchOnManualCheckout);\n"
    "     ReadOnlyIntentService.ts (in-memory map, transient, Q6\n"
    "     REJECTED rationale); newChatIdWorkflowToast.ts (three\n"
    "     shells); watcherInventory.test.ts (Q7).\n"
    "   * Changed section: CheckoutPollService extension (ConflictRecord\n"
    "     schema, isChatSessionMismatch, handleChatSessionMismatch,\n"
    "     pollKey + isSlotFreeForHolder updates); manual checkout\n"
    "     command routing; Claude SessionStart invoker session_id\n"
    "     extraction + preserveExistingClaude H4 gating.\n"
    "   * Removed section: Codex config-toml watcher (entire\n"
    "     src/codex/ directory); signalKind enum + UI variants;\n"
    "     orphan source from Set 034 retirement (OrchestratorAccordion.ts\n"
    "     + detectOrchestrators.ts + test); media/orchestrator-indicator/\n"
    "     directory; tree.css trimming.\n"
    "   * Migration + Internal sections present.\n\n"
    "5. CLAUDE.md Extension versioning walk:\n"
    "   * Current bumped from v0.19.0 (Set 034) to v0.20.0 (Set 036)\n"
    "     with a full Set 036 summary (chatSessionId refinement,\n"
    "     new_chat_id CLI, takeover modal, lifecycle lock, Codex\n"
    "     watcher retired, signalKind retired, orphan source\n"
    "     deleted, watcher inventory).\n"
    "   * The v0.19.0 (Set 034) entry is preserved in the walk\n"
    "     under the new Current.\n"
    "   * The v0.18.1 (Set 035) entry is preserved in the walk.\n"
    "   * Companion PyPI 0.7.0 cited.\n\n"
    "6. Out-of-scope check: S7 should only touch release artifacts.\n"
    "   * Expected diff: pyproject.toml + ai_router/CHANGELOG.md +\n"
    "     tools/.../package.json + tools/.../CHANGELOG.md + CLAUDE.md\n"
    "     + new change-log.md + activity-log/state-file/events-ledger.\n"
    "   * No source / test / spec changes (those were S1-S6 scope).\n"
    "   * No verification-output dump in the diff (it lands when\n"
    "     this verification runs).\n\n"
    "7. Cross-tier release alignment:\n"
    "   * Both registries' entries cite each other's version (0.7.0\n"
    "     ↔ 0.20.0). The cross-repo notice at\n"
    "     docs/cross-repo-checkout-notice.md was updated in S5 to\n"
    "     reference these versions in advance; if that pre-S5 update\n"
    "     said 0.19.0 anywhere instead of 0.20.0 it needs a follow-on\n"
    "     edit.\n\n"
    "If you find no substantive issues, say VERIFIED. Otherwise list\n"
    "each finding with severity (Blocker / Major / Minor) and\n"
    "file:line references — Round B fires if Blocker or Major."
)


def _git_diff(path: str) -> str:
    proc = subprocess.run(
        ["git", "diff", "HEAD", "--", path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.stdout


def _read(rel: str) -> str:
    return (REPO_ROOT / rel).read_text("utf-8")


def _run_round(label: str, bundle: str, asks: str, round_letter: str) -> dict:
    context = f"{SESSION_CONTEXT}\n\n{asks}"
    content = (
        f"Review the following Session 7 work ({label}) against the\n"
        f"criteria above. Be specific about file paths and line numbers.\n\n"
        f"{bundle}"
    )
    # task_type="verification" + complexity_hint=55 → tier 2 → gemini-pro
    # per the Set 036 S5+S6 precedent (the session-verification task
    # type is hard-pinned to gpt-5-4 in router-config.yaml's
    # task_type_overrides; the OpenAI 429 cascade made tier-routed
    # verification the working pattern for the rest of the set).
    result = ar.route(
        content=content,
        task_type="verification",
        complexity_hint=55,
        context=context,
        session_set="036-chatsessionid-and-watcher-scope-implementation",
        session_number=7,
    )
    dump_path = (
        REPO_ROOT
        / "docs"
        / "session-sets"
        / "036-chatsessionid-and-watcher-scope-implementation"
        / "verification-output"
        / f"round-{round_letter.lower()}-session-7-result.json"
    )
    dump_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        as_dict = dataclasses.asdict(result)
    except TypeError:
        as_dict = {k: v for k, v in vars(result).items()}
    cleaned: dict = {}
    for k, v in as_dict.items():
        try:
            json.dumps(v)
            cleaned[k] = v
        except TypeError:
            cleaned[k] = repr(v)
    dump_path.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"  Dumped to {dump_path.relative_to(REPO_ROOT)}")
    data = json.loads(dump_path.read_text(encoding="utf-8"))
    print("  === VERIFIER RESPONSE ===")
    content_text = data.get("content", "<no content>")
    # Windows console is cp1252; emit ASCII-safe replacement for any
    # non-encodable characters in the verifier's prose (checkmarks,
    # arrows, etc.) so the print does not crash.
    sys.stdout.write(
        content_text.encode("ascii", errors="replace").decode("ascii")
    )
    sys.stdout.write("\n\n")
    sys.stdout.write(
        f"  model={data.get('model_name')} "
        f"input_tokens={data.get('input_tokens')} "
        f"output_tokens={data.get('output_tokens')} "
        f"cost_usd={data.get('total_cost_usd')}\n"
    )
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", choices=["A", "B"], default="A")
    args = parser.parse_args()

    # New full file: change-log.md is all-new content.
    change_log = _read(
        "docs/session-sets/036-chatsessionid-and-watcher-scope-implementation/change-log.md"
    )

    # Modified files: git-diff hunks keep the bundle compact while
    # surfacing the new entries in context.
    diff_pyproject = _git_diff("pyproject.toml")
    diff_router_changelog = _git_diff("ai_router/CHANGELOG.md")
    diff_pkg = _git_diff("tools/dabbler-ai-orchestration/package.json")
    diff_ext_changelog = _git_diff("tools/dabbler-ai-orchestration/CHANGELOG.md")
    diff_claude_md = _git_diff("CLAUDE.md")

    if args.round == "A":
        label = "Round A: release artifacts bundle"
        bundle = (
            f"=== NEW docs/session-sets/036-.../change-log.md ===\n"
            f"{change_log}\n\n"
            f"=== git diff pyproject.toml ===\n"
            f"{diff_pyproject}\n\n"
            f"=== git diff ai_router/CHANGELOG.md ===\n"
            f"{diff_router_changelog}\n\n"
            f"=== git diff tools/dabbler-ai-orchestration/package.json ===\n"
            f"{diff_pkg}\n\n"
            f"=== git diff tools/dabbler-ai-orchestration/CHANGELOG.md ===\n"
            f"{diff_ext_changelog}\n\n"
            f"=== git diff CLAUDE.md ===\n"
            f"{diff_claude_md}\n"
        )
        asks = VERIFICATION_ASKS
    else:
        # Round B template — populated only if Round A surfaces
        # must-fix items requiring a re-verify.
        label = "Round B: re-verify after Round A must-fix changes"
        bundle = (
            f"=== NEW docs/session-sets/036-.../change-log.md (post-Round-A) ===\n"
            f"{change_log}\n\n"
            f"=== git diff pyproject.toml (post-Round-A) ===\n"
            f"{diff_pyproject}\n\n"
            f"=== git diff ai_router/CHANGELOG.md (post-Round-A) ===\n"
            f"{diff_router_changelog}\n\n"
            f"=== git diff tools/dabbler-ai-orchestration/package.json (post-Round-A) ===\n"
            f"{diff_pkg}\n\n"
            f"=== git diff tools/dabbler-ai-orchestration/CHANGELOG.md (post-Round-A) ===\n"
            f"{diff_ext_changelog}\n\n"
            f"=== git diff CLAUDE.md (post-Round-A) ===\n"
            f"{diff_claude_md}\n"
        )
        asks = (
            "Round B: confirm the Round A findings are addressed.\n"
            "List any net-new issues only — do NOT re-litigate Round\n"
            "A findings themselves."
        )

    print(f"Running {label} ...")
    _run_round(label, bundle, asks, args.round)
    return 0


if __name__ == "__main__":
    sys.exit(main())
