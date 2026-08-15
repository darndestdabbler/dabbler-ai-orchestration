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

const { chromium, expect } = require("@playwright/test");
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

// How long a step's expected result may take to appear. Generous: it is
// a ceiling on a real application's round trip, not a pacing knob, and a
// step that genuinely fails still fails -- just later and with a message
// that says what was on screen instead.
const EXPECT_TIMEOUT_MS = 15_000;

// The failure-path read of what was actually on screen. Short on
// purpose: by the time it runs, the wait has already run out.
const DIAGNOSTIC_READ_MS = 1_000;

function log(msg) {
  console.log(`[walkthrough:web] ${msg}`);
}

/**
 * An interpreter that can import `ai_router`.
 *
 * NOT "the repository's .venv". This recorder is meant to be inherited by
 * consumer repositories, which install `dabbler-ai-router` from PyPI and
 * may have no repo-local virtualenv at all -- so requiring one would make
 * the recorder work in exactly one checkout: this one. The development
 * venv is preferred when present, and an interpreter on PATH is accepted
 * when it can actually import the package, which is the thing that
 * matters. Verified rather than assumed: a `python` that exists and
 * cannot import `ai_router` fails later, further away, with a worse
 * message.
 */
let cachedInterpreter;
function venvPython() {
  if (cachedInterpreter) return cachedInterpreter;

  const candidates = [];
  if (process.env.DABBLER_PYTHON) candidates.push(process.env.DABBLER_PYTHON);
  candidates.push(
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python")
  );
  candidates.push("python3", "python");

  for (const candidate of candidates) {
    const probe = cp.spawnSync(candidate, ["-c", "import ai_router"], {
      encoding: "utf8",
    });
    if (!probe.error && probe.status === 0) {
      cachedInterpreter = candidate;
      return candidate;
    }
  }

  throw new Error(
    "no Python interpreter that can import `ai_router` was found. This " +
      "recorder reads the scenario through `python -m " +
      "ai_router.walkthrough_run` rather than parsing YAML itself, so it " +
      "needs one. Tried: " +
      candidates.join(", ") +
      ". Fix it with `pip install dabbler-ai-router` (or `pip install -e .` " +
      "in a checkout of dabbler-ai-orchestration), or point DABBLER_PYTHON " +
      "at the interpreter you want used."
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
  const valueFor = (flag, index) => {
    const value = argv[index];
    // A flag whose value was forgotten used to become `undefined` and
    // travel all the way to a spawn() call, which fails much later with a
    // message about argument types rather than about the typo.
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`'${flag}' needs a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") options.scenario = valueFor(arg, ++index);
    else if (arg === "--out") options.out = valueFor(arg, ++index);
    else if (arg === "--url") options.url = valueFor(arg, ++index);
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

async function applyEmphasis(page, selector, style) {
  await page.evaluate(({ target, css }) => {
    // Re-inject if missing. `addStyleTag` is per-document, so ANY
    // navigation drops it -- and a consumer application has more than one
    // page. Without this the emphasis silently stops working after the
    // first link, which looks like a recorder that never emphasises
    // anything rather than like a defect.
    if (!document.getElementById("dabbler-emphasis-style")) {
      const tag = document.createElement("style");
      tag.id = "dabbler-emphasis-style";
      tag.textContent = css;
      document.head.appendChild(tag);
    }
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
  }, { target: selector, css: style });
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

/**
 * Wait, up to a bounded timeout, for the step's expected result.
 *
 * This POLLS rather than taking one snapshot, and the difference is the
 * whole cross-platform claim. The fixture updates synchronously, so a
 * single read happens to work against it -- but the applications this
 * recorder advertises (.NET, Java, Python, SPA front ends) update after a
 * round trip, and `page.click()` returns before that lands. A snapshot
 * would read the PREVIOUS value, mark the step failed and stop the
 * scenario, on exactly the targets the recorder exists for.
 */
async function assertExpectation(page, expectation, timeoutMs) {
  const budget = timeoutMs === undefined ? EXPECT_TIMEOUT_MS : timeoutMs;
  const locator = page.locator(expectation.selector).first();
  try {
    if (expectation.text) {
      await expect(locator).toContainText(expectation.text, {
        timeout: budget,
      });
    } else {
      await locator.waitFor({ state: "visible", timeout: budget });
    }
  } catch (err) {
    // Playwright's own message is accurate but long. Report what the step
    // wanted and what was actually on screen when the wait ran out --
    // which is what a person reading the manifest needs.
    //
    // The diagnostic read gets its OWN short timeout, and only runs when
    // it has something to say. Without one it inherits the default and
    // spends another fifteen seconds looking for an element that has
    // already been established as absent, doubling the cost of every
    // failed step.
    if (expectation.text) {
      const actual = await locator
        .textContent({ timeout: DIAGNOSTIC_READ_MS })
        .catch(() => null);
      throw new Error(
        `expected to read "${expectation.text}" within ` +
          `${budget}ms but the page said ` +
          `"${actual === null ? "<no such element>" : actual.trim()}"`
      );
    }
    throw new Error(
      `"${expectation.selector}" never became visible within ${budget}ms`
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
    // No up-front style injection: `applyEmphasis` adds the stylesheet if
    // the document does not already have it, which is what makes it
    // survive a navigation. One injection path, not two that can disagree.

    emit({ event: "run-started", atMillis: 0 });

    let failed = false;
    for (const step of plan.steps) {
      const detail = block.steps[step.id];
      const stepStarted = Date.now();
      let bounds = null;

      if (detail.emphasize) {
        await applyEmphasis(page, detail.emphasize, EMPHASIS_STYLE);
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
  assertExpectation,
  EXPECT_TIMEOUT_MS,
};
