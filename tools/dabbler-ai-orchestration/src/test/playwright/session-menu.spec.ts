// Set 115 Session 3 — the Layer 3 spec for the session row's context menu.
//
// What only a real host can show. WHICH row may offer the run prompt, and
// WHICH files belong to a session, are proven exhaustively at Layer 2 in
// `sessionRowActions.test.ts`; that the registry and `package.json` agree
// on tokens is proven statically in `workExplorerMenuParity.test.ts`.
// Re-asserting either here would buy nothing at ~40 seconds a run.
//
// What neither can reach is the seam between them: VS Code's own `when`
// evaluation of `viewItem =~ /;act-…;/` against a `contextValue` we compute
// in TypeScript. A token emitted with the wrong delimiters, a `when` clause
// with a typo, or an entry anchored on the wrong menu id all compile, all
// pass every unit test, and all render an empty context menu on the row the
// operator right-clicks. So this spec right-clicks the row.
//
// The artifact half is driven end to end for the same reason — the click
// path opens a real editor tab, and "the menu named a file" is not the same
// claim as "the file opened".

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  revealSetRow,
  rowContextMenuText,
  startSession,
  treeRow,
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

const RUN_PROMPT = "Copy Run Prompt";
const ARTIFACTS = "Open Session Artifacts";

test.describe("Set 115 S3 — a session row's context menu", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("the runnable session offers the run prompt; the one after it does not", async () => {
    per.tmpPath = makeTmpDir("dabbler-session-menu");
    const h = makeSet(per.tmpPath, "115-menu-me", 2, { withSessionSteps: true });
    // Session 1 in flight, so it is the session the trigger phrase runs
    // and session 2 is not.
    startSession(h, 1);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "115-menu-me" });
    await expandTreeRow(pane, "115-menu-me");

    const live = await rowContextMenuText(
      per.launch.page,
      treeRow(pane, "Fixture session 1"),
    );
    expect(live, `menu was:\n${live}`).toContain(RUN_PROMPT);
    expect(live, `menu was:\n${live}`).toContain(ARTIFACTS);
    // The set-row entries do NOT leak down a level: both submenus are
    // anchored on `;dabblerSet;`, and this is where that anchoring is
    // checked against VS Code's own evaluation rather than against ours.
    expect(live, `menu was:\n${live}`).not.toContain("Cancel Session Set");
    expect(live, `menu was:\n${live}`).not.toContain("Copy Slug");

    const later = await rowContextMenuText(
      per.launch.page,
      treeRow(pane, "Fixture session 2"),
    );
    // The gate, end to end: a prompt copied from session 2 would start
    // session 1, so session 2 does not offer one.
    expect(later, `menu was:\n${later}`).not.toContain(RUN_PROMPT);
    // Evidence is still offered — every session can be asked what it
    // produced, and one that produced nothing says so.
    expect(later, `menu was:\n${later}`).toContain(ARTIFACTS);
  });

  test("a session's artifacts open from the menu, and only that session's", async () => {
    per.tmpPath = makeTmpDir("dabbler-session-artifacts");
    const h = makeSet(per.tmpPath, "115-artifacts", 2, { withSessionSteps: true });
    startSession(h, 1);
    // The convention, on disk. `s2-` is the decoy: it is a real artifact
    // of a real session, and it must not appear under session 1.
    fs.writeFileSync(
      path.join(h.set_dir, "s1-verification.md"),
      "# session one verification\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(h.set_dir, "s2-verification.md"),
      "# session two verification\n",
      "utf-8",
    );

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "115-artifacts" });
    await expandTreeRow(pane, "115-artifacts");

    await treeRow(pane, "Fixture session 1").click({ button: "right" });
    const menu = per.launch.page.locator(".context-view .monaco-menu");
    await menu.waitFor({ state: "visible", timeout: 15_000 });
    await menu.locator(".action-label", { hasText: ARTIFACTS }).click();

    // Exactly one match, so it opens directly rather than through a
    // QuickPick — and it is session 1's file, not session 2's.
    const tabs = per.launch.page.locator(".tabs-container .tab");
    await expect(tabs.filter({ hasText: "s1-verification.md" })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(tabs.filter({ hasText: "s2-verification.md" })).toHaveCount(0);
  });

  test("a session that has produced nothing says so", async () => {
    // The honest empty state. It is a message, not a missing menu entry:
    // hiding the entry would mean listing every set directory on the tree
    // scan, which is the read Set 115's decision 4 forbids.
    per.tmpPath = makeTmpDir("dabbler-session-no-artifacts");
    const h = makeSet(per.tmpPath, "115-empty", 2, { withSessionSteps: true });
    startSession(h, 1);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "115-empty" });
    await expandTreeRow(pane, "115-empty");

    await treeRow(pane, "Fixture session 1").click({ button: "right" });
    const menu = per.launch.page.locator(".context-view .monaco-menu");
    await menu.waitFor({ state: "visible", timeout: 15_000 });
    await menu.locator(".action-label", { hasText: ARTIFACTS }).click();

    const toast = per.launch.page.locator(".notifications-toasts .notification-toast");
    await expect(toast).toContainText("has no artifacts yet", { timeout: 15_000 });
    // It names the convention, so the operator learns the rule from the
    // empty state rather than from the docs.
    await expect(toast).toContainText("s1-*");
    // And nothing was opened.
    await expect(per.launch.page.locator(".tabs-container .tab")).toHaveCount(0);
  });
});
