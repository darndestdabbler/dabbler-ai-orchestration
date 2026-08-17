# STATUS — after Session 3 (extension as renderer, corpus migrated, packaged)

- Done: extension forked into tools/ and cut to a renderer — all six TS ports
  of Python logic deleted; tree renders from `python -m ai_router.progress
  --json` (async scan, mtime-keyed projection cache, file-presence fallback
  with a visible "install ai-router" message when python is unreachable).
  Commands 43 → 17 (15 user-facing + 2 internal). One-shot v3→v4 migrator ran
  over all 46 stale v1 sets (totals unchanged 119/13/1/1) then was retired
  (add 6a1e4b7, delete 5d041fb). Docs rewritten (README 142 / quick-start 132 /
  schema-reference 163 / MIGRATION-FROM-V1 47). Packaged: VSIX 1.0.0 (737 KB)
  + wheel; tagged v1.0.0.
- Verified: 325 Python tests (≤480) and 158 TS unit + 16 Playwright = 174
  (≤215), all green. Playwright drives a real VS Code against corpus fixtures
  through the real projection. Real-session e2e on a scratch repo: start →
  work → REAL cross-provider verification (anthropic orchestrator, openai
  verifier, $0.026, VERIFIED round 1) → 5 gates → close → push. LOC: Python
  7,776 (~9,000 budget), TS 5,034 src + 2,668 tests ≈ 7,700 (~7,500 target).
- Deviations (post-evaluation review, all deliberate): `modules.py`
  (110 LOC, create-only) stays — the plan's Session 3 keep-list requires the
  `python -m ai_router.modules` seam its own inventory omitted; recorded as
  a plan contradiction, not regrowth. `--transport` flag now exists on
  `python -m ai_router.verify` (full precedence: flag > env > profile >
  api). session.py reconsidered per ground rule 8: sanctioned artifact
  writers extracted to `writers.py` (488) leaving session.py at 745 for the
  flows it was told to absorb (lock+resolve+spec-parser+cancel/restore).
  Remaining S1 per-module overruns (copilot.py ~1.5x, selection.py ~1.5x,
  route.py ~2x incl. escalation loop) are accepted as-is: the code is
  e2e-verified and under the global budget; a simplification
  pass is deliberately deferred. Total Python after the writer extraction:
  7,855 vs the ~9,000 budget. PyPI already has a 1.0.0 (uploaded
  2026-08-15); publishing this build needs 1.0.1. Copilot lock still pins
  CLI 1.0.69 (re-probe before a live seat run).
