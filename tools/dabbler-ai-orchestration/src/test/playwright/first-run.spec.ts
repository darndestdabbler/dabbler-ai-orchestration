// First-run posture: a workspace with no session sets must still
// activate, render the sole Default module with its empty buckets, and
// keep the command surface reachable.

import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
  treeRows,
  triggerRefresh,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-firstrun");
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("an empty workspace renders the sole Default module, never a blank view", async () => {
  await expect(treeRow(pane, "Default")).toBeVisible();
});

test("its three default buckets render empty as leaves", async () => {
  await expandTreeRow(pane, "Default");
  await expect(treeRow(pane, "In Progress")).toBeVisible();
  await expect(treeRow(pane, "Not Started")).toBeVisible();
  await expect(treeRow(pane, "Complete")).toBeVisible();
  await expect(treeRows(pane).filter({ hasText: "Cancelled" })).toHaveCount(0);
});

test("the refresh command runs without disturbing the view", async () => {
  await triggerRefresh(vscode.page);
  await expect(treeRow(pane, "Default")).toBeVisible();
});
