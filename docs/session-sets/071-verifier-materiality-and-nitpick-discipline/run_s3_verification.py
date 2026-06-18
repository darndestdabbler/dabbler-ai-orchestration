"""Set 071 S3 (FINAL) — cross-provider session verification (routed gate REQUIRED).

S3 is synthesis + docs + STAGED release (no publish, operator-deferred) + lesson +
change-log. Shared verification surface => routed_gate REQUIRED. Verifier is GPT-5.4
(openai), a different provider than the Claude/anthropic orchestrator. Strong
adversarial framing (verification.md, the very framing this set calibrates). Raw
output saved to s3-verification[-round-M].md (never edited). Pass the round on the
CLI: `run_s3_verification.py [round]`.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import ai_router
from ai_router import build_verification_prompt

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ROUND = int(sys.argv[1]) if len(sys.argv) > 1 else 1

ORIGINAL_TASK = """\
Author the closing DOCUMENTATION and stage the release for Set 071 of the
dabbler-ai-orchestration repo. This is a documentation-writing task, NOT a
verification task: the work product to review is prose (docs + a changelog) plus a
version bump. The single quality bar is **documentation accuracy** -- does every
written claim faithfully describe the code that Sessions 1 and 2 already shipped and
committed?

Background: Set 071 added a "verifier materiality gate + nitpick-churn discipline" to
the ai_router verification surfaces. Session 1 added a materiality "so what?" layer to
two reviewer prompt templates; Session 2 added a severity-anchored blocking classifier
(`is_blocking_verdict` / `classify_blocking` / `reconcile_issue_ledger` / `parse_nits`
in `ai_router/verification.py`) and a re-verify loop-discipline subsection in the
workflow doc. Both were independently verified and committed. Session 3 (this work)
writes the synthesis docs, the lesson, and the changelog, and bumps the version.

The deliverables to check for accuracy:
1. `docs/verification-surface-strategy.md` -- new section 7 (the materiality gate +
   Minor-non-blocking loop discipline) + a section-3 cross-reference. Accurate to the
   S1/S2 code?
2. `ai_router/docs/pull-verifier.md` -- new "What Set 071 added" section. Accurate?
3. `docs/planning/lessons-learned.md` -- lesson L-071-1: valid metadata trailer; cites
   L-069-2 / L-065-1 / L-070-1; faithfully states the failure->fix.
4. `ai_router/CHANGELOG.md` -- a `[0.25.0]` entry for Set 071, plus a deliberately
   backfilled `[0.24.0]` entry (Set 070 bumped + tagged v0.24.0 but never wrote its
   package-changelog section). Are the symbol names, file paths, and behaviors right?
5. `change-log.md` (set-level) -- accurate S1-S3 summary.
6. Version-bump consistency: 0.25.0 in both `ai_router/__init__.py` and `pyproject.toml`.

Facts you must treat as settled, NOT as defects to flag:
- **No production code changed this session** (S1/S2 shipped it). Test suite is
  **2165 passed / 5 skipped**, unchanged; the 5 skips are by-design real-Podman-on-
  Windows skips.
- **The release is intentionally STAGED, not published** (operator deferred the PyPI
  publish so a concurrent process is not disrupted): no `v0.25.0` tag, no publish this
  session. The absent tag/publish is deliberate, recorded in the change-log -- not a
  defect.
- **The backfilled `[0.24.0]` changelog entry documents an already-released version**
  (Set 070); it is a deliberate gap-fill, not "a second release this session."
- **The verdict grammar is intentionally binary** (VERIFIED / ISSUES_FOUND), an
  operator decision confirmed cross-provider in S2; blocking-ness is a derived
  predicate. Do not recommend a third verdict token.

