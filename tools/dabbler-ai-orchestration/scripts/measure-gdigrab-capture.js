#!/usr/bin/env node
// Measure the ffmpeg `gdigrab` backend against the Session 4 pilot's seven
// committed criteria (Set 113 Session 8, step 2).
//
// WHY THIS IS A SECOND HARNESS RATHER THAN A FLAG ON THE FIRST
//
// `measure-os-capture.js` is not backend-agnostic and should not be made so.
// Half of what it asserts is written in OBS's vocabulary and is not a
// property a capture backend has in general: scene collections, profiles,
// input kinds, websocket auth, `.sentinel` files, "how many obs64.exe
// processes are left". Generalising it would mean either weakening those
// assertions for OBS -- which is a verification reduction on a backend that
// still ships -- or filling this backend's report with N/A rows that read
// like passes. Both are worse than two harnesses that each say exactly what
// they measured.
//
// THE CRITERIA FILE IS THE SAME FILE. `s4-pilot-criteria.json` is read off
// disk, hashed, and its thresholds applied -- none of them is restated here.
// What IS restated, per criterion, is the TRANSLATION: what the criterion's
// instrument means when the backend has no scene graph. Every translation is
// recorded in the artifact next to its result, so a reader can disagree with
// the translation without having to reverse-engineer it from code.
//
// Output is ASCII-only (L-079-1).

"use strict";

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { recordVscodeWalkthrough } = require("./record-vscode-walkthrough.js");
const {
  GdigrabCaptureSession,
  CaptureIntegrityError,
  WINDOW_FOLLOW_POLICY,
} = require("./gdigrab-capture.js");
const { WindowGeometry } = require("./window-geometry.js");
const {
  openMagentaOccluder,
  MAGENTA,
  MAGENTA_TOLERANCE,
} = require("./magenta-occluder.js");
const {
  decodePng,
  colorFraction,
  comparePngs,
  correlate,
  grayscaleGrid,
} = require("./png-metrics.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const CRITERIA_PATH = path.join(SET_DIR, "s4-pilot-criteria.json");
const OUT_PATH = path.join(SET_DIR, "s8-gdigrab-capture-measurement.json");
const RUN_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs", "gdigrab-pilot");

// The matcher the SHIPPED recorder uses, reused verbatim. C1 is a claim
// about the selection the product performs, so measuring a different
// predicate would measure nothing.
const TARGET_MATCH = (candidate) => {
  const name = String(candidate.name || "").toLowerCase();
  return (
    name.includes("[code.exe]") &&
    name.includes("[extension development host]")
  );
};

function log(msg) {
  console.log("[gdigrab-pilot] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(file) {
  return (
    "sha256:" +
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  );
}

/** How many ffmpeg processes are running right now (C6). */
function ffmpegProcessCount() {
  try {
    const out = cp.execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH /FO CSV', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (out.match(/ffmpeg\.exe/gi) || []).length;
  } catch (err) {
    return -1;
  }
}

/** Driver scripts this backend writes to %TEMP%, which must not survive (C6). */
function strayTempScripts() {
  try {
    return fs
      .readdirSync(os.tmpdir())
      .filter((f) => /^dabbler-(geom|occluder)-\d+-\d+\.ps1$/.test(f));
  } catch (err) {
    return [];
  }
}

function parseVtt(file) {
  const text = fs.readFileSync(file, "utf8");
  const cues = [];
  const re =
    /(\d\d):(\d\d):(\d\d)\.(\d\d\d)\s+-->\s+(\d\d):(\d\d):(\d\d)\.(\d\d\d)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start =
      (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 +
      Number(m[4]);
    const end =
      (Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7])) * 1000 +
      Number(m[8]);
    cues.push({ start, end });
  }
  return cues;
}

function readEvents(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return {};
      }
    });
}

// --------------------------------------------------------------- one run

/**
 * One pilot run: a fresh fixture, a fresh window, a real walkthrough, and
 * every instrument read while the capture is live.
 */
