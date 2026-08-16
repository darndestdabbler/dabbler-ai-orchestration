#!/usr/bin/env node
// Windows OS-capture walkthrough recorder for the AI Work Explorer
// (Set 113 Session 4).
//
//   npm run walkthrough:vscode
//   npm run walkthrough:vscode -- --no-video    (prove the degraded path)
//
// INTERNAL AND EXPLICITLY UNSTABLE, and Windows-only. This is the awkward
// half of the two-backend seam the operator's 2026-08-10 note describes:
// `record-web-walkthrough.js` is the PORTABLE path and serves every target
// that reaches a browser (.NET, Java, Python, vanilla JS); this one exists
// only because Playwright's `recordVideo` was measured to break the VS Code
// workbench, so the one product this framework cannot record with the
// portable path is its own.
//
// It shares everything that can be shared with the browser recorder: the
// same scenario source, the same `walkthrough_run plan` handover, the same
// step-event stream, the same artifact-agnostic manifest, the same rule
// that FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH. Only the driver
// and the capture backend differ.
//
// TWO THINGS IT DELIBERATELY DOES NOT DO.
//
//   1. No in-page emphasis. The web recorder outlines each step's target
//      and dims the rest, because it owns the page. This one does not own
//      the page -- the workbench is another product's DOM, and injecting a
//      stylesheet into it is exactly the cleverness that breaks on their
//      next release. Target bounding boxes ARE recorded, so post-processing
//      emphasis stays possible without re-recording anything.
//   2. No zoom, at capture time or otherwise. Capture-time zoom via OBS
//      scene transforms was refused outright (operator ruling, 2026-08-15):
//      it needs another plugin, needs live sync between driver and
//      transform, and produces something that cannot be regenerated from
//      the scenario source alone.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { _electron } = require("@playwright/test");

const { makeUatWorkspace } = require("./make-uat-workspace.js");
const { findCodeBinary, electronEnv, makeLaunchStateDirs } = require("./vscode-launch.js");
const { ObsCaptureSession, ObsUnavailableError } = require("./obs-capture.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const DEFAULT_SCENARIO = path.join("docs", "walkthroughs", "work-explorer-first-look");
const DEFAULT_OUT_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs");

const DRIVER_NAME = "playwright-vscode";

// How long a step's expected row may take to appear. A ceiling on a slow
// workbench, not a pacing knob.
const EXPECT_TIMEOUT_MS = 20000;

function log(msg) {
  console.log("[walkthrough:vscode] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * An interpreter that can import `ai_router`.
 *
 * Resolved by PROBING, not by assuming a repository-local `.venv` -- a
 * consumer repository installs `dabbler-ai-router` from PyPI and may have
 * no repo venv at all, and requiring one would make this work in exactly
 * one checkout. Session 3 shipped this fix for the browser recorder after
 * verification caught it; the same rule applies here.
 */
function venvPython() {
  const candidates = [
    path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
    path.join(REPO_ROOT, ".venv", "bin", "python"),
    process.env.PYTHON,
    "python",
    "python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const probe = cp.spawnSync(candidate, ["-c", "import ai_router"], {
        encoding: "utf8",
      });
      if (probe.status === 0) return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "no Python interpreter on this machine can import ai_router. Install " +
      "dabbler-ai-router (pip install dabbler-ai-router), or set PYTHON to " +
      "an interpreter that has it."
  );
}

function runPython(args) {
  const proc = cp.spawnSync(venvPython(), args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(
      "python " + args.join(" ") + " failed:\n" + (proc.stderr || proc.stdout)
    );
  }
  return proc.stdout;
}

function parseArgs(argv) {
  const options = {
    scenario: DEFAULT_SCENARIO,
    out: null,
    video: true,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") options.scenario = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--no-video") options.video = false;
    else if (arg === "--keep") options.keep = true;
    else throw new Error("unrecognised argument: " + arg);
  }
  return options;
}

