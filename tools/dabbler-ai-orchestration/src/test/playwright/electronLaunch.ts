// Launch a real VS Code Electron instance with the extension under
// test, against a tmpdir workspace assembled from the vendored corpus
// fixtures (tests/fixtures/corpus at the repo root — real v1-era sets,
// already proven against the Python projection).
//
// We deliberately do NOT route through @vscode/test-electron's
// runTests() launcher; Playwright's `_electron.launch` connects via the
// Chrome DevTools Protocol and drives the same Code.exe binary
// test-electron downloads to `.vscode-test/`.
//
// The workspace fixtures are plain artifact files — the extension still
// derives every status through `python -m ai_router.progress`, so these
// scenarios exercise the real Python data path end to end. The suite
// therefore requires an interpreter on PATH with ai_router installed
// (the repo root's editable install satisfies this).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { _electron, ElectronApplication, Page, expect } from "@playwright/test";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const CORPUS_DIR = path.join(REPO_ROOT, "tests", "fixtures", "corpus");

// The launch environment allowlist and binary discovery live in
// scripts/vscode-launch.js so no harness can drift from another.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _launch = require("../../../scripts/vscode-launch.js") as {
  electronEnv: (extra?: Record<string, string>) => { [key: string]: string };
  findCodeBinary: (vscodeTestDir: string) => string;
  makeLaunchStateDirs: () => { root: string; env: Record<string, string> };
  describeLaunchFailure: (message: string, childOutput: string) => string;
};

/**
 * The interpreter that has ai_router importable: the repo root's .venv
 * (editable install) when present, else bare `python`. Fixture
 * workspaces have no .venv of their own, so every workspace this
 * harness builds pins `dabblerSessionSets.pythonPath` at this — the
 * projection must run the real Python data path, not the file-presence
 * fallback.
 */
export const PYTHON = (() => {
  const venv =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : "python";
})();

export function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".vscode", "settings.json"),
    JSON.stringify({ "dabblerSessionSets.pythonPath": PYTHON }, null, 2),
    "utf8",
  );
  return dir;
}

// ---------------------------------------------------------------------------
// Workspace fixtures
// ---------------------------------------------------------------------------

/** Corpus slugs the specs compose workspaces from. */
export const CORPUS = {
  completeV3: "004-cost-enforcement-and-capacity",
  completeV4: "059-extension-activation-and-scaffold-fix",
  inProgress: "113-narrated-video-walkthroughs",
  cancelled: "040-codex-launch-adapter",
} as const;

