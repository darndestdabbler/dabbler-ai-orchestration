"use strict";
// Set 027 Session 3 (Layer 2): cancel + restore lifecycle against
// `SessionSetsProvider`. The Python layer (Session 2's
// test_cancel_restore_midset.py) pins the writer; this layer pins the
// reader. The cancelled-bucket-only-renders-when-non-empty rule
// (`SessionSetsProvider.getChildren` line 223) is a particular
// drift target — silently rendering an empty Cancelled bucket would
// be a confusing UX regression but a low-symptom one in unit tests.
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
const assert = __importStar(require("assert"));
const e2eHarness_1 = require("./e2eHarness");
suite("Layer 2 e2e — cancel + restore lifecycle", function () {
    this.timeout(120000);
    let tmpPath;
    setup(() => {
        tmpPath = (0, e2eHarness_1.makeTmpDir)("e2e-cancel");
    });
    teardown(() => {
        (0, e2eHarness_1.cleanupTmpDir)(tmpPath);
    });
    test("Cancelled bucket is absent until a set is cancelled", async () => {
        const h = (0, e2eHarness_1.makeSet)(tmpPath, "cancel-empty-bucket", 4);
        await (0, e2eHarness_1.replaceWorkspaceFolders)(h.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const groups = (0, e2eHarness_1.topLevelGroups)(provider);
        const labels = groups.map((g) => String(g.label));
        assert.ok(!labels.some((l) => l.startsWith("Cancelled")), `Cancelled bucket must not render when no set is cancelled; got groups ${JSON.stringify(labels)}`);
    });
    test("cancelling mid-set moves the set into Cancelled and the bucket appears", async () => {
        const h = (0, e2eHarness_1.makeSet)(tmpPath, "cancel-midset", 4);
        // Drive sessions 1 and 2 normally so the cancellation lands on a
        // set that has nonzero progress — the bucket transition shouldn't
        // depend on session count, but the realistic shape verifies the
        // CANCELLED.md detection beats the in-progress signal.
        (0, e2eHarness_1.startSession)(h, 1);
        (0, e2eHarness_1.makeActivity)(h, 1);
        (0, e2eHarness_1.makeDisposition)(h, 1, false);
        let res = (0, e2eHarness_1.closeSession)(h, 1);
        assert.strictEqual(res.exit, 0);
        (0, e2eHarness_1.startSession)(h, 2);
        (0, e2eHarness_1.makeActivity)(h, 2);
        (0, e2eHarness_1.makeDisposition)(h, 2, false);
        res = (0, e2eHarness_1.closeSession)(h, 2);
        assert.strictEqual(res.exit, 0);
        // Start session 3 then cancel mid-flight — the most diagnostic
        // shape, since both "in progress" and "cancelled" signals are on
        // disk and the reader has to prefer cancelled.
        (0, e2eHarness_1.startSession)(h, 3);
        (0, e2eHarness_1.cancelSet)(h, "operator decided to refocus");
        await (0, e2eHarness_1.replaceWorkspaceFolders)(h.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const cancelled = (0, e2eHarness_1.childrenOfGroup)(provider, "cancelled");
        assert.strictEqual(cancelled.length, 1, "set must bucket to Cancelled");
        assert.strictEqual(cancelled[0].label, "cancel-midset");
        assert.strictEqual(cancelled[0].contextValue, "sessionSet:cancelled", "contextValue must drive the Restore menu visibility predicate");
        // Cancelled set must vacate In Progress entirely.
        const inProgress = (0, e2eHarness_1.childrenOfGroup)(provider, "in-progress");
        assert.strictEqual(inProgress.length, 0);
        // And the bucket itself must be present in the top-level groups —
        // distinct from the empty-fixture case validated above.
        const groups = (0, e2eHarness_1.topLevelGroups)(provider);
        const labels = groups.map((g) => String(g.label));
        assert.ok(labels.some((l) => l.startsWith("Cancelled")), `Cancelled bucket must render once a set is cancelled; got ${JSON.stringify(labels)}`);
    });
    test("restoring a cancelled set returns it to In Progress and removes the Cancelled bucket", async () => {
        const h = (0, e2eHarness_1.makeSet)(tmpPath, "cancel-then-restore", 4);
        (0, e2eHarness_1.startSession)(h, 1);
        (0, e2eHarness_1.cancelSet)(h, "test cancel");
        (0, e2eHarness_1.restoreSet)(h, "test restore");
        await (0, e2eHarness_1.replaceWorkspaceFolders)(h.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const cancelled = (0, e2eHarness_1.childrenOfGroup)(provider, "cancelled");
        assert.strictEqual(cancelled.length, 0, "restored set must leave Cancelled bucket");
        const inProgress = (0, e2eHarness_1.childrenOfGroup)(provider, "in-progress");
        assert.strictEqual(inProgress.length, 1, "restored set must return to its prior in-progress state");
        assert.strictEqual(inProgress[0].label, "cancel-then-restore");
        // With no cancelled sets left, the bucket header must disappear
        // again — failing this assertion would surface the "Cancelled (0)"
        // ghost-header drift.
        const groups = (0, e2eHarness_1.topLevelGroups)(provider);
        const labels = groups.map((g) => String(g.label));
        assert.ok(!labels.some((l) => l.startsWith("Cancelled")), `Cancelled bucket must disappear once no set is cancelled; got ${JSON.stringify(labels)}`);
    });
    test("cancelling a Not Started set buckets it directly to Cancelled", async () => {
        const h = (0, e2eHarness_1.makeSet)(tmpPath, "cancel-not-started", 3);
        (0, e2eHarness_1.cancelSet)(h, "abandoned before starting");
        await (0, e2eHarness_1.replaceWorkspaceFolders)(h.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const cancelled = (0, e2eHarness_1.childrenOfGroup)(provider, "cancelled");
        assert.strictEqual(cancelled.length, 1);
        assert.strictEqual(cancelled[0].label, "cancel-not-started");
        // The Not Started bucket must lose its member — a stale entry
        // there would surface as a duplicate row across buckets.
        const notStarted = (0, e2eHarness_1.childrenOfGroup)(provider, "not-started");
        assert.strictEqual(notStarted.length, 0);
    });
});
//# sourceMappingURL=treeProvider-cancel.test.js.map