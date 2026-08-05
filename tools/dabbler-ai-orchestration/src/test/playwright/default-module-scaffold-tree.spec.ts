// Set 101 Session 1 — Layer 3 rendering smoke for the default-module
// scaffold, re-expressed by Set 110 Session 3 against the native `TreeView`.
//
// The Node-level unit suite (`gitScaffoldDefaultModule.test.ts`) proves the
// scaffold WRITER produces the right files and the right in-memory model;
// neither exercises a real VS Code instance. This spec seeds the exact
// fixture shape `scaffoldDefaultModuleAndLifecycleSets` produces — a declared
// `default` module with a `kind: plan` set and a `kind: decomposition` set
// prereq-linked to it — and asserts the tree the operator actually sees.
//
// Carrier changes, all of them the same trade:
//
//   - the module identity was `data-testid="module-declared-default"`; it is
//     now the row's LABEL, which is what the operator reads anyway;
//   - the kind chip ("plan" / "decomposition") was a rendered span. A set row
//     has no description and one icon slot, so kind moved into the tooltip.
//     `workExplorerTreeModel.test.ts` pins it there and this file drops it —
//     asserting a tooltip through a 40-second host launch buys nothing.
//   - the blocked marker was a `⛓︎` span; it is now RANK 1 of the icon
//     precedence table, so the decomposition row carries an error codicon.
//
// The plan-then-decomposition GATE is the load-bearing behaviour and it is
// asserted more sharply than before: the plan row must be unflagged and the
// decomposition row flagged, in the same fixture, so a derivation that
// flagged everything or nothing fails.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  LaunchedVSCode,
  launchVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
  treeRows,
} from "./electronLaunch";

const MODULES_YAML = [
  "modules:",
  "  - slug: default",
  "    title: Default",
  "    codeRoots: []",
  "    planPath: docs/modules/default/project-plan.md",
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

function stampConfigLines(setDir: string, lines: string[]): void {
  const specPath = path.join(setDir, "spec.md");
  const original = fs.readFileSync(specPath, "utf8");
  const patched = original.replace(
    /requiresE2E: false(\r?\n)/,
    (_m, eol: string) => `requiresE2E: false${eol}${lines.join(`${eol}`)}${eol}`,
  );
  if (patched === original) {
    throw new Error(`could not stamp config lines into ${specPath}`);
  }
  fs.writeFileSync(specPath, patched, "utf8");
}

test("fresh default-module scaffold renders one declared module with the plan gate live", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-default-module");
    // Exactly the two lifecycle sets the scaffold produces for the `default`
    // module (Set 098 templates: single-session, kind + module stamped, the
    // decomposition prereq-linked to the plan).
    const plan = makeSet(per.tmpPath, "001-default-plan", 1);
    const decomposition = makeAdditionalSet(plan, "002-default-decomposition", 1);
    stampConfigLines(plan.set_dir, ["kind: plan", "module: default"]);
    stampConfigLines(decomposition.set_dir, [
      "kind: decomposition",
      "module: default",
      "prerequisites:",
      "  - slug: 001-default-plan",
      "    condition: complete",
    ]);
    fs.writeFileSync(
      path.join(plan.repo_root, "docs", "modules.yaml"),
      MODULES_YAML,
      "utf8",
    );

    per.launch = await launchVSCode(plan.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    // Exactly ONE module row — the manifest's declared `default`, with no
    // pseudo module alongside it. That is the starter scaffold's whole
    // point, and before expansion the root rows ARE the modules.
    await expect(treeRows(pane)).toHaveCount(1);
    await expect(treeRow(pane, "Default")).toBeVisible();
    await expect(treeRow(pane, "Default")).toContainText("2 sets");

    await expandTreeRow(pane, "Default");
    await expandTreeRow(pane, "Not Started");

    const planRow = treeRow(pane, "001-default-plan");
    const decompRow = treeRow(pane, "002-default-decomposition");
    await expect(planRow).toBeVisible();
    await expect(decompRow).toBeVisible();

    // The gate: the plan is ready (no prerequisites), the decomposition is
    // blocked on it until it completes.
    await expect(planRow.locator(".codicon-error")).toHaveCount(0);
    await expect(decompRow.locator(".codicon-error")).toHaveCount(1);
  } finally {
    await teardown(per);
  }
});
