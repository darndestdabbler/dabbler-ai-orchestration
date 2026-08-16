#!/usr/bin/env node
// The Set 113 Session 4 Windows OS-capture pilot harness.
//
//   npm run pilot:os-capture
//
// THE MEASUREMENT IS THE DELIVERABLE. This session ends in a number either
// way: a documented failure is a successful session, and only a pass ships
// the recorder. So this harness is written to be able to FAIL -- every
// claim has an instrument, and every instrument that could return a
// flattering answer for the wrong reason has a control that must come out
// the other way.
//
// It reads its pass criteria from `s4-pilot-criteria.json`, refuses to run
// without them, and stamps that file's SHA-256 into its own output. That is
// what makes "criteria were fixed before the first capture" checkable by
// someone who was not here, rather than something this file asserts about
// itself.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { chromium } = require("@playwright/test");

const { recordVscodeWalkthrough } = require("./record-vscode-walkthrough.js");
const { evaluate } = require("./os-capture-verdict.js");
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
const MEASUREMENT_PATH = path.join(SET_DIR, "s4-os-capture-measurement.json");
const RUN_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs", "pilot");

const MAGENTA = [255, 0, 255];
const MAGENTA_TOLERANCE = 24;

function log(msg) {
  console.log("[pilot] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A window filled with magenta and some structure, used three ways: as the
 * thing that occludes the target (C2), as proof the magenta detector fires
 * at all (C2's control), and as the decoy the correlation instrument must
 * NOT mistake for the workbench (C1's control).
 *
 * The structure matters. A flat fill would exercise the zero-variance
 * branch of the correlation, which is not the same as showing the
 * instrument can tell two real windows apart.
 */
const OCCLUDER_HTML =
  "data:text/html," +
  encodeURIComponent(
    "<html><body style='margin:0;background:#ff00ff'>" +
      "<div style='height:60px;background:#202020'></div>" +
      "<div style='margin:40px;height:120px;background:#101010'></div>" +
      "<div style='margin:40px;height:200px;background:#303030'></div>" +
      "</body></html>"
  );

async function openOccluder(bounds) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--window-position=" + Math.round(bounds.x + 40) + "," + Math.round(bounds.y + 40),
      "--window-size=" + Math.round(bounds.width * 0.6) + "," + Math.round(bounds.height * 0.6),
      "--disable-infobars",
    ],
  });
  const page = await browser.newPage();
  await page.goto(OCCLUDER_HTML);
  await page.bringToFront();
  await sleep(1500);
  return { browser, page };
}

function sha256(file) {
  return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** MP4 track handler types, so "no audio track" is checked, not assumed. */
function mp4Tracks(file) {
  const data = fs.readFileSync(file);
  const handlers = [];
  let durationSeconds = null;

  function* boxes(start, end) {
    let i = start;
    while (i + 8 <= end) {
      let size = data.readUInt32BE(i);
      const type = data.toString("latin1", i + 4, i + 8);
      let body = i + 8;
      if (size === 1) {
        size = Number(data.readBigUInt64BE(i + 8));
        body = i + 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size <= 0) return;
      yield { type, body, stop: i + size };
      i += size;
    }
  }

  for (const top of boxes(0, data.length)) {
    if (top.type !== "moov") continue;
    for (const b of boxes(top.body, top.stop)) {
      if (b.type === "mvhd") {
        const version = data[b.body];
        if (version === 0) {
          const scale = data.readUInt32BE(b.body + 12);
          const dur = data.readUInt32BE(b.body + 16);
          if (scale) durationSeconds = dur / scale;
        } else {
          const scale = data.readUInt32BE(b.body + 20);
          const dur = Number(data.readBigUInt64BE(b.body + 24));
          if (scale) durationSeconds = dur / scale;
        }
      }
      if (b.type !== "trak") continue;
      for (const m of boxes(b.body, b.stop)) {
        if (m.type !== "mdia") continue;
        for (const h of boxes(m.body, m.stop)) {
          if (h.type === "hdlr") {
            handlers.push(data.toString("latin1", h.body + 8, h.body + 12));
          }
        }
      }
    }
  }
  return { handlers, durationSeconds };
}

/** Parse the WebVTT the run produced into cue windows in milliseconds. */
function parseVtt(file) {
  const text = fs.readFileSync(file, "utf8");
  const cues = [];
  const re = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start =
      (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]);
    const end =
      (Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7])) * 1000 + Number(m[8]);
    cues.push({ start, end });
  }
  return cues;
}

