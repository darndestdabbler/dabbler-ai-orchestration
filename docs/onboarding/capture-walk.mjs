#!/usr/bin/env node
// Walk a driven session on a scratch repository, and photograph it.
//
//   node docs/onboarding/capture-walk.mjs [--keep]
//
// This is the other half of the deck's screens. `capture-screens.mjs` can
// photograph a tree from a written fixture; the two terminals cannot be
// faked that way, because what they show is a session actually running:
// the person's own CLI on one side, and on the other the framework's
// `dabbler [time] event` lines with a test runner's own output arriving
// inside them.
//
// So this script opens a scratch repository under C:\temp -- never the
// repository it lives in -- in VS Code with the extension under test, and
// presses **Start Session**. Two shots come out of it:
//
//   media/terminals.png   the CLI and the Dabbler terminal side by side,
//                         with the Work Explorer's rows beside them
//   media/stop.png        a framework stop as the staff meet it: the toast
//                         with its recommended option, the attention row,
//                         and the activity-bar badge
//
// It also presses Start SEVERAL times in the one window, which is the
// second job: session 62 repaired terminal placement at its remediation
// cap -- a cached split Dabbler terminal is moved beside the CLI a later
// Start creates -- and that repair closed unreviewed. What the window does
// across repeated Starts is written up in `walk-notes.md`, which is
// authored by hand: a script may take the picture, but the verdict on a
// repair is a person's.
//
// TWO THINGS THIS SCRIPT DOES DIFFERENTLY, both written up in the notes
// because a reader of the pictures deserves to know:
//
//  1. HOME / USERPROFILE / APPDATA are the operator's real ones, because
//     the engine's CLI reads its credentials from them and a scoped home
//     photographs a login prompt instead of a CLI. `--user-data-dir` and
//     `--extensions-dir` stay isolated, so the editor profile and the
//     Recently Opened list are still untouched.
//  2. **Nothing is typed into the engine's CLI.** It is the real CLI that
//     Start opened, and it is waiting on its person -- because its first
//     `dabbler` call is a tool call and a tool call is a question. Nobody
//     is at this keyboard. So the `session next` calls that CLI would have
//     made are made by the script instead, which is what fills the Dabbler
//     terminal with the framework's own lines and the runner's own output.
//     A script that pressed keys into a CLI to make it look busy would be
//     faking the one thing these pictures exist to show.

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
const WALK_ROOT = process.env.DECK_WALK_ROOT || "C:\\temp\\s64-walk";

const extensionRequire = createRequire(path.join(EXTENSION_ROOT, "package.json"));
const { _electron } = extensionRequire("@playwright/test");
const launch = extensionRequire("./scripts/vscode-launch.js");

const DABBLER_CLI = path.join(EXTENSION_ROOT, "dist", "dabbler.cjs");

/** Zoom, and the factor every clip is converted by. See capture-screens.mjs. */
const ZOOM_LEVEL = 1;
const ZOOM = 1.2 ** ZOOM_LEVEL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function removeQuietly(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // opportunistic
  }
}

/**
 * The environment the walked window runs in.
 *
 * The allowlist from the shared seam, then the real home restored on top,
 * because the engine's CLI has credentials there and Start opens the
 * engine's CLI. This is the one place a capture script departs from the
 * test harness, and it is the reason the walk is a walk.
 */
function walkEnv() {
  return launch.electronEnv({
    HOME: process.env.HOME || process.env.USERPROFILE || "",
    USERPROFILE: process.env.USERPROFILE || "",
    APPDATA: process.env.APPDATA || "",
    LOCALAPPDATA: process.env.LOCALAPPDATA || "",
  });
}

