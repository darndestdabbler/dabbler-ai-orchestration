"use strict";
// Layer 3 rendering smoke for the v2 → v3 migration CTA, Set 030
// Session 5. Each test creates a v3 set via the harness, manually
// downgrades the state file to v2 on disk, launches a real Electron
// VS Code, and asserts the tree surfaces the "(needs migration)"
// badge. A second test exercises the migration command end-to-end —
// invokes it, picks the regex strategy via the quickpick, and asserts
// the on-disk file is rewritten in v3 shape so a refresh clears the
// badge.
//
// The migration command is *operator-triggered*, not auto-fire — the
// loading sentinel scenario is covered in a separate smoke
// (loading-state.spec.ts) since the two assertions don't share a
// fixture shape.
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
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
        console.warn("teardown encountered cleanup errors:", errs);
    }
}
async function treeitemTexts(tree) {
    const items = tree.locator('[role="treeitem"]');
    const count = await items.count();
    const out = [];
    for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        const aria = await item.getAttribute("aria-label");
        if (aria) {
            out.push(aria);
        }
        else {
            const t = (await item.textContent()) || "";
            out.push(t.trim());
        }
    }
    return out;
}
// ---------------------------------------------------------------------
// Scenario 1: v2 state file on disk → "(needs migration)" badge on row.
// ---------------------------------------------------------------------
(0, test_1.test)("renders (needs migration) badge on a v2 set", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-v2");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-v2-pending", 3);
        // The harness's start_session writer emits v3 dual-write today.
        // Downgrade the file to a pure-v2 snapshot so the v2-detection
        // path actually fires.
        (0, electronLaunch_1.downgradeStateFileToV2)(h);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const joined = (await treeitemTexts(tree)).join("\n");
        (0, test_1.expect)(joined).toContain("scenario-v2-pending");
        (0, test_1.expect)(joined).toContain("(needs migration)");
        // Negative control: only one set in this fixture; no other badge
        // should appear.
        (0, test_1.expect)(joined).not.toContain("[FORCED]");
    }
    finally {
        await teardown(per);
    }
});
//# sourceMappingURL=migration-cta.spec.js.map