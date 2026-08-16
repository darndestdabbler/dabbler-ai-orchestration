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
// The walkthrough manifest THIS SCRIPT writes, on every exit path, lives at
// <scratch>/run-manifest.json. Criterion I5 is about the documented
// entrypoint completing without a video, so the manifest has to be this
// script's own artifact rather than a helper's -- see writeManifest().

const PODMAN =
  process.env.DABBLER_PODMAN ||
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Podman", "podman.exe");

// Overridable so the I5 variants can break the dependency on the DOCUMENTED
// entrypoint rather than on a private helper.
const IMAGE = process.env.DABBLER_S5_IMAGE || "dabbler-capture-base:s5";
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

/**
 * Every container on the machine with its state -- not just ours.
 *
 * `machine list` reports whether the VM is running and nothing about what was
 * running INSIDE it, so comparing that string alone let this harness publish
 * `machineLeftInEntryState: true` while an operator's unrelated workloads sat
 * stopped. Verification round 5, and it is right: the default Podman machine
 * is shared by every local Podman workload.
 */
function containerInventory() {
  const res = podman(["ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Labels}}"]);
  const out = (res.stdout || "").trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const [name, state, labels] = line.split("\t");
    return { name, state, harnessOwned: String(labels || "").includes(LABEL) };
  });
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
  // The image-absent variant must find NO image, and the first attempt at it
  // did not: pointing DABBLER_S5_IMAGE at a bogus tag simply built the image
  // under that name, so the child ran a full successful measurement and the
  // variant proved nothing. Skipping the build is what makes the tag absent.
  if (process.env.DABBLER_S5_SKIP_BUILD) {
    const exists = podman(["image", "exists", IMAGE]);
    if (exists.status !== 0) {
      const err = new Error(
        "container dependency unavailable: image " + IMAGE + " is not present and the build was skipped"
      );
      err.dependencyUnavailable = true;
      throw err;
    }
    const inspect = podman(["image", "inspect", IMAGE, "--format", "{{.Size}}"]);
    return { seconds: 0, bytes: Number((inspect.stdout || "0").trim()) || null };
  }

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
    // DEGRADE, do not throw. Verification round 3 rejected the previous fix
    // for exactly this: `main()` reached `buildImage()`, which threw on a
    // failed podman build, so under the very dependency failures I5 declares
    // the DOCUMENTED entrypoint aborted with no manifest at all -- while I5
    // reported PASS on a private helper that always set completed = true.
    const err = new Error(
      "container dependency unavailable: image build failed -- " +
        ((res.spawnError || res.stderr || "").trim().split(/\r?\n/)[0] || "no detail")
    );
    err.dependencyUnavailable = true;
    throw err;
  }
  const inspect = podman(["image", "inspect", IMAGE, "--format", "{{.Size}}"]);
  return {
    seconds: Number(elapsed.toFixed(1)),
    bytes: Number((inspect.stdout || "0").trim()) || null,
  };
}

