#!/usr/bin/env node
// Shared VS Code Electron launch inputs (Set 111 S4).
//
// The Playwright Layer 3 harness (src/test/playwright/electronLaunch.ts) and
// the UAT walk stager (scripts/stage-walk.js) both need to answer the same
// two questions: WHICH Code binary, and WITH WHICH isolation flags. Before
// this module they answered them separately, which is the sibling-site
// duplication L-069-1 warns about — and here the consequence is specific:
// if the walk launches with different flags than the tests, the operator is
// looking at a window the suite never exercised.
//
// Binary discovery order (unchanged from the Set 027 harness):
//   1. VSCODE_BIN env var (CI / dev override)
//   2. Newest .vscode-test/vscode-<platform>-archive-<x.y.z>/Code(.exe)
//   3. Throw — never fall back to a system install, because a system VS
//      Code launches with the operator's real profile and pollutes their
//      Recently Opened list.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const fs = require("fs");
const path = require("path");

const EXTENSION_ROOT = path.resolve(__dirname, "..");

// The flags that make a launch ISOLATED and non-interactive. Both consumers
// must pass all of these; `src/test/suite/walkStager.test.ts` pins the list
// against the harness source so the two cannot silently diverge.
const ISOLATION_FLAGS = [
  "--disable-workspace-trust",
  "--skip-release-notes",
  "--skip-welcome",
  "--disable-telemetry",
  "--disable-updates",
  "--new-window",
];

function _parseCachedVersion(dirName) {
  const m = dirName.match(/(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function _cmpVersion(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/**
 * Resolve the VS Code executable to drive, or throw with an actionable
 * message. `testRoot` overrides the .vscode-test directory for unit tests.
 */
function findCodeBinary(testRoot) {
  if (process.env.VSCODE_BIN) {
    if (!fs.existsSync(process.env.VSCODE_BIN)) {
      throw new Error(
        `VSCODE_BIN is set to ${process.env.VSCODE_BIN} but that path does ` +
          "not exist."
      );
    }
    return process.env.VSCODE_BIN;
  }
  const root = testRoot || path.join(EXTENSION_ROOT, ".vscode-test");
  if (!fs.existsSync(root)) {
    throw new Error(
      `No VS Code binary found: ${root} does not exist. Run ` +
        "'npm run test:playwright' once to download it, or set VSCODE_BIN."
    );
  }
  const archives = fs
    .readdirSync(root)
    .filter((d) => d.startsWith("vscode-"))
    .sort((a, b) => _cmpVersion(_parseCachedVersion(a), _parseCachedVersion(b)));
  for (const dir of archives) {
    for (const rel of [
      "Code.exe",
      path.join("Contents", "MacOS", "Electron"),
      "code",
    ]) {
      const candidate = path.join(root, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    `No VS Code binary found under ${root}. Run 'npm run test:playwright' ` +
      "once to download it, or set VSCODE_BIN."
  );
}

/**
 * Build the full argv for an isolated Extension Development Host launch.
 * `userDataDir` / `extensionsDir` must be fresh per launch so concurrent
 * runs cannot fight over profile state.
 */
function launchArgs(opts) {
  const {
    extensionRoot = EXTENSION_ROOT,
    userDataDir,
    extensionsDir,
    workspacePath,
    extraArgs = [],
  } = opts || {};
  if (!userDataDir || !extensionsDir || !workspacePath) {
    throw new Error(
      "launchArgs requires userDataDir, extensionsDir and workspacePath"
    );
  }
  return [
    `--extensionDevelopmentPath=${extensionRoot}`,
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    ...ISOLATION_FLAGS,
    ...extraArgs,
    workspacePath,
  ];
}

module.exports = {
  EXTENSION_ROOT,
  ISOLATION_FLAGS,
  findCodeBinary,
  launchArgs,
};
