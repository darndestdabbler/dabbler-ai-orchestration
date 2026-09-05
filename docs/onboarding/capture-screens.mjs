#!/usr/bin/env node
// Photograph the two Explorers for the onboarding deck.
//
// The deck's screens are taken from the running extension, never drawn, so
// a slide cannot promise a screen the product does not have. This script is
// the repeatable half of that promise: run it again when a pane changes and
// the same two files are overwritten.
//
//   node docs/onboarding/capture-screens.mjs
//
// It launches a real VS Code Electron with the extension under test through
// `tools/dabbler-ai-orchestration/scripts/vscode-launch.js` -- the one seam
// the Playwright layer and the walk stager already launch through. A capture
// script with its own binary discovery and its own environment allowlist
// would be a second copy of that rule, and the copy is what drifts: the
// operator would be looking at a window no test ever exercised.
//
// Two shots:
//
//   media/work-explorer.png       this repository's own Work Explorer, with
//                                 the status buckets D245 asked for
//   media/solution-explorer.png   the Solution Explorer over the four-repo
//                                 CSV solution, declared in a temporary
//                                 workspace this script writes and removes
//
// The CSV solution is DECLARED, not built. That is the deck's answer to the
// question the session plan left open: four .NET repositories through the
// lifecycle is its own set, so the shot is a real Explorer over a real
// declaration rather than a mockup of a screen that does not exist.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const EXTENSION_ROOT = path.join(REPO_ROOT, "tools", "dabbler-ai-orchestration");
const MEDIA = path.join(HERE, "media");

// Playwright is the extension's dev-dependency and stays there; the deck
// needs no dependency of its own to drive a window.
const extensionRequire = createRequire(path.join(EXTENSION_ROOT, "package.json"));
const { _electron } = extensionRequire("@playwright/test");
const launch = extensionRequire("./scripts/vscode-launch.js");

/** The four repositories of the CSV solution, as the operator specified them. */
const CSV_SOLUTION = `# The CSV solution as DECLARED. Four repositories, one solution.
#
# \`dependsOn\` is the only direction anyone writes; who depends on a
# component is derived, because two directions kept by hand disagree
# eventually and the disagreement is silent.
solution:
  name: csv-solution
  title: CSV ingest solution
  step: plan

components:
  - name: csv-model
    kind: library
    title: csv-model
    version: 1.1.0
    step: plan
    owner: platform
    dependsOn: []

  - name: csv-deserializer
    kind: library
    title: csv-deserializer
    version: 0.4.0
    step: plan
    owner: platform
    dependsOn:
      - csv-model

  - name: csv-persistence
    kind: library
    title: csv-persistence
    version: 0.2.0
    step: plan
    owner: platform
    dependsOn:
      - csv-model

  - name: csv-pipeline
    kind: integration
    title: csv-pipeline
    version: 0.1.0
    step: plan
    owner: platform
    dependsOn:
      - csv-model
      - csv-deserializer
      - csv-persistence
`;

/**
 * The `dabbler` the extension under test ships, not the workspace's copy.
 * A fixture staged by a different build than the window loads would be two
 * routers in one picture.
 */
const DABBLER_CLI = path.join(EXTENSION_ROOT, "dist", "dabbler.cjs");

/**
 * The workbench zoom the shots are taken at, and what it multiplies.
 *
 * The deck goes on a projector, so the window is zoomed and VS Code RENDERS
 * bigger rather than a small screenshot being stretched afterwards. VS Code's
 * zoom levels are powers of 1.2, and the factor is needed twice: once by the
 * window, once by every clip, since layout is measured in CSS pixels and a
 * screenshot is cut in device pixels.
 */
const ZOOM_LEVEL = 1;
const ZOOM = 1.2 ** ZOOM_LEVEL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function removeQuietly(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // opportunistic: a locked temp directory is not a failed capture
  }
}

/**
 * Launch VS Code against *workspacePath* and hand back the window.
 *
 * Every isolation flag, the binary and the child environment come from the
 * shared seam; the only thing decided here is the window size, because a
 * screenshot is the one caller that cares how big the workbench is.
 */
