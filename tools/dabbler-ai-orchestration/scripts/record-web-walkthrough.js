#!/usr/bin/env node
// Browser walkthrough recorder (Set 113 Session 3).
//
//   npm run walkthrough:web
//   npm run walkthrough:web -- --scenario docs/walkthroughs/<id>
//   npm run walkthrough:web -- --url http://localhost:5173
//   npm run walkthrough:web -- --no-video      (prove the degraded path)
//
// Drives a real web UI through an authored scenario, records it, and emits
// a timestamped step-event stream plus a run manifest. One command, and
// what comes out is watchable.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO.
//
//   1. It does not parse `scenario.yaml`. This repository has exactly one
//      scenario parser, in Python, and a second one here would be a drift
//      surface with nothing to gain. `walkthrough_run plan` hands over the
//      portable steps and this driver's own quarantined block as JSON.
//   2. It does not fail the walkthrough when recording fails. The written
//      documents are the deliverable and the video is an enhancement; a
//      run that captures nothing still produces a manifest, an index and
//      a truthful account of what happened. `--no-video` exercises that
//      path on purpose.
//   3. It does not zoom. Attention emphasis is the driver's job (operator
//      ruling, 2026-08-15, tier 1): it outlines the element a step is
//      about and dims the rest, in the page, before acting. Capture-time
//      zoom was refused outright, and post-processing zoom is deferred --
//      which is why each step's bounding box is recorded even though
//      nothing reads it yet.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { chromium } = require("@playwright/test");
const { startFixtureServer, FIXTURE_ROOT } = require("./web-fixture-server.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const DEFAULT_SCENARIO = path.join(
  "docs",
  "walkthroughs",
  "task-board-first-task"
);
// Ignored output, per the spec's "no committed video binaries".
const DEFAULT_OUT_ROOT = path.join(EXTENSION_ROOT, ".walkthrough-runs");

const DRIVER_NAME = "playwright-web";
const STEP_KEYS = new Set(["emphasize", "do", "expect"]);
const ACTION_KEYS = new Set(["click", "fill", "check", "press", "value"]);

// The emphasis stylesheet lives HERE, not in the fixture page. A consumer
// pointing this at their own .NET or Java application has no way to add a
// stylesheet to it, so an emphasis that depended on the page cooperating
// would work exactly once -- on the fixture that was built to demonstrate
// it. Dimming is applied to the direct children of <body> that are neither
// the target nor an ancestor of it: opacity inherits, so dimming a
// container would dim the very thing being emphasised.
const EMPHASIS_STYLE = `
  body.dabbler-emphasis-on > *:not(.dabbler-emphasis):not(.dabbler-emphasis-branch) {
    opacity: 0.4 !important;
    transition: opacity 150ms ease-out;
  }
  body.dabbler-emphasis-on .dabbler-emphasis-branch > *:not(.dabbler-emphasis):not(.dabbler-emphasis-branch) {
    opacity: 0.4 !important;
    transition: opacity 150ms ease-out;
  }
  .dabbler-emphasis {
    outline: 3px solid #d29922 !important;
    outline-offset: 4px !important;
    border-radius: 4px;
  }
`;

// Long enough for the outline to register as a deliberate cue rather than
// a flicker, short enough that it is not what the step is about.
const EMPHASIS_SETTLE_MS = 450;

// The emphasis is RELEASED as soon as the step's actions have run, and
// never held across the result. Two reasons, and the second one was
// measured rather than reasoned:
//
//   * The result is the point. Dimming everything but the control you
//     just clicked hides the row that appeared and the count that
//     changed -- which is what the step told the reviewer to look at.
//   * Any application that re-renders on interaction destroys the
//     emphasised node, and the dimming rule is then left with nothing
//     to spare. The fixture does exactly this (its task list replaces
//     its children on every change) and the first recording came out
//     uniformly grey for the rest of that step. A framework application
//     behaves the same way, so releasing the emphasis at the end of the
//     action is the portable behaviour, not a fixture-shaped workaround.
const EMPHASIS_HOLD_MS = 1_200;

function log(msg) {
  console.log(`[walkthrough:web] ${msg}`);
}

function venvPython() {
  const interp =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(interp)) return interp;
  throw new Error(
    `no virtualenv interpreter at ${interp}. This recorder reads the ` +
      "scenario through `python -m ai_router.walkthrough_run` rather than " +
      "parsing YAML itself; run `pip install -e .` from the repository root."
  );
}

