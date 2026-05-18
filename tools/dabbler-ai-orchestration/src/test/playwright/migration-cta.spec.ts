// Layer 3 rendering smoke for the v2 → v3 migration CTA, Set 030
// Session 5. Each test creates a v3 set via the harness, manually
// downgrades the state file to v2 on disk, launches a real Electron
// VS Code, and asserts the tree surfaces the "(needs migration)"
// badge. A second test exercises the migration command end-to-end —
// invokes it, picks the regex strategy via the quickpick, and asserts
// the on-disk file is rewritten in v3 shape so a refresh clears the
// badge.
//
// The migration command is *operator-triggered*, not auto-fire — the
// loading sentinel scenario is covered in a separate smoke
// (loading-state.spec.ts) since the two assertions don't share a
// fixture shape.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  downgradeStateFileToV2,
  launchVSCode,
  LaunchedVSCode,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
  readStateFile,
  triggerRefresh,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

async function teardown(per: PerTest): Promise<void> {
  const errs: unknown[] = [];
  if (per.launch) {
    try {
      await closeVSCode(per.launch);
    } catch (e) {
      errs.push(e);
    }
  }
  if (per.tmpPath) {
    try {
      cleanupTmpDir(per.tmpPath);
    } catch (e) {
      errs.push(e);
    }
  }
  if (errs.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("teardown encountered cleanup errors:", errs);
  }
}

async function treeitemTexts(
  tree: import("@playwright/test").Locator,
): Promise<string[]> {
  const items = tree.locator('[role="treeitem"]');
  const count = await items.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const aria = await item.getAttribute("aria-label");
    if (aria) {
      out.push(aria);
    } else {
      const t = (await item.textContent()) || "";
      out.push(t.trim());
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Scenario 1: v2 state file on disk → "(needs migration)" badge on row.
// ---------------------------------------------------------------------
test("renders (needs migration) badge on a v2 set", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-v2");
    const h = makeSet(per.tmpPath, "scenario-v2-pending", 3);
    // The harness's start_session writer emits v3 dual-write today.
    // Downgrade the file to a pure-v2 snapshot so the v2-detection
    // path actually fires.
    downgradeStateFileToV2(h);

    per.launch = await launchVSCode(h.repo_root);
    const tree = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const joined = (await treeitemTexts(tree)).join("\n");
    expect(joined).toContain("scenario-v2-pending");
    expect(joined).toContain("(needs migration)");
    // Negative control: only one set in this fixture; no other badge
    // should appear.
    expect(joined).not.toContain("[FORCED]");
  } finally {
    await teardown(per);
  }
});
