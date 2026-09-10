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
import { _electron, expect } from "@playwright/test";
// Type-only: Node's own erasable-syntax stripping (the generator script,
// scripts/render-csv-walkthrough.mjs, imports csvWalkSteps.ts -- and so,
// transitively, this file -- with `--experimental-strip-types` and no
// build step) cannot erase a value import it does not know is unused at
// runtime; a plain `import { Page }` alongside `_electron` broke exactly
// that import with "does not provide an export named 'Page'".
import type { ElectronApplication, Page } from "@playwright/test";

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

// The activity-bar container and the Work Explorer view's own contributed
// names, read from the manifest rather than retyped here: a selector built
// from a second copy of the title is exactly what went stale the first
// time (the container was contributed as "AI Orchestration", not "AI Work
// Explorer") and would go stale the same way on the next rename.
const manifest = JSON.parse(
  fs.readFileSync(path.join(EXTENSION_ROOT, "package.json"), "utf8"),
) as {
  contributes: {
    viewsContainers: { activitybar: Array<{ id: string; title: string }> };
    views: Record<string, Array<{ id: string; name: string }>>;
  };
};

/** The activity-bar icon's contributed title, e.g. "Dabbler AI Orchestration". */
const CONTAINER_TITLE = manifest.contributes.viewsContainers.activitybar[0]!.title;

/** One contributed view's own name, e.g. "Work Explorer", by its id. */
function viewName(id: string): string {
  const view = Object.values(manifest.contributes.views)
    .flat()
    .find((entry) => entry.id === id);
  if (!view) throw new Error(`package.json contributes no view '${id}'`);
  return view.name;
}

/**
 * The Work Explorer view's contributed name, e.g. "Work Explorer". The
 * editor renders a pane header's `aria-label` as `"<name> Section"` -- that
 * suffix is the editor's own convention and is not something the manifest
 * declares, so it stays a literal where it is appended below.
 */
const WORK_EXPLORER_VIEW_NAME = viewName("dabblerWorkExplorerTree");

/** The Solution Explorer view's contributed name, e.g. "Solution Explorer". */
const SOLUTION_EXPLORER_VIEW_NAME = viewName("dabblerSolutionTree");

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
 * A throwaway git repository over *workspaceRoot*, with everything
 * currently on disk committed -- idempotent, so a caller may call it again
 * after writing more fixture files.
 *
 * `writers.declareSessionTask` (below) refuses outside a git repository and
 * refuses while the tree carries uncommitted work: the declaration comes
 * before the work, and the framework enforces the order rather than asking
 * for it. A fixture workspace starts as a plain directory, so this is what
 * makes the declaration writable at all.
 */
function commitFixtureTree(workspaceRoot: string): void {
  const git = (...args: string[]) =>
    cp.spawnSync("git", args, { cwd: workspaceRoot, stdio: "ignore", windowsHide: true });
  if (!fs.existsSync(path.join(workspaceRoot, ".git"))) {
    git("init", "-b", "master");
    git("config", "user.name", "Playwright fixture");
    git("config", "user.email", "fixture@example.com");
  }
  git("add", "-A");
  git("commit", "-m", "fixture", "--allow-empty");
}

/**
 * Declare the in-flight session's task list through the router's own
 * writer -- this is what makes the Work Explorer's Declare (Plan) row read
 * as done, so Work becomes the session's open lifecycle row rather than
 * Declare itself.
 *
 * Commits the fixture tree first (see `commitFixtureTree`): the writer
 * refuses to declare over uncommitted work.
 */
export function writeTaskDeclaration(
  workspaceRoot: string,
  sessionNumber: number,
  options: { task: string; releasable: boolean; modules?: readonly string[] },
): void {
  commitFixtureTree(workspaceRoot);
  runRouter(
    workspaceRoot,
    [
      `import { join } from "node:path";`,
      `const writers = await import("${moduleUrl("writers.ts")}");`,
      `const [optionsJson, root] = process.argv.slice(-2);`,
      `writers.declareSessionTask(join(root, "docs", "sessions"), JSON.parse(optionsJson));`,
    ].join("\n"),
    [JSON.stringify({ sessionNumber, ...options }), workspaceRoot],
  );
}

/**
 * Write the in-flight session's driver work plan (`driver/plan.json`) --
 * the engine's own answer to "plan this session", through the router's own
 * writer. Its `steps` are what render nested under the Work row, each as
 * `work:<id>`; nothing else in the tree reads this file.
 */
