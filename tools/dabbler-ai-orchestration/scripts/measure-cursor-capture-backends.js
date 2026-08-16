#!/usr/bin/env node
// Which capture backend puts BOTH the window and the cursor in one frame?
// (Set 113 Session 7)
//
//   node scripts/measure-cursor-capture-backends.js
//
// A MEASUREMENT, not a backend. Nothing here is wired into a recorder, and
// choosing a capture backend is not this session's call to make -- the
// Session 4 pilot set seven criteria for exactly that decision and none of
// them are evaluated here.
//
// WHY IT EXISTS. The operator watched the Session 4 pilot recording and
// asked for the cursor to be visible. The diagnosis that followed said the
// capture side was already correct -- `cursor: true` was set on every one of
// those captures -- and that the missing half was a DRIVER that moved the
// pointer. The driver half is now built and proved: the real Windows pointer
// is walked to each target, calibrated against the window with a measured
// residual.
//
// The recording still has no cursor in it. So the premise needed testing
// rather than repeating, and this is the test: park the real pointer at a
// known point over the workbench, take one frame from each candidate
// backend, and ask each frame two questions.
//
//   1. IS THE WINDOW THERE? Correlation against a Playwright screenshot of
//      the same window, which is the instrument the pilot already uses for
//      "the capture shows the right window".
//   2. IS THE CURSOR THERE? One frame with the pointer parked at a known
//      point and one with it moved far away. A backend that draws the cursor
//      differs between them, locally, at that point. A backend that does not
//      is identical there. This is the same differential shape as the
//      pointer visibility check, for the same reason: it needs no knowledge
//      of the cursor's theme, size or colour.
//
// A backend has to answer YES to both. One of the three does.
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
const { ObsCaptureSession } = require("./obs-capture.js");
const { PhysicalPointer, sleep } = require("./pointer.js");
const { decodePng, comparePngs } = require("./png-metrics.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const OUT_PATH = path.join(SET_DIR, "s7-cursor-capture-backends.json");
const WORK = path.join(EXTENSION_ROOT, ".walkthrough-runs", "cursor-backends");

// The window is judged present at the pilot's own bar for "this is the right
// window", and judged absent well below it. A black frame correlates with
// nothing and scores 0.
const WINDOW_PRESENT_MIN_CORRELATION = 0.9;

// A pixel counts as changed when any channel moves by more than this.
const CHANNEL_TOLERANCE = 28;

// The cursor is a small glyph. Parked and moved-away frames of a still
// window differ at more than this fraction of a cursor-sized crop when the
// backend draws one, and at essentially nothing when it does not.
const CURSOR_PRESENT_MIN_CHANGED = 0.02;

const CROP = 56;

function log(msg) {
  console.log("[cursor-backends] " + msg);
}

/** Fraction of a crop that differs between two full-frame PNG buffers. */
function changedFractionInCrop(bufferA, bufferB, rect) {
  const a = decodePng(bufferA);
  const b = decodePng(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("frames are different sizes and cannot be differenced");
  }
  let changed = 0;
  let total = 0;
  for (let y = rect.y; y < Math.min(rect.y + rect.height, a.height); y += 1) {
    for (let x = rect.x; x < Math.min(rect.x + rect.width, a.width); x += 1) {
      const i = (y * a.width + x) * a.channels;
      const j = (y * b.width + x) * b.channels;
      total += 1;
      if (
        Math.abs(a.data[i] - b.data[j]) > CHANNEL_TOLERANCE ||
        Math.abs(a.data[i + 1] - b.data[j + 1]) > CHANNEL_TOLERANCE ||
        Math.abs(a.data[i + 2] - b.data[j + 2]) > CHANNEL_TOLERANCE
      ) {
        changed += 1;
      }
    }
  }
  return total ? changed / total : 0;
}

/** One gdigrab frame of a screen rectangle, with the cursor drawn. */
function gdigrabFrame(rect, outPath) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "gdigrab",
    "-draw_mouse",
    "1",
    "-framerate",
    "5",
    "-offset_x",
    String(rect.x),
    "-offset_y",
    String(rect.y),
    "-video_size",
    rect.width + "x" + rect.height,
    "-i",
    "desktop",
    "-frames:v",
    "1",
    "-y",
    outPath,
  ];
  const proc = cp.spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (proc.error || proc.status !== 0 || !fs.existsSync(outPath)) {
    throw new Error(
      "gdigrab failed: " + ((proc.stderr || "").trim() || "exit " + proc.status)
    );
  }
  return fs.readFileSync(outPath);
}

