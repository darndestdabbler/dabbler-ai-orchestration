#!/usr/bin/env node
// Windows OS-capture walkthrough recorder for the AI Work Explorer
// (Set 113 Session 4).
//
//   node scripts/record-vscode-walkthrough.js
//   node scripts/record-vscode-walkthrough.js --no-video
//
// NOT APPROVED FOR USE, and deliberately not an npm script. The Session 4
// pilot's authoritative verdict is FAIL, and no operator ruling waiving the
// unmet criteria exists yet, so this must not be presented as an available
// feature -- a registered `npm run` entry is indistinguishable from shipped
// functionality. It is reachable directly, because the guided look needs to
// run it, and it says what it is on every run.
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
// ONE THING IT CAN NOW DO, ON REQUEST (Set 113 Session 7): `--physical-
// pointer` moves the REAL Windows pointer to each target before the
// synthesised click, so OBS -- which has been drawing the system cursor all
// along -- has a cursor worth drawing. It is opt-in and never a default,
// because it TAKES OVER THE OPERATOR'S MOUSE for the length of the run. The
// web recorder's synthetic pointer is a different mechanism for a different
// reason and is not interchangeable with this one.
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
const pointer = require("./pointer.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const DEFAULT_SCENARIO = path.join("docs", "walkthroughs", "work-explorer-first-look");
const DEFAULT_OUT_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs");
// Where the pilot's committed record lives. The CLI reads its own approval
// from there rather than from a sentence in this file.
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);

const DRIVER_NAME = "playwright-vscode";

// How long a step's expected row may take to appear. A ceiling on a slow
// workbench, not a pacing knob.
const EXPECT_TIMEOUT_MS = 20000;

// How long the recording stays open after the last step. Comfortably more
// than the 32-83ms cue overhang the pilot measured, and short enough that
// it reads as a beat rather than a pause.
const TAIL_HOLD_MS = 750;

function log(msg) {
  console.log("[walkthrough:vscode] " + msg);
}

/**
 * An internal test seam: throw a PLAIN Error at a named point in the
 * capture lifecycle.
 *
 * It exists because "a capture failure degrades to no video instead of
 * destroying the walkthrough" is a claim, and the pilot's job is to
 * measure claims rather than accept them. The plain-Error type is the
 * point: the paths that were broken threw plain Errors -- `configure()`
 * refusing to guess between two Extension Development Hosts is one -- and
 * a catch that only recognised `ObsUnavailableError` let them through.
 *
 * Never set outside the pilot.
 */
async function induceIf(opts, point, session) {
  if (opts.induceFailureAt !== point) return;
  // Hand the caller the LIVE session first, so the pilot can record what
  // actually existed at the instant of failure. Without this the claim
  // "the collection, profile and input all existed by now" is prose; with
  // it, the measurement carries the state it was true of.
  if (typeof opts.onInduce === "function") {
    try {
      await opts.onInduce(point, session);
    } catch {
      /* observing must never change the failure being induced */
    }
  }
  throw new Error(
    "INDUCED capture failure at '" + point + "' (pilot test seam). A " +
      "capture failure must degrade to no video, never destroy the " +
      "walkthrough."
  );
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
    physicalPointer: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") options.scenario = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--no-video") options.video = false;
    else if (arg === "--keep") options.keep = true;
    // Opt-in, every time, and never inferred from anything else. Taking over
    // someone's mouse is not a thing to do because a heuristic thought a
    // recording would look better for it.
    else if (arg === "--physical-pointer") options.physicalPointer = true;
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

// How long the workbench is held still on each side of the two instants the
// pointer visibility check samples. OBS's start-up bracket is wider than a
// browser context's, so this is wider than the web recorder's -- both
// instants must sit in the middle of a window in which nothing but the
// pointer is moving, or the check measures the workbench instead.
const POINTER_QUIET_MS = 320;

/**
 * Walk the REAL pointer to a locator before the synthesised click lands on
 * it, and record the probe the visibility check reads.
 *
 * Two coordinate spaces meet here and the conversion is the whole trick.
 * `boundingBox()` is in the renderer's CSS pixels; `SetCursorPos` wants
 * physical screen pixels; and the recorded frame is the window's physical
 * pixels with its own origin. The calibration solves the first to the
 * second by measurement, and the frame coordinate is the CSS point times
 * the display's scale factor -- which is the same arithmetic the pilot
 * already uses to state the capture canvas size.
 */
