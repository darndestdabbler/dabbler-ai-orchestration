"use strict";
// Layer 3 rendering smoke for the orchestrator indicator gauges
// (Set 029, schema v3 / per-session-set identity model — Session 3).
//
// Strategy: every test materializes a tmpdir workspace with at least
// one session set, flips that set to in-progress via the harness, then
// seeds the marker file at the per-set path
//   <workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json
// and asserts on the rendered indicator. We redirect USERPROFILE /
// HOME to a per-test tmpdir so the writer-log file (still global at
// ~/.dabbler/orchestrator-writer.log) lives under our control for the
// fail-closed scenarios.
//
// Webview content lives in a nested iframe rendered by VS Code; we
// reach it via page.frameLocator and assert on the inner HTML's
// rendered text + CSS class hooks. We deliberately don't pixel-diff —
// gauge color is a function of the theme and isn't worth the maintenance.
//
// Scenarios:
//   A. seed Opus current → flagship needle + solid fill + provider/model label
//   B. seed Haiku current → low-tier needle position
//   C. seed model=unknown confidence=low → "low confidence" tooltip phrasing
//   D. seed effort.signalKind=last-observed → clock-icon + "(last /think Xm ago)"
//   E. seed signalKind=configured-default → "(configured default)" suffix line
//   F. seed updatedAt 9h ago → stale class on .gauges + "last updated 9h ago"
//   G. empty (no marker) → "No signal — install hook" CTA
//   H. helper-script multi-writer precedence (non-Electron)
//   I. mismatched sessionSetSlug → empty-state CTA (slug-integrity check)
//   J. helper-script ambiguous (2 in-progress sets) → write skipped, log entry
//   K. helper-script writes to per-set path on single in-progress set
//   L. helper-script invoked outside docs/session-sets/ → skip, no orphan
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
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electronLaunch_1 = require("./electronLaunch");
// Seed a v3 marker at the per-set path. Assumes the seed set has
// already been flipped to in-progress so the reader's resolver finds
// it. The marker file's content drives the gauges.
function seedPerSetMarker(setDir, marker) {
    const dir = path.join(setDir, ".dabbler");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "orchestrator.json"), JSON.stringify(marker, null, 2) + "\n", "utf8");
}
function setHomeEnv(fakeHome, per) {
    per.prevUserprofile = process.env.USERPROFILE;
    per.prevHome = process.env.HOME;
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
}
function restoreHomeEnv(per) {
    if (per.prevUserprofile === undefined) {
        delete process.env.USERPROFILE;
    }
    else {
        process.env.USERPROFILE = per.prevUserprofile;
    }
    if (per.prevHome === undefined) {
        delete process.env.HOME;
    }
    else {
        process.env.HOME = per.prevHome;
    }
}
// Set up a workspace with one in-progress session set. Returns the
// FixtureHandle so the test can write into the resolved set's
// `.dabbler/orchestrator.json`.
function makeInProgressWorkspace(per, slug = "orchestrator-seed") {
    per.workspaceTmp = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-orchestrator");
    const seed = (0, electronLaunch_1.makeSet)(per.workspaceTmp, slug, 1);
    (0, electronLaunch_1.startSession)(seed, 1); // flip seed to in-progress
    return seed;
}
async function openIndicatorFrame(launch) {
    const page = launch.page;
    const activityIcon = page.locator('.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]');
    await activityIcon.waitFor({ state: "visible", timeout: 30000 });
    await activityIcon.click();
    // VS Code's webview view layout: outer `iframe.webview` host with a
    // programmatic child frame loading `vscode-webview://.../fake.html`.
    // Use the Frame API to grab the child frame and wait for .container.
    const deadline = Date.now() + 30000;
    let lastErr = null;
    while (Date.now() < deadline) {
        try {
            const outerHandle = await page.locator("iframe.webview").first().elementHandle();
            if (outerHandle) {
                const outerFrame = await outerHandle.contentFrame();
                if (outerFrame) {
                    const children = outerFrame.childFrames();
                    for (const child of children) {
                        try {
                            await child.locator(".container").waitFor({ timeout: 1000 });
                            return child;
                        }
                        catch {
                            // not this one — fall through
                        }
                    }
                }
            }
        }
        catch (err) {
            lastErr = err;
        }
        await page.waitForTimeout(500);
    }
    throw new Error(`openIndicatorFrame timed out waiting for .container in any child frame of iframe.webview. ` +
        `Last error: ${lastErr?.message ?? "none"}`);
}
async function teardown(per) {
    if (per.launch) {
        try {
            await (0, electronLaunch_1.closeVSCode)(per.launch);
        }
        catch { /* best effort */ }
    }
    if (per.workspaceTmp) {
        try {
            (0, electronLaunch_1.cleanupTmpDir)(per.workspaceTmp);
        }
        catch { /* best effort */ }
    }
    if (per.fakeHome) {
        try {
            fs.rmSync(per.fakeHome, { recursive: true, force: true });
        }
        catch { /* best effort */ }
    }
    restoreHomeEnv(per);
}
// -----------------------------------------------------------------------
// Scenario A: current Claude Opus → flagship gauge classes + label.
// -----------------------------------------------------------------------
(0, test_1.test)("renders current Opus marker with flagship tier classes + label", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-A");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: new Date().toISOString(),
            writer: "test",
            signalKind: "current",
            confidence: "high",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "claude-opus-4-7",
            modelDisplayName: "Opus 4.7",
            tier: "flagship",
            effort: {
                normalized: "medium",
                native: "default",
                thinking: false,
                signalKind: "current",
                confidence: "high",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        await (0, test_1.expect)(frame.locator(".gauge-cell.tier-flagship.signal-current")).toBeVisible();
        await (0, test_1.expect)(frame.locator(".gauge-cell.tier-flagship .gauge-sublabel")).toContainText(/Claude\s+Opus 4\.7/);
        await (0, test_1.expect)(frame.locator(".gauges.stale")).toHaveCount(0);
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario B: low-tier Haiku marker → low-tier classes + Haiku label.
// -----------------------------------------------------------------------
(0, test_1.test)("renders Haiku marker with low-tier classes", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-B");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: new Date().toISOString(),
            writer: "test",
            signalKind: "current",
            confidence: "high",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "claude-haiku-4-5-20251001",
            modelDisplayName: "Haiku 4.5",
            tier: "low",
            effort: {
                normalized: "medium",
                native: "default",
                thinking: false,
                signalKind: "current",
                confidence: "high",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        await (0, test_1.expect)(frame.locator(".gauge-cell.tier-low.signal-current")).toBeVisible();
        await (0, test_1.expect)(frame.locator(".gauge-cell.tier-low .gauge-sublabel")).toContainText(/Claude\s+Haiku 4\.5/);
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario C: low-confidence marker → tooltip phrasing reflects it.
// -----------------------------------------------------------------------
(0, test_1.test)("renders confidence-low marker with explicit low-confidence tooltip", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-C");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: new Date().toISOString(),
            writer: "claude-code-session-start-hook",
            signalKind: "current",
            confidence: "low",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "unknown",
            modelDisplayName: "Claude (model unknown)",
            tier: "unknown",
            effort: {
                normalized: "medium",
                native: "default",
                thinking: false,
                signalKind: "current",
                confidence: "low",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        const cell = frame.locator(".gauge-cell.tier-unknown.signal-current").first();
        await (0, test_1.expect)(cell).toBeVisible();
        const tip = await cell.getAttribute("title");
        (0, test_1.expect)(tip || "").toContain("low confidence");
        (0, test_1.expect)(tip || "").toContain("hook payload missing model");
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario D: effort.signalKind = last-observed → clock overlay + suffix.
// -----------------------------------------------------------------------
(0, test_1.test)("renders last-observed effort with clock overlay and elapsed time suffix", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-D");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        const observed = new Date(Date.now() - 12 * 60 * 1000).toISOString();
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: new Date().toISOString(),
            writer: "test",
            signalKind: "current",
            confidence: "high",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "claude-opus-4-7",
            modelDisplayName: "Opus 4.7",
            tier: "flagship",
            effort: {
                normalized: "high",
                native: "/think",
                thinking: true,
                signalKind: "last-observed",
                confidence: "high",
                observedAt: observed,
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        const effortCell = frame.locator(".gauge-cell.signal-last-observed").first();
        await (0, test_1.expect)(effortCell).toBeVisible();
        await (0, test_1.expect)(effortCell.locator(".clock-overlay")).toBeVisible();
        await (0, test_1.expect)(frame.locator(".model-section-text").first()).toContainText(/last \/think 12m ago/);
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario E: signalKind=configured-default → "(configured default)" suffix.
// -----------------------------------------------------------------------
(0, test_1.test)("renders configured-default marker with (default) suffix (no stripes)", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-E");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: new Date().toISOString(),
            writer: "codex-config-watcher",
            signalKind: "configured-default",
            confidence: "medium",
            provider: "openai",
            providerDisplayName: "Codex",
            model: "gpt-5-codex",
            modelDisplayName: "gpt-5-codex",
            tier: "flagship",
            effort: {
                normalized: "high",
                native: "high",
                thinking: false,
                signalKind: "configured-default",
                confidence: "medium",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        await (0, test_1.expect)(frame.locator(".gauge-cell.signal-configured-default").first()).toBeVisible();
        await (0, test_1.expect)(frame.locator(".model-section-text").first()).toContainText("configured default");
        await (0, test_1.expect)(frame.locator(".gauges.stale")).toHaveCount(0);
        await (0, test_1.expect)(frame.locator(".default-pill")).toHaveCount(0);
        await (0, test_1.expect)(frame.locator(".gauge-suffix")).toHaveCount(0);
        await (0, test_1.expect)(frame.locator(".model-table")).toHaveCount(0);
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario F: 9h-old marker → stale class + "last updated 9h ago".
// -----------------------------------------------------------------------
(0, test_1.test)("renders stale state with diagonal-stripe class and last-updated annotation", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-F");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            sessionSetSlug: seed.slug,
            updatedAt: nineHoursAgo,
            writer: "test",
            signalKind: "current",
            confidence: "high",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "claude-opus-4-7",
            modelDisplayName: "Opus 4.7",
            tier: "flagship",
            effort: {
                normalized: "medium",
                native: "default",
                thinking: false,
                signalKind: "current",
                confidence: "high",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        await (0, test_1.expect)(frame.locator(".gauges.stale")).toBeVisible();
        await (0, test_1.expect)(frame.getByText(/last updated 9h ago — stale/)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario G: no marker → "No signal — install hook" CTA.
// -----------------------------------------------------------------------
(0, test_1.test)("renders empty-state CTA when marker file is absent", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-G");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        // Do NOT seed the marker — the per-set path is empty.
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        await (0, test_1.expect)(frame.locator(".empty-state")).toBeVisible();
        await (0, test_1.expect)(frame.getByText(/No signal/)).toBeVisible();
        await (0, test_1.expect)(frame.locator(".install-cta")).toContainText(/install hook/);
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario H: helper-script multi-writer precedence (non-Electron).
//             Tests the helper directly because the precedence skip is
//             a marker-writer concern, not a rendering concern. Under
//             v3 the helper writes to a per-set path resolved by walk-
//             up; we build a tmpdir workspace with a single in-progress
//             set and point the helper at it via --cwd.
// -----------------------------------------------------------------------
(0, test_1.test)("helper script skips configured-default write when current signal exists", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-H");
        const helper = path.join(__dirname, "..", "..", "..", "scripts", "write-orchestrator-marker.js");
        (0, test_1.expect)(fs.existsSync(helper)).toBe(true);
        const seed = makeInProgressWorkspace(per, "helper-precedence-set");
        function runHelper(modeArgs, payload) {
            const result = cp.spawnSync(process.execPath, [helper, ...modeArgs, "--cwd", seed.repo_root], {
                input: JSON.stringify(payload),
                env: {
                    ...process.env,
                    USERPROFILE: per.fakeHome,
                    HOME: per.fakeHome,
                },
                encoding: "utf8",
            });
            const logPath = path.join(per.fakeHome, ".dabbler", "orchestrator-writer.log");
            const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
            return {
                exit: result.status ?? -1,
                logEntries: log.split("\n").filter((l) => l.trim().length > 0).length,
            };
        }
        // Write a current Claude marker.
        let r = runHelper(["--mode", "session-start"], {
            hook_event_name: "SessionStart",
            source: "startup",
            model: "claude-opus-4-7",
        });
        (0, test_1.expect)(r.exit).toBe(0);
        (0, test_1.expect)(r.logEntries).toBe(0);
        // Try to write a configured-default Codex marker — should be skipped.
        r = runHelper(["--mode", "configured-default", "--writer", "codex-config-watcher"], {
            provider: "openai",
            model: "gpt-5-codex",
            effort: { normalized: "high", native: "high" },
        });
        (0, test_1.expect)(r.exit).toBe(0);
        (0, test_1.expect)(r.logEntries).toBe(1);
        // Marker should still be the Claude current signal, at the per-set
        // path — not anywhere under the fake-home directory.
        const markerPath = path.join(seed.set_dir, ".dabbler", "orchestrator.json");
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
        (0, test_1.expect)(marker.signalKind).toBe("current");
        (0, test_1.expect)(marker.model).toBe("claude-opus-4-7");
        (0, test_1.expect)(marker.schemaVersion).toBe(3);
        (0, test_1.expect)(marker.sessionSetSlug).toBe(seed.slug);
    }
    finally {
        if (per.fakeHome) {
            try {
                fs.rmSync(per.fakeHome, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
        if (per.workspaceTmp) {
            try {
                (0, electronLaunch_1.cleanupTmpDir)(per.workspaceTmp);
            }
            catch { /* best effort */ }
        }
    }
});
// -----------------------------------------------------------------------
// Scenario I: marker whose sessionSetSlug doesn't match the resolved
// set falls back to empty state (slug-integrity check, schema-v3).
// -----------------------------------------------------------------------
(0, test_1.test)("renders empty-state when marker's sessionSetSlug mismatches the resolved set", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-I");
        setHomeEnv(per.fakeHome, per);
        const seed = makeInProgressWorkspace(per);
        seedPerSetMarker(seed.set_dir, {
            schemaVersion: 3,
            // Deliberately MISMATCHED slug — should trigger the empty-state fallback.
            sessionSetSlug: "some-other-slug-that-does-not-match",
            updatedAt: new Date().toISOString(),
            writer: "test",
            signalKind: "current",
            confidence: "high",
            provider: "anthropic",
            providerDisplayName: "Claude",
            model: "claude-opus-4-7",
            modelDisplayName: "Opus 4.7",
            tier: "flagship",
            effort: {
                normalized: "medium",
                native: "default",
                thinking: false,
                signalKind: "current",
                confidence: "high",
            },
            stalenessMaxSec: 28800,
        });
        per.launch = await (0, electronLaunch_1.launchVSCode)(seed.repo_root);
        const frame = await openIndicatorFrame(per.launch);
        // Slug integrity check fails → empty-state CTA, not the gauges.
        await (0, test_1.expect)(frame.locator(".empty-state")).toBeVisible();
        await (0, test_1.expect)(frame.getByText(/No signal/)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
// -----------------------------------------------------------------------
// Scenario J: helper-script ambiguous resolution (2 in-progress sets) —
// writer skips, log carries the ambiguity entry, no marker is written.
// -----------------------------------------------------------------------
(0, test_1.test)("helper script skips write when multiple in-progress sets are resolvable", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-J");
        const helper = path.join(__dirname, "..", "..", "..", "scripts", "write-orchestrator-marker.js");
        // Materialize TWO in-progress sets in one workspace.
        per.workspaceTmp = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-ambiguous");
        const seedA = (0, electronLaunch_1.makeSet)(per.workspaceTmp, "ambiguous-set-a", 1);
        (0, electronLaunch_1.startSession)(seedA, 1);
        // Tack a second set into the same repo by carving the directory
        // shape directly — the harness's make-set creates its own repo so
        // we can't reuse it for a sibling set. Drop a minimal
        // session-state.json with status: "in-progress" alongside the first.
        const sessionSetsDir = path.dirname(seedA.set_dir);
        const setBDir = path.join(sessionSetsDir, "ambiguous-set-b");
        fs.mkdirSync(setBDir, { recursive: true });
        fs.writeFileSync(path.join(setBDir, "session-state.json"), JSON.stringify({
            schemaVersion: 3,
            sessionSetName: "ambiguous-set-b",
            currentSession: 1,
            totalSessions: 1,
            completedSessions: [],
            status: "in-progress",
            lifecycleState: "work_in_progress",
        }, null, 2), "utf8");
        const result = cp.spawnSync(process.execPath, [helper, "--mode", "session-start", "--cwd", seedA.repo_root], {
            input: JSON.stringify({
                hook_event_name: "SessionStart",
                source: "startup",
                model: "claude-opus-4-7",
            }),
            env: {
                ...process.env,
                USERPROFILE: per.fakeHome,
                HOME: per.fakeHome,
            },
            encoding: "utf8",
        });
        (0, test_1.expect)(result.status).toBe(0); // fail-closed is a successful no-op
        // Neither set should have a marker file.
        const markerA = path.join(seedA.set_dir, ".dabbler", "orchestrator.json");
        const markerB = path.join(setBDir, ".dabbler", "orchestrator.json");
        (0, test_1.expect)(fs.existsSync(markerA)).toBe(false);
        (0, test_1.expect)(fs.existsSync(markerB)).toBe(false);
        // Writer log should carry the ambiguity entry.
        const logPath = path.join(per.fakeHome, ".dabbler", "orchestrator-writer.log");
        (0, test_1.expect)(fs.existsSync(logPath)).toBe(true);
        const logLines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter((l) => l.length > 0);
        (0, test_1.expect)(logLines.length).toBeGreaterThanOrEqual(1);
        const lastEntry = JSON.parse(logLines[logLines.length - 1]);
        (0, test_1.expect)(lastEntry.reason).toBe("multiple-in-progress-sets");
        (0, test_1.expect)(Array.isArray(lastEntry.candidates)).toBe(true);
        (0, test_1.expect)(lastEntry.candidates).toEqual(test_1.expect.arrayContaining(["ambiguous-set-a", "ambiguous-set-b"]));
    }
    finally {
        if (per.fakeHome) {
            try {
                fs.rmSync(per.fakeHome, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
        if (per.workspaceTmp) {
            try {
                (0, electronLaunch_1.cleanupTmpDir)(per.workspaceTmp);
            }
            catch { /* best effort */ }
        }
    }
});
// -----------------------------------------------------------------------
// Scenario K: helper-script writes to per-set path on single in-progress.
// Validates the happy path of the walk-up resolver end-to-end.
// -----------------------------------------------------------------------
(0, test_1.test)("helper script writes marker to per-set path on single in-progress set", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-K");
        const helper = path.join(__dirname, "..", "..", "..", "scripts", "write-orchestrator-marker.js");
        const seed = makeInProgressWorkspace(per, "per-set-write-target");
        const result = cp.spawnSync(process.execPath, [helper, "--mode", "session-start", "--cwd", seed.repo_root], {
            input: JSON.stringify({
                hook_event_name: "SessionStart",
                source: "startup",
                model: "claude-opus-4-7",
            }),
            env: {
                ...process.env,
                USERPROFILE: per.fakeHome,
                HOME: per.fakeHome,
            },
            encoding: "utf8",
        });
        (0, test_1.expect)(result.status).toBe(0);
        const markerPath = path.join(seed.set_dir, ".dabbler", "orchestrator.json");
        (0, test_1.expect)(fs.existsSync(markerPath)).toBe(true);
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
        (0, test_1.expect)(marker.schemaVersion).toBe(3);
        (0, test_1.expect)(marker.sessionSetSlug).toBe(seed.slug);
        (0, test_1.expect)(marker.signalKind).toBe("current");
        (0, test_1.expect)(marker.model).toBe("claude-opus-4-7");
        // Self-protecting .gitignore was dropped alongside the marker.
        const ignorePath = path.join(seed.set_dir, ".dabbler", ".gitignore");
        (0, test_1.expect)(fs.existsSync(ignorePath)).toBe(true);
        const ignoreContent = fs.readFileSync(ignorePath, "utf8");
        (0, test_1.expect)(ignoreContent).toContain("*");
        (0, test_1.expect)(ignoreContent).toContain("!.gitignore");
        // No global marker at ~/.dabbler/current-orchestrator.json — the v2
        // global path is fully retired.
        const legacyMarker = path.join(per.fakeHome, ".dabbler", "current-orchestrator.json");
        (0, test_1.expect)(fs.existsSync(legacyMarker)).toBe(false);
    }
    finally {
        if (per.fakeHome) {
            try {
                fs.rmSync(per.fakeHome, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
        if (per.workspaceTmp) {
            try {
                (0, electronLaunch_1.cleanupTmpDir)(per.workspaceTmp);
            }
            catch { /* best effort */ }
        }
    }
});
// -----------------------------------------------------------------------
// Scenario L: helper-script invoked outside any docs/session-sets/
// directory — write is skipped, no orphan marker is created anywhere.
// -----------------------------------------------------------------------
(0, test_1.test)("helper script skips write when cwd is outside any docs/session-sets/", async () => {
    const per = {};
    try {
        per.fakeHome = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-fakehome-L");
        const helper = path.join(__dirname, "..", "..", "..", "scripts", "write-orchestrator-marker.js");
        // Bare tmpdir with no `docs/session-sets/` anywhere on the walk-up.
        const cwd = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-no-sets");
        const result = cp.spawnSync(process.execPath, [helper, "--mode", "session-start", "--cwd", cwd], {
            input: JSON.stringify({
                hook_event_name: "SessionStart",
                source: "startup",
                model: "claude-opus-4-7",
            }),
            env: {
                ...process.env,
                USERPROFILE: per.fakeHome,
                HOME: per.fakeHome,
            },
            encoding: "utf8",
        });
        (0, test_1.expect)(result.status).toBe(0); // fail-closed is a no-op
        // The writer log records the reason; no marker is anywhere.
        const logPath = path.join(per.fakeHome, ".dabbler", "orchestrator-writer.log");
        (0, test_1.expect)(fs.existsSync(logPath)).toBe(true);
        const lastEntry = JSON.parse(fs.readFileSync(logPath, "utf8").trim().split("\n").pop());
        (0, test_1.expect)(lastEntry.reason).toBe("no-docs-session-sets");
        // No global v2 marker was created either.
        const legacyMarker = path.join(per.fakeHome, ".dabbler", "current-orchestrator.json");
        (0, test_1.expect)(fs.existsSync(legacyMarker)).toBe(false);
        try {
            fs.rmSync(cwd, { recursive: true, force: true });
        }
        catch { /* best effort */ }
    }
    finally {
        if (per.fakeHome) {
            try {
                fs.rmSync(per.fakeHome, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
    }
});
//# sourceMappingURL=orchestrator-indicator.spec.js.map