"""End-of-session cross-provider verification for Set 9 Session 3 (D-2).

Builds a verification prompt that bundles the spec excerpt, the
deliverables (event-type addition, close_session.py validation +
event-emission changes, session_state.py forced-flag plumbing,
close-out.md Section 5 rewrite, TypeScript Session Set Explorer
changes, and the new tests on both sides), and the test-suite result.
Routes to a non-Anthropic verifier via
`route(task_type="session-verification")` per workflow Step 6 and saves
the raw verdict to `session-reviews/session-003.md`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SET_DIR = REPO / "docs" / "session-sets" / "009-alignment-audit-followups"


def _load_ai_router():
    """Import ``ai_router`` directly. The previous ``importlib.util.spec_from_file_location`` shim,
    required when the package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the package is installable
    via ``pip install -e .`` from the repo root. The ``sys.path.insert`` covers the case
    where the script is run without the editable install.
    """
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    import ai_router
    return ai_router


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _slice_event_types(session_events_py: str) -> str:
    marker = "# Event types — exposed as a tuple"
    start = session_events_py.find(marker)
    if start < 0:
        return "(could not locate EVENT_TYPES block)"
    rest = session_events_py[start:]
    end = rest.find("_EVENT_TYPES_SET = frozenset(EVENT_TYPES)")
    if end < 0:
        end = len(rest)
    end += len("_EVENT_TYPES_SET = frozenset(EVENT_TYPES)")
    return rest[:end]


def _slice_validate_args(close_session_py: str) -> str:
    marker = "FORCE_CLOSE_OUT_ENV_VAR ="
    start = close_session_py.find(marker)
    if start < 0:
        return "(could not locate FORCE_CLOSE_OUT_ENV_VAR)"
    rest = close_session_py[start:]
    end = rest.find("# ---------------------------------------------------------------------------\n# Disposition")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_force_event_emission(close_session_py: str) -> str:
    marker = "# Hard-scoped --force path (Set 9 Session 3, D-2)"
    start = close_session_py.find(marker)
    if start < 0:
        return "(could not locate force event-emission block)"
    rest = close_session_py[start:]
    end = rest.find("# Verification wait. ``--force``")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_force_argparse(close_session_py: str) -> str:
    marker = '        "--force",'
    start = close_session_py.find(marker)
    if start < 0:
        return "(could not locate --force argparse block)"
    rest = close_session_py[start:]
    end = rest.find('p.add_argument(\n        "--allow-empty-commit"')
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_flip_state(session_state_py: str) -> str:
    marker = "def _flip_state_to_closed("
    start = session_state_py.find(marker)
    if start < 0:
        return "(could not locate _flip_state_to_closed)"
    rest = session_state_py[start:]
    end = rest.find("def mark_session_complete(")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_mark_complete(session_state_py: str) -> str:
    marker = "def mark_session_complete("
    start = session_state_py.find(marker)
    if start < 0:
        return "(could not locate mark_session_complete)"
    rest = session_state_py[start:]
    end = rest.find("def _finalize_total_sessions_from_entries")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_section5(closeout_md: str) -> str:
    marker = "## Section 5 — Manual close-out flags"
    start = closeout_md.find(marker)
    if start < 0:
        return "(could not locate Section 5)"
    rest = closeout_md[start:]
    end = rest.find("## Section 6 — Troubleshooting")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_section2_force_row(closeout_md: str) -> str:
    """Return the flag-summary table row for --force in Section 2."""
    marker = "| `--force` |"
    start = closeout_md.find(marker)
    if start < 0:
        return "(could not locate --force row in Section 2)"
    end = closeout_md.find("\n", start)
    return closeout_md[start:end] if end > start else closeout_md[start:]


def _slice_session3_block(ai_assignment_md: str) -> str:
    marker = "## Session 3: D-2"
    start = ai_assignment_md.find(marker)
    if start < 0:
        return "(could not locate Session 3 block)"
    return ai_assignment_md[start:]


def _slice_force_tests_skeleton(test_file: str) -> str:
    """Return the four new force tests + the updated existing one."""
    marker = "def test_force_bypass_without_disposition("
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate test_force_bypass_without_disposition)"
    rest = test_file[start:]
    end = rest.find("def test_happy_path_skeleton_succeeds")
    if end < 0:
        end = len(rest)
    return rest[:end]


def _slice_force_tests_gate(test_file: str) -> str:
    """Return the updated TestGateFailWithForce class."""
    marker = "class TestGateFailWithForce:"
    start = test_file.find(marker)
    if start < 0:
        return "(could not locate TestGateFailWithForce)"
    rest = test_file[start:]
    end = rest.find("class TestMarkCompleteEdgeCases")
    if end < 0:
        end = len(rest)
    return rest[:end]


def main() -> int:
    ar = _load_ai_router()
    route = ar.route

    spec_md = _read(SET_DIR / "spec.md")
    session_events_py = _read(REPO / "ai_router" / "session_events.py")
    close_session_py = _read(REPO / "ai_router" / "close_session.py")
    session_state_py = _read(REPO / "ai_router" / "session_state.py")
    closeout_md = _read(REPO / "ai_router" / "docs" / "close-out.md")
    ai_assignment_md = _read(SET_DIR / "ai-assignment.md")
    skeleton_tests = _read(REPO / "ai_router" / "tests" / "test_close_session_skeleton.py")
    gate_tests = _read(REPO / "ai_router" / "tests" / "test_mark_session_complete_gate.py")
    types_ts = _read(REPO / "tools" / "dabbler-ai-orchestration" / "src" / "types.ts")
    provider_ts = _read(REPO / "tools" / "dabbler-ai-orchestration" / "src" / "providers" / "SessionSetsProvider.ts")
    badge_test_ts = _read(REPO / "tools" / "dabbler-ai-orchestration" / "src" / "test" / "suite" / "forceClosedBadge.test.ts")

    acceptance = (
        "- Either: `--force` is hard-scoped (env-var gated + reason-required + "
        "ledger event + warning) OR removed entirely\n"
        "- `ai_router/docs/close-out.md` reflects the resolution\n"
        "- A new test exercises the chosen path\n"
        "(Operator selected the **hard-scope** path at session start.)"
    )

    prompt_parts = [
        "## Session under verification",
        "Set 9 (`009-alignment-audit-followups`) Session 3 of 5 — drift "
        "item D-2 from the combined-design alignment audit. Audit "
        "document: `docs/proposals/2026-04-30-combined-design-alignment-audit.md` "
        "§5.2 (D-2 — `--force` flag on a deterministic gate).",
        "",
        "## Path selected",
        "The spec offered two corrective options:",
        "  (a) hard-scope `--force` to incident-recovery only, with "
        "env-var gate + mandatory `--reason-file` + new "
        "`closeout_force_used` event + loud WARNING + forensic field "
        "in `session-state.json` + Session Set Explorer badge, OR",
        "  (b) remove `--force` entirely.",
        "",
        "**The operator selected option (a) — the hard-scope path** — at "
        "session start. The audit explicitly accepts either path; the "
        "operator's preference for retaining an incident-recovery "
        "bypass with strong audit-trail discipline drove the choice.",
        "",
        "## Acceptance criteria for this session",
        acceptance,
        "",
        "## Files changed (deliverables)",
        "",
        "### 1. `ai_router/session_events.py` — `closeout_force_used` "
        "added to `EVENT_TYPES`",
        "",
        "Set 1 Session 3 deliberately froze the enum to nine entries; the "
        "frozen-enum exception for D-2 is justified inline in the new "
        "comment block. Module docstring also updated to list ten event "
        "types and describe `closeout_force_used`.",
        "",
        "```python",
        _slice_event_types(session_events_py),
        "```",
        "",
        "### 2. `ai_router/close_session.py` — `--force` hard-scoped",
        "",
        "Five changes:",
        "",
        "  - **argparse `--force` help text** rewritten to describe the "
        "new contract:",
        "",
        "```python",
        _slice_force_argparse(close_session_py),
        "```",
        "",
        "  - **`_validate_args` env-var + reason-file gates**:",
        "",
        "```python",
        _slice_validate_args(close_session_py),
        "```",
        "",
        "  - **`run()` event emission + WARNING** (inside the close-out "
        "lock, after `closeout_requested` is emitted):",
        "",
        "```python",
        _slice_force_event_emission(close_session_py),
        "```",
        "",
        "### 3. `ai_router/session_state.py` — `forced` flag plumbing",
        "",
        "  - `_flip_state_to_closed(forced=False)` writes `forceClosed: True` "
        "when called with `forced=True`:",
        "",
        "```python",
        _slice_flip_state(session_state_py),
        "```",
        "",
        "  - `mark_session_complete(force=False)` records `forced=` only "
        "when the bypass actually mattered (gates would have failed) and "
        "appends `closeout_force_used` to the events ledger from the "
        "snapshot-flip path:",
        "",
        "```python",
        _slice_mark_complete(session_state_py),
        "```",
        "",
        "### 4. `ai_router/docs/close-out.md` Section 5 + Section 2 row",
        "",
        "  - **Section 2 flag-summary row**:",
        "",
        f"    `{_slice_section2_force_row(closeout_md)}`",
        "",
        "  - **Section 5 — `--force` entry** (full rewrite):",
        "",
        "```markdown",
        _slice_section5(closeout_md),
        "```",
        "",
        "### 5. VS Code Session Set Explorer — `[FORCED]` badge",
        "",
        "  - `tools/dabbler-ai-orchestration/src/types.ts` — added "
        "`forceClosed: boolean | null` to `LiveSession`:",
        "",
        "```typescript",
        types_ts,
        "```",
        "",
        "  - `src/providers/SessionSetsProvider.ts` — exported "
        "`forceClosedBadge`, added it to the description bits, and added "
        "a tooltip line. Full provider file is large; the relevant "
        "additions are:",
        "",
        "```typescript",
        # Just the badge function, the tooltip line addition, and the
        # description-bits assembly. Sliced loosely.
        provider_ts.split("function uatBadge")[1].split("function liveSessionTooltipLines")[0],
        "...",
        provider_ts.split("if (ls.forceClosed === true) {")[0].split("if (ls.verificationVerdict)")[-1] +
        "if (ls.forceClosed === true) {" +
        provider_ts.split("if (ls.forceClosed === true) {")[1].split("return lines;")[0] +
        "return lines;",
        "...",
        provider_ts.split("const bits = [")[1].split("].filter(Boolean);")[0] +
        "].filter(Boolean);",
        "```",
        "",
        "### 6. New tests",
        "",
        "  - `tests/test_close_session_skeleton.py` — updated "
        "`test_force_bypass_without_disposition` to opt in via env-var + "
        "`--reason-file`; added "
        "`test_force_rejected_without_env_var`, "
        "`test_force_rejected_with_non_one_env_var`, "
        "`test_force_rejected_without_reason_file`, and "
        "`test_force_force_closed_flag_written_via_mark_session_complete`:",
        "",
        "```python",
        _slice_force_tests_skeleton(skeleton_tests),
        "```",
        "",
        "  - `tests/test_mark_session_complete_gate.py` — "
        "`TestGateFailWithForce` updated for the new WARNING wording, "
        "added `test_force_emits_closeout_force_used_event` and "
        "extended `test_force_flips_the_snapshot` to assert "
        "`forceClosed: True`:",
        "",
        "```python",
        _slice_force_tests_gate(gate_tests),
        "```",
        "",
        "  - `tools/dabbler-ai-orchestration/src/test/suite/forceClosedBadge.test.ts` "
        "— new TS test (4 cases: true, false, null, liveSession=null):",
        "",
        "```typescript",
        badge_test_ts,
        "```",
        "",
        "### 7. `docs/session-sets/009-alignment-audit-followups/ai-assignment.md` "
        "— Session 3 block appended (with Session 2 actuals)",
        "",
        "```markdown",
        _slice_session3_block(ai_assignment_md),
        "```",
        "",
        "## Test result",
        "`python -m pytest ai_router/tests` → **675 passed in 54.75s** "
        "(670 pre-existing + 5 new force-hard-scoping cases).",
        "",
        "Extension TypeScript: `npx tsc --noEmit -p tsconfig.json` → "
        "exit 0 (clean typecheck).",
        "",
        "## Spec excerpt for Session 3",
        "```markdown",
        spec_md.split("### Session 3: D-2")[1].split("### Session 4")[0],
        "```",
        "",
        "## Workflow ordering note",
        "Workflow Step 6 (verification) is mode-aware; this set runs "
        "outsource-first and we are routing the verification "
        "synchronously. The standing operator constraint restricts "
        "ai_router usage to end-of-session verification only — this is "
        "the only routed call this session.",
        "",
        "## Verification ask",
        "Evaluate whether the deliverables together satisfy the "
        "spec's Session 3 acceptance criteria for the hard-scope "
        "alternative. Specifically:",
        "",
        "  1. Is `--force` **hard-scoped** correctly? Does "
        "`_validate_args` reject `--force` (a) when "
        "`AI_ROUTER_ALLOW_FORCE_CLOSE_OUT` is unset / set to anything "
        "other than `\"1\"`, and (b) when `--reason-file` is missing? "
        "Are both checks applied before any state mutation (no events "
        "emitted, no lock acquired)?",
        "  2. Is the `closeout_force_used` ledger event emitted with "
        "the operator's reason as a payload field? Is it added to "
        "`EVENT_TYPES` deliberately (with rationale for the "
        "frozen-enum exception)?",
        "  3. Is the loud `WARNING` line clearly distinct from the "
        "old `DEPRECATION` text? Does it reach the operator both via "
        "`outcome.messages` (stdout in human mode, JSON payload in "
        "`--json` mode) AND via the module logger (stderr)?",
        "  4. Is `forceClosed: true` written to `session-state.json` "
        "by `_flip_state_to_closed(forced=True)` and threaded through "
        "`mark_session_complete(force=True)` only when the bypass "
        "actually mattered (failing gates)?",
        "  5. Does the VS Code Session Set Explorer surface a "
        "`[FORCED]` description badge and a tooltip line for "
        "force-closed sets, with a null-safe guard so legacy "
        "snapshots without the field don't light up the badge?",
        "  6. Does `ai_router/docs/close-out.md` Section 5 reflect "
        "the new contract (env-var gate + reason-file requirement + "
        "event emission + WARNING + forensic flag), and does the "
        "Section 2 flag-summary row + combination-rules list agree?",
        "  7. Are the new Python tests covering the rejection paths "
        "(no env-var, bad env-var values, no reason-file) and the "
        "happy path (event emitted, reason recorded, forceClosed "
        "set)? Is the TypeScript test covering the badge's "
        "true/false/null/null-liveSession cases?",
        "",
        "Flag any consistency drift between the doc, the code, and the "
        "tests (e.g., docs naming a flag the code doesn't accept; tests "
        "asserting a message the code doesn't emit; the badge "
        "function checking a field the type doesn't carry).",
    ]
    prompt = "\n".join(prompt_parts)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-003-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"wrote prompt: {prompt_path} ({len(prompt)} chars)")

    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=3,
    )

    review_path = out_dir / "session-003.md"
    review_path.write_text(result.content, encoding="utf-8")
    print(f"wrote review: {review_path}")
    print(f"model: {result.model_name}")
    print(f"input_tokens: {result.input_tokens}")
    print(f"output_tokens: {result.output_tokens}")
    print(f"cost_usd: {result.cost_usd}")

    sidecar = {
        "model": result.model_name,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
    }
    (out_dir / "session-003-meta.json").write_text(
        json.dumps(sidecar, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
