"""Session 3 verification driver — Set 030.

Round A focuses on the highest-risk reader-migration changes:

  - ai_router/progress.py — the new `read_progress` wrapper that
    every application reader now goes through.
  - ai_router/gate_checks.py — three close-out gate predicates
    migrated from direct legacy reads to `read_progress`.
  - tools/.../utils/fileSystem.ts — `isMidSetComplete` rewritten
    around the v3 invariant probe, plus the `readSessionSets`
    state-file block migrated through `readProgress` (and the new
    `readClosedSessionsFromLedger` v2-compat helper).
  - tools/.../utils/sessionState.ts — TS lazy-synth writers updated
    to emit v3 sessions[] (mirroring Session 2's Python writer
    changes so the snapshot satisfies invariants after lazy-synth).

Per memory ``feedback_split_large_verification_bundles``, the bundle
is kept focused (~450 LOC across 4 files). Lower-risk changes — the
SessionSetsProvider label renames, the `_peek_session_number` migration
in close_session.py, the start_session.py preflight migration, the
D13 lint tests, the cost-report read in __init__.py, and the
SessionState `done`->`complete` type rename — are excluded from the
bundle but listed in the system summary so the verifier knows the
broader scope.

Per memory ``feedback_ai_router_route_result_handling``, the
RouteResult is dumped to JSON before any attribute access — past
sessions lost $0.34 on wrapper-crash bugs from direct field access.

Round A uses task_type='session-verification' which router-config
pins to gpt-5-4 (cross-provider verifier for a Claude orchestrator).
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


def read_lines(path, ranges):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    rel = path.relative_to(REPO_ROOT).as_posix()
    chunks = []
    for start, end in ranges:
        section = "\n".join(
            f"{i+1:>5}  {lines[i]}" for i in range(start - 1, min(end, len(lines)))
        )
        chunks.append(
            f"--- {rel} lines {start}-{min(end, len(lines))} ---\n{section}"
        )
    total_lines = sum(min(e, len(lines)) - s + 1 for s, e in ranges)
    return (
        f"=== FILE: {rel} ({total_lines} LOC across {len(ranges)} slice(s)) ===\n"
        + "\n\n".join(chunks)
    )


def dump_route_result_to_json(result) -> dict:
    if dataclasses.is_dataclass(result):
        return dataclasses.asdict(result)
    if hasattr(result, "__dict__"):
        return {k: v for k, v in result.__dict__.items()}
    return {"_repr": repr(result)}


def run_round(label, system_summary, code_block, focus_prompt, out_path):
    print(f"\n{'='*60}\n[{label}] sending verification call...\n{'='*60}")
    result = ai_router.route(
        content=focus_prompt,
        task_type="session-verification",
        context=f"{system_summary}\n\n--- FILES ---\n{code_block}",
        session_set="030-session-state-v3-sessions-ledger",
        session_number=3,
    )
    dumped = dump_route_result_to_json(result)
    out_path.write_text(json.dumps(dumped, default=str, indent=2), encoding="utf-8")
    cost = dumped.get("cost_usd") or dumped.get("cost") or "?"
    model = dumped.get("model") or dumped.get("model_name") or "?"
    tokens = (
        f"in={dumped.get('input_tokens', '?')}, out={dumped.get('output_tokens', '?')}"
    )
    print(f"[{label}] model={model} cost=${cost} tokens={tokens}")
    print(f"[{label}] full response saved to: {out_path}")
    text = dumped.get("response") or dumped.get("text") or dumped.get("content")
    if isinstance(text, str):
        print(f"\n--- [{label}] VERIFIER OUTPUT ---\n{text}\n--- end [{label}] ---")
    return dumped


SYSTEM_SUMMARY = """
Set 030 Session 3 migrates every application reader from direct
legacy-field access (currentSession / totalSessions /
completedSessions) to the v3 `read_progress` / `readProgress` helper
established in Session 1. Per spec D13: "No application reader may
read legacy fields except through approved compatibility helpers."

Scope of Session 3 (the verification bundle below contains the
highest-risk subset, listed first; the rest is summarized for
context):

