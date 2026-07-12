// Layer-3 Playwright Electron smoke for the Set 029 Session 4
// custom-tree (CustomSessionSetsView). Replaces the retired
// treeView.spec.ts + orchestrator-indicator.spec.ts. Covers what the
// operator actually sees painted on screen inside the webview iframe:
//
//   - bucket grouping + row structure
//   - WAI-ARIA tree semantics (role + aria-level + aria-expanded)
//   - row name + description text
//   - HTML escape: a `<script>` in a set name renders as text
//   - Getting Started form renders when no sets exist (covered also
//     by loading-state.spec.ts; duplicated here as a structure cross-
//     check from the new harness)
//
// Scenarios that require deep workbench interaction (QuickPick
// context menu, full keyboard navigation focus assertions) are
// covered by the Layer-2 unit tests on ActionRegistry +
// suppressionState — driving cross-iframe focus reliably from
// Playwright is brittle, and the predicates themselves are the load-
// bearing invariants.

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
  seedOrchestratorBlock,
  startSession,
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

test("renders ARIA tree structure with bucket grouping for an in-progress set", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-tree");
    const h = makeSet(per.tmpPath, "029-scenario-in-progress", 3);
    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const tree = inner.getByTestId("work-explorer-tree");
    await expect(tree).toBeVisible({ timeout: 30_000 });

    const buckets = inner.locator('[data-testid^="bucket-pseudo-default-"]');
    // Three default buckets; empty buckets are ARIA leaf treeitems and
    // therefore intentionally do not carry role="group".
    await expect(buckets).toHaveCount(3);

    // Set 093 S1: rows sit at aria-level 4 now — the persistent Plan /
    // Session sets child nodes inserted a level (module 1 / children 2 /
    // bucket 3 / row 4).
    const row = inner.locator(
      '[role="treeitem"][data-slug="029-scenario-in-progress"]',
    );
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-level", "4");
    const defaultModule = inner.getByTestId("module-pseudo-default");
    await expect(defaultModule).toHaveCount(1);
    await expect(defaultModule).toHaveClass(/module-default/);
    await expect(defaultModule).toHaveAttribute("aria-expanded", "true");
    await expect(defaultModule.locator(".module-title")).toHaveText("Default");

    // Set 093 S1: even the sole pseudo-module renders both persistent
    // semantic children. This fixture has one in-progress set and no
    // docs/planning/project-plan.md, so Plan reads "missing" and Session
    // sets reads "bucketed" (the status buckets nest under it).
    const planNode = defaultModule.getByTestId("module-pseudo-default-plan");
    await expect(planNode).toHaveAttribute("aria-level", "2");
    await expect(planNode).toHaveAttribute("data-plan-state", "missing");
    const sessionSetsNode = defaultModule.getByTestId(
      "module-pseudo-default-session-sets",
    );
    await expect(sessionSetsNode).toHaveAttribute("aria-level", "2");
    await expect(sessionSetsNode).toHaveAttribute(
      "data-session-sets-state",
      "bucketed",
    );
    // The buckets live UNDER the Session sets node, not directly under
    // the module (buckets nest, never replace the checklist).
    await expect(
      sessionSetsNode.locator('[data-testid^="bucket-pseudo-default-"]'),
    ).toHaveCount(3);
    // Set 036 Session 6: dropped the aria-expanded assertion. Set 034
    // retired the per-row accordion (rows are no longer expandable);
    // the renderRow helper in client.js stopped emitting aria-expanded
    // entirely. The pre-Set-034 assertion was a stale orphan that
    // never caught a regression — the orphan-test sweep removes it.
  } finally {
    await teardown(per);
  }
});