/** Copy a vendored corpus set into the workspace under its own slug. */
export function addCorpusSet(workspaceRoot: string, slug: string): string {
  const src = path.join(CORPUS_DIR, slug);
  if (!fs.existsSync(src)) {
    throw new Error(`corpus fixture missing: ${src}`);
  }
  const dst = path.join(workspaceRoot, "docs", "session-sets", slug);
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

/** A spec-only (not-started) set, optionally blocked by prerequisites. */
export function addSpecOnlySet(
  workspaceRoot: string,
  slug: string,
  opts: { prereqSlugs?: string[]; module?: string } = {},
): string {
  const dst = path.join(workspaceRoot, "docs", "session-sets", slug);
  fs.mkdirSync(dst, { recursive: true });
  const configLines = ["```yaml"];
  if (opts.module) configLines.push(`module: ${opts.module}`);
  if (opts.prereqSlugs && opts.prereqSlugs.length > 0) {
    configLines.push("prerequisites:");
    for (const p of opts.prereqSlugs) {
      configLines.push(`  - slug: ${p}`, "    condition: complete");
    }
  }
  configLines.push("```");
  const spec = [
    `# ${slug}`,
    "",
    "## Session Set Configuration",
    "",
    ...configLines,
    "",
    "### Session 1 of 1: Do the thing",
    "1. First step.",
    "2. Close out.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dst, "spec.md"), spec, "utf8");
  return dst;
}

/**
 * A set whose session 1 is in flight with a three-step plan — the shape
 * the fifth tree level renders. Written as artifact files (v3-shape
 * state, normalized on read); the projection still derives everything.
 */
export function addInFlightSet(workspaceRoot: string, slug: string): string {
  const dst = path.join(workspaceRoot, "docs", "session-sets", slug);
  fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(
    path.join(dst, "spec.md"),
    [
      `# ${slug}`,
      "",
      "### Session 1 of 2: Build the thing",
      "1. Implement the feature.",
      "2. Run the tests.",
      "3. Close out.",
      "",
      "### Session 2 of 2: Polish",
      "1. Polish.",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dst, "session-state.json"),
    JSON.stringify(
      {
        schemaVersion: 3,
        sessionSetName: slug,
        currentSession: 1,
        totalSessions: 2,
        status: "in-progress",
        lifecycleState: "work_in_progress",
        startedAt: "2026-08-17T09:00:00-04:00",
        completedAt: null,
        verificationVerdict: null,
        orchestrator: { engine: "human", provider: "anthropic" },
        completedSessions: [],
        sessions: [
          { number: 1, title: "Build the thing", status: "in-progress" },
          { number: 2, title: "Polish", status: "not-started" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dst, "activity-log.json"),
    JSON.stringify(
      {
        entries: [
          {
            sessionNumber: 1,
            stepNumber: 1,
            stepKey: "implement-the-feature",
            description: "Implement the feature.",
            status: "complete",
            dateTime: "2026-08-17T09:10:00-04:00",
          },
          {
            sessionNumber: 1,
            stepNumber: 2,
            stepKey: "run-the-tests",
            description: "Run the tests.",
            status: "not-started",
          },
          {
            sessionNumber: 1,
            stepNumber: 3,
            stepKey: "close-out",
            description: "Close out.",
            status: "not-started",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  return dst;
}

export function writeModulesManifest(workspaceRoot: string, yaml: string): void {
  const docs = path.join(workspaceRoot, "docs");
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, "modules.yaml"), yaml, "utf8");
}

export function cleanupTmpDir(tmpPath: string): void {
  try {
    fs.rmSync(tmpPath, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // opportunistic; tmpdirs live under TMPDIR
  }
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

export interface LaunchedVSCode {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  extensionsDir: string;
  /** Per-launch platform state root; one dir so teardown is one call. */
  stateRoot: string;
}

/**
 * Launch VS Code Electron against *workspacePath*, fully isolated: a
 * fresh user-data-dir, extensions-dir, and platform state root per
 * call, so concurrent test invocations cannot fight over profile state.
 */
export async function launchVSCode(
  workspacePath: string,
  extraArgs: string[] = [],
  extraEnv?: Record<string, string>,
): Promise<LaunchedVSCode> {
  const code = _launch.findCodeBinary(path.join(EXTENSION_ROOT, ".vscode-test"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-extensions-"));
  const state = _launch.makeLaunchStateDirs();
  let app: ElectronApplication | undefined;
  // Everything the launched VS Code writes, kept so a FAILED launch can
  // say what the child said.
  let childOutput = "";
  const captureChildOutput = (chunk: unknown) => {
    childOutput += String(chunk);
  };
  try {
    app = await _electron.launch({
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
        ...extraArgs,
        workspacePath,
      ],
      // state.env spread LAST: a caller must not be able to un-scope
      // APPDATA/HOME and silently share machine state.
      env: _launch.electronEnv({
        ...(extraEnv || {}),
        ...state.env,
      }),
      timeout: 60_000,
    });
    // Attach BEFORE awaiting the first window — that await is exactly
    // where a blocked launch dies.
    try {
      const proc = app.process();
      proc.stdout?.on("data", captureChildOutput);
      proc.stderr?.on("data", captureChildOutput);
    } catch {
      // diagnostic only
    }
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
    return { app, page, userDataDir, extensionsDir, stateRoot: state.root };
  } catch (err) {
    if (app) {
      try {
        await app.close();
      } catch {
        // the launch is already failing; a close error would mask it
      }
    }
    for (const dir of [userDataDir, extensionsDir, state.root]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // opportunistic
      }
    }
    const original = err instanceof Error ? err : new Error(String(err));
    original.message = _launch.describeLaunchFailure(original.message, childOutput);
    throw original;
  }
}

export async function closeVSCode(launch: LaunchedVSCode): Promise<void> {
  try {
    await launch.app.close();
  } catch {
    // best effort
  }
  for (const dir of [launch.userDataDir, launch.extensionsDir, launch.stateRoot]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // opportunistic
    }
  }
}

// ---------------------------------------------------------------------------
// Driving the workbench
// ---------------------------------------------------------------------------

/** Trigger the hard refresh via the command palette. */
export async function triggerRefresh(page: Page): Promise<void> {
  await page.keyboard.press("F1");
  const palette = page.locator(".quick-input-widget input");
  await palette.waitFor({ state: "visible", timeout: 10_000 });
  await palette.fill("Dabbler: Refresh Work Explorer");
  await page.keyboard.press("Enter");
  // Settle window for the async scan and repaint.
  await page.waitForTimeout(1_500);
}

/**
 * Reveal the Dabbler container — IDEMPOTENTLY guarded by callers.
 * Activity-bar icons TOGGLE: clicking one whose container is already
 * active hides the sidebar.
 */
export async function openDabblerContainer(page: Page): Promise<void> {
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="AI Work Explorer"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  await page.waitForTimeout(250);
}

/**
 * The native-tree pane, expanded, WITHOUT waiting for any row. Use for
 * emptiness or TreeView.message assertions.
 */
export async function workExplorerPane(
  page: Page,
  opts: { reveal?: boolean } = {},
): Promise<import("@playwright/test").Locator> {
  if (opts.reveal !== false) await openDabblerContainer(page);
  const pane = page
    .locator(".pane")
    .filter({ has: page.locator(".monaco-list") })
    .first();
  await pane.waitFor({ state: "visible", timeout: 30_000 });
  const header = pane.locator(".pane-header");
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
    await page.waitForTimeout(250);
  }
  return pane;
}

/** The pane with at least one painted row. */
export async function openWorkExplorerTree(
  page: Page,
): Promise<import("@playwright/test").Locator> {
  const pane = await workExplorerPane(page);
  await pane
    .locator(".monaco-list-row")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  return pane;
}

export function treeRows(
  pane: import("@playwright/test").Locator,
): import("@playwright/test").Locator {
  return pane.locator(".monaco-list-row");
}

export function treeRow(
  pane: import("@playwright/test").Locator,
  label: string | RegExp,
): import("@playwright/test").Locator {
  return pane.locator(".monaco-list-row").filter({ hasText: label }).first();
}

/** Assert the supplied lifecycle SVG is the row's rendered file-backed icon. */
export async function expectFileIcon(
  row: import("@playwright/test").Locator,
  slug: string,
): Promise<void> {
  const icon = row.locator(".custom-view-tree-node-item-icon").first();
  await expect(icon).toBeVisible();
  await expect
    .poll(
      async () =>
        icon.evaluate(
          (element) =>
            element.ownerDocument.defaultView?.getComputedStyle(element)
              .backgroundImage ?? "",
        ),
      { timeout: 5_000 },
    )
    .toContain(slug);
}

/**
 * Expand a row by clicking its twistie — not the row body, which
 * carries a command (opening spec.md) on set and session rows.
 */
export async function expandTreeRow(
  pane: import("@playwright/test").Locator,
  label: string | RegExp,
): Promise<void> {
  const row = treeRow(pane, label);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  if ((await row.getAttribute("aria-expanded")) === "false") {
    await row.locator(".monaco-tl-twistie").click();
  }
  await pane.page().waitForTimeout(400);
}

/**
 * Drill module -> bucket -> set and return the set's row. The tree is
 * lazy, so a set row does not exist in the DOM until both ancestors are
 * expanded.
 */
export async function revealSetRow(
  pane: import("@playwright/test").Locator,
  opts: { module?: string; bucket: string; set: string },
): Promise<import("@playwright/test").Locator> {
  await expandTreeRow(pane, opts.module ?? "Default");
  await expandTreeRow(pane, opts.bucket);
  const row = treeRow(pane, opts.set);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  return row;
}

/**
 * Open a row's context menu and return its rendered text — or "" when
 * the row offers no menu at all. "No menu" is a real answer, so the
 * wait is short and its expiry is the answer.
 */
export async function rowContextMenuText(
  page: Page,
  row: import("@playwright/test").Locator,
): Promise<string> {
  await row.click({ button: "right" });
  const menu = page.locator(".context-view .monaco-menu");
  let text = "";
  try {
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    text = await menu.innerText();
  } catch {
    // No menu: the row carries no applicable entries.
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  return text;
}

/** The TreeView.message band's text, if the view is showing one. */
export async function treeViewMessageText(
  pane: import("@playwright/test").Locator,
): Promise<string> {
  const body = pane.locator(".pane-body");
  const full = (await body.innerText()).trim();
  const list = pane.locator(".monaco-list");
  if ((await list.count()) === 0) return full;
  const rows = (await list.innerText()).trim();
  return full.startsWith(rows)
    ? full.slice(rows.length).trim()
    : full.replace(rows, "").trim();
}
