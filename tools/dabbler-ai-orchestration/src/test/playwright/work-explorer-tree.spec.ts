// The core rendering scenarios: one workspace whose sessions root holds
// a complete session, an in-flight one with tasks, a cancelled one and
// two not-started ones, one VS Code launch, every assertion against the
// tree the real Python projection produced.

import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  expectFileIcon,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  repositoryLabel,
  revealSessionRow,
  rowContextMenuText,
  treeRow,
  treeRows,
  writeDriverRun,
  writeDriverWorkPlan,
  writeSessionsRoot,
  writeTaskDeclaration,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let repository: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-tree");
  repository = repositoryLabel(workspace);
  writeSessionsRoot(workspace, [
    { number: 1, title: "Ship the thing", status: "complete", verificationVerdict: "VERIFIED" },
    { number: 2, title: "Cancelled work", status: "cancelled" },
    { number: 3, title: "Build the thing", status: "in-progress" },
    { number: 4, title: "Polish", status: "not-started" },
    { number: 5, title: "Close the set", status: "not-started" },
  ]);
  // Declare done (moves the fold past Register/Plan), a driver work plan
  // with two steps of its own (what nests under Work), and a driver run
  // mid-"steps" with nothing yet accepted -- the first step reads open.
  writeTaskDeclaration(workspace, 3, { task: "Build the thing.", releasable: false });
  writeDriverWorkPlan(workspace, 3, {
    task: "Build the thing.",
    releasable: false,
    steps: [
      { id: "build-the-widget", ask: "Build the widget." },
      { id: "smooth-the-edges", ask: "Smooth the edges." },
    ],
  });
  writeDriverRun(workspace, 3, { phase: "steps", acceptedSteps: [] });
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("the repository row renders with its progress fraction", async () => {
  const row = treeRow(pane, repository);
  await expect(row).toBeVisible();
  await expect(row).toContainText("1/5");
  await expect(row).toContainText("session 003 in flight");
});

test("sessions render under status buckets, In Progress open and the rest collapsed", async () => {
  await expandTreeRow(pane, repository);
  // Every bucket with a member renders, with its count dimmed after it.
  for (const [bucket, count] of [
    ["In Progress", "1"],
    ["Not Started", "2"],
    ["Complete", "1"],
    ["Cancelled", "1"],
  ]) {
    const header = treeRows(pane).filter({ hasText: new RegExp(`^${bucket}\\s*${count}$`) });
    await expect(header).toHaveCount(1);
  }
  // Only In Progress opened by itself.
  await expect(treeRow(pane, "003 · Build the thing")).toBeVisible();
  await expect(treeRows(pane).filter({ hasText: "001 · Ship the thing" })).toHaveCount(0);
  await revealSessionRow(pane, { repository, session: "001 · Ship the thing" });
  await expect(treeRow(pane, "005 · Close the set")).toBeVisible();
});

test("each session row carries the operator's authored status glyph", async () => {
  const complete = await revealSessionRow(pane, {
    repository,
    session: "001 · Ship the thing",
  });
  await expectFileIcon(complete, "done.svg");
  await expectFileIcon(treeRow(pane, "002 · Cancelled work"), "cancelled.svg");
  await expectFileIcon(treeRow(pane, "003 · Build the thing"), "in-progress.svg");
  await expectFileIcon(treeRow(pane, "004 · Polish"), "not-started.svg");
});

test("only the in-flight session says so in its description", async () => {
  await expect(treeRow(pane, "003 · Build the thing")).toContainText("in flight");
});

// Prefix-anchored, not a plain substring match: by this point in the suite
// every bucket is expanded, and "Close" is also a substring of an unrelated
// session title on screen ("005 · Close the set") -- a plain `hasText`
// match would silently pick whichever one happens to render first rather
// than the lifecycle row this test means. Not fully anchored either: a done
// or open row carries a rendered start time right after its label ("Register09:00-"),
// with no separator, so only the row's own text is required to START with
// the label.
const lifecycleRow = (pane: import("@playwright/test").Locator, label: string) =>
  treeRow(pane, new RegExp(`^${label}`));

