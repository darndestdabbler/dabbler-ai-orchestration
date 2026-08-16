#!/usr/bin/env node
// Is a pointer actually VISIBLE in the recorded frames? (Set 113 Session 7)
//
//   node scripts/check-pointer-visible.js --run <walkthrough-run-dir>
//   node scripts/check-pointer-visible.js --run <dir> --out <report.json>
//
// This exists because a unit test asserting that a flag was passed proves
// nothing about what a viewer sees. Session 4 established the discipline and
// this session inherits it: the claim is about pixels in a video file, so it
// is measured in pixels in a video file.
//
// WHAT IT MEASURES, AND WHY THAT SHAPE.
//
// The obvious instrument -- "look for cursor-coloured pixels near the
// target" -- cannot work across both recorders. On the web path the cursor
// is drawn by this repo and its colours are known; on the VS Code path it is
// the real Windows arrow drawn by the compositor, in whatever theme and size
// the operator's machine uses, over a dark workbench. Any colour rule tuned
// for one is wrong for the other.
//
// So the instrument is DIFFERENTIAL and identical for both. Each probe
// carries two instants -- the moment before the pointer set off, and the
// moment it arrived -- and one point, the target it arrived at. Crop the
// same small region out of the frame at each instant and ask:
//
//   * did the region at the TARGET change between the two frames, and
//   * did a CONTROL region the pointer never visits stay the same?
//
// A pointer that arrived changes the first and not the second. A recorder
// that drew nothing changes neither, which is exactly what the falsifier
// run must produce. A page that re-rendered under the pointer changes both,
// and is reported as INDECISIVE rather than as a pass -- because it is.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { decodePng } = require("./png-metrics.js");

// The crop is sized to the arrow, not to the target. A pointer hotspot is a
// point, and the glyph hangs down and to the right of it -- 22x30 for the
// synthetic one, and the Windows arrow is within a few pixels of that at
// 100% and about double at 200%. 56x56 anchored 10px up and left of the
// hotspot contains either, and stays small enough that a two per cent change
// is a pointer rather than a rounding artifact.
const CROP = { size: 56, backX: 10, backY: 10 };

// Where the control crop is taken. Deliberately a fixed spot in the top-left
// of the frame: it is inside the recording (so encoder-wide effects show up
// there too) and it is not somewhere any target lives.
const CONTROL = { x: 4, y: 4 };

// A pixel counts as changed when any channel moves by more than this. Video
// is lossy and a static region still shimmers by a few levels between
// frames, so the threshold is set above that shimmer rather than at zero.
const CHANNEL_TOLERANCE = 28;

// The fraction of the crop that must change for a pointer to be called
// visible. The synthetic arrow inks roughly 300 of a 3136-pixel crop once
// its outline and drop shadow are counted, which is about nine per cent; the
// bar is set at a third of that so a smaller cursor still clears it, and
// well above the one per cent that lossy encoding produces on its own.
const ARRIVAL_MIN_CHANGED = 0.03;

// How still the control must be for the arrival to be attributable. Set at
// the encoder-shimmer level, not at zero.
const CONTROL_MAX_CHANGED = 0.01;

function log(msg) {
  console.log("[pointer-check] " + msg);
}

function parseArgs(argv) {
  const options = { run: null, out: null, video: null, keepFrames: false };
  const valueFor = (flag, index) => {
    const value = argv[index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("'" + flag + "' needs a value");
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run") options.run = valueFor(arg, ++index);
    else if (arg === "--out") options.out = valueFor(arg, ++index);
    else if (arg === "--video") options.video = valueFor(arg, ++index);
    else if (arg === "--keep-frames") options.keepFrames = true;
    else throw new Error("unknown argument '" + arg + "'");
  }
  if (!options.run) throw new Error("--run <walkthrough-run-dir> is required");
  return options;
}

/**
 * One frame, as a PNG buffer, at a given millisecond offset into a video.
 *
 * `-ss` BEFORE `-i` is the fast seek and lands on the nearest preceding
 * keyframe in some containers; `-ss` after `-i` decodes from the start and
 * lands on the exact frame. The exact frame is the whole point here -- a
 * pointer that is one keyframe early is a pointer that is not there -- so
 * the slow form is used deliberately.
 */
function extractFrame(videoPath, millis, cropRect, outPath) {
  const seconds = (millis / 1000).toFixed(3);
  const filter =
    "crop=" +
    cropRect.width +
    ":" +
    cropRect.height +
    ":" +
    cropRect.x +
    ":" +
    cropRect.y;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-ss",
    seconds,
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-y",
    outPath,
  ];
  const proc = cp.spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (proc.error) throw proc.error;
  if (proc.status !== 0 || !fs.existsSync(outPath)) {
    return {
      ok: false,
      error: (proc.stderr || "").trim() || "ffmpeg exited " + proc.status,
    };
  }
  return { ok: true, path: outPath };
}