async function launchWorkbench(workspacePath) {
  const executablePath = launch.findCodeBinary(path.join(EXTENSION_ROOT, ".vscode-test"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-extensions-"));
  const state = launch.makeLaunchStateDirs();
  let childOutput = "";
  let app;
  try {
    app = await _electron.launch({
      executablePath,
      args: launch.launchArgs({
        extensionRoot: EXTENSION_ROOT,
        userDataDir,
        extensionsDir,
        workspacePath,
      }),
      env: launch.electronEnv({ ...state.env }),
      timeout: 60_000,
    });
    const child = app.process();
    child.stdout?.on("data", (c) => (childOutput += String(c)));
    child.stderr?.on("data", (c) => (childOutput += String(c)));
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
    await app.evaluate(({ BrowserWindow }, level) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      win.setBounds({ x: 20, y: 20, width: 1700, height: 1050 });
      win.webContents.setZoomLevel(level);
    }, ZOOM_LEVEL);
    await sleep(1_500);
    const cleanup = async () => {
      try {
        await app.close();
      } catch {
        // the window is going away either way
      }
      for (const dir of [userDataDir, extensionsDir, state.root]) removeQuietly(dir);
    };
    return { app, page, cleanup };
  } catch (error) {
    if (app) await app.close().catch(() => {});
    for (const dir of [userDataDir, extensionsDir, state.root]) removeQuietly(dir);
    const failure = error instanceof Error ? error : new Error(String(error));
    failure.message = launch.describeLaunchFailure(failure.message, childOutput);
    throw failure;
  }
}

/** Reveal the AI Orchestration container. The icon TOGGLES, so this is once. */
async function openContainer(page) {
  const icon = page.locator('.activitybar .action-label[aria-label*="AI Orchestration"]');
  await icon.waitFor({ state: "visible", timeout: 30_000 });
  await icon.click();
  await sleep(1_500);
}

function pane(page, viewTitle) {
  return page
    .locator(".pane")
    .filter({ has: page.locator(`.pane-header[aria-label="${viewTitle} Section"]`) })
    .first();
}

async function expandPane(page, viewTitle) {
  const target = pane(page, viewTitle);
  await target.waitFor({ state: "visible", timeout: 30_000 });
  const header = target.locator(".pane-header");
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
    await sleep(400);
  }
  return target;
}

async function collapsePane(page, viewTitle) {
  const target = pane(page, viewTitle);
  if ((await target.count()) === 0) return;
  const header = target.locator(".pane-header");
  if ((await header.getAttribute("aria-expanded")) === "true") {
    await header.click();
    await sleep(400);
  }
}

/** Expand a row by its twistie; the row body carries a command. */
async function expandRow(paneLocator, label) {
  const row = paneLocator.locator(".monaco-list-row").filter({ hasText: label }).first();
  if ((await row.count()) === 0) return false;
  await row.waitFor({ state: "visible", timeout: 15_000 });
  if ((await row.getAttribute("aria-expanded")) === "false") {
    await row.locator(".monaco-tl-twistie").click();
    await sleep(600);
  }
  return true;
}

/**
 * Widen the sidebar so the pane is legible at slide size.
 *
 * Dragged rather than configured: the width is workbench state, and this
 * launch has a throwaway profile with no state to configure. Best effort --
 * a shot of the default width is still a true shot.
 */