test("expanding the in-flight session reveals its six lifecycle rows", async () => {
  await expandTreeRow(pane, "003 · Build the thing");
  for (const label of ["Register", "Plan", "Work", "Verify", "Test", "Close"]) {
    await expect(lifecycleRow(pane, label)).toBeVisible();
  }
  // Register and Plan are done (the session started and declared); Work is
  // the one open now (the driver run is mid-"steps"); the rest are pending.
  await expectFileIcon(lifecycleRow(pane, "Register"), "done.svg");
  await expectFileIcon(lifecycleRow(pane, "Plan"), "done.svg");
  await expectFileIcon(lifecycleRow(pane, "Work"), "in-progress.svg");
  await expectFileIcon(lifecycleRow(pane, "Verify"), "not-started.svg");
  await expectFileIcon(lifecycleRow(pane, "Test"), "not-started.svg");
  await expectFileIcon(lifecycleRow(pane, "Close"), "not-started.svg");
});

test("the driver work plan's own steps nest under Work, and nowhere else", async () => {
  await expandTreeRow(pane, /^Work/);
  await expect(treeRow(pane, "Build the widget")).toBeVisible();
  await expect(treeRow(pane, "Smooth the edges")).toBeVisible();
  // The open step, and only it: the fold marks one row in flight.
  await expectFileIcon(treeRow(pane, "Build the widget"), "in-progress.svg");
  await expectFileIcon(treeRow(pane, "Smooth the edges"), "not-started.svg");
});

test("the repository row's menu offers the files and the lifecycle launchers", async () => {
  // This test sits after the ones the six-lifecycle-row redesign broke, so
  // in serial mode it never actually ran until that fix landed -- and doing
  // so exposed a second stale assertion: the registry's real label
  // (ActionRegistry.ts) is "Close Session", with no "(terminal)" suffix.
  const menu = await rowContextMenuText(vscode.page, treeRow(pane, repository));
  expect(menu).toContain("Open File");
  expect(menu).toContain("Close Session");
  expect(menu).not.toContain("Cancel Session");
});

test("cancellation is offered on the session row, where the decision lives", async () => {
  const menu = await rowContextMenuText(
    vscode.page,
    treeRow(pane, "004 · Polish"),
  );
  expect(menu).toContain("Cancel Session");
  expect(menu).not.toContain("Restore Session");
});

test("a work step's row moves on the driver/run.json watcher, not the 30-second poll", async () => {
  // The acceptance test for the watcher is a TRANSITION, not a render.
  // expectFileIcon settles within five seconds, against a fallback poll on
  // a thirty-second period: the poll cannot have served it, so the row
  // moved because the watcher saw driver/run.json change. accepted_steps is
  // what workStepRows folds as done -- step-execution.jsonl is written by
  // nothing that reaches this row's state any more.
  writeDriverRun(workspace, 3, { phase: "steps", acceptedSteps: ["build-the-widget"] });
  await expectFileIcon(treeRow(pane, "Build the widget"), "done.svg");
  await expectFileIcon(treeRow(pane, "Smooth the edges"), "in-progress.svg");
});

test("a step added to the plan appears on the driver/plan.json watcher, not the 30-second poll", async () => {
  // The plan step's report writes driver/plan.json and nothing else, so the
  // Work row's nested steps have no other event to arrive on. Measured
  // before plan.json was watched (session 126): the steps waited for the
  // next record write, ten seconds later, or for the poll.
  writeDriverWorkPlan(workspace, 3, {
    task: "Build the thing.",
    releasable: false,
    steps: [
      { id: "build-the-widget", ask: "Build the widget." },
      { id: "smooth-the-edges", ask: "Smooth the edges." },
      { id: "paint-it", ask: "Paint it." },
    ],
  });
  await expect(treeRow(pane, "Paint it")).toBeVisible({ timeout: 5_000 });
});

test("clicking a session row opens the session plan in the editor", async () => {
  await treeRow(pane, "003 · Build the thing").click();
  const tab = vscode.page
    .locator(".tabs-container .tab")
    .filter({ hasText: "session-plan.md" });
  await expect(tab.first()).toBeVisible({ timeout: 15_000 });
});