async function approachWithPointer(page, locator, mouse, stepId, label) {
  if (!mouse) return null;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;
  const client = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  const screen = mouse.calibration.toScreen(client.x, client.y);
  const previous = mouse.pointer.lastKnown
    ? {
        x: Math.round(
          (mouse.pointer.lastKnown.x - mouse.calibration.origin.x) /
            mouse.calibration.scale.x *
            mouse.scaleFactor
        ),
        y: Math.round(
          (mouse.pointer.lastKnown.y - mouse.calibration.origin.y) /
            mouse.calibration.scale.y *
            mouse.scaleFactor
        ),
      }
    : null;

  await page.waitForTimeout(POINTER_QUIET_MS);
  const departedAtMillis = mouse.since();
  await page.waitForTimeout(POINTER_QUIET_MS);

  if (mouse.move) await mouse.pointer.approach(screen.x, screen.y);
  else await pointer.sleep(pointer.APPROACH_TOTAL_MS);

  await page.waitForTimeout(POINTER_QUIET_MS);
  const arrivedAtMillis = mouse.since();
  await page.waitForTimeout(POINTER_QUIET_MS);

  const probe = {
    stepId,
    selector: label,
    // Frame pixels, not CSS pixels: the recording is the window at its
    // physical size, so the check's crop has to be too.
    to: {
      x: Math.round(client.x * mouse.scaleFactor),
      y: Math.round(client.y * mouse.scaleFactor),
    },
    screen,
    departedAtMillis,
    arrivedAtMillis,
    previousPosition: mouse.move ? previous : null,
  };
  mouse.probes.push(probe);
  return probe;
}

