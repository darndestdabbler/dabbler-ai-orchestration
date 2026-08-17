// Cancel/restore round-trip: the state mutation runs through the real
// `python -m ai_router.session` CLI on disk (the only sanctioned
// writer), and the tree follows it after a refresh.

import * as cp from "child_process";
import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  PYTHON,
  addSpecOnlySet,
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
  triggerRefresh,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let setDir: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

function runSessionCli(args: string[]): void {
  const proc = cp.spawnSync(PYTHON, ["-m", "ai_router.session", ...args], {
    encoding: "utf8",
    cwd: workspace,
    timeout: 60_000,
    windowsHide: true,
  });
  if (proc.status !== 0) {
    throw new Error(
      `session CLI failed (${proc.status}): ${proc.stdout} ${proc.stderr}`,
    );
  }
}

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-cancel");
  setDir = addSpecOnlySet(workspace, "300-cancel-me");
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("the fresh set starts in Not Started", async () => {
  await expandTreeRow(pane, "Default");
  await expandTreeRow(pane, "Not Started");
  await expect(treeRow(pane, "300-cancel-me")).toBeVisible();
});

test("cancelling via the CLI moves the row to Cancelled after refresh", async () => {
  runSessionCli(["cancel", setDir, "--reason", "playwright round-trip"]);
  await triggerRefresh(vscode.page);
  await expandTreeRow(pane, "Cancelled");
  await expect(treeRow(pane, "300-cancel-me")).toBeVisible();
});

test("restoring via the CLI returns the row to Not Started", async () => {
  runSessionCli(["restore", setDir]);
  await triggerRefresh(vscode.page);
  await expandTreeRow(pane, "Not Started");
  await expect(treeRow(pane, "300-cancel-me")).toBeVisible();
});
