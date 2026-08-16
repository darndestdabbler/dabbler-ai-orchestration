#!/usr/bin/env node
// Containerised-capture isolation measurement for Set 113 Session 5, step 5.
//
//   node scripts/measure-container-isolation.js
//   node scripts/measure-container-isolation.js --runs 3
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
  path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Podman",
    "podman.exe"
  );

const IMAGE = "dabbler-capture-base:s5";
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

function podman(args, opts) {
  const res = cp.spawnSync(PODMAN, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...(opts || {}),
  });
  return {
    argv: "podman " + args.join(" "),
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
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
 * The host-side magenta window, raised and held FOREGROUND while the
 * container records. If a single one of its pixels reaches a frame captured
 * inside the container, the isolation claim is false.
 *
 * Reuses Session 4's occluder markup deliberately: same colour, same
 * structure, same detector, so the two sessions' leakage numbers are
 * comparable rather than merely similar-sounding.
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
  return { browser, page };
}

function buildImage(measurement) {
  const started = Date.now();
  const res = podman([
    "build",
    "-f",
    path.join(CONTAINERS_DIR, "Containerfile.capture-base"),
    "-t",
    IMAGE,
    CONTAINERS_DIR,
  ]);
  const elapsed = (Date.now() - started) / 1000;
  if (res.status !== 0) {
    throw new Error("image build failed:\n" + res.stderr.slice(-4000));
  }
  const inspect = podman(["image", "inspect", IMAGE, "--format", "{{.Size}}"]);
  measurement.cost = {
    imageBuildSeconds: Number(elapsed.toFixed(1)),
    imageBytes: Number((inspect.stdout || "0").trim()) || null,
    note:
      "Build time is a WARM number: the base image and apt metadata were " +
      "already local from earlier builds in this session. A cold build on a " +
      "fresh machine pays a download this does not measure, and the " +
      "difference is not estimated here because it was not observed.",
  };
  log(
    "image built in " +
      elapsed.toFixed(1) +
      "s, " +
      (measurement.cost.imageBytes / 1e6).toFixed(0) +
      " MB"
  );
}