async function oneRun(index, mode, capturer, measurement) {
  const name = "s5-run-" + mode + "-" + capturer + "-" + index;
  const runDir = path.join(measurement.scratchDir || SCRATCH, name);
  rmrf(runDir);
  fs.mkdirSync(runDir, { recursive: true });

  const runArgs = buildRunArgs(name, mode, capturer);
  const structural = structuralAssertions(runArgs);

  const startedAt = Date.now();
  let marker = null;
  let foregroundProof = null;
  const record = { index, mode, capturer, name, structural, interrupted: false };

  // EVERYTHING after this point is in a try/finally. Verification round 1
  // was exactly right: the previous version closed the marker and removed
  // the container on the normal control flow only, so a decode error or a
  // failed `podman cp` left a headed browser window and a container behind
  // -- while criterion I6 reported deterministic cleanup.
  try {
    if (mode === "target" || mode === "interrupt") {
      // The interrupted run raises the marker TOO. Verification round 4 was
      // right: skipping it meant the failure path never exercised headed
      // marker teardown, which is precisely the cleanup surface a mid-run
      // failure is supposed to test.
      marker = await openHostMarker();
      log("run " + index + ": host magenta marker raised and foreground");
    }

    let res;
    if (mode === "interrupt") {
      // A REAL interruption, WHILE CAPTURE IS ACTIVE. Verification round 3
      // rejected the previous version because its exception was thrown after
      // `podman run` returned and after every artifact had been copied,
      // decoded and analysed -- which tests the teardown of a SUCCESSFUL run
      // and nothing about a partial one. Here the container is force-removed
      // from the host part-way through the capture, so the artifacts are
      // genuinely incomplete.
      record.interrupted = true;
      res = await new Promise((resolve) => {
        const child = cp.spawn(PODMAN, runArgs, { encoding: "utf8" });
        let out = "";
        let errOut = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (errOut += d));
        let killed = false;
        let finished = false;

        // OBSERVE, do not assume. The previous version fired a fixed 22-second
        // timer and set killedMidCapture unconditionally when it expired --
        // so on any run where VS Code started a little slower, the container
        // would have been removed BEFORE recording began and I6 would still
        // have reported an interruption during capture. Startup here is
        // genuinely variable: this same measurement records 24.5 s of
        // non-capture wall time.
        //
        // The condition is the capture file existing and GROWING inside the
        // container, which is the only direct evidence that artifact
        // production is under way.
        const observation = { polls: 0, sizes: [], observedActiveAtSeconds: null };
        const poll = setInterval(() => {
          if (finished) return;
          observation.polls += 1;
          const probe = podman([
            "exec", name, "sh", "-c",
            "stat -c %s /out/capture.mp4 2>/dev/null || echo 0",
          ]);
          const size = Number((probe.stdout || "0").trim()) || 0;
          observation.sizes.push(size);
          const growing =
            observation.sizes.length >= 2 &&
            size > 0 &&
            size > observation.sizes[observation.sizes.length - 2];
          if (growing && !killed) {
            killed = true;
            observation.observedActiveAtSeconds = Number(
              ((Date.now() - startedAt) / 1000).toFixed(1)
            );
            observation.sizeAtInterrupt = size;
            record.interruptedAtSeconds = observation.observedActiveAtSeconds;
            clearInterval(poll);
            podman(["rm", "-f", name]);
          }
          if (observation.polls > 90 && !killed) {
            // Never observed capture starting. That is a failed EXPERIMENT,
            // not a passed criterion, and it must not masquerade as one.
            clearInterval(poll);
          }
        }, 1000);

        child.on("close", (code) => {
          finished = true;
          clearInterval(poll);
          resolve({
            status: code,
            stdout: out,
            stderr: errOut,
            killedMidCapture: killed,
            observation,
          });
        });
      });
      record.killedMidCapture = res.killedMidCapture === true;
      record.interruptObservation = res.observation;
      // The claim the verdict scores: capture was OBSERVED producing bytes at
      // the moment of the interruption.
      record.captureObservedActive =
        res.killedMidCapture === true &&
        Boolean(res.observation && res.observation.sizeAtInterrupt > 0);
    } else {
      res = podman(runArgs);
    }
    record.exitStatus = res.status;
    record.wallClockSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    record.facts = parseFacts(res.stdout + "\n" + res.stderr);
    if (res.status !== 0) record.stderrTail = (res.stderr || "").slice(-2000);

    if (marker) foregroundProof = await marker.foregroundProof();

    // `podman cp` rather than a bind mount, on purpose: a bind mount is a
    // hole in the boundary this session is measuring, and copying afterwards
    // needs no hole at all.
    podman(["cp", name + ":/out/capture.mp4", path.join(runDir, "capture.mp4")]);
    podman(["cp", name + ":/out/inside.png", path.join(runDir, "inside.png")]);
    podman(["cp", name + ":/out/frames", runDir]);

    record.analysis = analyseRun(runDir);
    record.tracks = readTracks(path.join(runDir, "capture.mp4"));

    if (record.interrupted) {
      // The interruption IS the induced failure now. Nothing is thrown after
      // a successful capture any more -- that was the rejected shape.
      record.inducedMidRunFailure = true;
    }
  } catch (err) {
    record.error = String(err && err.message ? err.message : err);
  } finally {
    let markerClosed = null;
    if (marker) {
      await marker.browser.close().catch(() => {});
      // Observed, not assumed: an already-closed browser reports disconnected.
      markerClosed = marker.browser.isConnected ? !marker.browser.isConnected() : true;
    }
    record.markerForegroundProof = foregroundProof;
    record.markerRaised = Boolean(marker);
    record.markerClosed = markerClosed;

    const rmRes = podman(["rm", "-f", name]);
    record.cleanup = {
      removeStatus: rmRes.status,
      containerStillListed: harnessContainerNames().includes(name),
      harnessVolumeCount: harnessVolumeCount(),
      zeroByteFilesInContainer: record.facts ? Number(record.facts.zero_byte_files) : null,
      tempFilesInContainer: record.facts ? Number(record.facts.temp_files) : null,
      zeroByteFilesOnHost: countZeroByte(runDir),
      // An INTERRUPTED run is abnormal even though nothing was thrown: the
      // container was force-removed from the host mid-capture, so the child
      // simply exits 137 and no exception reaches here. Keying this off
      // `record.error` alone reported "cleanup did not run after a failure"
      // for the one run that WAS the failure.
      cleanupRanAfterFailure: Boolean(record.error || record.interrupted),
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
 * Criterion I5, driven through THE DOCUMENTED ENTRYPOINT.
 *
 * Verification round 3 rejected the previous fix, and the rejection was
 * exact: the variants called a private helper inside this file that always
 * set `completed = true`, while the script an operator actually runs threw
 * out of `buildImage()` under the same dependency failures and wrote no
 * manifest at all. A helper that certifies itself is not evidence.
 *
 * So each variant now re-executes THIS FILE as a child process with the
 * dependency genuinely broken, and asserts what the criterion asks for: the
 * process completes (exit 0), the run manifest exists, it names a container
 * dependency, and no video artifact was produced.
 */
function inducedVariants(measurement) {
  const variants = [];

  const runVariant = (variant, env, induced, extra) => {
    const runDir = path.join(SCRATCH, "s5-variant-" + variant);
    rmrf(runDir);
    fs.mkdirSync(runDir, { recursive: true });

    const res = cp.spawnSync(
      process.execPath,
      [__filename, "--variant-child", "--scratch", runDir, "--runs", "1"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...env },
      }
    );

    const manifestPath = path.join(runDir, "run-manifest.json");
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = null;
    }
    // RECURSIVE. The first version listed only the top level, where a child
    // that captured successfully writes nothing -- so a variant that failed
    // to degrade would have reported zero video artifacts and passed.
    const videos = [];
    const stack = fs.existsSync(runDir) ? [runDir] : [];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (/\.(mp4|webm|mkv)$/i.test(e.name)) videos.push(full);
      }
    }

    variants.push({
      variant,
      induced,
      ...(extra || {}),
      entrypoint: "measure-container-isolation.js (the documented command)",
      childExitStatus: res.status,
      walkthroughCompleted: res.status === 0 && Boolean(manifest && manifest.completed),
      manifestStillWritten: fs.existsSync(manifestPath),
      videoArtifactCount: videos.length,
      degraded: Boolean(manifest && manifest.degraded),
      // DERIVED FROM THE ARTIFACT the child was supposed to produce, and from
      // its contents -- not from any field the child wrote about itself.
      postCaptureStepRan: (() => {
        const idx = path.join(runDir, "walkthrough-index.html");
        if (!fs.existsSync(idx)) return false;
        const text = fs.readFileSync(idx, "utf8");
        return (
          text.includes("<!-- dabbler:post-capture-step -->") &&
          /<li>/.test(text) &&
          fs.statSync(idx).size > 100
        );
      })(),
      postCaptureArtifactBytes: (() => {
        const idx = path.join(runDir, "walkthrough-index.html");
        return fs.existsSync(idx) ? fs.statSync(idx).size : 0;
      })(),
      errorMentionsContainerDependency: /container dependency unavailable/i.test(
        String(manifest && manifest.dependency)
      ),
      message: String((manifest && manifest.dependency) || (res.stderr || "")).slice(0, 300),
    });
  };

  runVariant(
    "podman-executable-absent",
    { DABBLER_PODMAN: path.join(os.tmpdir(), "definitely-not-podman.exe") },
    "re-ran the documented entrypoint with DABBLER_PODMAN pointing at a path that does not exist"
  );

  // THE DECLARED VARIANT, RUN LITERALLY -- BUT NOT UNCONDITIONALLY.
  //
  // An earlier version substituted a non-existent connection name for this and
  // was rejected, so the machine is stopped for real. Verification round 5
  // then caught what that traded away: `podman-machine-default` is SHARED by
  // every local Podman workload, and stopping it unconditionally can leave an
  // operator's unrelated containers stopped while this harness publishes
  // "machine left in entry state" on the strength of a VM status string.
  //
  // So: inventory first, refuse if anything that is not ours is running, and
  // demonstrate restoration by comparing the inventory rather than the VM
  // state. A measurement that cannot be taken safely is NOT taken, and the
  // refusal is recorded where the verdict can see it -- which will fail I5,
  // correctly, because the declared variant did not run.
  const entryState = machineState();
  const inventoryBefore = containerInventory();
  const foreignRunning = inventoryBefore.filter(
    (c) => !c.harnessOwned && /^up|running/i.test(String(c.state))
  );

  if (foreignRunning.length > 0) {
    measurement.machineStopVariant = {
      skipped: true,
      reason:
        "REFUSED to stop the shared Podman machine: " + foreignRunning.length +
        " container(s) not owned by this harness are running (" +
        foreignRunning.map((c) => c.name).join(", ") +
        "). Stopping the default machine would interrupt them, and restarting " +
        "the VM does not restart containers without restart policies.",
      foreignRunning: foreignRunning.map((c) => c.name),
      entryState,
    };
    variants.push({
      variant: "podman-machine-stopped",
      induced: "NOT RUN -- refused, see machineStopVariant.reason",
      notRun: true,
      entrypoint: "measure-container-isolation.js (the documented command)",
      walkthroughCompleted: false,
      manifestStillWritten: false,
      videoArtifactCount: 0,
      errorMentionsContainerDependency: false,
      postCaptureStepRan: false,
      message: measurement.machineStopVariant.reason,
    });
    log("machine-stopped variant: REFUSED (" + foreignRunning.length + " foreign container(s) running)");
  } else {
    const stopRes = podman(["machine", "stop"]);
    const stoppedState = machineState();
    runVariant(
      "podman-machine-stopped",
      {},
      "stopped the Podman machine for real and re-ran the documented entrypoint " +
        "against it, after confirming no container outside this harness was running"
    );
    let restore = podman(["machine", "start"]);
    if (restore.status !== 0) {
      log("machine restart failed once, retrying: " + (restore.stderr || "").trim().slice(0, 200));
      restore = podman(["machine", "start"]);
    }
    const restoredState = machineState();
    const inventoryAfter = containerInventory();
    // Compare the INVENTORY, not the VM status string: same containers, same
    // states. That is what "restored" has to mean.
    const key = (list) =>
      list
        .filter((c) => !c.harnessOwned)
        .map((c) => c.name + "=" + c.state)
        .sort()
        .join("|");
    const inventoryPreserved = key(inventoryBefore) === key(inventoryAfter);
    measurement.machineStopVariant = {
      skipped: false,
      entryState,
      stopStatus: stopRes.status,
      stateWhileStopped: stoppedState,
      restartStatus: restore.status,
      restoredState,
      foreignContainersBefore: inventoryBefore.filter((c) => !c.harnessOwned),
      foreignContainersAfter: inventoryAfter.filter((c) => !c.harnessOwned),
      inventoryPreserved,
      restored: restoredState === entryState && inventoryPreserved,
    };
    log(
      "machine-stopped variant: stopped=" + (stopRes.status === 0) +
        " restored=" + measurement.machineStopVariant.restored +
        " inventoryPreserved=" + inventoryPreserved
    );
  }

  // The bogus tag must genuinely not exist. An earlier attempt at this
  // variant BUILT the image under that name, so on the next run the tag was
  // present and the child happily captured -- the variant proving the
  // opposite of what it claims. Remove it first, every time.
  podman(["rmi", "-f", "localhost/definitely-no-such-image:s5"]);
  runVariant(
    "image-absent",
    {
      DABBLER_S5_IMAGE: "localhost/definitely-no-such-image:s5",
      DABBLER_S5_SKIP_BUILD: "1",
    },
    "re-ran the documented entrypoint against a tag that was never built, with " +
      "the build skipped so the tag stays absent"
  );

  measurement.inducedVariants = variants;
  const good = variants.filter(
    (v) =>
      v.walkthroughCompleted && v.manifestStillWritten && v.videoArtifactCount === 0 &&
      v.errorMentionsContainerDependency
  ).length;
  log("induced variants: " + good + "/" + variants.length + " degraded correctly");
}

