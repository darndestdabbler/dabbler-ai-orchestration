"use strict";
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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const decisionReviewQueue_1 = require("../../commands/decisionReviewQueue");
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-flag-test-"));
}
function ssStub(over = {}) {
    return {
        name: "test-set",
        dir: "/tmp/test-set",
        specPath: "",
        activityPath: "",
        changeLogPath: "",
        statePath: "",
        aiAssignmentPath: "",
        uatChecklistPath: "",
        state: "in-progress",
        totalSessions: 1,
        sessionsCompleted: 0,
        lastTouched: "2026-05-16T00:00:00Z",
        liveSession: null,
        config: { requiresUAT: false, requiresE2E: false, uatScope: "none" },
        uatSummary: null,
        root: "/tmp",
        needsMigration: false,
        ...over,
    };
}
suite("flagDecisionForReview — appendQueueEntry", () => {
    test("creates the queue file when absent and writes one JSON line", () => {
        const dir = makeTmpDir();
        try {
            const entry = {
                ts: "2026-05-16T00:00:00Z",
                reason: "first entry",
                source: "command",
                file: null,
                line: null,
            };
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, entry);
            const queuePath = path.join(dir, "decision-review-queue.jsonl");
            assert.ok(fs.existsSync(queuePath));
            const content = fs.readFileSync(queuePath, "utf8");
            assert.strictEqual(content, JSON.stringify(entry) + "\n");
        }
        finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
    test("appends additional lines without rewriting existing content", () => {
        const dir = makeTmpDir();
        try {
            const e1 = {
                ts: "2026-05-16T00:00:00Z", reason: "a", source: "command", file: null, line: null,
            };
            const e2 = {
                ts: "2026-05-16T00:00:01Z", reason: "b", source: "annotation", file: "f.py", line: 1,
            };
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, e1);
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, e2);
            const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
            const lines = content.trim().split("\n");
            assert.strictEqual(lines.length, 2);
            assert.deepStrictEqual(JSON.parse(lines[0]), e1);
            assert.deepStrictEqual(JSON.parse(lines[1]), e2);
        }
        finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
    test("preserves unicode in the reason field", () => {
        const dir = makeTmpDir();
        try {
            const entry = {
                ts: "t", reason: "résumé — café", source: "command", file: null, line: null,
            };
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, entry);
            const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
            assert.deepStrictEqual(JSON.parse(content.trim()), entry);
        }
        finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});
suite("flagDecisionForReview — findActiveSessionSetDir", () => {
    test("returns null when no session sets exist", () => {
        const result = (0, decisionReviewQueue_1.findActiveSessionSetDir)(() => []);
        assert.strictEqual(result, null);
    });
    test("returns null when no session set is in-progress", () => {
        const result = (0, decisionReviewQueue_1.findActiveSessionSetDir)(() => [
            ssStub({ state: "not-started" }),
            ssStub({ state: "complete" }),
            ssStub({ state: "cancelled" }),
        ]);
        assert.strictEqual(result, null);
    });
    test("returns the dir of the single in-progress set", () => {
        const result = (0, decisionReviewQueue_1.findActiveSessionSetDir)(() => [
            ssStub({ state: "complete", dir: "/old" }),
            ssStub({ state: "in-progress", dir: "/active" }),
            ssStub({ state: "not-started", dir: "/pending" }),
        ]);
        assert.strictEqual(result, "/active");
    });
    test("when multiple in-progress sets exist, picks the most-recently-touched", () => {
        const result = (0, decisionReviewQueue_1.findActiveSessionSetDir)(() => [
            ssStub({ state: "in-progress", dir: "/a", lastTouched: "2026-05-15T10:00:00Z" }),
            ssStub({ state: "in-progress", dir: "/b", lastTouched: "2026-05-16T10:00:00Z" }),
            ssStub({ state: "in-progress", dir: "/c", lastTouched: "2026-05-14T10:00:00Z" }),
        ]);
        assert.strictEqual(result, "/b");
    });
    test("handles null lastTouched without crashing (sorts to bottom)", () => {
        const result = (0, decisionReviewQueue_1.findActiveSessionSetDir)(() => [
            ssStub({ state: "in-progress", dir: "/a", lastTouched: null }),
            ssStub({ state: "in-progress", dir: "/b", lastTouched: "2026-05-16T10:00:00Z" }),
        ]);
        assert.strictEqual(result, "/b");
    });
});
suite("flagDecisionForReview — idempotency vs append behavior", () => {
    test("re-appending the same entry produces two lines (writer is dumb; dedup is reader-side)", () => {
        const dir = makeTmpDir();
        try {
            const entry = {
                ts: "t", reason: "same", source: "command", file: null, line: null,
            };
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, entry);
            (0, decisionReviewQueue_1.appendQueueEntry)(dir, entry);
            const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
            const lines = content.trim().split("\n");
            assert.strictEqual(lines.length, 2, "appendQueueEntry is intentionally write-only; dedup lives in the scanner per the spec");
        }
        finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});
//# sourceMappingURL=flagDecisionForReview.test.js.map