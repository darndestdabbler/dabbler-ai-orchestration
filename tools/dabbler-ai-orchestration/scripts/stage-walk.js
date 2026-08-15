#!/usr/bin/env node
// UAT walk stager (Set 111 S4) — one entry point, and the walk starts itself.
//
//   npm run walk                    (from tools/dabbler-ai-orchestration)
//   npm run walk -- --keep          (do not delete the workspace on exit)
//   npm run walk -- --empty         (stage a project with no session sets)
//
// The guided-look UAT format asks for ten minutes of the operator's
// attention and nothing else: "It starts itself. The operator stages
// nothing." (Set 110 operator notes, 2026-08-05.) Before this, staging a
// walk meant running make-uat-workspace, reading the printed path, opening
// VS Code, choosing File > Open Workspace from File..., finding the folder,
// and then hunting for the Dabbler view in the activity bar. Six operator
// steps of pure ceremony before the first thing worth looking at — and the
// measured consequence was that walks stopped happening (Set 110 S2 closed
// without its walk; the operator: "We often bypass UAT ... it totally
// sucks").
//
// So this script does all six: builds a disposable fixture workspace,
// launches the real Extension Development Host against it with the same
// isolation flags the Playwright suite uses, and loads the development-only
// walk companion (scripts/walk-companion/), whose onStartupFinished
// activation reveals the Dabbler view. The operator's first action is
// looking at the thing.
//
// The reveal deliberately does NOT live in the product extension: that
// extension activates when its view becomes visible, so a reveal inside it
// would be waiting on the event it is supposed to cause. `npm run walk:smoke`
// proves the reveal actually happens.
//
// This is a WALK, not a test: no assertions, no exit-code verdict. The
// operator's judgment is the verdict, recorded in disposition.uat.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { makeUatWorkspace } = require("./make-uat-workspace.js");
const {
  EXTENSION_ROOT,
  WALK_COMPANION_PATH,
  findCodeBinary,
  launchArgs,
  electronEnv,
  makeLaunchStateDirs,
} = require("./vscode-launch.js");

function log(msg) {
  console.log(`[stage-walk] ${msg}`);
}

