// Set 114 Session 3 — the Layer 3 spec for the Work Explorer's FIFTH
// level: an in-flight session's steps, painted in a real extension host.
//
// Why these scenarios and not more. The row CONTENT — which rows exist, in
// what order, with what status, and which one is current — is proven
// row-for-row against the Python implementation by the cross-language
// corpus (`ai_router/tests/fixtures/session-step-parity.json`, asserted by
// `sessionStepModel.test.ts` and `test_step_row_parity.py`), and the tree
// SHAPE contract is proven at Layer 2 in `workExplorerTreeModel.test.ts`.
// Re-asserting either here would buy nothing at ~40 seconds a run.
//
// What only a real host can show is what an operator would actually
// report: that the twisty exists on the row that has steps and is ABSENT
// on the rows that do not, that the step labels and the `<- here` marker
// are painted, and — the one this session's step 3 is really about — that
// the list FOLLOWS THE LEDGER when the ledger changes underneath it,
// rather than freezing at whatever it showed when the panel was opened.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  LaunchedVSCode,
  launchVSCode,
  makeActivity,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  revealSetRow,
  startSession,
  treeRow,
  treeRows,
  triggerRefresh,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

async function teardown(per: PerTest): Promise<void> {
  if (per.launch) {
    try {
      await closeVSCode(per.launch);
    } catch {
      /* best effort */
    }
  }
  if (per.tmpPath) cleanupTmpDir(per.tmpPath);
}

test.describe("Set 114 S3 — an in-flight session's steps in the tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("the in-flight session expands to its plan, with the current step marked", async () => {
    per.tmpPath = makeTmpDir("dabbler-steps-expand");
    // `withSessionSteps` gives the fixture spec a numbered step list, so
    // `start_session` seeds the plan the same way it does in a real repo.
    const h = makeSet(per.tmpPath, "114-live-session", 2, { withSessionSteps: true });
    startSession(h, 1);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "114-live-session" });
    await expandTreeRow(pane, "114-live-session");

    const session = treeRow(pane, "Fixture session 1");
    await expect(session).toBeVisible();
    await expect(session).toContainText("in flight");
    // The fifth level is LAZY: nothing under the session row exists until
    // it is expanded, which is the same contract every other level keeps.
    await expect(treeRow(pane, "Register")).toHaveCount(0);

    await expandTreeRow(pane, "Fixture session 1");

    // All three seeded steps, in spec order — the forward view Set 114 S2
    // put in the ledger, now on screen without the operator running a
    // terminal command.
    await expect(treeRow(pane, "Register")).toBeVisible();
    await expect(treeRow(pane, "Build the thing")).toBeVisible();
    await expect(treeRow(pane, "Verify close")).toBeVisible();

    // Exactly one row says where the session is. A checklist that shows
    // only what is done answers half the question.
    await expect(treeRows(pane).filter({ hasText: "<- here" })).toHaveCount(1);
    await expect(treeRow(pane, "Register")).toContainText("<- here");
  });

  test("a session with no steps to show is a leaf, not a dead twisty", async () => {
    // A twisty that opens onto nothing is what an operator reports as a
    // stall — the same rule an empty bucket and a ledger-less set row
    // already follow. Here the whole SET is not in flight, so no session
    // row has steps.
    per.tmpPath = makeTmpDir("dabbler-steps-leaf");
    const h = makeSet(per.tmpPath, "114-not-started", 2, { withSessionSteps: true });

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "Not Started", set: "114-not-started" });
    await expandTreeRow(pane, "114-not-started");

    // VS Code emits no `aria-expanded` at all on a row whose collapsible
    // state is None, which is how a leaf is distinguishable from a
    // collapsed parent in the rendered DOM.
    await expect(treeRow(pane, "Fixture session 1")).not.toHaveAttribute(
      "aria-expanded",
      /.*/,
    );
  });

  test("the step list follows the ledger when the ledger changes", async () => {
    // Session 3's step 3, and the assertion no unit test can make: the
    // panel is open, the operator does not touch it, a step is logged, and
    // the tree must show it rather than the list it painted a minute ago.
    per.tmpPath = makeTmpDir("dabbler-steps-refresh");
    const h = makeSet(per.tmpPath, "114-live-refresh", 2, { withSessionSteps: true });
    startSession(h, 1);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "114-live-refresh" });
    await expandTreeRow(pane, "114-live-refresh");
    await expandTreeRow(pane, "Fixture session 1");
    await expect(treeRow(pane, "Register")).toContainText("<- here");

    // A real logged step lands in `activity-log.json` — written by the
    // shipping fixture path, not hand-rolled. It is logged as the spec's
    // step 2 and still in progress, so it CLAIMS the second planned row
    // (the plan owns the position, the logged step owns the content)
    // rather than appending beside it.
    makeActivity(h, 1, {
      stepNumber: 2,
      stepKey: "building-the-thing",
      status: "in-progress",
      description: "Halfway through building the thing.",
    });
    await triggerRefresh(per.launch.page);

    // The planned row's spec wording is replaced by the real step's own...
    const logged = treeRow(pane, "Building the thing");
    await expect(logged).toBeVisible({ timeout: 15_000 });
    await expect(treeRow(pane, "Build the thing")).toHaveCount(0);
    // ...and the marker MOVES onto it, because the first unfinished
    // LOGGED step is where the session is. A tree frozen at the list it
    // painted a minute ago would still be pointing at "Register".
    await expect(logged).toContainText("<- here");
    await expect(treeRows(pane).filter({ hasText: "<- here" })).toHaveCount(1);
    await expect(treeRow(pane, "Register")).not.toContainText("<- here");
    // Nothing was dropped in either direction, and expansion survived the
    // refresh: stable row ids, proven in the host.
    await expect(treeRow(pane, "Verify close")).toBeVisible();
  });
});
