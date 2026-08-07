#!/usr/bin/env node
// UAT walk stager (Set 111 S4) — one entry point, and the walk starts itself.
//
//   npm run walk                    (from tools/dabbler-ai-orchestration)
//   npm run walk -- --keep          (do not delete the workspace on exit)
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
// isolation flags the Playwright suite uses, and sets DABBLER_WALK=1 so the
// extension reveals its own view on activation. The operator's first action
// is looking at the thing.
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
const { EXTENSION_ROOT, findCodeBinary, launchArgs } = require("./vscode-launch.js");

function log(msg) {
  console.log(`[stage-walk] ${msg}`);
}

function parseArgs(argv) {
  const out = { keep: false, walkDoc: null, workspace: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep") out.keep = true;
    else if (a === "--walk-doc") out.walkDoc = argv[++i];
    else if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(
    [
      "Usage: npm run walk [-- options]",
      "",
      "  --walk-doc <path>   Open this walk document alongside the fixture.",
      "  --workspace <path>  Use an existing workspace instead of a fresh one.",
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
  });

  log("Staging the guided-look walk.");
  log(`  binary:    ${code}`);
  log(`  workspace: ${workspacePath}`);
  log("  the Dabbler view opens by itself (DABBLER_WALK=1); nothing to set up.");
  log("");
  log("Close the VS Code window when you are done, then record the walk in");
  log("disposition.uat (status 'walked' + walkArtifact + attestation).");

  const child = cp.spawn(code, argv, {
    // DABBLER_WALK is read by the extension's activate() to reveal the
    // Dabbler view container. It is set ONLY here, so no ordinary launch
    // (and no Playwright spec) changes behavior because of it.
    env: { ...process.env, DABBLER_WALK: "1" },
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
    for (const dir of [userDataDir, extensionsDir]) {
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

module.exports = { parseArgs };
