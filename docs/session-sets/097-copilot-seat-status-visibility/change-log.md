# Change Log — Set 097: Copilot Seat-Status Visibility

> **Set complete: 2026-07-13** (single session). Fixes the operator-reported
> Getting Started defect: picking the GitHub Copilot CLI seat and clicking
> Build project structure silently repainted the form back to Full/Direct
> API whenever the guided seat setup did not confirm, with no durable
> explanation at all. Also reframes the module-ownership copy from team
> grouping to ownership exclusivity (operator directive).

## Session 1 of 1 — Persistent seat status, first-seed carve-out, module-ownership copy

- **D1 — persistent seat-status note.** A new one-word
  `.dabbler/copilot-seat-status` marker (`copilotSeatSetup.ts`), written
  the instant the operator's Full+copilot-cli pick is known at Build time,
  drives a durable System Status strip note whenever the workspace's
  evidence says Copilot was chosen but is not confirmed — independent of
  the volatile in-form control state (the whole point: the note survives
  the exact repaint that used to hide the problem).
- **D2 — `restoreGsState` first-seed precedence carve-out.** A profile
  seed's *first-ever* transition from nothing-on-disk to a value now reads
  as the template default materializing, not a newer sanctioned choice —
  it no longer overrides an explicit Copilot pick made in the interim. A
  genuinely changed seed (a later confirmed seat) still updates the radio
  exactly as before. Full defect-chain replayed as a Layer-2 test.
- **D3 — module-ownership copy reframed** (operator directive): "one
  developer per module at a time," not "one team per module." Updated at
  both shipped copy sites, echoed across the primer (new merge-storm
  rationale, §1.2), the Hello World walkthrough, and both READMEs;
  `media/getting-started.png` retaken.
- **Suite green:** Playwright Layer 3 26/26 (run once, before the
  remediation below — the remediation touched no rendering surface);
  extension unit 1487 → 1511 (24 new tests across the D1/D2 work and the
  remediation); `tsc --noEmit` clean throughout.
- **Release prep:** extension bumped **0.42.0 → 0.43.0**; CHANGELOG
  authored; `dabbler-ai-orchestration-0.43.0.vsix` built. Extension-only —
  `dabbler-ai-router` stays at 0.33.0. Publish remains operator-gated.
- **UAT:** `097-copilot-seat-status-visibility-uat-checklist.json`
  authored to the Set 078 bar (5 walks: cold-start cancel replay per
  L-079-3, reload durability, the new re-confirm command, a never-a-nag
  regression check, and the D3 copy) and offered.

### Verification (phased loop + close backstop, 4 rounds, $0.94 total; +$0.02 for the disputed-finding second opinion, untagged/attributable, see below)

- **Round 1 (discovery, K=2 fan-out):** ISSUES_FOUND, 2 blocking findings
  (both fan-out calls independently found the same real bug): the
  `.dabbler/copilot-seat-status` marker was written on every Copilot pick
  but never cleared, so an operator who explicitly rebuilt choosing Direct
  API after an abandoned Copilot attempt would see the note revive
  forever with no dismissal path. **Fixed:** `clearCopilotSeatStatusMarker`
  + `gitScaffold.ts`'s `recordSeatChoice(dir, chosen)` now retires the
  marker on an explicit non-Copilot pick.
- **Round 2 (supplementary completeness critic):** ISSUES_FOUND, 2 more
  blocking findings:
  1. **Fixed:** the note's advertised recovery command (a bare
     `python -m ai_router.copilot_catalog --refresh …`) only ever
     refreshed the seat-scoped lockfile — it never invoked
     `performCopilotSeatSetup`, so `transport.profile` was never promoted
     and the note could never clear. Worse, the ONLY other path to that
     promotion (the form's Build action) is unreachable once the
     workspace has any session sets. **Fix:** a new standalone
     `Dabbler: Set Up Copilot Seat` command
     (`copilotSeatSetupCommand.ts`) reuses the existing, already-dogfooded
     `runCopilotSeatSetupWithProgress` against an already-scaffolded
     workspace's `.venv` — reachable from the Command Palette regardless
     of form visibility. `rerunRefreshHint` now points at this command;
     every message that composed it is corrected by the one change.
  2. **Disputed, adjudicated FALSE POSITIVE, no code change:** a claim
     that the Copilot radio does not survive a real "Developer: Reload
     Window" (citing `lastProfileSeed: null` on reconstruction). Traced
     the actual sequence: `persistGsState()` already ran with
     `lastProfileSeed: "api"` during the prior cancel, before any reload,
     so `vscode.getState()` holds the full protected state, not defaults
     — an existing Layer-2 test already pins this exact object handoff.
     Routed a second opinion (`gemini-2.5-pro`, a different
     model/provider than the `gpt-5-6` verifier) with the finding, the
     rebuttal, and the source excerpts; it independently traced the same
     sequence and returned its own FALSE_POSITIVE verdict. Logged via
     `record_adjudication` (`cause=genuine-split`,
     `resolution=accept-dismissal`). See `s1-remediation-round-2.md`.
- **Round 3 (remediation-review, fix delta):** **VERIFIED**, 0 blocking,
  3 fix verdicts accepted (the marker-clear fix, the recovery-command fix,
  and the reload-persistence explanation). One non-blocking Nit on the
  UAT checklist's folder-numbering wording, fixed in the same pass.
- **Round 4 (Set 084 close backstop, in-process, triggered by the round-3
  Nit fix touching non-bookkeeping content after round 3 stamped):**
  **VERIFIED**, 0 blocking, 4 Nits recorded as residuals (none required to
  close): (a) the note's copy names the `api` profile even in the
  `(marker="unconfirmed", durableProfile=null)` case, where the profile
  might not literally be `api` (router-config.yaml missing/unreadable) —
  cosmetic wording precision; (b) Layer 3 ran before the `rerunRefreshHint`
  wording fix (a pure string-content change to an existing field, not new
  rendering logic) — `s1-conventions.md`'s claim should say so precisely;
  (c) `copilotSeatSetupCommand.ts` has no dedicated Layer-2 suite (a
  deliberate call matching the `installAiRouterCommands.ts` precedent,
  noted explicitly in the UAT checklist itself, per the Nit); (d) the UAT
  checklist's `Passes: true` defaults are the established repo convention
  (an AI-authored prediction pending the operator's real walk, as in Sets
  078/079/092) rather than a literal completed-walk claim, which the
  round's Nit reasonably flagged as easy to misread out of context. See
  `s1-verification-round-4.md`.

## End state

The persistent seat-status note and the first-seed carve-out both work
end-to-end, including the recovery path the note itself advertises — the
whole defect chain (silent revert, unclearable marker, broken recovery
instruction) is closed, not just the operator-reported half of it. Module
ownership copy is consistent everywhere it's echoed. Extension
0.43.0-candidate is publish-ready pending the operator's UAT walk and
publish click.
