"""One-shot cross-provider verification for Set 007 / Session 2.

Routes a session-verification task per the workflow's outsource-first
contract. The orchestrator is Claude (Anthropic); verification goes to
a non-Anthropic provider via route(task_type='session-verification').
Writes the verifier's response to stdout and saves it via SessionLog.

Set ROUND env var to control round number (default: 1). Round 2 is the
fix-issues follow-up after round 1 surfaced findings.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SESSION_SET = REPO_ROOT / "docs" / "session-sets" / "007-uniform-session-state-file"


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


def file_block(label: str, path: Path) -> str:
    if not path.exists():
        return f"### {label} ({path}) — MISSING\n"
    body = path.read_text(encoding="utf-8", errors="replace")
    return f"### {label} (`{path.relative_to(REPO_ROOT)}`)\n\n```\n{body}\n```\n"


def diff_block(label: str, path: str) -> str:
    try:
        out = subprocess.check_output(
            ["git", "diff", "HEAD", "--", path],
            cwd=str(REPO_ROOT),
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.CalledProcessError as exc:
        return f"### {label} ({path}) — diff failed: {exc}\n"
    return f"### {label} diff (`{path}`)\n\n```diff\n{out}\n```\n"


def build_bundle() -> str:
    spec_path = SESSION_SET / "spec.md"

    parts = []
    parts.append("## Spec\n\n" + file_block("spec.md", spec_path))

    parts.append("## Session 2 changes — Python\n\n")
    parts.append(diff_block("session_state.py", "ai_router/session_state.py"))
    parts.append(diff_block("session_log.py", "ai_router/session_log.py"))
    parts.append(diff_block("__init__.py", "ai_router/__init__.py"))
    parts.append(diff_block("reconciler.py", "ai_router/reconciler.py"))
    parts.append(diff_block("close_session.py", "ai_router/close_session.py"))
    parts.append(diff_block("session_events.py", "ai_router/session_events.py"))

    parts.append("## Session 2 changes — TypeScript\n\n")
    parts.append(file_block(
        "NEW: utils/sessionState.ts",
        REPO_ROOT / "tools" / "dabbler-ai-orchestration" / "src" / "utils" / "sessionState.ts",
    ))
    parts.append(diff_block(
        "utils/fileSystem.ts",
        "tools/dabbler-ai-orchestration/src/utils/fileSystem.ts",
    ))
    parts.append(diff_block(
        "test/suite/fileSystem.test.ts",
        "tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts",
    ))

    parts.append("## New Python tests\n\n")
    parts.append(file_block(
        "tests/test_read_status.py",
        REPO_ROOT / "ai_router" / "tests" / "test_read_status.py",
    ))

    parts.append("## Test results\n\n")
    parts.append(
        "- ai_router pytest: **647 passed** (627 baseline + 20 new in "
        "test_read_status.py)\n"
        "- TypeScript: `tsc --noEmit` clean, esbuild compile clean, eslint clean\n"
        "  (only pre-existing unrelated warning in providerHeartbeats.test.ts)\n"
    )

    return "\n".join(parts)


def main() -> int:
    ai_router = load_ai_router()
    round_num = int(os.environ.get("ROUND", "1"))

    bundle = build_bundle()

    bundle_path = Path(os.environ.get("BUNDLE_PATH", "C:/temp/session-007-2-bundle.txt"))
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    bundle_path.write_text(bundle, encoding="utf-8")
    print(f"[wrote bundle: {bundle_path}, {len(bundle)} chars]\n")

    context = (
        "Set 007 / Session 2 of `007-uniform-session-state-file`. The session's "
        "goal is to switch every reader from file-presence branching (change-log "
        "→ done; activity-log/state-file → in-progress; else → not-started) to "
        "reading the canonical `status` field of `session-state.json`, with a "
        "lazy-synthesis fallback for folders that slipped through Set 7 Session 1's "
        "backfill. The orchestrator is Claude. Spec at "
        "`docs/session-sets/007-uniform-session-state-file/spec.md`."
    )

    if round_num == 1:
        instructions = (
            "Verify Session 2's deliverables against the spec's 'Session 2: Reader "
            "collapses' section. Specifically:\n"
            "1. read_status() exists in session_state.py with the documented "
            "lazy-synth-on-absent and parse-error-propagation contracts.\n"
            "2. find_active_session_set, print_session_set_status, and the TS "
            "readSessionSets state detection are all collapsed to read `status` "
            "directly (no remaining file-presence branching as the primary signal).\n"
            "3. The TS readStatus helper exists and produces files structurally "
            "identical to Python's _not_started_payload (so concurrent synth from "
            "either side is benign).\n"
            "4. Tests cover the lazy-synth fallback and reader equivalence.\n"
            "5. Flag any reader the spec listed (current_lifecycle_state, close-out "
            "gate idempotency check, reconciler stranded sweep) that I did NOT "
            "collapse but should have, OR that I did collapse but shouldn't have.\n\n"
            "The orchestrator made one judgment call worth scrutinizing: the spec "
            "lists 'reconciler's stranded-session sweep' as a reader to collapse, "
            "but the orchestrator chose NOT to collapse it. The reasoning is in "
            "reconciler.py's diff (the events ledger is the authoritative truth "
            "source per the existing codebase comment 'the ledger is the truth'; "
            "adding read_status would either duplicate the events check or mask "
            "drift the reconciler exists to surface). Confirm or push back on this "
            "interpretation.\n\n"
            "The orchestrator made a second judgment call: pre-Set-7 sets 005 and "
            "006 carry `status: \"completed\"` (the -ed form, non-canonical) and "
            "`lifecycleState: \"verified\"`. The spec's backfill is explicit that "
            "drift is left untouched. Without canonicalization at the read boundary, "
            "every consumer that switches to read_status would regress on these "
            "files. The orchestrator added `_STATUS_ALIASES = {\"completed\": "
            "\"complete\", \"done\": \"complete\"}` to canonicalize on read. "
            "Evaluate whether this is the right placement (read-boundary vs. a "
            "one-shot file rewrite vs. fix-the-writer-and-leave-readers-strict)."
        )
    elif round_num == 2:
        instructions = (
            "Round 2: confirm the round-1 findings have been addressed. "
            "Round-1 findings (from session-reviews/session-002.md):\n\n"
            "  (1) read_status absent-branch contract hole — the post-synthesis "
            "re-read bypassed canonicalize/validate; could leak raw aliased "
            "values or raise KeyError instead of ValueError under a race.\n"
            "  (2) print_session_set_status / contradictory-fixture / TS-Py "
            "parity test gaps.\n"
            "  (3) current_lifecycle_state and close-out gate idempotency: spec "
            "listed them as collapse targets; orchestrator should either "
            "collapse them or document why the collapse is a no-op.\n"
            "  (4) Reconciler exemption: agreed with the orchestrator's call but "
            "wanted it documented.\n"
            "  (_) Aliases placement at the read boundary was confirmed correct.\n\n"
            "Verify the fixes:\n\n"
            "  - For (1): a private `_load_canonical_status` helper now funnels "
            "both branches of read_status (and same in TS via `loadCanonicalStatus`). "
            "Two new tests prove the post-synthesis branch canonicalizes aliased "
            "values and raises ValueError on missing-status (race-injection via "
            "monkeypatched synthesizer).\n"
            "  - For (2): added `test_print_session_set_status_uses_status_field` "
            "with three contradictory fixtures (activity-log + complete → done; "
            "change-log + in-progress → in-progress; spec-only → lazy-synth → "
            "not-started). Added two TS contradictory-fixture tests in "
            "fileSystem.test.ts. TS-Py parity is still a code-review surface "
            "(no automated parity test) — the orchestrator chose not to add "
            "one because the test runner can't load both Python and TS in the "
            "same harness without significant infrastructure; called out in "
            "the activity log.\n"
            "  - For (3): documented the no-op collapse in code (close_session.py "
            "`_is_already_closed` and session_events.py `current_lifecycle_state`) "
            "with explicit Set-7-Session-2 notes explaining that these readers "
            "operate on the events ledger, not coarse status, so there is "
            "nothing to remove.\n"
            "  - For (4): documented the reconciler exemption inline in "
            "reconciler.py's `_evaluate_one`.\n\n"
            "Look for: any of these fixes that didn't actually land, any new "
            "regressions introduced by the fixes, and any other issues you'd "
            "block close-out on. The orchestrator considers TS-Py parity testing "
            "and the (deferred to Session 3) workflow-doc updates as out of "
            "scope for this round; flag if you disagree."
        )
    else:
        instructions = (
            "Round 3: confirm the round-2 findings have been addressed.\n\n"
            "Round-2 findings (from session-reviews/session-002.md):\n\n"
            "  (R2-1) Lazy-synth fallback misclassified legacy folders. The "
            "earlier read_status absent-branch always wrote the not-started "
            "shape, so a legacy folder with change-log.md (or activity-log.json) "
            "but no session-state.json was being regressed to not-started "
            "instead of complete (or in-progress).\n"
            "  (R2-2) Round-1 finding (3) — close_session.py and "
            "session_events.py no-op-collapse documentation — wasn't visible "
            "in the bundle, so couldn't be verified.\n\n"
            "Verify the fixes:\n\n"
            "  - For (R2-1): a new `ensure_session_state_file` helper "
            "(Python) and `ensureSessionStateFile` (TS) routes the "
            "lazy-synth path through the same `_backfill_payload` / "
            "`backfillPayload` inference rules used by the one-shot "
            "backfill — change-log → complete, activity-log → in-progress, "
            "neither → not-started. read_status now uses ensure_* not "
            "synthesize_not_started_state. New tests "
            "(test_lazy_synth_classifies_legacy_changelog_as_complete, "
            "test_lazy_synth_classifies_legacy_activity_log_as_in_progress, "
            "and TS counterparts in fileSystem.test.ts) lock the behavior in.\n"
            "  - For (R2-2): close_session.py and session_events.py diffs "
            "are now included in this bundle. Confirm the no-op-collapse "
            "docstrings landed and the rationale (events ledger as "
            "authoritative source for the close-out gate's idempotency and "
            "current_lifecycle_state) is correctly explained.\n\n"
            "Look for any of these fixes that didn't actually land, any new "
            "regressions (notably: synthesize_not_started_state is still the "
            "right entry point for the genuine not-started case — verify "
            "register_session_start hasn't been redirected through the "
            "ensure_* helper), and anything else worth blocking close-out on."
        )

    full_prompt = (
        f"{context}\n\n{instructions}\n\n## Bundle\n\n{bundle}"
    )

    result = ai_router.route(
        content=full_prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SESSION_SET),
        session_number=2,
    )

    print("=" * 70)
    print("VERIFIER OUTPUT")
    print("=" * 70)
    print(result.content)
    print()
    print("=" * 70)
    print(f"cost_usd: {result.total_cost_usd}")

    # Save the review.
    sys.path.insert(0, str(REPO_ROOT / "ai_router"))
    from session_log import SessionLog  # noqa: E402

    log = SessionLog(str(SESSION_SET))
    log.save_session_review(
        session_number=2,
        review_text=result.content,
        round_number=round_num,
    )
    print(f"\n[saved review: session-002.md, round {round_num}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
