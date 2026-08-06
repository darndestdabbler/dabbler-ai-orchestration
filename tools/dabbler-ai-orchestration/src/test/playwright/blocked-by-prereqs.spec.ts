// Layer 3 rendering smoke for the blocked-by-prerequisites signal
// (Set 061 S2 spec D3), re-expressed by Set 110 Session 3 against the native
// `TreeView`.
//
// The behaviour is unchanged and all four scenarios survive; only the
// CARRIER moved. The webview rendered a quiet chain-glyph marker span with a
// `title` attribute next to the row name. A `TreeItem` has one icon slot, and
// "blocked" is RANK 1 of the icon precedence table — the most severe state a
// set row can be in — so it resolves to a themed `error` codicon and the
// explanatory text moves into the markdown tooltip.
//
// Two assertions are therefore made where the old file made one:
//
//   1. the row IS flagged (the error codicon is present), and
//   2. an unblocked row is NOT, which is the assertion that actually failed
//      when the derivation was wrong.
//
// The exact tooltip STRING is no longer asserted here. It moved into
// `setTooltip`, which Layer 2 drives directly and cheaply
// (`workExplorerTreeModel.test.ts`); re-asserting it through a ~40-second
// real-host launch bought nothing the unit test does not already pin. That
// `title` assertion is the one thing in the old file deliberately dropped,
// and this is the record of why.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  expectFileIcon,
  LaunchedVSCode,
  launchVSCode,
  makeAdditionalSet,
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

function appendPrerequisitesToSpec(setDir: string, prereqSlugs: string[]): void {
  // The harness emits a spec.md with a fenced ``yaml`` Session Set
  // Configuration block. Append `prerequisites:` INSIDE that block so the
  // parser picks them up.
  const specPath = path.join(setDir, "spec.md");
  const original = fs.readFileSync(specPath, "utf8");
  const prereqsBlock = [
    "prerequisites:",
    ...prereqSlugs.map((slug) => `  - slug: ${slug}\n    condition: complete`),
  ].join("\n");
  const updated = original.replace(
    /(##\s*Session Set Configuration[\s\S]*?```ya?ml[\s\S]*?)(\n```)/i,
    (_full, before: string, fenceClose: string) =>
      `${before}\n${prereqsBlock}${fenceClose}`,
  );
  // A silently no-op fixture edit is how this class of test fails several
  // steps later looking like a product bug (the lesson `stampModule` in
  // native-tree.spec.ts already carries).
  if (updated === original) {
    throw new Error(
      `appendPrerequisitesToSpec: no config block in ${specPath}; the fixture template changed`,
    );
  }
  fs.writeFileSync(specPath, updated, "utf8");
}

function setStatusToComplete(setDir: string): void {
  const statePath = path.join(setDir, "session-state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<
    string,
    unknown
  >;
  state.status = "complete";
  if (Array.isArray(state.sessions)) {
    for (const entry of state.sessions as Array<Record<string, unknown>>) {
      entry.status = "complete";
    }
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Drill to a set row in whichever bucket its state puts it. */
async function setRow(
  pane: import("@playwright/test").Locator,
  bucket: string,
  slug: string,
) {
  await expandTreeRow(pane, "Default");
  await expandTreeRow(pane, bucket);
  const row = treeRow(pane, slug);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  return row;
}

test.describe("Set 061 S2 — blocked-by-prerequisites, on the native tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("flags the dependant when the prereq target is not complete", async () => {
    per.tmpPath = makeTmpDir("dabbler-prereq-blocked");
    const prereq = makeSet(per.tmpPath, "044-prereq", 1);
    const dep = makeAdditionalSet(prereq, "047-dependant", 2);
    appendPrerequisitesToSpec(dep.set_dir, ["044-prereq"]);

    per.launch = await launchVSCode(dep.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    const depRow = await setRow(pane, "Not Started", "047-dependant");
    await expectFileIcon(depRow, "not-started.svg");

    // The prereq itself declares no prerequisites, so it must not be
    // flagged — the assertion that catches an over-broad derivation.
    const prereqRow = treeRow(pane, "044-prereq");
    await expectFileIcon(prereqRow, "not-started.svg");
  });

  test("does not flag the dependant when the prereq target is complete", async () => {
    per.tmpPath = makeTmpDir("dabbler-prereq-unblocked");
    const prereq = makeSet(per.tmpPath, "044-prereq-done", 1);
    setStatusToComplete(prereq.set_dir);
    const dep = makeAdditionalSet(prereq, "047-unblocked", 2);
    appendPrerequisitesToSpec(dep.set_dir, ["044-prereq-done"]);

    per.launch = await launchVSCode(dep.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    const depRow = await setRow(pane, "Not Started", "047-unblocked");
    await expectFileIcon(depRow, "not-started.svg");
  });

  test("suppresses the flag on a terminal-state row", async () => {
    // Set 077 S5 carry-forward: the cross-reference still DERIVES blocked,
    // but once a set is closed its dependency status is not actionable, so
    // the marker is suppressed. That is a suppression rule in our own code,
    // not the platform's, which is why it stays at Layer 3.
    per.tmpPath = makeTmpDir("dabbler-prereq-terminal");
    const prereq = makeSet(per.tmpPath, "044-still-not-started", 1);
    const dep = makeAdditionalSet(prereq, "047-completed-dep", 1);
    appendPrerequisitesToSpec(dep.set_dir, ["044-still-not-started"]);
    setStatusToComplete(dep.set_dir);

    per.launch = await launchVSCode(dep.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    const depRow = await setRow(pane, "Complete", "047-completed-dep");
    await expectFileIcon(depRow, "done.svg");
  });

  test("never flags a set that declares no prerequisites", async () => {
    per.tmpPath = makeTmpDir("dabbler-prereq-absent");
    const handle = makeSet(per.tmpPath, "047-standalone", 1);

    per.launch = await launchVSCode(handle.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    const row = await setRow(pane, "Not Started", "047-standalone");
    await expectFileIcon(row, "not-started.svg");
  });
});