/**
 * Where the change is, and what shape it is -- not merely how much of it.
 *
 * Verification's discovery pass was right that a bare "something changed"
 * test can pass on something that is not a pointer, and it named the case
 * this instrument actually met: a VS Code row that shows a HOVER TOOLTIP
 * scored 6.5% on a recording with no cursor in it anywhere. A tooltip is a
 * consequence of the pointer being there, which is why it is tempting, and
 * it is not a pointer.
 *
 * A cursor has three properties a tooltip, a repaint and a re-render do not
 * all share: it is SMALL, it is COMPACT, and its top-left corner is AT the
 * hotspot, because the hotspot is the arrow's tip. So the changed region's
 * bounding box is measured and judged, and a change that is not
 * cursor-shaped is reported as INDECISIVE rather than as a pass.
 */
function changedRegion(bufferA, bufferB, tolerance) {
  const a = decodePng(bufferA);
  const b = decodePng(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("frame crops are different sizes and cannot be differenced");
  }
  let changed = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const p = (y * a.width + x) * a.channels;
      const q = (y * b.width + x) * b.channels;
      if (
        Math.abs(a.data[p] - b.data[q]) > tolerance ||
        Math.abs(a.data[p + 1] - b.data[q + 1]) > tolerance ||
        Math.abs(a.data[p + 2] - b.data[q + 2]) > tolerance
      ) {
        changed += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = a.width * a.height;
  if (!changed) {
    return { fraction: 0, changed: 0, box: null, total };
  }
  return {
    fraction: changed / total,
    changed,
    box: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    total,
  };
}

/**
 * Is a changed region shaped like a cursor arriving at `hotspot`?
 *
 * `hotspot` is given in crop coordinates. The bounds are generous multiples
 * of the glyph rather than tight fits, because the same rule has to accept a
 * 22x30 synthetic arrow and a real Windows cursor at whatever size the
 * operator's display scaling makes it.
 */
function looksLikeACursor(region, hotspot, cropSize) {
  if (!region.box) return { ok: false, why: "nothing changed at all" };
  const scale = cropSize / CROP.size;
  const maxSide = Math.round(44 * scale);
  const slack = Math.round(14 * scale);
  if (region.box.width > maxSide || region.box.height > maxSide) {
    return {
      ok: false,
      why:
        "the change is " +
        region.box.width +
        "x" +
        region.box.height +
        ", larger than a cursor -- something in the UI moved or repainted",
    };
  }
  // A cursor is TALLER THAN IT IS WIDE. This is what separates it from the
  // case the review named: a checkbox or toolbar icon whose hover state
  // repaints a compact region right at the pointer -- those repaints follow
  // the control, which is square or wider than tall, because controls are.
  // Measured on this repo's own recordings, the synthetic arrow comes out
  // 18-20 wide by 27-31 tall, a ratio of about 1.5; the Windows arrow has
  // the same proportions.
  if (region.box.height <= region.box.width * 1.15) {
    return {
      ok: false,
      why:
        "the change is " +
        region.box.width +
        " wide by " +
        region.box.height +
        " tall, which is not the proportion of an arrow -- a control's " +
        "hover state repaints the control's own shape",
    };
  }
  if (
    Math.abs(region.box.x - hotspot.x) > slack ||
    Math.abs(region.box.y - hotspot.y) > slack
  ) {
    return {
      ok: false,
      why:
        "the change starts at " +
        region.box.x +
        "," +
        region.box.y +
        " rather than at the hotspot " +
        hotspot.x +
        "," +
        hotspot.y +
        " -- a cursor's tip is AT the point it was sent to",
    };
  }
  return { ok: true, why: "compact, cursor-sized, and anchored at the hotspot" };
}

/** Fraction of pixels that differ by more than `tolerance` on any channel. */
function changedFraction(bufferA, bufferB, tolerance) {
  const a = decodePng(bufferA);
  const b = decodePng(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      "frame crops are different sizes (" +
        a.width +
        "x" +
        a.height +
        " vs " +
        b.width +
        "x" +
        b.height +
        "), so they cannot be differenced"
    );
  }
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < total; i += 1) {
    const pa = i * a.channels;
    const pb = i * b.channels;
    if (
      Math.abs(a.data[pa] - b.data[pb]) > tolerance ||
      Math.abs(a.data[pa + 1] - b.data[pb + 1]) > tolerance ||
      Math.abs(a.data[pa + 2] - b.data[pb + 2]) > tolerance
    ) {
      changed += 1;
    }
  }
  return total ? changed / total : 0;
}

