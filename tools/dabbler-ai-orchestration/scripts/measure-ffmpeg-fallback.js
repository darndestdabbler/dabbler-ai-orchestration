#!/usr/bin/env node
// The ffmpeg `gdigrab` fallback, measured against the same fixed criteria
// (Set 113 Session 4).
//
//   node scripts/measure-ffmpeg-fallback.js
//
// A PROBE, NOT A SECOND BACKEND. The spec names ffmpeg `gdigrab` as the
// fallback capture candidate, and verification was right that leaving it
// unmeasured left the session's central question half-answered: C7 is a
// capture criterion, OBS's verdict is FAIL on it, and `-an` is the one
// thing likely to satisfy the clause OBS structurally cannot.
//
// What it deliberately does NOT do is build a second recorder. Wiring
// gdigrab into the walkthrough driver -- process lifecycle, window
// targeting, the step-event stream, the manifest -- is the expansion the
// spec's Session 4 budget forbids in the same breath as it names the
// fallback. So this drives the SAME fixture window through the SAME
// instruments and answers the only question that matters: could gdigrab
// meet the criteria OBS could not, and does it meet the ones OBS did?
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { _electron } = require("@playwright/test");

const { makeUatWorkspace } = require("./make-uat-workspace.js");
const {
  findCodeBinary,
  electronEnv,
  makeLaunchStateDirs,
} = require("./vscode-launch.js");
const { decodePng, comparePngs, colorFraction, grayscaleGrid, correlate } =
  require("./png-metrics.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const CRITERIA_PATH = path.join(SET_DIR, "s4-pilot-criteria.json");
const OUT_PATH = path.join(SET_DIR, "s4-ffmpeg-fallback-measurement.json");
const WORK_DIR = path.join(EXTENSION_ROOT, ".walkthrough-runs", "ffmpeg-fallback");

const MAGENTA = [255, 0, 255];
const MAGENTA_TOLERANCE = 24;
const CAPTURE_SECONDS = 8;

function log(msg) {
  console.log("[ffmpeg-fallback] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function which(exe) {
  try {
    const out = cp.execSync("where " + exe, { encoding: "utf8" });
    return out.split(/\r?\n/).filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

/** MP4/MKV track handler types, so "no audio track" is checked. */
function containerTracks(file) {
  const probe = cp.spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=nw=1:nk=1",
      file,
    ],
    { encoding: "utf8" }
  );
  if (probe.status !== 0) return { error: probe.stderr || "ffprobe failed" };
  return {
    streams: probe.stdout.split(/\r?\n/).filter(Boolean),
  };
}

/**
 * One gdigrab capture of a titled window, plus a single PNG frame of the
 * same capture for the pixel instruments.
 */
function captureWindow(title, outFile, seconds) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "gdigrab",
    "-framerate",
    "30",
    "-draw_mouse",
    "1",
    "-i",
    "title=" + title,
    "-t",
    String(seconds),
    // No audio input is offered at all, which is the point: gdigrab is a
    // video device, so the container carries no audio track without any
    // `-an` needed.
    "-y",
    outFile,
  ];
  const started = Date.now();
  const proc = cp.spawnSync("ffmpeg", args, { encoding: "utf8" });
  return {
    argv: "ffmpeg " + args.join(" "),
    status: proc.status,
    stderr: (proc.stderr || "").slice(-2000),
    elapsedMs: Date.now() - started,
    bytes: fs.existsSync(outFile) ? fs.statSync(outFile).size : 0,
  };
}

/** A single PNG frame from gdigrab, for the same instruments OBS faced. */
function grabFrame(title, pngFile) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "gdigrab",
    "-framerate",
    "30",
    "-draw_mouse",
    "0",
    "-i",
    "title=" + title,
    "-frames:v",
    "1",
    "-y",
    pngFile,
  ];
  const proc = cp.spawnSync("ffmpeg", args, { encoding: "utf8" });
  return {
    ok: proc.status === 0 && fs.existsSync(pngFile),
    status: proc.status,
    stderr: (proc.stderr || "").slice(-1200),
  };
}

const OCCLUDER_HTML =
  "data:text/html," +
  encodeURIComponent(
    "<html><body style='margin:0;background:#ff00ff'>" +
      "<div style='height:60px;background:#202020'></div>" +
      "<div style='margin:40px;height:120px;background:#101010'></div>" +
      "<div style='margin:40px;height:200px;background:#303030'></div>" +
      "</body></html>"
  );