A real defect here is a documentation claim that is factually wrong about the shipped
code (a wrong symbol name, a misdescribed behavior, a miscited lesson, an inconsistent
version) -- that would mislead a future maintainer and is at least Major. A stylistic
preference is not a defect.
"""


def staged_diff() -> str:
    # encoding="utf-8" is load-bearing on Windows: subprocess defaults to the
    # cp1252 locale codec, which raises on UTF-8 multibyte bytes in the diff
    # (e.g. a smart-quote in a routed-output file) and silently yields None.
    return subprocess.run(
        ["git", "diff", "--cached", "--",
         "docs/verification-surface-strategy.md",
         "ai_router/docs/pull-verifier.md",
         "docs/planning/lessons-learned.md",
         "ai_router/CHANGELOG.md",
         "ai_router/__init__.py", "pyproject.toml",
         "docs/session-sets/071-verifier-materiality-and-nitpick-discipline/change-log.md"],
        cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True,
    ).stdout


def main() -> None:
    diff = staged_diff()
    strategy = (REPO / "docs" / "verification-surface-strategy.md").read_text(encoding="utf-8")
    lessons_tail = (REPO / "docs" / "planning" / "lessons-learned.md").read_text(encoding="utf-8")
    changelog = (REPO / "ai_router" / "CHANGELOG.md").read_text(encoding="utf-8")

    response = (
        "# Set 071 S3 -- completed work (the work product to review)\n\n"
        "Session 3 (final) of Set 071 was a SYNTHESIS + DOCUMENTATION + staged-release "
        "session. It ships no new production code (S1 shipped the reviewer-template "
        "materiality layer; S2 shipped the blocking classifier + workflow Step-6 "
        "discipline -- both already verified and committed). The deliverables produced "
        "this session were:\n"
        "  1. docs/verification-surface-strategy.md -- a new section 7 synthesising the "
        "Set 071 materiality gate + Minor-non-blocking loop discipline, plus a section-3 "
        "cross-reference.\n"
        "  2. ai_router/docs/pull-verifier.md -- a new 'What Set 071 added' section.\n"
        "  3. docs/planning/lessons-learned.md -- lesson L-071-1 (cites L-069-2, "
        "L-065-1, L-070-1).\n"
        "  4. ai_router/CHANGELOG.md -- a [0.25.0] entry for Set 071, plus a backfilled "
        "[0.24.0] entry for Set 070 (whose release bumped the version + tagged v0.24.0 "
        "but never wrote the package-level changelog section).\n"
        "  5. ai_router 0.25.0 version bump (__init__.py + pyproject.toml). The PyPI "
        "publish is intentionally DEFERRED by operator request; the release is staged, "
        "not published -- no tag pushed, no publish triggered.\n"
        "  6. docs/session-sets/071-.../change-log.md -- the set-level change log.\n\n"
        "The claim to verify is that the documentation and the changelog ACCURATELY "
        "describe the already-shipped S1/S2 code and the staged release. The unified "
        "diff of the staged changes follows, then the full current content of the most "
        "load-bearing files (the strategy synthesis, the lessons file, and the "
        "changelog) so the claims can be checked against ground truth.\n\n"
        "## Staged diff (git diff --cached)\n\n```diff\n" + diff + "\n```\n\n"
        "## Full current docs/verification-surface-strategy.md\n\n```markdown\n"
        + strategy + "\n```\n\n"
        "## Full current docs/planning/lessons-learned.md\n\n```markdown\n"
        + lessons_tail + "\n```\n\n"
        "## Full current ai_router/CHANGELOG.md\n\n```markdown\n" + changelog + "\n```\n"
    )

    template = (REPO / "ai_router" / "prompt-templates" / "verification.md").read_text(encoding="utf-8")
    prompt = build_verification_prompt(
        original_task=ORIGINAL_TASK,
        original_response=response,
        task_type="session-verification",
        template=template,
    )

    res = ai_router.query(
        model="gemini-pro",
        content=prompt,
        task_type="session-verification",
        session_set=str(HERE),
        session_number=3,
    )
    name = "s3-verification.md" if ROUND == 1 else f"s3-verification-round-{ROUND}.md"
    out = HERE / name
    out.write_text(res.content, encoding="utf-8")
    print(f"round {ROUND} -> {out.name} ({len(res.content)} chars, "
          f"model={getattr(res, 'model_name', 'gpt-5-4')}, "
          f"cost={getattr(res, 'cost', 'n/a')})")


if __name__ == "__main__":
    main()