function machineState() {
  const res = podman(["machine", "list", "--format", "{{.Name}}:{{.Running}}"]);
  return (res.stdout || "").trim();
}

/**
 * THE POST-CAPTURE WALKTHROUGH STEP, performed rather than claimed.
 *
 * Round 6 rejected the previous shape and was right: the degraded path wrote
 * `postCaptureStep: "ran"` into the manifest and the parent read that same
 * field straight back out as `postCaptureStepRan: true`. Nothing executed. A
 * criterion whose evidence is a string the code under test writes about
 * itself is not a criterion, and this is the third time that pattern has been
 * caught in this session.
 *
 * What a walkthrough actually owes after capture is the READABLE ARTIFACT --
 * the thing a reviewer opens when there is no video. So the step is: render
 * the run's step list to a standalone document. It runs on the degraded path
 * too, which is the whole point: FAILURE TO RECORD MUST NEVER FAIL THE
 * WALKTHROUGH means the document still gets written when the recorder is
 * gone.
 *
 * The parent then derives `postCaptureStepRan` from that FILE and its
 * contents, never from a field the child asserted.
 */
function performPostCaptureStep(scratchDir, { degraded, dependency, runs }) {
  const indexPath = path.join(scratchDir, "walkthrough-index.html");
  const steps = [
    "Start a virtual display inside the container",
    "Install the Dabbler extension and open the fixture workspace",
    "Record the display",
    "Extract frames and write the run manifest",
  ];
  const body =
    "<!-- dabbler:post-capture-step -->\n" +
    "<h1>Container capture walkthrough</h1>\n" +
    "<p>Recording: " +
    (degraded ? "UNAVAILABLE -- " + String(dependency || "") : String(runs || 0) + " run(s)") +
    "</p>\n<ol>\n" +
    steps.map((t) => "  <li>" + t + "</li>").join("\n") +
    "\n</ol>\n";
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(indexPath, body, "utf8");
  return indexPath;
}

