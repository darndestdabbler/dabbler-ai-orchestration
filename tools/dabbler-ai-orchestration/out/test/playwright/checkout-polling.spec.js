"use strict";
// Set 033 Session 5 — Layer-3 Playwright coverage for the
// CheckoutPollService sentinel-consumption path.
//
// The full poll-and-auto-attach happy path requires the operator to
// click "Poll for release" on a VS Code information-message toast, then
// wait for the service to detect the state-file change and retry
// start_session. Driving VS Code's notification toasts from Playwright
// runs into the same cross-iframe focus brittleness session-sets-
// tree.spec.ts already called out (and S4 hit again with the palette
// path for `Dabbler: Release Check-Out`). Per the existing pattern, we
// cover the load-bearing observable end-to-end (the service consuming
// a sentinel file dropped into the conflicts directory on launch),
// while the click-driven happy path lives in Layer-2 with a documented
// `test.skip` here.
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
function withHomeOverride(per, homeOverride) {
    per.prevHome = process.env.HOME;
    per.prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeOverride;
    process.env.USERPROFILE = homeOverride;
}
function restoreHome(per) {
    if (per.prevHome === undefined)
        delete process.env.HOME;
    else
        process.env.HOME = per.prevHome;
    if (per.prevUserProfile === undefined)
        delete process.env.USERPROFILE;
    else
        process.env.USERPROFILE = per.prevUserProfile;
}
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
    restoreHome(per);
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
(0, test_1.test)("CheckoutPollService consumes a pre-existing conflict sentinel on activation", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-poll-sentinel");
        const homeOverride = path.join(per.tmpPath, "fake-home");
        fs.mkdirSync(homeOverride, { recursive: true });
        withHomeOverride(per, homeOverride);
        // Scaffold a session set in the workspace, with claude+anthropic
        // currently holding the slot — the conflict record asserts that
        // gpt-5-4+openai got refused while trying to claim it.
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "033-poll-sentinel", 2);
        (0, electronLaunch_1.startSession)(h, 1);
        (0, electronLaunch_1.seedOrchestratorBlock)(h, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
        });
        // Drop a sentinel file in the home-override's conflicts dir,
        // simulating what the Claude SessionStart invoker writes when
        // start_session refuses with EXIT_CHECKOUT_CONFLICT. The
        // CheckoutPollService's start() method scans this directory at
        // activation, so we can assert end-to-end on consumption without
        // driving the toast. (The Codex config.toml watcher used to be a
        // second producer of these records; retired in Set 036 S3.)
        const conflictsDir = path.join(homeOverride, ".dabbler", "checkout-conflicts");
        fs.mkdirSync(conflictsDir, { recursive: true });
        const sentinelPath = path.join(conflictsDir, "test-sentinel.json");
        fs.writeFileSync(sentinelPath, JSON.stringify({
            schemaVersion: 1,
            detectedAt: new Date().toISOString(),
            source: "claude-invoker",
            sessionSetPath: h.set_dir,
            sessionSetSlug: h.slug,
            sessionNumber: 1,
            heldByEngine: "claude",
            heldByProvider: "anthropic",
            heldByModel: "claude-opus-4-7",
            checkedOutAt: "2026-05-20T08:00:00-04:00",
            wouldBeHolderEngine: "gpt-5-4",
            wouldBeHolderProvider: "openai",
            wouldBeHolderModel: "gpt-5",
            wouldBeHolderEffort: "medium",
        }), "utf8");
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        // Open the Session Sets view to activate the extension; that
        // triggers the safeRegister chain that includes
        // `CheckoutPollService.start()`.
        await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        // The service consumes (reads + deletes) sentinel files during
        // start(); we expect the file to be gone within a generous
        // window. The "100ms re-read delay" inside start() is doubled
        // here as a safety margin against slow CI hosts.
        const deadline = Date.now() + 15000;
        let consumed = false;
        while (Date.now() < deadline) {
            if (!fs.existsSync(sentinelPath)) {
                consumed = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        (0, test_1.expect)(consumed).toBe(true);
        // Sanity: the session-state.json should still name claude +
        // anthropic — consuming the sentinel surfaces the prompt but
        // does NOT silently force-override.
        const state = JSON.parse(fs.readFileSync(path.join(h.set_dir, "session-state.json"), "utf8"));
        (0, test_1.expect)(state.orchestrator?.engine).toBe("claude");
        (0, test_1.expect)(state.orchestrator?.provider).toBe("anthropic");
    }
    finally {
        await teardown(per);
    }
});
// FIXME (Set 033 S5, 2026-05-20): the full "second orchestrator polls,
// holder closes, second orchestrator auto-attaches" happy path requires
// clicking "Poll for release" on a VS Code information-message toast.
// Driving VS Code notification buttons from Playwright runs into the
// same cross-iframe focus brittleness that session-sets-tree.spec.ts
// and S4's release-checkout palette scenario hit. The polling state
// machine itself is exhaustively covered at Layer 2
// (checkoutPollService.test.ts: 25 tests covering parse, identity
// gate, prompt dispatch, retry, dispose, sentinel ingest). Skipping
// until a more reliable notification-button driver is identified;
// manual smoke remains the operator path.
test_1.test.skip("second orchestrator polls, holder closes, second orchestrator auto-attaches", async () => {
    // The scenario, for reference:
    //   1. Scaffold a set with claude+anthropic holding.
    //   2. Drop a sentinel naming gpt-5-4+openai as the would-be holder.
    //   3. Launch VS Code; service surfaces the prompt.
    //   4. Click "Poll for release" on the toast.
    //   5. Externally clear the orchestrator block (or flip status →
    //      complete).
    //   6. Within 5s + retry-spawn, the session-state.json's orchestrator
    //      block updates to gpt-5-4+openai (the would-be holder auto-
    //      attached).
    //   7. Verify the success toast text contains the slug.
    //
    // Step 4 is the blocker: Playwright's `getByRole('button', { name:
    // "Poll for release" })` against VS Code's notification iframe is
    // unreliable across VS Code minor versions.
});
//# sourceMappingURL=checkout-polling.spec.js.map