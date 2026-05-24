"use strict";
// Set 036 Session 2 — Layer-2 coverage of the Claude Code SessionStart
// hook invoker shim's `session_id` pass-through.
//
// The shim itself is plain Node (it has no vscode imports), so the
// test loads it through `require()` and drives the exported helpers
// directly. The shim's `main()` flow (which spawns `python -m
// ai_router.start_session`) is skipped — the conditional
// `require.main === module` guard at the bottom of the shim returns
// the helper exports without firing main when imported.
//
// Tests cover the audit-locked Set 036 Q1 contract:
//   - `session_id` lives at the top of Claude Code's SessionStart
//     payload (string).
//   - Empty / whitespace-only / non-string / missing values degrade
//     to null so start_session falls through to its tolerant-on-read
//     branch (R2: payload schema drift).
//   - Surrounding whitespace is trimmed; the on-disk identity stays
//     clean.
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
const path = __importStar(require("path"));
const url_1 = require("url");
// Node's module-type detector flips this file to ESM at load time
// (the structural cue is enough — explicit `"type": "module"` is not
// required), so plain top-level `require()` is not available in
// scope. Dynamic `import()` works uniformly under both Node ESM and
// the project's CommonJS `tsc --noEmit` gate, and the JS shim's
// `module.exports = { ... }` lines up correctly with the default
// export interop.
let invoker;
suite("claude-session-start-invoker — extractSessionId", () => {
    suiteSetup(async () => {
        // npm run test:unit runs from the extension's package root, so
        // the invoker shim lives at `scripts/claude-session-start-invoker.js`
        // relative to cwd. Convert to a file: URL so dynamic import
        // works on Windows where bare paths confuse the ESM loader.
        const invokerPath = path.resolve(process.cwd(), "scripts", "claude-session-start-invoker.js");
        const mod = await Promise.resolve(`${(0, url_1.pathToFileURL)(invokerPath).href}`).then(s => __importStar(require(s)));
        // The shim uses `module.exports = { ... }`, which the ESM
        // CommonJS interop surfaces as the module's `default` export.
        invoker = (mod.default ?? mod);
    });
    test("returns the session_id when present and non-empty", () => {
        const payload = { session_id: "abc123-deadbeef" };
        assert.strictEqual(invoker.extractSessionId(payload), "abc123-deadbeef");
    });
    test("trims surrounding whitespace before returning", () => {
        const payload = { session_id: "  abc123  " };
        assert.strictEqual(invoker.extractSessionId(payload), "abc123");
    });
    test("returns null when the field is missing", () => {
        assert.strictEqual(invoker.extractSessionId({ cwd: "/tmp" }), null);
    });
    test("returns null when the field is the empty string", () => {
        assert.strictEqual(invoker.extractSessionId({ session_id: "" }), null);
    });
    test("returns null when the field is whitespace only", () => {
        assert.strictEqual(invoker.extractSessionId({ session_id: "   " }), null);
        assert.strictEqual(invoker.extractSessionId({ session_id: "\t\n" }), null);
    });
    test("returns null when the field is not a string (number)", () => {
        assert.strictEqual(invoker.extractSessionId({ session_id: 42 }), null);
    });
    test("returns null when the field is not a string (object)", () => {
        assert.strictEqual(invoker.extractSessionId({ session_id: { id: "x" } }), null);
    });
    test("returns null when the field is null or undefined", () => {
        assert.strictEqual(invoker.extractSessionId({ session_id: null }), null);
        assert.strictEqual(invoker.extractSessionId({ session_id: undefined }), null);
    });
    test("returns null when payload itself is null / undefined / non-object", () => {
        assert.strictEqual(invoker.extractSessionId(null), null);
        assert.strictEqual(invoker.extractSessionId(undefined), null);
        assert.strictEqual(invoker.extractSessionId("a string"), null);
        assert.strictEqual(invoker.extractSessionId(42), null);
    });
});
suite("claude-session-start-invoker — parsePayload", () => {
    suiteSetup(async () => {
        // npm run test:unit runs from the extension's package root, so
        // the invoker shim lives at `scripts/claude-session-start-invoker.js`
        // relative to cwd. Convert to a file: URL so dynamic import
        // works on Windows where bare paths confuse the ESM loader.
        const invokerPath = path.resolve(process.cwd(), "scripts", "claude-session-start-invoker.js");
        const mod = await Promise.resolve(`${(0, url_1.pathToFileURL)(invokerPath).href}`).then(s => __importStar(require(s)));
        // The shim uses `module.exports = { ... }`, which the ESM
        // CommonJS interop surfaces as the module's `default` export.
        invoker = (mod.default ?? mod);
    });
    test("returns the parsed JSON object for a well-formed payload", () => {
        const raw = JSON.stringify({ cwd: "/tmp", session_id: "abc" });
        const parsed = invoker.parsePayload(raw);
        assert.strictEqual(parsed.cwd, "/tmp");
        assert.strictEqual(parsed.session_id, "abc");
    });
    test("returns an empty object for empty / whitespace input", () => {
        assert.deepStrictEqual(invoker.parsePayload(""), {});
        assert.deepStrictEqual(invoker.parsePayload("   "), {});
    });
    test("returns an empty object for malformed JSON", () => {
        assert.deepStrictEqual(invoker.parsePayload("{ not json"), {});
    });
    test("end-to-end: parsePayload + extractSessionId on a typical payload", () => {
        const raw = JSON.stringify({
            cwd: "/workspace",
            session_id: "sess-9c87f",
            hook_event_name: "SessionStart",
        });
        const payload = invoker.parsePayload(raw);
        assert.strictEqual(invoker.extractSessionId(payload), "sess-9c87f");
    });
});
suite("claude-session-start-invoker — preserveExistingClaude (Round B Medium fix)", () => {
    suiteSetup(async () => {
        const invokerPath = path.resolve(process.cwd(), "scripts", "claude-session-start-invoker.js");
        const mod = await Promise.resolve(`${(0, url_1.pathToFileURL)(invokerPath).href}`).then(s => __importStar(require(s)));
        invoker = (mod.default ?? mod);
    });
    test("returns null when no orchestrator block exists", () => {
        assert.strictEqual(invoker.preserveExistingClaude({}, "sess-A"), null);
        assert.strictEqual(invoker.preserveExistingClaude({ orchestrator: null }, "sess-A"), null);
    });
    test("returns null when engine is not claude", () => {
        const state = {
            orchestrator: {
                engine: "gpt-5-4",
                provider: "openai",
                model: "gpt-5",
                effort: "high",
            },
        };
        assert.strictEqual(invoker.preserveExistingClaude(state, "sess-A"), null);
    });
    test("returns null when provider is not anthropic", () => {
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "wrong",
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.strictEqual(invoker.preserveExistingClaude(state, "sess-A"), null);
    });
    test("preserves model + effort when chatSessionId matches exactly", () => {
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                chatSessionId: "sess-A",
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.deepStrictEqual(invoker.preserveExistingClaude(state, "sess-A"), {
            model: "claude-opus-4-7",
            effort: "high",
        });
    });
    test("returns null when chatSessionId mismatches (different Claude chat)", () => {
        // The new Claude chat (different per-chat ID) is NOT the same
        // holder under H4 — preserving model/effort would surface a
        // stale-attribution gauge in the explorer.
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                chatSessionId: "sess-A",
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.strictEqual(invoker.preserveExistingClaude(state, "sess-B"), null);
    });
    test("tolerates prior chatSessionId key absent (pre-Set-036 writer)", () => {
        // Legacy state files have no chatSessionId field at all; the
        // writer's first new write populates the field strictly, so the
        // invoker should treat the legacy block as a same-holder match
        // and preserve model/effort.
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.deepStrictEqual(invoker.preserveExistingClaude(state, "sess-B"), {
            model: "claude-opus-4-7",
            effort: "high",
        });
    });
    test("tolerates prior chatSessionId present and null (Set 036+ no-ID write)", () => {
        // A Set 036+ writer that had no per-chat ID at write time writes
        // chatSessionId: null. The same tolerance branch applies as for
        // the key-absent legacy case.
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                chatSessionId: null,
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.deepStrictEqual(invoker.preserveExistingClaude(state, "sess-B"), {
            model: "claude-opus-4-7",
            effort: "high",
        });
    });
    test("falls back to 'unknown' when prior model / effort are missing strings", () => {
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                chatSessionId: "sess-A",
            },
        };
        assert.deepStrictEqual(invoker.preserveExistingClaude(state, "sess-A"), {
            model: "unknown",
            effort: "unknown",
        });
    });
    test("treats both caller and prior null as a match (legacy + no-ID hook payload)", () => {
        // The invoker passes null when the SessionStart payload has no
        // session_id. Combined with a prior block whose chatSessionId is
        // null (or absent), this is the conservative no-signal case and
        // should preserve.
        const state = {
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                chatSessionId: null,
                model: "claude-opus-4-7",
                effort: "high",
            },
        };
        assert.deepStrictEqual(invoker.preserveExistingClaude(state, null), {
            model: "claude-opus-4-7",
            effort: "high",
        });
    });
});
//# sourceMappingURL=claudeSessionStartInvoker.test.js.map