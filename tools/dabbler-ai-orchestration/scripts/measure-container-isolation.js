#!/usr/bin/env node
// Containerised-capture isolation measurement for Set 113 Session 5, step 5.
//
//   node scripts/measure-container-isolation.js
//   node scripts/measure-container-isolation.js --runs 3 --capturer ffmpeg
//   node scripts/measure-container-isolation.js --capturer obs
//
// WHAT THIS IS FOR. The operator's 2026-08-16 reframing: a screen recorder
// is a facility for an AI-driven process to read whatever is on the
// operator's display. Session 4 GOVERNED that -- window capture only, one
// source per scene, camera and audio kinds forbidden -- and every one of
// those constraints was the harness behaving well. A container REMOVES the
// capability instead of governing it, and criterion I1 is the measurement
// that says whether it really does.
//
// It refuses to run without `s5-isolation-criteria.json` and stamps that
// file's SHA-256 into every measurement it writes, so a number can always
// be tied to the criteria it was judged against. Criteria decided after the
// first run are not criteria.
//
// REWRITTEN AFTER VERIFICATION ROUND 1, which found four Majors on both
// lenses. Three were false passes in this harness's own scoring, and they
// are the reason for the shape of what follows:
//   - I5 was scored on "three podman commands failed", not on the
//     degradation guarantee the criterion actually states. It now drives a
//     real capture ENTRYPOINT that must complete, write a manifest and emit
//     zero video artifacts with the dependency broken.
//   - I6 was scored without inducing any mid-run failure and without
//     looking for zero-byte or temporary files. Cleanup is now in a
//     `finally`, a mid-run failure is induced for real, and the filesystem
//     is inspected.
//   - I7's required fields were copied, not checked, and no cold measurement
//     existed. Cold build is now measured by removing the image first.
//
// INTERNAL AND EXPLICITLY UNSTABLE, and Windows-host-only (it drives Podman
// on a WSL machine). Not an npm script, and not a shipped capability: the
// verdict decides whether any of this becomes one.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { chromium } = require("@playwright/test");
const { decodePng, grayscaleGrid, correlate, colorFraction } = require("./png-metrics.js");
const { mp4Tracks, OCCLUDER_HTML } = require("./measure-os-capture.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const CRITERIA_PATH = path.join(SET_DIR, "s5-isolation-criteria.json");
const OUT_PATH = path.join(SET_DIR, "s5-container-isolation-measurement.json");
const CONTAINERS_DIR = path.join(EXTENSION_ROOT, "containers");
const SCRATCH = path.join(EXTENSION_ROOT, ".s5-scratch");

const PODMAN =
  process.env.DABBLER_PODMAN ||
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Podman", "podman.exe");

const IMAGE = "dabbler-capture-base:s5";
const LABEL = "dabbler-s5-isolation";
const WIDTH = 1280;
const HEIGHT = 800;
const RECORD_SECONDS = 12;

// Criterion I1's structural half. The container must never be handed any of
// these, and because this harness builds the argv itself, that is a claim it
// can assert directly rather than infer from pixels.
const FORBIDDEN_RUN_FLAGS = [
  "--privileged",
  "--net=host",
  "--network=host",
  "--ipc=host",
  "--pid=host",
  "--userns=host",
];
const FORBIDDEN_MOUNT_TARGETS = [
  "/tmp/.X11-unix",
  "/run/user",
  "/dev/dri",
  "/dev/snd",
  "/dev/video0",
];
// Declared in the criteria and previously never checked (verification nit).
const FORBIDDEN_ENV_NAMES = ["DISPLAY_HOST", "WAYLAND_DISPLAY", "PULSE_SERVER"];

function log(msg) {
  process.stdout.write("[container-isolation] " + msg + "\n");
}

function sha256(file) {
  return (
    "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function podmanAt(exe, args) {
  const res = cp.spawnSync(exe, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    argv: exe + " " + args.join(" "),
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    spawnError: res.error ? String(res.error.message) : null,
  };
}

function podman(args) {
  return podmanAt(PODMAN, args);
}

/** Parse the `FACT key=value` lines run-capture.sh prints. */
function parseFacts(text) {
  const facts = {};
  for (const line of text.split(/\r?\n/)) {
    // [a-z0-9_]+, not [a-z_]+. The first version silently DROPPED
    // `host_x11_socket_present` -- the one fact criterion I4 needs most --
    // because the key contains digits. A parser that drops a fact reports a
    // missing measurement as an absent one, which is the same failure mode
    // as an omitted UAT component: nothing is wrong, and nothing is there.
    const m = line.match(/^FACT\s+([a-z0-9_]+)=(.*)$/);
    if (m) facts[m[1]] = m[2].trim();
  }
  return facts;
}

function statsOf(gray) {
  const mean = gray.reduce((s, v) => s + v, 0) / gray.length;
  const variance = gray.reduce((s, v) => s + (v - mean) * (v - mean), 0) / gray.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/**
 * Podman volumes carrying THIS harness's label, not every volume on the
 * machine (verification nit): an operator with unrelated volumes would
 * otherwise fail I6 for a run that cleaned up perfectly.
 */
function harnessVolumeCount() {
  const res = podman(["volume", "ls", "--filter", "label=" + LABEL, "--quiet"]);
  const out = (res.stdout || "").trim();
  return out === "" ? 0 : out.split(/\r?\n/).length;
}

function harnessContainerNames() {
  const res = podman([
    "ps", "-a", "--filter", "label=" + LABEL, "--format", "{{.Names}}",
  ]);
  const out = (res.stdout || "").trim();
  return out === "" ? [] : out.split(/\r?\n/);
}

/**
 * The locked-down run argv.
 *
 * The security posture is lifted from `ai_router/podman_sandbox.py`
 * (Set 069 S4) rather than invented here -- verification round 1 was right
 * that a bespoke driver ignoring the repo's existing sandbox is a gap. What
 * is NOT reused is the function itself: `run_probe_in_container` mounts the
 * repository read-only at /repo and runs a Python probe from /scratch, and
 * a capture container must have no repo mount at all. The POLICY transfers;
 * the plumbing does not, and saying which is which is the point.
 */
function buildRunArgs(name, mode, capturer) {
  return [
    "run",
    "--name", name,
    "--label", LABEL + "=1",
    // No network at run time. The image is built with network; the capture
    // itself needs none, and a capturer that cannot reach anything is a
    // strictly smaller capability.
    "--network=none",
    "--security-opt=no-new-privileges",
    // `--cap-drop=ALL` IS DELIBERATELY ABSENT, and this is a measurement
    // rather than an omission. It is in ai_router/podman_sandbox.py's policy
    // and it was tried here first; with it, VS Code comes up with TWO
    // processes instead of fifteen and never maps a window, because
    // Chromium's sandbox needs capabilities to build its user namespace.
    // Isolated by running the same container with each flag alone:
    // --cap-drop=ALL -> 2 processes; --security-opt=no-new-privileges -> 15.
    //
    // The alternative was to keep the flag and pass Chromium `--no-sandbox`,
    // which trades the renderer's own sandbox for the container's capability
    // drop. That trade was NOT taken: the container boundary is already the
    // primary control here, and deliberately unsandboxing a browser engine to
    // satisfy a flag is the kind of convenience this session exists to
    // refuse. The residual is recorded rather than hidden -- this container
    // runs with Podman's default capability set, not an empty one.
    IMAGE,
    String(WIDTH),
    String(HEIGHT),
    String(RECORD_SECONDS),
    "/out",
    mode,
    capturer,
  ];
}

function structuralAssertions(runArgs) {
  const argvString = runArgs.join(" ");
  return {
    argv: "podman " + argvString,
    forbiddenFlagsPresent: FORBIDDEN_RUN_FLAGS.filter((f) => argvString.includes(f)),
    forbiddenMountsPresent: FORBIDDEN_MOUNT_TARGETS.filter((m) => argvString.includes(m)),
    forbiddenEnvPresent: FORBIDDEN_ENV_NAMES.filter((e) => argvString.includes(e)),
    bindMountCount: runArgs.filter((a) => a === "-v" || a === "--volume").length,
    networkNone: runArgs.includes("--network=none"),
    capDropAll: runArgs.includes("--cap-drop=ALL"),
    capDropOmittedReason:
      "--cap-drop=ALL breaks Chromium's sandbox setup: measured at 2 VS Code " +
      "processes and 0 mapped windows with it, 15 processes without it. Not " +
      "traded for --no-sandbox. Container runs with Podman's default caps.",
    noNewPrivileges: runArgs.includes("--security-opt=no-new-privileges"),
  };
}

/**
 * The host-side magenta window, raised and held FOREGROUND while the
 * container records. If a single one of its pixels reaches a frame captured
 * inside the container, the isolation claim is false.
 *
 * Reuses Session 4's occluder markup deliberately: same colour, same
 * structure, same detector, so the two sessions' leakage numbers are
 * comparable rather than merely similar-sounding.
 *
 * `foregroundProof` answers a verification nit: `bringToFront()` is a
 * request, and the outcome previously claimed the marker was "genuinely in
 * front" on the strength of that request alone. The window's own
 * `document.hasFocus()` and visibility are sampled AFTER the container run
 * returns, so the claim rests on an observation at the end of the window
 * rather than an intention at the start.
 */
async function openHostMarker() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--window-position=60,60", "--window-size=900,600", "--disable-infobars"],
  });
  const page = await browser.newPage();
  await page.goto(OCCLUDER_HTML);
  await page.bringToFront();
  await sleep(1200);
  return {
    browser,
    page,
    async foregroundProof() {
      try {
        return await page.evaluate(() => ({
          hasFocus: document.hasFocus(),
          visibilityState: document.visibilityState,
          width: window.outerWidth,
          height: window.outerHeight,
        }));
      } catch (err) {
        return { error: String(err && err.message ? err.message : err) };
      }
    },
  };
}

