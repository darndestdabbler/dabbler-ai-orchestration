"use strict";
// Set 027 Session 3 (Layer 2): multi-set workspace against
// `SessionSetsProvider`. The Python layer's
// test_multiset_sequential.py pins the writer's boundary-isolation:
// closing set A does not touch set B's state file. This layer pins
// the reader's grouping behavior: three sets in different lifecycle
// states must bucket into the three appropriate groups, with
// per-bucket sort order respected (in-progress / done / cancelled by
// most-recent-touch descending; not-started alphabetically).
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
suite("Layer 2 e2e — multi-set workspace", function () {
    this.timeout(180000);
    let tmpPath;
    setup(() => {
        tmpPath = (0, e2eHarness_1.makeTmpDir)("e2e-multiset");
    });
    teardown(() => {
        (0, e2eHarness_1.cleanupTmpDir)(tmpPath);
    });
    test("three sets in lifecycle-distinct states bucket into the right groups", async () => {
        // Build three sets sharing one repo, then drive each to a distinct
        // lifecycle state:
        //   * set A — fully closed (Done)
        //   * set B — session 1 closed, session 2 mid-flight (In Progress)
        //   * set C — never started (Not Started)
        const a = (0, e2eHarness_1.makeSet)(tmpPath, "alpha-done", 3);
        const b = (0, e2eHarness_1.makeAdditionalSet)(a, "bravo-active", 3);
        const c = (0, e2eHarness_1.makeAdditionalSet)(a, "charlie-untouched", 3);
        (0, e2eHarness_1.driveHappyPath)(a, 3);
        (0, e2eHarness_1.startSession)(b, 1);
        (0, e2eHarness_1.makeActivity)(b, 1);
        (0, e2eHarness_1.makeDisposition)(b, 1, false);
        const closeRes = (0, e2eHarness_1.closeSession)(b, 1);
        assert.strictEqual(closeRes.exit, 0);
        (0, e2eHarness_1.startSession)(b, 2);
        void c; // c is intentionally left untouched
        await (0, e2eHarness_1.replaceWorkspaceFolders)(a.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const done = (0, e2eHarness_1.childrenOfGroup)(provider, "done");
        assert.strictEqual(done.length, 1, "exactly one set should be Done");
        assert.strictEqual(done[0].label, "alpha-done");
        const inProgress = (0, e2eHarness_1.childrenOfGroup)(provider, "in-progress");
        assert.strictEqual(inProgress.length, 1, "exactly one set should be In Progress");
        assert.strictEqual(inProgress[0].label, "bravo-active");
        const bravoDesc = String(inProgress[0].description ?? "");
        assert.ok(bravoDesc.includes("1/3 · session 2 in flight"), `expected bravo in-flight label; got '${bravoDesc}'`);
        const notStarted = (0, e2eHarness_1.childrenOfGroup)(provider, "not-started");
        assert.strictEqual(notStarted.length, 1, "exactly one set should be Not Started");
        assert.strictEqual(notStarted[0].label, "charlie-untouched");
        // Cancelled bucket must not surface at all (no cancelled sets).
        const cancelled = (0, e2eHarness_1.childrenOfGroup)(provider, "cancelled");
        assert.strictEqual(cancelled.length, 0);
    });
    test("Not Started sets sort alphabetically by name", async () => {
        // `SessionSetsProvider.getChildren` sorts the not-started bucket by
        // name (line 241), distinct from the in-progress / done / cancelled
        // buckets which sort by lastTouched DESC. The sort key is easy to
        // refactor away inadvertently when consolidating logic; pin it.
        const z = (0, e2eHarness_1.makeSet)(tmpPath, "zeta", 2);
        const a = (0, e2eHarness_1.makeAdditionalSet)(z, "alpha", 2);
        const m = (0, e2eHarness_1.makeAdditionalSet)(z, "mu", 2);
        void a;
        void m;
        await (0, e2eHarness_1.replaceWorkspaceFolders)(z.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const notStarted = (0, e2eHarness_1.childrenOfGroup)(provider, "not-started");
        const labels = notStarted.map((it) => String(it.label));
        assert.deepStrictEqual(labels, ["alpha", "mu", "zeta"], "Not Started sets must sort alphabetically");
    });
    test("in-progress bucket sorts by lastTouched DESC (real cross-set ordering)", async () => {
        // Verifier (Round C): the multiset suite previously had only
        // single-item buckets in non-not-started states, so the
        // "in-progress / done / cancelled sort by lastTouched DESC"
        // contract from SessionSetsProvider.getChildren:237 was never
        // exercised end-to-end. Drive sessions on multiple sets in
        // explicit order so each set's `startedAt` (the lastTouched
        // source for in-progress rows) is monotonically increasing,
        // then assert the bucket order is the REVERSE of that
        // chronology.
        const oldest = (0, e2eHarness_1.makeSet)(tmpPath, "in-progress-oldest", 3);
        (0, e2eHarness_1.startSession)(oldest, 1);
        const middle = (0, e2eHarness_1.makeAdditionalSet)(oldest, "in-progress-middle", 3);
        (0, e2eHarness_1.startSession)(middle, 1);
        const newest = (0, e2eHarness_1.makeAdditionalSet)(oldest, "in-progress-newest", 3);
        (0, e2eHarness_1.startSession)(newest, 1);
        await (0, e2eHarness_1.replaceWorkspaceFolders)(oldest.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const inProgress = (0, e2eHarness_1.childrenOfGroup)(provider, "in-progress");
        const labels = inProgress.map((it) => String(it.label));
        assert.deepStrictEqual(labels, ["in-progress-newest", "in-progress-middle", "in-progress-oldest"], `in-progress bucket must sort by lastTouched DESC; got ${JSON.stringify(labels)}`);
    });
    test("three sets, one cancelled: Cancelled bucket appears alongside others", async () => {
        // Boundary case for the Cancelled-renders-when-nonempty rule
        // (SessionSetsProvider.ts:223). A workspace with three sets where
        // exactly one is cancelled must surface all four buckets'
        // non-empty members.
        const a = (0, e2eHarness_1.makeSet)(tmpPath, "alpha-cancelled", 3);
        const b = (0, e2eHarness_1.makeAdditionalSet)(a, "bravo-in-progress", 3);
        const c = (0, e2eHarness_1.makeAdditionalSet)(a, "charlie-not-started", 3);
        (0, e2eHarness_1.cancelSet)(a, "test fixture");
        (0, e2eHarness_1.startSession)(b, 1);
        void c;
        await (0, e2eHarness_1.replaceWorkspaceFolders)(a.repo_root);
        const provider = (0, e2eHarness_1.buildProvider)();
        const cancelled = (0, e2eHarness_1.childrenOfGroup)(provider, "cancelled");
        assert.strictEqual(cancelled.length, 1);
        assert.strictEqual(cancelled[0].label, "alpha-cancelled");
        const inProgress = (0, e2eHarness_1.childrenOfGroup)(provider, "in-progress");
        assert.strictEqual(inProgress.length, 1);
        assert.strictEqual(inProgress[0].label, "bravo-in-progress");
        const notStarted = (0, e2eHarness_1.childrenOfGroup)(provider, "not-started");
        assert.strictEqual(notStarted.length, 1);
        assert.strictEqual(notStarted[0].label, "charlie-not-started");
        const done = (0, e2eHarness_1.childrenOfGroup)(provider, "done");
        assert.strictEqual(done.length, 0);
    });
});
//# sourceMappingURL=treeProvider-multiset.test.js.map