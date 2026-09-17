// The framework's loop terminal, in the real editor: it opens in the panel
// and leaves the focus where it was. The `vscode` stub can see neither.
//
// Resume stands in for Start: both open the loop through the same path, and
// Resume needs no engine CLI on the machine to get there -- the fixture's
// recorded engine is none Resume can reopen, so the loop is all it opens.

import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  repositoryLabel,
  revealSessionRow,
  writeSessionsRoot,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-loop");
  writeSessionsRoot(workspace, [{ number: 1, title: "Loop me", status: "in-progress" }]);
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("the loop terminal opens in the panel and leaves the focus where it was", async () => {
  const page = vscode.page;
  const row = await revealSessionRow(pane, { repository: repositoryLabel(workspace), session: "001 · Loop me" });
  const editorTerminals = page.locator(".part.editor .terminal-wrapper");
  const before = await editorTerminals.count();

  await row.click({ button: "right" });
  const menu = page.locator(".context-view .monaco-menu");
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  await menu.getByRole("menuitem", { name: "Resume Session" }).hover();
  await page.keyboard.press("Enter");

  await expect(page.locator(".part.panel .terminal-wrapper").first()).toBeVisible({ timeout: 15_000 });
  expect(await editorTerminals.count()).toBe(before);
  // The workbench leaves the caret in the view the menu was opened from.
  await expect(pane.locator(":focus")).toHaveCount(1);
});
