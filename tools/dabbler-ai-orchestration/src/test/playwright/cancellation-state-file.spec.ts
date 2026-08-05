// Set 035 Session 3 — Layer 3 coverage for the state-file-first
// cancellation contract, re-expressed by Set 110 Session 3 against the
// native `TreeView`.
//
// The contract is unchanged. `readCancellationState` consults
// `session-state.json`'s `status` first; the markdown markers
// (`CANCELLED.md` / `RESTORED.md`) remain audit-trail artifacts and the
// legacy fallback when no usable state file is present. Three scenarios pin
// it on rendered output:
//
//   1. state file says `cancelled`, no `CANCELLED.md` -> Cancelled bucket;
//   2. no usable state file + `CANCELLED.md` present -> Cancelled bucket via
//      the legacy file-presence fallback;
//   3. state file says `complete` + a stray `CANCELLED.md` -> Complete
//      bucket. The marker is an operator-resolvable inconsistency, never a
//      silent override.
//
// Carrier change. The webview stamped `data-state="cancelled"` on the row
// and rendered a `Cancelled (1)` bucket header. Neither exists natively — and
// neither needs to, because BUCKET MEMBERSHIP *is* the assertion this file
// was always making. A row that appears under Cancelled is bucketed
// cancelled; the `data-state` attribute was a second, redundant expression of
// the same fact. Asserting membership is strictly stronger than asserting the
// attribute, since the attribute could have been right while the grouping was
// wrong.
//
// The bucket-rendering rule, checked against `orderedBuckets` rather than
// assumed — an earlier draft of this file asserted the wrong thing and the
// suite caught it:
//
//   - the THREE DEFAULT buckets (In Progress / Not Started / Complete) render
//     always, even at zero sets, because a declared module with no work yet
//     should still show where that work will land. An empty one is a LEAF, so
//     no twisty opens onto nothing.
//   - CANCELLED is a fourth bucket and is CONDITIONAL: `orderedBuckets` emits
//     it only when it has sets. That matches the webview exactly, so scenario
//     3's original `toHaveCount(0)` translates literally.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cancelSet,
  cleanupTmpDir,
  closeVSCode,
  driveHappyPath,
  expandTreeRow,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
  treeRows,
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

test.describe("Set 035 — cancellation bucketing, on the native tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("state file says cancelled with no CANCELLED.md -> Cancelled bucket", async () => {
    per.tmpPath = makeTmpDir("dabbler-cancel-state");
    const h = makeSet(per.tmpPath, "035-state-only-cancelled", 2);

    // Run the canonical writer so `state.status` flips to "cancelled" with
    // the matching `preCancelStatus`, then delete `CANCELLED.md` so the set
    // looks like the post-Set-035 contract with the markdown marker absent.
    cancelSet(h);
    const cancelledPath = path.join(h.set_dir, "CANCELLED.md");
    expect(fs.existsSync(cancelledPath)).toBe(true);
    fs.unlinkSync(cancelledPath);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await expandTreeRow(pane, "Default");

    await expect(treeRow(pane, "Cancelled")).toContainText("1 set");
    await expandTreeRow(pane, "Cancelled");
    await expect(treeRow(pane, "035-state-only-cancelled")).toBeVisible();
  });

  test("no state file + CANCELLED.md present -> Cancelled bucket (legacy fallback)", async () => {
    per.tmpPath = makeTmpDir("dabbler-cancel-fallback");
    const h = makeSet(per.tmpPath, "035-legacy-fallback-cancelled", 2);

    // Cancel via the canonical writer (which produces both signals), then
    // remove `session-state.json` so the reader's state-file branch returns
    // "unknown" and falls through to `isCancelled(dir)`.
    cancelSet(h);
    const statePath = path.join(h.set_dir, "session-state.json");
    expect(fs.existsSync(path.join(h.set_dir, "CANCELLED.md"))).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);
    fs.unlinkSync(statePath);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await expandTreeRow(pane, "Default");

    await expect(treeRow(pane, "Cancelled")).toContainText("1 set");
    await expandTreeRow(pane, "Cancelled");
    await expect(treeRow(pane, "035-legacy-fallback-cancelled")).toBeVisible();
  });

  test("status complete + stray CANCELLED.md -> Complete bucket (state file wins)", async () => {
    per.tmpPath = makeTmpDir("dabbler-cancel-asym");
    // A one-session set so `driveHappyPath` closes the whole set on session
    // 1 and the change-log gate is satisfied.
    const h = makeSet(per.tmpPath, "035-asymmetric-stray-marker", 1);
    driveHappyPath(h, 1);

    const statePath = path.join(h.set_dir, "session-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(state.status).toBe("complete");

    // A stray `CANCELLED.md` by hand — a manual edit or a non-canonical
    // writer. The state-file-first reader must NOT bucket this as Cancelled.
    fs.writeFileSync(
      path.join(h.set_dir, "CANCELLED.md"),
      "# Cancellation history\n\nCancelled on 2026-05-21T10:00:00-04:00\nstray marker (test)\n\n",
      "utf8",
    );

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await expandTreeRow(pane, "Default");

    // The state file wins: the row is under Complete, and no Cancelled
    // bucket is rendered at all — `orderedBuckets` emits that fourth bucket
    // only when it has sets, exactly as the webview did.
    await expect(treeRow(pane, "Complete")).toContainText("1 set");
    await expect(treeRows(pane).filter({ hasText: "Cancelled" })).toHaveCount(0);

    await expandTreeRow(pane, "Complete");
    await expect(treeRow(pane, "035-asymmetric-stray-marker")).toBeVisible();
  });
});
