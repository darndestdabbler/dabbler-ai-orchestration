#!/usr/bin/env node
// Is the REAL pointer visible in a real OS capture? (Set 113 Session 7)
//
//   node scripts/measure-pointer-visibility.js
//
// A MEASUREMENT, not a recorder, and the distinction is the reason this
// file exists at all. `record-vscode-walkthrough.js` fails closed on
// capture: the Session 4 pilot's verdict is FAIL and no operator waiver is
// on file, so its CLI refuses to record and must keep refusing. The same
// gate carves out, in its own words, "pilot-only imports needed to retain
// or reproduce measurements" -- because a criterion that cannot be measured
// again is a criterion nobody can ever clear.
//
// This is one of those. Session 7's spec asks for proof in the ARTIFACT
// rather than in the code: a pointer visible in the recorded frames near
// the target at the moment of the click, plus the falsifier that the same
// check fails on a recording made with the feature off. That claim is about
// two video files, so two video files have to exist. Nothing here is
// installed, registered as an npm script, or reachable from the product.
//
// It runs the same scenario TWICE, differing in exactly one thing:
//
//   A. --physical-pointer: the real Windows pointer is walked to each
//      target before the synthesised click.
//   B. the control: identical timing, identical probe list, no pointer
//      moved. The check MUST fail on this one, on the pixels.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { recordVscodeWalkthrough } = require("./record-vscode-walkthrough.js");
const { checkRun } = require("./check-pointer-visible.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const OUT_PATH = path.join(SET_DIR, "s7-pointer-visibility-vscode.json");
const WORK_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs", "pointer-measure");

function log(msg) {
  console.log("[pointer-measure] " + msg);
}

async function runOne(label, opts) {
  const outDir = path.join(WORK_ROOT, label);
  fs.mkdirSync(WORK_ROOT, { recursive: true });
  log("recording '" + label + "' ...");
  const result = await recordVscodeWalkthrough(
    Object.assign(
      {
        out: outDir,
        keep: true,
        video: true,
        // The PILOT may enable obs-websocket, because it restores the file
        // byte for byte afterwards. The shipped recorder may not, and this
        // is a measurement run by the same rule.
        mayEnableWebsocketConfig: true,
      },
      opts
    )
  );
  return { outDir, result };
}

async function main() {
  const report = {
    measurement:
      "a pointer is visible in the frames an OS capture recorded, at the " +
      "moment of each click, and is not visible in the control",
    startedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    runs: {},
    verdict: null,
    reason: null,
  };

  if (process.platform !== "win32") {
    report.verdict = "UNMEASURED";
    report.reason = "the OS-capture path is Windows-only; this is " + process.platform;
  } else {
    // Deliberately sequential. Two OBS sessions on one machine contend for
    // the same websocket and the same encoder, and the pilot already
    // measured what that costs.
    const withPointer = await runOne("with-pointer", {
      physicalPointer: true,
      obsPort: 44671,
    });
    const control = await runOne("control", {
      pointerControl: true,
      obsPort: 44672,
    });

    for (const [label, run] of [
      ["withPointer", withPointer],
      ["control", control],
    ]) {
      const entry = {
        outDir: path.relative(REPO_ROOT, run.outDir),
        pointer: run.result.pointer || null,
        obs: run.result.obs || null,
        obsUnavailable: run.result.obsUnavailableKind || null,
        recording: run.result.recording
          ? { path: path.basename(run.result.recording.outputPath || "") }
          : null,
        check: null,
      };
      try {
        entry.check = checkRun({ run: run.outDir, keepFrames: false });
      } catch (err) {
        entry.check = {
          verdict: "UNMEASURED",
          reason: String((err && err.message) || err),
        };
      }
      report.runs[label] = entry;
    }

    const a = report.runs.withPointer.check || {};
    const b = report.runs.control.check || {};
    if (a.verdict === "UNMEASURED" || b.verdict === "UNMEASURED") {
      report.verdict = "UNMEASURED";
      report.reason =
        "one of the two runs produced nothing to look at (" +
        "with-pointer: " + a.verdict + " / control: " + b.verdict + "). " +
        (a.reason || b.reason || "");
    } else if (a.verdict === "PASSED" && b.verdict === "FAILED") {
      report.verdict = "PASS";
      report.reason =
        "the pointer run shows a pointer arriving at every probed target " +
        "and the control, recorded with the same timing and the same probe " +
        "list, shows one at none of them";
    } else {
      report.verdict = "FAIL";
      report.reason =
        "the check did not discriminate: with-pointer " + a.verdict +
        " (" + (a.reason || "") + "), control " + b.verdict +
        " (" + (b.reason || "") + ")";
    }
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
  log(report.verdict + ": " + report.reason);
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[pointer-measure] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { runOne };