function readEvents(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// -------------------------------------------------------------- one pilot run

/**
 * One clean run: drive the scenario, record it, and measure C1, C2, C3 and
 * C7 from inside the run while the window is actually on screen.
 */
async function pilotRun(index, criteria, options) {
  const opts = options || {};
  const outDir = path.join(RUN_ROOT, "run-" + String(index).padStart(2, "0"));
  const observations = {
    index,
    correlationWithTarget: null,
    frameSize: null,
    windowPhysical: null,
    dimensionDeltaPx: null,
    scaleFactor: null,
    magentaFractionUnderOcclusion: null,
    correlationUnderOcclusion: null,
    sceneItemCount: null,
    inputKinds: [],
    specialInputs: null,
    decoyCorrelation: null,
    magentaFractionInDecoyCapture: null,
    occluder: null,
    errors: [],
  };

  const result = await recordVscodeWalkthrough({
    out: outDir,
    keep: true,
    windowSize: opts.windowSize,
    obsPort: 44667 + (index % 7),
    afterStart: async ({ capture, page, result: runResult }) => {
      if (!capture) {
        observations.errors.push(
          "no capture session: OS capture was unavailable for this run"
        );
        return;
      }
      try {
        // C1 + C3: OBS's own frame against a Playwright screenshot of the
        // same window, taken as close together as two processes allow.
        const obsFrame = await capture.grabSourceFrame();
        const pageShot = await page.screenshot();
        const cmp = comparePngs(obsFrame, pageShot, 32);
        observations.correlationWithTarget = Number(cmp.correlation.toFixed(4));
        observations.frameSize = cmp.a;
        observations.windowPhysical = runResult.window.physical;
        observations.scaleFactor = runResult.window.scaleFactor;
        observations.dimensionDeltaPx = Math.max(
          Math.abs(cmp.a.width - runResult.window.physical.width),
          Math.abs(cmp.a.height - runResult.window.physical.height)
        );

        // C7: what the scene actually contains, read back from OBS rather
        // than assumed from what we asked it to create.
        const items = await capture.client.request("GetSceneItemList", {
          sceneName: capture.sceneName,
        });
        observations.sceneItemCount = items.sceneItems.length;
        const inputs = await capture.client.request("GetInputList", {});
        observations.inputKinds = inputs.inputs.map((i) => i.inputKind);
        observations.specialInputs = await capture.client.request(
          "GetSpecialInputs",
          {}
        );

        // C2: raise an unrelated window over the target and check the frame
        // for its pixels. WGC is supposed to be immune to this; that is the
        // claim under test, not an assumption.
        const occluder = await openOccluder(runResult.window.logical);
        try {
          // IS THE OCCLUDER ACTUALLY OCCLUDING? Without this, C2 has a
          // false pass hiding in it: "no magenta in the target frame" is
          // equally consistent with a capture that correctly ignores an
          // overlapping window and with an occluder that opened somewhere
          // else entirely. The magenta detector control proves the detector
          // works; this proves there was something for it to find.
          //
          // Reported as geometry rather than as a boolean, so a partial
          // overlap is visible as a partial overlap.
          const geom = await occluder.page.evaluate(() => ({
            x: window.screenX,
            y: window.screenY,
            width: window.outerWidth,
            height: window.outerHeight,
            focused: document.hasFocus(),
            visibility: document.visibilityState,
          }));
          const target = runResult.window.logical;
          const overlapWidth = Math.max(
            0,
            Math.min(geom.x + geom.width, target.x + target.width) -
              Math.max(geom.x, target.x)
          );
          const overlapHeight = Math.max(
            0,
            Math.min(geom.y + geom.height, target.y + target.height) -
              Math.max(geom.y, target.y)
          );
          observations.occluder = {
            geometry: geom,
            targetLogical: target,
            overlapFractionOfTarget: Number(
              (
                (overlapWidth * overlapHeight) /
                Math.max(1, target.width * target.height)
              ).toFixed(4)
            ),
            heldFocus: geom.focused,
          };

          const occludedFrame = await capture.grabSourceFrame();
          const decoded = decodePng(occludedFrame);
          observations.magentaFractionUnderOcclusion = Number(
            colorFraction(decoded, MAGENTA, MAGENTA_TOLERANCE).toFixed(6)
          );
          observations.correlationUnderOcclusion = Number(
            correlate(
              grayscaleGrid(decodePng(obsFrame), 32),
              grayscaleGrid(decoded, 32)
            ).toFixed(4)
          );

          // The controls, run once rather than on every pass: point the
          // SAME capture at the occluder and confirm the two instruments
          // come out the other way. Without this, a correlation of 0.99 and
          // a magenta fraction of 0 are equally consistent with a broken
          // detector as with a clean capture.
          if (opts.withControls) {
            const listed = await capture.client.request(
              "GetInputPropertiesListPropertyItems",
              { inputName: capture.inputName, propertyName: "window" }
            );
            const decoy = (listed.propertyItems || []).find((item) =>
              /chrome\.exe|msedge\.exe/i.test(String(item.itemName))
            );
            if (!decoy) {
              observations.errors.push("no chromium window offered as a decoy");
            } else {
              await capture.client.request("SetInputSettings", {
                inputName: capture.inputName,
                inputSettings: { window: decoy.itemValue },
                overlay: true,
              });
              await sleep(2500);
              const decoyFrame = await capture.grabSourceFrame();
              const decoyDecoded = decodePng(decoyFrame);
              observations.decoyCorrelation = Number(
                correlate(
                  grayscaleGrid(decodePng(pageShot), 32),
                  grayscaleGrid(decoyDecoded, 32)
                ).toFixed(4)
              );
              observations.magentaFractionInDecoyCapture = Number(
                colorFraction(decoyDecoded, MAGENTA, MAGENTA_TOLERANCE).toFixed(6)
              );
              // Put the capture back so the rest of the recording is the
              // walkthrough it claims to be.
              const back = await capture.client.request(
                "GetInputPropertiesListPropertyItems",
                { inputName: capture.inputName, propertyName: "window" }
              );
              const target = (back.propertyItems || []).find((item) =>
                String(item.itemName)
                  .toLowerCase()
                  .includes("[extension development host]")
              );
              if (target) {
                await capture.client.request("SetInputSettings", {
                  inputName: capture.inputName,
                  inputSettings: { window: target.itemValue },
                  overlay: true,
                });
                await sleep(2000);
              }
            }
          }
        } finally {
          await occluder.browser.close().catch(() => {});
          await sleep(800);
        }
      } catch (err) {
        observations.errors.push(String((err && err.message) || err));
      }
    },
  });

  // C4 and C7's container check, from the artifacts the run left behind.
  const timing = { cues: null, steps: null, allCuesInsideRecording: null };
  let container = null;
  if (result.usable) {
    const eventsPath = path.join(outDir, "events.jsonl");
    const captionsPath = path.join(outDir, "captions.vtt");
    const videoPath = path.join(outDir, "recording.mp4");
    if (fs.existsSync(eventsPath) && fs.existsSync(captionsPath)) {
      const events = readEvents(eventsPath);
      const cues = parseVtt(captionsPath);
      timing.cues = cues.length;
      timing.steps = events.filter((e) => e.event === "started").length;
      if (fs.existsSync(videoPath)) {
        container = mp4Tracks(videoPath);
        const durationMs = (container.durationSeconds || 0) * 1000;
        timing.recordingDurationMs = Math.round(durationMs);
        timing.allCuesInsideRecording = cues.every(
          (c) => c.start >= 0 && c.end <= durationMs + 1
        );
        timing.lastCueEndMs = cues.length ? cues[cues.length - 1].end : null;
      }
    }
  }

  return {
    observations,
    timing,
    container,
    // The controls repoint the live capture at the decoy part way through,
    // so this run's VIDEO is not a recording of the walkthrough even though
    // its measurements are sound. Flagged here so the verdict can exclude
    // it in code rather than a reader having to remember.
    videoContaminatedByControls: opts.withControls === true,
    anchor: result.anchor,
    stepsCompleted: result.stepsCompleted,
    stepCount: result.stepCount,
    usable: result.usable,
    failure: result.failure,
    cleanupProblems: result.cleanupProblems,
    obs: result.obs,
    videoBytes:
      result.recording && result.recording.outputPath &&
      fs.existsSync(result.recording.outputPath)
        ? fs.statSync(result.recording.outputPath).size
        : 0,
  };
}

// ------------------------------------------------------------------ C5 and C6

/**
 * The three ways the dependency can be missing, each INDUCED and run for
 * real rather than asserted.
 *
 * The bar C5 sets is deliberately two-sided: the failure must name OBS, AND
 * the walkthrough must still finish and write a manifest carrying no video.
 * A recorder that reports the missing dependency beautifully and then
 * produces nothing has failed the more important half.
 */
async function dependencyAbsentVariants() {
  const cases = [
    {
      name: "websocket-unreachable",
      opts: { obsLaunch: false, obsPort: 45999 },
    },
    {
      name: "websocket-auth-rejected",
      opts: { obsConnectPassword: "definitely-not-the-websocket-password" },
    },
    {
      name: "obs-executable-absent",
      opts: { obsExe: path.join(os.tmpdir(), "no-such-obs-here", "obs64.exe") },
    },
  ];

  const variants = [];
  for (const c of cases) {
    log("  variant " + c.name);
    const outDir = path.join(RUN_ROOT, "absent-" + c.name);
    const result = await recordVscodeWalkthrough(
      Object.assign({ out: outDir, keep: true }, c.opts)
    );
    const manifestPath = path.join(outDir, "manifest.json");
    let osVideoArtifacts = null;
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      osVideoArtifacts = (manifest.artifacts || []).filter(
        (a) => a.kind === "os-video"
      ).length;
    }
    const message = String(
      result.obsUnavailableMessage || result.failure || ""
    );
    variants.push({
      variant: c.name,
      kind: result.obsUnavailableKind || null,
      message: message.slice(0, 400),
      mentionsObs: /obs/i.test(message),
      walkthroughStillCompleted: result.usable,
      manifestWritten: fs.existsSync(manifestPath),
      osVideoArtifacts,
      stepsCompleted: result.stepsCompleted,
      cleanupProblems: result.cleanupProblems,
    });
    log(
      "    kind=" + result.obsUnavailableKind +
        " completed=" + result.usable +
        " osVideoArtifacts=" + osVideoArtifacts
    );
  }
  return variants;
}