/**
 * The crop rectangle for a hotspot, clamped inside the frame.
 *
 * `size` is taken from the run rather than fixed, because the two recorders
 * record in different pixel spaces: a browser video is one CSS pixel to one
 * video pixel, and an OBS window capture is the window's PHYSICAL pixels, so
 * on a 200% display the system cursor is twice the size the synthetic one
 * is. A fixed crop would be right for one recorder and wrong for the other.
 */
function cropFor(point, frame, size) {
  const box = size || CROP.size;
  const back = Math.round((box * CROP.backX) / CROP.size);
  const x = Math.max(0, Math.min(frame.width - box, point.x - back));
  const y = Math.max(0, Math.min(frame.height - box, point.y - back));
  return { x, y, width: box, height: box };
}

/**
 * Was the pointer already inside the crop before it moved?
 *
 * If it was, this probe cannot decide anything: the region contains a
 * pointer in BOTH frames, so "nothing changed" is the correct observation
 * and the wrong conclusion. Reported as indecisive, never as a failure.
 */
function startedInsideCrop(probe, rect) {
  const previous = probe.previousPosition;
  if (!previous) return false;
  return (
    previous.x >= rect.x - 24 &&
    previous.x <= rect.x + rect.width + 24 &&
    previous.y >= rect.y - 24 &&
    previous.y <= rect.y + rect.height + 24
  );
}

function videoDurationMillis(videoPath) {
  const proc = cp.spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      videoPath,
    ],
    { encoding: "utf8" }
  );
  if (proc.error || proc.status !== 0) return null;
  const seconds = Number(String(proc.stdout || "").trim());
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * How far into the run the recording actually began.
 *
 * A probe's instants are measured against the run's own clock, whose zero is
 * the browser context being created. The FILE's zero is the first frame the
 * encoder wrote, which is later -- about 200ms later on this machine, which
 * is a quarter of a pointer approach and enough to sample the wrong side of
 * an action. Nothing reports the gap directly, so it is derived: the run
 * knows when it finished, the file knows how long it is, and the difference
 * is how much of the beginning the file does not have.
 *
 * Returns 0 when it cannot be derived, which is the previous behaviour and
 * is stated in the report rather than assumed.
 */
function recordingStartOffsetMillis(runDir, videoPath) {
  const eventsPath = path.join(runDir, "events.jsonl");
  if (!fs.existsSync(eventsPath)) return { millis: 0, basis: "no events.jsonl" };
  const lines = fs
    .readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim());
  let last = null;
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (typeof event.atMillis === "number") last = event.atMillis;
    } catch (err) {
      /* a truncated final line is not worth failing a measurement over */
    }
  }
  const duration = videoDurationMillis(videoPath);
  if (last === null || duration === null) {
    return { millis: 0, basis: "could not read the run end or the duration" };
  }
  const offset = Math.max(0, Math.round(last - duration));
  return {
    millis: offset,
    basis:
      "the run's last event was at " +
      last +
      "ms and the file is " +
      Math.round(duration) +
      "ms long",
  };
}

function videoDimensions(videoPath) {
  const proc = cp.spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      videoPath,
    ],
    { encoding: "utf8" }
  );
  if (proc.error || proc.status !== 0) return null;
  const parts = String(proc.stdout || "").trim().split(",");
  if (parts.length < 2) return null;
  return { width: Number(parts[0]), height: Number(parts[1]) };
}

