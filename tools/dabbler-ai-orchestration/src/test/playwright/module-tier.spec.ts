// Set 087 Session 2 — Layer-3 Playwright smoke for the Explorer module
// tier (module → status-bucket → row). Asserts what the operator
// actually sees painted in the webview for a MULTI-MODULE workspace:
//
//   - one collapsible module group per manifest module (manifest file
//     order), the unlabeled implicit module last with the quiet
//     "(ungrouped)" fallback label (routed ruling Q1);
//   - the 3-level ARIA contract: module header aria-level=1, bucket
//     header aria-level=2, row aria-level=3 (ruling Q4);
//   - per-(module, bucket) composite collapse keys (ruling Q4);
//   - rows grouped under their own module;
//   - module-header click collapses the whole group.
//
// The no-manifest backward-compat half of ruling Q4 (rows stay at
// aria-level=2, zero .module elements) is asserted in
// session-sets-tree.spec.ts against its manifest-less fixtures.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  FixtureHandle,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
  triggerRefresh,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

async function teardown(per: PerTest): Promise<void> {
  const errs: unknown[] = [];
  if (per.launch) {
    try { await closeVSCode(per.launch); } catch (e) { errs.push(e); }
  }
  if (per.tmpPath) {
    try { cleanupTmpDir(per.tmpPath); } catch (e) { errs.push(e); }
  }
  if (errs.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("teardown errors:", errs);
  }
}

const MODULES_YAML = [
  "modules:",
  "  - slug: greeter",
  "    title: Greeter",
  "    codeRoots: [services/greeter]",
  "  - slug: clock",
  "    title: Clock",
  "    codeRoots: [services/clock]",
  "  - slug: integration",
  "    title: Cross-Module Integration",
  "    codeRoots: []",
  "    touches: [greeter, clock]",
  "",
].join("\n");

// Stamp `module: <slug>` into the harness fixture's Session Set
// Configuration YAML block (the extension parses the key from there).
// Newline-agnostic: the Python harness writes the spec in text mode, so
// the file carries \r\n on Windows and \n elsewhere — the inserted line
// reuses whatever EOL the anchor line has (the CI windows-latest run
// 29123889271 caught the \n-only version never matching on Windows).
function stampModule(h: FixtureHandle, moduleSlug: string): void {
  const specPath = path.join(h.set_dir, "spec.md");
  const spec = fs.readFileSync(specPath, "utf8");
  const patched = spec.replace(
    /requiresE2E: false(\r?\n)/,
    (_m, eol: string) =>
      `requiresE2E: false${eol}module: ${moduleSlug}${eol}`,
  );
  if (patched === spec) {
    throw new Error(`could not stamp module: into ${specPath}`);
  }
  fs.writeFileSync(specPath, patched, "utf8");
}

