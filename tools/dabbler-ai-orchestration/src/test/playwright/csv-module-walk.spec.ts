// Drives the operator's walk through the staged four-module CSV solution --
// the same WALK_STEPS list docs/tutorials/csv-solution/csv-multi-module-walkthrough.md
// is rendered from, so the tutorial's claims are exactly what this spec
// proves rather than a separately maintained retelling of them.
//
// A screenshot cannot fail; the assertions inside each step's drive() are
// what make this a check rather than a picture -- the images under
// test-results/csv-module-walk/ are the evidence a person reads when one of
// them does fail.

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  closeVSCode,
  launchVSCode,
} from "./electronLaunch";
import { WALK_STEPS, paneOfReal } from "./csvWalkSteps";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const STAGER = path.join(EXTENSION_ROOT, "scripts", "stage-csv-solution.mjs");
const WORKSPACE = "C:/temp/csv-solution";
// NOT under test-results/: Playwright empties that whole directory at the
// start of every run, so a screenshot written there is destroyed by the run
// AFTER the one that produced it -- evidence that only survives until the
// suite is run again is not evidence. This directory is committed instead,
// beside the tutorial these same images illustrate.
const SHOTS_DIR = path.join(REPO_ROOT, "docs", "tutorials", "csv-solution", "media");

test.describe.configure({ mode: "serial" });

let vscode: LaunchedVSCode;

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // The corpus is staged fresh for this run, from this session's own
  // stager, so the spec is reproducible standalone rather than depending on
  // a previous step having left one behind.
  const staged = cp.spawnSync(
    process.execPath,
    [STAGER, "--root", WORKSPACE, "--reset"],
    { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true },
  );
  if (staged.status !== 0) {
    throw new Error(
      `staging the CSV corpus failed (${staged.status}): ${staged.stderr || staged.stdout}`,
    );
  }

  vscode = await launchVSCode(WORKSPACE);
  // A window wide enough that a module's description is not an ellipsis --
  // the decomposition step reads dependency counts off exactly that text.
  await vscode.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setBounds({ x: 10, y: 10, width: 1600, height: 1000 });
  });
  await vscode.page.waitForTimeout(1_000);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
});

for (const step of WALK_STEPS) {
  test(`walk: ${step.title}`, async () => {
    const failures: { name: string; saw: string }[] = [];
    await test.step(step.title, async () => {
      await step.drive({
        page: vscode.page,
        paneOf: (view) => paneOfReal(vscode.page, view),
        shoot: async (name) => {
          await vscode.page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
        },
        check: (name, ok, saw) => {
          if (!ok) failures.push({ name, saw });
        },
      });
    });
    expect(
      failures,
      failures.map((f) => `${f.name} -- saw: ${f.saw}`).join("\n"),
    ).toEqual([]);
  });
}
