// Layer 3 rendering smoke for the schema-drift signal, re-expressed by
// Set 110 Session 3 against the native `TreeView`.
//
// This file REPLACES `migration-cta.spec.ts` (v2 drift) and
// `migration-cta-v4.spec.ts` (v3 -> v4 drift), which were one test each and
// differed only in which downgrade helper they called and which version
// string the tooltip named. Merging them is a removal, not a rewrite for its
// own sake: two near-identical ~110-line files each paying a full ~40-second
// Extension Development Host launch, to assert the same rendering rule twice.
//
// Carrier change: the webview drew an unobtrusive `*` marker span whose
// `title` named the schema version. On the native tree, "needs migration" is
// RANK 2 of the icon precedence table, so it resolves to a themed `warning`
// codicon, and the version string lives in the markdown tooltip that Layer 2
// pins directly.
//
// The old files' `expect(joined).not.toContain("(needs migration)")` guard —
// against the retired intrusive text label — is dropped as unreachable: there
// is no description on a set row at all now, so no label could appear.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  downgradeStateFileToV2,
  downgradeStateFileToV3,
  expandTreeRow,
  expectFileIcon,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
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

test.describe("Set 050 S4 — schema drift, on the native tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  for (const scenario of [
    {
      name: "a v2 state file",
      slug: "scenario-v2-pending",
      downgrade: downgradeStateFileToV2,
    },
    {
      name: "a canonical v3 state file (v3 -> v4 target)",
      slug: "scenario-v3-needs-v4",
      downgrade: downgradeStateFileToV3,
    },
  ]) {
    test(`flags ${scenario.name}`, async () => {
      per.tmpPath = makeTmpDir(`dabbler-drift-${scenario.slug}`);
      // The harness emits canonical v4 since Set 049, so the fixture has to
      // be downgraded for the detector to have anything to flag.
      const h = makeSet(per.tmpPath, scenario.slug, 3);
      scenario.downgrade(h);

      per.launch = await launchVSCode(h.repo_root);
      const pane = await openWorkExplorerTree(per.launch.page);
      await expandTreeRow(pane, "Default");
      await expandTreeRow(pane, "Not Started");

      const row = treeRow(pane, scenario.slug);
      await row.waitFor({ state: "visible", timeout: 15_000 });
      await expectFileIcon(row, "not-started.svg");
    });
  }

  test("does not flag a current-schema set", async () => {
    // The negative control the old files lacked. Both of them only ever
    // asserted the marker's PRESENCE on a deliberately-downgraded fixture,
    // so a derivation that flagged every row would have passed them both.
    per.tmpPath = makeTmpDir("dabbler-drift-none");
    const h = makeSet(per.tmpPath, "scenario-current-schema", 3);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await expandTreeRow(pane, "Default");
    await expandTreeRow(pane, "Not Started");

    const row = treeRow(pane, "scenario-current-schema");
    await row.waitFor({ state: "visible", timeout: 15_000 });
    await expectFileIcon(row, "not-started.svg");
  });
});