// ---------------------------------------------------------------------- main

async function main() {
  // Re-derive the verdict from a measurement already on disk, without
  // recapturing anything. Useful when the criteria are re-read later, and
  // it is what makes the verdict auditable: anyone can recompute it from
  // the committed numbers and the committed thresholds.
  if (process.argv.includes("--evaluate-only")) {
    const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
    const measurement = JSON.parse(fs.readFileSync(MEASUREMENT_PATH, "utf8"));
    measurement.criteriaSha256 = sha256(CRITERIA_PATH);
    measurement.evaluation = evaluate(measurement, criteria);
    fs.writeFileSync(
      MEASUREMENT_PATH,
      JSON.stringify(measurement, null, 2) + "\n",
      "utf8"
    );
    log(
      "VERDICT " +
        measurement.evaluation.verdict +
        " (" +
        measurement.evaluation.cleanRuns +
        "/" +
        measurement.evaluation.runsRequired +
        " clean runs" +
        (measurement.evaluation.unmet.length
          ? "; unmet: " + measurement.evaluation.unmet.join(", ")
          : "") +
        ")"
    );
    for (const f of measurement.evaluation.criteria) {
      log("  " + f.id + " " + (f.passed ? "PASS" : "FAIL") + " - " + f.name);
    }
    return;
  }

  if (process.platform !== "win32") {
    log("this pilot measures Windows OS capture; refusing to pretend on " + process.platform);
    process.exitCode = 2;
    return;
  }

  // One more clean run, appended to an existing measurement. This exists
  // for exactly one reason: the control-carrying run's video is not a clean
  // capture, so the ten-capture bar needs a tenth uncontaminated recording
  // rather than a redefinition of "clean".
  const supplementaryFlag = process.argv.indexOf("--supplementary-run");
  if (supplementaryFlag !== -1) {
    const index = Number(process.argv[supplementaryFlag + 1] || 11);
    const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
    const measurement = JSON.parse(fs.readFileSync(MEASUREMENT_PATH, "utf8"));
    log("supplementary run " + index);
    const run = await pilotRun(index, criteria, {});
    measurement.supplementaryRuns = (measurement.supplementaryRuns || []).concat([run]);
    measurement.evaluation = evaluate(measurement, criteria);
    fs.writeFileSync(
      MEASUREMENT_PATH,
      JSON.stringify(measurement, null, 2) + "\n",
      "utf8"
    );
    log(
      "  correlation=" + run.observations.correlationWithTarget +
        " magenta=" + run.observations.magentaFractionUnderOcclusion +
        " occluderOverlap=" +
        (run.observations.occluder
          ? run.observations.occluder.overlapFractionOfTarget
          : "n/a") +
        " cleanup=" + JSON.stringify(run.cleanupProblems)
    );
    log(
      "VERDICT " + measurement.evaluation.verdict +
        " (" + measurement.evaluation.cleanRuns + "/" +
        measurement.evaluation.runsRequired + " clean runs)"
    );
    return;
  }
  if (!fs.existsSync(CRITERIA_PATH)) {
    log(
      "REFUSING to run: " + CRITERIA_PATH + " does not exist. The pass " +
        "criteria are fixed before the first capture, and a pilot that " +
        "invents them as it goes has measured nothing."
    );
    process.exitCode = 2;
    return;
  }
  const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
  const criteriaDigest = sha256(CRITERIA_PATH);
  log("criteria " + criteriaDigest);

  fs.rmSync(RUN_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RUN_ROOT, { recursive: true });

  const measurement = {
    measurement: "Windows OS capture of the AI Work Explorer, via OBS Studio",
    criteriaFile: path.basename(CRITERIA_PATH),
    criteriaSha256: criteriaDigest,
    platform: process.platform + " " + os.release(),
    node: process.version,
    startedAt: new Date().toISOString(),
    runs: [],
    dependencyAbsent: [],
    resizeVariant: null,
    inducedFailure: null,
  };

  const total = criteria.bar.runs;
  for (let i = 1; i <= total; i++) {
    log("run " + i + " of " + total);
    const run = await pilotRun(i, criteria, { withControls: i === 1 });
    measurement.runs.push(run);
    log(
      "  correlation=" + run.observations.correlationWithTarget +
        " magenta=" + run.observations.magentaFractionUnderOcclusion +
        " dimDelta=" + run.observations.dimensionDeltaPx +
        " anchorUncertainty=" + (run.anchor && run.anchor.uncertaintyMillis) +
        " cleanup=" + JSON.stringify(run.cleanupProblems)
    );
  }

  log("C3 window-resize variant");
  measurement.resizeVariant = await pilotRun(90, criteria, {
    windowSize: { width: 1024, height: 700 },
  });

  log("C5 dependency-absent variants");
  measurement.dependencyAbsent = await dependencyAbsentVariants();

  measurement.finishedAt = new Date().toISOString();
  // The verdict is DERIVED from the criteria file, not announced. Every
  // threshold it applies came off disk before the first capture.
  measurement.evaluation = evaluate(measurement, criteria);
  log(
    "VERDICT " +
      measurement.evaluation.verdict +
      " (" +
      measurement.evaluation.cleanRuns +
      "/" +
      measurement.evaluation.runsRequired +
      " clean runs" +
      (measurement.evaluation.unmet.length
        ? "; unmet: " + measurement.evaluation.unmet.join(", ")
        : "") +
      ")"
  );
  fs.writeFileSync(
    MEASUREMENT_PATH,
    JSON.stringify(measurement, null, 2) + "\n",
    "utf8"
  );
  log("wrote " + MEASUREMENT_PATH);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[pilot] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { mp4Tracks, parseVtt, readEvents, OCCLUDER_HTML };
