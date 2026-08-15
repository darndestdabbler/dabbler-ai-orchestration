#!/usr/bin/env node
// Set 113 S3, step 2 -- the CONTROL measurement.
//
//   node scripts/measure-browser-record.js [--out <file.json>]
//
// This repo has so far measured only the FAILING case. Set 111 S4 ran the
// same VS Code launch script twice, differing only in whether Playwright's
// `recordVideo` option was passed, and recorded that passing it broke the
// automation it was supposed to record (proposal 2026-08-08, feasibility
// table: run A found a window with an empty URL and wrote no video; run B
// drove the real workbench). The spec calls that finding platform-specific
// and forbids generalising it -- so the browser claim has to be measured
// the same way rather than assumed from Playwright's documentation.
//
// So: the same driving routine, against the same fixture web app, run
// twice, differing ONLY in `recordVideo`. Run A is the one that failed on
// the workbench; if browser recording is the portable path, run A must now
// both drive the UI and write a video, and run B must drive it and write
// nothing. Anything else and Session 3's premise is wrong, which is worth
// knowing on day one rather than at close.
//
// The routine is deliberately a fixed, minimal probe rather than the
// authored scenario: a control experiment wants the two arms identical and
// boring, not representative.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { chromium } = require("@playwright/test");
const { startFixtureServer } = require("./web-fixture-server.js");

const VIDEO_SIZE = { width: 1280, height: 800 };

function log(msg) {
  console.log(`[measure-browser-record] ${msg}`);
}

/**
 * One arm of the experiment. `recordVideo` is the ONLY thing that differs.
 * Returns a plain record; it never throws, because a thrown arm is itself a
 * result worth writing down.
 */
async function runArm({ label, url, recordVideo, videoDir }) {
  const started = Date.now();
  const record = {
    arm: label,
    recordVideo: Boolean(recordVideo),
    pageUrl: null,
    uiDriven: false,
    observedText: null,
    videoWritten: false,
    videoBytes: 0,
    error: null,
    durationMs: 0,
  };

  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext(
      recordVideo ? { recordVideo: { dir: videoDir, size: VIDEO_SIZE } } : {}
    );
    const page = await context.newPage();
    await page.goto(url);
    record.pageUrl = page.url();

    // The probe: type a task, add it, read the summary back. Three real
    // interactions with real state behind them -- enough that "the
    // automation still works" is a claim about driving, not about loading.
    await page.fill("#new-task", "Measure the control");
    await page.click("#add-task");
    await page.waitForSelector(".task-title");
    record.observedText = (await page.textContent("#summary")) || null;
    record.uiDriven = record.observedText === "1 open";

    // Playwright finalises the video on context close, not on page close.
    await context.close();
    await browser.close();
    browser = null;

    if (recordVideo) {
      const files = fs
        .readdirSync(videoDir)
        .filter((name) => name.toLowerCase().endsWith(".webm"));
      if (files.length > 0) {
        const stat = fs.statSync(path.join(videoDir, files[0]));
        record.videoWritten = stat.size > 0;
        record.videoBytes = stat.size;
      }
    } else {
      record.videoWritten =
        fs.existsSync(videoDir) && fs.readdirSync(videoDir).length > 0;
    }
  } catch (err) {
    record.error = String((err && err.message) || err);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    record.durationMs = Date.now() - started;
  }
  return record;
}

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outPath = outFlag === -1 ? null : process.argv[outFlag + 1];

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-record-measure-"));
  const server = await startFixtureServer();
  log(`fixture served at ${server.url}`);

  const arms = [];
  try {
    for (const [label, recordVideo] of [
      ["A", true],
      ["B", false],
    ]) {
      const videoDir = path.join(scratch, `arm-${label}`);
      fs.mkdirSync(videoDir, { recursive: true });
      log(`arm ${label}: recordVideo ${recordVideo ? "passed" : "omitted"}`);
      const record = await runArm({
        label,
        url: server.url,
        recordVideo,
        videoDir,
      });
      arms.push(record);
    }
  } finally {
    await server.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const armA = arms.find((a) => a.arm === "A");
  const armB = arms.find((a) => a.arm === "B");
  // The premise Session 3 is built on, stated as a falsifiable condition
  // rather than a summary: recording must not cost the automation.
  const premiseHeld =
    Boolean(armA && armA.uiDriven && armA.videoWritten && !armA.error) &&
    Boolean(armB && armB.uiDriven && !armB.videoWritten && !armB.error);

  const result = {
    measurement: "browser recordVideo, with a control",
    method:
      "The same fixed probe against the same fixture web app, run twice, " +
      "differing only in whether Playwright's recordVideo option was passed. " +
      "Mirrors the Set 111 S4 experiment that measured the VS Code workbench " +
      "failure (proposal 2026-08-08).",
    fixture: "src/test/fixtures/task-board (vanilla HTML/CSS/JS over HTTP)",
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    playwright: require("@playwright/test/package.json").version,
    chromium: chromium.executablePath(),
    videoSize: VIDEO_SIZE,
    arms,
    premiseHeld,
  };

  console.log("");
  console.log("| Run | recordVideo | UI driven | video written |");
  console.log("| :-- | :-- | :-- | :-- |");
  for (const arm of arms) {
    console.log(
      `| ${arm.arm} | ${arm.recordVideo ? "passed" : "omitted"} | ` +
        `${arm.uiDriven ? "yes" : "NO"} | ` +
        `${arm.videoWritten ? `yes (${arm.videoBytes} bytes)` : "no"} |`
    );
  }
  console.log("");
  log(
    premiseHeld
      ? "PREMISE HELD: browser recording does not cost the automation."
      : "PREMISE FAILED: see the arms above before building on it."
  );

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
    log(`wrote ${outPath}`);
  }
  process.exitCode = premiseHeld ? 0 : 1;
}

main().catch((err) => {
  console.error(`[measure-browser-record] failed: ${err && err.stack}`);
  process.exitCode = 1;
});