/** Run one step's quarantined mechanics. */
async function performStep(page, block, mechanics, mouse, stepId) {
  const primary = rowLocator(page, block, mechanics.rowText);
  await primary.waitFor({ state: "visible", timeout: EXPECT_TIMEOUT_MS });

  if (mechanics.click === "twistie") {
    const twistie = primary.locator(block.twistieSelector).first();
    await approachWithPointer(page, twistie, mouse, stepId, "twistie");
    await twistie.click();
    await page.waitForTimeout(500);
  } else if (mechanics.click === "body") {
    await approachWithPointer(page, primary, mouse, stepId, "row");
    await primary.click();
    await page.waitForTimeout(900);
  } else {
    // An observation-only step. The reviewer looks; nothing is driven.
    await page.waitForTimeout(400);
  }

  if (mechanics.then) {
    const secondary = rowLocator(page, block, mechanics.then.rowText);
    await secondary.waitFor({ state: "visible", timeout: EXPECT_TIMEOUT_MS });
    await approachWithPointer(
      page,
      secondary,
      mouse,
      stepId,
      mechanics.then.hover ? "then-hover" : "then-click"
    );
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
  // Held here rather than inside the try, so the `finally` can put the
  // operator's mouse back even if the failure happened before the first
  // step. Restoring on the happy path only is how a crashed run leaves
  // someone's pointer parked in a tree row.
  let physical = null;
  let topmost = false;
  const pointerProbes = [];
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
        // Opt-in, and only the pilot opts in. The shipped recorder must not
        // reconfigure the user's OBS: "installed with its websocket
        // disabled" is a supported missing-dependency state, and the
        // documented fix is one click in OBS's own UI.
        mayEnableWebsocketConfig: opts.mayEnableWebsocketConfig === true,
      });
      // Cleanup ownership is handed to the `finally` block IMMEDIATELY, and
      // that ordering is load-bearing. `configure` can fail with something
      // that is not an ObsUnavailableError -- the refusal to guess between
      // two matching windows is a plain Error -- and that path rethrows. If
      // the handle were only published on success, a rethrow would leave OBS
      // running and the operator's websocket config rewritten, with nothing
      // holding a reference to put either back.
      capture = session;

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
        // AFTER configure() has returned: the scene collection, the profile
        // and the window-capture input all exist by now, which is what
        // makes this a post-operation failure rather than a pre-operation
        // one. Verification's nit on the first version was exact -- the
        // injection sat before the call and so proved less than the prose
        // claimed.
        await induceIf(opts, "configure", session);
        result.obs = {
          version: version.obsVersion,
          websocket: version.obsWebSocketVersion,
          window: configured.chosenWindow.name,
          canvas: configured.canvas,
        };
      } catch (err) {
        // EVERY capture failure degrades. Not only a missing dependency.
        //
        // The first cut caught `ObsUnavailableError` alone and rethrew
        // anything else, which meant two realistic failures destroyed the
        // whole walkthrough: `configure()`'s refusal to guess between two
        // matching Extension Development Hosts throws a plain Error, and a
        // developer with a second host open hits it routinely. The run then
        // skipped every step, deleted its own output directory, and exited
        // non-zero -- so a person who wanted a walkthrough and could not
        // have a video got NEITHER.
        //
        // Failure to record must never fail the walkthrough. That is the
        // spec's rule, and it does not have an exception for the failures
        // this driver happens to find embarrassing.
        capture = null;
        result.obsUnavailableKind =
          err instanceof ObsUnavailableError ? err.kind : "capture-setup-failed";
        result.obsUnavailableMessage = String((err && err.message) || err);
        notes.push(
          "OS capture was unavailable (" + result.obsUnavailableKind + "): " +
            result.obsUnavailableMessage +
            " The walkthrough document stands alone and is unaffected."
        );
        log(
          "OS capture unavailable (" + result.obsUnavailableKind +
            ") - continuing without it"
        );
        // Anything the failed attempt already changed is put back now,
        // rather than left for a cleanup that no longer knows about it.
        try {
          result.cleanupProblems = await session.cleanup();
        } catch (cleanupErr) {
          result.cleanupProblems = [
            "cleanup after failed setup threw: " +
              String((cleanupErr && cleanupErr.message) || cleanupErr),
          ];
        }
      }
    } else {
      notes.push(
        "run made with --no-video: OS capture was deliberately not requested"
      );
    }

    if (capture) {
      // Starting the recording is a capture concern like any other, and it
      // fails in a way the pilot measured: OBS accepts StartRecord and its
      // output never becomes active. That raised out of the whole run
      // before this guard existed, taking the walkthrough with it.
      try {
        const anchor = await capture.startRecording();
        anchorMillis = anchor.anchorMillis;
        result.anchor = anchor;
        // AFTER startRecording() has returned: the recording is live.
        await induceIf(opts, "start", capture);
      } catch (err) {
        result.obsUnavailableKind =
          err instanceof ObsUnavailableError ? err.kind : "recording-start-failed";
        result.obsUnavailableMessage = String((err && err.message) || err);
        notes.push(
          "recording could not be started (" + result.obsUnavailableKind +
            "): " + result.obsUnavailableMessage +
            " The walkthrough continued without a video."
        );
        log(
          "recording could not be started (" + result.obsUnavailableKind +
            ") - continuing without it"
        );
        try {
          result.cleanupProblems = await capture.cleanup();
        } catch (cleanupErr) {
          result.cleanupProblems = [
            "cleanup after failed start threw: " +
              String((cleanupErr && cleanupErr.message) || cleanupErr),
          ];
        }
        capture = null;
        anchorMillis = Date.now();
        result.anchor = { anchorMillis, uncertaintyMillis: 0 };
      }
    } else {
      anchorMillis = Date.now();
      result.anchor = { anchorMillis, uncertaintyMillis: 0 };
    }
    emit({ event: "run-started", atMillis: 0 });

    if (typeof opts.afterStart === "function") {
      await opts.afterStart({ capture, page, app, result });
    }

    // The physical pointer is opened AFTER the recording has started, so
    // the takeover lasts no longer than the capture it exists for, and it
    // is set up inside its own try: a machine where PowerShell cannot drive
    // the cursor, or a window the probe moves cannot reach, degrades to the
    // recording this recorder has always made rather than losing the run.
    let mouse = null;
    if (opts.physicalPointer) {
      try {
        // Bring the workbench to the front FIRST. Real pointer motion is
        // delivered to whatever window is on top at that point, so a
        // workbench sitting behind anything else hears nothing at all --
        // which is what happened the first time this ran, against a OneNote
        // window the operator had left open. This is also what a person
        // recording their screen would do without thinking about it.
        //
        // `focus()` alone is not enough and was measured not to be: Windows
        // refuses SetForegroundWindow to a process that is not already the
        // foreground one, so the second attempt found a Chrome window on top
        // instead of the OneNote one. Always-on-top goes through SetWindowPos
        // with HWND_TOPMOST, which is not subject to that restriction. It is
        // set only for a run that asked for the physical pointer, and it is
        // put back in the cleanup.
        await app.evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          w.show();
          w.setAlwaysOnTop(true, "screen-saver");
          w.moveTop();
          w.focus();
        });
        topmost = true;
        await page.waitForTimeout(400);
        physical = new pointer.PhysicalPointer(log).open();
        await physical.waitUntilReady();
        const calibration = await pointer.calibratePhysicalPointer(page, physical);
        // Said before the run rather than discovered afterwards. Moving the
        // pointer is now proved to work and the capture is proved not to
        // draw it, so a run that asked for a visible pointer and gets a
        // recording without one must be told why by the thing it ran.
        if (opts.video) {
          log(
            "NOTE: no OBS window-capture method composites the system cursor " +
              "-- WGC ignores the setting and BitBlt black-frames the " +
              "workbench (measured: s7-cursor-capture-backends.json). The " +
              "pointer will MOVE, and this recording will not show it."
          );
        }
        log(
          "physical pointer calibrated: scale " +
            calibration.scale.x.toFixed(3) +
            "x" +
            calibration.scale.y.toFixed(3) +
            ", residual " +
            calibration.residualPixels +
            "px"
        );
        mouse = {
          pointer: physical,
          calibration,
          probes: pointerProbes,
          since,
          scaleFactor: result.window.scaleFactor,
          move: true,
        };
        result.pointer = {
          mode: "physical",
          scale: calibration.scale,
          origin: calibration.origin,
          residualPixels: calibration.residualPixels,
          entry: physical.entry,
        };
      } catch (err) {
        if (physical) physical.close();
        physical = null;
        notes.push(
          "the physical pointer could not be used (" +
            String((err && err.message) || err) +
            "); the walkthrough was driven without it"
        );
        log("physical pointer unavailable - continuing without it");
        result.pointer = {
          mode: "unavailable",
          reason: String((err && err.message) || err),
        };
      }
    } else if (opts.pointerControl) {
      // The falsifier's control: the SAME timing, the SAME probe list, and
      // no pointer moved. A visibility check handed this must fail on the
      // pixels rather than on an empty probe list, which is the only way it
      // is evidence about pixels at all.
      mouse = {
        pointer: { lastKnown: null },
        calibration: {
          toScreen: () => ({ x: 0, y: 0 }),
          origin: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
        },
        probes: pointerProbes,
        since,
        scaleFactor: result.window.scaleFactor,
        move: false,
      };
      result.pointer = { mode: "off" };
      notes.push(
        "run made with the pointer control: the pointer timing was honoured " +
          "and no pointer was moved, so this recording is the control the " +
          "visibility check must FAIL on"
      );
    } else {
      result.pointer = { mode: "off" };
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
        await performStep(page, block, mechanics, mouse, step.id);
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
      // Hold the recording open past the last caption cue before stopping.
      //
      // MEASURED, not guessed. The pilot's C4 criterion caught the last cue
      // ending 32-83ms AFTER the recording did, across all eleven captures:
      // the cue window is derived from the run-finished event, and StopRecord
      // lands a few frames earlier than that event's timestamp. Nobody would
      // see it -- but a caption sidecar that runs past its own video is
      // wrong, and it is wrong in the direction that makes a player clamp or
      // drop the final cue.
      //
      // The hold is worth having on its own terms too: ending on the exact
      // frame of the last click is a hard cut, and a beat of stillness is
      // what lets a viewer read the result they were just told to look at.
      await page.waitForTimeout(TAIL_HOLD_MS);
      // Stopping is a capture concern too, and a stop that throws must not
      // take the walkthrough with it.
      let recording = null;
      try {
        await induceIf(opts, "stop", capture);
        recording = await capture.stopRecording();
      } catch (err) {
        notes.push(
          "the recording could not be stopped cleanly (" +
            String((err && err.message) || err) +
            "); the walkthrough document stands alone and is unaffected"
        );
        log("recording could not be stopped cleanly - continuing");
      }
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
    // Beside the manifest, never inside it: `walkthrough_run finalize` owns
    // the manifest's shape and refuses keys it does not know. The same file
    // name and shape as the web recorder writes, so one checker reads both.
    fs.writeFileSync(
      path.join(outDir, "pointer-probes.json"),
      JSON.stringify(
        {
          scenarioId: plan.scenarioId,
          driver: DRIVER_NAME,
          mode: (result.pointer && result.pointer.mode) || "off",
          // The frame is the window at its physical size, so the crop has to
          // grow with the display's scale factor: the system cursor is drawn
          // in physical pixels and is twice the size at 200%.
          cropSize: Math.round(56 * Math.max(1, result.window.scaleFactor)),
          scaleFactor: result.window.scaleFactor,
          calibration: result.pointer || null,
          probes: pointerProbes,
        },
        null,
        2
      ) + "\n",
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
    // FIRST, before anything slow. The operator's mouse is the one resource
    // here that belongs to a person rather than to this process, and every
    // path out of the run -- success, failure, an exception thrown before a
    // single step ran -- goes through here.
    if (topmost && launched) {
      // Put the window back to an ordinary one. A recorder that leaves an
      // always-on-top VS Code behind has changed the operator's desktop,
      // which is exactly the kind of side effect this session is supposed
      // to be careful about.
      try {
        await launched.app.evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (w) w.setAlwaysOnTop(false);
        });
      } catch (err) {
        /* the host is already gone, which achieves the same thing */
      }
      topmost = false;
    }
    if (physical) {
      try {
        physical.close();
      } catch (err) {
        result.cleanupProblems = (result.cleanupProblems || []).concat([
          "the physical pointer could not be released: " +
            String((err && err.message) || err),
        ]);
      }
      physical = null;
    }
    await closeEvents();
    if (capture) {
      try {
        result.cleanupProblems = await capture.cleanup();
      } catch (err) {
        result.cleanupProblems = ["cleanup threw: " + String(err && err.message)];
      }
    }
    if (launched) {
      // A VS Code that will not close is a leftover process, which is
      // exactly what C6 is about -- so the failure is REPORTED rather than
      // swallowed. Suppressing it here is how a cleanup criterion passes
      // while a host stays running.
      try {
        await launched.app.close();
      } catch (err) {
        result.cleanupProblems = (result.cleanupProblems || []).concat([
          "VS Code did not close: " + String((err && err.message) || err),
        ]);
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

/**
 * Whether CAPTURE is approved, read from the committed record.
 *
 * Verification rejected two weaker versions of this. Prose in an outcome
 * document gates nothing; and a warning that prints and then records anyway
 * *"leaves the operator's decision right advisory rather than enforced"*.
 * The contract is that a failed pilot ships no recorder, so the CLI
 * entrypoint FAILS CLOSED.
 *
 * Two things are deliberately still allowed, because the criterion is about
 * capture and not about the walkthrough:
 *
 *   * `--no-video` runs. Nothing is captured, so nothing is gated -- and
 *     the degraded path is exactly what a reader should be able to see.
 *   * The pilot imports `recordVscodeWalkthrough` directly. The acceptance
 *     criterion permits "pilot-only imports needed to retain or reproduce
 *     measurements", and without them the measurement cannot be
 *     reproduced at all.
 */
function captureApproval() {
  let evaluation = null;
  try {
    evaluation = JSON.parse(
      fs.readFileSync(path.join(SET_DIR, "s4-os-capture-measurement.json"), "utf8")
    ).evaluation;
  } catch {
    /* handled below -- absence is never treated as approval */
  }

  // An operator waiver is the other route to approval, and it has to be
  // COMMITTED rather than asserted: the whole point is that this session
  // cannot grant it to itself.
  let waiver = null;
  try {
    waiver = JSON.parse(
      fs.readFileSync(path.join(SET_DIR, "s4-operator-waiver.json"), "utf8")
    );
  } catch {
    /* no waiver on disk */
  }
  if (waiver && waiver.attestation && waiver.waivedBy) {
    return {
      approved: true,
      reason:
        "operator waiver on file (" + waiver.waivedBy + "): " +
        waiver.attestation,
    };
  }

  if (!evaluation) {
    return {
      approved: false,
      reason:
        "the OS-capture pilot's measurement could not be read, so nothing " +
        "here has been verified as passing. Absence of evidence is not " +
        "approval.",
    };
  }
  if (evaluation.verdict === "PASS") {
    return { approved: true, reason: "the pilot's committed verdict is PASS" };
  }
  return {
    approved: false,
    reason:
      "the OS-capture pilot's verdict is " + evaluation.verdict +
      " (unmet: " + (evaluation.unmet || []).join(", ") + ")",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // FAIL CLOSED on capture. A failed pilot ships no recorder, and a gate
  // that only warns is not a gate.
  if (options.video) {
    const approval = captureApproval();
    if (!approval.approved) {
      log("REFUSING to capture: " + approval.reason + ".");
      log(
        "  A failed pilot ships no recorder. See docs/session-sets/" +
          "113-narrated-video-walkthroughs/s4-os-capture-outcome.md."
      );
      log(
        "  To see the walkthrough without capture:  " +
          "node scripts/record-vscode-walkthrough.js --no-video"
      );
      log(
        "  To reproduce the measurement:            " +
          "npm run pilot:os-capture"
      );
      log(
        "  To approve capture: record an operator waiver at docs/session-" +
          "sets/113-narrated-video-walkthroughs/s4-operator-waiver.json " +
          '({"waivedBy": "...", "attestation": "..."}), or re-measure to a ' +
          "PASS verdict."
      );
      process.exitCode = 2;
      return;
    }
    log("capture approved: " + approval.reason + ".");
  }
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
  TAIL_HOLD_MS,
  POINTER_QUIET_MS,
  approachWithPointer,
  parseArgs,
  captureApproval,
  validateDriverBlock,
  locateStepTarget,
  performStep,
  recordVscodeWalkthrough,
  venvPython,
};