VERIFIED IN THIS BUNDLE (~450 LOC):

1. **ai_router/progress.py** — new `read_progress(state, spec_md_path)`
   wrapper. Dispatches to `get_progress(state)` for v3 inputs (state
   has `sessions[]`) or to `get_progress(synthesize_v3_from_v2(...))`
   for v2 inputs. Raises SessionStateInvariantError on invariant
   violation. The canonical reader entry point per D13.

2. **ai_router/gate_checks.py** — three close-out gates migrated:
   - check_activity_log_entry
   - check_next_orchestrator_present
   - check_change_log_fresh
   Each uses two new helpers added to gate_checks.py:
   - `_read_progress_or_none(state, dir)` → wraps read_progress with
     try/except, returns (view, error_remediation); exactly one is
     non-None.
   - `_session_in_focus(view)` → returns the in-flight session number
     OR (idempotent-retry case) max(completedSessions). Mirrors the
     v2 "in flight OR most recently closed" semantic so the
     close-out idempotent path still finds a target.

3. **tools/.../utils/fileSystem.ts** — TWO migrations:
   a. `isMidSetComplete` rewritten: collapses the Set 022 + Set 023
      multi-signal predicate (currentSession < totalSessions, ledger
      consultation, completedSessions[] override) into a single v3
      invariant probe. If `readProgress` succeeds, snapshot is
      internally consistent → not mid-set. If it raises with rule N
      violation, drift exists → mid-set. v2-compat ledger-merge
      pre-processing populates completedSessions[] from
      session-events.jsonl when missing, so pre-Set-022 snapshots
      still validate cleanly.
   b. `readSessionSets` state-file block migrated: `liveSession`,
      `sessionsCompleted`, and `totalSessions` derive from
      `readProgress` instead of direct field reads. v2-compat
      fallback chain preserved for snapshots that fail v3 invariants.
   c. New helper `readClosedSessionsFromLedger(eventsPath)` returns
      sorted distinct closeout_succeeded session numbers from the
      ledger; used by the v2-compat ledger-merge in both
      `readSessionSets` and `isMidSetComplete`.

4. **tools/.../utils/sessionState.ts** — TS lazy-synth writers
   updated to mirror Session 2's Python writer changes. SCHEMA_VERSION
   bumped 2->3. New `buildSessions(total, topStatus)` helper produces
   v3 sessions[] for the inferred top-status: complete -> all complete,
   in-progress -> session 1 in-progress (conservative), not-started ->
   all not-started. `notStartedPayload` and `backfillPayload` now emit
   the v3 dual-write shape (sessions[] + derived legacy triple) when
   spec.md declares totalSessions; rule 1 omits sessions[] for
   unknown-plan sets.

OUT OF BUNDLE (lower risk, summarized for context):

- ai_router/start_session.py preflight: `current_in_flight` now
  derived from view.current_session (was state.get("currentSession")).
  Falls through to existing closed_set fallback on invariant failure.
- ai_router/close_session.py `_peek_session_number`: routes through
  read_progress; the larger `_run_repair` function's v2-compat reads
  retain inline `# noqa: D13` markers (file-level allowlist in lint
  test).
