// The core rendering scenarios: one mixed workspace assembled from the
// vendored corpus (a v3 complete set, a v4 complete set, a v4
// in-progress set with steps, a cancelled set, a spec-only set, and a
// spec-only set blocked by prerequisites), one VS Code launch, every
// assertion against the tree the real Python projection produced.

import { test, expect } from "@playwright/test";
import {
  CORPUS,
  LaunchedVSCode,
  addCorpusSet,
  addInFlightSet,
  addSpecOnlySet,
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  expectFileIcon,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  revealSetRow,
  rowContextMenuText,
  treeRow,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-tree");
  addCorpusSet(workspace, CORPUS.completeV3);
  addCorpusSet(workspace, CORPUS.completeV4);
  addCorpusSet(workspace, CORPUS.inProgress);
  addCorpusSet(workspace, CORPUS.cancelled);
  addInFlightSet(workspace, "310-in-flight");
  addSpecOnlySet(workspace, "200-fresh-work");
  addSpecOnlySet(workspace, "201-blocked-work", {
    prereqSlugs: [CORPUS.inProgress],
  });
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("the default module renders with its set count", async () => {
  const moduleRow = treeRow(pane, "Default");
  await expect(moduleRow).toBeVisible();
  await expect(moduleRow).toContainText("7 sets");
});

test("a v3-on-disk set renders in Complete unmodified — the compat contract", async () => {
  const row = await revealSetRow(pane, {
    bucket: "Complete",
    set: CORPUS.completeV3,
  });
  await expect(row).toBeVisible();
  await expectFileIcon(row, "done.svg");
});

test("a v4 complete set renders beside it", async () => {
  const row = treeRow(pane, CORPUS.completeV4);
  await expect(row).toBeVisible();
});

test("the in-progress set renders under In Progress with its glyph", async () => {
  await expandTreeRow(pane, "In Progress");
  const row = treeRow(pane, CORPUS.inProgress);
  await expect(row).toBeVisible();
  await expectFileIcon(row, "in-progress.svg");
});

test("spec-only sets land in Not Started, blocked ones included", async () => {
  await expandTreeRow(pane, "Not Started");
  await expect(treeRow(pane, "200-fresh-work")).toBeVisible();
  await expect(treeRow(pane, "201-blocked-work")).toBeVisible();
});

test("the cancelled set renders under the Cancelled bucket", async () => {
  await expandTreeRow(pane, "Cancelled");
  const row = treeRow(pane, CORPUS.cancelled);
  await expect(row).toBeVisible();
  await expectFileIcon(row, "cancelled.svg");
});

test("expanding the in-flight set reveals its session rows, the running one marked", async () => {
  await expandTreeRow(pane, "310-in-flight");
  const inFlight = treeRow(pane, "Build the thing");
  await expect(inFlight).toBeVisible();
  await expect(inFlight).toContainText("in flight");
  await expect(treeRow(pane, "Polish")).toBeVisible();
});

test("expanding the in-flight session reveals its projected step rows", async () => {
  await expandTreeRow(pane, "Build the thing");
  await expect(treeRow(pane, "Implement the feature")).toBeVisible();
  await expect(treeRow(pane, "Run the tests")).toBeVisible();
  await expect(treeRow(pane, "Close out")).toBeVisible();
  await expectFileIcon(treeRow(pane, "Implement the feature"), "done.svg");
});

test("a set row's context menu offers the kept surface and nothing migratory", async () => {
  const row = treeRow(pane, CORPUS.completeV4);
  const menu = await rowContextMenuText(vscode.page, row);
  expect(menu).toContain("Open File");
  expect(menu).toContain("Cancel Session Set");
  expect(menu).not.toContain("Migrate");
  expect(menu).not.toContain("Open PR");
});

test("clicking a session row opens spec.md in the editor", async () => {
  await treeRow(pane, "Build the thing").click();
  const tab = vscode.page.locator(".tabs-container .tab").filter({ hasText: "spec.md" });
  await expect(tab.first()).toBeVisible({ timeout: 15_000 });
});
