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
exports.METRICS_FILE = void 0;
exports.readMetrics = readMetrics;
exports.summarizeMetrics = summarizeMetrics;
exports.buildSparkline = buildSparkline;
exports.exportToCsv = exportToCsv;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.METRICS_FILE = path.join("ai-router", "metrics.jsonl");
function readMetrics(workspaceRoot) {
    const metricsPath = path.join(workspaceRoot, exports.METRICS_FILE);
    if (!fs.existsSync(metricsPath))
        return [];
    try {
        const lines = fs.readFileSync(metricsPath, "utf8").split(/\r?\n/).filter(Boolean);
        return lines
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((e) => e !== null);
    }
    catch {
        return [];
    }
}
function summarizeMetrics(entries) {
    const bySessionSet = {};
    const byModel = {};
    const dailyMap = {};
    for (const e of entries) {
        // Per session-set
        if (!bySessionSet[e.session_set]) {
            bySessionSet[e.session_set] = { sessions: 0, cost: 0, lastRun: "" };
        }
        bySessionSet[e.session_set].sessions++;
        bySessionSet[e.session_set].cost += e.cost_usd;
        if (e.timestamp > bySessionSet[e.session_set].lastRun) {
            bySessionSet[e.session_set].lastRun = e.timestamp;
        }
        // Per model
        byModel[e.model] = (byModel[e.model] ?? 0) + e.cost_usd;
        // Daily
        const day = e.timestamp.slice(0, 10);
        dailyMap[day] = (dailyMap[day] ?? 0) + e.cost_usd;
    }
    const today = new Date();
    const dailyCosts = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (29 - i));
        const dateStr = d.toISOString().slice(0, 10);
        return { date: dateStr, cost: dailyMap[dateStr] ?? 0 };
    });
    return {
        totalCost: entries.reduce((s, e) => s + e.cost_usd, 0),
        bySessionSet,
        byModel,
        dailyCosts,
    };
}
function buildSparkline(dailyCosts) {
    const BLOCKS = "▁▂▃▄▅▆▇█";
    const values = dailyCosts.map((d) => d.cost);
    const max = Math.max(...values, 0.0001);
    return values
        .map((v) => BLOCKS[Math.min(7, Math.floor((v / max) * 7.99))])
        .join("");
}
function exportToCsv(entries) {
    const header = "session_set,session_num,model,effort,input_tokens,output_tokens,cost_usd,timestamp";
    const rows = entries.map((e) => [
        e.session_set,
        e.session_num,
        e.model,
        e.effort,
        e.input_tokens,
        e.output_tokens,
        e.cost_usd.toFixed(4),
        e.timestamp,
    ].join(","));
    return [header, ...rows].join("\n");
}
//# sourceMappingURL=metrics.js.map