"use strict";
// Set 035 Session 3 — Layer-3 Playwright coverage for the
// state-file-first cancellation contract. Set 035 Session 1 flipped
// the extension's bucketing read (`readCancellationState` in
// `src/utils/cancelLifecycle.ts`, wired through
// `src/utils/fileSystem.ts:readSessionSets`) to consult
// `session-state.json`'s `status` field first; the markdown markers
// (`CANCELLED.md` / `RESTORED.md`) remain as audit-trail artifacts
// and as the legacy-fallback signal when no usable state file is
// present.
//
// Three scenarios pin the contract on rendered output:
//
//   1. State file declares `status: "cancelled"` with NO
//      `CANCELLED.md` on disk → set buckets as **Cancelled**.
//      This is the new Set-035 behavior; pre-035 the absence of
//      the markdown marker would have prevented the Cancelled
//      bucketing.
//
//   2. No usable state file + `CANCELLED.md` on disk → set
//      buckets as **Cancelled** via the legacy file-presence
//      fallback. Covers the v1-snapshot / hand-edited / brand-new
//      folder path that the reader still tolerates.
//
//   3. State file declares `status: "complete"` with a stray
//      `CANCELLED.md` on disk → set buckets as **Complete**, NOT
//      Cancelled. The state-file-first contract intentionally
//      does NOT consult `CANCELLED.md` presence when the state
//      file declares a non-cancelled status; the marker is an
//      operator-resolvable inconsistency, not a silent override.
//
// Per CLAUDE.md ("rendered-text invariants belong in Layer 3"),
// these assertions live at Layer 3. Companion writer-side and
// reader-unit tests live in
// `src/test/suite/cancelLifecycle.test.ts` (Layer 1 / Layer 2).
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
(0, test_1.test)("state file says cancelled with no CANCELLED.md → Cancelled bucket (new contract)", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-cancel-state");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "035-state-only-cancelled", 2);
        // Run the canonical writer so `state.status` flips to
        // "cancelled" with the matching `preCancelStatus` field, then
        // delete `CANCELLED.md` on disk. The set now looks like the
        // post-Set-035 H2 contract: bucketing read consults
        // `state.status` first; markdown marker is absent.
        (0, electronLaunch_1.cancelSet)(h);
        const cancelledPath = path.join(h.set_dir, "CANCELLED.md");
        (0, test_1.expect)(fs.existsSync(cancelledPath)).toBe(true);
        fs.unlinkSync(cancelledPath);
        (0, test_1.expect)(fs.existsSync(cancelledPath)).toBe(false);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        // Row exists and carries the cancelled state attribute.
        const row = inner.locator('[role="treeitem"][data-slug="035-state-only-cancelled"]');
        await (0, test_1.expect)(row).toBeVisible({ timeout: 30000 });
        await (0, test_1.expect)(row).toHaveAttribute("data-state", "cancelled");
        // The Cancelled bucket header is rendered with the row's count.
        // The header text format from the webview client.js is
        // "<label>  (<count>)"; we match the label via getByText.
        const cancelledHeader = inner.getByText(/^Cancelled\s+\(1\)$/);
        await (0, test_1.expect)(cancelledHeader).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("no state file + CANCELLED.md present → Cancelled bucket (legacy fallback)", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-cancel-fallback");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "035-legacy-fallback-cancelled", 2);
        // Set up the legacy-fallback path: cancel via the canonical
        // writer (produces both signals) then remove `session-state.json`
        // so the reader's state-file branch returns "unknown" and falls
        // through to `isCancelled(dir)` on `CANCELLED.md` presence.
        (0, electronLaunch_1.cancelSet)(h);
        const cancelledPath = path.join(h.set_dir, "CANCELLED.md");
        const statePath = path.join(h.set_dir, "session-state.json");
        (0, test_1.expect)(fs.existsSync(cancelledPath)).toBe(true);
        (0, test_1.expect)(fs.existsSync(statePath)).toBe(true);
        fs.unlinkSync(statePath);
        (0, test_1.expect)(fs.existsSync(statePath)).toBe(false);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const row = inner.locator('[role="treeitem"][data-slug="035-legacy-fallback-cancelled"]');
        // Bucketing flow with no state file on disk:
        // `readCancellationState` opens `session-state.json`, finds it
        // missing, and returns "unknown". `fileSystem.ts` then
        // consults `isCancelled(dir)` on the "unknown" branch, finds
        // `CANCELLED.md` present, and assigns `state = "cancelled"`
        // (with a `console.warn` documenting the fallback).
        await (0, test_1.expect)(row).toBeVisible({ timeout: 30000 });
        await (0, test_1.expect)(row).toHaveAttribute("data-state", "cancelled");
        const cancelledHeader = inner.getByText(/^Cancelled\s+\(1\)$/);
        await (0, test_1.expect)(cancelledHeader).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
(0, test_1.test)("status: complete + stray CANCELLED.md → Complete bucket (state file wins)", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-cancel-asym");
        // One-session set so `driveHappyPath` completes the whole
        // set on session 1 — final close-out writes `status:
        // "complete"`, `lifecycleState: "closed"`, and the
        // change-log.md gate is satisfied.
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "035-asymmetric-stray-marker", 1);
        (0, electronLaunch_1.driveHappyPath)(h, 1);
        // Sanity-check the state file lands as `complete` before we
        // drop the stray marker.
        const statePath = path.join(h.set_dir, "session-state.json");
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        (0, test_1.expect)(state.status).toBe("complete");
        // Drop a stray `CANCELLED.md` by hand — simulating a manual
        // edit or a non-canonical writer (the `_cancelled.md` case
        // from Set 035 Session 2's glossary harvest, normalized to
        // the canonical filename). The state-file-first reader must
        // NOT bucket this set as Cancelled.
        const cancelledPath = path.join(h.set_dir, "CANCELLED.md");
        fs.writeFileSync(cancelledPath, "# Cancellation history\n\nCancelled on 2026-05-21T10:00:00-04:00\nstray marker (test)\n\n", "utf8");
        (0, test_1.expect)(fs.existsSync(cancelledPath)).toBe(true);
        per.launch = await (0, electronLaunch_1.launchVSCode)(h.repo_root);
        const inner = await (0, electronLaunch_1.openSessionSetsView)(per.launch.page);
        await (0, electronLaunch_1.triggerRefresh)(per.launch.page);
        const row = inner.locator('[role="treeitem"][data-slug="035-asymmetric-stray-marker"]');
        await (0, test_1.expect)(row).toBeVisible({ timeout: 30000 });
        // State file wins: the stray `CANCELLED.md` does NOT flip the
        // bucket. `readCancellationState` returns "active" (state is
        // a non-cancelled string and no `RESTORED.md` is present);
        // `fileSystem.ts:readSessionSets` then runs the normal status
        // ladder and assigns `state = "complete"`.
        await (0, test_1.expect)(row).toHaveAttribute("data-state", "complete");
        // No Cancelled bucket header should be rendered — the
        // CustomSessionSetsView only emits the Cancelled group when
        // `buckets.cancelled.length > 0`.
        await (0, test_1.expect)(inner.getByText(/^Cancelled\s+\(\d+\)$/)).toHaveCount(0);
        // The Complete bucket header should carry the lone row.
        await (0, test_1.expect)(inner.getByText(/^Complete\s+\(1\)$/)).toBeVisible();
    }
    finally {
        await teardown(per);
    }
});
//# sourceMappingURL=cancellation-state-file.spec.js.map