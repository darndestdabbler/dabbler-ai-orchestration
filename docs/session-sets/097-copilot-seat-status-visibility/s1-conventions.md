# Conventions block — Set 097 Session 1

**Suite baseline (all re-run fresh at close, all green):** extension unit
1511 passing (1487 pre-session baseline + 21 new from the initial D1/D2/D3
work + 3 net new from the S1 discovery/supplementary remediation: 2
clear-marker tests, 1 explicit-clear-on-rebuild test replacing a pre-fix
one); Playwright Layer 3 26/26 passing (run before the remediation; the
remediation touched no webview-rendering surface, only
gitScaffold.ts/copilotSeatSetup.ts Node-side bookkeeping and a new
Command-Palette-only command, so it was not re-run); `tsc --noEmit` clean.
`ai_router` pytest suite is untouched by this session (zero files under
`ai_router/` changed) and is not re-run here.

**Release contract:** extension-only bump `0.42.0 -> 0.43.0`
(`tools/dabbler-ai-orchestration/package.json` + `CHANGELOG.md`); the
`dabbler-ai-router` package stays at `0.33.0` (no `ai_router/` changes).
A local `dabbler-ai-orchestration-0.43.0.vsix` is built for UAT; publish to
the Marketplace stays operator-gated (out of session scope).

**By-design exclusions / non-goals (from spec.md):**
- No change to the Set 086 confirmation gate itself — `transport.profile:
  copilot-cli` is still written only on a confirmed (>=2 provider) seat; no
  optimistic write, no weakening of `describeSeatSetupOutcome`'s honesty
  rules.
- No Marketplace publish or tag push in this session (operator-gated, as
  always).
- The one-off screenshot-capture Playwright spec
  (`_capture-getting-started.spec.ts`) used to retake `media/getting-started.png`
  was deleted after the capture ran — it is evidence of HOW the asset was
  produced, not a shipped test, and will not appear in the working-tree diff.

**Known pre-existing issue, unrelated to this session:** `python -m
ai_router.report` raises `UnicodeEncodeError` on a cp1252 console (the
already-tracked L-079-1 lesson class) — encountered while checking spend
before this session's verification, worked around with
`PYTHONIOENCODING=utf-8`. Not touched by this session's diff; not a finding
against this session's work.
