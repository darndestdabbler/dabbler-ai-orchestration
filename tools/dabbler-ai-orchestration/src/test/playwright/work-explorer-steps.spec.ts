// Set 114 Session 3 — the Layer 3 spec for the Work Explorer's FIFTH
// level: an in-flight session's steps, painted in a real extension host.
// Extended by Set 115 Session 4 with the SIXTH: the close-out obligations
// under that same session.
//
// Why these scenarios and not more. The row CONTENT — which rows exist, in
// what order and with what status — is proven row-for-row against the
// Python implementation by the cross-language corpus
// (`ai_router/tests/fixtures/session-step-parity.json`, asserted by
// `sessionStepModel.test.ts` and `test_step_row_parity.py`), and the tree
// SHAPE contract is proven at Layer 2 in `workExplorerTreeModel.test.ts`.
// Re-asserting either here would buy nothing at ~40 seconds a run.
//
// What only a real host can show is what an operator would actually
// report: that the twisty exists on the row that has steps and is ABSENT
// on the rows that do not, that the step in flight is painted with the
// in-progress glyph (Set 115 S4 — the `<- here` marker is gone from both
// languages), that the close-out obligations the shipping Python writer
// serialized are the ones the tree renders, and — the one Set 114 S3's
// step 3 is really about — that the list FOLLOWS THE LEDGER when the
// ledger changes underneath it, rather than freezing at whatever it
// showed when the panel was opened.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  expectFileIcon,
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
  writeCloseObligations,
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

    // Set 115 S4: nothing says "here". A seeded plan is entirely pending,
    // so every row carries the not-started glyph and NO row claims to be
    // where the session is — which is the truth, and is the answer the
    // removed marker could not give (it put "<- here" on step 1 whether
    // or not anything had started).
    await expect(treeRows(pane).filter({ hasText: "<- here" })).toHaveCount(0);
    await expectFileIcon(treeRow(pane, "Register"), "not-started.svg");
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
    await expectFileIcon(treeRow(pane, "Register"), "not-started.svg");

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
    // ...and the IN-PROGRESS GLYPH lands on it, because the ledger says
    // that step is in flight. This is what replaced `<- here` (Set 120 S3
    // operator ruling, finished in both languages by Set 115 S4): the
    // signal is read from the recorded status, not inferred from which
    // row happens to be first-unfinished. A tree frozen at the list it
    // painted a minute ago would still show three not-started rows.
    await expectFileIcon(logged, "in-progress.svg");
    await expect(treeRows(pane).filter({ hasText: "<- here" })).toHaveCount(0);
    // Nothing was dropped in either direction, and expansion survived the
    // refresh: stable row ids, proven in the host.
    await expect(treeRow(pane, "Verify close")).toBeVisible();
  });

  test("the close-out obligations render under the session, from the recorded projection", async () => {
    // Set 115 S4. The projection is written by the SHIPPING
    // `close_preflight --write` (the harness calls the real function), so
    // this proves the whole path end to end: Python computes and digests,
    // the extension re-digests the same directory, agrees the answer is
    // fresh, and paints it. Nothing here spawns the preflight from the
    // renderer — the file is the entire interface, which is the reason
    // the file exists (the preflight takes 2-7 seconds).
    per.tmpPath = makeTmpDir("dabbler-closeout");
    const h = makeSet(per.tmpPath, "115-closeout", 2, { withSessionSteps: true });
    startSession(h, 1);
    const written = writeCloseObligations(h);
    expect(written.path, "the fixture's projection was not written").toBeTruthy();
    expect(written.state).toBe("fresh");

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "115-closeout" });
    await expandTreeRow(pane, "115-closeout");
    await expandTreeRow(pane, "Fixture session 1");

    // One row on the surface the operator watches, summarizing what still
    // stands between here and close.
    const group = treeRow(pane, "Close-out");
    await expect(group).toBeVisible();
    await expect(group).toContainText("blocking");

    await expandTreeRow(pane, "Close-out");

    // The obligations themselves, named as the close names them. A
    // mid-session preflight always has an unmet UAT/disposition row and a
    // git row, so both classes are on screen.
    await expect(treeRow(pane, "Disposition present")).toBeVisible();
    const gitRow = treeRow(pane, "Working tree clean");
    await expect(gitRow).toBeVisible();
    // The volatile row dates itself even though the projection is fresh:
    // no content digest can speak for a predicate that reads git.
    await expect(gitRow).toContainText("as of");
  });
});
