#!/usr/bin/env node
// Shared VS Code Electron launch inputs (Set 111 S4).
//
// The Playwright Layer 3 harness (src/test/playwright/electronLaunch.ts) and
// the UAT walk stager (scripts/stage-walk.js) both need to answer the same
// three questions: WHICH Code binary, WITH WHICH isolation flags, and IN
// WHICH environment. Before this module they answered them separately, which
// is the sibling-site duplication L-069-1 warns about — and here the
// consequence is specific: if the walk launches differently than the tests,
// the operator is looking at a window the suite never exercised.
//
// This file is THE definition of all three. `electronLaunch.ts` requires it
// and re-exports, rather than keeping a second copy: the first cut of this
// module re-implemented binary discovery from the Set 027 harness and
// silently dropped the macOS `.app`-bundle search the harness had grown since
// — so `npm run walk` was broken on macOS the day it shipped, in a
// duplication introduced by the commit whose stated purpose was removing
// duplication.
//
// Binary discovery order:
//   1. VSCODE_BIN env var (CI / dev override)
//   2. Newest .vscode-test/vscode-<platform>-*-<x.y.z>/ — searched per
//      platform, including macOS `.app` bundles
//   3. Throw — never fall back to a system install, because a system VS
//      Code launches with the operator's real profile and pollutes their
//      Recently Opened list.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const fs = require("fs");
const os = require("os");
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

// Explicit allowlist for Electron-launch environment variables.
//
// This guards against IDE host pollution: when either consumer is run from
// VS Code's integrated terminal — which is the NORMAL way an operator starts
// a walk — the parent environment carries VS Code's own IPC variables
// (ELECTRON_RUN_AS_NODE, VSCODE_*). Inheriting them flips the child Code
// process into CLI-arg-parsing mode instead of launching a window. An
// allowlist beats a blocklist here: new IDE variables (APPCODE_*, CURSOR_*)
// are excluded by default rather than by remembering to ban them.
const ENV_ALLOWLIST_UNIVERSAL = [
  "PATH", "PATHEXT",              // executable search path (Windows includes PATHEXT)
  "HOME", "USERPROFILE", "USER", "USERNAME",
  "DABBLER_STARTUP_TIMING_PATH",  // opt-in host timing evidence
  "TEMP", "TMP", "TMPDIR",
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_NUMERIC", "LC_TIME",
  "TERM", "COLORTERM",
];

const ENV_ALLOWLIST_WINDOWS = [
  "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
  "APPDATA", "LOCALAPPDATA",
];

const ENV_ALLOWLIST_GUI = [
  "DISPLAY",                        // X11 (Linux)
  "XAUTHORITY",                     // X11 auth cookie — xvfb-run creates one;
                                    // without it the X connection is refused
                                    // and Electron dies with "The platform
                                    // failed to initialize" (ui/aura)
  "WAYLAND_DISPLAY",                // Wayland (Linux/macOS)
  "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE",  // XDG desktop (Linux)
  "DBUS_SESSION_BUS_ADDRESS",       // D-Bus session (Linux)
  "DESKTOP_SESSION", "GDMSESSION",  // GNOME/session (Linux)
];

/**
 * Build the sanitized child environment for an Electron launch.
 *
 * `extra` adds launch-specific variables AFTER filtering, so a caller can
 * pass something the allowlist deliberately does not carry.
 */
function electronEnv(extra, sourceEnv, platform) {
  const env = sourceEnv || process.env;
  const plat = platform || process.platform;
  const allowed = new Set([
    ...ENV_ALLOWLIST_UNIVERSAL,
    ...ENV_ALLOWLIST_GUI,
    ...(plat === "win32" ? ENV_ALLOWLIST_WINDOWS : []),
  ]);
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    if (allowed.has(k)) out[k] = v;
  }
  out.ELECTRON_ENABLE_LOGGING = "1";
  return { ...out, ...(extra || {}) };
}