async function launchWorkbench(workspacePath) {
  const executablePath = launch.findCodeBinary(path.join(EXTENSION_ROOT, ".vscode-test"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "walk-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "walk-extensions-"));
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
      env: walkEnv(),
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
        // going away either way
      }
      for (const dir of [userDataDir, extensionsDir]) removeQuietly(dir);
    };
    return { app, page, cleanup };
  } catch (error) {
    if (app) await app.close().catch(() => {});
    for (const dir of [userDataDir, extensionsDir]) removeQuietly(dir);
    const failure = error instanceof Error ? error : new Error(String(error));
    failure.message = launch.describeLaunchFailure(failure.message, childOutput);
    throw failure;
  }
}

async function openContainer(page) {
  const icon = page.locator('.activitybar .action-label[aria-label*="AI Orchestration"]');
  await icon.waitFor({ state: "visible", timeout: 30_000 });
  await icon.click();
  await sleep(1_500);
}

/**
 * Close the secondary side bar. The editor's own chat panel opens there by
 * default and takes a third of the window; on a slide about the framework's
 * terminals it is a third of the picture spent on something else.
 */
async function closeAuxiliaryBar(page) {
  const bar = page.locator(".part.auxiliarybar");
  if ((await bar.count()) === 0 || !(await bar.isVisible().catch(() => false))) return;
  await page.keyboard.press("Control+Alt+B");
  await sleep(800);
}

/**
 * The Work Explorer's own pane. The container holds two views and the
 * Solution Explorer renders rows of its own, so "the first pane with a
 * list" is the wrong one about half the time.
 */
function workPane(page) {
  return page
    .locator(".pane")
    .filter({ has: page.locator('.pane-header[aria-label="Work Explorer Section"]') })
    .first();
}

/**
 * Start Session from the repository ROW's context menu, which is where a
 * person presses it -- and the only place it works: the command takes the
 * repository node as its argument and returns silently without one, so
 * running it from the command palette does nothing at all.
 */
async function invokeStartOnRow(page) {
  const pane = workPane(page);
  const row = pane.locator(".monaco-list-row").first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await row.click({ button: "right" });
  const menu = page.locator(".context-view .monaco-menu");
  await menu.waitFor({ state: "visible", timeout: 10_000 });
  const item = menu
    .locator(".action-label")
    .filter({ hasText: /^Start Session$/ })
    .first();
  await item.waitFor({ state: "visible", timeout: 10_000 });
  // Hover, settle, then click: a context menu clicked while it is still
  // positioning itself swallows the click, and the Start that never
  // happened looks exactly like a Start that opened nothing.
  await item.hover();
  await sleep(400);
  await item.click();
  await sleep(1_500);
}

/**
 * Answer the two boxes Start raises: which engine, then which model.
 *
 * The model box is easy to miss and fatal to skip -- it is optional to
 * ANSWER, not optional to dismiss, and a Start left waiting on it opens no
 * terminal at all. Empty means the engine's own default.
 */
async function pickEngine(page, label) {
  const widget = page.locator(".quick-input-widget");
  await widget.waitFor({ state: "visible", timeout: 20_000 });
  await sleep(600);
  await page.keyboard.type(label);
  await sleep(800);
  await page.keyboard.press("Enter");
  await sleep(1_500);

  // The model box, if it came. Empty is the engine's own default.
  if (await widget.isVisible().catch(() => false)) {
    const title = await widget.innerText().catch(() => "");
    if (/model for/i.test(title)) {
      await page.keyboard.press("Enter");
      await sleep(1_500);
    }
  }
}

/**
 * Drive the scratch session far enough that the framework is visibly at
 * work, and stop the moment it is.
 *
 * WHY THE SCRIPT DRIVES, and not the CLI Start opened: the engine's own
 * CLI asks its person before it runs anything -- the first `dabbler` call
 * is a tool call, and a tool call is a question. Nobody is at this
 * keyboard, and a script that answered on the engine's behalf would be
 * faking the one thing the picture is meant to show. So the CLI in the
 * shot is the real CLI Start opened, waiting on its person exactly as it
 * would for you, and these calls are the same `dabbler session next` that
 * CLI would have made once you said yes. The walk notes say so plainly.
 *
 * It stops at the first `wait`, because a `wait` means a background job is
 * running -- the affected tests -- and that is the moment the Dabbler
 * terminal carries a phase line, a `job-started`, and the runner's own
 * output in the runner's own colours.
 */