async function oneRun(index, mode, measurement) {
  const name = "s5-run-" + mode + "-" + index;
  const runDir = path.join(SCRATCH, name);
  rmrf(runDir);
  fs.mkdirSync(runDir, { recursive: true });

  // Criterion I1, structural half: the argv is built here and asserted here.
  const runArgs = [
    "run",
    "--name",
    name,
    IMAGE,
    String(WIDTH),
    String(HEIGHT),
    String(RECORD_SECONDS),
    "/out",
    mode,
  ];
  const argvString = runArgs.join(" ");
  const structural = {
    argv: "podman " + argvString,
    forbiddenFlagsPresent: FORBIDDEN_RUN_FLAGS.filter((f) => argvString.includes(f)),
    forbiddenMountsPresent: FORBIDDEN_MOUNT_TARGETS.filter((m) =>
      argvString.includes(m)
    ),
    bindMountCount: runArgs.filter((a) => a === "-v" || a === "--volume").length,
  };

  const startedAt = Date.now();
  let marker = null;
  if (mode === "target") {
    marker = await openHostMarker();
    log("run " + index + ": host magenta marker raised and foreground");
  }

  const res = podman(runArgs);
  const wallClock = (Date.now() - startedAt) / 1000;

  if (marker) await marker.browser.close().catch(() => {});

  const facts = parseFacts(res.stdout + "\n" + res.stderr);

  // Copy the artifacts out. `podman cp` rather than a bind mount, on
  // purpose: a bind mount is a hole in the boundary this session is
  // measuring, and copying afterwards needs no hole at all.
  podman(["cp", name + ":/out/capture.mp4", path.join(runDir, "capture.mp4")]);
  podman(["cp", name + ":/out/inside.png", path.join(runDir, "inside.png")]);
  podman(["cp", name + ":/out/frames", runDir]);

  const framesDir = path.join(runDir, "frames");
  const frameFiles = fs.existsSync(framesDir)
    ? fs
        .readdirSync(framesDir)
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => path.join(framesDir, f))
    : [];

  const analysis = {
    frameCount: frameFiles.length,
    maxMagentaFraction: null,
    minCorrelationToInside: null,
    minFrameStdDev: null,
    frameDimensions: null,
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
    if (!analysis.frameDimensions) {
      analysis.frameDimensions = img.width + "x" + img.height;
    }
    const magenta = colorFraction(img, [255, 0, 255], 24);
    analysis.maxMagentaFraction = Math.max(analysis.maxMagentaFraction ?? 0, magenta);

    const gray = grayscaleGrid(img, 32);
    const sd = statsOf(gray).stdDev;
    analysis.minFrameStdDev =
      analysis.minFrameStdDev === null ? sd : Math.min(analysis.minFrameStdDev, sd);

    if (insideGray) {
      const c = correlate(gray, insideGray);
      analysis.minCorrelationToInside =
        analysis.minCorrelationToInside === null
          ? c
          : Math.min(analysis.minCorrelationToInside, c);
    }
  }

  const mp4Path = path.join(runDir, "capture.mp4");
  let tracks = null;
  if (fs.existsSync(mp4Path)) {
    try {
      tracks = mp4Tracks(mp4Path);
    } catch (err) {
      tracks = { error: String(err && err.message ? err.message : err) };
    }
  }

  // Criterion I6, measured rather than assumed: the container is removed and
  // the removal is CONFIRMED by asking podman, not by having called rm.
  const rmRes = podman(["rm", "-f", name]);
  const stillThere = podman(["ps", "-a", "--filter", "name=" + name, "--format", "{{.Names}}"]);
  const volumes = podman(["volume", "ls", "--quiet"]);

  const record = {
    index,
    mode,
    name,
    exitStatus: res.status,
    wallClockSeconds: Number(wallClock.toFixed(1)),
    facts,
    structural,
    analysis,
    tracks,
    cleanup: {
      removeStatus: rmRes.status,
      containerStillListed: (stillThere.stdout || "").trim() !== "",
      volumeCount: (volumes.stdout || "").trim() === ""
        ? 0
        : (volumes.stdout || "").trim().split(/\r?\n/).length,
    },
  };
  if (res.status !== 0) record.stderrTail = res.stderr.slice(-2000);
  measurement.runs.push(record);

  log(
    "run " +
      index +
      " (" +
      mode +
      "): exit=" +
      res.status +
      " frames=" +
      analysis.frameCount +
      " magenta=" +
      (analysis.maxMagentaFraction === null
        ? "n/a"
        : analysis.maxMagentaFraction.toFixed(6)) +
      " corr=" +
      (analysis.minCorrelationToInside === null
        ? "n/a"
        : analysis.minCorrelationToInside.toFixed(4)) +
      " sd=" +
      (analysis.minFrameStdDev === null ? "n/a" : analysis.minFrameStdDev.toFixed(2))
  );
  return record;
}

/**
 * Criterion I5. Each variant is RUN, not simulated -- Session 4's rule, and
 * the reason its C5 meant anything.
 *
 * One variant is deliberately induced differently and says so: stopping the
 * operator's Podman machine is a real change to state this harness does not
 * own, and I6 requires leaving it in its entry state. Pointing at a
 * non-existent connection produces the same class of failure (the client
 * cannot reach a machine) without taking that risk, and the substitution is
 * recorded rather than hidden.
 */
