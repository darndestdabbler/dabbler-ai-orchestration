#!/usr/bin/env node
// Long-form, human-driven capture of a REAL Dabbler session (Set 113
// Session 8, step 3).
//
// Session 7's step 3 owed this harness and could not build it, because the
// only backend available could not put a cursor in the frame (residual
// S7-R2). It is built here, on the backend Session 8 measured.
//
// WHAT MAKES THIS DIFFERENT FROM EVERY OTHER RECORDER IN THIS REPO
//
// Sessions 2-4 drive the product with Playwright through an authored step
// list, in tens of seconds, in an Extension Development Host. This records a
// PERSON doing real work over minutes, in the SHIPPED product. The capture
// backend is the same; the driver is gone, because the driver is a human.
//
// THE CONTRACT, AND IT IS THE WHOLE DESIGN: IT OBSERVES AND NOTHING MORE.
//
// The spec's words are "it must not write to `session-state.json`, drive the
// orchestrator, or make a session behave differently because it is being
// recorded." That is not a warning attached to this file, it is the reason
// several obvious features are absent, and each absence is deliberate:
//
//   - It never calls `start_session`, `close_session`, or any other router
//     entry point. It is started BEFORE the session and stopped AFTER it, by
//     the operator, as two separate commands. A recorder that wrapped the
//     session would own the session's exit code, and a recording failure
//     would become a session failure.
//   - It writes nothing outside its own run directory. Not the state file,
//     not the activity log, not the events ledger.
//   - It does NOT raise, focus, resize, pin or set always-on-top on the
//     window it records. The pointer work in `pointer.js` may take over the
//     operator's mouse; this may not touch it at all. The only thing it does
//     to the desktop is READ window geometry.
//   - It fails by DEGRADING. A capture that cannot start prints why and
//     exits non-zero BEFORE the session begins, so the operator finds out at
//     a moment when re-running is cheap -- never half way through an hour of
//     work.
//
// WHY THE OCCLUSION GUARD STAYS ON HERE, AT THE COST OF LOSING TAILS
//
// gdigrab reads the composited desktop, so a notification toast that appears
// over the window IS IN THE VIDEO. These recordings are destined for a
// public URL. So the guard aborts, keeps everything recorded up to that
// instant, and names what covered the frame -- because the alternative is a
// finished recording that has to be thrown away at the publication safety
// pass anyway, discovered later and by a human.
//
// Output is ASCII-only (L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  GdigrabCaptureSession,
  CaptureIntegrityError,
} = require("./gdigrab-capture.js");
// The SAME gate the shipped walkthrough recorder consults. Wiring it in here
// is not belt-and-braces: this file is a SECOND recorder, and a gate that one
// recorder honours and another ignores is decorative. A failed pilot ships no
// recorder -- including this one.
const { captureApproval } = require("./record-vscode-walkthrough.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const RUN_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs", "long-form");

