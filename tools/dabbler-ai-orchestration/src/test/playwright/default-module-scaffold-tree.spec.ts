// Set 101 Session 1 — Layer-3 Playwright rendering smoke for the
// default-module scaffold (Set 101 S1 verification round 1, Major:
// "Required Work Explorer end-state tests are missing"). The Node-level
// unit suite (gitScaffoldDefaultModule.test.ts) proves the SCAFFOLD
// WRITER produces the right files and, via computeVisibleModules /
// buildVisibleModulePayloads, the right in-memory model — but neither of
// those exercises the REAL webview in a REAL VS Code Electron instance.
// This spec closes that gap: it seeds the EXACT fixture shape
// scaffoldDefaultModuleAndLifecycleSets produces (a declared `default`
// module with a `kind: plan` set and a `kind: decomposition` set
// prereq-linked to it) and asserts the tree the operator actually sees —
// one declared module, two pending rows, kind chips, the decomposition
// row's blocked marker, and NO pseudo-module alongside it.
//
// Driving the Build button itself (which runs a real venv + network pip
// install) and the native rename/delete input-box + confirm-dialog flow
// are OUT of scope here, consistent with this repo's own documented
// Playwright boundary (context-menu-quickpick.spec.ts's header: driving
// the outer VS Code QuickPick/dialog layer from inside a Playwright frame
// is brittle) and the known-broken @vscode/test-electron harness noted in
// CONTRIBUTING.md — those flows are covered by
// renameModule.test.ts / deleteModule.test.ts's `preselectedSlug` suites
// and this session's writer-level dogfood (s1-dogfood.md) instead.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
  triggerRefresh,
} from "./electronLaunch";

// Must match BLOCKED_MARKER in src/providers/SessionSetsModel.ts (also
// pinned by blocked-by-prereqs.spec.ts).
const BLOCKED_MARKER = "⛓︎";

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
    console.warn("teardown errors:", errs);
  }
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

test("fresh default-module scaffold: one declared module, two pending rows, plan-then-decomposition gating, no pseudo-module", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-default-module");
    // Exactly the two lifecycle sets scaffoldModuleLifecycleSets produces
    // for the `default` module (Set 098 templates: single-session, kind +
    // module stamped, decomposition prereq-linked to the plan).
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
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const tree = inner.getByTestId("work-explorer-tree");
    await expect(tree).toBeVisible({ timeout: 30_000 });

    // Exactly one module group, titled "Default" (the manifest's title,
    // not the pseudo-module's fallback label), no pseudo-module alongside
    // it — the Class1 starter's whole point.
    await expect(inner.locator(".module-title")).toHaveText(["Default"]);
    const defaultModule = inner.getByTestId("module-declared-default");
    await expect(defaultModule).toBeVisible();
    await expect(inner.getByTestId("module-pseudo-default")).toHaveCount(0);

    const planRow = inner.locator('[role="treeitem"][data-slug="001-default-plan"]');
    const decompRow = inner.locator(
      '[role="treeitem"][data-slug="002-default-decomposition"]',
    );
    await expect(planRow).toBeVisible();
    await expect(decompRow).toBeVisible();
    // Both rows land under the one declared module, and nowhere else.
    await expect(defaultModule.locator('[data-slug="001-default-plan"]')).toHaveCount(1);
    await expect(defaultModule.locator('[data-slug="002-default-decomposition"]')).toHaveCount(1);

    // Kind chips.
    await expect(planRow.locator(".row-kind-badge")).toHaveText("plan");
    await expect(decompRow.locator(".row-kind-badge")).toHaveText("decomposition");

    // The Class1 plan-first-then-decomposition gate: the plan is ready
    // (no prereqs), the decomposition is blocked on it (not yet complete).
    await expect(planRow.locator(".row-blocked-marker")).toHaveCount(0);
    await expect(decompRow.locator(".row-blocked-marker")).toHaveText(BLOCKED_MARKER);
  } finally {
    await teardown(per);
  }
});