async function pilotRun(index, opts) {
  const outDir = path.join(RUN_ROOT, "run-" + String(index).padStart(2, "0"));
  const observations = {
    correlationWithTarget: null,
    frameSize: null,
    windowPhysical: null,
    dimensionDeltaPx: null,
    scaleFactor: null,
    candidatesConsidered: null,
    chosenWindow: null,
    occlusion: null,
    decoy: null,
    windowMove: null,
    errors: [],
  };

  const ffmpegBefore = ffmpegProcessCount();

  const result = await recordVscodeWalkthrough({
    out: outDir,
    keep: true,
    backend: "gdigrab",
    windowSize: opts.windowSize,
    induceFailureAt: opts.induceFailureAt,
    onInduce: opts.onInduce,
    // C5 runs these through the REAL recorder path, so a missing dependency
    // is measured by what the walkthrough actually produced.
    ffmpegExe: opts.ffmpegExe,
    ffprobeExe: opts.ffprobeExe,
    afterStart: async ({ capture, page, result: runResult }) => {
      if (!capture) {
        observations.errors.push(
          "no capture session: gdigrab capture was unavailable for this run"
        );
        return;
      }
      try {
        // C1 + C3, read at the same instant two processes allow: the
        // backend's own frame against a Playwright screenshot of the window
        // it claims to be capturing.
        const frame = await capture.grabSourceFrame();
        const pageShot = await page.screenshot();
        const cmp = comparePngs(frame, pageShot, 32);
        observations.correlationWithTarget = Number(cmp.correlation.toFixed(4));
        observations.frameSize = cmp.a;
        observations.windowPhysical = runResult.window.physical;
        observations.scaleFactor = runResult.window.scaleFactor;
        observations.dimensionDeltaPx = Math.max(
          Math.abs(cmp.a.width - runResult.window.physical.width),
          Math.abs(cmp.a.height - runResult.window.physical.height)
        );
        observations.chosenWindow = capture.target && capture.target.name;

        if (!opts.withControls) return;

        // ------------------------------------------------ C2, in full
        //
        // Four measurements, and the ORDER is the argument:
        //   1. the clean frame contains no magenta   (the instrument is not
        //      already firing);
        //   2. with the guard OFF, an overlapping window LANDS IN THE FRAME
        //      (the weakness is real and this backend is not immune);
        //   3. pointing the capture at the occluder scores above the
        //      detector-control bar (the detector fires when magenta is
        //      genuinely there);
        //   4. with the guard ON, no such recording can be produced at all --
        //      it refuses before starting and aborts mid-capture.
        //
        // (2) is what makes (4) meaningful. A guard measured only by "no
        // magenta leaked" is indistinguishable from a backend that never had
        // the problem, which is exactly the false pass L-112-1 describes.
        const rect = capture.rect;
        const cleanMagenta = colorFraction(
          decodePng(frame),
          MAGENTA,
          MAGENTA_TOLERANCE
        );
        const occRect = {
          x: rect.x + Math.round(rect.width * 0.2),
          y: rect.y + Math.round(rect.height * 0.2),
          width: Math.round(rect.width * 0.6),
          height: Math.round(rect.height * 0.6),
        };
        const occluder = await openMagentaOccluder(occRect, log);
        let unguardedLeak = null;
        let detectorControl = null;
        let decoyCorrelation = null;
        let guardRefused = null;
        try {
          // (2) The same live capture, read while the occluder is up. The
          // shipped session has its guard on, so this frame is taken through
          // a deliberately unguarded session pointed at the SAME rectangle.
          const unguarded = new GdigrabCaptureSession({
            tag: "unguarded",
            outDir,
            occlusionGuard: false,
            windowFollowGuard: false,
          });
          unguarded.prepareHost();
          unguarded.outDir = outDir;
          unguarded.rect = { ...rect };
          unguarded.captureRect = { ...capture.captureRect };
          const occludedFrame = await unguarded.grabSourceFrame();
          fs.writeFileSync(
            path.join(outDir, "c2-unguarded-occluded.png"),
            occludedFrame
          );
          unguardedLeak = colorFraction(
            decodePng(occludedFrame),
            MAGENTA,
            MAGENTA_TOLERANCE
          );

          // (3) The detector control, and C1's decoy control from the same
          // frame: point the capture at the occluder itself.
          const control = new GdigrabCaptureSession({
            tag: "control",
            outDir,
            occlusionGuard: false,
            windowFollowGuard: false,
          });
          control.prepareHost();
          control.outDir = outDir;
          control.rect = { ...occRect };
          control.captureRect = { ...occRect };
          const controlFrame = await control.grabSourceFrame();
          fs.writeFileSync(path.join(outDir, "c2-control.png"), controlFrame);
          detectorControl = colorFraction(
            decodePng(controlFrame),
            MAGENTA,
            MAGENTA_TOLERANCE
          );
          decoyCorrelation = correlate(
            grayscaleGrid(decodePng(controlFrame), 32),
            grayscaleGrid(decodePng(pageShot), 32)
          );

          // (4a) The mitigation, before the fact.
          const guarded = new GdigrabCaptureSession({ tag: "guarded", outDir });
          guarded.prepareHost();
          try {
            await guarded.configure({
              outDir,
              basename: "guarded",
              windowMatch: TARGET_MATCH,
            });
            guardRefused = { refused: false, kind: null, message: null };
          } catch (err) {
            guardRefused = {
              refused: err instanceof CaptureIntegrityError,
              kind: err && err.kind,
              message: String((err && err.message) || err).slice(0, 400),
            };
          }
          await guarded.cleanup();
        } finally {
          await occluder.close();
        }

        observations.occlusion = {
          cleanFrameMagentaFraction: Number(cleanMagenta.toFixed(6)),
          unguardedLeakFraction:
            unguardedLeak === null ? null : Number(unguardedLeak.toFixed(6)),
          detectorControlFraction:
            detectorControl === null ? null : Number(detectorControl.toFixed(6)),
          guardRefusedBeforeStart: guardRefused,
          occluderRect: occRect,
          targetRect: rect,
        };
        observations.decoy = {
          correlationWithTarget:
            decoyCorrelation === null ? null : Number(decoyCorrelation.toFixed(4)),
        };
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
        const probe = new GdigrabCaptureSession({ tag: "probe", outDir });
        const probed = probe.probe(videoPath);
        container = {
          durationMillis: probed.durationMillis,
          streams: (probed.streams || []).map((s) => ({
            codec_type: s.codec_type,
            codec_name: s.codec_name,
            width: s.width,
            height: s.height,
          })),
          // C7's no-audio clause, read back off the FILE rather than
          // inferred from the arguments it was asked for. This is the clause
          // OBS could not satisfy: it muxes a silent track regardless
          // (`s4-os-capture-measurement.json`, audioTracksPerRecording all 1).
          audioTrackCount: (probed.streams || []).filter(
            (s) => s.codec_type === "audio"
          ).length,
          videoTrackCount: (probed.streams || []).filter(
            (s) => s.codec_type === "video"
          ).length,
        };
        timing.recordingDurationMs = probed.durationMillis;
        timing.allCuesInsideRecording = cues.every(
          (c) => c.start >= 0 && c.end <= (probed.durationMillis || 0) + 1
        );
        timing.lastCueEndMs = cues.length ? cues[cues.length - 1].end : null;
      }
    }
  }

  return {
    index,
    outDir: path.relative(REPO_ROOT, outDir),
    observations,
    timing,
    container,
    anchor: result.anchor,
    stepsCompleted: result.stepsCompleted,
    stepCount: result.stepCount,
    usable: result.usable,
    captureBackend: result.captureBackend,
    // The controls raise a magenta window over the target while THIS run's
    // own recording is live, and the guard -- correctly -- aborts it. So the
    // control run's VIDEO is a truncated fragment even though its
    // measurements are sound, and C4 (captions inside the recording) cannot
    // be read from it. Session 4 hit the identical problem and excluded the
    // same way; the flag exists so the verdict can do it in CODE rather than
    // a reader having to remember.
    //
    // It is also EVIDENCE, not merely contamination: the shipped session's
    // guard aborted a real walkthrough recording the instant an unrelated
    // window covered the frame, which is the C2 mitigation working in situ
    // rather than in a probe built to show it.
    videoContaminatedByControls: opts.withControls === true,
    captureUnavailableKind: result.obsUnavailableKind || null,
    captureUnavailableMessage: result.obsUnavailableMessage || null,
    manifestWritten: fs.existsSync(path.join(outDir, "manifest.json")),
    videoArtifacts: fs.existsSync(path.join(outDir, "recording.mp4")) ? 1 : 0,
    cleanupProblems: result.cleanupProblems || [],
    // C6, measured rather than asserted: this backend's whole cleanup
    // surface is one child process and one PowerShell driver.
    ffmpegProcessesBefore: ffmpegBefore,
    ffmpegProcessesAfter: ffmpegProcessCount(),
    strayTempScriptsAfter: strayTempScripts(),
    zeroByteFiles: fs.existsSync(outDir)
      ? fs
          .readdirSync(outDir)
          .filter((f) => {
            const p = path.join(outDir, f);
            return fs.statSync(p).isFile() && fs.statSync(p).size === 0;
          })
      : [],
  };
}

// ------------------------------------------------------- window-follow

/**
 * The window-follow falsifier: move the window mid-capture and assert the
 * capture NOTICES.
 *
 * This is the half that makes `WINDOW_FOLLOW_POLICY` a claim rather than a
 * comment. A policy of "abort on move" that never aborts is identical, from
 * the artifact, to no policy at all.
 */
async function windowMoveFalsifier() {
  const { _electron } = require("@playwright/test");
  const { makeUatWorkspace } = require("./make-uat-workspace.js");
  const {
    findCodeBinary,
    electronEnv,
    makeLaunchStateDirs,
  } = require("./vscode-launch.js");

  const outDir = path.join(RUN_ROOT, "window-move");
  fs.mkdirSync(outDir, { recursive: true });
  const workspacePath = makeUatWorkspace();
  const state = makeLaunchStateDirs();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdmv-ud-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdmv-ext-"));
  let app = null;
  const session = new GdigrabCaptureSession({
    tag: "window-move",
    outDir,
    guardIntervalMs: 300,
  });
  const report = {
    policy: WINDOW_FOLLOW_POLICY,
    moved: false,
    aborted: false,
    abortKind: null,
    millisIntoRecording: null,
    control: null,
  };

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
      timeout: 90000,
    });
    const page = await app.firstWindow({ timeout: 90000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 90000 });
    await page.waitForTimeout(1500);

    session.prepareHost();
    await session.configure({
      outDir,
      basename: "window-move",
      windowMatch: TARGET_MATCH,
    });
    await session.startRecording();

    // THE CONTROL, first and in the same run: hold still for longer than the
    // guard interval and confirm it does NOT abort. Without it, "it aborted
    // when the window moved" is equally consistent with a guard that aborts
    // on everything.
    await sleep(1800);
    report.control = {
      heldStillMillis: 1800,
      abortedWhileStill: session.integrity.aborted,
    };

    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const b = w.getContentBounds();
      w.setContentBounds({ ...b, x: b.x + 120, y: b.y + 80 });
    });
    report.moved = true;
    await sleep(2000);

    const rec = await session.stopRecording();
    report.aborted = Boolean(rec.integrity && rec.integrity.aborted);
    report.abortKind = rec.integrity ? rec.integrity.reason : null;
    report.millisIntoRecording = rec.integrity
      ? rec.integrity.millisIntoRecording
      : null;
    report.detail = rec.integrity ? rec.integrity.detail : null;
    report.recordingKept = Boolean(
      rec.outputPath && fs.existsSync(rec.outputPath) && rec.durationMillis
    );
    report.durationMillis = rec.durationMillis;
  } catch (err) {
    report.error = String((err && err.message) || err);
  } finally {
    await session.cleanup();
    if (app) {
      try {
        await app.close();
      } catch (err) {
        /* ignore */
      }
    }
  }
  return report;
}