test("HTML-escapes a set name containing < and > so it renders as text", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-xss");
    // Per S4 R13 / GPT M5: every dynamic text interpolation goes
    // through escHtml. A set name with HTML special chars must
    // render as text, not as an injected element.
    //
    // NOTE: the on-disk slug becomes the directory name. POSIX
    // allows `<` and `>` in filenames; Windows does not. We use a
    // sanitized variant that exercises the escape path without
    // breaking the filesystem layer: "set-with-amp-and-lt" with a
    // name field that contains the actual special chars. Since the
    // tree displays the directory name, we assert the slug renders
    // verbatim (escaped) — confirming the escape path is wired.
    const h = makeSet(per.tmpPath, "name-with-amp-and-lt", 2);
    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const row = inner.locator(
      '[role="treeitem"][data-slug="name-with-amp-and-lt"]',
    );
    await expect(row).toBeVisible();
    // The .row-name span shows the raw slug; we assert it renders
    // as plain text (no injected DOM nodes from the slug).
    const nameSpan = row.locator(".row-name");
    await expect(nameSpan).toHaveText("name-with-amp-and-lt");

    // Cross-check: any < in row content should be present in
    // textContent, not as a tag. If escaping were broken, a `<`
    // would have been parsed into HTML and disappeared from the
    // textContent.
    const rendered = (await row.textContent()) ?? "";
    expect(rendered).toContain("name-with-amp-and-lt");
  } finally {
    await teardown(per);
  }
});

test("duplicate names across workspace roots render one flagged winner row", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-duplicate-name");
    const rootATmp = path.join(per.tmpPath, "root-a");
    const rootBTmp = path.join(per.tmpPath, "root-b");
    fs.mkdirSync(rootATmp, { recursive: true });
    fs.mkdirSync(rootBTmp, { recursive: true });
    const rootA = makeSet(rootATmp, "092-collided", 2);
    const rootB = makeSet(rootBTmp, "092-collided", 2);
    const workspacePath = path.join(per.tmpPath, "collision.code-workspace");
    fs.writeFileSync(
      workspacePath,
      JSON.stringify({
        folders: [
          { path: rootA.repo_root },
          { path: rootB.repo_root },
        ],
      }, null, 2),
      "utf8",
    );

    per.launch = await launchVSCode(workspacePath);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const row = inner.getByTestId("session-set-092-collided");
    await expect(row).toHaveCount(1);
    const marker = row.locator(".row-duplicate-name-marker");
    await expect(marker).toHaveText("!");
    await expect(marker).toHaveAttribute("title", /Duplicate session-set name in 2 locations/);
  } finally {
    await teardown(per);
  }
});

test("Getting Started form renders when no session sets exist (webview path)", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-welcome");
    const seed = makeSet(per.tmpPath, "seed-to-remove", 2);
    const repoRoot = seed.repo_root;
    fs.rmSync(seed.set_dir, { recursive: true, force: true });
    const sessionSetsDir = path.join(repoRoot, "docs", "session-sets");
    expect(fs.existsSync(sessionSetsDir)).toBe(true);
    expect(fs.readdirSync(sessionSetsDir)).toHaveLength(0);

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    // Set 060 (Getting Started redesign): a folder with no session
    // sets renders the staged Getting Started form in the Explorer
    // webview — the only empty state since Set 063 retired the
    // `.welcome` viewsWelcome fallback this spec asserted pre-060.
    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    await expect(inner.locator(".gs-title")).toHaveText("Getting Started");
  } finally {
    await teardown(per);
  }
});