function inducedVariants(measurement) {
  const variants = [];

  const bogusExe = path.join(os.tmpdir(), "definitely-not-podman.exe");
  const r1 = cp.spawnSync(bogusExe, ["ps"], { encoding: "utf8" });
  variants.push({
    variant: "podman-executable-absent",
    induced: "invoked a path that does not exist",
    failed: r1.status !== 0 || !!r1.error,
    message: String((r1.error && r1.error.message) || r1.stderr || "").slice(0, 300),
  });

  const r2 = podman(["--connection", "definitely-not-a-connection", "ps"]);
  variants.push({
    variant: "podman-machine-unreachable",
    induced:
      "pointed the client at a non-existent connection, INSTEAD OF stopping " +
      "the operator's machine, which is state this harness does not own",
    substitutionDeclared: true,
    failed: r2.status !== 0,
    message: (r2.stderr || "").trim().slice(0, 300),
  });

  const r3 = podman(["run", "--rm", "localhost/definitely-no-such-image:s5"]);
  variants.push({
    variant: "image-absent",
    induced: "ran a tag that was never built",
    failed: r3.status !== 0,
    message: (r3.stderr || "").trim().slice(0, 300),
  });

  measurement.inducedVariants = variants;
  log(
    "induced variants: " +
      variants.filter((v) => v.failed).length +
      "/" +
      variants.length +
      " failed clearly"
  );
}

function machineState() {
  const res = podman(["machine", "list", "--format", "{{.Name}}:{{.Running}}"]);
  return (res.stdout || "").trim();
}

async function main() {
  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(
      "[container-isolation] refusing to run: " +
        CRITERIA_PATH +
        " is missing. Criteria are fixed before measurements, not after."
    );
    process.exit(2);
  }
  if (!fs.existsSync(PODMAN)) {
    console.error("[container-isolation] podman not found at " + PODMAN);
    process.exit(2);
  }

  const runsWanted = (() => {
    const i = process.argv.indexOf("--runs");
    return i >= 0 ? Number(process.argv[i + 1]) : 3;
  })();

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
    display: WIDTH + "x" + HEIGHT,
    recordSeconds: RECORD_SECONDS,
    runs: [],
  };

  buildImage(measurement);

  // The positive control FIRST. If the magenta detector cannot fire, every
  // clean leakage number afterwards is worthless -- which is exactly how
  // Session 4's C2 came to be scored FAIL on a measurement of 0.000000.
  const control = await oneRun(0, "magenta-control", measurement);
  measurement.magentaControl = {
    magentaFraction: control.analysis.maxMagentaFraction,
    fired:
      control.analysis.maxMagentaFraction !== null &&
      control.analysis.maxMagentaFraction >= 0.5,
  };
  log(
    "magenta detector control: " +
      (measurement.magentaControl.fired ? "FIRES" : "DID NOT FIRE") +
      " (" +
      Number(measurement.magentaControl.magentaFraction).toFixed(6) +
      ")"
  );

  for (let i = 1; i <= runsWanted; i += 1) {
    await oneRun(i, "target", measurement);
  }

  // The decoy control for I2: the target frames must NOT correlate with the
  // control's magenta screen. Same instrument, different content.
  const controlFrame = path.join(
    SCRATCH,
    "s5-run-magenta-control-0",
    "frames",
    "f005.png"
  );
  if (fs.existsSync(controlFrame)) {
    const decoyGray = grayscaleGrid(decodePng(fs.readFileSync(controlFrame)), 32);
    for (const run of measurement.runs.filter((r) => r.mode === "target")) {
      const insidePath = path.join(SCRATCH, run.name, "inside.png");
      if (!fs.existsSync(insidePath)) continue;
      const insideGray = grayscaleGrid(decodePng(fs.readFileSync(insidePath)), 32);
      run.analysis.decoyCorrelation = correlate(insideGray, decoyGray);
    }
  }

  inducedVariants(measurement);

  measurement.machineStateOnExit = machineState();
  measurement.machineLeftInEntryState =
    measurement.machineStateOnExit === measurement.machineStateOnEntry;

  fs.writeFileSync(OUT_PATH, JSON.stringify(measurement, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
}

main().catch((err) => {
  console.error("[container-isolation] " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