// ------------------------------------------------------ C5 variants

/**
 * Every way this backend's dependency can be missing, run for real.
 *
 * The OBS pilot's three variants were websocket-unreachable,
 * websocket-auth-rejected and obs-executable-absent. This backend has no
 * websocket and no second application, so two of the three DO NOT EXIST
 * here. That is a genuine reduction in failure surface and is reported as
 * such rather than padded out with contrived equivalents -- but the third
 * shape, "the thing it shells out to is not there", exists twice (ffmpeg and
 * ffprobe), and one more shape exists that OBS also had: the dependency is
 * present and refuses the job.
 */
async function dependencyAbsentVariants() {
  const variants = [
    {
      name: "ffmpeg-executable-absent",
      opts: { ffmpegExe: path.join(os.tmpdir(), "no-such-ffmpeg-here.exe") },
    },
    {
      name: "ffprobe-executable-absent",
      opts: { ffprobeExe: path.join(os.tmpdir(), "no-such-ffprobe-here.exe") },
    },
  ];
  const results = [];
  for (const variant of variants) {
    const outDir = path.join(RUN_ROOT, "dep-" + variant.name);
    fs.mkdirSync(outDir, { recursive: true });
    const session = new GdigrabCaptureSession({
      tag: variant.name,
      outDir,
      ...variant.opts,
    });
    const entry = { variant: variant.name, ran: true };
    try {
      session.prepareHost();
      entry.kind = null;
      entry.threw = false;
      entry.message = "prepareHost did NOT fail, which it was required to";
    } catch (err) {
      entry.threw = true;
      entry.kind = err && err.kind;
      entry.message = String((err && err.message) || err);
      // The bar C5 sets is two-sided: the failure must NAME the dependency,
      // and it must be a kind a caller can branch on.
      entry.namesTheDependency = /ffmpeg|ffprobe/i.test(entry.message);
      entry.saysHowToFix = /install|PATH|DABBLER_FF/i.test(entry.message);
    }
    entry.videoArtifacts = fs.existsSync(path.join(outDir, "recording.mp4"))
      ? 1
      : 0;
    results.push(entry);
    await session.cleanup();
  }

  // The fourth shape, and the one that matters most for a public artifact:
  // ffmpeg is present, is asked for a rectangle it cannot grab, and must say
  // so rather than produce an empty file the run then blames on something
  // else. This is the failure `output-never-started` exists for.
  const outDir = path.join(RUN_ROOT, "dep-impossible-rectangle");
  fs.mkdirSync(outDir, { recursive: true });
  const bad = new GdigrabCaptureSession({ tag: "impossible", outDir });
  const entry = { variant: "rectangle-cannot-be-grabbed", ran: true };
  try {
    bad.prepareHost();
    bad.outDir = outDir;
    // Off the virtual desktop entirely, with a zero-area size.
    bad.rect = { x: 999999, y: 999999, width: 2, height: 2 };
    bad.captureRect = { x: 999999, y: 999999, width: 0, height: 0 };
    bad.outputPath = path.join(outDir, "impossible.mp4");
    await bad.startRecording();
    entry.threw = false;
    entry.message = "startRecording did NOT fail on an ungrabbable rectangle";
  } catch (err) {
    entry.threw = true;
    entry.kind = err && err.kind;
    entry.message = String((err && err.message) || err).slice(0, 500);
    entry.namesTheDependency = /ffmpeg/i.test(entry.message);
    entry.quotesWhatItSaid = /said:/i.test(entry.message);
  }
  entry.videoArtifacts =
    fs.existsSync(path.join(outDir, "impossible.mp4")) &&
    fs.statSync(path.join(outDir, "impossible.mp4")).size > 0
      ? 1
      : 0;
  await bad.cleanup();
  results.push(entry);

  // AND NOW THE HALF THAT ACTUALLY MATTERS. Proving `prepareHost()` throws
  // proves the constructor refuses; it says nothing about whether a person
  // on a machine with no ffmpeg still gets their walkthrough. Verification's
  // finding was exact, so each absent-dependency variant is now ALSO run
  // through the real recorder entry path, and the bar is what the run left
  // on disk: a named failure kind, a manifest, a completed walkthrough, and
  // zero video artifacts.
  for (const variant of variants) {
    const run = await pilotRun(
      variant.name === "ffmpeg-executable-absent" ? 95 : 96,
      variant.opts
    );
    results.push({
      variant: variant.name + "-through-the-recorder",
      ran: true,
      throughRecorder: true,
      threw: false,
      kind: run.captureUnavailableKind,
      message: String(run.captureUnavailableMessage || "").slice(0, 400),
      namesTheDependency: /ffmpeg|ffprobe/i.test(
        String(run.captureUnavailableMessage || "")
      ),
      walkthroughStillCompleted: run.usable,
      manifestWritten: run.manifestWritten,
      stepsCompleted: run.stepsCompleted,
      stepCount: run.stepCount,
      videoArtifacts: run.videoArtifacts,
      cleanupProblems: run.cleanupProblems,
    });
  }

  return results;
}