async function main() {
  const report = {
    measurement:
      "which Windows capture backend puts the workbench AND the system " +
      "cursor in the same frame",
    startedAt: new Date().toISOString(),
    platform: process.platform,
    thresholds: {
      windowPresentMinCorrelation: WINDOW_PRESENT_MIN_CORRELATION,
      cursorPresentMinChangedFraction: CURSOR_PRESENT_MIN_CHANGED,
      channelTolerance: CHANNEL_TOLERANCE,
      cropPixels: CROP,
    },
    backends: [],
    verdict: null,
    reason: null,
  };

  if (process.platform !== "win32") {
    report.verdict = "UNMEASURED";
    report.reason = "Windows-only; this is " + process.platform;
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    return;
  }

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const workspacePath = makeUatWorkspace();
  const state = makeLaunchStateDirs();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "curbe-ud-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "curbe-ext-"));
  let app = null;
  let ptr = null;

  try {
    app = await _electron.launch({
      executablePath: findCodeBinary(),
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
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.show();
      w.setAlwaysOnTop(true, "screen-saver");
      w.moveTop();
      w.focus();
    });
    await page.waitForTimeout(1200);

    const win = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const content = w.getContentBounds();
      const display = screen.getDisplayMatching(w.getBounds());
      return { content, scale: display.scaleFactor };
    });
    report.window = win;

    const physical = {
      width: Math.round(win.content.width * win.scale),
      height: Math.round(win.content.height * win.scale),
    };
    // Where the pointer is parked, in the window's own frame coordinates and
    // in screen coordinates. Deliberately off-centre, so it is not sitting
    // on the watermark that a black frame would also be black behind.
    const inFrame = {
      x: Math.round(physical.width * 0.42),
      y: Math.round(physical.height * 0.34),
    };
    const parked = {
      x: Math.round(win.content.x * win.scale) + inFrame.x,
      y: Math.round(win.content.y * win.scale) + inFrame.y,
    };
    // Far away, and still on the desktop: the "cursor is not here" frame.
    const away = { x: 4, y: 4 };
    const crop = {
      x: Math.max(0, inFrame.x - 10),
      y: Math.max(0, inFrame.y - 10),
      width: CROP,
      height: CROP,
    };
    report.pointer = { parked, away, inFrame, crop };

    ptr = new PhysicalPointer(log).open();
    await ptr.waitUntilReady();

    const reference = await page.screenshot();
    fs.writeFileSync(path.join(WORK, "page-reference.png"), reference);

    const candidates = [
      {
        id: "obs-window-wgc",
        description:
          "OBS window capture, Windows Graphics Capture -- the backend the " +
          "recorder ships with",
        grab: async (session) => session.grabSourceFrame(),
        obs: { needCursorVisible: false },
      },
      {
        id: "obs-window-bitblt",
        description:
          "OBS window capture, BitBlt -- the only OBS method whose cursor " +
          "setting does anything",
        grab: async (session) => session.grabSourceFrame(),
        obs: { needCursorVisible: true },
      },
      {
        id: "ffmpeg-gdigrab-desktop",
        description:
          "ffmpeg gdigrab over the desktop rectangle the window occupies, " +
          "with -draw_mouse 1",
        grab: null,
      },
    ];

    for (const candidate of candidates) {
      const entry = {
        id: candidate.id,
        description: candidate.description,
        windowCorrelation: null,
        cursorChangedFraction: null,
        windowPresent: null,
        cursorPresent: null,
        error: null,
      };
      let session = null;
      try {
        let parkedFrame;
        let awayFrame;
        if (candidate.grab) {
          session = new ObsCaptureSession({
            tag: "cursor-backend-" + candidate.id,
            port: 44695 + candidates.indexOf(candidate),
            launchEnabled: true,
            mayEnableWebsocketConfig: true,
          });
          session.prepareHost();
          await session.launch();
          await session.configure({
            outDir: WORK,
            width: physical.width,
            height: physical.height,
            needCursorVisible: candidate.obs.needCursorVisible,
            windowMatch: (c) => {
              const name = String(c.name || "").toLowerCase();
              return (
                name.includes("[code.exe]") &&
                name.includes("[extension development host]")
              );
            },
          });
          ptr.moveTo(parked.x, parked.y);
          await sleep(900);
          parkedFrame = await candidate.grab(session);
          ptr.moveTo(away.x, away.y);
          await sleep(900);
          awayFrame = await candidate.grab(session);
        } else {
          const rect = {
            x: Math.round(win.content.x * win.scale),
            y: Math.round(win.content.y * win.scale),
            width: physical.width,
            height: physical.height,
          };
          ptr.moveTo(parked.x, parked.y);
          await sleep(900);
          parkedFrame = gdigrabFrame(rect, path.join(WORK, candidate.id + "-parked.png"));
          ptr.moveTo(away.x, away.y);
          await sleep(900);
          awayFrame = gdigrabFrame(rect, path.join(WORK, candidate.id + "-away.png"));
        }

        fs.writeFileSync(path.join(WORK, candidate.id + "-parked.png"), parkedFrame);
        fs.writeFileSync(path.join(WORK, candidate.id + "-away.png"), awayFrame);

        entry.windowCorrelation = Number(
          comparePngs(parkedFrame, reference, 32).correlation.toFixed(4)
        );
        entry.cursorChangedFraction = Number(
          changedFractionInCrop(parkedFrame, awayFrame, crop).toFixed(5)
        );
        entry.windowPresent =
          entry.windowCorrelation >= WINDOW_PRESENT_MIN_CORRELATION;
        entry.cursorPresent =
          entry.cursorChangedFraction >= CURSOR_PRESENT_MIN_CHANGED;
      } catch (err) {
        entry.error = String((err && err.message) || err);
      } finally {
        if (session) {
          try {
            await session.cleanup();
          } catch (err) {
            /* recorded below by the absence of a result, not worth masking */
          }
          // OBS needs a beat to actually exit before the next candidate
          // launches its own; without it the second run meets a half-shut
          // instance and reports "OBS is not ready", which reads like a
          // backend failure and is not one.
          await sleep(3000);
        }
      }
      report.backends.push(entry);
      log(
        candidate.id +
          ": window=" +
          entry.windowPresent +
          " (" + entry.windowCorrelation + ")" +
          " cursor=" +
          entry.cursorPresent +
          " (" + entry.cursorChangedFraction + ")" +
          (entry.error ? " error=" + entry.error : "")
      );
    }

    const usable = report.backends.filter((b) => b.windowPresent && b.cursorPresent);
    report.usableBackends = usable.map((b) => b.id);
    if (usable.length) {
      report.verdict = "MEASURED";
      report.reason =
        "of " +
        report.backends.length +
        " candidates, " +
        usable.length +
        " put both the workbench and the cursor in one frame: " +
        usable.map((b) => b.id).join(", ");
    } else {
      report.verdict = "MEASURED";
      report.reason =
        "no candidate put both the workbench and the cursor in one frame";
    }
  } finally {
    if (ptr) ptr.close();
    if (app) {
      try {
        await app.close();
      } catch (err) {
        /* the measurement is written either way */
      }
    }
    for (const dir of [userDataDir, extensionsDir, state.root]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        /* tmpdirs */
      }
    }
    try {
      fs.rmSync(path.dirname(workspacePath), { recursive: true, force: true });
    } catch (err) {
      /* same */
    }
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
  log(report.verdict + ": " + report.reason);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[cursor-backends] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { changedFractionInCrop, gdigrabFrame };