- ai_router/__init__.py cost-report: session-state totalSessions read
  now routes through read_progress; activity-log totalSessions (a
  different artifact's carrier field) keeps the direct read with a
  `# noqa: D13` annotation.
- tools/.../providers/SessionSetsProvider.ts: ICON_FILES key renamed
  done->complete; Explorer label "Done" -> "Complete"; predicate
  isCurrentSessionInFlight simplified to a null-check on the v3
  liveSession.currentSession (which is now strictly the in-progress
  session's number).
- tools/.../src/types.ts: SessionState union literal "done" renamed
  to "complete" (spec D3 — unifies bucketing vocab with JSON status
  glossary).
- Two new D13 lint tests: ai_router/tests/test_no_legacy_field_reads.py
  (Python pytest) and tools/.../test/suite/noLegacyFieldReads.test.ts
  (Mocha). Both grep for direct dict-access patterns in their
  respective trees, allowlist progress.py/progress.ts +
  session_state.py/sessionState.ts (writers) + tests + lines with
  `# noqa: D13` (inline carve-out marker for v2-compat code).

Test coverage:
- pytest: 536 passed + 1 skipped (was 534 pre-Session-3; +2 from new
  D13 lint tests).
- Mocha: 375 passing, 2 failing (both pre-existing, unrelated:
  configEditor-foundation panel-lifecycle and notificationsSection
  rendering).
- Layer 3 Playwright: 5/5 passing against v3 fixtures (Complete
  bucket label, N/N Complete annotation, force-closed buckets to
  Complete with [FORCED] badge under the v3 "force promotes all"
  semantic).
- tsc --noEmit: clean.

Two operator-visible behavior changes from Session 3:
1. Explorer label changed from "Done" to "Complete" (spec D3).
2. v2 snapshots without per-session evidence (just
   `{status: "complete"}` with no completedSessions[] and no events
   ledger) now downgrade to In Progress instead of escalating to
   Done. The Session 4 bulk migrator heals these.
""".strip()


FOCUS_PROMPT = """
ROUND A — D13 reader migration correctness across Python + TypeScript.

Spec D13 carve-out: "No application reader may read legacy fields
except through approved compatibility helpers." Approved helpers are
`read_progress` (Python) / `readProgress` (TypeScript). Allowed
inline carve-outs are marked `# noqa: D13` / `// noqa: D13` for
v2-compat code that legitimately reads the legacy triple.

The bundle below contains the highest-risk reader migrations + the
new `read_progress`/`readProgress` wrapper they all funnel through.

Verify:

A. **read_progress / readProgress wrapper correctness.** Does the
   wrapper correctly branch v2 vs v3 inputs? Specifically:
   1. When `state.sessions` is non-None, does it call
      `get_progress(state)` directly without consulting spec.md?
   2. When `state.sessions` is None, does it synthesize from v2 first
      (consulting spec.md for titles) and THEN validate?
   3. Does the v3 branch tolerate a missing spec.md file (since
      synthesize is skipped)?
   4. Does the v2 branch raise SessionStateInvariantError when the
      synthesized state violates an invariant (the default-to-not-
      started behavior for `status=complete + completedSessions=[]`
      shapes)?

B. **gate_checks.py migration: idempotent-retry semantics.**
   `_session_in_focus(view)` returns `view.current_session` if non-
   None, else `max(view.completed_sessions)` if non-empty, else None.
   Trace each of the three migrated gates:
   - check_activity_log_entry
   - check_next_orchestrator_present (the `is_final` predicate)
   - check_change_log_fresh
   Confirm:
   1. The gate still fires correctly on the in-flight session at
      close-out time (the primary path).
   2. On idempotent-retry close-out (where the session was already
      flipped to complete on a prior attempt), the gate still finds
      the most-recently-closed session as its target (so it doesn't
      report "no session in flight" as a hard failure).
   3. The `is_final` predicate in
      `check_next_orchestrator_present` and `check_change_log_fresh`
      now uses `view.total_sessions` (derived as len(sessions)) and
      `current` (from _session_in_focus). Identify any v2 file shape
      where the v2 reader would have classified the session as final
      but the v3 path doesn't (or vice versa).

C. **fileSystem.ts `isMidSetComplete` rewrite.** The new predicate:
   1. Returns false on parse error (trust canonical status).
   2. Pre-populates completedSessions[] from
      `readClosedSessionsFromLedger` when the v2 snapshot lacks it
      AND the ledger has closeout events (v2-compat carve-out for
      pre-Set-022 sets).
   3. Calls readProgress; returns false if it succeeds, true if it
      raises SessionStateInvariantError.
   Verify:
   1. A v3 snapshot with sessions[] satisfying all invariants
      returns false. A v3 snapshot whose sessions[] disagrees with
      top-level status (e.g., status=complete but a not-started
      session) returns true (rule 7 violation).
   2. A pre-Set-022 v2 snapshot with status=complete, no
      completedSessions[], but a complete events ledger gets pre-
      populated and returns false (legacy ledger-fallback preserved).
   3. A v2 snapshot with status=complete, partial completedSessions
      (e.g., [1, 2] when totalSessions=3) returns true (rule 7
      violation via synthesizer).
   4. The malformed-JSON / missing-file / non-object-JSON defensive
      branches all return false (trust canonical status).

D. **fileSystem.ts `readSessionSets` state-file block migration.**
   The new derivation routes liveSession + sessionsCompleted +
   totalSessions through readProgress when the snapshot is v3-valid,
   and falls through to the events-ledger v2-compat path when
   readProgress raises. Verify:
   1. v3 snapshot → liveSession.currentSession =
      view.current_session (strictly the in-progress session, or
      null). Identify any path where the production code could leak
      the v2 "in flight OR most-recently-closed" ambiguity into
      liveSession.
   2. v3 snapshot → liveSession.completedSessions =
      view.completed_sessions (sorted list of complete-status
      session numbers).
   3. v3 snapshot → totalSessions = view.total_sessions
      (= sessions.length).
   4. v2-shape snapshot with completedSessions[] populated →
      pre-populated unchanged, synthesizer succeeds, same v3-derived
      outputs.
   5. v2-shape snapshot without completedSessions[] but with events
      ledger → ledger-merge pre-populates the array, synthesizer
      succeeds.
   6. Snapshot that fails v3 invariants → progressTotal /
      progressCompleted / progressCurrent stay null;
      sessionsCompleted falls through to
      countDistinctCloseoutSessions OR the
      state==='complete'+totalSessions terminal branch.
   Identify any path where the v3 invariants succeed but the
   downstream liveSession.completedSessions/currentSession leaks a
   different value than view exposes.

E. **sessionState.ts TS writer dual-write parity.** The new
   `buildSessions(total, topStatus)` helper produces sessions[] for
   the inferred top-status. `notStartedPayload` and `backfillPayload`
   use it. Verify:
   1. When totalSessions is null/0, buildSessions returns undefined
      and the writers omit sessions[] entirely (rule 1: "any set
      with a known plan"). The legacy triple still includes
      `currentSession: null` and `totalSessions: null` (no
      `completedSessions`).
   2. When totalSessions is known, buildSessions returns N entries
      and the writers include both sessions[] AND a derived
      `completedSessions[]` (matching the per-session statuses).
   3. backfillPayload's three branches:
      - change-log present → all sessions complete +
        completedSessions=[1..N] + currentSession=null +
        status=complete + lifecycleState=closed.
      - activity-log present (no change-log) → session 1 in-progress,
        rest not-started + completedSessions=[] + currentSession=1 +
        status=in-progress + lifecycleState=work_in_progress.
      - neither → all not-started (the notStartedPayload default).
   4. Are these outputs byte-equivalent to what the Python side
      produces? (Python writes camelCase keys + JSON pretty-printed
      with 2-space indent and trailing newline; the TS writer's
      atomicWriteJson uses the same shape.)
   5. Will the v3 reader (readProgress) successfully validate every
      shape produced by these writers? Identify any output that
      would fail an invariant.

F. **D13 carve-out boundary.** The migration leaves a small number
   of legitimate v2-compat reads behind:
   - ai_router/close_session.py `_run_repair` function (file-level
     allowlist in the Python lint test) — the repair walk
     reconciles v2-shaped snapshots that drifted.
   - ai_router/__init__.py line ~898 (`data.get("totalSessions")`
     with `# noqa: D13`) — reads from activity-log.json's carrier
     field, not session-state.json.
   - fileSystem.ts line ~86 (`sd.completedSessions` with
     `// noqa: D13`) — v2-compat ledger-merge in `isMidSetComplete`.
   - fileSystem.ts lines ~316, ~355-356 (similar v2-compat reads).
   Verify these carve-outs are well-targeted (not over-broad) and
   that the unmigrated reads inside `_run_repair` won't produce a
   regression now that the rest of close_session.py's reader path
   goes through read_progress.

Format the verdict as:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have
    notes.)
  - REJECTED: <bulleted list of must-fix issues with line numbers>.

Cite specific line numbers when flagging issues. Skip stylistic nits.
Focus on correctness — does the migrated code preserve the
read-correctness guarantees the v2 path had, AND do the new v3-only
paths produce shapes that satisfy the 8 invariants under every
input shape the reader accepts?
""".strip()


def _python_files() -> str:
    progress = read_lines(
        REPO_ROOT / "ai_router" / "progress.py",
        # The read_progress wrapper + its docstring + the synthesize
        # function it dispatches to (synthesize_v3_from_v2). The full
        # progress.py is ~570 LOC; this trims to the relevant migration
        # surface.
        [
            (191, 320),  # synthesize_v3_from_v2 + read_progress + get_progress
        ],
    )
    gate_checks = read_lines(
        REPO_ROOT / "ai_router" / "gate_checks.py",
        [
            (60, 130),   # imports + helpers (_read_progress_or_none + _session_in_focus)
            (420, 620),  # the three migrated gates: check_activity_log_entry,
                         # check_next_orchestrator_present, check_change_log_fresh
        ],
    )
    return progress + "\n\n" + gate_checks


def _typescript_files() -> str:
    progress_ts = read_lines(
        REPO_ROOT / "tools" / "dabbler-ai-orchestration" / "src" / "utils" / "progress.ts",
        [
            (200, 250),  # readProgress wrapper + getProgress entry point
        ],
    )
    filesystem_ts = read_lines(
        REPO_ROOT
        / "tools"
        / "dabbler-ai-orchestration"
        / "src"
        / "utils"
        / "fileSystem.ts",
        [
            (1, 110),    # imports + STATE_RANK + isMidSetComplete (full)
            (110, 200),  # readClosedSessionsFromLedger + countDistinctCloseoutSessions
            (286, 480),  # readSessionSets state-file block (the v3 migration)
        ],
    )
    session_state_ts = read_lines(
        REPO_ROOT
        / "tools"
        / "dabbler-ai-orchestration"
        / "src"
        / "utils"
        / "sessionState.ts",
        [
            (1, 70),     # imports + SCHEMA_VERSION + buildSessions helper
            (70, 200),   # readTotalSessionsFromSpec + notStartedPayload + backfillPayload
        ],
    )
    return progress_ts + "\n\n" + filesystem_ts + "\n\n" + session_state_ts


def main():
    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)

    if len(sys.argv) < 2:
        print("Usage: python verify_session3.py round-a [round-b]", file=sys.stderr)
        sys.exit(2)

    sub = sys.argv[1]
    if sub == "round-a":
        code_block = _python_files() + "\n\n" + _typescript_files()
        run_round(
            "Round A",
            SYSTEM_SUMMARY,
            code_block,
            FOCUS_PROMPT,
            out_dir / "round-a-session-3-result.json",
        )
    elif sub == "round-b":
        # Round B uses the same slices since fixes are localized to the
        # already-bundled regions.
        code_block = _python_files() + "\n\n" + _typescript_files()
        focus = (
            "ROUND B — confirm the must-fix issues from Round A are "
            "addressed in the updated files.\n\n"
            "For each Round-A issue, confirm:\n"
            "  - The fix is present at the cited location.\n"
            "  - The fix doesn't introduce a new contradiction.\n"
            "  - The fix is consistent with spec D6 (fail loud, never "
            "silently recover) and D13 (no application reader may read "
            "legacy fields except through approved helpers).\n\n"
            "Format: VERIFIED if all issues addressed and no new ones "
            "found; REJECTED if any remain or new ones surfaced. Cite "
            "line numbers; skip stylistic nits."
        )
        run_round(
            "Round B",
            SYSTEM_SUMMARY
            + "\n\n--- Round B context ---\nRound A returned REJECTED "
            "with must-fix issues. The fixes are in place; Round B is "
            "the confirmation pass.",
            code_block,
            focus,
            out_dir / "round-b-session-3-result.json",
        )
    else:
        print(f"Unknown subcommand: {sub}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