export function writeDriverWorkPlan(
  workspaceRoot: string,
  sessionNumber: number,
  options: {
    task: string;
    releasable: boolean;
    steps: readonly { id: string; ask: string }[];
  },
): void {
  runRouter(
    workspaceRoot,
    [
      `const driver = await import("${moduleUrl("driver.ts")}");`,
      `const [bodyJson, root] = process.argv.slice(-2);`,
      `const body = JSON.parse(bodyJson);`,
      `driver.writeWorkPlan(root, ${sessionNumber}, {`,
      `  schema_version: 1,`,
      `  session_number: ${sessionNumber},`,
      `  task: body.task,`,
      `  releasable: body.releasable,`,
      `  steps: body.steps.map((s) => ({ id: s.id, ask: s.ask, files: [\`src/\${s.id}.ts\`], checks: [{ argv: ["true"] }] })),`,
      `  recorded_at: new Date().toISOString(),`,
      `});`,
    ].join("\n"),
    [JSON.stringify(options), workspaceRoot],
  );
}

/**
 * Write (or rewrite) the in-flight session's driver run (`driver/run.json`)
 * through the router's own writer. `acceptedSteps` is what a driver work
 * plan's own steps fold as done; `phase` "steps" is what makes the first
 * step not yet in `acceptedSteps` read as the one open now -- this is the
 * file the extension's watcher fires on, and the one `workStepRows` reads
 * for done/open state. `step-execution.jsonl` is written by nothing that
 * reaches this fixture: no row's state is read from it any more.
 */
export function writeDriverRun(
  workspaceRoot: string,
  sessionNumber: number,
  options: { phase: string; acceptedSteps: readonly string[] },
): void {
  runRouter(
    workspaceRoot,
    [
      `const driver = await import("${moduleUrl("driver.ts")}");`,
      `const [bodyJson, root] = process.argv.slice(-2);`,
      `const body = JSON.parse(bodyJson);`,
      `const now = new Date().toISOString();`,
      `driver.writeRun(root, ${sessionNumber}, {`,
      `  schema_version: 1,`,
      `  session_number: ${sessionNumber},`,
      `  engine: "fixture",`,
      `  phase: body.phase,`,
      `  seq: 1,`,
      `  invocations: 1,`,
      `  max_invocations: 24,`,
      `  accepted_steps: body.acceptedSteps,`,
      `  baseline_tree: null,`,
      `  stop: null,`,
      `  started_at: now,`,
      `  updated_at: now,`,
      `});`,
    ].join("\n"),
    [JSON.stringify(options), workspaceRoot],
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
  /** The Electron root process, so a close that fails can still end the tree. */
  pid: number | undefined;
}

/** How long a graceful `app.close()` gets before the tree is ended by force. */
const CLOSE_GRACE_MS = 15_000;

/**
 * End the launched VS Code and everything under it -- the renderer, the
 * extension host, the shared process, pty hosts -- by its root pid.
 * `taskkill /T` walks the tree on Windows; elsewhere Electron's children
 * exit with their parent.
 */
function endElectronTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") {
      cp.spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // already gone
  }
}

/**
 * Close gracefully, and end the tree by force when graceful does not
 * happen: a rejected close, or one that never returns. A spec that fails
 * mid-launch used to leave VS Code and its helpers behind for exactly as
 * long as the machine stayed up.
 */