// ---------------------------------------------------------- evaluation

/**
 * Derive the verdict from the criteria file. Nothing here invents a
 * threshold: every number applied is read from `s4-pilot-criteria.json`.
 */
function evaluate(measurement, criteria) {
  const c = criteria.criteria;
  const bar = criteria.bar;
  const runs = measurement.runs;
  const controlRun = runs.find((r) => r.observations.occlusion) || runs[0];
  const criteriaOut = [];

  const correlations = runs
    .map((r) => r.observations.correlationWithTarget)
    .filter((v) => typeof v === "number");
  const ambiguityRefusals = runs.filter(
    (r) => r.captureUnavailableKind === "ambiguous-window-match"
  ).length;
  criteriaOut.push({
    id: "C1",
    name: c.C1.name,
    translation:
      "Unchanged in substance. The instrument is the same normalized " +
      "cross-correlation against a Playwright screenshot of the same " +
      "window; only the frame's source differs. The refusal clause is " +
      "implemented as `ambiguous-window-match`, which is raised BEFORE any " +
      "capture rather than logged after one.",
    passed:
      correlations.length === runs.length &&
      correlations.every((v) => v >= c.C1.minCorrelation) &&
      typeof (controlRun.observations.decoy || {}).correlationWithTarget ===
        "number" &&
      controlRun.observations.decoy.correlationWithTarget <=
        c.C1.control.decoyMaxCorrelation,
    detail: {
      minCorrelationAcrossRuns: correlations.length ? Math.min(...correlations) : null,
      threshold: c.C1.minCorrelation,
      decoyCorrelation: (controlRun.observations.decoy || {}).correlationWithTarget,
      decoyMustBeAtMost: c.C1.control.decoyMaxCorrelation,
      runsWithACorrelation: correlations.length + "/" + runs.length,
      ambiguityRefusals,
      refuseOnAmbiguousWindowMatch: true,
    },
  });

  // ------------------------------------------------------------------ C2
  const occ = controlRun.observations.occlusion || {};
  const detectorFires =
    typeof occ.detectorControlFraction === "number" &&
    occ.detectorControlFraction >= c.C2.control.minMagentaFractionInOccluderCapture;
  const weaknessIsReal =
    typeof occ.unguardedLeakFraction === "number" &&
    occ.unguardedLeakFraction > c.C2.maxMagentaFractionInTarget;
  const guardRefuses = Boolean(
    occ.guardRefusedBeforeStart && occ.guardRefusedBeforeStart.refused
  );
  const midAbort = measurement.occlusionMidCapture || {};
  const guardAborts = Boolean(midAbort.aborted);
  const shippedRunsLeaked = runs.filter(
    (r) =>
      typeof (r.observations.occlusion || {}).shippedLeak === "number" &&
      r.observations.occlusion.shippedLeak > c.C2.maxMagentaFractionInTarget
  ).length;
  criteriaOut.push({
    id: "C2",
    name: c.C2.name,
    translation:
      "THIS IS THE CRITERION THE BACKEND CHANGE IS ABOUT, and it is scored " +
      "against the MITIGATION the spec put in scope, not against immunity. " +
      "OBS's window capture is immune to an overlapping window; gdigrab " +
      "reads the composited desktop and is NOT -- measured here at " +
      (occ.unguardedLeakFraction === null || occ.unguardedLeakFraction === undefined
        ? "n/a"
        : (occ.unguardedLeakFraction * 100).toFixed(2) + "% of the frame") +
      " with the guard off. The criterion's CLAIM (\"a window overlapping " +
      "the target contributes no pixels to the capture\") is therefore met " +
      "here by refusing to produce such a capture at all, rather than by " +
      "filtering one. Four sub-measurements are required and all four must " +
      "hold: the detector fires on real magenta; the weakness is " +
      "demonstrated with the guard off (so the guard is load-bearing rather " +
      "than decorative); the guard refuses before starting; the guard " +
      "aborts mid-capture. NOTE that this is a DIFFERENT PROPERTY from the " +
      "one OBS was scored on -- availability is traded for safety -- and " +
      "that trade is the operator's to accept, not this harness's.",
    passed:
      detectorFires &&
      weaknessIsReal &&
      guardRefuses &&
      guardAborts &&
      shippedRunsLeaked === 0,
    detail: {
      detectorControl: occ.detectorControlFraction,
      detectorMustBeAtLeast: c.C2.control.minMagentaFractionInOccluderCapture,
      detectorFires,
      cleanFrameMagentaFraction: occ.cleanFrameMagentaFraction,
      unguardedLeakFraction: occ.unguardedLeakFraction,
      leakageThreshold: c.C2.maxMagentaFractionInTarget,
      weaknessDemonstratedWithGuardOff: weaknessIsReal,
      guardRefusedBeforeStart: occ.guardRefusedBeforeStart,
      guardAbortedMidCapture: midAbort,
      shippedRunsThatLeaked: shippedRunsLeaked,
      sessionFourComparison: {
        note:
          "Session 4 recorded C2 UNMET for OBS with ZERO leakage, because " +
          "its Chromium occluder scored 0.441219 against a 0.5 detector-" +
          "control bar -- an instrument shortfall, not a capture defect. " +
          "This harness's borderless occluder has no browser chrome to " +
          "dilute the fill and clears the bar.",
        sessionFourDetectorControl: 0.441219,
      },
    },
  });

  // ------------------------------------------------------------------ C3
  const deltas = runs
    .map((r) => r.observations.dimensionDeltaPx)
    .filter((v) => typeof v === "number");
  const resize = measurement.resizeVariant;
  const resizeDelta =
    resize && resize.observations ? resize.observations.dimensionDeltaPx : null;
  const scales = Array.from(
    new Set(
      runs.map((r) => r.observations.scaleFactor).filter((v) => v !== null)
    )
  );
  criteriaOut.push({
    id: "C3",
    name: c.C3.name,
    translation:
      "Unchanged. The frame's dimensions are compared with the target " +
      "window's PHYSICAL client rectangle. gdigrab is asked for exactly " +
      "that rectangle, so this criterion is close to tautological for this " +
      "backend -- which is itself the finding, and the resize variant is " +
      "what keeps it from being one: a fixed canvas would fail it.",
    passed:
      deltas.length === runs.length &&
      deltas.every((v) => v <= c.C3.maxDimensionDeltaPx) &&
      typeof resizeDelta === "number" &&
      resizeDelta <= c.C3.maxDimensionDeltaPx,
    detail: {
      worstDimensionDeltaPx: deltas.length ? Math.max(...deltas) : null,
      threshold: c.C3.maxDimensionDeltaPx,
      resizedFrame: resize && resize.observations ? resize.observations.frameSize : null,
      resizedDeltaPx: resizeDelta,
      frameFollowedTheResize:
        typeof resizeDelta === "number" && resizeDelta <= c.C3.maxDimensionDeltaPx,
      displayScalesExercised: scales,
      scalingCaveat:
        "One display scale was exercised (" +
        scales.join(", ") +
        "). A pass here is a claim about that scale and no other -- the same " +
        "residual Session 4 recorded, for the same reason: changing the " +
        "operator's live display scaling is an intrusive change to their " +
        "working desktop and was not performed.",
    },
  });

  // ------------------------------------------------------------------ C4
  const anchorUncertainties = runs
    .map((r) => r.anchor && r.anchor.uncertaintyMillis)
    .filter((v) => typeof v === "number");
  // Only runs whose video is a recording of the walkthrough. See
  // `videoContaminatedByControls`.
  const cueRuns = runs.filter(
    (r) => r.timing && r.timing.cues !== null && !r.videoContaminatedByControls
  );
  criteriaOut.push({
    id: "C4",
    name: c.C4.name,
    translation:
      "Unchanged, and measured through the SAME recorder: this harness " +
      "drives `recordVscodeWalkthrough`, so captions are retimed by the " +
      "same `walkthrough_run finalize` path against the same step-event " +
      "stream. Only the anchor's source differs -- gdigrab's bracket is the " +
      "instant ffmpeg reports its input open, where OBS's was the instant " +
      "its output went active.",
    passed:
      anchorUncertainties.length > 0 &&
      anchorUncertainties.every((v) => v <= c.C4.maxAnchorUncertaintyMillis) &&
      cueRuns.length > 0 &&
      cueRuns.every((r) => r.timing.cues === r.timing.steps) &&
      cueRuns.every((r) => r.timing.allCuesInsideRecording === true),
    detail: {
      worstAnchorUncertaintyMillis: anchorUncertainties.length
        ? Math.max(...anchorUncertainties)
        : null,
      threshold: c.C4.maxAnchorUncertaintyMillis,
      cuesEqualStepCount: cueRuns.every((r) => r.timing.cues === r.timing.steps),
      allCuesWithinRecording: cueRuns.every(
        (r) => r.timing.allCuesInsideRecording === true
      ),
      recordingDurationsMs: cueRuns.map((r) => r.timing.recordingDurationMs),
    },
  });

  // ------------------------------------------------------------------ C5
  const dep = measurement.dependencyAbsent || [];
  criteriaOut.push({
    id: "C5",
    name: c.C5.name,
    translation:
      "The SHAPE is unchanged -- every way the dependency can be missing " +
      "must produce a named failure and the walkthrough must still " +
      "complete without a video -- but the VARIANTS differ, because this " +
      "backend has a smaller failure surface. Two of the pilot's three " +
      "(websocket-unreachable, websocket-auth-rejected) DO NOT EXIST here: " +
      "there is no websocket and no second application to authenticate to. " +
      "That is a real reduction and is reported rather than padded out. " +
      "The remaining shapes are ffmpeg absent, ffprobe absent, and the " +
      "dependency present but unable to do the job. EACH ABSENT-DEPENDENCY " +
      "SHAPE IS MEASURED TWICE: once at the constructor, which must throw a " +
      "named kind, and once THROUGH THE REAL RECORDER, where the bar is " +
      "what the run left on disk -- a manifest, a completed walkthrough and " +
      "zero video artifacts. The second half was added after verification " +
      "pointed out that a throwing constructor proves nothing about whether " +
      "a person with no ffmpeg still gets their walkthrough.",
    passed:
      dep.length >= 5 &&
      dep.every((d) => d.namesTheDependency !== false) &&
      dep.every((d) => d.videoArtifacts === 0) &&
      // The constructor-level variants must THROW a named kind ...
      dep
        .filter((d) => !d.throughRecorder)
        .every((d) => d.threw === true && Boolean(d.kind)) &&
      // ... and the recorder-level ones must DEGRADE: a named kind, a
      // manifest on disk, a walkthrough that finished, and no video.
      dep.filter((d) => d.throughRecorder).length >= 2 &&
      dep
        .filter((d) => d.throughRecorder)
        .every(
          (d) =>
            Boolean(d.kind) &&
            d.manifestWritten === true &&
            d.walkthroughStillCompleted === true &&
            d.videoArtifacts === 0
        ) &&
      measurement.degradedRun &&
      measurement.degradedRun.manifestWritten === true &&
      measurement.degradedRun.videoArtifacts === 0 &&
      measurement.degradedRun.usable === true,
    detail: {
      variants: dep,
      variantsNotApplicable: [
        "websocket-unreachable (no websocket in this backend)",
        "websocket-auth-rejected (no authentication in this backend)",
      ],
      degradedWalkthrough: measurement.degradedRun
        ? {
            kind: measurement.degradedRun.captureUnavailableKind,
            manifestWritten: measurement.degradedRun.manifestWritten,
            videoArtifacts: measurement.degradedRun.videoArtifacts,
            stepsCompleted: measurement.degradedRun.stepsCompleted,
            stepCount: measurement.degradedRun.stepCount,
            walkthroughStillCompleted: measurement.degradedRun.usable,
          }
        : null,
    },
  });

  // ------------------------------------------------------------------ C6
  const allRuns = runs.concat(
    measurement.resizeVariant ? [measurement.resizeVariant] : [],
    measurement.inducedFailures || []
  );
  const leakedProcesses = allRuns.filter(
    (r) => typeof r.ffmpegProcessesAfter === "number" &&
      typeof r.ffmpegProcessesBefore === "number" &&
      r.ffmpegProcessesAfter > r.ffmpegProcessesBefore
  );
  const withProblems = allRuns.filter(
    (r) => (r.cleanupProblems || []).length > 0
  );
  const withStrays = allRuns.filter(
    (r) => (r.strayTempScriptsAfter || []).length > 0
  );
  const withZeroByte = allRuns.filter((r) => (r.zeroByteFiles || []).length > 0);
  criteriaOut.push({
    id: "C6",
    name: c.C6.name,
    translation:
      "The claim is unchanged -- nothing the harness created outlives the " +
      "run, including when it fails part way -- but five of the pilot's " +
      "seven sub-assertions are about OBS state that does not exist here " +
      "(scene collection, profile, websocket config, sentinel files, the " +
      "obs64 process tree). What replaces them is smaller and is checked " +
      "directly: no ffmpeg process survives, no driver script survives in " +
      "%TEMP%, no zero-byte file is left in the run directory, and the " +
      "VS Code process is gone. A SMALLER CLEANUP SURFACE IS THE RESULT, " +
      "not a weaker criterion.",
    passed:
      allRuns.length > 0 &&
      leakedProcesses.length === 0 &&
      withProblems.length === 0 &&
      withStrays.length === 0 &&
      withZeroByte.length === 0,
    detail: {
      attemptsChecked: allRuns.length,
      ffmpegProcessesLeaked: leakedProcesses.length,
      attemptsWithCleanupProblems: withProblems.length,
      problems: withProblems.map((r) => r.cleanupProblems),
      strayDriverScripts: withStrays.map((r) => r.strayTempScriptsAfter),
      zeroByteFiles: withZeroByte.map((r) => r.zeroByteFiles),
      inducedFailures: (measurement.inducedFailures || []).map((r) => ({
        inducedAt: r.inducedAt,
        walkthroughStillCompleted: r.usable,
        manifestWritten: r.manifestWritten,
        videoArtifacts: r.videoArtifacts,
        cleanupProblems: r.cleanupProblems,
        ffmpegProcessesAfter: r.ffmpegProcessesAfter,
      })),
    },
  });

  // ------------------------------------------------------------------ C7
  const audioCounts = runs
    .filter((r) => r.container)
    .map((r) => r.container.audioTrackCount);
  const videoCounts = runs
    .filter((r) => r.container)
    .map((r) => r.container.videoTrackCount);
  const noAudio = audioCounts.length > 0 && audioCounts.every((n) => n === 0);
  const oneVideo = videoCounts.length > 0 && videoCounts.every((n) => n === 1);
  criteriaOut.push({
    id: "C7",
    name: c.C7.name,
    // The honest one, and the reason step 5 exists.
    translation:
      "SPLIT VERDICT, and it must not be collapsed into one boolean. C7 " +
      "carries three separable requirements and this backend meets them " +
      "differently from OBS. (a) NO AUDIO TRACK: met STRUCTURALLY here -- " +
      "`-an` on the command line and no audio device in the graph -- and " +
      "this is the clause OBS could NOT satisfy, since it muxes a silent " +
      "track regardless of configuration (Session 4 measured 1 audio track " +
      "on all 11 recordings). (b) EXACTLY ONE SOURCE: met -- one rectangle, " +
      "one video stream, no compositing. (c) 'NEVER CAPTURES THE SCREEN, " +
      "ONLY WINDOWS THE HARNESS LAUNCHED', expressed as a list of forbidden " +
      "OBS input kinds: this backend HAS no input kinds, and its mechanism " +
      "IS a screen read -- `gdigrab -i desktop` over a rectangle. The " +
      "criterion's PURPOSE (established by its own amendment: never capture " +
      "the operator's webcam, microphone or whole screen) is met, because " +
      "the rectangle is the target window's client area and the occlusion " +
      "guard refuses when anything else is inside it. The criterion's " +
      "MECHANISM CLAUSE is NOT met, and cannot be met by any backend that " +
      "draws a cursor -- the cursor is composited by the desktop, which is " +
      "exactly why WGC cannot show it. THIS IS NOT THE ORCHESTRATOR'S TO " +
      "WAIVE; it is recorded here and carried to the operator at step 5.",
    passed: false,
    passedClauses: {
      noAudioTrack: noAudio,
      exactlyOneVideoStream: oneVideo,
      neverCapturesTheScreen: false,
    },
    detail: {
      audioTracksPerRecording: audioCounts,
      videoTracksPerRecording: videoCounts,
      noAudioTrack: noAudio,
      noAudioNote:
        "Structural. -an is an argument, not a profile setting, and ffprobe " +
        "reads back zero audio streams. This is the clause that failed for " +
        "OBS.",
      forbiddenKinds: c.C7.forbiddenInputKinds,
      inputKindsCreated: [],
      inputKindsNote:
        "Not applicable: this backend creates no OBS inputs of any kind. An " +
        "empty list here is a category difference, and must not be read as " +
        "'no forbidden kind was created' in the sense the pilot meant.",
      mechanismIsADesktopRead: true,
      mechanismNote:
        "gdigrab reads the composited desktop through GDI over a fixed " +
        "rectangle. Every pixel outside the target window's client area is " +
        "excluded by GEOMETRY and by the occlusion guard, not by the " +
        "capture mechanism. No webcam, microphone or audio device is opened " +
        "at any point, and no monitor-wide frame is ever written to disk.",
      unresolvedForOperator:
        "Does 'never captures the screen' mean the MECHANISM must not read " +
        "the screen, or that the ARTIFACT must contain nothing but the " +
        "target window? Under the first reading no cursor-capable backend " +
        "on Windows can ever pass. Under the second this backend passes, " +
        "conditional on the occlusion guard. Session 8 does not answer this.",
    },
  });

  const unmet = criteriaOut.filter((x) => !x.passed).map((x) => x.id);
  const perRun = bar.allOfPerRun;
  const contaminated = runs.filter((r) => r.videoContaminatedByControls).length;
  const cleanRuns = runs.filter(
    (r) =>
      !r.videoContaminatedByControls &&
      r.usable &&
      (r.cleanupProblems || []).length === 0 &&
      r.observations.errors.length === 0 &&
      typeof r.observations.correlationWithTarget === "number" &&
      r.observations.correlationWithTarget >= c.C1.minCorrelation &&
      typeof r.observations.dimensionDeltaPx === "number" &&
      r.observations.dimensionDeltaPx <= c.C3.maxDimensionDeltaPx &&
      r.timing &&
      r.timing.allCuesInsideRecording === true
  ).length;

  return {
    criteria: criteriaOut,
    perRunCriteria: perRun,
    cleanRuns,
    runsRequired: bar.runs,
    runsMeasured: runs.length,
    runsExcludedAsControlContaminated: contaminated,
    barRunsMet: cleanRuns >= bar.runs,
    unmet,
    verdict: cleanRuns >= bar.runs && unmet.length === 0 ? "PASS" : "FAIL",
    honestFail: criteria.honestFail,
  };
}