function buildImage(measurement, { cold }) {
  // A cold number requires actually being cold, and `podman rmi` is NOT
  // enough: it drops the tag while the layer cache survives, so the "cold"
  // build came back in 2.9 seconds and would have shipped as a cold cost.
  // That is the same mislabelled-cost defect verification round 1 raised,
  // rediscovered one layer down. --no-cache is what makes it true.
  if (cold) {
    podman(["rmi", "-f", IMAGE]);
  }
  const started = Date.now();
  const res = podman([
    "build",
    ...(cold ? ["--no-cache"] : []),
    "-f", path.join(CONTAINERS_DIR, "Containerfile.capture-base"),
    "-t", IMAGE,
    CONTAINERS_DIR,
  ]);
  const elapsed = (Date.now() - started) / 1000;
  if (res.status !== 0) {
    throw new Error("image build failed:\n" + res.stderr.slice(-4000));
  }
  const inspect = podman(["image", "inspect", IMAGE, "--format", "{{.Size}}"]);
  return {
    seconds: Number(elapsed.toFixed(1)),
    bytes: Number((inspect.stdout || "0").trim()) || null,
  };
}

async function oneRun(index, mode, capturer, measurement) {
  const name = "s5-run-" + mode + "-" + capturer + "-" + index;
  const runDir = path.join(SCRATCH, name);
  rmrf(runDir);
  fs.mkdirSync(runDir, { recursive: true });

  const runArgs = buildRunArgs(name, mode, capturer);
  const structural = structuralAssertions(runArgs);

  const startedAt = Date.now();
  let marker = null;
  let foregroundProof = null;
  const record = { index, mode, capturer, name, structural };

  // EVERYTHING after this point is in a try/finally. Verification round 1
  // was exactly right: the previous version closed the marker and removed
  // the container on the normal control flow only, so a decode error or a
  // failed `podman cp` left a headed browser window and a container behind
  // -- while criterion I6 reported deterministic cleanup.
  try {
    if (mode === "target") {
      marker = await openHostMarker();
      log("run " + index + ": host magenta marker raised and foreground");
    }

    const res = podman(runArgs);
    record.exitStatus = res.status;
    record.wallClockSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    record.facts = parseFacts(res.stdout + "\n" + res.stderr);
    if (res.status !== 0) record.stderrTail = res.stderr.slice(-2000);

    if (marker) foregroundProof = await marker.foregroundProof();

    // `podman cp` rather than a bind mount, on purpose: a bind mount is a
    // hole in the boundary this session is measuring, and copying afterwards
    // needs no hole at all.
    podman(["cp", name + ":/out/capture.mp4", path.join(runDir, "capture.mp4")]);
    podman(["cp", name + ":/out/inside.png", path.join(runDir, "inside.png")]);
    podman(["cp", name + ":/out/frames", runDir]);

    record.analysis = analyseRun(runDir);
    record.tracks = readTracks(path.join(runDir, "capture.mp4"));

    if (measurement.induceMidRunFailureOn === index) {
      // A REAL mid-run failure, thrown from where a decode or copy error
      // would land, so the `finally` below is the thing under test rather
      // than a claim about it.
      record.inducedMidRunFailure = true;
      throw new Error("induced mid-run failure (criterion I6)");
    }
  } catch (err) {
    record.error = String(err && err.message ? err.message : err);
  } finally {
    if (marker) await marker.browser.close().catch(() => {});
    record.markerForegroundProof = foregroundProof;

    const rmRes = podman(["rm", "-f", name]);
    record.cleanup = {
      removeStatus: rmRes.status,
      containerStillListed: harnessContainerNames().includes(name),
      harnessVolumeCount: harnessVolumeCount(),
      zeroByteFilesInContainer: record.facts ? Number(record.facts.zero_byte_files) : null,
      tempFilesInContainer: record.facts ? Number(record.facts.temp_files) : null,
      zeroByteFilesOnHost: countZeroByte(runDir),
      cleanupRanAfterFailure: Boolean(record.error),
    };
  }

  measurement.runs.push(record);
  const a = record.analysis || {};
  log(
    "run " + index + " (" + mode + "/" + capturer + "): exit=" + record.exitStatus +
      " frames=" + (a.frameCount ?? "n/a") +
      " magenta=" + (a.maxMagentaFraction === undefined || a.maxMagentaFraction === null
        ? "n/a" : a.maxMagentaFraction.toFixed(6)) +
      " corr=" + (a.minCorrelationToInside === undefined || a.minCorrelationToInside === null
        ? "n/a" : a.minCorrelationToInside.toFixed(4)) +
      " sd=" + (a.minFrameStdDev === undefined || a.minFrameStdDev === null
        ? "n/a" : a.minFrameStdDev.toFixed(2)) +
      (record.error ? " ERROR=" + record.error : "")
  );
  return record;
}

