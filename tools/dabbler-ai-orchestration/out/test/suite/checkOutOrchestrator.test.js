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
const checkOutOrchestrator_1 = require("../../commands/checkOutOrchestrator");
// Set 029 Session 5 — manual-override quickpick helpers.
// MRU read/write hits ~/.dabbler/orchestrator-mru.json directly so the
// suite redirects HOME/USERPROFILE to a tmpdir per test, runs the
// helper, then restores. Pure logic (label formatting + provider→engine
// mapping) needs no filesystem isolation. Set 033 S3 added the
// providerToEngine coverage alongside the command rename to
// `dabbler.checkOutOrchestrator` and the marker-helper retirement.
function withTempHome(fn) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-mru-"));
    const prevHome = process.env.HOME;
    const prevUserprofile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    try {
        fn();
    }
    finally {
        if (prevHome === undefined)
            delete process.env.HOME;
        else
            process.env.HOME = prevHome;
        if (prevUserprofile === undefined)
            delete process.env.USERPROFILE;
        else
            process.env.USERPROFILE = prevUserprofile;
        try {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
        catch {
            // best effort
        }
    }
}
const TUPLE_A = {
    provider: "anthropic",
    model: "claude-opus-4-7",
    effort: "high",
    thinking: true,
};
const TUPLE_B = {
    provider: "google",
    model: "gemini-2.5-pro",
    effort: "high",
    thinking: false,
};
const TUPLE_C = {
    provider: "openai",
    model: "gpt-5",
    effort: "medium",
    thinking: true,
};
suite("pushMru", () => {
    test("empty MRU + one push → single-entry MRU on disk", () => {
        withTempHome(() => {
            const next = (0, checkOutOrchestrator_1.pushMru)(TUPLE_A, []);
            assert.deepStrictEqual(next, [TUPLE_A]);
            const persisted = (0, checkOutOrchestrator_1.readMru)();
            assert.deepStrictEqual(persisted, [TUPLE_A]);
        });
    });
    test("duplicate push de-duplicates and moves to front", () => {
        withTempHome(() => {
            (0, checkOutOrchestrator_1.pushMru)(TUPLE_A, []);
            (0, checkOutOrchestrator_1.pushMru)(TUPLE_B);
            // Push TUPLE_A again — should NOT appear twice, should move to
            // the front.
            const next = (0, checkOutOrchestrator_1.pushMru)(TUPLE_A);
            assert.deepStrictEqual(next, [TUPLE_A, TUPLE_B]);
            assert.deepStrictEqual((0, checkOutOrchestrator_1.readMru)(), [TUPLE_A, TUPLE_B]);
        });
    });
    test("two distinct tuples for the same provider both retained", () => {
        withTempHome(() => {
            (0, checkOutOrchestrator_1.pushMru)(TUPLE_A, []);
            const sameProviderDifferentEffort = {
                ...TUPLE_A,
                effort: "low",
            };
            const next = (0, checkOutOrchestrator_1.pushMru)(sameProviderDifferentEffort);
            assert.strictEqual(next.length, 2);
            assert.deepStrictEqual(next[0], sameProviderDifferentEffort);
            assert.deepStrictEqual(next[1], TUPLE_A);
        });
    });
    test("MRU caps at 8 entries (oldest evicted)", () => {
        withTempHome(() => {
            // Push 10 distinct tuples; only the most recent 8 should survive.
            for (let i = 0; i < 10; i++) {
                (0, checkOutOrchestrator_1.pushMru)({
                    provider: "anthropic",
                    model: `model-${i}`,
                    effort: "high",
                    thinking: i % 2 === 0,
                });
            }
            const persisted = (0, checkOutOrchestrator_1.readMru)();
            assert.strictEqual(persisted.length, 8);
            // Newest first: model-9 at index 0, oldest survivor model-2 at index 7.
            assert.strictEqual(persisted[0].model, "model-9");
            assert.strictEqual(persisted[7].model, "model-2");
        });
    });
});
suite("readMru", () => {
    test("returns [] when no MRU file exists yet", () => {
        withTempHome(() => {
            assert.deepStrictEqual((0, checkOutOrchestrator_1.readMru)(), []);
        });
    });
    test("returns [] on malformed JSON without throwing", () => {
        withTempHome(() => {
            const file = path.join(process.env.HOME, ".dabbler", "orchestrator-mru.json");
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, "{not json", "utf8");
            assert.deepStrictEqual((0, checkOutOrchestrator_1.readMru)(), []);
        });
    });
    test("filters out non-tuple entries", () => {
        withTempHome(() => {
            const file = path.join(process.env.HOME, ".dabbler", "orchestrator-mru.json");
            fs.mkdirSync(path.dirname(file), { recursive: true });
            // Mix one valid tuple with two garbage entries.
            fs.writeFileSync(file, JSON.stringify([TUPLE_A, { bogus: true }, "string"], null, 2), "utf8");
            assert.deepStrictEqual((0, checkOutOrchestrator_1.readMru)(), [TUPLE_A]);
        });
    });
});
suite("formatTupleLabel", () => {
    test("formats with display names for known provider/model + thinking on", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.formatTupleLabel)(TUPLE_A), "Claude Opus 4.7 — High effort, Thinking on");
    });
    test("formats Gemini Pro with thinking off", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.formatTupleLabel)(TUPLE_B), "Gemini Gemini 2.5 Pro — High effort, Thinking off");
    });
    test("falls back to raw model id for unknown model", () => {
        const unknown = {
            provider: "openai",
            model: "future-mystery-model",
            effort: "low",
            thinking: false,
        };
        assert.strictEqual((0, checkOutOrchestrator_1.formatTupleLabel)(unknown), "Codex future-mystery-model — Low effort, Thinking off");
    });
});
suite("providerToEngine", () => {
    // Set 033 S3 / H4: the (engine + provider) composite is the holder-
    // identity key on session-state.json's orchestrator block. The
    // manual quickpick maps the operator-facing provider to the engine
    // brand name that the writer + reader read back. Two Claude models
    // from anthropic resolve to the same (claude + anthropic) holder by
    // design (Set 033 R3); the mapping is the place that pins this.
    test("anthropic → claude", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.providerToEngine)("anthropic"), "claude");
    });
    test("openai → codex", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.providerToEngine)("openai"), "codex");
    });
    test("google → gemini", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.providerToEngine)("google"), "gemini");
    });
    test("github → copilot", () => {
        assert.strictEqual((0, checkOutOrchestrator_1.providerToEngine)("github"), "copilot");
    });
});
//# sourceMappingURL=checkOutOrchestrator.test.js.map