function log(msg) {
  console.log("[long-form] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The SHIPPED product's window, and deliberately not the Extension
 * Development Host.
 *
 * This is the inverse of every other matcher in this repo, and the inversion
 * is the point: the operator is driving the extension they installed, not a
 * debug host. Session 4 found eleven candidate windows of which two were
 * `Code.exe`, so "a VS Code window" is not specific enough to record
 * unattended -- the ambiguity refusal in `configure()` is what stands
 * between this and a recording of the wrong editor.
 *
 * `titleContains` exists because the refusal is otherwise a DEAD END on a
 * real desktop. Measured while building this: the operator had THREE shipped
 * VS Code windows open, which is normal, and the harness could not record
 * any of them. Refusing to guess is right; refusing and offering no way to
 * say which is just broken. The filter narrows the candidates BEFORE the
 * ambiguity check, so it disambiguates and never silently picks.
 */
function shippedVsCodeMatch(candidate, titleContains) {
  const name = String(candidate.name || "").toLowerCase();
  if (!name.includes("[code.exe]")) return false;
  if (name.includes("[extension development host]")) return false;
  if (titleContains && !name.includes(String(titleContains).toLowerCase())) {
    return false;
  }
  return true;
}

function runDir(setSlug, sessionNumber) {
  return path.join(
    RUN_ROOT,
    setSlug + "-session-" + String(sessionNumber).padStart(2, "0")
  );
}

function statePath(dir) {
  return path.join(dir, "capture-state.json");
}

function stopSentinel(dir) {
  return path.join(dir, "STOP");
}

function resultPath(dir) {
  return path.join(dir, "capture-result.json");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------ daemon

/**
 * The recording process itself. Detached, so it outlives the shell that
 * started it and survives the whole session.
 */
async function daemon(args) {
  const dir = args.dir;
  const session = new GdigrabCaptureSession({
    tag: args.basename,
    outDir: dir,
    // Never off here. The measurement harness turns the guards off to run
    // its falsifiers; a recording destined for publication does not.
    occlusionGuard: true,
    windowFollowGuard: true,
  });

  const state = {
    phase: "starting",
    pid: process.pid,
    runDir: path.relative(REPO_ROOT, dir),
    set: args.set,
    session: args.session,
    startedAtIso: null,
    error: null,
  };
  fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2), "utf8");

  try {
    session.prepareHost();
    const configured = await session.configure({
      outDir: dir,
      basename: args.basename,
      windowMatch: (c) => shippedVsCodeMatch(c, args.titleContains),
    });
    const anchor = await session.startRecording();
    state.phase = "recording";
    // ISO, because that is what `speed_ramp plan --recording-start` reads.
    state.startedAtIso = new Date(anchor.anchorMillis).toISOString();
    state.anchor = anchor;
    state.window = configured.chosenWindow;
    state.rect = configured.rect;
    state.outputPath = path.relative(REPO_ROOT, session.outputPath);
    fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2), "utf8");

    // Wait for the operator's `stop`, or for a guard to abort. Polling a
    // sentinel FILE rather than listening on a signal or a socket is
    // deliberate: it survives a closed terminal, a different shell, and a
    // reboot of the tooling around it, and it leaves a readable trace of
    // when the stop was requested.
    while (!fs.existsSync(stopSentinel(dir))) {
      if (session.integrity.aborted) break;
      await sleep(400);
    }

    const rec = await session.stopRecording();
    state.phase = session.integrity.aborted ? "aborted" : "stopped";
    state.stoppedAtIso = new Date().toISOString();
    fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2), "utf8");
    fs.writeFileSync(
      resultPath(dir),
      JSON.stringify(
        {
          ...rec,
          set: args.set,
          session: args.session,
          startedAtIso: state.startedAtIso,
          stoppedAtIso: state.stoppedAtIso,
          window: state.window,
          rect: state.rect,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch (err) {
    state.phase = "failed";
    state.error = {
      kind: (err && err.kind) || null,
      message: String((err && err.message) || err),
      detail: err instanceof CaptureIntegrityError ? err.detail : null,
    };
    fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2), "utf8");
    fs.writeFileSync(
      resultPath(dir),
      JSON.stringify({ failed: true, error: state.error }, null, 2) + "\n",
      "utf8"
    );
  } finally {
    await session.cleanup();
  }
}

// ------------------------------------------------------------------- start