function countZeroByte(dir) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else {
        try {
          if (fs.statSync(full).size === 0) n += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return n;
}

function readTracks(mp4Path) {
  if (!fs.existsSync(mp4Path)) return null;
  try {
    return mp4Tracks(mp4Path);
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

function analyseRun(runDir) {
  const framesDir = path.join(runDir, "frames");
  const frameFiles = fs.existsSync(framesDir)
    ? fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort()
        .map((f) => path.join(framesDir, f))
    : [];

  const analysis = {
    frameCount: frameFiles.length,
    maxMagentaFraction: null,
    minCorrelationToInside: null,
    minFrameStdDev: null,
    frameDimensions: null,
    insideDimensions: null,
  };

  let insideGray = null;
  const insidePath = path.join(runDir, "inside.png");
  if (fs.existsSync(insidePath)) {
    const inside = decodePng(fs.readFileSync(insidePath));
    insideGray = grayscaleGrid(inside, 32);
    analysis.insideDimensions = inside.width + "x" + inside.height;
  }

  for (const f of frameFiles) {
    const img = decodePng(fs.readFileSync(f));
    if (!analysis.frameDimensions) analysis.frameDimensions = img.width + "x" + img.height;

    const magenta = colorFraction(img, [255, 0, 255], 24);
    analysis.maxMagentaFraction = Math.max(analysis.maxMagentaFraction ?? 0, magenta);

    const gray = grayscaleGrid(img, 32);
    const sd = statsOf(gray).stdDev;
    analysis.minFrameStdDev =
      analysis.minFrameStdDev === null ? sd : Math.min(analysis.minFrameStdDev, sd);

    if (insideGray) {
      const c = correlate(gray, insideGray);
      analysis.minCorrelationToInside =
        analysis.minCorrelationToInside === null ? c : Math.min(analysis.minCorrelationToInside, c);
    }
  }
  return analysis;
}

/**
 * THE CAPTURE ENTRYPOINT, and the thing criterion I5 is actually about.
 *
 * I5 says "the walkthrough still completes without a video" and requires a
 * manifest and zero video artifacts. The previous version ran three bare
 * podman commands and scored their exit codes, which tested nothing about
 * degradation -- verification round 1's sharpest finding, on both lenses.
 *
 * This is the smallest honest entrypoint: it attempts a container capture,
 * and on ANY failure it writes a run manifest describing what happened and
 * returns normally. It never throws. FAILURE TO RECORD MUST NEVER FAIL THE
 * WALKTHROUGH is the rule the whole set is built on, and this is the only
 * place in the container path where that rule can be tested.
 */
function containerCaptureEntrypoint(opts) {
  const runDir = opts.runDir;
  fs.mkdirSync(runDir, { recursive: true });
  const manifestPath = path.join(runDir, "run-manifest.json");
  const exe = opts.podmanExe || PODMAN;
  const image = opts.image || IMAGE;
  const name = opts.name;

  const manifest = {
    kind: "dabbler.walkthrough-run",
    session: "113-S5",
    startedAt: new Date().toISOString(),
    capturer: "container",
    artifacts: [],
    degraded: false,
    dependency: null,
    completed: false,
  };

  try {
    if (!fs.existsSync(exe)) {
      throw new Error("container dependency unavailable: podman executable not found at " + exe);
    }
    const args = opts.connection
      ? ["--connection", opts.connection, ...buildRunArgs(name, "target", "ffmpeg").map((a) =>
          a === IMAGE ? image : a)]
      : buildRunArgs(name, "target", "ffmpeg").map((a) => (a === IMAGE ? image : a));

    const res = podmanAt(exe, args);
    if (res.spawnError) {
      throw new Error("container dependency unavailable: podman could not be started (" + res.spawnError + ")");
    }
    if (res.status !== 0) {
      throw new Error(
        "container dependency unavailable: podman run failed -- " +
          (res.stderr || "").trim().split(/\r?\n/)[0]
      );
    }
    podmanAt(exe, ["cp", name + ":/out/capture.mp4", path.join(runDir, "capture.mp4")]);
    if (fs.existsSync(path.join(runDir, "capture.mp4"))) {
      manifest.artifacts.push({ kind: "container-video", path: "capture.mp4" });
    }
  } catch (err) {
    manifest.degraded = true;
    manifest.dependency = String(err && err.message ? err.message : err);
  } finally {
    // Always. The walkthrough completing is the guarantee under test.
    manifest.completed = true;
    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    podmanAt(exe, ["rm", "-f", name]);
  }

  return {
    manifestPath,
    manifest,
    videoArtifactCount: manifest.artifacts.filter((a) => a.kind === "container-video").length,
  };
}

/**
 * Criterion I5. Each declared variant now drives the entrypoint above, and
 * each is checked against the criterion's OWN postconditions rather than
 * against "something failed".
 */
function inducedVariants(measurement) {
  const variants = [];

  const run = (variant, opts, induced, extra) => {
    const runDir = path.join(SCRATCH, "s5-variant-" + variant);
    rmrf(runDir);
    const out = containerCaptureEntrypoint({
      runDir,
      name: "s5-variant-" + variant,
      ...opts,
    });
    const msg = out.manifest.dependency || "";
    variants.push({
      variant,
      induced,
      ...(extra || {}),
      walkthroughCompleted: out.manifest.completed === true,
      // `manifestStillWritten` is the criteria's own field name. The first
      // version called it `manifestWritten`, which is the same fact under a
      // name the criterion does not use -- and a criterion checked against a
      // renamed field is a criterion that quietly stops being checked.
      manifestStillWritten: fs.existsSync(out.manifestPath),
      videoArtifactCount: out.videoArtifactCount,
      degraded: out.manifest.degraded,
      errorMentionsContainerDependency: /container dependency unavailable/i.test(msg),
      message: msg.slice(0, 300),
    });
  };

  run(
    "podman-executable-absent",
    { podmanExe: path.join(os.tmpdir(), "definitely-not-podman.exe") },
    "pointed the entrypoint at a podman path that does not exist"
  );

  // THE DECLARED VARIANT, RUN LITERALLY. An earlier version substituted a
  // non-existent connection name for this and declared the substitution;
  // verification rejected that, correctly -- the criteria name
  // `podman-machine-stopped`, and a variant renamed is a variant not run.
  // The machine IS stopped and restarted, and the restart is VERIFIED rather
  // than assumed, because criterion I6 requires the machine to be left in
  // its entry state and this is the one variant that can violate it.
  const entryState = machineState();
  const stopRes = podman(["machine", "stop"]);
  const stoppedState = machineState();
  run(
    "podman-machine-stopped",
    {},
    "stopped the Podman machine for real, ran the entrypoint against it, then " +
      "restarted and verified"
  );
  let restore = podman(["machine", "start"]);
  if (restore.status !== 0) {
    // One retry, loudly. A machine left stopped is a broken environment for
    // whoever comes next, and this harness may not leave one behind.
    log("machine restart failed once, retrying: " + (restore.stderr || "").trim().slice(0, 200));
    restore = podman(["machine", "start"]);
  }
  const restoredState = machineState();
  measurement.machineStopVariant = {
    entryState,
    stopStatus: stopRes.status,
    stateWhileStopped: stoppedState,
    restartStatus: restore.status,
    restoredState,
    restored: restoredState === entryState,
  };
  log(
    "machine-stopped variant: stopped=" + (stopRes.status === 0) +
      " restored=" + (restoredState === entryState)
  );

  run(
    "image-absent",
    { image: "localhost/definitely-no-such-image:s5" },
    "ran a tag that was never built"
  );

  measurement.inducedVariants = variants;
  const good = variants.filter(
    (v) => v.walkthroughCompleted && v.manifestStillWritten && v.videoArtifactCount === 0 &&
      v.errorMentionsContainerDependency
  ).length;
  log("induced variants: " + good + "/" + variants.length + " degraded correctly");
}

function machineState() {
  const res = podman(["machine", "list", "--format", "{{.Name}}:{{.Running}}"]);
  return (res.stdout || "").trim();
}

async function main() {
  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(
      "[container-isolation] refusing to run: " + CRITERIA_PATH +
        " is missing. Criteria are fixed before measurements, not after."
    );
    process.exit(2);
  }
  if (!fs.existsSync(PODMAN)) {
    console.error("[container-isolation] podman not found at " + PODMAN);
    process.exit(2);
  }

  const argAfter = (flag, dflt) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : dflt;
  };
  const runsWanted = Number(argAfter("--runs", 3));
  const capturer = String(argAfter("--capturer", "ffmpeg"));

  fs.mkdirSync(SCRATCH, { recursive: true });

  const measurement = {
    measuredAt: new Date().toISOString(),
    set: "113-narrated-video-walkthroughs",
    session: 5,
    step: "5 - build the container and measure what it costs",
    criteriaSha256: sha256(CRITERIA_PATH),
    podmanExe: PODMAN,
    podmanVersion: (podman(["--version"]).stdout || "").trim(),
    machineStateOnEntry: machineState(),
    image: IMAGE,
    capturer,
    display: WIDTH + "x" + HEIGHT,
    recordSeconds: RECORD_SECONDS,
    // The mid-run failure lands on the LAST target run, so the runs before
    // it are undisturbed and the induced one is unambiguous.
    induceMidRunFailureOn: runsWanted,
    runs: [],
  };

  const cold = buildImage(measurement, { cold: true });
  const warm = buildImage(measurement, { cold: false });
  measurement.cost = {
    imageBytes: cold.bytes,
    imageBuildSeconds: cold.seconds,
    coldBuildSeconds: cold.seconds,
    warmBuildSeconds: warm.seconds,
    coldStartSeconds: null,
    captureWallClockSeconds: null,
    note:
      "coldBuildSeconds is measured with `podman build --no-cache` after " +
      "`podman rmi`, so every layer is rebuilt including the apt installs. " +
      "It still does NOT include a registry pull of the base image, which " +
      "was already local -- a first build on a clean machine pays that too. " +
      "coldStartSeconds is the container's own startup and application-launch " +
      "overhead: the host-observed wall clock of a run minus the capture wall " +
      "clock the container itself reports.",
  };
  log(
    "image: " + (cold.bytes / 1e6).toFixed(0) + " MB, cold build " + cold.seconds +
      "s, warm build " + warm.seconds + "s"
  );

  // The positive control FIRST. If the magenta detector cannot fire, every
  // clean leakage number afterwards is worthless -- which is exactly how
  // Session 4's C2 came to be scored FAIL on a measurement of 0.000000.
  const control = await oneRun(0, "magenta-control", capturer, measurement);
  measurement.magentaControl = {
    magentaFraction: control.analysis ? control.analysis.maxMagentaFraction : null,
    fired:
      control.analysis &&
      control.analysis.maxMagentaFraction !== null &&
      control.analysis.maxMagentaFraction >= 0.5,
  };
  log(
    "magenta detector control: " + (measurement.magentaControl.fired ? "FIRES" : "DID NOT FIRE") +
      " (" + Number(measurement.magentaControl.magentaFraction).toFixed(6) + ")"
  );

  for (let i = 1; i <= runsWanted; i += 1) {
    await oneRun(i, "target", capturer, measurement);
  }

  const firstTarget = measurement.runs.find((r) => r.mode === "target" && !r.error);
  if (firstTarget && firstTarget.facts) {
    const inContainer = Number(firstTarget.facts.capture_wall_clock_seconds);
    measurement.cost.captureWallClockSeconds = Number.isFinite(inContainer) ? inContainer : null;
    if (Number.isFinite(inContainer)) {
      measurement.cost.coldStartSeconds = Number(
        (firstTarget.wallClockSeconds - inContainer).toFixed(1)
      );
    }
  }

  // The decoy control for I2: the target frames must NOT correlate with the
  // control's magenta screen. Same instrument, different content.
  const controlFrame = path.join(SCRATCH, control.name, "frames", "f005.png");
  if (fs.existsSync(controlFrame)) {
    const decoyGray = grayscaleGrid(decodePng(fs.readFileSync(controlFrame)), 32);
    for (const runRec of measurement.runs.filter((r) => r.mode === "target")) {
      const insidePath = path.join(SCRATCH, runRec.name, "inside.png");
      if (!fs.existsSync(insidePath)) continue;
      const insideGray = grayscaleGrid(decodePng(fs.readFileSync(insidePath)), 32);
      runRec.analysis.decoyCorrelation = correlate(insideGray, decoyGray);
    }
  }

  inducedVariants(measurement);

  measurement.machineStateOnExit = machineState();
  measurement.machineLeftInEntryState =
    measurement.machineStateOnExit === measurement.machineStateOnEntry;
  measurement.harnessContainersLeftBehind = harnessContainerNames();

  fs.writeFileSync(OUT_PATH, JSON.stringify(measurement, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
}

main().catch((err) => {
  console.error("[container-isolation] " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
