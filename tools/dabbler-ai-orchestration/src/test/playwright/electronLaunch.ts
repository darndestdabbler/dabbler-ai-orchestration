// Helper that launches a real VS Code Electron instance with the
// dabbler-ai-orchestration extension under test, against a tmpdir
// workspace prepared by the Python harness shim. Layer 3 of the
// three-layer harness (Set 027 § Session 4).
//
// We deliberately do NOT route through @vscode/test-electron's
// runTests() launcher. That path was found broken on Windows 11 +
// VS Code 1.120 in Set 027 Session 3 (pre-existing environment
// issue; the symptom was the spawned Electron process exiting
// before the in-process test runner could attach). Playwright's
// ``_electron.launch`` connects via the Chrome DevTools Protocol
// instead, which sidesteps that path entirely — we drive Electron
// directly using the same Code.exe binary test-electron already
// downloaded to ``.vscode-test/``.
//
// Binary discovery order:
//   1. ``VSCODE_BIN`` env var (CI / dev override)
//   2. Latest ``.vscode-test/vscode-<platform>-archive-*/Code(.exe)``
//   3. Throw — no fallback to system installs, since a system VS
//      Code would launch with the user's profile and pollute their
//      Recently Opened list.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { _electron, ElectronApplication, Page } from "@playwright/test";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const HARNESS_CLI = path.join(
  REPO_ROOT,
  "ai_router",
  "tests",
  "e2e",
  "harness_cli.py",
);

const PYTHON = process.env.HARNESS_PYTHON || "python";

// Mirror the Layer 2 harness's env hygiene rules — strip ambient
// GIT_* and PYTHONPATH so a polluted parent shell can't redirect
// git operations or Python imports inside the harness shim.
const _ENV_PASSTHROUGH = [
  "PATH",
  "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
  "HOME", "USERPROFILE",
  "TMP", "TEMP", "TMPDIR",
  "LANG", "LC_ALL", "LC_CTYPE",
  "APPDATA", "LOCALAPPDATA",
];

function _filteredEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of _ENV_PASSTHROUGH) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  out.PYTHONIOENCODING = "utf-8";
  out.PYTHONUTF8 = "1";
  return out;
}

// Explicit allowlist for Electron-launch environment variables.
// This guards against IDE host pollution: if a developer runs
// `npm run test:playwright` from VS Code's integrated terminal, the
// child Code.exe should not inherit VS Code's IPC vars (ELECTRON_RUN_AS_NODE,
// VSCODE_*) which would flip it into CLI-arg-parsing mode. An allowlist
// is more maintainable than a blocklist: if new IDE vars are added
// (APPCODE_*, CURSOR_*, etc.), an allowlist won't inadvertently pass them.
//
// Variables are organized by platform and context:
// - Universal: needed on all platforms
// - Windows-specific: Windows system paths and user config
// - GUI/locale: needed for GUI windows and i18n on Linux/macOS
const _ELECTRON_VAR_ALLOWLIST_UNIVERSAL = [
  "PATH", "PATHEXT",              // executable search path (Windows includes PATHEXT)
  "HOME", "USERPROFILE", "USER", "USERNAME",
  "TEMP", "TMP", "TMPDIR",
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_NUMERIC", "LC_TIME",
  "TERM", "COLORTERM",
];

const _ELECTRON_VAR_ALLOWLIST_WINDOWS = [
  "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
  "APPDATA", "LOCALAPPDATA",
];

const _ELECTRON_VAR_ALLOWLIST_GUI = [
  "DISPLAY",                        // X11 (Linux)
  "WAYLAND_DISPLAY",                // Wayland (Linux/macOS)
  "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE",  // XDG desktop (Linux)
  "DBUS_SESSION_BUS_ADDRESS",       // D-Bus session (Linux)
  "DESKTOP_SESSION", "GDMSESSION",  // GNOME/session (Linux)
];

function _electronEnv(): { [key: string]: string } {
  const out: { [key: string]: string } = {};

  // Start with universal allowlist
  const allowed = [..._ELECTRON_VAR_ALLOWLIST_UNIVERSAL, ..._ELECTRON_VAR_ALLOWLIST_GUI];

  // Add platform-specific vars
  if (process.platform === "win32") {
    allowed.push(..._ELECTRON_VAR_ALLOWLIST_WINDOWS);
  }

  const allowedSet = new Set(allowed);

  // Copy allowed vars from process.env
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string") continue;
    if (allowedSet.has(k)) {
      out[k] = v;
    }
  }

  out.ELECTRON_ENABLE_LOGGING = "1";
  return out;
}

