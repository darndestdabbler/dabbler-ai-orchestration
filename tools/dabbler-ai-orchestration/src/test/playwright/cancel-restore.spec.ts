// Cancel/restore round-trip: the state mutation runs through the real
// `dabbler session` command the extension ships (the only sanctioned
// writer), and the row's glyph follows it after a refresh.

import * as cp from "child_process";
import * as path from "path";
import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  DABBLER_CLI,
  cleanupTmpDir,
  closeVSCode,
  revealSessionRow,
  expectFileIcon,
  launchVSCode,
  makeTmpDir,
  openWorkExplorerTree,
  repositoryLabel,
  treeRow,
  triggerRefresh,
  writeSessionsRoot,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let repository: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof openWorkExplorerTree>>;

function runSessionCli(args: string[]): void {
  // `--sessions-dir` because the fixture workspace is a tmpdir, not a
  // git checkout, and the router derives its sessions root by finding
  // the repository it is standing in. This is the caller-outside-the-
  // tree case the flag exists for — the same reason the extension's own
  // projection passes it.
  const proc = cp.spawnSync(
    process.execPath,
    [
      DABBLER_CLI,
      "session",
      ...args,
      "--sessions-dir",
      path.join(workspace, "docs", "sessions"),
    ],
    {
      encoding: "utf8",
      cwd: workspace,
      timeout: 60_000,
      windowsHide: true,
    },
  );
  if (proc.status !== 0) {
    throw new Error(
      `session command failed (${proc.status}): ${proc.stdout} ${proc.stderr}`,
    );
  }
}

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-cancel");
  repository = repositoryLabel(workspace);
  writeSessionsRoot(workspace, [
    { number: 1, title: "Cancel me", status: "not-started" },
  ]);
  vscode = await launchVSCode(workspace);
  pane = await openWorkExplorerTree(vscode.page);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  if (workspace) cleanupTmpDir(workspace);
});

test("the fresh session renders not started", async () => {
  await expectFileIcon(await revealSessionRow(pane, { repository, session: "001 · Cancel me" }),"not-started.svg");
});

test("cancelling via the CLI flips the row's glyph after refresh", async () => {
  runSessionCli(["cancel", "1", "--reason", "playwright round-trip"]);
  await triggerRefresh(vscode.page);
  await expectFileIcon(await revealSessionRow(pane, { repository, session: "001 · Cancel me" }),"cancelled.svg");
});

test("restoring via the CLI returns the row to not started", async () => {
  runSessionCli(["restore", "1"]);
  await triggerRefresh(vscode.page);
  await expectFileIcon(await revealSessionRow(pane, { repository, session: "001 · Cancel me" }),"not-started.svg");
  await expect(treeRow(pane, "001 · Cancel me")).toBeVisible();
});
