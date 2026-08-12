// Set 110 Session 2 — Layer 3 for the NATIVE Work Explorer tree.
//
// L-064-12 arms at full strength here: this session adds an
// Explorer-rendering surface, and Set 108's specimen is the reason the
// lesson exists — a CSS-only change broke interaction while the unit
// suite and every static gate stayed green. The Layer-2 suite proves the
// provider returns the right nodes; only this layer proves VS Code
// renders and reacts to them.
//
// Four things are checked, and they are the four an operator would
// notice first:
//
//   1. The tree paints at all, with the module rows the fixture declares.
//   2. Expansion actually reaches all four levels — module -> bucket ->
//      set -> session. The fourth level is the operator's ask 1, and a
//      `Collapsed` set row that opens onto nothing would look like a
//      stall rather than a bug.
//   3. Laziness is real in the running host, not just in the unit test:
//      session rows do not exist in the DOM before their set is expanded.
//   4. Right-clicking a set row produces the hierarchical menu, with the
//      two submenus present — the capability the whole migration was
//      justified on, and the one Set 048 S3 failed to deliver with a
//      hand-drawn DOM menu.
//
// The webview tree is still the default surface this session, so every
// step here works through the native pane specifically.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  driveHappyPath,
  expandTreeRow,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  MODULES_YAML,
  openWorkExplorerTree,
  stampModule,
  startSession,
} from "./electronLaunch";

// Set 110 Session 3: the local `openNativeTree` / `expandRow` helpers and
// the `NATIVE_VIEW_TITLE` constant are gone. They matched the pane by its
// SESSION 2 title, "Work Explorer (native preview)" - a name this session
// retires when the native tree becomes the shipping view. The shared
// helpers in `electronLaunch.ts` locate the pane by the presence of a
// `.monaco-list` instead, which is exactly why they survive the rename.

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

test.describe("Set 110 S2 — native Work Explorer tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("renders four levels, lazily, with a hierarchical context menu", async () => {
    per.tmpPath = makeTmpDir("dabbler-native-tree");
    const first = makeSet(per.tmpPath, "001-core-alpha", 3);
    fs.mkdirSync(path.join(first.repo_root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(first.repo_root, "docs", "modules.yaml"), MODULES_YAML, "utf-8");
    stampModule(first, "greeter");
    // Session 1 complete, session 2 in flight: gives the fourth level two
    // distinct statuses to render, which is what makes the operator's
    // "which session is in flight" ask legible without any text.
    driveHappyPath(first, 1);
    startSession(first, 2);

    const second = makeAdditionalSet(first, "002-ui-beta", 2);
    stampModule(second, "clock");

    per.launch = await launchVSCode(first.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    // 1. Module rows.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "Greeter" }),
    ).toHaveCount(1);
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "Clock" }),
    ).toHaveCount(1);

    // 3. Laziness, in the running host: no set row exists before its
    //    module is expanded, and no session row before its set is.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "001-core-alpha" }),
    ).toHaveCount(0);

    // 2. Drill all four levels.
    await expandTreeRow(pane, "Greeter");
    await expandTreeRow(pane, "In Progress");
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "001-core-alpha" }),
    ).toHaveCount(1);

    // Still lazy one level down.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "Session 2" }),
    ).toHaveCount(0);

    await expandTreeRow(pane, "001-core-alpha");
    const sessionRows = pane.locator(".monaco-list-row").filter({ hasText: /^Session \d/ });
    // Retrying, not a snapshot. `expect(await rows.count())` asks exactly
    // once, and on a loaded CI runner the session rows paint a beat after the
    // expand — so this line went red twice on windows-latest while every
    // neighbouring assertion, all of which retry, would have waited it out.
    // Asserting the first row is visible says the same thing (at least one
    // session row exists) and says it patiently.
    await expect(sessionRows.first()).toBeVisible({ timeout: 15_000 });

    // The in-flight session says so, and only it does — the operator's
    // ask 2 is a removal, and this is the surviving signal.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "in flight" }),
    ).toHaveCount(1);

    // 4. The hierarchical context menu on a set row.
    const setRow = pane.locator(".monaco-list-row").filter({ hasText: "001-core-alpha" }).first();
    await setRow.click({ button: "right" });
    const menu = per.launch.page.locator(".context-view .monaco-menu");
    await menu.waitFor({ state: "visible", timeout: 15_000 });
    const menuText = await menu.innerText();
    expect(menuText, `context menu was:\n${menuText}`).toContain("Open File");
    expect(menuText, `context menu was:\n${menuText}`).toContain("Copy Prompt");
    // A live set offers Cancel and not Restore — `contextValue` gating,
    // end to end through VS Code's own `when` evaluation rather than
    // through our own predicate.
    expect(menuText).toContain("Cancel Session Set");
    expect(menuText).not.toContain("Restore Session Set");
    await per.launch.page.keyboard.press("Escape");
  });

  test("a set row's primary action opens its spec", async () => {
    // The webview's L5 left-click behaviour, preserved. Losing it quietly
    // would be a regression the operator feels every session.
    per.tmpPath = makeTmpDir("dabbler-native-activate");
    const handle = makeSet(per.tmpPath, "001-activate-me", 2);

    per.launch = await launchVSCode(handle.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    await expandTreeRow(pane, "Default");
    await expandTreeRow(pane, "Not Started");
    const setRow = pane.locator(".monaco-list-row").filter({ hasText: "001-activate-me" }).first();
    await setRow.waitFor({ state: "visible", timeout: 15_000 });
    await setRow.click();

    // spec.md opens in an editor tab.
    await expect(
      per.launch.page.locator(".tabs-container .tab").filter({ hasText: "spec.md" }),
    ).toHaveCount(1, { timeout: 15_000 });
  });
});