export interface FixtureHandle {
  repo_root: string;
  set_dir: string;
  bare_remote: string;
  slug: string;
  total_sessions: number;
  engine: string;
  model: string;
  provider: string;
  effort: string;
}

function runHarness(args: string[], timeoutMs = 60_000): unknown {
  const proc = cp.spawnSync(PYTHON, [HARNESS_CLI, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: REPO_ROOT,
    env: _filteredEnv(),
  });
  if (proc.error) {
    throw new Error(`harness_cli spawn error (${PYTHON}): ${proc.error.message}`);
  }
  if (proc.status !== 0) {
    throw new Error(
      `harness_cli ${args[0]} failed (exit ${proc.status}): ` +
        `stdout=${proc.stdout?.toString() || ""} stderr=${proc.stderr?.toString() || ""}`,
    );
  }
  const lines = proc.stdout.toString().trim().split(/\r?\n/).filter((s) => s.length > 0);
  return JSON.parse(lines[lines.length - 1]);
}

function _handleArgs(h: FixtureHandle): string[] {
  return [
    "--repo-root", h.repo_root,
    "--set-dir", h.set_dir,
    "--bare-remote", h.bare_remote,
    "--slug", h.slug,
    "--total-sessions", String(h.total_sessions),
    "--engine", h.engine,
    "--model", h.model,
    "--provider", h.provider,
    "--effort", h.effort,
  ];
}

export function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

export function makeSet(
  tmpPath: string,
  slug: string,
  totalSessions: number,
): FixtureHandle {
  return runHarness([
    "make-set",
    "--tmp-path", tmpPath,
    "--slug", slug,
    "--total-sessions", String(totalSessions),
  ]) as FixtureHandle;
}

export function startSession(h: FixtureHandle, n: number): void {
  runHarness(["start", ..._handleArgs(h), "--session-number", String(n)]);
}

export function makeActivity(h: FixtureHandle, n: number): void {
  runHarness([
    "make-activity",
    ..._handleArgs(h),
    "--session-number", String(n),
    "--description", "playwright rendering smoke",
  ]);
}

export function makeDisposition(
  h: FixtureHandle,
  n: number,
  isFinal: boolean,
): void {
  const args = [
    "make-disposition",
    ..._handleArgs(h),
    "--session-number", String(n),
    "--status", "completed",
  ];
  if (isFinal) args.push("--is-final");
  runHarness(args);
}

export function makeChangeLog(h: FixtureHandle, finalSessionN: number): void {
  runHarness([
    "make-change-log",
    ..._handleArgs(h),
    "--final-session-number", String(finalSessionN),
  ]);
}

export interface CloseResult {
  exit: number;
  stdout: string;
  stderr: string;
}

export function closeSession(
  h: FixtureHandle,
  n: number,
  opts: { force?: boolean } = {},
): CloseResult {
  const args = ["close", ..._handleArgs(h), "--session-number", String(n)];
  if (opts.force) args.push("--force");
  return runHarness(args) as CloseResult;
}

export function cancelSet(h: FixtureHandle): void {
  runHarness(["cancel", ..._handleArgs(h), "--reason", "playwright cancel scenario"]);
}

export function makeAdditionalSet(
  base: FixtureHandle,
  newSlug: string,
  newTotalSessions: number,
): FixtureHandle {
  return runHarness([
    "make-additional-set",
    ..._handleArgs(base),
    "--new-slug", newSlug,
    "--new-total-sessions", String(newTotalSessions),
  ]) as FixtureHandle;
}

export function driveHappyPath(h: FixtureHandle, throughSession: number): void {
  for (let n = 1; n <= throughSession; n++) {
    const isFinal = n === h.total_sessions;
    startSession(h, n);
    makeActivity(h, n);
    makeDisposition(h, n, isFinal);
    if (isFinal) makeChangeLog(h, n);
    const r = closeSession(h, n);
    if (r.exit !== 0) {
      throw new Error(
        `driveHappyPath: close ${h.slug} session ${n} failed: ` +
          `exit=${r.exit} stderr=${r.stderr}`,
      );
    }
  }
}

// ---------------------------------------------------------------------
// VS Code Electron launch
// ---------------------------------------------------------------------

