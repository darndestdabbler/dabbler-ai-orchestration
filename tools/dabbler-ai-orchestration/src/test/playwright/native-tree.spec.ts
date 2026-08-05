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
  FixtureHandle,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  startSession,
} from "./electronLaunch";

const NATIVE_VIEW_TITLE = "Work Explorer (native preview)";

const MODULES_YAML = [
  "modules:",
  "  - slug: core",
  "    title: Orchestration Core",
  "    codeRoots: [src/core]",
  "  - slug: ui",
  "    title: User Interface",
  "    codeRoots: [src/ui]",
  "",
].join("\n");

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

/**
 * Stamp a set's spec with a `module:` attribution so it groups.
 *
 * Anchored on `requiresUAT:`, which the harness template
 * (`ai_router/tests/e2e/fixtures.py` → `_SPEC_TEMPLATE`) definitely
 * writes. An earlier version anchored on `tier:`, which that template
 * does NOT emit — the replace silently did nothing, the set fell into
 * the pseudo module, and the failure surfaced several steps later
 * looking like a tree bug. Hence the throw: a fixture helper that
 * quietly no-ops costs more than one that fails at the point of use.
 */
function stampModule(handle: FixtureHandle, slug: string): void {
  const specPath = path.join(handle.set_dir, "spec.md");
  const spec = fs.readFileSync(specPath, "utf-8");
  const stamped = spec.replace(/^requiresUAT:/m, `module: ${slug}\nrequiresUAT:`);
  if (stamped === spec) {
    throw new Error(`stampModule: no anchor in ${specPath}; the fixture template changed`);
  }
  fs.writeFileSync(specPath, stamped, "utf-8");
}

/** Open the Dabbler container and expand the native pane. */
async function openNativeTree(page: import("@playwright/test").Page) {
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();

  const pane = page
    .locator(".pane")
    .filter({ has: page.locator(`.title:text-is("${NATIVE_VIEW_TITLE}")`) })
    .first();
  await pane.waitFor({ state: "visible", timeout: 30_000 });
  const header = pane.locator(".pane-header");
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
  }
  await pane.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 30_000 });
  return pane;
}

/** Expand the row whose label matches, and wait for the list to settle. */
async function expandRow(
  pane: import("@playwright/test").Locator,
  label: string,
): Promise<void> {
  const row = pane.locator(".monaco-list-row").filter({ hasText: label }).first();
  await row.waitFor({ state: "visible", timeout: 15_000 });
  if ((await row.getAttribute("aria-expanded")) === "false") {
    await row.locator(".monaco-tl-twistie").click();
  }
  await pane.page().waitForTimeout(400);
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
    stampModule(first, "core");
    // Session 1 complete, session 2 in flight: gives the fourth level two
    // distinct statuses to render, which is what makes the operator's
    // "which session is in flight" ask legible without any text.
    driveHappyPath(first, 1);
    startSession(first, 2);

    const second = makeAdditionalSet(first, "002-ui-beta", 2);
    stampModule(second, "ui");

    per.launch = await launchVSCode(first.repo_root);
    const pane = await openNativeTree(per.launch.page);

    // 1. Module rows.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "Orchestration Core" }),
    ).toHaveCount(1);
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "User Interface" }),
    ).toHaveCount(1);

    // 3. Laziness, in the running host: no set row exists before its
    //    module is expanded, and no session row before its set is.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "001-core-alpha" }),
    ).toHaveCount(0);

    // 2. Drill all four levels.
    await expandRow(pane, "Orchestration Core");
    await expandRow(pane, "In Progress");
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "001-core-alpha" }),
    ).toHaveCount(1);

    // Still lazy one level down.
    await expect(
      pane.locator(".monaco-list-row").filter({ hasText: "Session 2" }),
    ).toHaveCount(0);

    await expandRow(pane, "001-core-alpha");
    const sessionRows = pane.locator(".monaco-list-row").filter({ hasText: /^Session \d/ });
    expect(await sessionRows.count()).toBeGreaterThan(0);

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
    const pane = await openNativeTree(per.launch.page);

    await expandRow(pane, "Default");
    await expandRow(pane, "Not Started");
    const setRow = pane.locator(".monaco-list-row").filter({ hasText: "001-activate-me" }).first();
    await setRow.waitFor({ state: "visible", timeout: 15_000 });
    await setRow.click();

    // spec.md opens in an editor tab.
    await expect(
      per.launch.page.locator(".tabs-container .tab").filter({ hasText: "spec.md" }),
    ).toHaveCount(1, { timeout: 15_000 });
  });
});
