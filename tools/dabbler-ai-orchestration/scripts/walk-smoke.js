#!/usr/bin/env node
// Walk smoke check (Set 111 S4 remediation) — proves the walk starts ITSELF.
//
//   npm run walk:smoke
//
// The guided-look format's first promise is "it starts itself. The operator
// stages nothing." That promise was shipped broken once already: the reveal
// lived inside the product extension's `activate()`, and the product
// extension only activates when its view becomes VISIBLE — so the code that
// was supposed to open the view was waiting on the view being open. Nothing
// caught it, because "the walk starts itself" was a claim about a window
// nobody had launched in a test.
//
// So the claim is now checkable. This launches the real stager, waits for the
// walk companion to write its marker, and asserts the marker says the reveal
// COMMAND SUCCEEDED — not merely that an extension loaded. Exit code 0 means
// a fresh `npm run walk` lands the operator on the Dabbler view.
//
// It is deliberately not in CI: it opens a real window, and a headless runner
// would be testing a different thing than the operator's machine does.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TIMEOUT_MS = 180_000;
const POLL_MS = 1_000;

function log(msg) {
  console.log(`[walk-smoke] ${msg}`);
}

function main() {
  const marker = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-walk-smoke-")),
    "reveal.txt"
  );

  log("launching the stager (a VS Code window will open, then close itself)");
  const child = cp.spawn(
    process.execPath,
    [path.join(__dirname, "stage-walk.js"), "--marker", marker],
    { stdio: "inherit" }
  );

  const started = Date.now();
  const finish = (code, message) => {
    log(message);
    try {
      fs.rmSync(path.dirname(marker), { recursive: true, force: true });
    } catch {
      /* opportunistic */
    }
    try {
      child.kill();
    } catch {
      /* the window may already be gone */
    }
    process.exitCode = code;
  };

  const poll = () => {
    let contents = null;
    try {
      contents = fs.readFileSync(marker, "utf8").trim();
    } catch {
      contents = null;
    }
    if (contents) {
      if (contents.startsWith("revealed ")) {
        finish(0, `PASS: ${contents}`);
      } else {
        finish(1, `FAIL: the companion ran but the reveal did not: ${contents}`);
      }
      return;
    }
    if (Date.now() - started > TIMEOUT_MS) {
      finish(
        1,
        "FAIL: no marker after " +
          `${Math.round(TIMEOUT_MS / 1000)}s. The walk companion did not ` +
          "activate, so the walk would open on the file Explorer."
      );
      return;
    }
    setTimeout(poll, POLL_MS);
  };

  setTimeout(poll, POLL_MS);
}

if (require.main === module) main();
