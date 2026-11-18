// First-run posture: a workspace that was never SET UP must still
// activate and keep the command surface reachable. It shows no
// repository row, because it carries neither a ledger nor a session
// plan — there is nothing to read, and inventing rows is the guess this
// view exists to avoid. A bootstrapped workspace is the other case: it
// has a plan, and its two setup sessions render from it.

import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  makeTmpDir,
  repositoryLabel,
  treeRows,
  triggerRefresh,
  workExplorerPane,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof workExplorerPane>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-firstrun");
  vscode = await launchVSCode(workspace);
  pane = await workExplorerPane(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("a workspace with no ledger renders no repository row", async () => {
  await expect(treeRows(pane).filter({ hasText: repositoryLabel(workspace) })).toHaveCount(0);
});

test("the refresh command runs without disturbing the view", async () => {
  await triggerRefresh(vscode.page);
  await expect(pane).toBeVisible();
});