function driveUntilWorking(maxCalls = 8) {
  const args = ["session", "next", "--sessions-dir", "docs/sessions"];
  const seen = [];
  for (let call = 0; call < maxCalls; call += 1) {
    const first = call === 0 ? ["--engine", "claude-code", "--provider", "anthropic"] : [];
    const result = dabbler([...args, ...first], WALK_ROOT);
    const instruction = parseInstruction(result.stdout || "");
    if (!instruction) {
      seen.push(`no instruction: ${(result.stderr || "").trim().split("\n").pop()}`);
      break;
    }
    seen.push(`${instruction.kind}${instruction.step_id ? ` ${instruction.step_id}` : ""}`);
    if (instruction.kind === "wait") break;
    if (instruction.kind === "done" || instruction.kind === "rejection") break;
    if (instruction.step_id === "plan") {
      answerPlan(instruction.seq);
      continue;
    }
    if (instruction.step_id === "greeting") {
      writeGreeting();
      dabbler(
        [
          "session", "report", "--sessions-dir", "docs/sessions",
          "--seq", String(instruction.seq), "--step", "greeting", "--status", "done",
          "--files", "src/widget.mjs,tests/test_widget.mjs",
          "--notes", "greet(name) added with its test",
        ],
        WALK_ROOT,
      );
      continue;
    }
    break;
  }
  return seen;
}