function runPython(args) {
  const result = cp.spawnSync(venvPython(), args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `python ${args.join(" ")} exited ${result.status}\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function parseArgs(argv) {
  const options = {
    scenario: DEFAULT_SCENARIO,
    out: null,
    url: null,
    video: true,
    keep: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") options.scenario = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--url") options.url = argv[++index];
    else if (arg === "--no-video") options.video = false;
    else if (arg === "--keep") options.keep = true;
    else throw new Error(`unknown argument '${arg}'`);
  }
  return options;
}

/**
 * Validate this driver's own quarantined block. The Python model treats
 * `drivers:` as opaque on purpose -- which makes validating it this
 * driver's job, not nobody's. Every refusal names the step and the fix,
 * because the alternative is a scenario that silently records fewer steps
 * than it declares.
 */
function validateDriverBlock(plan) {
  const block = plan.driverBlock;
  if (!block || typeof block !== "object") {
    throw new Error(
      `scenario '${plan.scenarioId}' has no usable '${DRIVER_NAME}' block`
    );
  }
  if (!block.fixture && !block.url) {
    throw new Error(
      `scenario '${plan.scenarioId}': the ${DRIVER_NAME} block must declare ` +
        "either 'fixture' (a bundled sample app this repo serves) or 'url' " +
        "(an address your own application is already served at)."
    );
  }
  if (block.fixture && block.url) {
    throw new Error(
      `scenario '${plan.scenarioId}': the ${DRIVER_NAME} block declares both ` +
        "'fixture' and 'url'; pick one, so which application was recorded is " +
        "never ambiguous."
    );
  }
  if (block.fixture && block.fixture !== "task-board") {
    throw new Error(
      `scenario '${plan.scenarioId}': unknown fixture '${block.fixture}'. ` +
        "This repo bundles one sample app, 'task-board'; point 'url' at your " +
        "own application instead."
    );
  }
  const steps = block.steps || {};
  for (const step of plan.steps) {
    const detail = steps[step.id];
    if (!detail) {
      throw new Error(
        `scenario '${plan.scenarioId}': step '${step.id}' has no ` +
          `${DRIVER_NAME} detail. Every authored step must be drivable, or ` +
          "the recording silently shows fewer steps than the document lists."
      );
    }
    for (const key of Object.keys(detail)) {
      if (!STEP_KEYS.has(key)) {
        throw new Error(
          `scenario '${plan.scenarioId}', step '${step.id}': unknown key ` +
            `'${key}'; expected ${[...STEP_KEYS].sort().join(", ")}.`
        );
      }
    }
    for (const action of detail.do || []) {
      for (const key of Object.keys(action)) {
        if (!ACTION_KEYS.has(key)) {
          throw new Error(
            `scenario '${plan.scenarioId}', step '${step.id}': unknown action ` +
              `'${key}'; expected ${[...ACTION_KEYS].sort().join(", ")}.`
          );
        }
      }
    }
    if (detail.expect && !detail.expect.selector) {
      throw new Error(
        `scenario '${plan.scenarioId}', step '${step.id}': 'expect' needs a ` +
          "'selector' naming what to read the result from."
      );
    }
  }
  for (const id of Object.keys(steps)) {
    if (!plan.steps.some((step) => step.id === id)) {
      throw new Error(
        `scenario '${plan.scenarioId}': the ${DRIVER_NAME} block drives step ` +
          `'${id}', which the scenario does not declare -- a rename that ` +
          "landed on one side only."
      );
    }
  }
}

async function applyEmphasis(page, selector) {
  await page.evaluate((target) => {
    const previous = document.querySelectorAll(
      ".dabbler-emphasis, .dabbler-emphasis-branch"
    );
    previous.forEach((node) => {
      node.classList.remove("dabbler-emphasis", "dabbler-emphasis-branch");
    });
    const element = document.querySelector(target);
    if (!element) return false;
    element.classList.add("dabbler-emphasis");
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      parent.classList.add("dabbler-emphasis-branch");
      parent = parent.parentElement;
    }
    document.body.classList.add("dabbler-emphasis-on");
    return true;
  }, selector);
}

async function clearEmphasis(page) {
  await page.evaluate(() => {
    document.body.classList.remove("dabbler-emphasis-on");
    document
      .querySelectorAll(".dabbler-emphasis, .dabbler-emphasis-branch")
      .forEach((node) => {
        node.classList.remove("dabbler-emphasis", "dabbler-emphasis-branch");
      });
  });
}

async function performAction(page, action) {
  if (action.click) await page.click(action.click);
  else if (action.check) await page.check(action.check);
  else if (action.fill) await page.fill(action.fill, String(action.value ?? ""));
  else if (action.press) await page.press(action.press, String(action.value ?? ""));
  else throw new Error(`action names no verb: ${JSON.stringify(action)}`);
}

async function assertExpectation(page, expectation) {
  const text = (await page.textContent(expectation.selector)) || "";
  if (expectation.text && !text.includes(expectation.text)) {
    throw new Error(
      `expected to read "${expectation.text}" but the page said "${text.trim()}"`
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const planJson = runPython([
    "-m",
    "ai_router.walkthrough_run",
    "plan",
    options.scenario,
    "--driver",
    DRIVER_NAME,
  ]);
  const plan = JSON.parse(planJson);
  validateDriverBlock(plan);
  const block = plan.driverBlock;

  const outDir = path.resolve(
    options.out || path.join(DEFAULT_OUT_ROOT, plan.scenarioId)
  );
  // One output directory is exactly one run, never a merge of two: a
  // stale video left behind by a previous attempt would otherwise be
  // listed by this run's manifest as though this run had produced it.
  //
  // So the directory is emptied first -- which makes `--out` a recursive
  // delete pointed at a path from the command line, and that is worth
  // being careful about. It is refused unless the directory is absent,
  // empty, or recognisably a previous run of this recorder.
  if (fs.existsSync(outDir)) {
    const existing = fs.readdirSync(outDir);
    const isPriorRun =
      existing.includes("driver-output.json") || existing.includes("events.jsonl");
    if (existing.length > 0 && !isPriorRun) {
      throw new Error(
        `refusing to use ${outDir}: it already has files in it and none of ` +
          "them are from a previous walkthrough run. This recorder empties " +
          "its output directory before every run, so point --out at a new or " +
          "empty directory."
      );
    }
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const videoScratch = options.video
    ? fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-walkthrough-video-"))
    : null;
  const eventsPath = path.join(outDir, "events.jsonl");
  const eventsStream = fs.createWriteStream(eventsPath, { encoding: "utf8" });

  let server = null;
  let browser = null;
  let context = null;
  let anchorMillis = 0;
  const notes = [];
  const artifacts = [];
  let usable = false;

  let eventsClosed = false;
  const emit = (payload) => {
    if (eventsClosed) return;
    eventsStream.write(JSON.stringify(payload) + "\n");
  };
  // end() on an already-ended stream raises ERR_STREAM_ALREADY_FINISHED,
  // and both the happy path and the cleanup path want to close it.
  const closeEvents = () =>
    new Promise((resolve) => {
      if (eventsClosed) return resolve();
      eventsClosed = true;
      eventsStream.end(resolve);
    });
  const since = () => Date.now() - anchorMillis;

  try {
    let url = options.url || block.url;
    if (!url) {
      server = await startFixtureServer(FIXTURE_ROOT);
      url = server.url;
      log(`serving the bundled '${block.fixture}' fixture at ${url}`);
    } else {
      log(`driving ${url}`);
    }

    const viewport = block.viewport || { width: 1280, height: 800 };
    browser = await chromium.launch();

    // Recording starts inside newContext() and nothing reports the exact
    // instant. Bracket the call: t0 is the far edge (so a cue never fires
    // before the thing it describes) and the width of the bracket is
    // carried into the manifest as the honest accuracy of every cue time.
    const beforeContext = Date.now();
    context = await browser.newContext({
      viewport,
      ...(options.video
        ? { recordVideo: { dir: videoScratch, size: viewport } }
        : {}),
    });
    const afterContext = Date.now();
    anchorMillis = afterContext;
    const anchor = {
      basis: options.video
        ? "the browser context being created, which is when recording begins"
        : "the browser context being created",
      uncertaintyMillis: afterContext - beforeContext,
    };

    const startedAt = new Date().toISOString();
    const page = await context.newPage();
    await page.goto(url);
    await page.addStyleTag({ content: EMPHASIS_STYLE });

    emit({ event: "run-started", atMillis: 0 });

    let failed = false;
    for (const step of plan.steps) {
      const detail = block.steps[step.id];
      const stepStarted = Date.now();
      let bounds = null;

      if (detail.emphasize) {
        await applyEmphasis(page, detail.emphasize);
        const box = await page
          .locator(detail.emphasize)
          .first()
          .boundingBox()
          .catch(() => null);
        if (box) {
          // Viewport CSS pixels. The recording is captured at the viewport
          // size, so these are directly usable as video coordinates -- which
          // is the whole reason they are worth writing down now.
          bounds = {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        }
        await page.waitForTimeout(EMPHASIS_SETTLE_MS);
      }

      emit({
        event: "started",
        stepId: step.id,
        atMillis: since(),
        ...(bounds ? { bounds } : {}),
      });

      try {
        for (const action of detail.do || []) {
          await performAction(page, action);
        }
        if (detail.emphasize) {
          const held = Date.now() - stepStarted;
          if (held < EMPHASIS_HOLD_MS) {
            await page.waitForTimeout(EMPHASIS_HOLD_MS - held);
          }
          await clearEmphasis(page);
        }
        if (detail.expect) {
          await assertExpectation(page, detail.expect);
        }
      } catch (err) {
        const message = String((err && err.message) || err);
        await clearEmphasis(page).catch(() => {});
        emit({ event: "failed", stepId: step.id, atMillis: since(), error: message });
        log(`step '${step.id}' FAILED: ${message}`);
        failed = true;
        break;
      }

      // Hold the result on screen for the time the author budgeted, so
      // the recording is watchable rather than a flicker. It is a floor,
      // not a promise: real driver latency pushes the true boundaries
      // past the authored ones, which is exactly why the captions are
      // retimed from this stream instead of from the authored seconds.
      const onScreen = Date.now() - stepStarted;
      const budget = Math.max(Number(step.seconds) || 0, 0) * 1000;
      if (onScreen < budget) await page.waitForTimeout(budget - onScreen);

      emit({ event: "completed", stepId: step.id, atMillis: since() });
    }

    emit({ event: "run-finished", atMillis: since() });
    usable = true;

    await closeEvents();

    const video = options.video ? page.video() : null;
    await context.close();
    context = null;

    if (video) {
      // saveAs() is valid only after the context closes, which is when
      // Playwright finalises the file.
      const target = path.join(outDir, "recording.webm");
      try {
        await video.saveAs(target);
        artifacts.push({
          kind: "browser-video",
          path: "recording.webm",
          mediaType: "video/webm",
          bytes: fs.statSync(target).size,
        });
      } catch (err) {
        // The spec is explicit: failure to record must never fail the
        // walkthrough. Record WHY, and carry on to a manifest that
        // honestly reports no video.
        notes.push(
          `the recording could not be saved (${String((err && err.message) || err)}); ` +
            "the walkthrough document stands alone and is unaffected"
        );
        log("recording could not be saved - continuing without it");
      }
    } else {
      notes.push(
        "run made with --no-video: recording was deliberately not requested"
      );
    }

    await browser.close();
    browser = null;

    const driverOutput = {
      scenarioId: plan.scenarioId,
      scenarioPath: plan.scenarioPath,
      portableDigest: plan.portableDigest,
      driver: DRIVER_NAME,
      target: { url, viewport: `${viewport.width}x${viewport.height}` },
      startedAt,
      finishedAt: new Date().toISOString(),
      anchor,
      artifacts,
      notes,
    };
    fs.writeFileSync(
      path.join(outDir, "driver-output.json"),
      JSON.stringify(driverOutput, null, 2) + "\n",
      "utf8"
    );

    const summary = runPython([
      "-m",
      "ai_router.walkthrough_run",
      "finalize",
      outDir,
      "--scenario",
      plan.scenarioPath,
    ]);
    process.stdout.write(summary);
    log(`open ${path.join(outDir, "index.html")}`);
    process.exitCode = failed ? 1 : 0;
  } catch (err) {
    log(`failed: ${(err && err.stack) || err}`);
    process.exitCode = 1;
  } finally {
    // Deterministic cleanup, in the order that cannot strand anything:
    // the events stream, then the browser, then the server, then the
    // scratch video directory. Each guarded, so an earlier failure never
    // prevents a later release.
    await closeEvents();
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    if (videoScratch) fs.rmSync(videoScratch, { recursive: true, force: true });
    if (!usable && !options.keep) {
      // Nothing worth keeping was produced -- not even a truthful record
      // of a failed run -- so the output directory is removed rather than
      // left as a half-written thing someone later mistakes for a result.
      fs.rmSync(outDir, { recursive: true, force: true });
      log("no usable output was produced; the run directory was removed");
    }
  }
}

// Guarded, so the unit suite can require this file for its pure parts
// without launching a browser as a side effect of the import.
if (require.main === module) {
  main().catch((err) => {
    console.error(`[walkthrough:web] failed: ${(err && err.stack) || err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DRIVER_NAME,
  STEP_KEYS,
  ACTION_KEYS,
  EMPHASIS_STYLE,
  parseArgs,
  validateDriverBlock,
};