function checkRun(options) {
  const runDir = path.resolve(options.run);
  const driverPath = path.join(runDir, "driver-output.json");
  if (!fs.existsSync(driverPath)) {
    throw new Error(
      "no driver-output.json in " +
        runDir +
        "; point --run at a walkthrough run directory"
    );
  }
  const driver = JSON.parse(fs.readFileSync(driverPath, "utf8"));
  // Beside the manifest, not inside it: `walkthrough_run finalize` owns the
  // manifest's shape and refuses keys it does not know.
  const probesPath = path.join(runDir, "pointer-probes.json");
  const pointerBlock = fs.existsSync(probesPath)
    ? JSON.parse(fs.readFileSync(probesPath, "utf8"))
    : { mode: "unknown", probes: [] };

  let videoPath = options.video;
  if (!videoPath) {
    const artifact = (driver.artifacts || []).find(
      (a) => a.mediaType && String(a.mediaType).startsWith("video/")
    );
    videoPath = artifact ? path.join(runDir, artifact.path) : null;
  }

  const report = {
    check: "a pointer is visible in the recorded frames at the moment of each action",
    runDir,
    scenarioId: driver.scenarioId,
    driver: driver.driver,
    pointerMode: pointerBlock.mode,
    video: videoPath ? path.relative(runDir, videoPath) : null,
    thresholds: {
      channelTolerance: CHANNEL_TOLERANCE,
      arrivalMinChangedFraction: ARRIVAL_MIN_CHANGED,
      controlMaxChangedFraction: CONTROL_MAX_CHANGED,
      cropPixels: CROP.size,
    },
    probes: [],
    counts: { passed: 0, failed: 0, indecisive: 0 },
    verdict: null,
    reason: null,
  };

  if (!videoPath || !fs.existsSync(videoPath)) {
    report.verdict = "UNMEASURED";
    report.reason =
      "the run produced no video file, so there are no frames to look at. " +
      "This is not a pointer failure: the recorders are required to degrade " +
      "to no video rather than to fail the walkthrough.";
    return report;
  }

  const dims = videoDimensions(videoPath);
  if (!dims) {
    report.verdict = "UNMEASURED";
    report.reason = "ffprobe could not read the video's dimensions";
    return report;
  }
  report.frame = dims;
  const offset = recordingStartOffsetMillis(runDir, videoPath);
  report.recordingStartOffsetMillis = offset.millis;
  report.recordingStartOffsetBasis = offset.basis;
  const atVideo = (runMillis) => Math.max(0, runMillis - offset.millis);

  const probes = pointerBlock.probes || [];
  if (probes.length === 0) {
    // The falsifier's expected shape when the recorder ran with the feature
    // OFF: there is a video, and nothing in it was ever claimed to be a
    // pointer. That is a FAIL of "a pointer is visible", which is what makes
    // it a usable control.
    report.verdict = "FAILED";
    report.reason =
      "the run recorded no pointer probes at all (pointer mode '" +
      pointerBlock.mode +
      "'), so no frame in this video can show a pointer arriving at a target";
    return report;
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pointer-check-"));
  try {
    const cropSize = Number(pointerBlock.cropSize) || CROP.size;
    report.thresholds.cropPixels = cropSize;
    for (const probe of probes) {
      const rect = cropFor(probe.to, dims, cropSize);
      const control = {
        x: CONTROL.x,
        y: CONTROL.y,
        width: cropSize,
        height: cropSize,
      };
      const entry = {
        stepId: probe.stepId,
        selector: probe.selector,
        at: probe.to,
        crop: rect,
        beforeMillis: probe.departedAtMillis,
        afterMillis: probe.arrivedAtMillis,
        outcome: null,
        detail: null,
      };

      if (startedInsideCrop(probe, rect)) {
        entry.outcome = "indecisive";
        entry.detail =
          "the pointer was already inside this crop before the move, so the " +
          "two frames cannot distinguish arrival from having been there";
        report.probes.push(entry);
        report.counts.indecisive += 1;
        continue;
      }

      const tag = String(probe.stepId).replace(/[^a-z0-9_-]+/gi, "-");
      const beforeTarget = path.join(scratch, tag + "-before.png");
      const afterTarget = path.join(scratch, tag + "-after.png");
      const beforeControl = path.join(scratch, tag + "-before-control.png");
      const afterControl = path.join(scratch, tag + "-after-control.png");

      const grabs = [
        extractFrame(videoPath, atVideo(probe.departedAtMillis), rect, beforeTarget),
        extractFrame(videoPath, atVideo(probe.arrivedAtMillis), rect, afterTarget),
        extractFrame(videoPath, atVideo(probe.departedAtMillis), control, beforeControl),
        extractFrame(videoPath, atVideo(probe.arrivedAtMillis), control, afterControl),
      ];
      const bad = grabs.find((g) => !g.ok);
      if (bad) {
        entry.outcome = "indecisive";
        entry.detail = "a frame could not be extracted: " + bad.error;
        report.probes.push(entry);
        report.counts.indecisive += 1;
        continue;
      }

      const region = changedRegion(
        fs.readFileSync(beforeTarget),
        fs.readFileSync(afterTarget),
        CHANNEL_TOLERANCE
      );
      const targetChanged = region.fraction;
      const controlChanged = changedFraction(
        fs.readFileSync(beforeControl),
        fs.readFileSync(afterControl),
        CHANNEL_TOLERANCE
      );
      entry.targetChangedFraction = Number(targetChanged.toFixed(5));
      entry.controlChangedFraction = Number(controlChanged.toFixed(5));
      entry.changedBox = region.box;
      // The hotspot in CROP coordinates. `cropFor` clamps at the frame's
      // edge, so this is derived from the rectangle actually used rather
      // than assumed to be the nominal offset.
      const hotspot = { x: probe.to.x - rect.x, y: probe.to.y - rect.y };
      const shape = looksLikeACursor(region, hotspot, cropSize);
      entry.shape = shape.why;

      if (controlChanged > CONTROL_MAX_CHANGED) {
        entry.outcome = "indecisive";
        entry.detail =
          "the control region changed too (" +
          entry.controlChangedFraction +
          "), so a change at the target cannot be attributed to a pointer";
        report.counts.indecisive += 1;
      } else if (targetChanged >= ARRIVAL_MIN_CHANGED && shape.ok) {
        entry.outcome = "passed";
        entry.detail =
          "a cursor-shaped mark appeared with its tip at the target, and " +
          "nothing moved in the control";
        report.counts.passed += 1;
      } else if (targetChanged >= ARRIVAL_MIN_CHANGED) {
        // Enough changed, but not in the shape a cursor makes. Reported as
        // INDECISIVE rather than as a pass: the honest reading is that this
        // probe cannot tell you whether a pointer arrived, not that one did.
        entry.outcome = "indecisive";
        entry.detail =
          "something appeared at the target but it is not shaped like a " +
          "cursor: " +
          shape.why;
        report.counts.indecisive += 1;
      } else {
        entry.outcome = "failed";
        entry.detail =
          "nothing appeared at the target: only " +
          entry.targetChangedFraction +
          " of the crop changed, against a bar of " +
          ARRIVAL_MIN_CHANGED;
        report.counts.failed += 1;
      }
      report.probes.push(entry);
    }
  } finally {
    if (!options.keepFrames) {
      fs.rmSync(scratch, { recursive: true, force: true });
    } else {
      report.frameDir = scratch;
    }
  }

  if (report.counts.passed === 0) {
    report.verdict = "FAILED";
    report.reason =
      "no probe showed a pointer arriving (" +
      report.counts.failed +
      " failed, " +
      report.counts.indecisive +
      " indecisive)";
  } else if (report.counts.failed > 0) {
    report.verdict = "FAILED";
    report.reason =
      report.counts.failed +
      " of " +
      probes.length +
      " probes showed no pointer arriving at the target";
  } else {
    report.verdict = "PASSED";
    report.reason =
      report.counts.passed +
      " of " +
      probes.length +
      " probes showed a pointer arriving at the target and nothing moving in " +
      "the control (" +
      report.counts.indecisive +
      " indecisive)";
  }
  return report;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = checkRun(options);
  const text = JSON.stringify(report, null, 2) + "\n";
  if (options.out) {
    fs.writeFileSync(options.out, text, "utf8");
    log("wrote " + options.out);
  } else {
    process.stdout.write(text);
  }
  log(report.verdict + ": " + report.reason);
  // UNMEASURED is not a failure: no video is a degraded recording, which the
  // recorders are required to survive. Exit 2 says "nothing was measured" so
  // a caller can tell it apart from both a pass and a fail.
  process.exitCode = report.verdict === "PASSED" ? 0 : report.verdict === "UNMEASURED" ? 2 : 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error("[pointer-check] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  }
}

module.exports = {
  CROP,
  changedRegion,
  looksLikeACursor,
  CONTROL,
  CHANNEL_TOLERANCE,
  ARRIVAL_MIN_CHANGED,
  CONTROL_MAX_CHANGED,
  parseArgs,
  changedFraction,
  cropFor,
  startedInsideCrop,
  checkRun,
};