// Parse "vscode-<platform>-archive-1.120.0" -> [1, 120, 0]. Returns
// null on dirs that don't match the canonical shape, so they sort
// last. Numeric comparison guards against the lex-sort gotcha where
// "1.99.0" would sort ahead of "1.120.0".
function _parseCachedVersion(dirName: string): number[] | null {
  const m = dirName.match(/(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function _cmpVersion(a: number[] | null, b: number[] | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;   // unparseable sorts last
  if (!b) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;  // descending
  }
  return 0;
}

function findCodeBinary(): string {
  const override = process.env.VSCODE_BIN;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`VSCODE_BIN points at non-existent path: ${override}`);
    }
    return override;
  }
  const vsTestDir = path.join(EXTENSION_ROOT, ".vscode-test");
  if (!fs.existsSync(vsTestDir)) {
    throw new Error(
      `No VS Code binary found and ${vsTestDir} does not exist. ` +
        "Run `npm test` once (or set VSCODE_BIN) to populate the test binary.",
    );
  }
  // Numeric version sort, descending. Avoids the lex-sort bug where
  // "archive-1.99.0" would sort ahead of "archive-1.120.0".
  const entries = fs
    .readdirSync(vsTestDir)
    .filter((e) => e.startsWith("vscode-") && e.includes("archive"))
    .sort((a, b) => _cmpVersion(_parseCachedVersion(a), _parseCachedVersion(b)));
  for (const dir of entries) {
    const candidate =
      process.platform === "win32"
        ? path.join(vsTestDir, dir, "Code.exe")
        : process.platform === "darwin"
          ? path.join(vsTestDir, dir, "Visual Studio Code.app", "Contents", "MacOS", "Electron")
          : path.join(vsTestDir, dir, "code");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No usable VS Code binary in ${vsTestDir}. ` +
      `Inspected: ${entries.join(", ") || "(empty)"}`,
  );
}

export interface LaunchedVSCode {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  extensionsDir: string;
}

/**
 * Launch VS Code Electron against *workspacePath*. The launch is
 * fully isolated: a fresh user-data-dir and a fresh extensions-dir
 * are spawned per call, so concurrent test invocations cannot fight
 * over profile state.
 */
export async function launchVSCode(workspacePath: string): Promise<LaunchedVSCode> {
  const code = findCodeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-extensions-"));
  const app = await _electron.launch({
    executablePath: code,
    args: [
      `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      "--disable-workspace-trust",
      "--skip-release-notes",
      "--skip-welcome",
      "--disable-telemetry",
      "--disable-updates",
      "--new-window",
      workspacePath,
    ],
    env: _electronEnv(),
    timeout: 60_000,
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  // Wait for the workbench to settle. The most reliable signal is
  // the activity bar element becoming visible.
  await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
  return { app, page, userDataDir, extensionsDir };
}

/**
 * Activate the Dabbler activity-bar view container and wait for the
 * Session Sets tree view to render. Returns the locator for the
 * tree role element so callers can chain treeitem queries off it.
 */
export async function openSessionSetsView(page: Page): Promise<import("@playwright/test").Locator> {
  // The view container's aria-label comes from package.json
  // `viewsContainers.activitybar[0].title` ("Dabbler AI Orchestration").
  // VS Code renders both the action-icon `<a>` and a hidden
  // badge `<div>` with the same aria-label — narrow to
  // `.action-label` so we only match the clickable icon.
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  // Once the side bar opens, the "Session Sets" view ID (from
  // contributes.views[].id == "dabblerSessionSets", name == "Session Sets")
  // becomes the section header. The tree element itself carries
  // role="tree" and an aria-label derived from the view name.
  const tree = page.locator('[role="tree"][aria-label*="Session Sets" i]');
  await tree.waitFor({ state: "visible", timeout: 30_000 });
  return tree;
}

/**
 * Trigger the refresh command — equivalent to clicking the
 * activity-bar refresh button. Used after the harness mutates state
 * outside the running extension's awareness.
 */
export async function triggerRefresh(page: Page): Promise<void> {
  // Invoke via the command palette to avoid relying on icon hit-target
  // pixel coordinates that shift between VS Code minor versions. F1 is
  // the cross-platform command-palette shortcut (Ctrl+Shift+P /
  // Cmd+Shift+P both ultimately route to the same command, but F1 is
  // unconditionally bound on all three platforms).
  await page.keyboard.press("F1");
  const palette = page.locator(".quick-input-widget input");
  await palette.waitFor({ state: "visible", timeout: 10_000 });
  await palette.fill("Dabbler: Refresh Session Sets");
  await page.keyboard.press("Enter");
  // Small settle window for the provider's getChildren() to run and
  // the tree to repaint. The view itself emits no public event.
  await page.waitForTimeout(750);
}

export async function closeVSCode(launch: LaunchedVSCode): Promise<void> {
  try {
    await launch.app.close();
  } catch {
    // best effort — the Electron close handler can race the harness
    // teardown when a test asserts mid-launch.
  }
  for (const dir of [launch.userDataDir, launch.extensionsDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // opportunistic; tmpdirs live under TMPDIR
    }
  }
}

export function cleanupTmpDir(tmpPath: string): void {
  try {
    fs.rmSync(tmpPath, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // opportunistic
  }
}
