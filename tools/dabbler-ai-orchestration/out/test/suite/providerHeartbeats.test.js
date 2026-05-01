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
const ProviderHeartbeatsProvider_1 = require("../../providers/ProviderHeartbeatsProvider");
const SETTINGS = { lookbackMinutes: 60, silentWarningMinutes: 30 };
function samplePayload() {
    return {
        disclaimer: ProviderHeartbeatsProvider_1.HEARTBEAT_FOOTER,
        providers: {
            anthropic: {
                signal_path: "/ws/provider-queues/anthropic/capacity_signal.jsonl",
                signal_file_present: true,
                last_completion_at: "2026-04-30T14:00:00Z",
                minutes_since_last_completion: 12,
                completions_in_window: 3,
                tokens_in_window: 4231,
                lookback_minutes: 60,
                disclaimer: ProviderHeartbeatsProvider_1.HEARTBEAT_FOOTER,
            },
            openai: {
                signal_path: "/ws/provider-queues/openai/capacity_signal.jsonl",
                signal_file_present: true,
                last_completion_at: "2026-04-30T14:10:00Z",
                minutes_since_last_completion: 2,
                completions_in_window: 8,
                tokens_in_window: 9001,
                lookback_minutes: 60,
                disclaimer: ProviderHeartbeatsProvider_1.HEARTBEAT_FOOTER,
            },
            google: {
                signal_path: "/ws/provider-queues/google/capacity_signal.jsonl",
                signal_file_present: true,
                last_completion_at: "2026-04-30T10:50:00Z",
                minutes_since_last_completion: 202,
                completions_in_window: 0,
                tokens_in_window: 0,
                lookback_minutes: 60,
                disclaimer: ProviderHeartbeatsProvider_1.HEARTBEAT_FOOTER,
            },
        },
    };
}
function makeProvider(payload) {
    return new ProviderHeartbeatsProvider_1.ProviderHeartbeatsProvider({
        getWorkspaceRoot: () => "/ws",
        fetchPayload: async () => ({ ok: true, payload }),
        getSettings: () => SETTINGS,
    });
}
suite("ProviderHeartbeatsProvider — tree shape", () => {
    test("root level lists providers alphabetically", async () => {
        const provider = makeProvider(samplePayload());
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 3);
        const names = children.map((c) => c.provider);
        assert.deepStrictEqual(names, ["anthropic", "google", "openai"]);
    });
    test("provider nodes are leaves (no further expansion)", async () => {
        const provider = makeProvider(samplePayload());
        const top = await provider.getChildren();
        const grandchildren = await provider.getChildren(top[0]);
        assert.deepStrictEqual(grandchildren, []);
    });
    test("empty payload renders a guidance info node, not an empty tree", async () => {
        const provider = makeProvider({ providers: {}, disclaimer: ProviderHeartbeatsProvider_1.HEARTBEAT_FOOTER });
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].kind, "info");
        assert.match(children[0].label, /no provider capacity signals/i);
    });
    test("fetch failure surfaces an error info node", async () => {
        const provider = new ProviderHeartbeatsProvider_1.ProviderHeartbeatsProvider({
            getWorkspaceRoot: () => "/ws",
            fetchPayload: async () => ({ ok: false, message: "exit 2" }),
            getSettings: () => SETTINGS,
        });
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].kind, "info");
        assert.strictEqual(children[0].isError, true);
    });
    test("missing workspace yields an info node", async () => {
        const provider = new ProviderHeartbeatsProvider_1.ProviderHeartbeatsProvider({
            getWorkspaceRoot: () => undefined,
            getSettings: () => SETTINGS,
        });
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].kind, "info");
    });
});
suite("ProviderHeartbeatsProvider — silent-warning threshold", () => {
    test("active provider (12m < 30m) is not silent", () => {
        const d = samplePayload().providers.anthropic;
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.isSilent)(d, 30), false);
    });
    test("provider just above threshold (31m > 30m) is silent", () => {
        const d = { ...samplePayload().providers.anthropic, minutes_since_last_completion: 31 };
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.isSilent)(d, 30), true);
    });
    test("provider exactly at threshold (30m, not >) is not silent", () => {
        const d = { ...samplePayload().providers.anthropic, minutes_since_last_completion: 30 };
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.isSilent)(d, 30), false);
    });
    test("provider with no signal file is silent (covers never-ran case)", () => {
        const d = { ...samplePayload().providers.anthropic, signal_file_present: false };
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.isSilent)(d, 30), true);
    });
    test("provider with file but no completions ever is silent", () => {
        const d = {
            ...samplePayload().providers.anthropic,
            minutes_since_last_completion: null,
        };
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.isSilent)(d, 30), true);
    });
    test("provider tree item uses warning icon when silent", async () => {
        const provider = makeProvider(samplePayload());
        const top = await provider.getChildren();
        const google = top.find((n) => n.provider === "google");
        const item = (0, ProviderHeartbeatsProvider_1.buildTreeItem)(google);
        const icon = item.iconPath;
        assert.strictEqual(icon.id, "warning");
        assert.strictEqual(item.contextValue, "heartbeatProvider:silent");
    });
    test("provider tree item uses pulse icon when active", async () => {
        const provider = makeProvider(samplePayload());
        const top = await provider.getChildren();
        const anthropic = top.find((n) => n.provider === "anthropic");
        const item = (0, ProviderHeartbeatsProvider_1.buildTreeItem)(anthropic);
        const icon = item.iconPath;
        assert.strictEqual(icon.id, "pulse");
        assert.strictEqual(item.contextValue, "heartbeatProvider:active");
    });
});
suite("ProviderHeartbeatsProvider — rendering", () => {
    test("description includes 'last seen' and completions/window", async () => {
        const provider = makeProvider(samplePayload());
        const top = await provider.getChildren();
        const item = (0, ProviderHeartbeatsProvider_1.buildTreeItem)(top.find((n) => n.provider === "anthropic"));
        const desc = String(item.description);
        assert.match(desc, /last seen 12 min ago/);
        assert.match(desc, /3 completions \/ 60m/);
    });
    test("description for missing signal file is explicit", async () => {
        const payload = samplePayload();
        payload.providers.anthropic = {
            ...payload.providers.anthropic,
            signal_file_present: false,
            minutes_since_last_completion: null,
            completions_in_window: 0,
        };
        const provider = makeProvider(payload);
        const top = await provider.getChildren();
        const item = (0, ProviderHeartbeatsProvider_1.buildTreeItem)(top.find((n) => n.provider === "anthropic"));
        assert.strictEqual(String(item.description), "no capacity signal yet");
    });
    test("tooltip echoes the disclaimer", async () => {
        const provider = makeProvider(samplePayload());
        const top = await provider.getChildren();
        const item = (0, ProviderHeartbeatsProvider_1.buildTreeItem)(top[0]);
        const tip = item.tooltip.value;
        assert.match(tip, /Observational only/);
    });
    test("formatMinutesAgo: null → 'never'; <60 → 'Nm'; ≥60 → 'Hh Mm'", () => {
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.formatMinutesAgo)(null), "never");
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.formatMinutesAgo)(0), "0 min ago");
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.formatMinutesAgo)(45), "45 min ago");
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.formatMinutesAgo)(120), "2h ago");
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.formatMinutesAgo)(202), "3h 22m ago");
    });
});
suite("ProviderHeartbeatsProvider — parseFetchResult", () => {
    function fakeRun(over = {}) {
        return {
            stdout: "",
            stderr: "",
            exitCode: 0,
            signal: null,
            timedOut: false,
            ...over,
        };
    }
    test("normalizes embedded-N field names to stable shape", () => {
        const stdout = JSON.stringify({
            providers: {
                anthropic: {
                    signal_path: "/p",
                    signal_file_present: true,
                    last_completion_at: "2026-04-30T14:00:00Z",
                    minutes_since_last_completion: 5,
                    completions_in_last_60min: 7,
                    tokens_in_last_60min: 1234,
                    lookback_minutes: 60,
                    _disclaimer: "Observational only; …",
                },
            },
            _disclaimer: "Observational only; …",
        });
        const r = (0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ stdout }), 60);
        assert.ok(r.ok);
        if (r.ok) {
            const a = r.payload.providers.anthropic;
            assert.strictEqual(a.completions_in_window, 7);
            assert.strictEqual(a.tokens_in_window, 1234);
            assert.strictEqual(a.minutes_since_last_completion, 5);
        }
    });
    test("falls back to default lookback when payload lookback differs", () => {
        const stdout = JSON.stringify({
            providers: {
                anthropic: {
                    signal_path: "/p",
                    signal_file_present: true,
                    last_completion_at: null,
                    minutes_since_last_completion: null,
                    // Helper actually returned a 30m window even though we asked for 60.
                    completions_in_last_30min: 2,
                    tokens_in_last_30min: 99,
                    lookback_minutes: 30,
                },
            },
        });
        const r = (0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ stdout }), 60);
        assert.ok(r.ok);
        if (r.ok) {
            const a = r.payload.providers.anthropic;
            assert.strictEqual(a.completions_in_window, 2);
            assert.strictEqual(a.tokens_in_window, 99);
            assert.strictEqual(a.lookback_minutes, 30);
        }
    });
    test("rejects timeout, non-zero exit, malformed JSON, missing 'providers'", () => {
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ timedOut: true, exitCode: null }), 60).ok, false);
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ exitCode: 2, stderr: "boom" }), 60).ok, false);
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ stdout: "not json" }), 60).ok, false);
        assert.strictEqual((0, ProviderHeartbeatsProvider_1.parseFetchResult)(fakeRun({ stdout: '{"foo":1}' }), 60).ok, false);
    });
});
//# sourceMappingURL=providerHeartbeats.test.js.map