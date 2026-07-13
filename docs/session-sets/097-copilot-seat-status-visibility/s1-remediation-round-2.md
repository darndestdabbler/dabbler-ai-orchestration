# Remediation notes — round 2 (supplementary completeness critic, 2 findings)

- **The advertised re-run instruction never actually promotes
  `transport.profile` (finding 1) — FIXED.** The bare
  `python -m ai_router.copilot_catalog --refresh …` command
  (`rerunRefreshHint`) only ever refreshed the seat-scoped lockfile —
  `copilot_catalog.py` has no knowledge of `router-config.yaml` at all —
  so an operator who followed the instruction verbatim could confirm
  ≥2 providers and still see the persistent note forever, because
  nothing ever invoked `performCopilotSeatSetup`'s confirmation-gated
  config write. Worse, the ONLY other path to that function
  (`buildProjectStructureNoPrompt`'s Build action) is unreachable once
  the workspace has any session sets at all — the Getting Started form
  simply isn't rendered in "list" mode. Fixed with a new standalone
  command, `Dabbler: Set Up Copilot Seat`
  (`src/commands/copilotSeatSetupCommand.ts`, registered in
  `extension.ts`, contributed in `package.json`), which reuses
  `runCopilotSeatSetupWithProgress` UNCHANGED against an
  already-scaffolded workspace's existing `.venv` (erroring with a clear
  message if no `.venv` exists yet) and records the seat choice the same
  way the Build action does. `rerunRefreshHint` (copilotSeatSetup.ts) now
  returns `'run "Dabbler: Set Up Copilot Seat" from the Command
  Palette'` instead of the broken terminal command — every message that
  composes it (the persistent strip note, all of
  `describeSeatSetupOutcome`'s variants, and the skip-install-incomplete
  warning) is corrected by this ONE change, since they all thread the
  same shared string through. Tests updated: the relocated
  `rerunRefreshHint` suite in copilotSeatSetup.test.ts now asserts the
  command-palette wording; `gitScaffoldSeatSetup.test.ts`'s
  "--seat-id"-based assertions replaced with
  `"Dabbler: Set Up Copilot Seat"`; the `describeSeatSetupOutcome` fixture
  hint updated to the realistic current string (its own stale comment,
  about a prior S5 finding on a FICTIONAL command name, corrected — the
  command is real now).
- **Post-reload Copilot-radio persistence (finding 2) — DISPUTED, ADJUDICATED FALSE POSITIVE, no code change.**
  The finding claimed `restoreGsState` sees `lastProfileSeed: null` after
  a real "Developer: Reload Window", so the D2 first-seed carve-out
  cannot protect the radio and it silently reverts. Traced the actual
  sequence: `persistGsState()` in client.js runs immediately after EVERY
  seed-application, including the FIRST one — so by the time Walk 2's
  reload happens, `vscode.getState()` already holds
  `{transportProfile: "copilot-cli", profileDirty: true, lastProfileSeed:
  "api"}` from Walk 1's cancel, not the defaults the finding assumed.
  Reload destroys the script's in-memory JS (the `lastSeedProfile`
  sentinel, the `gsState` variable) but NOT `vscode.getState()`'s stored
  data — VS Code's documented purpose for that API. An EXISTING passing
  Layer-2 test (`gettingStartedHtml.test.ts`, "full defect-chain replay:
  null seed, dirty Copilot pick, unconfirmed build seeds api") already
  replays this exact object handoff. Routed a second opinion
  (`route(task_type="analysis")`, landed on `gemini-2.5-pro` — a
  different provider/model than the `gpt-5-6` verifier that raised the
  finding) with the finding, the rebuttal, and the relevant source
  excerpts; it independently traced the same sequence field-by-field and
  returned its own **FALSE_POSITIVE** verdict, agreeing that the radio
  survives the reload. Logged via
  `ai_router.metrics.record_adjudication` (`task_type="analysis"` — never
  `"session-verification"`, per the known backstop-unstamped-row issue;
  `cause="genuine-split"`, `resolution="accept-dismissal"`).

Suite after this round's fix: extension unit 1511 passed (unchanged
count from round 1 — the fix wording change touched no test-count
boundary, only string content); `tsc --noEmit` clean.
