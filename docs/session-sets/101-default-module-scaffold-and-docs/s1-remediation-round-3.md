# Session 1 — Remediation round 3 (the real first-run walkthrough, done)

## What happened

Remediation-review round 5 (`s1-verification-round-5.md` /
`s1-issues-round-5.json`) accepted 3 of the 4 ledger findings but
**rejected** the round-2 fix for L5 (the "locally built VSIX
walkthrough"): the offline command-wiring stub test proves the callback
dispatch, not the real interactive journey the spec's "Ends with" line
names verbatim. The operator then directed continued work on the real
walkthrough (upgrading the orchestrator model) rather than adjudicating
the finding away.

## Resolution: the demanded walkthrough now EXISTS and PASSES

`src/test/playwright/vsix-first-run-walkthrough.spec.ts` — a real VS
Code Electron instance running the identical compiled
`dist/extension.js` the .vsix packages (`--extensionDevelopmentPath`,
the mechanism this repo's whole Layer-3 suite already treats as the
locally-built-extension harness), driving the complete first-run loop
through the extension's ACTUAL UI, no seams, no fixture seeding:

1. **Build** — clicks the real `Build project structure` button in the
   real Getting Started webview form (budget filled first, as a real
   operator must): real git init, real template render, real venv +
   network `pip install`, and the new default-module + lifecycle-set
   scaffold. Asserts the rendered tree: one declared `Default` module,
   two pending sets, no pseudo-module.
2. **Rename** — `Dabbler: Rename Module` through the real Command
   Palette → real QuickPick (sole module accepted) → two real InputBoxes
   (slug `default`→`greeter`, title `Default`→`Greeter`) → the real
   modal confirm clicked. Asserts the tree regrouped under `Greeter`
   with both lifecycle sets restamped (still 2 rows).
3. **Delete** — `Dabbler: Delete Module` → QuickPick → modal confirm.
   Asserts the module row is gone.
4. **Re-add** — `Dabbler: New Module` → two real InputBoxes
   (`payments` / `Payments`). Asserts a fresh module with its newly
   scaffolded plan/decomposition pair (2 rows).

Run result: **PASS** (23s with a warm pip cache; the spec's own timeout
allows the cold-cache case). The earlier "technically infeasible"
judgment — mine, seconded by the routed third opinion — was **wrong**,
and the round-5 verifier was right to hold the line. Getting it working
required five real discoveries, each now documented in the spec header
so they never have to be re-learned:

1. The extension activates on view reveal (`activationEvents: []`) — a
   palette command invoked before opening the Work Explorer does not
   exist yet.
2. The Getting Started form's Build click handler validates the
   verification-budget field client-side and silently no-ops on an
   empty value — the "25" in the box is a placeholder, not a value.
3. F1 pre-fills the palette's `>` command prefix and Playwright's
   `fill()` replaces the whole value — the query silently becomes a
   file search unless the prefix is re-included.
4. A QuickPick's placeHolder is an input attribute, not rendered text —
   `hasText` filters never match it; an InputBox's prefilled value
   (`toHaveValue`) is the clean content-swap signal on VS Code's single
   reused quick-input widget.
5. `window.dialogStyle` defaults to **native** on desktop (verified in
   the shipped 1.128 build), so modal confirms are OS dialogs Playwright
   cannot see; launching with `--enable-smoke-test-driver` (the facility
   VS Code's own smoke tests use — the dialog handler ORs it with the
   custom-style setting) forces clickable HTML dialogs.
   `electronLaunch.ts`'s `launchVSCode` gained an additive optional
   `extraArgs` parameter to pass it.

## Honest scope note

The harness remains `--extensionDevelopmentPath` over the identical
compiled `dist/extension.js` + `media/` assets the `.vsix` packages
(plus `vsce package` succeeding as the packaging proof), not a literal
`code --install-extension` of the .vsix file — the install-based
harness is the documented-broken `@vscode/test-electron` path on this
machine. Everything the round-5 finding named as unverified — packaged
activation, actual command dispatch through VS Code, and the rename /
delete / re-add UI integration — is now exercised for real.
