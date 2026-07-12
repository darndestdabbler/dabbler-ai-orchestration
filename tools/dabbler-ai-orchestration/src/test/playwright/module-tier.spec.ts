// Set 087 Session 2 — Layer-3 Playwright smoke for the Explorer module
// tier (module → status-bucket → row). Asserts what the operator
// actually sees painted in the webview for a MULTI-MODULE workspace:
//
//   - one collapsible module group per manifest module (manifest file
//     order), the unlabeled implicit module last with the quiet
//     "(ungrouped)" fallback label (routed ruling Q1);
//   - the 4-level ARIA contract (Set 093 S1): module aria-level=1, the
//     persistent Plan / Session sets child nodes aria-level=2, bucket
//     aria-level=3, row aria-level=4 — the persistent children inserted a
//     level above the Set 092 three-level tree;
//   - per-(module, bucket) composite collapse keys (ruling Q4);
//   - rows grouped under their own module;
//   - module-header click collapses the whole group.
//
// The no-manifest / sole-pseudo half of the contract (a repo with one
// implicit module) is asserted in session-sets-tree.spec.ts against its
// manifest-less fixtures.

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

    // Set 093 S1: 4-level ARIA tree contract — module 1 / Plan &
    // Session sets 2 / bucket 3 / row 4. Every level is a treeitem;
    // children nest in role="group" containers.
    const greeterModule = inner.getByTestId("module-declared-greeter");
    await expect(greeterModule).toHaveAttribute("role", "treeitem");
    await expect(greeterModule).toHaveAttribute("aria-level", "1");
    await expect(greeterModule.locator("> .module-body")).toHaveAttribute(
      "role",
      "group",
    );

    // The two persistent semantic child nodes at level 2 (fixed pair).
    // The fixture ships no plan file, so every module's Plan reads
    // "missing"; greeter holds one (not-started) set, so its Session sets
    // node is "bucketed" and expandable with the buckets nested under it.
    const greeterPlan = greeterModule.getByTestId(
      "module-declared-greeter-plan",
    );
    await expect(greeterPlan).toHaveAttribute("role", "treeitem");
    await expect(greeterPlan).toHaveAttribute("aria-level", "2");
    await expect(greeterPlan).toHaveAttribute("aria-setsize", "2");
    await expect(greeterPlan).toHaveAttribute("aria-posinset", "1");
    await expect(greeterPlan).toHaveAttribute("data-plan-state", "missing");

    const greeterSessionSets = greeterModule.getByTestId(
      "module-declared-greeter-session-sets",
    );
    await expect(greeterSessionSets).toHaveAttribute("role", "treeitem");
    await expect(greeterSessionSets).toHaveAttribute("aria-level", "2");
    await expect(greeterSessionSets).toHaveAttribute("aria-posinset", "2");
    await expect(greeterSessionSets).toHaveAttribute(
      "data-session-sets-state",
      "bucketed",
    );
    await expect(greeterSessionSets).toHaveAttribute("aria-expanded", "true");
    await expect(
      greeterSessionSets.locator("> .child-body"),
    ).toHaveAttribute("role", "group");

    const greeterNotStarted = greeterSessionSets.locator(
      '[data-bucket-key="declared-greeter/not-started"]',
    );
    await expect(greeterNotStarted).toHaveCount(1);
    await expect(greeterNotStarted).toHaveAttribute("role", "treeitem");
    await expect(greeterNotStarted).toHaveAttribute("aria-level", "3");
    await expect(greeterNotStarted.locator("> .bucket-body")).toHaveAttribute(
      "role",
      "group",
    );
    const greeterRow = inner.locator(
      '[role="treeitem"][data-slug="087-greeter-core"]',
    );
    await expect(greeterRow).toBeVisible();
    await expect(greeterRow).toHaveAttribute("aria-level", "4");

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

    // Set 093 S1: the Session sets child node collapses independently —
    // its buckets + rows fold away while the module and the Plan sibling
    // stay visible (the checklist never vanishes).
    await greeterSessionSets.locator(".child-header").click();
    await expect(greeterSessionSets).toHaveAttribute("aria-expanded", "false");
    await expect(greeterRow).toBeHidden();
    await expect(greeterPlan).toBeVisible();
    await greeterSessionSets.locator(".child-header").click();
    await expect(greeterSessionSets).toHaveAttribute("aria-expanded", "true");
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