function parseArgs(argv) {
  const out = {
    keep: false,
    walkDoc: null,
    workspace: null,
    marker: null,
    empty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep") out.keep = true;
    else if (a === "--empty") out.empty = true;
    else if (a === "--walk-doc") out.walkDoc = argv[++i];
    else if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--marker") out.marker = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

// `--empty` stages the FIRST-RUN window: a real project folder with no
// session sets yet. Set 112 S3 added it because the Getting Started form
// rendered only in that state and the default four-set fixture could never
// show it. Set 123 S3 deleted the form — setup is `Dabbler: Set Up New
// Project` plus `python -m ai_router.verify_type` in the terminal now — but
// the mode is KEPT: the empty workspace is still the surface a new adopter
// opens first, and it is still the one the four-set fixture cannot stage.
// What an operator judges here is the empty Work Explorer and the
// palette-driven setup path, not a form.
//
// It is a real project directory, not a bare temp folder: an untitled
// window and a folder window are different surfaces, and the operator
// should judge the one a new adopter actually opens.
function makeEmptyWorkspace(targetParent) {
  const parent = targetParent || os.tmpdir();
  const dest = fs.mkdtempSync(path.join(parent, "dabbler-walk-empty-"));
  const project = path.join(dest, "my-new-project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, "README.md"),
    [
      "# my-new-project",
      "",
      "A brand-new project with no session sets, staged for a guided-look",
      "UAT of the Getting Started surface (`npm run walk -- --empty`).",
      "Disposable: this folder is deleted when the walk window closes.",
      "",
    ].join("\n"),
    "utf8"
  );
  return project;
}

function usage() {
  console.log(
    [
      "Usage: npm run walk [-- options]",
      "",
      "  --walk-doc <path>   Open this walk document alongside the fixture.",
      "  --workspace <path>  Use an existing workspace instead of a fresh one.",
      "  --empty             Stage a project with NO session sets, which is",
      "                      the only state that shows the Getting Started",
      "                      form (it flips to the list once a set exists).",
      "  --marker <path>     Write this file when the walk companion activates",
      "                      (proof the auto-reveal ran; used by the smoke check).",
      "  --keep              Leave the generated workspace on disk.",
      "  -h, --help          Show this message.",
    ].join("\n")
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  let code;
  try {
    code = findCodeBinary();
  } catch (err) {
    log(`ERROR: ${err.message}`);
    return 1;
  }

  let workspacePath;
  let generated = false;
  if (args.workspace) {
    if (!fs.existsSync(args.workspace)) {
      log(`ERROR: --workspace ${args.workspace} does not exist.`);
      return 1;
    }
    workspacePath = args.workspace;
  } else if (args.empty) {
    try {
      workspacePath = makeEmptyWorkspace();
      generated = true;
    } catch (err) {
      log(`ERROR: could not build the empty workspace: ${err.message}`);
      return 1;
    }
  } else {
    try {
      workspacePath = makeUatWorkspace();
      generated = true;
    } catch (err) {
      log(`ERROR: could not build the fixture workspace: ${err.message}`);
      return 1;
    }
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-walk-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-walk-ext-"));
  // The same per-launch platform state the Playwright harness gets. Two
  // reasons it belongs here and not only there: a walk that inherits the
  // operator's real APPDATA writes into their actual VS Code profile, and a
  // walk that launches differently from the suite shows the operator a window
  // no test ever exercised — which is the whole reason `vscode-launch.js`
  // exists.
  const launchState = makeLaunchStateDirs();

  // The walk document rides along as a second editor tab so the operator
  // reads the item and looks at the UI without alt-tabbing to a browser.
  const extraArgs = [];
  if (args.walkDoc) {
    if (fs.existsSync(args.walkDoc)) {
      extraArgs.push(path.resolve(args.walkDoc));
    } else {
      log(`WARNING: --walk-doc ${args.walkDoc} not found; continuing without it.`);
    }
  }

  const argv = launchArgs({
    extensionRoot: EXTENSION_ROOT,
    userDataDir,
    extensionsDir,
    workspacePath,
    extraArgs,
    // The companion's `onStartupFinished` activation is what actually opens
    // the Dabbler view. The product extension activates only when that view
    // becomes visible, so a reveal living inside IT would be waiting on the
    // event it is supposed to cause.
    developmentPaths: [WALK_COMPANION_PATH],
  });

  log("Staging the guided-look walk.");
  log(`  binary:    ${code}`);
  log(`  workspace: ${workspacePath}`);
  log("  the Dabbler view opens by itself; nothing to set up.");
  log("");
  log("Close the VS Code window when you are done, then record what you did");
  log("in disposition.uat.components -- one entry per component the spec");
  log("declares in uatComponents, with the method and who reviewed it.");

  const child = cp.spawn(code, argv, {
    // An ALLOWLIST, not `...process.env`. A walk is normally started from
    // VS Code's integrated terminal, whose environment carries VS Code's own
    // IPC variables (ELECTRON_RUN_AS_NODE, VSCODE_*); inheriting them flips
    // the child Code process into CLI-arg-parsing mode instead of opening the
    // isolated Extension Development Host. The Playwright harness has guarded
    // against this since Set 027 and shares the allowlist with this call.
    env: electronEnv({
      ...launchState.env,
      ...(args.marker ? { DABBLER_WALK_MARKER: args.marker } : {}),
    }),
    stdio: "ignore",
    detached: false,
  });

  const cleanup = () => {
    if (generated && !args.keep) {
      try {
        fs.rmSync(path.dirname(workspacePath), { recursive: true, force: true });
      } catch {
        /* a leftover temp dir is not worth failing the walk over */
      }
    }
    for (const dir of [userDataDir, extensionsDir, launchState.root]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* same */
      }
    }
  };

  child.on("error", (err) => {
    log(`ERROR: could not launch VS Code: ${err.message}`);
    cleanup();
    process.exitCode = 1;
  });

  child.on("exit", () => {
    if (args.keep && generated) {
      log(`Workspace kept at ${path.dirname(workspacePath)}`);
    }
    cleanup();
    log("Walk window closed.");
  });

  return 0;
}

if (require.main === module) {
  const rc = main();
  if (rc !== 0) process.exitCode = rc;
}

module.exports = { parseArgs, makeEmptyWorkspace };