// ---------------------------------------------------------------- main

async function main() {
  if (process.platform !== "win32") {
    log("gdigrab is Windows-only; this is " + process.platform);
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(CRITERIA_PATH)) {
    log(
      "REFUSING to run: " +
        CRITERIA_PATH +
        " does not exist. The pass criteria are fixed before the first " +
        "capture, and a pilot that invents them as it goes has measured " +
        "nothing."
    );
    process.exitCode = 2;
    return;
  }
  const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
  const criteriaDigest = sha256(CRITERIA_PATH);
  log("criteria " + criteriaDigest);

  const only = process.argv.includes("--runs")
    ? Number(process.argv[process.argv.indexOf("--runs") + 1])
    : criteria.bar.runs;

  fs.rmSync(RUN_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RUN_ROOT, { recursive: true });

  const measurement = {
    measurement:
      "Windows OS capture of the AI Work Explorer, via ffmpeg gdigrab over " +
      "the target window's desktop rectangle",
    backend: "ffmpeg-gdigrab-desktop",
    windowFollowPolicy: WINDOW_FOLLOW_POLICY,
    criteriaFile: path.basename(CRITERIA_PATH),
    criteriaSha256: criteriaDigest,
    criteriaAreTheSessionFourFile: true,
    platform: process.platform + " " + os.release(),
    node: process.version,
    startedAt: new Date().toISOString(),
    runs: [],
    resizeVariant: null,
    dependencyAbsent: [],
    inducedFailures: [],
    degradedRun: null,
    windowMove: null,
    occlusionMidCapture: null,
  };

  // The control run's own video is aborted by its own occluder, so it can
  // never be one of the CLEAN runs the bar counts. One supplementary run is
  // added to reach the bar, exactly as Session 4 did, rather than lowering
  // the bar to what the controls left behind.
  const total = only + 1;
  for (let i = 1; i <= total; i++) {
    log("run " + i + " of " + total + (i === 1 ? " (carries the controls)" : ""));
    const run = await pilotRun(i, { withControls: i === 1 });
    measurement.runs.push(run);
    log(
      "  correlation=" +
        run.observations.correlationWithTarget +
        " dimDelta=" +
        run.observations.dimensionDeltaPx +
        " audio=" +
        (run.container ? run.container.audioTrackCount : "n/a") +
        " cleanup=" +
        JSON.stringify(run.cleanupProblems)
    );
    if (run.observations.occlusion) {
      log(
        "  C2 detectorControl=" +
          run.observations.occlusion.detectorControlFraction +
          " unguardedLeak=" +
          run.observations.occlusion.unguardedLeakFraction +
          " guardRefused=" +
          JSON.stringify(
            run.observations.occlusion.guardRefusedBeforeStart &&
              run.observations.occlusion.guardRefusedBeforeStart.kind
          )
      );
    }
  }

  log("C2 mid-capture occlusion abort");
  measurement.occlusionMidCapture = await occlusionMidCapture();
  log("  " + JSON.stringify(measurement.occlusionMidCapture));

  log("window-follow falsifier (" + WINDOW_FOLLOW_POLICY + ")");
  measurement.windowMove = await windowMoveFalsifier();
  log("  " + JSON.stringify(measurement.windowMove).slice(0, 300));

  log("C3 window-resize variant");
  measurement.resizeVariant = await pilotRun(90, {
    windowSize: { width: 1024, height: 700 },
  });

  log("C5 dependency-absent variants");
  measurement.dependencyAbsent = await dependencyAbsentVariants();

  log("C5 degraded walkthrough (capture unavailable, run for real)");
  measurement.degradedRun = await pilotRun(91, {
    induceFailureAt: "configure",
  });

  log("C6 induced post-setup failures");
  for (const point of ["configure", "start", "stop"]) {
    const run = await pilotRun(
      92 + ["configure", "start", "stop"].indexOf(point),
      { induceFailureAt: point }
    );
    run.inducedAt = point;
    measurement.inducedFailures.push(run);
  }

  measurement.finishedAt = new Date().toISOString();
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
    OUT_PATH,
    JSON.stringify(measurement, null, 2) + "\n",
    "utf8"
  );
  log("wrote " + OUT_PATH);
}

