"""Session 4a Round B verification driver — confirms the 6 must-fix
revisions from Round A landed.

Round A REJECTED with 6 must-fix items:
  1. §5.1 — add N=1 caveat to "identical span shape"
  2. §5.2 — rephrase tool-sequence swap to not dismiss narration effect
  3. §5.4 — rephrase "double-count by 5x" → 4 false positives / 5x inflation
  4. §7 — add 2 confounds (inter-run caching, non-git workspace)
  5. §8 — merge Q3 + Q5
  6. §10 — add parameterization-untested risk to verdict

All 6 applied. Round B asks gemini-pro to confirm the applied
revisions resolve each Round A item; spiral check.

Per memory feedback_verifier_spiral_recruit_codex: a single
confirmation round is standard; if Round B raises NEW issues
beyond the original 6, that is the spiral signal — escalate or
stop, do not iterate further.
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


ROUND_A_VERDICT = """
ROUND A VERDICT (2026-05-22): REJECTED with 6 must-fix items:

1. §5.1 — "Identical span shape" claim lacks N=1 caveat. Fix: add
   caveat acknowledging N=1 means the observation may not
   generalize and variance is unquantified.

2. §5.2 — Tool-sequence swap dismissed as "normal non-determinism"
   too conclusively. Fix: rephrase to leave a narration-induced
   shift unrulable-out under N=1 evidence.

3. §5.4 — "double-count by 5x" phrasing is mathematically
   imprecise. Fix: rephrase to "5-fold count inflation" or
   "4 false positives per true match."

4. §7 confound list omits two confounds. Fix: add (a) inter-run
   caching (consecutive runs share Copilot/provider cache state),
   (b) non-git workspace (synthetic-set isn't git-init'd, so the
   `AGENTS.md` git-root pickup path is untested).

5. §8 questions Q3 and Q5 are redundant. Fix: merge into one
   question covering all native A3 signals at non-default explicit
   effort levels.

6. §10 verdict doesn't explicitly carry forward the parameterization-
   mechanism risk. Fix: add a verdict bullet noting the S4a runs
   validated a pre-substituted instruction and the dynamic
   parameterization mechanism itself remains an open risk for the
   S5 proposal.
""".strip()


FOCUS_PROMPT = """
Bias cautions: This prompt was authored by an AI agent that may
have an opinion on the answer. Before answering as posed,
briefly check whether the right question to answer is "did the
6 Round A items land" — if a Round A item now looks misframed in
hindsight, say so even though you authored it. The prompt is NOT
asking you to repeat full verification of the doc; only to check
that the 6 specific Round A items are satisfactorily addressed.

---

ROUND B — Session 4a revision check.

You are Gemini Pro, asked to confirm that the 6 must-fix items
from your Round A verdict on `copilot-narration-results.md`
have been applied. The full revised doc is in the bundle.

The Round A verdict (verbatim) is in the prior context turn.

For EACH of the 6 items, answer:
  - Item N: ADDRESSED (cite the new wording briefly) / NOT
    ADDRESSED (cite what's still missing) / OVER-CORRECTED (cite
    the new wording and why it goes too far)

Then return a final verdict:
  - VERIFIED: all 6 items addressed; no NEW must-fix issues
    raised. (Followed by any nice-to-haves.)
  - REJECTED: <which of the 6 items is still unresolved, OR
    what NEW must-fix issue the revisions introduced>.

DO NOT raise new must-fix items unrelated to the original 6
unless they were introduced BY the revisions (regression
class only).

Per memory `feedback_verifier_spiral_recruit_codex`: this Round B
is the single confirmation round. If Round B itself raises
issues that would need a Round C to confirm fixes, that's the
spiral signal — note it but do not iterate.
""".strip()


def main() -> int:
    bundle_parts = [
        read_file(
            REPO_ROOT
            / "docs/session-sets/044-ai-chat-log-discovery-and-experiments/copilot-narration-results.md"
        ),
    ]
    bundle = "\n\n".join(bundle_parts)
    print(f"Bundle: {len(bundle)} chars across {len(bundle_parts)} parts")

    out_dir = SET_DIR / "verification-output"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "round-b-session-4a-result.json"

    print(f"\n{'='*60}\n[Round B] sending to gemini-pro...\n{'='*60}")
    result = ai_router.query(
        model="gemini-pro",
        content=FOCUS_PROMPT,
        task_type="session-verification",
        context=(
            f"--- ROUND A VERDICT (already issued) ---\n{ROUND_A_VERDICT}\n"
            f"\n--- REVISED BUNDLE START ---\n{bundle}\n--- REVISED BUNDLE END ---"
        ),
        session_set="044-ai-chat-log-discovery-and-experiments",
        session_number=4,
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
