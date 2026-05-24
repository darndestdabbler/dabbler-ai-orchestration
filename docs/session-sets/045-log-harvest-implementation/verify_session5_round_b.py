"""Session 5 verification driver — Round B.

Round A REJECTED on two must-fix issues:
  1. Conflict-pills hard-coded 60px indent — brittle vs. font size.
  2. Missing dabbler-ai-router silent-degrade — operator hidden from
     the setup gap.

Both are now resolved in-flight. Round B bundles ONLY the changed
files plus the Round A verdict so gemini-pro can confirm the
resolutions are correct.

Per memory `feedback_split_large_verification_bundles`: narrow bundle.
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


def dump_route_result_to_json(result) -> dict:
    if dataclasses.is_dataclass(result):
        return dataclasses.asdict(result)
    if hasattr(result, "__dict__"):
        return {k: v for k, v in result.__dict__.items()}
    return {"_repr": repr(result)}


SYSTEM_SUMMARY = """
Set 045 / Session 5 — Round B verification.

Round A REJECTED with two must-fix issues:

  Must-fix 1: The .conflict-pills indent was a hard-coded 60px,
  which breaks alignment if the operator changes their font size.
  Verifier proposed CSS custom properties + calc().

  Must-fix 2: HarvestService silent-degrades when
  dabbler-ai-router is not pip-installed. Operator can't tell why
  badges never render. Verifier proposed detecting
  ModuleNotFoundError in stderr and surfacing a one-time toast.

Both have been applied in-flight per the operator's
'don't hide behind out-of-scope' directive.

Round A also surfaced four nice-to-have recommendations; the
ones applied in-flight: spawn-warn includes cwd (small win).
The ones deferred: HarvestService → singleton (architectural;
no second view in this set), missing-events-ledger ConflictKind
(spec-touching; revisit if operator requests), CONTRIBUTING.md
note about npm run test:playwright (doc-only; can land
separately).

Round B asks gemini-pro to confirm the two must-fix resolutions
are correct.
""".strip()


FOCUS_PROMPT = """
Bias cautions: This is a Round B verification — re-checking
fixes for Round A's must-fix issues. Avoid expanding scope to
new concerns unless they're regressions introduced by the
specific fixes below.

ROUND B — confirm must-fix resolutions for Set 045 / Session 5.

MUST-FIX 1: Conflict-pills indent uses CSS custom properties.

  Fix applied at tree.css:
    - Declared --row-fraction-width: 3em and
      --row-fraction-margin-right: 12px on :root.
    - .row-fraction now reads `width: var(--row-fraction-width)`
      and `margin-right: var(--row-fraction-margin-right)`.
    - .conflict-pills uses
      `padding-left: calc(12px + var(--row-fraction-width)
        + var(--row-fraction-margin-right))`
      where the 12px constant matches .row-header's left padding.

  Question: does the resolution match what you suggested? Are
  the variable names + the calc() expression semantically right
  for tracking the fraction column above? Is the constant 12px
  (the row-header left padding) the right hard-coded part to
  carry forward, or should that ALSO be a variable?

MUST-FIX 2: Missing-dependency surfacing.

  Fix applied at HarvestService.ts:
    - SpawnResult interface now carries an optional `diagnostic`
      field ("missing-ai-router" | "spawn-failed" |
      "non-zero-exit" | "json-parse").
    - spawnJson() inspects stderr on non-zero exit:
      /ModuleNotFoundError.*ai_router|No module named ['"]ai_router['"]/
      matches → diagnostic="missing-ai-router".
    - HarvestService.fetch() checks both shell-outs' diagnostics;
      if either is "missing-ai-router" AND the
      missingDependencyNotified flag is false, fires a one-time
      vscode.window.showWarningMessage with an "Open settings"
      action that drills to dabblerSessionSets.pythonPath. The
      flag is set to suppress subsequent toasts per session.

  Question: does the resolution match what you suggested? Is the
  regex robust enough across Python versions (Python 3.11 says
  `ModuleNotFoundError: No module named 'ai_router'`; older Python
  versions said `ImportError: ...`)? Does the one-time toast
  posture (sticky for the session) match your intent, or should
  the toast re-fire on every refresh until the operator clicks
  "Open settings" / installs the package?

ALSO APPLIED (smaller verifier rec): the console.warn on
non-zero exit now includes the cwd parameter so the dev
console line carries enough context to diagnose without
grep-walking the source.

Format the verdict as either:
  - VERIFIED: no must-fix issues. (Followed by any nice-to-have notes
    on the deferred items if they should be promoted.)
  - REJECTED: <bulleted list of remaining or new must-fix issues>.
""".strip()


def main() -> int:
    bundle_parts = [
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/media/session-sets-tree/tree.css"
        ),
        read_file(
            REPO_ROOT
            / "tools/dabbler-ai-orchestration/src/providers/HarvestService.ts"
        ),
        read_file(SET_DIR / "session-reviews" / "session-005.md"),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "session-005-round-b-route-result.json"

    print(f"\n{'='*60}\n[Round B] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=f"{SYSTEM_SUMMARY}\n\n--- BUNDLE START ---\n{bundle}\n--- BUNDLE END ---",
        session_set="045-log-harvest-implementation",
        session_number=5,
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
        verdict_path = out_dir / "session-005-round-b.md"
        verdict_path.write_text(text, encoding="utf-8")
        print(f"Wrote {verdict_path.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