/**
 * Create a fresh set of per-launch state directories and return the
 * environment overlay that points a VS Code launch at them.
 *
 * `--user-data-dir` and `--extensions-dir` scope VS Code's OWN profile. They
 * do not scope the state directories the PLATFORM names, and those are shared
 * machine-wide: APPDATA / LOCALAPPDATA on Windows, and everything reached
 * through HOME elsewhere (`~/.config/Code` on Linux, `~/Library/Application
 * Support/Code` on macOS). Before this, every concurrent launch shared them.
 *
 * Measured 2026-08-10, 35 Layer 3 tests at 8 workers on a 14-core host:
 *
 *   shared APPDATA   304.7s   2 failed (icon-render-mechanism, module-tier)
 *   scoped APPDATA   275.3s   35 passed
 *
 * Shared state was both CORRUPTING and SERIALIZING the launches — the two
 * failures had been assumed to be CPU starvation and were not. That is why
 * this is a correctness fix independent of any worker count, and why the walk
 * stager wants it as much as the test harness does: a walk launched against
 * the operator's real machine-wide profile both pollutes it and shows the
 * operator a window no test ever exercised.
 *
 * HOME / USERPROFILE are scoped too, deliberately. Scoping only the AppData
 * pair would make this a Windows-only fix, leaving both Linux and macOS
 * runners sharing state the moment either runs more than one worker. Nothing
 * in this repo depends on the launched window reading a real home directory:
 * the sample-project scaffold sets `git config --local` identity precisely
 * because it targets a machine with no global identity.
 *
 * `baseDir` and `platform` are injected so the Layer 2 suite can drive the
 * non-Windows branches from a Windows host, which is where this repo's
 * platform bugs have historically hidden.
 *
 * Returns `{ root, env }`. `root` is the single directory a caller removes at
 * teardown — every path in `env` lives under it, so one `rmSync` cleans up.
 */
function makeLaunchStateDirs(opts) {
  const { baseDir, platform } = opts || {};
  const plat = platform || process.platform;
  const root = fs.mkdtempSync(
    path.join(baseDir || os.tmpdir(), "dabbler-launch-state-")
  );
  const env = { HOME: root, USERPROFILE: root };
  if (plat === "win32") {
    // Mirror the real profile layout, which is `<USERPROFILE>/AppData/
    // Roaming` and `<USERPROFILE>/AppData/Local` -- not `<root>/Roaming`.
    // Since HOME and USERPROFILE are `root` here, anything that derives an
    // AppData path from the profile instead of reading the environment
    // variable lands in the same place the variable points, rather than in
    // a sibling directory that only looks right.
    const roaming = path.join(root, "AppData", "Roaming");
    const local = path.join(root, "AppData", "Local");
    fs.mkdirSync(roaming, { recursive: true });
    fs.mkdirSync(local, { recursive: true });
    env.APPDATA = roaming;
    env.LOCALAPPDATA = local;
  }
  return { root, env };
}

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
 * macOS executable names inside `<bundle>.app/Contents/MacOS/`, most likely
 * first. VS Code has shipped its main binary under more than one name across
 * versions, so this is a preference order rather than a single guess.
 */
const DARWIN_EXEC_PREFERENCE = [
  "Electron",
  "Code Helper",
  "Visual Studio Code",
  "Code",
];

/**
 * Resolve the launchable VS Code executable inside one downloaded version
 * directory, or null when there isn't one.
 *
 * Pure + injected IO so the Layer-2 suite can drive the macOS branch from any
 * host — which matters, because the bug this exists to prevent was macOS-only
 * and therefore invisible to everyone developing on Windows or Linux.
 */
function resolveCodeExecutable(versionDir, platform, io) {
  if (platform === "darwin") {
    // The .app bundle is normally a child of the version dir, but tolerate the
    // version dir itself already being the bundle.
    const bundles = [];
    if (io.exists(path.join(versionDir, "Contents", "MacOS"))) {
      bundles.push(versionDir);
    }
    for (const entry of io.readdir(versionDir)) {
      if (entry.endsWith(".app")) bundles.push(path.join(versionDir, entry));
    }
    for (const bundle of bundles) {
      const macOsDir = path.join(bundle, "Contents", "MacOS");
      if (!io.exists(macOsDir) || !io.isDirectory(macOsDir)) continue;
      const present = io.readdir(macOsDir);
      for (const preferred of DARWIN_EXEC_PREFERENCE) {
        if (present.includes(preferred)) return path.join(macOsDir, preferred);
      }
      // Unknown name, but there is exactly one thing in there — take it rather
      // than fail on a rename we have not seen yet.
      if (present.length === 1) return path.join(macOsDir, present[0]);
    }
    return null;
  }

  if (platform === "win32") {
    const exact = path.join(versionDir, "Code.exe");
    if (io.exists(exact)) return exact;
    const exe = io.readdir(versionDir).find((e) => e.toLowerCase().endsWith(".exe"));
    return exe ? path.join(versionDir, exe) : null;
  }

  // Linux (and anything else): the tarball puts `code` at the top level.
  for (const rel of [["code"], ["bin", "code"]]) {
    const candidate = path.join(versionDir, ...rel);
    if (io.exists(candidate)) return candidate;
  }
  return null;
}