test("invalid manifest pins System Status and retains the last-known-good tree until repair", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-manifest-guard");
    const fixture = makeSet(per.tmpPath, "092-manifest-guard", 2);
    stampModule(fixture, "greeter");
    const manifestPath = path.join(fixture.repo_root, "docs", "modules.yaml");
    fs.writeFileSync(manifestPath, MODULES_YAML, "utf8");

    for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      fs.writeFileSync(path.join(fixture.repo_root, name), `# ${name}\n`, "utf8");
    }
    fs.mkdirSync(
      path.join(fixture.repo_root, ".venv", "Lib", "site-packages", "ai_router"),
      { recursive: true },
    );
    fs.mkdirSync(path.join(fixture.repo_root, ".venv", "Scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.repo_root, ".venv", "Scripts", "python.exe"),
      "",
      "utf8",
    );
    fs.mkdirSync(path.join(fixture.repo_root, ".dabbler"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.repo_root, ".dabbler", "tier"),
      "lightweight\n",
      "utf8",
    );

    per.launch = await launchVSCode(fixture.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    await expect(inner.getByTestId("module-declared-greeter")).toBeVisible({
      timeout: 30_000,
    });
    await expect(inner.getByTestId("system-status")).toHaveCount(0);

    fs.writeFileSync(manifestPath, "modules: [\n", "utf8");
    const status = inner.getByTestId("system-status");
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(status.locator('[data-status-code="manifest-invalid"]')).toContainText(
      "last-known-good module tree",
    );
    await expect(inner.getByTestId("module-declared-greeter")).toBeVisible();
    expect(fs.readFileSync(manifestPath, "utf8")).toBe("modules: [\n");

    const repaired = MODULES_YAML.replace("title: Greeter", "title: Greeter Repaired");
    fs.writeFileSync(manifestPath, repaired, "utf8");
    await expect(status).toHaveCount(0, { timeout: 30_000 });
    await expect(inner.getByTestId("module-declared-greeter").locator(".module-title"))
      .toHaveText("Greeter Repaired");
  } finally {
    await teardown(per);
  }
});

// Set 092 S2 (UAT Walk 4): a working repo that already has session sets
// must show NO System Status strip, even when the scaffold-structure
// proxy (`detectCompletion().structureBuilt`) reads false — which is the
// on-disk shape of the canonical dev repo's editable `pip install -e .`:
// a `.venv` exists but no `ai_router` package dir sits under
// site-packages. The invalid-manifest fixture above happens to scaffold
// that dir, so it could not catch this; this fixture deliberately omits
// it and asserts the strip stays absent (`hasAnySets` clears the fault).
test("list-mode repo without a scaffolded router package shows no System Status strip", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-editable-install");
    const fixture = makeSet(per.tmpPath, "092-editable-install", 2);

    for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      fs.writeFileSync(path.join(fixture.repo_root, name), `# ${name}\n`, "utf8");
    }
    // A venv EXISTS but carries no site-packages/ai_router dir — the
    // editable-install shape that makes structureBuilt read false.
    fs.mkdirSync(path.join(fixture.repo_root, ".venv", "Scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.repo_root, ".venv", "Scripts", "python.exe"),
      "",
      "utf8",
    );
    // Lightweight tier so the provider-key fault is gated out, isolating
    // the workspace-init behavior (the runner has Python, so no Python
    // fault either — the only fault that could fire here is workspace-init).
    fs.mkdirSync(path.join(fixture.repo_root, ".dabbler"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.repo_root, ".dabbler", "tier"),
      "lightweight\n",
      "utf8",
    );

    per.launch = await launchVSCode(fixture.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    // The tree renders (list mode — the repo has a session set)...
    await expect(inner.getByTestId("work-explorer-tree")).toBeVisible({
      timeout: 30_000,
    });
    // ...and no System Status strip appears: a repo with sets is
    // initialized by construction, so the false structureBuilt proxy
    // must not surface a workspace-init fault.
    await expect(inner.getByTestId("system-status")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});
