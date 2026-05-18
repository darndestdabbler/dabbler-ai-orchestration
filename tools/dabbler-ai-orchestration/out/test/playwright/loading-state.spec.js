"use strict";
// Layer 3 rendering smoke for the activation-time loading state,
// Set 030 Session 5. Verifies the viewsWelcome `when` clause gates the
// "no sets" CTA on scanState == ready — i.e., an empty workspace
// surfaces the CTA AFTER the scan completes, not as a flash before
// the tree first paints.
//
// This is a structural smoke, not a timing smoke: by the time
// Playwright connects via CDP, the activation function has already
// returned and scanState has flipped to "ready" via setImmediate. We
// assert the steady-state shape (welcome content present, scan done)
// because we can't reliably observe the loading sentinel itself in
// the cross-process timing window. The architectural unit-level
// invariant (`provider.getChildren()` returns the loading sentinel
// while scanState == "loading") is covered by mocha unit tests.
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
        console.warn("teardown encountered cleanup errors:", errs);
    }
}
// ---------------------------------------------------------------------
// Scenario: empty docs/session-sets directory → welcome CTA appears
// after scan completes (no flash before).
// ---------------------------------------------------------------------
(0, test_1.test)("welcome CTA renders after scan completes on an empty workspace", async () => {
    const per = {};
    try {
        // Build a workspace shell that has a `docs/session-sets/` dir
        // (so the extension activates per `workspaceContains` rule) but
        // zero actual session sets inside it. The harness's makeSet
        // helper produces a real set first; we delete it after capturing
        // the repo root so the directory tree the extension scans is
        // genuinely empty.
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-empty");
        const seed = (0, electronLaunch_1.makeSet)(per.tmpPath, "seed-to-be-removed", 2);
        per.emptyRepoRoot = seed.repo_root;
        // Remove the seed set so docs/session-sets/ is empty but
        // present. The extension's activationEvents
        // `workspaceContains:docs/session-sets` still fires.
        fs.rmSync(seed.set_dir, { recursive: true, force: true });
        // Sanity: directory exists but is empty.
        const sessionSetsDir = path.join(per.emptyRepoRoot, "docs", "session-sets");
        (0, test_1.expect)(fs.existsSync(sessionSetsDir)).toBe(true);
        (0, test_1.expect)(fs.readdirSync(sessionSetsDir)).toHaveLength(0);
        per.launch = await (0, electronLaunch_1.launchVSCode)(per.emptyRepoRoot);
        const page = per.launch.page;
        // Click the Dabbler activity-bar icon to open the side bar. We
        // deliberately do NOT call `openSessionSetsView()` because that
        // helper waits for the tree element to be visible — and the
        // tree IS visually replaced by viewsWelcome when sets[] is
        // empty + scanState is ready (which is the exact state we are
        // trying to verify). So we drive the activity icon click here
        // and then assert on the welcome content's text directly
        // inside the side-bar viewlet.
        const activityIcon = page.locator('.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]');
        await activityIcon.waitFor({ state: "visible", timeout: 30000 });
        await activityIcon.click();
        // Playwright's expect retries until the text appears (or
        // timeout). The key invariant: the welcome content DOES
        // eventually render — which means the `when: scanState == ready`
        // clause activated correctly. If the gate were absent the
        // content would flash; if the gate were broken the content
        // would never render.
        await (0, test_1.expect)(page.getByText(/No session sets in this workspace yet/)).toBeVisible({ timeout: 30000 });
        // The "Copy adoption bootstrap prompt" string is rendered inside
        // the viewsWelcome viewlet. VS Code's rendering of the
        // [text](command:foo) markdown syntax doesn't expose a
        // role="link" — it's an `<a class="monaco-button">`-style
        // element — so we assert on the plain text instead.
        await (0, test_1.expect)(page.getByText(/Copy adoption bootstrap prompt/i)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
//# sourceMappingURL=loading-state.spec.js.map