/**
 * Refuse a driver block this driver cannot honour, BEFORE launching
 * anything. The quarantine only works if its consumer validates it: a
 * block with a typo would otherwise surface as a step that silently did
 * nothing, in a recording that looks fine.
 */
function validateDriverBlock(plan) {
  const block = plan.driverBlock;
  if (!block || typeof block !== "object") {
    throw new Error(
      "scenario " + plan.scenarioId + " has no '" + DRIVER_NAME + "' driver block"
    );
  }
  if (!block.paneSelector || !block.twistieSelector) {
    throw new Error(
      "driver block needs both paneSelector and twistieSelector"
    );
  }
  const steps = block.steps || {};
  for (const step of plan.steps) {
    if (!Object.prototype.hasOwnProperty.call(steps, step.id)) {
      throw new Error(
        "driver block has no mechanics for portable step '" + step.id + "'"
      );
    }
  }
  for (const id of Object.keys(steps)) {
    if (!plan.steps.some((s) => s.id === id)) {
      throw new Error(
        "driver block names step '" + id + "', which the portable scenario " +
          "does not have. A driver that drives steps nobody authored is " +
          "recording something the documents do not describe."
      );
    }
  }
  return block;
}

// ------------------------------------------------------------------ driving

function rowLocator(page, block, text) {
  return page
    .locator(block.paneSelector)
    .filter({ hasText: text })
    .first();
}

async function openWorkExplorer(page) {
  const icon = page.locator('.activitybar .action-label[aria-label*="AI Work Explorer"]');
  await icon.waitFor({ state: "visible", timeout: 60000 });
  await icon.click();
  await page.waitForTimeout(400);
  const pane = page.locator(".pane").filter({ has: page.locator(".monaco-list") }).first();
  await pane.waitFor({ state: "visible", timeout: 30000 });
  const header = pane.locator(".pane-header");
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
    await page.waitForTimeout(300);
  }
  await pane.locator(".monaco-list-row").first().waitFor({
    state: "visible",
    timeout: 30000,
  });
}

/**
 * Locate a step's target and return its bounding box, BEFORE anything is
 * clicked.
 *
 * Bounds ride on the `started` event, not on `completed`, and the contract
 * in `walkthrough_run` refuses them anywhere else -- correctly: `started`
 * is when the target was located, and a box measured after the action
 * describes whatever the UI became, not what the step pointed at. Nothing
 * reads these yet; they are the operator's cheap hedge (2026-08-15, tier 2)
 * that keeps post-processing zoom possible without re-recording.
 */