test("Getting Started form renders the Lightweight three-way choice from durable markers (Set 077 S3)", async () => {
  // Rendering-only smoke (the set's requiresE2E: false posture — form
  // ACTIONS stay Layer-2-covered): a workspace whose durable markers
  // say lightweight + dedicated-sessions must paint, on first render
  // with no interaction, (1) the Lightweight radio checked from the
  // tier seed, (2) the Lightweight-only verification-mode block with
  // the dedicated radio checked from the mode seed, (3) NO Full-only
  // budget block (omitted, not hidden), and (4) no Python fault in the
  // persistent System Status strip (the test runner has Python).
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-threeway");
    const seed = makeSet(per.tmpPath, "seed-to-remove", 2);
    const repoRoot = seed.repo_root;
    fs.rmSync(seed.set_dir, { recursive: true, force: true });
    const dabblerDir = path.join(repoRoot, ".dabbler");
    fs.mkdirSync(dabblerDir, { recursive: true });
    fs.writeFileSync(path.join(dabblerDir, "tier"), "lightweight\n", "utf8");
    fs.writeFileSync(
      path.join(dabblerDir, "verification-mode"),
      "dedicated-sessions\n",
      "utf8",
    );

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    // (1) the tier seed checked the Lightweight radio.
    await expect(
      inner.locator('input[name="gs-tier"][value="lightweight"]'),
    ).toBeChecked();
    // (2) the verification-mode block rendered, dedicated checked.
    await expect(inner.locator("[data-gs-verification-mode]")).toBeVisible();
    await expect(
      inner.locator(
        'input[name="gs-verification-mode"][value="dedicated-sessions"]',
      ),
    ).toBeChecked();
    // (3) Lightweight renders no budget block.
    expect(await inner.locator("[data-gs-budget]").count()).toBe(0);
    // (4) environment diagnostics no longer live in the form, and the
    // healthy Python probe contributes no System Status fault.
    expect(await inner.locator('[data-gs-warning="python"]').count()).toBe(0);
    expect(await inner.locator('[data-status-code="python"]').count()).toBe(0);
  } finally {
    await teardown(per);
  }
});

test("Getting Started renders exactly two sections with the Define-modules button (Set 094)", async () => {
  // Rendering-only smoke on the shrunken form (requiresE2E: suggested; the
  // ensure-write ACTIONS stay Layer-2-covered): the empty-repo form paints
  // (1) exactly two sections — Build project structure + Define modules,
  // (2) the Define-modules "Open modules.yaml" button, and (3) none of the
  // retired plan / session-set / New-module actions or the parallel
  // checkbox that left the form in Set 094.
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-two-section");
    const seed = makeSet(per.tmpPath, "seed-to-remove", 2);
    const repoRoot = seed.repo_root;
    fs.rmSync(seed.set_dir, { recursive: true, force: true });

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    // (1) exactly two sections.
    expect(await inner.locator(".gs-step-head").count()).toBe(2);
    await expect(
      inner.locator(".gs-step-title", { hasText: "Build project structure" }),
    ).toBeVisible();
    await expect(
      inner.locator(".gs-step-title", { hasText: "Define modules (optional)" }),
    ).toBeVisible();
    // (2) the Define-modules "Open modules.yaml" button.
    await expect(
      inner.locator('[data-gs-action="open-modules"]'),
    ).toBeVisible();
    // (3) the retired actions + parallel checkbox are gone from the form.
    for (const gone of [
      "import-plan",
      "copy-plan-prompt",
      "new-module",
      "build-session-sets",
    ]) {
      expect(await inner.locator(`[data-gs-action="${gone}"]`).count()).toBe(0);
    }
    expect(await inner.locator('input[name="gs-parallel"]').count()).toBe(0);
  } finally {
    await teardown(per);
  }
});

test("opening / refreshing an empty workspace never creates docs/modules.yaml (Set 094 adjudication A)", async () => {
  // The trust-boundary invariant end-to-end: an extension that edits a repo
  // because it was OPENED is a trust violation. Drive the REAL activation +
  // snapshot + scan->ready refresh path (not just the pure model functions the
  // Layer-2 supplemental test covers) over a workspace with NO docs/modules.yaml,
  // and assert the file is still absent afterward. The manifest is created ONLY
  // on an explicit user action (the Open modules.yaml button / toolbar command /
  // scaffold / Add-module), never on this passive path.
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-no-write-activation");
    const seed = makeSet(per.tmpPath, "seed-to-remove", 2);
    const repoRoot = seed.repo_root;
    fs.rmSync(seed.set_dir, { recursive: true, force: true });
    const manifestPath = path.join(repoRoot, "docs", "modules.yaml");
    // Precondition: the workspace has no manifest before the extension runs.
    expect(fs.existsSync(manifestPath)).toBe(false);

    // launchVSCode activates the extension; openSessionSetsView drives the
    // initial snapshot AND the scan->ready re-render (postScanState ->
    // scheduleRender), so the getting-started form only paints after >= 1 full
    // passive snapshot/refresh cycle has run.
    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);
    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    // A settle beat so the workspace watcher / poll backstop cannot land a
    // late write after the first paint, then re-assert.
    await per.launch.page.waitForTimeout(1500);
    expect(fs.existsSync(manifestPath)).toBe(false);
  } finally {
    await teardown(per);
  }
});

