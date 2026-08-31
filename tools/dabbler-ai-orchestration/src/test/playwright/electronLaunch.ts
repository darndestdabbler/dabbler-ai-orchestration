// Launch a real VS Code Electron instance with the extension under
// test, against a tmpdir workspace holding one sessions root.
//
// We deliberately do NOT route through @vscode/test-electron's
// runTests() launcher; Playwright's `_electron.launch` connects via the
// Chrome DevTools Protocol and drives the same Code.exe binary
// test-electron downloads to `.vscode-test/`.
//
// The workspace fixtures are plain artifact files, and the extension
// derives every status by calling the router in-process — so these
// scenarios exercise the real data path end to end. The suite requires
// nothing installed: the router is bundled with the extension under test,
// and the two fixture writes that must go through a sanctioned writer run
// the router's own source on this Node.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
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

/** The router's own source, which the two sanctioned writes below run. */
const ROUTER_SRC = path.join(REPO_ROOT, "packages", "router", "src");

/**
 * The `dabbler` command the extension under test ships, which is what a
 * spec spawns when it needs the router to WRITE through its command line.
 * It is the bundle beside the extension, not the workspace's copy of the
 * package: a scenario that drove a different build than the one loaded
 * would be comparing two routers.
 */
export const DABBLER_CLI = path.join(EXTENSION_ROOT, "dist", "dabbler.cjs");

export function makeTmpDir(prefix: string): string {
  // No `.vscode/settings.json` any more. It used to pin an interpreter,
  // because the projection ran as a subprocess and a fixture workspace has
  // no environment of its own; the extension calls the router in-process
  // now, so there is nothing about the host for a workspace to declare.
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

// ---------------------------------------------------------------------------
// Workspace fixtures
//
// A workspace is a repository with ONE sessions root, `docs/sessions/`,
// holding the machine-written ledger and the plan the titles come from,
// plus `.dabbler/runs/s<N>/` holding the approved plan and execution
// record the task rows are folded out of. The ledger and plan are
// written as plain artifacts; the run records go through the router's
// own writers, because both refuse content no sanctioned write produced.
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
 * Write the in-flight session's approved plan through the router's own
 * writer, then open its first step.
 *
 * `write_plan` is used rather than a hand-written file ON PURPOSE: a
 * plan whose content is not backed by a sanctioned write is refused on
 * read, so a fixture that wrote the JSON itself would exercise the
 * refusal path and never reach the task rows.
 */
export function writeApprovedPlan(
  workspaceRoot: string,
  sessionNumber: number,
  steps: readonly { stepId: string; intent: string }[],
): void {
  runRouter(
    workspaceRoot,
    [
      `import { mkdirSync } from "node:fs";`,
      `const plan = await import("${moduleUrl("approvedPlan.ts")}");`,
      `const ledger = await import("${moduleUrl("ledger.ts")}");`,
      `const [stepsJson, root] = process.argv.slice(2);`,
      `const run = ledger.sessionRunDir(root, ${sessionNumber});`,
      `mkdirSync(run, { recursive: true });`,
      `plan.writePlan(run, plan.newPlan(${sessionNumber}, "fixture", JSON.parse(stepsJson)));`,
    ].join("\n"),
    [
      JSON.stringify(
        steps.map((s) => ({
          step_id: s.stepId,
          intent: s.intent,
          file_envelope: [`src/${s.stepId}.py`],
          evidence_contract: [
            { description: "the targeted tests", kind: "deterministic" },
          ],
          risk_flags: [],
        })),
      ),
      workspaceRoot,
    ],
  );
}

/** Append one `opened` or `closed` row through the router's own writer. */
export function writeStepEvent(
  workspaceRoot: string,
  sessionNumber: number,
  event: "opened" | "closed",
  stepId: string,
): void {
  const base = "a".repeat(40);
  const row: Record<string, unknown> = {
    schema_version: 1,
    event,
    recorded_at: new Date().toISOString(),
    session_number: sessionNumber,
    step_id: stepId,
    base_commit: base,
  };
  if (event === "closed") {
    row.closed_tree = "b".repeat(40);
    row.envelope = { inside: [`src/${stepId}.py`], outside: [] };
    row.deterministic = [
      { kind: "targeted-tests", status: "pass", required: true },
    ];
  }
  runRouter(
    workspaceRoot,
    [
      `const ledger = await import("${moduleUrl("ledger.ts")}");`,
      `const [rowJson, root] = process.argv.slice(2);`,
      `ledger.appendStepEvent(root, ${sessionNumber}, JSON.parse(rowJson));`,
    ].join("\n"),
    [JSON.stringify(row), workspaceRoot],
  );
}

/** One of the router's modules, as an import specifier a `-e` can use. */
function moduleUrl(fileName: string): string {
  return pathToFileURL(path.join(ROUTER_SRC, fileName)).href;
}

/**
 * Run a snippet against the router's own modules.
 *
 * Node strips the types itself from 22.18 on, which is the floor this
 * extension declares, so there is no transpiler here and no build to be
 * stale. The source is reached by absolute path rather than through the
 * package: Node refuses to strip types under `node_modules`, and the
 * workspace link would put it there.
 */
function runRouter(cwd: string, code: string, args: string[]): void {
  const result = cp.spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", code, "--", ...args],
    { cwd, encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(
      `fixture write failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
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
  // Sessions sit under status buckets; In Progress opens expanded and the
  // rest collapsed, so every bucket that rendered is opened before the
  // session row is looked for.
  for (const bucket of ["In Progress", "Not Started", "Complete", "Cancelled"]) {
    const header = pane
      .locator(".monaco-list-row")
      .filter({ has: pane.page().locator(".label-name", { hasText: new RegExp(`^${bucket}$`) }) })
      .first();
    if ((await header.count()) > 0 && (await header.getAttribute("aria-expanded")) === "false") {
      await header.locator(".monaco-tl-twistie").click();
      await pane.page().waitForTimeout(200);
    }
  }
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