async function locateStepTarget(page, block, mechanics) {
  const primary = rowLocator(page, block, mechanics.rowText);
  await primary.waitFor({ state: "visible", timeout: EXPECT_TIMEOUT_MS });
  const box = await primary.boundingBox();
  if (!box) return null;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

/** Run one step's quarantined mechanics. */
async function performStep(page, block, mechanics) {
  const primary = rowLocator(page, block, mechanics.rowText);
  await primary.waitFor({ state: "visible", timeout: EXPECT_TIMEOUT_MS });

  if (mechanics.click === "twistie") {
    await primary.locator(block.twistieSelector).first().click();
    await page.waitForTimeout(500);
  } else if (mechanics.click === "body") {
    await primary.click();
    await page.waitForTimeout(900);
  } else {
    // An observation-only step. The reviewer looks; nothing is driven.
    await page.waitForTimeout(400);
  }

  if (mechanics.then) {
    const secondary = rowLocator(page, block, mechanics.then.rowText);
    await secondary.waitFor({ state: "visible", timeout: EXPECT_TIMEOUT_MS });
    if (mechanics.then.hover) {
      await secondary.hover();
      await page.waitForTimeout(900);
    } else {
      await secondary.click();
      await page.waitForTimeout(600);
    }
  }

  if (mechanics.expect && mechanics.expect.rowText) {
    await rowLocator(page, block, mechanics.expect.rowText).waitFor({
      state: "visible",
      timeout: EXPECT_TIMEOUT_MS,
    });
  }
}

// ------------------------------------------------------------------ the run

/**
 * Drive the scenario against a real Extension Development Host, recording
 * it with OBS when OBS is available.
 *
 * Returns a detailed result rather than printing one, because the pilot
 * harness measures ten of these and needs the numbers, not the log.
 */
async function recordVscodeWalkthrough(options) {
  const opts = Object.assign(
    { scenario: DEFAULT_SCENARIO, out: null, video: true, keep: false },
    options || {}
  );

  const plan = JSON.parse(
    runPython([
      "-m",
      "ai_router.walkthrough_run",
      "plan",
      opts.scenario,
      "--driver",
      DRIVER_NAME,
    ])
  );
  const block = validateDriverBlock(plan);

  const outDir = path.resolve(
    opts.out || path.join(DEFAULT_OUT_ROOT, plan.scenarioId)
  );
  if (fs.existsSync(outDir)) {
    const existing = fs.readdirSync(outDir);
    const isPriorRun =
      existing.includes("driver-output.json") || existing.includes("events.jsonl");
    if (existing.length > 0 && !isPriorRun) {
      throw new Error(
        "refusing to use " + outDir + ": it already has files in it and none " +
          "of them are from a previous walkthrough run."
      );
    }
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const eventsPath = path.join(outDir, "events.jsonl");
  const eventsStream = fs.createWriteStream(eventsPath, { encoding: "utf8" });
  let eventsClosed = false;
  const emit = (payload) => {
    if (!eventsClosed) eventsStream.write(JSON.stringify(payload) + "\n");
  };
  const closeEvents = () =>
    new Promise((resolve) => {
      if (eventsClosed) return resolve();
      eventsClosed = true;
      eventsStream.end(resolve);
    });

  const startedAt = new Date().toISOString();
  const notes = [];
  const artifacts = [];
  const result = {
    scenarioId: plan.scenarioId,
    outDir,
    stepCount: plan.steps.length,
    stepsCompleted: 0,
    obs: null,
    window: null,
    anchor: null,
    recording: null,
    cleanupProblems: [],
    failure: null,
    usable: false,
  };

  let workspacePath = null;
  let launched = null;
  let capture = null;
  let anchorMillis = 0;
  const since = () => Date.now() - anchorMillis;

  try {
    workspacePath = makeUatWorkspace();
    const code = findCodeBinary();
    const state = makeLaunchStateDirs();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-osrec-ud-"));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-osrec-ext-"));

    const app = await _electron.launch({
      executablePath: code,
      args: [
        "--extensionDevelopmentPath=" + EXTENSION_ROOT,
        "--user-data-dir=" + userDataDir,
        "--extensions-dir=" + extensionsDir,
        "--disable-workspace-trust",
        "--skip-release-notes",
        "--skip-welcome",
        "--disable-telemetry",
        "--disable-updates",
        "--new-window",
        workspacePath,
      ],
      env: electronEnv({ ...state.env }),
      timeout: 60000,
    });
    const page = await app.firstWindow({ timeout: 60000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60000 });
    launched = { app, page, userDataDir, extensionsDir, stateRoot: state.root };

    if (opts.windowSize) {
      await app.evaluate(async ({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentSize(size.width, size.height);
      }, opts.windowSize);
      await page.waitForTimeout(1200);
    }

    await openWorkExplorer(page);

    // The window's PHYSICAL pixels, which is what C3 compares the frame
    // against. Electron reports logical (DIP) bounds, so the scale factor
    // is applied here rather than assumed to be 1 -- assuming it is 1 is
    // the "scaling myopia" false pass by another name.
    const win = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const content = w.getContentBounds();
      const display = screen.getDisplayMatching(w.getBounds());
      return { content, scaleFactor: display.scaleFactor };
    });
    result.window = {
      logical: win.content,
      scaleFactor: win.scaleFactor,
      physical: {
        width: Math.round(win.content.width * win.scaleFactor),
        height: Math.round(win.content.height * win.scaleFactor),
      },
      pid: app.process().pid,
      workspace: workspacePath,
    };

    if (opts.video) {
      // The discriminator is the Extension Development Host prefix, not the
      // fixture folder name. Two facts made that the right choice, and both
      // were measured rather than assumed: `makeUatWorkspace` returns a
      // `.code-workspace` FILE whose basename never reaches the title bar,
      // and the very first capture attempt found ELEVEN candidate windows of
      // which TWO were `Code.exe` -- the fixture host and the operator's own
      // editor, running this session. A driver that matched "Code.exe" alone
      // would have recorded whichever came first.
      const session = new ObsCaptureSession({
        tag: opts.obsTag || "dabbler-walkthrough",
        port: opts.obsPort || 44667,
        obsExe: opts.obsExe,
        connectPassword: opts.obsConnectPassword,
        launchEnabled: opts.obsLaunch !== false,
      });
      // FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH. An unavailable
      // OBS degrades to the no-video path here rather than throwing out of
      // the run: the written documents are the deliverable and the video is
      // an enhancement, so a machine with no OBS still gets a walkthrough, a
      // manifest and an index that honestly say there is no recording.
      //
      // The first cut let the error propagate, which deleted the whole run
      // directory and produced nothing at all -- the exact opposite of the
      // degradation the spec asks for, and only visible because the pilot
      // measures this path instead of asserting it.
      try {
        session.prepareHost();
        const version = await session.launch();
        const configured = await session.configure({
          outDir,
          width: result.window.physical.width,
          height: result.window.physical.height,
          windowMatch: (candidate) => {
            const name = String(candidate.name || "").toLowerCase();
            return (
              name.includes("[code.exe]") &&
              name.includes("[extension development host]")
            );
          },
        });
        capture = session;
        result.obs = {
          version: version.obsVersion,
          websocket: version.obsWebSocketVersion,
          window: configured.chosenWindow.name,
          canvas: configured.canvas,
        };
      } catch (err) {
        if (!(err instanceof ObsUnavailableError)) throw err;
        result.obsUnavailableKind = err.kind;
        result.obsUnavailableMessage = err.message;
        notes.push(
          "OS capture was unavailable (" + err.kind + "): " + err.message +
            " The walkthrough document stands alone and is unaffected."
        );
        log("OS capture unavailable (" + err.kind + ") - continuing without it");
        // Anything the failed attempt already changed is put back now,
        // rather than left for a cleanup that no longer knows about it.
        try {
          result.cleanupProblems = await session.cleanup();
        } catch {
          /* the run itself is unaffected */
        }
      }
    } else {
      notes.push(
        "run made with --no-video: OS capture was deliberately not requested"
      );
    }

    if (capture) {
      const anchor = await capture.startRecording();
      anchorMillis = anchor.anchorMillis;
      result.anchor = anchor;
    } else {
      anchorMillis = Date.now();
      result.anchor = { anchorMillis, uncertaintyMillis: 0 };
    }
    emit({ event: "run-started", atMillis: 0 });

    if (typeof opts.afterStart === "function") {
      await opts.afterStart({ capture, page, app, result });
    }

    let failed = false;
    for (const step of plan.steps) {
      const mechanics = block.steps[step.id];
      const stepStarted = Date.now();
      try {
        const bounds = await locateStepTarget(page, block, mechanics);
        const started = { event: "started", stepId: step.id, atMillis: since() };
        if (bounds) started.bounds = bounds;
        emit(started);
        await performStep(page, block, mechanics);
        const onScreen = Date.now() - stepStarted;
        const budget = Math.max(Number(step.seconds) || 0, 0) * 1000;
        if (onScreen < budget) await page.waitForTimeout(budget - onScreen);
        emit({ event: "completed", stepId: step.id, atMillis: since() });
        result.stepsCompleted += 1;
      } catch (err) {
        emit({
          event: "failed",
          stepId: step.id,
          atMillis: since(),
          error: String((err && err.message) || err).slice(0, 500),
        });
        failed = true;
        break;
      }
    }

    emit({ event: "run-finished", atMillis: since() });
    await closeEvents();

    if (capture) {
      const recording = await capture.stopRecording();
      result.recording = recording;
      if (recording && recording.outputPath && fs.existsSync(recording.outputPath)) {
        const target = path.join(outDir, "recording.mp4");
        if (path.resolve(recording.outputPath) !== path.resolve(target)) {
          fs.renameSync(recording.outputPath, target);
        }
        result.recording.outputPath = target;
        artifacts.push({
          kind: "os-video",
          path: "recording.mp4",
          mediaType: "video/mp4",
          bytes: fs.statSync(target).size,
        });
      } else {
        notes.push(
          "OBS reported no output file; the walkthrough document stands " +
            "alone and is unaffected"
        );
      }
    }

    result.usable = true;
    const driverOutput = {
      scenarioId: plan.scenarioId,
      scenarioPath: plan.scenarioPath,
      portableDigest: plan.portableDigest,
      driver: DRIVER_NAME,
      target: {
        product: "vscode-extension-development-host",
        window: result.window.physical.width + "x" + result.window.physical.height,
        scaleFactor: result.window.scaleFactor,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      // `basis` names what time zero IS, and the uncertainty is the width
      // of the bracket around the call -- never a claim of frame accuracy.
      // OBS's encoder start-up is slower than a browser context's, so this
      // number is bigger here, and saying so plainly is the contract.
      anchor: {
        basis: capture
          ? "OBS reporting its recording output active, bracketed around the " +
            "StartRecord call"
          : "the walkthrough beginning; nothing was recorded",
        uncertaintyMillis: result.anchor.uncertaintyMillis,
      },
      artifacts,
      notes,
    };
    fs.writeFileSync(
      path.join(outDir, "driver-output.json"),
      JSON.stringify(driverOutput, null, 2) + "\n",
      "utf8"
    );
    result.summary = runPython([
      "-m",
      "ai_router.walkthrough_run",
      "finalize",
      outDir,
      "--scenario",
      plan.scenarioPath,
    ]);
    result.failedStep = failed;
  } catch (err) {
    result.failure = String((err && err.stack) || err);
    if (err instanceof ObsUnavailableError) {
      result.obsUnavailableKind = err.kind;
      result.obsUnavailableMessage = err.message;
    }
  } finally {
    await closeEvents();
    if (capture) {
      try {
        result.cleanupProblems = await capture.cleanup();
      } catch (err) {
        result.cleanupProblems = ["cleanup threw: " + String(err && err.message)];
      }
    }
    if (launched) {
      try {
        await launched.app.close();
      } catch {
        /* already gone */
      }
      for (const dir of [launched.userDataDir, launched.extensionsDir, launched.stateRoot]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        } catch {
          /* tmpdirs */
        }
      }
    }
    if (workspacePath && !opts.keep) {
      try {
        fs.rmSync(path.dirname(workspacePath), { recursive: true, force: true });
      } catch {
        /* same */
      }
    }
    if (!result.usable && !opts.keep) {
      try {
        fs.rmSync(outDir, { recursive: true, force: true });
      } catch {
        /* same */
      }
    }
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = await recordVscodeWalkthrough(options);
  } catch (err) {
    log("failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
    return;
  }

  if (result.obsUnavailableKind) {
    // The whole point of the degraded path: OBS being absent is reported
    // clearly and is NOT a failed walkthrough.
    log("OS capture unavailable (" + result.obsUnavailableKind + "): " +
        result.obsUnavailableMessage);
  }
  if (result.failure) {
    log("failed: " + result.failure);
    process.exitCode = 1;
    return;
  }
  if (result.summary) process.stdout.write(result.summary);
  if (result.cleanupProblems.length) {
    log("cleanup left problems: " + result.cleanupProblems.join("; "));
  }
  log("open " + path.join(result.outDir, "index.html"));
  process.exitCode = result.failedStep ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[walkthrough:vscode] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = {
  DRIVER_NAME,
  EXPECT_TIMEOUT_MS,
  parseArgs,
  validateDriverBlock,
  locateStepTarget,
  performStep,
  recordVscodeWalkthrough,
  venvPython,
};