/**
 * Start a clean capture, then raise an unrelated window over it.
 *
 * Separate from the per-run controls because it needs the recording to be
 * LIVE and clean first -- which is the only way to show the guard reacting
 * rather than merely refusing.
 */
async function occlusionMidCapture() {
  const { _electron } = require("@playwright/test");
  const { makeUatWorkspace } = require("./make-uat-workspace.js");
  const {
    findCodeBinary,
    electronEnv,
    makeLaunchStateDirs,
  } = require("./vscode-launch.js");

  const outDir = path.join(RUN_ROOT, "occlusion-mid-capture");
  fs.mkdirSync(outDir, { recursive: true });
  const workspacePath = makeUatWorkspace();
  const state = makeLaunchStateDirs();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdoc-ud-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdoc-ext-"));
  let app = null;
  let occluder = null;
  const session = new GdigrabCaptureSession({
    tag: "occlusion-mid",
    outDir,
    guardIntervalMs: 300,
  });
  const report = { aborted: false, abortKind: null };

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
      timeout: 90000,
    });
    const page = await app.firstWindow({ timeout: 90000 });
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 90000 });
    await page.waitForTimeout(1500);

    session.prepareHost();
    const cfg = await session.configure({
      outDir,
      basename: "occlusion-mid",
      windowMatch: TARGET_MATCH,
    });
    await session.startRecording();
    // The control: clean for longer than the guard interval, no abort.
    await sleep(1500);
    report.control = { heldCleanMillis: 1500, abortedWhileClean: session.integrity.aborted };

    const r = cfg.rect;
    occluder = await openMagentaOccluder(
      {
        x: r.x + Math.round(r.width * 0.2),
        y: r.y + Math.round(r.height * 0.2),
        width: Math.round(r.width * 0.6),
        height: Math.round(r.height * 0.6),
      },
      log
    );
    await sleep(2200);
    const rec = await session.stopRecording();
    report.aborted = Boolean(rec.integrity && rec.integrity.aborted);
    report.abortKind = rec.integrity ? rec.integrity.reason : null;
    report.millisIntoRecording = rec.integrity
      ? rec.integrity.millisIntoRecording
      : null;
    report.occluderTitle =
      rec.integrity && rec.integrity.detail && rec.integrity.detail.occluders
        ? rec.integrity.detail.occluders[0].label
        : null;
    report.overlapFractionOfCapture =
      rec.integrity && rec.integrity.detail && rec.integrity.detail.occluders
        ? rec.integrity.detail.occluders[0].overlapFractionOfCapture
        : null;
    report.partialRecordingKept = Boolean(rec.durationMillis);
    report.durationMillis = rec.durationMillis;
  } catch (err) {
    report.error = String((err && err.message) || err);
  } finally {
    if (occluder) await occluder.close();
    await session.cleanup();
    if (app) {
      try {
        await app.close();
      } catch (err) {
        /* ignore */
      }
    }
  }
  return report;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[gdigrab-pilot] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { evaluate };
