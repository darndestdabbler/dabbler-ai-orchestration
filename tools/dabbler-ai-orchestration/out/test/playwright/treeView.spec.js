"use strict";
// Layer 3 rendering smoke for the Session Set Explorer. Each test
// drives the Python harness shim to prepare workspace state, then
// launches a real VS Code Electron instance with the extension
// loaded against that workspace, opens the Session Sets view, and
// asserts on the rendered text/aria. Per spec § Session 4 Option
// B, no screenshot baseline is committed — pure-visual regressions
// are accepted as out of scope; the data-layer regressions are
// covered by Layer 1 (Python) and Layer 2 (test-electron tree
// provider). Layer 3's job is "the right text appears in the right
// place after a refresh."
//
// Each test owns its tmpdir, its VS Code launch, and its
// user-data-dir so concurrent invocations cannot interact. Tests
// are NOT parallelized (playwright.config workers=1) because
// launching multiple Electron processes from a single host
// overwhelms the harness and produces flake.
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const electronLaunch_1 = require("./electronLaunch");
async function teardown(per) {
    // Cleanups are independent — a failure to close VS Code must not
    // skip tmpdir cleanup. Both are best-effort and run regardless of
    // the other's outcome. (Per verifier finding in Set 027 Session 4.)
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
        // Surface aggregated cleanup failures without failing the test —
        // the assertion itself drives the outcome; cleanup is hygiene.
        // eslint-disable-next-line no-console
        console.warn("teardown encountered cleanup errors:", errs);
    }
}
// Read the visible label text for every treeitem currently rendered
// in *the Session Sets tree*. VS Code renders each row's label +
// description joined by spaces inside the treeitem's accessible name,
// so a substring check against the joined string is the most stable
// assertion surface across VS Code minor versions.
async function treeitemTexts(tree) {
    const items = tree.locator('[role="treeitem"]');
    const count = await items.count();
    const out = [];
    for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        // aria-label is the most reliable handle; fall back to text
        // content if the element rendered without one (rare, but the
        // VS Code tree occasionally omits aria-label on collapsed
        // group rows).
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
// Scenario 1: fresh set — three sets, all not-started.
// ---------------------------------------------------------------------
(0, test_1.test)("renders three not-started sets under Not Started", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fresh");
        const a = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-fresh-a", 3);
        // Sibling sets in the same repo via the harness shim.
        (0, electronLaunch_1.makeAdditionalSet)(a, "scenario-fresh-b", 4);
        (0, electronLaunch_1.makeAdditionalSet)(a, "scenario-fresh-c", 3);
        per.launch = await (0, electronLaunch_1.launchVSCode)(a.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const texts = await treeitemTexts(tree);
        const joined = texts.join("\n");
        (0, test_1.expect)(joined).toMatch(/Not Started\s+\(3\)/);
        (0, test_1.expect)(joined).toContain("scenario-fresh-a");
        (0, test_1.expect)(joined).toContain("scenario-fresh-b");
        (0, test_1.expect)(joined).toContain("scenario-fresh-c");
        // None of the negative-control bucket headers should populate
        (0, test_1.expect)(joined).toMatch(/In Progress\s+\(0\)/);
        (0, test_1.expect)(joined).toMatch(/Done\s+\(0\)/);
        (0, test_1.expect)(joined).not.toMatch(/Cancelled\s+\(\d+\)/);
    }
    finally {
        await teardown(per);
    }
});
// ---------------------------------------------------------------------
// Scenario 2: mid-session in flight.
// ---------------------------------------------------------------------
(0, test_1.test)("renders an in-flight set with the 'in flight' annotation", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-inflight");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-inflight", 3);
        // Complete session 1 cleanly, then start session 2 and leave it
        // in flight.
        (0, electronLaunch_1.startSession)(h, 1);
        (0, electronLaunch_1.makeActivity)(h, 1);
        (0, electronLaunch_1.makeDisposition)(h, 1, /* isFinal */ false);
        const r1 = (0, electronLaunch_1.closeSession)(h, 1);
        if (r1.exit !== 0)
            throw new Error(`close 1 failed: ${r1.stderr}`);
        (0, electronLaunch_1.startSession)(h, 2);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const joined = (await treeitemTexts(tree)).join("\n");
        (0, test_1.expect)(joined).toMatch(/In Progress\s+\(1\)/);
        (0, test_1.expect)(joined).toContain("scenario-inflight");
        // Progress text format from src/providers/SessionSetsProvider.ts:
        //   "1/3 · session 2 in flight"
        (0, test_1.expect)(joined).toMatch(/1\/3/);
        (0, test_1.expect)(joined).toMatch(/session 2 in flight/i);
        // Negative controls — set is not done, not cancelled, not forced
        (0, test_1.expect)(joined).not.toMatch(/Done\s+\([1-9]/);
        (0, test_1.expect)(joined).not.toContain("[FORCED]");
    }
    finally {
        await teardown(per);
    }
});
// ---------------------------------------------------------------------
// Scenario 3: all done.
// ---------------------------------------------------------------------
(0, test_1.test)("renders a fully closed set under Done with N/N progress", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-done");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-done", 3);
        (0, electronLaunch_1.driveHappyPath)(h, 3);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const joined = (await treeitemTexts(tree)).join("\n");
        (0, test_1.expect)(joined).toMatch(/Done\s+\(1\)/);
        (0, test_1.expect)(joined).toContain("scenario-done");
        (0, test_1.expect)(joined).toMatch(/3\/3/);
        (0, test_1.expect)(joined).toMatch(/In Progress\s+\(0\)/);
        (0, test_1.expect)(joined).not.toContain("in flight");
        (0, test_1.expect)(joined).not.toContain("[FORCED]");
    }
    finally {
        await teardown(per);
    }
});
// ---------------------------------------------------------------------
// Scenario 4: cancelled mid-set.
// ---------------------------------------------------------------------
(0, test_1.test)("renders a cancelled set under the Cancelled bucket", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-cancel");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-cancel", 4);
        // Drive one session to completion before cancelling so the set's
        // progress text isn't a trivial 0/N.
        (0, electronLaunch_1.startSession)(h, 1);
        (0, electronLaunch_1.makeActivity)(h, 1);
        (0, electronLaunch_1.makeDisposition)(h, 1, false);
        const r1 = (0, electronLaunch_1.closeSession)(h, 1);
        if (r1.exit !== 0)
            throw new Error(`close 1 failed: ${r1.stderr}`);
        (0, electronLaunch_1.cancelSet)(h);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const joined = (await treeitemTexts(tree)).join("\n");
        // Cancelled group MUST render now that there's one cancelled set.
        (0, test_1.expect)(joined).toMatch(/Cancelled\s+\(1\)/);
        (0, test_1.expect)(joined).toContain("scenario-cancel");
        // Negative controls — must not appear in active buckets
        (0, test_1.expect)(joined).toMatch(/In Progress\s+\(0\)/);
        (0, test_1.expect)(joined).toMatch(/Done\s+\(0\)/);
    }
    finally {
        await teardown(per);
    }
});
// ---------------------------------------------------------------------
// Scenario 5: force-closed surfaces [FORCED] badge.
// ---------------------------------------------------------------------
(0, test_1.test)("renders [FORCED] badge on a force-closed set", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-forced");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "scenario-forced", 3);
        // Session 1 healthy.
        (0, electronLaunch_1.startSession)(h, 1);
        (0, electronLaunch_1.makeActivity)(h, 1);
        (0, electronLaunch_1.makeDisposition)(h, 1, false);
        const r1 = (0, electronLaunch_1.closeSession)(h, 1);
        if (r1.exit !== 0)
            throw new Error(`close 1 failed: ${r1.stderr}`);
        // Session 2 force-closed without disposition or change-log.
        (0, electronLaunch_1.startSession)(h, 2);
        const r2 = (0, electronLaunch_1.closeSession)(h, 2, { force: true });
        if (r2.exit !== 0)
            throw new Error(`force-close 2 failed: ${r2.stderr}`);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const tree = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const joined = (await treeitemTexts(tree)).join("\n");
        (0, test_1.expect)(joined).toContain("[FORCED]");
        (0, test_1.expect)(joined).toContain("scenario-forced");
        // Per Layer 2 discovery (Set 027 Session 3): isMidSetComplete
        // downgrades currentSession < totalSessions snapshots to
        // in-progress regardless of status, so a force-closed mid-set
        // lives in In Progress with the [FORCED] badge — NOT in Done.
        // This is the truthful-display invariant from
        // SessionSetsProvider.ts:36.
        (0, test_1.expect)(joined).toMatch(/In Progress\s+\(1\)/);
        (0, test_1.expect)(joined).toMatch(/Done\s+\(0\)/);
    }
    finally {
        await teardown(per);
    }
});
//# sourceMappingURL=treeView.spec.js.map