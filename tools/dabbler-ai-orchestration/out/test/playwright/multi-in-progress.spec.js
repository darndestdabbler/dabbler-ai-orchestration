"use strict";
// Set 033 Session 4 — Layer-3 Playwright coverage for the
// multi-in-progress rendering invariant introduced by S2's resolver
// pivot (`resolveActiveSet` → `listInProgressSets`). The Set 029 S4
// custom-tree already covered the "two accordions render" case in
// `session-sets-tree.spec.ts`; this spec adds the bucket-count and
// gauge-rendering invariants the S4 spec calls out explicitly:
// "both accordions render with their own gauges + bucket counts".
//
// Rendered-text invariants live at Layer 3 per CLAUDE.md
// ("rendered-text invariants belong in Layer 3"); data-only
// assertions stay in Layer 1.
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
        console.warn("teardown errors:", errs);
    }
}
(0, test_1.test)("In Progress bucket header shows the multi-in-progress count", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-multi-bucket");
        const a = (0, electronLaunch_1.makeSet)(per.tmpPath, "033-set-a", 2);
        const b = (0, electronLaunch_1.makeAdditionalSet)(a, "033-set-b", 2);
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
        // Bucket headers carry the live count: "In Progress  (2)".
        // Asserting on the count parenthetical is more robust than a
        // visible-row count because the rows can collapse/expand
        // independently of the bucket header text.
        // Set 036 Session 6: dropped the leading `^` anchor from the
        // regex. Set 034 prepended a chevron glyph (▾/▸) to the bucket
        // header, which lands at position 0 of the group's textContent
        // and broke the anchor; the orphan-test sweep caught it.
        const inProgressHeader = inner
            .locator('[role="group"]')
            .filter({ hasText: /In Progress\s*\(2\)/ });
        await (0, test_1.expect)(inProgressHeader).toBeVisible({ timeout: 30000 });
    }
    finally {
        await teardown(per);
    }
});
// Set 036 Session 6: the test.skip'd "each in-progress row paints its
// own gauge SVG" scenario was deleted alongside the source modules it
// asserted against (OrchestratorAccordion.renderAccordionLoaded). The
// FIXME from Set 033 S4 noted accordionHtml shipped as null on every
// row — Set 034 made that the explicit design. With the gauge-
// rendering code and the .accordion-body CSS now deleted, the
// scenario has no surface to un-skip against. Bucket-count coverage
// (the test above) is the surviving in-progress-row invariant; the
// orchestrator block on session-state.json continues to be written
// by start_session for coordination + audit purposes.
//# sourceMappingURL=multi-in-progress.spec.js.map