/**
 * One line describing what a version directory actually contains, for the
 * failure message. An error that says only "no usable binary" costs a whole
 * CI cycle to diagnose.
 */
function describeVersionDir(versionDir, platform, io) {
  const name = path.basename(versionDir);
  if (!io.exists(versionDir)) return `${name} (missing)`;
  const top = io.readdir(versionDir);
  if (platform !== "darwin") return `${name} -> [${top.join(", ") || "empty"}]`;
  const parts = [];
  for (const entry of top) {
    if (!entry.endsWith(".app")) continue;
    const macOsDir = path.join(versionDir, entry, "Contents", "MacOS");
    parts.push(
      io.exists(macOsDir)
        ? `${entry}/Contents/MacOS -> [${io.readdir(macOsDir).join(", ") || "empty"}]`
        : `${entry} (no Contents/MacOS)`
    );
  }
  return `${name} -> [${top.join(", ") || "empty"}]${parts.length ? `; ${parts.join("; ")}` : ""}`;
}

/** Real-fs {@link resolveCodeExecutable} IO. */
function realProbeIo() {
  return {
    exists: (p) => fs.existsSync(p),
    isDirectory: (p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    readdir: (p) => {
      try {
        return fs.readdirSync(p);
      } catch {
        return [];
      }
    },
  };
}

/**
 * Resolve the VS Code executable to drive, or throw with an actionable
 * message. `testRoot` overrides the .vscode-test directory for unit tests.
 */
function findCodeBinary(testRoot, platform, io) {
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
  const plat = platform || process.platform;
  const probe = io || realProbeIo();
  if (!fs.existsSync(root)) {
    throw new Error(
      `No VS Code binary found: ${root} does not exist. Run ` +
        "'npm run test:playwright' once to download it, or set VSCODE_BIN."
    );
  }
  // Numeric version sort, descending. Accepts any `vscode-*` entry rather
  // than requiring the "archive" segment that only Windows downloads carry:
  // Linux ships a tarball (`vscode-linux-x64-X.Y.Z`) and macOS uses
  // `vscode-darwin-<arch>-X.Y.Z`, so filtering on "archive" would exclude
  // both.
  const archives = probe
    .readdir(root)
    .filter((d) => d.startsWith("vscode-"))
    .sort((a, b) => _cmpVersion(_parseCachedVersion(a), _parseCachedVersion(b)));
  for (const dir of archives) {
    const found = resolveCodeExecutable(path.join(root, dir), plat, probe);
    if (found) return found;
  }
  throw new Error(
    `No VS Code binary found under ${root} (platform ${plat}). Inspected: ` +
      `${
        archives
          .map((d) => describeVersionDir(path.join(root, d), plat, probe))
          .join(" | ") || "(empty)"
      }. Run 'npm run test:playwright' once to download it, or set VSCODE_BIN.`
  );
}

/**
 * Build the full argv for an isolated Extension Development Host launch.
 * `userDataDir` / `extensionsDir` must be fresh per launch so concurrent
 * runs cannot fight over profile state.
 *
 * `developmentPaths` loads ADDITIONAL extensions in development mode
 * alongside the product one. VS Code accepts `--extensionDevelopmentPath`
 * more than once; the walk stager uses it to load the walk companion, whose
 * `onStartupFinished` activation is what makes the walk open on the Dabbler
 * view instead of the file Explorer.
 */
function launchArgs(opts) {
  const {
    extensionRoot = EXTENSION_ROOT,
    userDataDir,
    extensionsDir,
    workspacePath,
    extraArgs = [],
    developmentPaths = [],
  } = opts || {};
  if (!userDataDir || !extensionsDir || !workspacePath) {
    throw new Error(
      "launchArgs requires userDataDir, extensionsDir and workspacePath"
    );
  }
  return [
    `--extensionDevelopmentPath=${extensionRoot}`,
    ...developmentPaths.map((p) => `--extensionDevelopmentPath=${p}`),
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    ...ISOLATION_FLAGS,
    ...extraArgs,
    workspacePath,
  ];
}

/** The development-only companion that reveals the view during a walk. */
const WALK_COMPANION_PATH = path.join(__dirname, "walk-companion");

module.exports = {
  EXTENSION_ROOT,
  ISOLATION_FLAGS,
  DARWIN_EXEC_PREFERENCE,
  WALK_COMPANION_PATH,
  electronEnv,
  makeLaunchStateDirs,
  resolveCodeExecutable,
  describeVersionDir,
  realProbeIo,
  findCodeBinary,
  launchArgs,
};
