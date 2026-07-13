# Remediation notes — round 1 (discovery fan-out, 2 findings / 1 distinct)

- **The never-cleared marker permanently revives a false "Copilot
  unconfirmed" warning after an explicit rebuild away from Copilot (call 1
  and call 2, same root cause):** an operator who attempted the Copilot
  seat, failed to confirm it, then explicitly rebuilt choosing "Direct
  provider API keys" instead had no way to dismiss the note — the marker
  was written on every Copilot pick but never cleared on any other pick,
  so `deriveCopilotSeatChosenUnconfirmed` kept returning `true` forever.
  Fixed: `clearCopilotSeatStatusMarker` (copilotSeatSetup.ts) removes the
  marker file; `buildProjectStructureNoPrompt` (gitScaffold.ts) now records
  the build's explicit Full-tier pick every time — `chosen: true` (write
  "unconfirmed") when this build's pick is `copilot-cli`, `chosen: false`
  (clear) when the pick is explicitly `api`. A Lightweight build or a
  legacy Command-Palette caller with no `transportProfile` at all touches
  neither state — they never answered the Copilot question, so clearing
  would destroy evidence of an attempt they weren't asked about.
  `BuildStructureSeams.markSeatChosen` renamed to `recordSeatChoice(dir,
  chosen)` to carry the new boolean. Tests: `clearCopilotSeatStatusMarker:
  removes an existing marker; reader then sees null`,
  `clearCopilotSeatStatusMarker: a no-op, not an error, when no marker
  exists` (copilotSeatSetup.test.ts); `full+api: an explicit non-Copilot
  rebuild CLEARS a stale marker` (gitScaffoldSeatSetup.test.ts, replacing
  the pre-fix assertion that this path never touched the marker at all).

Suite after remediation: extension unit 1511 passed (1508 pre-remediation +
3 new: 2 clear-marker tests, 1 explicit-clear-on-rebuild test, net of the
one pre-fix test it replaced); `tsc --noEmit` clean. `ai_router` pytest and
Playwright Layer 3 untouched by this remediation (no `ai_router/` or
webview-rendering files touched — the fix is entirely in
`gitScaffold.ts`/`copilotSeatSetup.ts`'s Node-side marker bookkeeping).
