// The walk companion — a development-only extension whose entire job is to
// make a guided-look UAT walk start ON the thing worth looking at.
//
// Why this exists as a SEPARATE extension rather than three lines in
// `src/extension.ts`:
//
// The first cut put the reveal inside the product extension's `activate()`,
// gated on `DABBLER_WALK=1`. It could never fire. The product extension
// declares `"activationEvents": []` and contributes views, so VS Code
// generates `onView:` activation for it — meaning it activates when the
// Dabbler view becomes VISIBLE. A window opens on the file Explorer, the
// Dabbler view is not visible, the extension does not activate, and the code
// that would have revealed the view never runs. The reveal was waiting on the
// event it was supposed to cause.
//
// The obvious repair — adding `onStartupFinished` to the product extension —
// buys a dev-only convenience by making every user's window activate the
// extension at startup, which is the exact cost Set 110 spent a session
// measuring and reducing. So the startup activation lives HERE instead, in an
// extension that only ever loads under `--extensionDevelopmentPath` from the
// walk stager. The product extension is left with no walk-specific code at
// all, which is also what the portability rule asks for.
//
// Packaging: `scripts/**` is excluded by `.vscodeignore`, so this never
// reaches the VSIX.

"use strict";

const fs = require("fs");
const vscode = require("vscode");

const CONTAINER = "workbench.view.extension.dabblerSessionSetsContainer";

async function activate() {
  const marker = process.env.DABBLER_WALK_MARKER;
  let outcome;
  try {
    await vscode.commands.executeCommand(CONTAINER);
    outcome = "revealed";
  } catch (err) {
    // Failing to reveal a view must never break the walk; the operator can
    // still click the activity bar, and this says so out loud.
    outcome = `failed: ${err && err.message ? err.message : String(err)}`;
    console.error(
      "[dabbler-walk-companion] could not reveal the Dabbler view container; " +
        "open it from the activity bar.",
      err
    );
  }

  // Evidence hook for the stager's smoke check. Written AFTER the command
  // resolves and carrying its outcome, so the marker proves the REVEAL ran --
  // not merely that this extension loaded. The distinction is the whole bug
  // this companion exists to fix: the previous implementation activated
  // (eventually) and still never revealed anything.
  if (marker) {
    try {
      fs.writeFileSync(
        marker,
        `${outcome} ${CONTAINER} ${new Date().toISOString()}\n`,
        "utf8"
      );
    } catch {
      /* the marker is diagnostics, never a reason to fail the walk */
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate, CONTAINER };