async function widenSidebar(page, toWidth) {
  try {
    const sidebar = await page.locator(".part.sidebar").boundingBox();
    if (!sidebar) return;
    const edge = sidebar.x + sidebar.width;
    // The sash on the sidebar's RIGHT edge, chosen by position: there is one
    // on the left as well, and dragging that one narrows what it should widen.
    const sashes = page.locator(".monaco-sash.vertical");
    let best = null;
    for (let i = 0; i < (await sashes.count()); i += 1) {
      const box = await sashes.nth(i).boundingBox();
      if (!box) continue;
      const distance = Math.abs(box.x + box.width / 2 - edge);
      if (!best || distance < best.distance) best = { box, distance };
    }
    if (!best || best.distance > 20) return;
    const y = sidebar.y + sidebar.height / 2;
    await page.mouse.move(best.box.x + best.box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(sidebar.x + toWidth, y, { steps: 12 });
    await page.mouse.up();
    await sleep(600);
  } catch {
    // the default width photographs fine
  }
}

/**
 * Clip from the activity bar to a strip of editor, so the pane has context,
 * and stop below the last painted row rather than shipping the empty half of
 * a tall window: a slide is about ten inches wide and every pixel of blank
 * sidebar is a pixel the reader has to look past.
 */
async function shootSidebar(page, file, rows) {
  // Take the caret and the pointer off the tree first: a row left focused or
  // hovered photographs as a highlight the reader will try to interpret.
  await page.locator(".part.editor").click({ position: { x: 60, y: 60 } }).catch(() => {});
  await page.mouse.move(1_400, 700).catch(() => {});
  await sleep(500);

  const activity = await page.locator(".activitybar").boundingBox();
  const sidebar = await page.locator(".part.sidebar").boundingBox();
  if (!activity || !sidebar) throw new Error("no sidebar to photograph");
  const left = Math.min(activity.x, sidebar.x);
  const right = Math.max(activity.x + activity.width, sidebar.x + sidebar.width);
  const top = Math.max(0, Math.floor(Math.min(activity.y, sidebar.y)));

  let bottom = sidebar.y + sidebar.height;
  if (rows) {
    // A virtual list positions its rows absolutely, so DOM order is not
    // visual order: the lowest row is found by measuring, not by index. And
    // only the rows the list has SCROLLED INTO EXISTENCE are measurable, so
    // trimming to them is right only when everything fits -- otherwise the
    // trim would cut the tree off mid-list, which is the one thing a shot of
    // a tree must not do.
    const content = await rows
      .first()
      .evaluate((row) => {
        const rowsElement = row.parentElement;
        if (!rowsElement) return null;
        const box = rowsElement.getBoundingClientRect();
        // The virtual container's own height is the WHOLE list, rendered or
        // not, which is the number a clip needs.
        return { top: box.top, height: rowsElement.offsetHeight || box.height };
      })
      .catch(() => null);
    if (content) bottom = Math.min(bottom, content.top + content.height + 24);
  }

  // Layout is measured in the workbench's own CSS pixels; the screenshot is
  // cut in the window's device pixels. At zoom those are not the same unit,
  // and a clip passed across unconverted photographs the top-left corner of
  // what was asked for -- which looks like a truncated tree, not like a bug.
  const clip = {
    x: Math.max(0, Math.floor(left * ZOOM)),
    y: Math.floor(top * ZOOM),
    width: Math.ceil((right - left + 80) * ZOOM),
    height: Math.ceil(Math.max(240, bottom - top) * ZOOM),
  };
  const bounds = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  clip.width = Math.min(clip.width, Math.floor(bounds.width * ZOOM) - clip.x);
  clip.height = Math.min(clip.height, Math.floor(bounds.height * ZOOM) - clip.y);
  fs.mkdirSync(MEDIA, { recursive: true });
  await page.screenshot({ path: file, clip });
  const { size } = fs.statSync(file);
  console.log(`wrote ${path.relative(REPO_ROOT, file)} (${clip.width}x${clip.height}, ${size} bytes)`);
}

/**
 * This repository's own Work Explorer: the repository row with its progress
 * fraction, the status buckets with dimmed counts (In Progress open, the
 * rest collapsed), and the in-flight session's steps beneath it.
 */
async function captureWorkExplorer() {
  const session = await launchWorkbench(REPO_ROOT);
  try {
    const { page } = session;
    await openContainer(page);
    await collapsePane(page, "Solution Explorer");
    const work = await expandPane(page, "Work Explorer");
    await work.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 60_000 });
    await widenSidebar(page, 560);
    await expandRow(work, /dabbler-ai-orchestration/);
    // In Progress opens itself; expanding the SESSION row is what shows the
    // steps of the plan it is working through. Matched on the numbered row
    // rather than on the words "in flight", which the repository row above
    // it also carries.
    const sessionRow = work
      .locator(".monaco-list-row")
      .filter({ hasText: /^\d{3}\s+·\s+/ })
      .first();
    if ((await sessionRow.count()) > 0 && (await sessionRow.getAttribute("aria-expanded")) === "false") {
      await sessionRow.locator(".monaco-tl-twistie").click();
      await sleep(800);
    }
    await sleep(1_000);
    await shootSidebar(
      page,
      path.join(MEDIA, "work-explorer.png"),
      work.locator(".monaco-list-row"),
    );
  } finally {
    await session.cleanup();
  }
}

/** The Solution Explorer over the declared four-repository CSV solution. */
async function captureSolutionExplorer() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "deck-csv-solution-"));
  fs.writeFileSync(path.join(workspace, "solution.yaml"), CSV_SOLUTION, "utf8");
  // The Explorer renders `.dabbler/solution/projection.json`, which the
  // router writes and nothing else may: entering the first step is the move
  // that publishes it, and it is the move a real solution starts with.
  const entered = spawnSync(process.execPath, [DABBLER_CLI, "workflow", "enter", "plan"], {
    cwd: workspace,
    encoding: "utf8",
  });
  if (!fs.existsSync(path.join(workspace, ".dabbler", "solution", "projection.json"))) {
    throw new Error(
      `the router wrote no solution projection: ${entered.stdout || ""}${entered.stderr || ""}`,
    );
  }
  const session = await launchWorkbench(workspace);
  try {
    const { page } = session;
    await openContainer(page);
    const solution = await expandPane(page, "Solution Explorer");
    await solution.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 60_000 });
    await collapsePane(page, "Work Explorer");
    await widenSidebar(page, 560);
    await expandRow(solution, /CSV ingest solution/);
    // Every component opened, so the declared dependsOn and the derived
    // usedBy are both on the picture.
    for (const name of ["csv-model", "csv-deserializer", "csv-persistence", "csv-pipeline"]) {
      await expandRow(solution, name);
    }
    // And every `Used by`, because the derived direction naming its
    // consumers is the whole point of the graph on the slide.
    const usedBy = solution.locator(".monaco-list-row").filter({ hasText: /^Used by/ });
    for (let i = 0; i < (await usedBy.count()); i += 1) {
      const row = usedBy.nth(i);
      if ((await row.getAttribute("aria-expanded")) === "false") {
        await row.locator(".monaco-tl-twistie").click();
        await sleep(400);
      }
    }
    await sleep(1_000);
    await shootSidebar(
      page,
      path.join(MEDIA, "solution-explorer.png"),
      solution.locator(".monaco-list-row"),
    );
  } finally {
    await session.cleanup();
    removeQuietly(workspace);
  }
}

const only = process.argv[2];
if (!only || only === "work") await captureWorkExplorer();
if (!only || only === "solution") await captureSolutionExplorer();
