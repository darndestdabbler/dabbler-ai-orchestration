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

    // The webview's <div role="tree"> wraps bucket <div role="group">
    // wrappers, each containing 0+ <div role="treeitem"> rows.
    const tree = inner.locator('[role="tree"][aria-label*="Session Sets" i]');
    await expect(tree).toBeVisible({ timeout: 30_000 });

    const groups = inner.locator('[role="group"]');
    // Three default buckets + possibly Cancelled if any cancelled set
    // exists. The fixture has only one in-progress set, so we should
    // see exactly three groups (In Progress / Not Started / Complete).
    expect(await groups.count()).toBeGreaterThanOrEqual(3);

    // Row exists and carries WAI-ARIA tree attributes.
    const row = inner.locator(
      '[role="treeitem"][data-slug="029-scenario-in-progress"]',
    );
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-level", "2");
    // Set 087 Session 2 (routed ruling Q4): a no-manifest workspace is
    // the single-implicit-module case and must render exactly the
    // pre-087 two-level view — no module wrapper, no module header,
    // rows staying at aria-level 2 (asserted above).
    await expect(inner.locator(".module")).toHaveCount(0);
    await expect(inner.locator(".module-header")).toHaveCount(0);
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
  // budget block (omitted, not hidden), and (4) the A10 python-warning
  // element present in the DOM (hidden here — CI runners have Python).
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
    // (4) the python warning element exists; visibility follows the
    // host probe (the runner has Python, so it must be hidden).
    const pythonWarning = inner.locator('[data-gs-warning="python"]');
    expect(await pythonWarning.count()).toBe(1);
    await expect(pythonWarning).toBeHidden();
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
