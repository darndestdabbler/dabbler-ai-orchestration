// Launch a real VS Code Electron instance with the extension under
// test, against a tmpdir workspace holding one sessions root.
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
//
// A workspace is a repository with ONE sessions root, `docs/sessions/`,
// holding the machine-written ledger, the plan the titles come from, and
// the activity log the step rows are folded out of. The files are
// written as artifacts and the extension still derives every status
// through `python -m ai_router.progress`, so these scenarios exercise
// the real Python data path end to end.
// ---------------------------------------------------------------------------

export interface FixtureSession {
  number: number;
  title: string;
  status: "not-started" | "in-progress" | "complete" | "cancelled";
  verificationVerdict?: string;
}

function sessionsDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, "docs", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write `docs/sessions/{sessions.json,session-plan.md}` for *sessions*.
 * The plan carries one `### Session N of M:` heading per entry, which is
 * both where a session row's title is healed from and where clicking a
 * row lands.
 */
export function writeSessionsRoot(
  workspaceRoot: string,
  sessions: readonly FixtureSession[],
): string {
  const dir = sessionsDir(workspaceRoot);
  const total = sessions.length;
  const plan = [
    "# Fixture repository",
    "",
    ...sessions.flatMap((s) => [
      `### Session ${s.number} of ${total}: ${s.title}`,
      "1. Implement the feature.",
      "2. Run the tests.",
      "3. Close out.",
      "",
    ]),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "session-plan.md"), plan, "utf8");
  fs.writeFileSync(
    path.join(dir, "sessions.json"),
    JSON.stringify(
      {
        schemaVersion: 5,
        sessions: sessions.map((s) => ({
          number: s.number,
          title: s.title,
          status: s.status,
          startedAt: s.status === "not-started" ? null : "2026-08-17T09:00:00-04:00",
          completedAt: s.status === "complete" ? "2026-08-17T11:00:00-04:00" : null,
          orchestrator:
            s.status === "not-started"
              ? null
              : { engine: "human", provider: "anthropic" },
          verificationVerdict: s.verificationVerdict ?? null,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  return dir;
}

/**
 * Give the in-flight session a three-step activity log, which is the
 * shape the third tree level renders.
 */
export function writeActivityLog(
  workspaceRoot: string,
  sessionNumber: number,
): void {
  const dir = sessionsDir(workspaceRoot);
  fs.writeFileSync(
    path.join(dir, "activity-log.json"),
    JSON.stringify(
      {
        entries: [
          {
            sessionNumber,
            stepNumber: 1,
            stepKey: "implement-the-feature",
            description: "Implement the feature.",
            status: "complete",
            dateTime: "2026-08-17T09:10:00-04:00",
          },
          {
            sessionNumber,
            stepNumber: 2,
            stepKey: "run-the-tests",
            description: "Run the tests.",
            status: "not-started",
          },
          {
            sessionNumber,
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
}

/** The repository row's label: the workspace folder's own name. */
export function repositoryLabel(workspaceRoot: string): string {
  return path.basename(workspaceRoot);
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
 * The Work Explorer's own pane, expanded, WITHOUT waiting for any row.
 * Use for emptiness or TreeView.message assertions.
 *
 * Selected by the pane's OWN heading. The container holds two views and
 * "the first pane with a list" silently resolves to the Solution
 * Explorer whenever that one happens to render a list first — which
 * makes a passing emptiness assertion mean nothing at all.
 */
export async function workExplorerPane(
  page: Page,
  opts: { reveal?: boolean } = {},
): Promise<import("@playwright/test").Locator> {
  if (opts.reveal !== false) await openDabblerContainer(page);
  const pane = page
    .locator(".pane")
    .filter({
      has: page.locator('.pane-header[aria-label="AI Work Explorer Section"]'),
    })
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
 * carries a command (opening the session plan) on repository and
 * session rows.
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
 * Expand the repository row and return one session's row. The tree is
 * lazy, so a session row does not exist in the DOM until the repository
 * above it is expanded.
 */
export async function revealSessionRow(
  pane: import("@playwright/test").Locator,
  opts: { repository: string; session: string | RegExp },
): Promise<import("@playwright/test").Locator> {
  await expandTreeRow(pane, opts.repository);
  const row = treeRow(pane, opts.session);
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
