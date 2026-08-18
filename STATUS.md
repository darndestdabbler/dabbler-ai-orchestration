# STATUS — after set 137 (the Copilot seat transport works, and is exercised)

- Done (set 137, 1.0.9): the `copilot-cli` transport was dark on a
  seat-only install and is now the transport the repo verifies itself
  through. Two rebuild regressions fixed. (1) v1's Set 104 large-prompt
  file handoff, dropped in the v2 rebuild, is restored in
  `transports/copilot.py`: above `HANDOFF_THRESHOLD_UTF16_UNITS` (measured
  on the rendered argv, every OS) the payload goes to a temp file and `-p`
  carries only a bootstrap; a footer-only nonce fails the call closed as
  `handoff-incomplete` on an under-read; the payload is deleted in
  `finally` on every path. The OS size refusal also gets its own class,
  `argv-too-large`, instead of hiding inside `generic-unknown`. (2)
  `bootstrap` persists `DABBLER_TRANSPORT` at **user** scope by default —
  machine scope is `--machine-scope` and falls back, announced, when it
  cannot be honoured; the old HKLM-only write landed nowhere on an
  unelevated account and was the wrong default anyway when the admin
  account is a different user. Routed dispatches also pass
  `--no-custom-instructions` so a verifier is not handed the workspace's
  orchestrator instructions.
- Verified: 414 Python tests (≤480) green. Sessions 1 and 2 verified
  cross-provider **through `copilot-cli`** (claude-opus-5/anthropic
  orchestrator, gpt-5.5/openai verifier) — the repaired surface doing the
  verifying, and carrying real Majors back in S2 r1 and S3 r1 rather than
  rubber-stamping. Session 3's verdict is whatever
  `session-state.json` records; do not read this file for it. Live
  evidence in
  `docs/session-sets/137-copilot-cli-transport-remediation/s3-live-probe.md`:
  a 49,645-char prompt (49,794 UTF-16 units vs the 32,767 ceiling) returned
  facts planted at head, middle and tail with the ack validated and
  stripped; a 115,465-char run did the same in S1; the inline control below
  threshold still reports `handoff: false`; and a cold unelevated bootstrap
  lands `DABBLER_TRANSPORT=copilot-cli` in HKCU with HKLM untouched.
- Known gap, not fixed here: this set restored v1's Set 104 argv handoff,
  which by its own scope note fixes *transport only* — not model context
  capacity. `verify.py` still builds one monolithic bundle capped at 600 KB
  while the handoff triggers at 23 KB, so a very large session can now be
  shipped intact and still overrun comprehension. v1's second mechanism
  (`pull_verifier.py` / `pull_critique.py` / `path_aware_critique.py`,
  sets 065–069) has no v2 equivalent. Successor set planned.
- Carried forward: the catalog lock's meta `cli_version` disagreed with
  its own entries and is corrected to 1.0.68; only `gpt-5.5` is
  re-confirmed at 1.0.80, because only `gpt-5.5` was exercised. There is
  still no catalog-refresh command, so re-confirming the other 14 entries
  needs one probe each. PyPI has 1.0.0 (2026-08-15); this build is 1.0.9
  and publishing is operator-gated.

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