async function main() {
  if (process.platform !== "win32") {
    log("gdigrab is Windows-only; refusing to pretend on " + process.platform);
    process.exitCode = 2;
    return;
  }
  const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
  const ffmpegPath = which("ffmpeg");
  if (!ffmpegPath) {
    log("ffmpeg is not on PATH; nothing to measure");
    process.exitCode = 2;
    return;
  }
  const version = cp
    .execSync("ffmpeg -hide_banner -version", { encoding: "utf8" })
    .split(/\r?\n/)[0];
  log(version);

  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const measurement = {
    measurement: "ffmpeg gdigrab, the spec's fallback capture candidate",
    why:
      "Verification rejected closing this by documentation: C7 is a capture " +
      "criterion, OBS's verdict is FAIL on it, and gdigrab offers no audio " +
      "device at all. Measured against the SAME committed criteria.",
    criteriaFile: path.basename(CRITERIA_PATH),
    ffmpeg: { path: ffmpegPath, version },
    platform: process.platform + " " + os.release(),
    startedAt: new Date().toISOString(),
  };

  let workspacePath = null;
  let launched = null;
  let occluder = null;

  try {
    workspacePath = makeUatWorkspace();
    const code = findCodeBinary();
    const state = makeLaunchStateDirs();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ff-ud-"));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ff-ext-"));

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

    const icon = page.locator(
      '.activitybar .action-label[aria-label*="AI Work Explorer"]'
    );
    await icon.waitFor({ state: "visible", timeout: 60000 });
    await icon.click();
    await page.waitForTimeout(1500);

    const win = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const content = w.getContentBounds();
      const display = screen.getDisplayMatching(w.getBounds());
      return { content, scaleFactor: display.scaleFactor, title: w.getTitle() };
    });
    measurement.window = {
      title: win.title,
      logical: win.content,
      scaleFactor: win.scaleFactor,
      physical: {
        width: Math.round(win.content.width * win.scaleFactor),
        height: Math.round(win.content.height * win.scaleFactor),
      },
    };
    log("target window title: " + win.title);

    // ---- C1 / C3: does gdigrab capture the intended window, at its size?
    const framePath = path.join(WORK_DIR, "frame-clean.png");
    const frame = grabFrame(win.title, framePath);
    measurement.frameGrab = frame;
    if (frame.ok) {
      const pageShot = await page.screenshot();
      const cmp = comparePngs(fs.readFileSync(framePath), pageShot, 32);
      measurement.c1 = {
        correlationWithTarget: Number(cmp.correlation.toFixed(4)),
        threshold: criteria.criteria.C1.minCorrelation,
        frameSize: cmp.a,
      };
      measurement.c3 = {
        frameSize: cmp.a,
        windowPhysical: measurement.window.physical,
        dimensionDeltaPx: Math.max(
          Math.abs(cmp.a.width - measurement.window.physical.width),
          Math.abs(cmp.a.height - measurement.window.physical.height)
        ),
        threshold: criteria.criteria.C3.maxDimensionDeltaPx,
      };
      log(
        "  C1 correlation=" + measurement.c1.correlationWithTarget +
          "  C3 dimDelta=" + measurement.c3.dimensionDeltaPx +
          " (" + cmp.a.width + "x" + cmp.a.height + ")"
      );
    }

    // ---- C2: the occlusion test that made OBS the primary candidate.
    const { chromium } = require("@playwright/test");
    const browser = await chromium.launch({
      headless: false,
      args: [
        "--window-position=" +
          Math.round(win.content.x + 40) +
          "," +
          Math.round(win.content.y + 40),
        "--window-size=" +
          Math.round(win.content.width * 0.6) +
          "," +
          Math.round(win.content.height * 0.6),
        "--disable-infobars",
      ],
    });
    occluder = browser;
    const opage = await browser.newPage();
    await opage.goto(OCCLUDER_HTML);
    await opage.bringToFront();
    await sleep(2000);

    const occludedPath = path.join(WORK_DIR, "frame-occluded.png");
    const occludedGrab = grabFrame(win.title, occludedPath);
    measurement.occludedGrab = occludedGrab;
    if (occludedGrab.ok) {
      const decoded = decodePng(fs.readFileSync(occludedPath));
      const magenta = colorFraction(decoded, MAGENTA, MAGENTA_TOLERANCE);
      let correlationUnderOcclusion = null;
      if (frame.ok) {
        correlationUnderOcclusion = Number(
          correlate(
            grayscaleGrid(decodePng(fs.readFileSync(framePath)), 32),
            grayscaleGrid(decoded, 32)
          ).toFixed(4)
        );
      }
      measurement.c2 = {
        magentaFractionUnderOcclusion: Number(magenta.toFixed(6)),
        threshold: criteria.criteria.C2.maxMagentaFractionInTarget,
        correlationUnderOcclusion,
      };
      log(
        "  C2 magenta=" + measurement.c2.magentaFractionUnderOcclusion +
          "  correlationUnderOcclusion=" + correlationUnderOcclusion
      );
    }
    await browser.close();
    occluder = null;
    await sleep(1000);

    // ---- C7: the clause OBS structurally could not satisfy.
    const videoPath = path.join(WORK_DIR, "capture.mp4");
    const capture = captureWindow(win.title, videoPath, CAPTURE_SECONDS);
    measurement.capture = capture;
    if (capture.bytes > 0) {
      const tracks = containerTracks(videoPath);
      measurement.c7 = {
        streams: tracks.streams || null,
        error: tracks.error || null,
        audioTracks: (tracks.streams || []).filter((s) => s === "audio").length,
        videoTracks: (tracks.streams || []).filter((s) => s === "video").length,
      };
      log(
        "  C7 streams=" + JSON.stringify(measurement.c7.streams) +
          " audioTracks=" + measurement.c7.audioTracks
      );
    }
  } catch (err) {
    measurement.failure = String((err && err.stack) || err);
    log("failed: " + measurement.failure);
  } finally {
    if (occluder) await occluder.close().catch(() => {});
    if (launched) {
      try {
        await launched.app.close();
      } catch {
        /* already gone */
      }
      for (const dir of [
        launched.userDataDir,
        launched.extensionsDir,
        launched.stateRoot,
      ]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        } catch {
          /* tmpdirs */
        }
      }
    }
    if (workspacePath) {
      try {
        fs.rmSync(path.dirname(workspacePath), { recursive: true, force: true });
      } catch {
        /* same */
      }
    }
  }

  measurement.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT_PATH, JSON.stringify(measurement, null, 2) + "\n", "utf8");
  log("wrote " + OUT_PATH);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[ffmpeg-fallback] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { containerTracks, OCCLUDER_HTML, CAPTURE_SECONDS };