async function closeOrEnd(app: ElectronApplication, pid: number | undefined): Promise<void> {
  let bound: NodeJS.Timeout | undefined;
  const graceful = app.close().then(
    () => true,
    () => false,
  );
  const expired = new Promise<boolean>((resolve) => {
    bound = setTimeout(() => resolve(false), CLOSE_GRACE_MS);
  });
  const closed = await Promise.race([graceful, expired]);
  if (bound !== undefined) clearTimeout(bound);
  if (!closed) endElectronTree(pid);
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
  let pid: number | undefined;
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
      pid = proc.pid;
      proc.stdout?.on("data", captureChildOutput);
      proc.stderr?.on("data", captureChildOutput);
    } catch {
      // diagnostic only
    }
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
    return { app, page, userDataDir, extensionsDir, stateRoot: state.root, pid };
  } catch (err) {
    // The launch is already failing; a close that fails too must not mask
    // it, and must not leave the half-launched tree behind either.
    if (app) await closeOrEnd(app, pid);
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
  await closeOrEnd(launch.app, launch.pid);
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

/**
 * Type *text* into the palette and press Enter, verbatim -- this helper adds
 * no ">" of its own. F1 opens the palette already in command-search mode on
 * some builds, with ">" pre-filled; `.fill()` replaces the whole box, so a
 * caller that needs command mode explicitly includes the ">" (e.g.
 * `>Some Command`). Existing callers pass the bare label unprefixed, exactly
 * as before this helper existed, so their behavior does not move.
 */
export async function runCommand(page: Page, text: string, settleMs = 1_500): Promise<void> {
  await page.keyboard.press("F1");
  const palette = page.locator(".quick-input-widget input");
  await palette.waitFor({ state: "visible", timeout: 10_000 });
  await palette.fill(text);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(settleMs);
}

/** Trigger the hard refresh via the command palette. */
export async function triggerRefresh(page: Page): Promise<void> {
  await runCommand(page, "Dabbler: Refresh Work Explorer", 1_500);
}

/**
 * Reveal the Dabbler container, genuinely idempotently: an activity-bar icon
 * TOGGLES, so clicking one whose container is already active hides the
 * sidebar instead of doing nothing. The extension reveals its own container
 * on activation for a repository that is already set up (it opens the
 * Dabbler terminal at the same moment), so a caller cannot assume the
 * sidebar starts closed -- this checks whether either of the container's own
 * panes is already showing before it clicks at all.
 */
export async function openDabblerContainer(page: Page): Promise<void> {
  const alreadyShowing = page.locator(
    `.pane-header[aria-label="${WORK_EXPLORER_VIEW_NAME} Section"], ` +
      `.pane-header[aria-label="${SOLUTION_EXPLORER_VIEW_NAME} Section"]`,
  );
  if (await alreadyShowing.first().isVisible().catch(() => false)) return;

  const activityIcon = page.locator(
    `.activitybar .action-label[aria-label*="${CONTAINER_TITLE}"]`,
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  await page.waitForTimeout(250);
  // The click can still land as a toggle-CLOSE, if the container became
  // active between the check above and this click (the extension's own
  // startup reveal is asynchronous). One corrective click undoes it.
  if (!(await alreadyShowing.first().isVisible().catch(() => false))) {
    await activityIcon.click();
    await page.waitForTimeout(250);
  }
}

/**
 * One contributed view's own pane, expanded, WITHOUT waiting for any row.
 * Use for emptiness or TreeView.message assertions.
 *
 * Selected by the pane's OWN heading. The container holds more than one view
 * and "the first pane with a list" silently resolves to whichever one
 * happens to render a list first — which makes a passing emptiness
 * assertion mean nothing at all.
 */
export async function paneNamed(
  page: Page,
  viewName: string,
  opts: { reveal?: boolean } = {},
): Promise<import("@playwright/test").Locator> {
  if (opts.reveal !== false) await openDabblerContainer(page);
  const pane = page
    .locator(".pane")
    .filter({
      has: page.locator(`.pane-header[aria-label="${viewName} Section"]`),
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

/**
 * The Work Explorer's own pane, expanded, WITHOUT waiting for any row.
 * Use for emptiness or TreeView.message assertions.
 */
export async function workExplorerPane(
  page: Page,
  opts: { reveal?: boolean } = {},
): Promise<import("@playwright/test").Locator> {
  return paneNamed(page, WORK_EXPLORER_VIEW_NAME, opts);
}

/** The Solution Explorer's own pane, expanded, WITHOUT waiting for any row. */
export async function solutionExplorerPane(
  page: Page,
  opts: { reveal?: boolean } = {},
): Promise<import("@playwright/test").Locator> {
  return paneNamed(page, SOLUTION_EXPLORER_VIEW_NAME, opts);
}

/**
 * Collapse or expand a named pane's header, IDEMPOTENTLY: a no-op when it is
 * already in the requested state. Two panes share the container's vertical
 * space, so a shot meant to show one tree in full collapses the other one
 * first -- a virtualized list only renders the rows on screen.
 */
export async function setPaneExpanded(page: Page, viewName: string, expanded: boolean): Promise<void> {
  const pane = await paneNamed(page, viewName, { reveal: false });
  const header = pane.locator(".pane-header");
  const isExpanded = (await header.getAttribute("aria-expanded")) === "true";
  if (isExpanded !== expanded) {
    await header.click();
    await page.waitForTimeout(400);
  }
}

/**
 * Expand every collapsed row in *pane*, one at a time, until none are left.
 *
 * Each iteration re-queries the FIRST still-collapsed row rather than
 * indexing into a batch counted up front: expanding one row inserts its
 * children into the list and shifts every row after it, so a batch of
 * `nth(i)` clicks taken against a count from before the first click landed
 * on the wrong rows from the second click on -- silently skipping some
 * (measured: a four-sibling tree left the last sibling collapsed) rather
 * than failing loudly. *maxClicks* bounds the loop rather than running it to
 * a fixed point, since a row that can never expand (or a very deep tree)
 * would otherwise spin forever.
 */
export async function expandAllRows(
  pane: import("@playwright/test").Locator,
  maxClicks = 60,
): Promise<void> {
  const page = pane.page();
  for (let i = 0; i < maxClicks; i++) {
    const next = pane.locator('.monaco-list-row[aria-expanded="false"]').first();
    if ((await next.count()) === 0) return;
    try {
      await next.locator(".monaco-tl-twistie").click({ timeout: 2_500 });
      await page.waitForTimeout(200);
    } catch {
      // Could not expand this one (e.g. it scrolled out from under the
      // click); stop rather than loop on the same row forever.
      return;
    }
  }
}

/** Every rendered row's trimmed text. A virtualized list only renders what is on screen. */
export async function rowTexts(pane: import("@playwright/test").Locator): Promise<string[]> {
  return pane
    .locator(".monaco-list-row")
    .evaluateAll((elements) =>
      elements.map((element) => (element.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
    );
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
