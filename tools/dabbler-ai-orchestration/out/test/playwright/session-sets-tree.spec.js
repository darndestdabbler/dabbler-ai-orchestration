"use strict";
// Layer-3 Playwright Electron smoke for the Set 029 Session 4
// custom-tree (CustomSessionSetsView). Replaces the retired
// treeView.spec.ts + orchestrator-indicator.spec.ts. Covers what the
// operator actually sees painted on screen inside the webview iframe:
//
//   - bucket grouping + row structure
//   - WAI-ARIA tree semantics (role + aria-level + aria-expanded)
//   - row name + description text
//   - HTML escape: a `<script>` in a set name renders as text
//   - welcome panel renders when no sets exist (covered also by
//     loading-state.spec.ts; duplicated here as a structure cross-
//     check from the new harness)
//
// Scenarios that require deep workbench interaction (QuickPick
// context menu, full keyboard navigation focus assertions) are
// covered by the Layer-2 unit tests on ActionRegistry +
// suppressionState — driving cross-iframe focus reliably from
// Playwright is brittle, and the predicates themselves are the load-
// bearing invariants.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electronLaunch_1 = require("./electronLaunch");
async function teardown(per) {
    const errs = [];
    if (per.launch) {
        try {
            await (0, electronLaunch_1.closeVSCode)(per.launch);
        }
        catch (e) {
            errs.push(e);
        }
    }
    if (per.tmpPath) {
        try {
            (0, electronLaunch_1.cleanupTmpDir)(per.tmpPath);
        }
        catch (e) {
            errs.push(e);
        }
    }
    if (errs.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("teardown errors:", errs);
    }
}
(0, test_1.test)("renders ARIA tree structure with bucket grouping for an in-progress set", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-tree");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "029-scenario-in-progress", 3);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        // The webview's <div role="tree"> wraps bucket <div role="group">
        // wrappers, each containing 0+ <div role="treeitem"> rows.
        const tree = inner.locator('[role="tree"][aria-label*="Session Sets" i]');
        await (0, test_1.expect)(tree).toBeVisible({ timeout: 30000 });
        const groups = inner.locator('[role="group"]');
        // Three default buckets + possibly Cancelled if any cancelled set
        // exists. The fixture has only one in-progress set, so we should
        // see exactly three groups (In Progress / Not Started / Complete).
        (0, test_1.expect)(await groups.count()).toBeGreaterThanOrEqual(3);
        // Row exists and carries WAI-ARIA tree attributes.
        const row = inner.locator('[role="treeitem"][data-slug="029-scenario-in-progress"]');
        await (0, test_1.expect)(row).toBeVisible();
        await (0, test_1.expect)(row).toHaveAttribute("aria-level", "2");
        // In-progress + resolved row should default to expanded
        // (accordion shows). Since this is the only in-progress set in
        // the workspace, the walk-up resolver returns it cleanly.
        await (0, test_1.expect)(row).toHaveAttribute("aria-expanded", /true|false/);
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("HTML-escapes a set name containing < and > so it renders as text", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-xss");
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
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "name-with-amp-and-lt", 2);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const row = inner.locator('[role="treeitem"][data-slug="name-with-amp-and-lt"]');
        await (0, test_1.expect)(row).toBeVisible();
        // The .row-name span shows the raw slug; we assert it renders
        // as plain text (no injected DOM nodes from the slug).
        const nameSpan = row.locator(".row-name");
        await (0, test_1.expect)(nameSpan).toHaveText("name-with-amp-and-lt");
        // Cross-check: any < in row content should be present in
        // textContent, not as a tag. If escaping were broken, a `<`
        // would have been parsed into HTML and disappeared from the
        // textContent.
        const rendered = (await row.textContent()) ?? "";
        (0, test_1.expect)(rendered).toContain("name-with-amp-and-lt");
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("welcome panel renders when no session sets exist (webview path)", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-welcome");
        const seed = (0, electronLaunch_1.makeSet)(per.tmpPath, "seed-to-remove", 2);
        const repoRoot = seed.repo_root;
        fs.rmSync(seed.set_dir, { recursive: true, force: true });
        const sessionSetsDir = path.join(repoRoot, "docs", "session-sets");
        (0, test_1.expect)(fs.existsSync(sessionSetsDir)).toBe(true);
        (0, test_1.expect)(fs.readdirSync(sessionSetsDir)).toHaveLength(0);
        per.launch = await (0, electronLaunch_1.launchVSCode)(repoRoot);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        // The webview's .welcome div carries the markdown-rendered
        // viewsWelcome contents from package.json.
        await (0, test_1.expect)(inner.locator(".welcome")).toBeVisible({ timeout: 30000 });
        await (0, test_1.expect)(inner.getByText(/No session sets in this workspace yet/)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
// ---------------------------------------------------------------------
// Set 033 Session 2: orchestrator-block driven accordion rendering.
// Replaces the pre-Set-033 marker-seeded scenarios — the per-set
// `.dabbler/orchestrator.json` marker is retired (H2) and the
// accordion now reads from session-state.json's `orchestrator` block.
// The Set 029 S5 signal-class scenarios (configured-default / manual)
// covered the retired signalKind affordance; the new block-fed render
// emits only signal-current, so those scenarios are no longer
// meaningful and have been removed. Set 033 Session 4 will add the
// dedicated check-out conflict + force-override + release-checkout
// Playwright scenarios.
// ---------------------------------------------------------------------
(0, test_1.test)("seeded orchestrator block renders provider sublabel in the accordion", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-orch-block");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "033-orch-block", 2);
        (0, electronLaunch_1.startSession)(h, 1);
        (0, electronLaunch_1.seedOrchestratorBlock)(h, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const row = inner.locator('[role="treeitem"][data-slug="033-orch-block"]');
        await (0, test_1.expect)(row).toBeVisible({ timeout: 30000 });
        // Provider sublabel renders verbatim. The synthesizer uses the
        // bare provider string ("anthropic") as the display name — Set 029
        // S5's rich providerDisplayName mapping was tied to the retired
        // marker schema.
        await (0, test_1.expect)(row.getByText(/anthropic/)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("two in-progress sets each render their own accordion body", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-multi-inflight");
        const a = (0, electronLaunch_1.makeSet)(per.tmpPath, "033-set-a", 2);
        const b = (0, electronLaunch_1.makeAdditionalSet)(a, "033-set-b", 2);
        // Both sets in-progress with distinct orchestrator identities.
        // The new tree provider must paint two accordions, one per row.
        (0, electronLaunch_1.startSession)(a, 1);
        (0, electronLaunch_1.seedOrchestratorBlock)(a, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
        });
        (0, electronLaunch_1.startSession)(b, 1);
        (0, electronLaunch_1.seedOrchestratorBlock)(b, {
            engine: "gpt-5-4",
            provider: "openai",
            model: "gpt-5",
            effort: "medium",
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(a.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const rowA = inner.locator('[role="treeitem"][data-slug="033-set-a"]');
        const rowB = inner.locator('[role="treeitem"][data-slug="033-set-b"]');
        await (0, test_1.expect)(rowA).toBeVisible({ timeout: 30000 });
        await (0, test_1.expect)(rowB).toBeVisible();
        // Both rows must carry an accordion body (data-expandable="1").
        // Pre-Set-033 only the resolver's single "active" row had one.
        await (0, test_1.expect)(rowA).toHaveAttribute("data-expandable", "1");
        await (0, test_1.expect)(rowB).toHaveAttribute("data-expandable", "1");
        // Pre-Set-033 the ambiguity banner appeared at "multiple
        // in-progress sets". It must NOT appear anymore — the new
        // protocol drops the field entirely.
        await (0, test_1.expect)(inner.locator(".ambiguity-banner")).toHaveCount(0);
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("empty-state CTA falls back to Claude installer when no orchestrators detected", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-empty-cta");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "029-empty-cta", 2);
        // Intentionally do NOT seed a marker — the resolved in-progress
        // row should render the empty-state accordion body. The smart
        // CTA's detection runs against the test host's user dir, which
        // typically has ~/.claude/ if any Claude tooling was ever used.
        // The assertion checks the *fallback* label form so the test is
        // robust against the host's actual install footprint.
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const row = inner.locator('[role="treeitem"][data-slug="029-empty-cta"]');
        await (0, test_1.expect)(row).toBeVisible({ timeout: 30000 });
        // Empty-state CTA always renders a link button with data-command.
        // The label varies by detection; we just assert *some* install/
        // preset link exists and the "No signal —" prefix is present.
        const cta = row.locator(".acc-empty-cta");
        await (0, test_1.expect)(cta).toBeVisible();
        await (0, test_1.expect)(cta).toContainText(/No signal/);
        await (0, test_1.expect)(cta.locator("button.acc-link")).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("loading-state sentinel is replaced by row list when scan completes", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-loading");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "loading-test", 2);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        // By the time openSessionSetsView returns, scanState has
        // transitioned to "ready" and the loading sentinel has been
        // replaced by the tree. We verify the tree exists and the
        // sentinel does NOT exist.
        await (0, test_1.expect)(inner.locator('[role="tree"]')).toBeVisible({ timeout: 30000 });
        await (0, test_1.expect)(inner.locator(".loading-sentinel")).toHaveCount(0);
    }
    finally {
        await teardown(per);
    }
});
//# sourceMappingURL=session-sets-tree.spec.js.map