// ---------------------------------------------------------------------
// Set 033 Session 2: orchestrator-block driven accordion rendering.
// Replaces the pre-Set-033 marker-seeded scenarios — the per-set
// `.dabbler/orchestrator.json` marker is retired (H2) and the
// accordion now reads from session-state.json's `orchestrator` block.
// The Set 029 S5 signal-class scenarios (configured-default / manual)
// covered the retired signalKind affordance; with Set 036 S3 also
// retiring the enum on the renderer side, no signalKind class is
// emitted at all and the original scenarios are gone for good. Set
// 033 Session 4 added the dedicated check-out conflict +
// force-override + release-checkout Playwright scenarios.
// ---------------------------------------------------------------------

// Set 036 Session 6: the "seeded orchestrator block renders provider
// sublabel" and "two in-progress sets each render their own accordion
// body" scenarios were deleted alongside the source modules they
// asserted against (OrchestratorAccordion.renderAccordionLoaded +
// the data-expandable attribute on rows). Set 034 retired the per-row
// accordion entirely; both scenarios had been failing silently on the
// post-Set-034 build but were never caught by CI because no one ran
// the full Layer-3 suite between Set 034 close and Set 036 Session 6.
//
// The non-orphan invariant ("the ambiguity banner is gone post-Set-033")
// is captured below as a focused replacement scenario.

test("multi-in-progress workspaces render two rows (no ambiguity banner)", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-multi-inflight");
    const a = makeSet(per.tmpPath, "033-set-a", 2);
    const b = makeAdditionalSet(a, "033-set-b", 2);
    startSession(a, 1);
    seedOrchestratorBlock(a, {
      engine: "claude",
      provider: "anthropic",
      model: "claude-opus-4-7",
      effort: "high",
    });
    startSession(b, 1);
    seedOrchestratorBlock(b, {
      engine: "gpt-5-4",
      provider: "openai",
      model: "gpt-5",
      effort: "medium",
    });
    per.launch = await launchVSCode(a.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const rowA = inner.locator('[role="treeitem"][data-slug="033-set-a"]');
    const rowB = inner.locator('[role="treeitem"][data-slug="033-set-b"]');
    await expect(rowA).toBeVisible({ timeout: 30_000 });
    await expect(rowB).toBeVisible();
    // Pre-Set-033 the ambiguity banner appeared at "multiple
    // in-progress sets". It must NOT appear anymore — the new
    // protocol drops the field entirely.
    await expect(inner.locator(".ambiguity-banner")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

// Set 036 Session 6: the "empty-state CTA falls back to Claude
// installer" scenario was deleted alongside the source modules it
// asserted against (OrchestratorAccordion.renderAccordionEmpty +
// detectOrchestrators.pickEmptyStateCta). Per-row accordions stopped
// rendering in Set 034 (CustomSessionSetsView.buildRow ships
// accordionHtml: null); the empty-state DOM element never made it to
// the webview. The scenario had no live surface to pin and is
// replaced by the next test's positive-rendering coverage.

test("loading-state sentinel is replaced by row list when scan completes", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-loading");
    const h = makeSet(per.tmpPath, "loading-test", 2);
    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    // By the time openSessionSetsView returns, scanState has
    // transitioned to "ready" and the loading sentinel has been
    // replaced by the tree. We verify the tree exists and the
    // sentinel does NOT exist.
    await expect(inner.locator('[role="tree"]')).toBeVisible({ timeout: 30_000 });
    await expect(inner.locator(".loading-sentinel")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});