/** The instruction JSON `next` prints, and nothing else, from stdout. */
function parseInstruction(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

/** The scratch session's work plan: one step, one check, one small edit. */
function answerPlan(seq) {
  const scratch = path.join(WALK_ROOT, ".dabbler", "scratch");
  fs.mkdirSync(scratch, { recursive: true });
  const file = path.join(scratch, "plan.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        task: "Give the widget a greeting: `greet(name)` returning `Hello, <name>.`, with a test.",
        releasable: false,
        steps: [
          {
            id: "greeting",
            ask: "Add `greet(name)` to src/widget.mjs and a test for it in tests/test_widget.mjs.",
            files: ["src/widget.mjs", "tests/test_widget.mjs"],
            checks: [{ argv: ["node", "tests/run.mjs", "tests/test_widget.mjs"] }],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  dabbler(
    ["session", "report", "--sessions-dir", "docs/sessions", "--seq", String(seq), "--answer-file", file],
    WALK_ROOT,
  );
}

/** The one edit the scratch session's step asks for. */
function writeGreeting() {
  const widget = path.join(WALK_ROOT, "src", "widget.mjs");
  const test = path.join(WALK_ROOT, "tests", "test_widget.mjs");
  if (!fs.readFileSync(widget, "utf8").includes("export function greet")) {
    fs.appendFileSync(widget, "\n/** Greet someone by name. */\nexport function greet(name) {\n  return `Hello, ${name}.`;\n}\n");
  }
  if (!fs.readFileSync(test, "utf8").includes("test_widget_greets")) {
    fs.appendFileSync(
      test,
      "\nexport function test_widget_greets_by_name() {\n  assert.equal(greet(\"Ada\"), \"Hello, Ada.\");\n}\n",
    );
    const body = fs.readFileSync(test, "utf8").replace(
      'import { widget } from "../src/widget.mjs";',
      'import { greet, widget } from "../src/widget.mjs";',
    );
    fs.writeFileSync(test, body, "utf8");
  }
}

/**
 * Start Session, answered with *engine*.
 *
 * Never throws. A Start that does not complete is an OBSERVATION about the
 * window -- which is what the placement review is made of -- and a throw
 * here would end the walk instead of recording it.
 */
async function startSession(page, engine) {
  try {
    await invokeStartOnRow(page);
    await pickEngine(page, engine);
    await sleep(5_000);
    return { ok: true, terminals: await terminalTabs(page) };
  } catch (error) {
    return {
      ok: false,
      terminals: await terminalTabs(page).catch(() => []),
      note: (error instanceof Error ? error.message : String(error)).split("\n")[0],
    };
  }
}

/** Expand the repository row, so the attention rows and buckets are on the shot. */
async function expandRepositoryRow(page) {
  const pane = workPane(page);
  const row = pane.locator(".monaco-list-row").first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  if ((await row.getAttribute("aria-expanded")) === "false") {
    await row.locator(".monaco-tl-twistie").click();
    await sleep(1_000);
  }
}

/**
 * Clear the toasts a fresh repository raises before the walk starts, so the
 * shot carries the walk's own surfaces and not bootstrap's. The owed
 * decision itself is untouched -- it stays an attention row in the
 * Explorer, which is where it belongs.
 */
async function dismissToasts(page) {
  for (let i = 0; i < 4; i += 1) {
    const close = page.locator(".notifications-toasts .codicon-notifications-clear").first();
    if ((await close.count()) === 0) return;
    await close.click().catch(() => {});
    await sleep(400);
  }
}

/** Every terminal the window has open, in the order the tab list shows them. */
async function terminalTabs(page) {
  const tabs = page.locator(".terminal-tabs-entry");
  const names = [];
  for (let i = 0; i < (await tabs.count()); i += 1) {
    const text = (await tabs.nth(i).innerText()).trim().replace(/\s+/g, " ");
    if (text) names.push(text);
  }
  return names;
}

/** What the run record says the framework is doing, or null before it says. */
function runState(sessionNumber = 1) {
  const file = path.join(WALK_ROOT, ".dabbler", "runs", `s${sessionNumber}`, "driver", "run.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Wait until the framework has done something worth photographing: a phase
 * past the plan, or a job whose log exists. Returns what it saw, and does
 * not throw on a timeout -- a shot of a session that got no further is
 * still the truth, and the notes say so.
 */
async function waitForRealWork(seconds) {
  // The job may already be running by the time this is called.
  const deadline = Date.now() + seconds * 1_000;
  let last = null;
  while (Date.now() < deadline) {
    const state = runState();
    if (state) {
      last = state;
      const jobs = path.join(WALK_ROOT, ".dabbler", "runs", "s1", "driver", "jobs");
      const logs = fs.existsSync(jobs)
        ? fs.readdirSync(jobs).filter((f) => f.endsWith(".log"))
        : [];
      const written = logs.some((f) => {
        try {
          return fs.statSync(path.join(jobs, f)).size > 0;
        } catch {
          return false;
        }
      });
      // A log with bytes in it means the runner has started writing, and
      // its lines are already crossing the Dabbler terminal. Settle for a
      // moment so the shot catches them arriving rather than the blank
      // instant before.
      if (written) {
        await sleep(6_000);
        return { state: runState() || state, hasJobLog: true };
      }
    }
    await sleep(3_000);
  }
  return { state: last, hasJobLog: false };
}

/**
 * The whole window: the terminals AND the Explorer beside them.
 *
 * No clip. The Explorer shots cut a region and must convert CSS pixels to
 * device pixels to do it; a whole-window shot needs neither, and a clip
 * wider than the page is silently trimmed -- which is how a toast at the
 * right-hand edge loses its last third.
 */
async function shootWindow(app, file) {
  // Electron's own capture, not Playwright's. A page screenshot is cut in
  // the page's coordinates, and at workbench zoom those stop short of the
  // window's right-hand edge -- which is exactly where the toasts are.
  const dataUrl = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const image = await win.webContents.capturePage();
    return image.toDataURL();
  });
  fs.mkdirSync(MEDIA, { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  const { size } = fs.statSync(file);
  console.log(`wrote ${path.relative(REPO_ROOT, file)} (${size} bytes)`);
}

function dabbler(args, cwd) {
  return spawnSync(process.execPath, [DABBLER_CLI, ...args], { cwd, encoding: "utf8" });
}

async function main() {
  if (!fs.existsSync(path.join(WALK_ROOT, "docs", "sessions", "session-plan.md"))) {
    throw new Error(
      `${WALK_ROOT} is not a bootstrapped repository. Stage it first: git init, ` +
        `then \`dabbler bootstrap --project-dir . --no-transport-detect\`, then a ` +
        `suite in dabbler.yaml and a session plan.`,
    );
  }

  const session = await launchWorkbench(WALK_ROOT);
  const { page } = session;
  try {
    await openContainer(page);
    await closeAuxiliaryBar(page);
    await page.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 60_000 });
    await dismissToasts(page);

    // Start once: the engine's own CLI, and the Dabbler terminal beside it.
    const afterFirst = await startSession(page, "Claude Code");
    console.log("terminals after Start #1:", JSON.stringify(afterFirst));
    // Nothing is typed into that CLI. It is waiting on its person, which
    // is what it does; the calls it would make are made here instead.
    await sleep(4_000);
    console.log("drove:", JSON.stringify(driveUntilWorking()));

    const progress = await waitForRealWork(Number(process.env.DECK_WALK_WAIT || 600));
    console.log("run state:", JSON.stringify(progress.state?.phase ?? null), "job log:", progress.hasJobLog);

    await expandRepositoryRow(page);
    await shootWindow(session.app, path.join(MEDIA, "terminals.png"));

    // Start twice more in the SAME window: the placement session 62
    // repaired at its cap, exercised where a reader can see it. The tab
    // list's own box-drawing prefixes are the evidence -- `┌` and `└` mark
    // a split pair, so a Dabbler terminal that landed beside the CLI a
    // Start created reads straight off the names.
    const afterSecond = await startSession(page, "Claude Code");
    console.log("terminals after Start #2:", JSON.stringify(afterSecond));
    const afterThird = await startSession(page, "Claude Code");
    console.log("terminals after Start #3:", JSON.stringify(afterThird));

  } finally {
    if (!process.argv.includes("--keep")) await session.cleanup();
  }

  // ---------------------------------------------------------------------
  // The stop, in a window of its own.
  //
  // Two reasons it is not the same window. The stop must be ON THE RECORD
  // before anyone can be told about it -- `interrupt` queues the request
  // and the next call through the loop is what lands it -- and the toast
  // is raised for a decision the WINDOW has not seen before, so a window
  // that has already announced this repository's decisions announces
  // nothing when it is reopened. A person meeting a stop is meeting it for
  // the first time; the shot has to be a window that is too.
  // ---------------------------------------------------------------------
  const requested = dabbler(
    ["session", "interrupt", "--stop", "--sessions-dir", "docs/sessions", "--reason", "Stopped for the deck's walk"],
    WALK_ROOT,
  );
  console.log("interrupt:", lastLine(requested));
  const landed = dabbler(["session", "next", "--sessions-dir", "docs/sessions"], WALK_ROOT);
  console.log("stop landed:", JSON.stringify(runState()?.stop ?? null));
  if (!runState()?.stop) console.log("next said:", lastLine(landed));

  const after = await launchWorkbench(WALK_ROOT);
  try {
    await openContainer(after.page);
    await closeAuxiliaryBar(after.page);
    await after.page.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 60_000 });
    await expandRepositoryRow(after.page);
    // Inside the toast's own lifetime: it is the surface being photographed.
    await sleep(2_000);
    await shootWindow(after.app, path.join(MEDIA, "stop.png"));
  } finally {
    if (!process.argv.includes("--keep")) await after.cleanup();
  }
}

function lastLine(result) {
  return ((result.stdout || "") + (result.stderr || "")).trim().split("\n").slice(-1)[0];
}

await main();
