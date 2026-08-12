// Layer 3 for the tree's manifest diagnostic.
//
// Set 123 S3: this scenario was the first of three in `system-status.spec.ts`,
// a file whose other two drove the Getting Started / System Status webview and
// were retired with it. This one never touched a webview — it drives
// `TreeView.message`, which is a native surface and is still shipping — so
// retiring it with its former file-mates would have deleted live coverage of a
// live behaviour. It is relocated instead, under a name that says what it
// actually tests.
//
// It is also the falsifier for Set 110 Session 2's assigned residual.
// `WorkExplorerTreeProvider` DISCARDED `assembleVisibleModules(...)
// .manifestFaults`, so a broken `docs/modules.yaml` left the native tree
// showing a stale last-known-good module tree with no explanation — a
// fail-quiet in a codebase whose standing rule is fail-loud. Three independent
// reads raised it in that session's round 2 and the close backstop; Set 110 S3
// fixed it and this test is what keeps it fixed.
//
// ONE CHANNEL, NOT TWO — a deliberate departure from the routed architecture
// advice, recorded rather than quietly taken. The routed call
// (`s3-stacked-view-architecture.json`) recommended surfacing the manifest
// fault in BOTH `TreeView.message` and the System Status strip, reasoning
// that the strip was a consolidated dashboard. Set 110 S3 shipped it in
// `TreeView.message` only, because the message sits DIRECTLY ABOVE the stale
// tree it explains, and because two renderings of one fault is a duplication
// that then needs parity. Set 123 S3 deleted the strip outright, which settles
// the question permanently: there is one channel because there is one surface.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  MODULES_YAML,
  openWorkExplorerTree,
  stampModule,
  treeRow,
  treeViewMessageText,
  triggerRefresh,
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

test.describe("Set 110 S3 — the tree's manifest diagnostic", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("an invalid manifest explains itself, retains the last-known-good tree, and clears on repair", async () => {
    per.tmpPath = makeTmpDir("dabbler-manifest-guard");
    const fixture = makeSet(per.tmpPath, "092-manifest-guard", 2);
    stampModule(fixture, "greeter");
    const manifestPath = path.join(fixture.repo_root, "docs", "modules.yaml");
    fs.writeFileSync(manifestPath, MODULES_YAML, "utf8");

    per.launch = await launchVSCode(fixture.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    // Healthy: the module renders and the view says nothing.
    await expect(treeRow(pane, "Greeter")).toBeVisible({ timeout: 30_000 });
    expect(await treeViewMessageText(pane)).toBe("");

    // Break the manifest by hand.
    fs.writeFileSync(manifestPath, "modules: [\n", "utf8");
    await triggerRefresh(per.launch.page);

    // The tree still shows the last-known-good module — never blank the
    // view — but it now EXPLAINS why, which is the whole fix.
    await expect(treeRow(pane, "Greeter")).toBeVisible();
    await expect
      .poll(async () => treeViewMessageText(pane), { timeout: 30_000 })
      .toMatch(/modules\.yaml/i);

    // The extension never repairs the file on the operator's behalf.
    expect(fs.readFileSync(manifestPath, "utf8")).toBe("modules: [\n");

    // Repair: the message clears and the new title lands.
    const repaired = MODULES_YAML.replace("title: Greeter", "title: Greeter Repaired");
    fs.writeFileSync(manifestPath, repaired, "utf8");
    await triggerRefresh(per.launch.page);
    await expect(treeRow(pane, "Greeter Repaired")).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(async () => treeViewMessageText(pane), { timeout: 30_000 }).toBe("");
  });
});