/**
 * The run manifest THIS script owes on every exit path, successful or not.
 */
function writeManifest(scratchDir, fields) {
  const manifestPath = path.join(scratchDir, "run-manifest.json");
  try {
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          kind: "dabbler.walkthrough-run",
          session: "113-S5",
          capturer: "container",
          finishedAt: new Date().toISOString(),
          ...fields,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch {
    /* the manifest is best-effort by definition: it is what remains when
       everything else failed, so it must not itself throw. */
  }
  return manifestPath;
}

async function main() {
  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(
      "[container-isolation] refusing to run: " + CRITERIA_PATH +
        " is missing. Criteria are fixed before measurements, not after."
    );
    process.exit(2);
  }

  const argAfter = (flag, dflt) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : dflt;
  };
  const runsWanted = Number(argAfter("--runs", 3));
  const capturer = String(argAfter("--capturer", "ffmpeg"));
  // A variant child gets its own scratch directory and does not recurse into
  // the variant stage; otherwise the degradation test would fork forever.
  const isVariantChild = process.argv.includes("--variant-child");
  const scratchDir = String(argAfter("--scratch", SCRATCH));

  fs.mkdirSync(scratchDir, { recursive: true });

  const measurement = {
    measuredAt: new Date().toISOString(),
    set: "113-narrated-video-walkthroughs",
    session: 5,
    step: "5 - build the container and measure what it costs",
    criteriaSha256: sha256(CRITERIA_PATH),
    podmanExe: PODMAN,
    podmanVersion: (podman(["--version"]).stdout || "").trim(),
    scratchDir,
    machineStateOnEntry: machineState(),
    image: IMAGE,
    capturer,
    display: WIDTH + "x" + HEIGHT,
    recordSeconds: RECORD_SECONDS,
    runs: [],
  };

  // EVERY dependency failure from here on degrades: the manifest is written,
  // the post-capture step runs, and the process exits 0 with no video.
  let cold;
  let warm;
  try {
    if (!fs.existsSync(PODMAN)) {
      const err = new Error(
        "container dependency unavailable: podman executable not found at " + PODMAN
      );
      err.dependencyUnavailable = true;
      throw err;
    }
    cold = buildImage(measurement, { cold: true });
    warm = buildImage(measurement, { cold: false });
  } catch (err) {
    const why = String(err && err.message ? err.message : err);
    log("DEGRADED: " + why);
    // PERFORM it, then record only what it produced.
    const indexPath = performPostCaptureStep(scratchDir, { degraded: true, dependency: why });
    writeManifest(scratchDir, {
      artifacts: [],
      degraded: true,
      dependency: why,
      completed: true,
      postCaptureArtifact: path.basename(indexPath),
    });
    measurement.degraded = { reason: why };
    fs.writeFileSync(
      path.join(scratchDir, "measurement-degraded.json"),
      JSON.stringify(measurement, null, 2) + "\n",
      "utf8"
    );
    log("walkthrough completed without a video (criterion I5)");
    return;
  }
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

  // THREE SEPARATE CONSECUTIVE CLEAN RUNS ...
  for (let i = 1; i <= runsWanted; i += 1) {
    await oneRun(i, "target", capturer, measurement);
  }
  // ... AND THEN, distinctly, one run interrupted while capture is active.
  // It is not one of the three, and the verdict excludes it from the clean
  // count -- the previous version marked the third run with an error and
  // still counted it, which inflated `cleanRunsObserved` to 3.
  await oneRun(runsWanted + 1, "interrupt", capturer, measurement);

  const firstTarget = measurement.runs.find(
    (r) => r.mode === "target" && !r.error && !r.interrupted
  );
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
  const controlFrame = path.join(scratchDir, control.name, "frames", "f005.png");
  if (fs.existsSync(controlFrame)) {
    const decoyGray = grayscaleGrid(decodePng(fs.readFileSync(controlFrame)), 32);
    for (const runRec of measurement.runs.filter((r) => r.mode === "target")) {
      const insidePath = path.join(scratchDir, runRec.name, "inside.png");
      if (!fs.existsSync(insidePath)) continue;
      const insideGray = grayscaleGrid(decodePng(fs.readFileSync(insidePath)), 32);
      runRec.analysis.decoyCorrelation = correlate(insideGray, decoyGray);
    }
  }

  if (!isVariantChild) inducedVariants(measurement);

  measurement.machineStateOnExit = machineState();
  measurement.machineLeftInEntryState =
    measurement.machineStateOnExit === measurement.machineStateOnEntry;
  measurement.harnessContainersLeftBehind = harnessContainerNames();

  const okRuns = measurement.runs.filter((r) => !r.interrupted && !r.error);
  const indexPath = performPostCaptureStep(scratchDir, {
    degraded: false,
    runs: okRuns.length,
  });
  writeManifest(scratchDir, {
    artifacts: okRuns.map((r) => ({ kind: "container-video", run: r.name })),
    degraded: false,
    dependency: null,
    completed: true,
    postCaptureArtifact: path.basename(indexPath),
  });

  if (!isVariantChild) {
    fs.writeFileSync(OUT_PATH, JSON.stringify(measurement, null, 2) + "\n", "utf8");
    log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
  }
}

main().catch((err) => {
  console.error("[container-isolation] " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
