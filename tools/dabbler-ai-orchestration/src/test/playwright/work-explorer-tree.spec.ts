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
  writeApprovedPlan,
  writeSessionsRoot,
  writeStepEvent,
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
  writeApprovedPlan(workspace, 3, [
    { stepId: "implement-the-feature", intent: "Implement the feature." },
    { stepId: "run-the-tests", intent: "Run the tests." },
    { stepId: "close-out", intent: "Close out." },
  ]);
  writeStepEvent(workspace, 3, "opened", "implement-the-feature");
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

test("sessions render as one ordered list, never bucketed by status", async () => {
  await expandTreeRow(pane, repository);
  await expect(treeRow(pane, "001 · Ship the thing")).toBeVisible();
  await expect(treeRow(pane, "005 · Close the set")).toBeVisible();
  for (const bucket of ["In Progress", "Not Started", "Complete"]) {
    await expect(treeRows(pane).filter({ hasText: new RegExp(`^${bucket}$`) })).toHaveCount(0);
  }
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

test("expanding the in-flight session reveals its approved-plan task rows", async () => {
  await expandTreeRow(pane, "003 · Build the thing");
  await expect(treeRow(pane, "Implement the feature")).toBeVisible();
  await expect(treeRow(pane, "Run the tests")).toBeVisible();
  await expect(treeRow(pane, "Close out")).toBeVisible();
  // The open step, and only it: the fold marks one row in flight.
  await expectFileIcon(treeRow(pane, "Implement the feature"), "in-progress.svg");
  await expectFileIcon(treeRow(pane, "Run the tests"), "not-started.svg");
});

test("the repository row's menu offers the files and the lifecycle launchers", async () => {
  const menu = await rowContextMenuText(vscode.page, treeRow(pane, repository));
  expect(menu).toContain("Open File");
  expect(menu).toContain("Close Session (terminal)");
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

test("a step opening and closing moves the row on the event, not on the poll", async () => {
  // The acceptance test for the watcher is a TRANSITION, not a render.
  // expectFileIcon settles within five seconds and two of them run here,
  // against a fallback poll on a thirty-second period: the poll cannot
  // have served both, so at least one row moved because the watcher saw
  // step-execution.jsonl change. It also proves the projection cache key
  // covers the run records — a key blind to them would hand the refresh
  // back the payload the step's close invalidated.
  writeStepEvent(workspace, 3, "closed", "implement-the-feature");
  await expectFileIcon(treeRow(pane, "Implement the feature"), "done.svg");

  writeStepEvent(workspace, 3, "opened", "run-the-tests");
  await expectFileIcon(treeRow(pane, "Run the tests"), "in-progress.svg");
});

test("clicking a session row opens the session plan in the editor", async () => {
  await treeRow(pane, "003 · Build the thing").click();
  const tab = vscode.page
    .locator(".tabs-container .tab")
    .filter({ hasText: "session-plan.md" });
  await expect(tab.first()).toBeVisible({ timeout: 15_000 });
});
