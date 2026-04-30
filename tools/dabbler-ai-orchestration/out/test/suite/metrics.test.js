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
const metrics_1 = require("../../utils/metrics");
const SAMPLE = [
    {
        session_set: "user-auth",
        session_num: 1,
        model: "claude-sonnet-4-6",
        effort: "normal",
        input_tokens: 10000,
        output_tokens: 2000,
        cost_usd: 0.25,
        timestamp: "2026-04-20T10:00:00Z",
    },
    {
        session_set: "user-auth",
        session_num: 2,
        model: "claude-sonnet-4-6",
        effort: "normal",
        input_tokens: 8000,
        output_tokens: 1500,
        cost_usd: 0.18,
        timestamp: "2026-04-21T11:00:00Z",
    },
    {
        session_set: "product-catalog",
        session_num: 1,
        model: "claude-opus-4-7",
        effort: "high",
        input_tokens: 20000,
        output_tokens: 5000,
        cost_usd: 1.20,
        timestamp: "2026-04-22T09:00:00Z",
    },
];
suite("metrics", () => {
    test("summarizeMetrics totals cost correctly", () => {
        const summary = (0, metrics_1.summarizeMetrics)(SAMPLE);
        assert.ok(Math.abs(summary.totalCost - 1.63) < 0.001);
    });
    test("summarizeMetrics groups by session set", () => {
        const summary = (0, metrics_1.summarizeMetrics)(SAMPLE);
        assert.strictEqual(summary.bySessionSet["user-auth"].sessions, 2);
        assert.strictEqual(summary.bySessionSet["product-catalog"].sessions, 1);
        assert.ok(Math.abs(summary.bySessionSet["user-auth"].cost - 0.43) < 0.001);
    });
    test("summarizeMetrics groups by model", () => {
        const summary = (0, metrics_1.summarizeMetrics)(SAMPLE);
        assert.ok("claude-sonnet-4-6" in summary.byModel);
        assert.ok("claude-opus-4-7" in summary.byModel);
    });
    test("summarizeMetrics produces 30 daily entries", () => {
        const summary = (0, metrics_1.summarizeMetrics)(SAMPLE);
        assert.strictEqual(summary.dailyCosts.length, 30);
    });
    test("buildSparkline returns 30-char string of block chars", () => {
        const summary = (0, metrics_1.summarizeMetrics)(SAMPLE);
        const sparkline = (0, metrics_1.buildSparkline)(summary.dailyCosts);
        assert.strictEqual(sparkline.length, 30);
        assert.match(sparkline, /^[▁▂▃▄▅▆▇█]+$/);
    });
    test("buildSparkline handles all-zero input", () => {
        const zeros = Array.from({ length: 30 }, (_, i) => ({
            date: `2026-04-${String(i + 1).padStart(2, "0")}`,
            cost: 0,
        }));
        const sparkline = (0, metrics_1.buildSparkline)(zeros);
        assert.strictEqual(sparkline.length, 30);
        // All zeros → all lowest block
        assert.match(sparkline, /^▁+$/);
    });
    test("exportToCsv includes header and all rows", () => {
        const csv = (0, metrics_1.exportToCsv)(SAMPLE);
        const lines = csv.split("\n");
        assert.strictEqual(lines[0], "session_set,session_num,model,effort,input_tokens,output_tokens,cost_usd,timestamp");
        assert.strictEqual(lines.length, 4); // header + 3 rows
        assert.ok(lines[1].startsWith("user-auth,1,"));
    });
});
//# sourceMappingURL=metrics.test.js.map