async function start(opts) {
  // FAIL CLOSED, before anything is launched or recorded. This backend's
  // measurement is Session 8's, not Session 4's -- see `captureApproval`.
  const approval = captureApproval("gdigrab");
  if (!approval.approved) {
    log("REFUSING to capture: " + approval.reason + ".");
    log(
      "  A failed measurement ships no recorder, and this harness is a " +
        "recorder. See docs/session-sets/113-narrated-video-walkthroughs/" +
        "s8-gdigrab-outcome.md for what was measured and what is unresolved."
    );
    log(
      "  To approve capture: record an operator waiver at docs/session-sets/" +
        "113-narrated-video-walkthroughs/" + approval.waiverPath +
        ' ({"waivedBy": "...", "attestation": "..."}), or re-measure to a ' +
        "PASS verdict."
    );
    return 2;
  }
  log("capture approved: " + approval.reason + ".");

  const dir = runDir(opts.set, opts.session);
  if (fs.existsSync(statePath(dir))) {
    const existing = readJson(statePath(dir));
    if (existing && existing.phase === "recording") {
      log(
        "REFUSING to start: a recording for " +
          opts.set +
          " session " +
          opts.session +
          " is already live (pid " +
          existing.pid +
          "). Stop it first."
      );
      return 2;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const basename = opts.set + "-session-" + String(opts.session).padStart(2, "0");
  const logFile = fs.openSync(path.join(dir, "daemon.log"), "a");
  const child = cp.spawn(
    process.execPath,
    [
      __filename,
      "__daemon",
      "--dir",
      dir,
      "--set",
      opts.set,
      "--session",
      String(opts.session),
      "--basename",
      basename,
      ...(opts.titleContains
        ? ["--window-title-contains", opts.titleContains]
        : []),
    ],
    { detached: true, stdio: ["ignore", logFile, logFile] }
  );
  child.unref();

  // Report the outcome BEFORE the session begins. An operator who learns at
  // the end of an hour that nothing was captured has lost the hour.
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const state = readJson(statePath(dir));
    if (state && state.phase === "recording") {
      log("RECORDING " + state.window.name);
      log("  rect      " + JSON.stringify(state.rect));
      log("  output    " + state.outputPath);
      log("  started   " + state.startedAtIso);
      log(
        "  Leave this window where it is. It is captured as a fixed desktop " +
          "rectangle, so moving it, resizing it, or letting another window " +
          "cover it ends the recording (the footage up to that point is kept)."
      );
      log("  Stop with: node scripts/record-long-form.js stop --set " +
        opts.set + " --session " + opts.session);
      return 0;
    }
    if (state && (state.phase === "failed" || state.phase === "aborted")) {
      log("FAILED TO START: " + (state.error && state.error.message));
      if (state.error && state.error.kind === "ambiguous-window-match") {
        log(
          "  More than one shipped VS Code window is open. Close the ones " +
            "you are not recording, or this would have recorded whichever " +
            "the OS listed first."
        );
      }
      return 2;
    }
    await sleep(300);
  }
  log("FAILED TO START: the capture daemon never reported itself recording.");
  return 2;
}

// -------------------------------------------------------------------- stop

async function stop(opts) {
  const dir = runDir(opts.set, opts.session);
  const state = readJson(statePath(dir));
  if (!state) {
    log("nothing to stop: no capture state at " + path.relative(REPO_ROOT, dir));
    return 2;
  }
  fs.writeFileSync(stopSentinel(dir), new Date().toISOString(), "utf8");

  const deadline = Date.now() + 60000;
  let result = null;
  while (Date.now() < deadline) {
    result = readJson(resultPath(dir));
    if (result) break;
    await sleep(400);
  }
  if (!result) {
    log("the capture daemon did not finish within 60s; leaving it alone.");
    return 2;
  }
  if (result.failed) {
    log("the recording failed: " + (result.error && result.error.message));
    return 2;
  }

  const raw = result.outputPath || "";
  // `stopRecording()` returns an ABSOLUTE path. Joining that onto REPO_ROOT
  // produces "C:\repo\C:\repo\..." rather than an error, so the check is
  // explicit.
  const absolute = path.isAbsolute(raw) ? raw : path.join(REPO_ROOT, raw);
  if (!fs.existsSync(absolute)) {
    log("the recording finished but no file is at " + absolute);
    return 2;
  }
  log(
    "stopped. " +
      ((result.durationMillis || 0) / 1000).toFixed(1) +
      "s at " +
      absolute
  );
  if (result.integrity && result.integrity.aborted) {
    log(
      "  THE RECORDING WAS CUT SHORT (" +
        result.integrity.reason +
        "): " +
        result.integrity.message
    );
    log(
      "  Everything before that instant is in the file. Everything after it " +
        "would have been the wrong pixels."
    );
  }
  if (result.hasAudioTrack) {
    log("  WARNING: the file carries an audio track, which it should not.");
  }

  if (opts.noRamp) {
    log("speed ramp skipped (--no-ramp)");
    return 0;
  }
  return applyRamp(opts, dir, result, absolute);
}

/**
 * The post-processing step: derive which stretches were waiting from the
 * framework's OWN record, and compress those and nothing else.
 *
 * `--recording` is passed deliberately. Without it the plan is built from
 * the event stream alone, and the event stream is SPARSE -- it cannot see a
 * person reading a static screen, which is exactly the interval a naive
 * compressor would speed up and a viewer would need. With it, the ramp
 * samples the video for movement as well.
 */
function applyRamp(opts, dir, result, video) {
  const python = pythonInterpreter();
  if (!python) {
    log(
      "speed ramp skipped: no workspace interpreter found (.venv). Run " +
        "`python -m ai_router.speed_ramp plan` by hand against " +
        path.relative(REPO_ROOT, dir) + "."
    );
    return 0;
  }
  const setDir = opts.sessionSetDir || path.join("docs", "session-sets", opts.set);
  const planPath = path.join(dir, "speed-ramp-plan.json");
  const plan = cp.spawnSync(
    python,
    [
      "-m",
      "ai_router.speed_ramp",
      "plan",
      "--session-set-dir",
      setDir,
      "--session",
      String(opts.session),
      "--recording-start",
      result.startedAtIso,
      "--recording",
      video,
      "--out",
      planPath,
    ],
    { cwd: REPO_ROOT, encoding: "buffer" }
  );
  if (plan.status !== 0) {
    log(
      "speed ramp plan failed: " +
        (plan.stderr ? plan.stderr.toString("utf8").trim().split("\n").slice(-3).join(" | ") : "")
    );
    log("  The raw recording is unaffected and is still at " + video);
    return 0;
  }
  const rampedPath = video.replace(/\.mp4$/i, "-ramped.mp4");
  const applied = cp.spawnSync(
    python,
    [
      "-m",
      "ai_router.speed_ramp",
      "apply",
      "--plan",
      planPath,
      "--input",
      video,
      "--output",
      rampedPath,
    ],
    { cwd: REPO_ROOT, encoding: "buffer" }
  );
  if (applied.status !== 0) {
    log(
      "speed ramp apply failed: " +
        (applied.stderr ? applied.stderr.toString("utf8").trim().split("\n").slice(-3).join(" | ") : "")
    );
    log("  The raw recording is unaffected and is still at " + video);
    return 0;
  }
  log("speed ramp applied -> " + rampedPath);
  log("  plan (segments and rates, reviewable and regenerable): " + planPath);
  return 0;
}

/** The workspace interpreter, which is what carries `ai_router`. */
function pythonInterpreter() {
  const candidates = [
    path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
    path.join(REPO_ROOT, ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ------------------------------------------------------------------ status

function status(opts) {
  const dir = runDir(opts.set, opts.session);
  const state = readJson(statePath(dir));
  if (!state) {
    log("no capture state for " + opts.set + " session " + opts.session);
    return 1;
  }
  log(JSON.stringify(state, null, 2));
  return 0;
}

// -------------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { set: null, session: null, sessionSetDir: null, noRamp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--set") opts.set = argv[++i];
    else if (arg === "--session") opts.session = Number(argv[++i]);
    else if (arg === "--session-set-dir") opts.sessionSetDir = argv[++i];
    else if (arg === "--no-ramp") opts.noRamp = true;
    else if (arg === "--dir") opts.dir = argv[++i];
    else if (arg === "--basename") opts.basename = argv[++i];
    else if (arg === "--window-title-contains") opts.titleContains = argv[++i];
    else throw new Error("unrecognised argument: " + arg);
  }
  return opts;
}

const USAGE = [
  "usage:",
  "  node scripts/record-long-form.js start  --set <slug> --session <N>",
  "         [--window-title-contains <substring>]   disambiguate when several",
  "                                                 VS Code windows are open",
  "  node scripts/record-long-form.js stop   --set <slug> --session <N> [--no-ramp]",
  "  node scripts/record-long-form.js status --set <slug> --session <N>",
  "",
  "Start it BEFORE `start_session` and stop it AFTER `close_session`. It",
  "records the SHIPPED VS Code window, never the Extension Development Host,",
  "and it observes only: it writes nothing outside its own run directory and",
  "never touches session-state.json or the orchestrator.",
].join("\n");

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return 0;
  }
  const opts = parseArgs(rest);
  if (command === "__daemon") {
    await daemon({
      dir: opts.dir,
      set: opts.set,
      session: opts.session,
      basename: opts.basename,
      titleContains: opts.titleContains,
    });
    return 0;
  }
  if (!opts.set || !opts.session) {
    console.log(USAGE);
    return 2;
  }
  if (command === "start") return start(opts);
  if (command === "stop") return stop(opts);
  if (command === "status") return status(opts);
  console.log(USAGE);
  return 2;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code || 0;
    })
    .catch((err) => {
      console.error("[long-form] failed: " + ((err && err.stack) || err));
      process.exitCode = 1;
    });
}

module.exports = { shippedVsCodeMatch, runDir };
