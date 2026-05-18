# Session 3 review — per-session-set identity (v0.15.0)

**Verdict:** VERIFIED
**Date:** 2026-05-18
**Verifier:** Gemini Pro (Gemini 2.5 Pro) — gpt-5-4 was rate-limited
on the OpenAI Responses endpoint; cross-provider verification
satisfied via the Gemini Pro escape path.
**Total cost:** $0.085 across 3 rounds (forecast $0.10–$0.30).

---

## Round-by-round summary

| Round | Scope | Tokens (in/out) | Cost | Verdict |
|---|---|---|---|---|
| A | Writer (`write-orchestrator-marker.js`) + marker schema doc | 10,889 / 428 | $0.018 | VERIFIED clean |
| B | Reader + `SessionSetsModel` + refactored `SessionSetsProvider` + Playwright spec + CHANGELOG | 27,264 / 1,296 | $0.047 | MUST-FIX (3) |
| C | Post-fix reader only | 13,129 / 333 | $0.020 | VERIFIED |

---

## Round-B MUST-FIX items + fixes

| Q | Finding | Fix |
|---|---|---|
| Q5 | Slug-validation truthiness bug: `marker.sessionSetSlug && ...` would let `null` / `""` through as "absent" rather than "mismatch" | Tightened to `marker.sessionSetSlug !== undefined && ...`. An empty-string slug now correctly fails the mismatch check and routes to empty state |
| Q6 | `setUpStateWatcher()` is only called once at view resolution; if `workspaceFolders` is empty then, the watcher never binds and the 60s poll is the only signal | Added `vscode.workspace.onDidChangeWorkspaceFolders` listener; on fire, disposes the stale state watcher and re-runs `setUpStateWatcher()` + `rebindMarkerWatcher()` + `scheduleRender()`. Listener is itself disposed by `tearDownWatchers()` |
| Q8 | Spec says reader "logs" on slug mismatch, but the implementation fell silent | Added lazy `getOutputChannel()` creating "Dabbler Orchestrator Indicator" on first append; slug-mismatch branch in `computeState()` now logs timestamped line with both slugs + the resolved marker path |

**Deferred suggest item (Round B Q8):** end-to-end ambiguous
scenario launching VS Code with two in-progress sets. The
helper-side scenario J already exercises the writer's
fail-closed behavior; the reader's empty-state-on-unresolved is
exercised by G + I. Deferred to S4 alongside the custom tree's
empty-state rework.

---

## Process notes

- **gpt-5-4 429 sticky window.** The initial single-round
  101k-char bundle hit 429 on the OpenAI Responses endpoint. The
  Round A re-bundle at 37k chars also hit 429 — the rate-limit
  window was still active. Switching the verifier to
  `model="gemini-pro"` cleared the call in one attempt and stayed
  clean for B + C. Worth adding to memory
  `feedback_split_large_verification_bundles` as a secondary
  observation: shrinking the bundle doesn't help if the sticky
  window is still active; cross-provider escape is the right move.
- **Gemini Pro verifier quality.** Surfaced concrete, code-grade
  fixes (specific lines + replacement code blocks) rather than
  the meta-commentary failure mode flagged in earlier memories.
  The three MUST-FIX items were all narrowly-scoped and converged
  cleanly on a single confirmation pass — no spiral per memory
  `feedback_verifier_spiral_recruit_codex`. Quality was at least
  equivalent to typical gpt-5-4 sessions, arguably better on the
  "actionable-output" axis.
- **Self-protecting `.gitignore` design.** The spec called for
  "auto-patch existing repos non-interactively on next workspace
  init" but there's no `scripts/init-workflow.py` to patch from.
  The writer-side drop (`*\n!.gitignore\n` inside each per-set
  `.dabbler/`) became the canonical mechanism. Round A
  acknowledged it as "a sufficient and elegant mitigation that
  satisfies the intent of the auto-patch requirement by making
  the marker's parent directory self-ignoring on first write."

---

## Artifacts in this directory

- `prompt-round-a.md` + `prompt-round-a.rendered.md` — Round A
  prompt + bundled-content rendered version
- `route_verify_round_a.py` — Round A verifier script
- `verify-result-round-a.json` — Round A raw verifier output
  (Gemini Pro, $0.018, VERIFIED)
- `prompt-round-b.md` + `prompt-round-b.rendered.md`
- `route_verify_round_b.py`
- `verify-result-round-b.json` — Round B raw output (Gemini Pro,
  $0.047, MUST-FIX × 3)
- `prompt-round-c.md` + `prompt-round-c.rendered.md`
- `route_verify_round_c.py`
- `verify-result-round-c.json` — Round C raw output (Gemini Pro,
  $0.020, VERIFIED)
- `prompt.md` + `route_verify.py` — the initial single-round
  attempt that hit gpt-5-4 429 at 101k chars; kept for the
  rate-limit incident audit trail. The `route_verify.py` was
  not re-run after the split into A/B/C.