test("multi-module workspace renders one dialect with fallback warning and Unassigned last", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-modtier");
    // Manifest order is greeter → clock → integration; the sets are
    // created in a DIFFERENT order so the smoke discriminates manifest
    // order from directory/creation order. A fourth set stays
    // unlabeled → the implicit "(ungrouped)" group, last.
    const a = makeSet(per.tmpPath, "087-clock-widget", 2);
    const b = makeAdditionalSet(a, "087-greeter-core", 2);
    const c = makeAdditionalSet(a, "087-compose-both", 2);
    const d = makeAdditionalSet(a, "087-loose-end", 2);
    const e = makeAdditionalSet(a, "087-undeclared", 2);
    stampModule(a, "clock");
    stampModule(b, "greeter");
    stampModule(c, "integration");
    stampModule(e, "not-in-manifest");
    void d; // deliberately unlabeled
    fs.writeFileSync(
      path.join(a.repo_root, "docs", "modules.yaml"),
      MODULES_YAML,
      "utf8",
    );

    per.launch = await launchVSCode(a.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const tree = inner.getByTestId("work-explorer-tree");
    await expect(tree).toBeVisible({ timeout: 30_000 });

    // Module groups render in manifest file order, implicit last —
    // regardless of set creation order.
    const titles = inner.locator(".module-title");
    await expect(titles).toHaveText([
      "Greeter",
      "Clock",
      "Cross-Module Integration",
      "not-in-manifest",
      "Unassigned",
    ]);
    const fallbackModule = inner.getByTestId("module-fallback-not-in-manifest");
    await expect(fallbackModule.locator(".module-warning")).toHaveCount(1);
    await expect(fallbackModule.locator(".module-warning")).toHaveAttribute(
      "title",
      /not declared in docs\/modules\.yaml/,
    );

    // 3-level ARIA tree contract (ruling Q4 + the R2 conformance fix):
    // module and bucket are treeitems carrying aria-level/aria-expanded
    // themselves, with children nested in role="group" containers.
    const greeterModule = inner.getByTestId("module-declared-greeter");
    await expect(greeterModule).toHaveAttribute("role", "treeitem");
    await expect(greeterModule).toHaveAttribute("aria-level", "1");
    await expect(greeterModule.locator("> .module-body")).toHaveAttribute(
      "role",
      "group",
    );
    const greeterNotStarted = greeterModule.locator(
      '[data-bucket-key="declared-greeter/not-started"]',
    );
    await expect(greeterNotStarted).toHaveCount(1);
    await expect(greeterNotStarted).toHaveAttribute("role", "treeitem");
    await expect(greeterNotStarted).toHaveAttribute("aria-level", "2");
    await expect(greeterNotStarted.locator("> .bucket-body")).toHaveAttribute(
      "role",
      "group",
    );
    const greeterRow = inner.locator(
      '[role="treeitem"][data-slug="087-greeter-core"]',
    );
    await expect(greeterRow).toBeVisible();
    await expect(greeterRow).toHaveAttribute("aria-level", "3");

    // Rows land under their OWN module group.
    await expect(
      greeterModule.locator('[role="treeitem"][data-slug="087-greeter-core"]'),
    ).toHaveCount(1);
    await expect(
      greeterModule.locator('[role="treeitem"][data-slug="087-clock-widget"]'),
    ).toHaveCount(0);
    const implicitModule = inner.getByTestId("module-pseudo-default");
    await expect(
      implicitModule.locator('[role="treeitem"][data-slug="087-loose-end"]'),
    ).toHaveCount(1);

    // Module collapse: clicking the header hides the whole group body
    // (buckets + rows) and flips aria-expanded on the treeitem.
    await expect(greeterModule).toHaveAttribute("aria-expanded", "true");
    await greeterModule.locator(".module-header").click();
    await expect(greeterModule).toHaveAttribute("aria-expanded", "false");
    await expect(greeterRow).toBeHidden();
    // Re-expand restores it.
    await greeterModule.locator(".module-header").click();
    await expect(greeterRow).toBeVisible();

    // Keyboard operability (R2 fix): the module node is focusable and
    // Enter toggles it; ArrowLeft collapses; ArrowRight re-expands —
    // the WAI-ARIA tree pattern.
    await greeterModule.press("Enter");
    await expect(greeterModule).toHaveAttribute("aria-expanded", "false");
    await expect(greeterRow).toBeHidden();
    await greeterModule.press("ArrowRight");
    await expect(greeterModule).toHaveAttribute("aria-expanded", "true");
    await expect(greeterRow).toBeVisible();
    await greeterModule.press("ArrowLeft");
    await expect(greeterModule).toHaveAttribute("aria-expanded", "false");
    await greeterModule.press(" ");
    await expect(greeterModule).toHaveAttribute("aria-expanded", "true");
    // Bucket nodes are keyboard-operable too.
    await greeterNotStarted.press("Enter");
    await expect(greeterNotStarted).toHaveAttribute("aria-expanded", "false");
    await expect(greeterRow).toBeHidden();
    await greeterNotStarted.press("Enter");
    await expect(greeterRow).toBeVisible();
  } finally {
    await teardown(per);
  }
});
