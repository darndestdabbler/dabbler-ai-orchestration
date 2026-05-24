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
const CheckoutPollService_1 = require("../../providers/CheckoutPollService");
const chatSessionMismatchModal_1 = require("../../providers/chatSessionMismatchModal");
const ReadOnlyIntentService_1 = require("../../providers/ReadOnlyIntentService");
// Set 033 Session 5 — CheckoutPollService Layer-2 coverage.
//
// The service has three load-bearing surfaces:
//   1. Sentinel-file consumption (read + parse + delete + dispatch).
//   2. Conflict-record parsing (strict shape validation).
//   3. Polling state machine (H4 identity gate, retry on state-file
//      change, force-override path, timeout).
//
// These tests target the pure-logic surface plus the dispatch flow via
// the test seams (`showInformationMessage` + `spawnStartSession`
// injected at construction). The UI prompt itself is exercised by
// Layer-3 Playwright coverage in checkout-polling.spec.ts.
function makeRecord(overrides = {}) {
    return {
        schemaVersion: 1,
        detectedAt: "2026-05-20T12:00:00.000Z",
        source: "claude-invoker",
        sessionSetPath: "/repo/docs/session-sets/099-fixture",
        sessionSetSlug: "099-fixture",
        sessionNumber: 1,
        heldByEngine: "codex",
        heldByProvider: "openai",
        heldByModel: "gpt-5-4",
        heldByChatSessionId: null,
        checkedOutAt: "2026-05-20T11:59:00.000Z",
        wouldBeHolderEngine: "claude",
        wouldBeHolderProvider: "anthropic",
        wouldBeHolderModel: "claude-opus-4-7",
        wouldBeHolderEffort: "high",
        wouldBeHolderChatSessionId: null,
        ...overrides,
    };
}
// Set 036 Session 4: chatSessionId-mismatch fixture — same engine+provider
// on both sides but different (non-null) per-chat IDs.
function makeChatMismatchRecord(overrides = {}) {
    return makeRecord({
        heldByEngine: "claude",
        heldByProvider: "anthropic",
        heldByModel: "claude-opus-4-7",
        heldByChatSessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        wouldBeHolderEngine: "claude",
        wouldBeHolderProvider: "anthropic",
        wouldBeHolderChatSessionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        ...overrides,
    });
}
suite("parseConflictRecord", () => {
    test("accepts a complete record", () => {
        const raw = JSON.stringify(makeRecord());
        const parsed = (0, CheckoutPollService_1.parseConflictRecord)(raw);
        assert.ok(parsed);
        assert.strictEqual(parsed?.heldByEngine, "codex");
        assert.strictEqual(parsed?.wouldBeHolderEngine, "claude");
        assert.strictEqual(parsed?.sessionNumber, 1);
    });
    test("rejects invalid JSON", () => {
        assert.strictEqual((0, CheckoutPollService_1.parseConflictRecord)("{not json"), null);
    });
    test("rejects mismatched schemaVersion", () => {
        const raw = JSON.stringify(makeRecord({ schemaVersion: 2 }));
        assert.strictEqual((0, CheckoutPollService_1.parseConflictRecord)(raw), null);
    });
    test("rejects missing heldByEngine", () => {
        const r = makeRecord();
        delete r.heldByEngine;
        const raw = JSON.stringify(r);
        assert.strictEqual((0, CheckoutPollService_1.parseConflictRecord)(raw), null);
    });
    test("rejects unknown source", () => {
        const raw = JSON.stringify(makeRecord({ source: "mystery" }));
        assert.strictEqual((0, CheckoutPollService_1.parseConflictRecord)(raw), null);
    });
    test("tolerates null heldByModel + checkedOutAt", () => {
        const raw = JSON.stringify(makeRecord({ heldByModel: null, checkedOutAt: null }));
        const parsed = (0, CheckoutPollService_1.parseConflictRecord)(raw);
        assert.ok(parsed);
        assert.strictEqual(parsed?.heldByModel, null);
        assert.strictEqual(parsed?.checkedOutAt, null);
    });
    test("tolerates missing sessionNumber (null)", () => {
        const r = makeRecord();
        r.sessionNumber = null;
        const parsed = (0, CheckoutPollService_1.parseConflictRecord)(JSON.stringify(r));
        assert.strictEqual(parsed?.sessionNumber, null);
    });
    test("parses chatSessionId fields when present", () => {
        const raw = JSON.stringify(makeChatMismatchRecord());
        const parsed = (0, CheckoutPollService_1.parseConflictRecord)(raw);
        assert.strictEqual(parsed?.heldByChatSessionId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assert.strictEqual(parsed?.wouldBeHolderChatSessionId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    });
    test("tolerates pre-Set-036 records missing chatSessionId fields entirely", () => {
        // Construct a record dict without the new fields (simulating a
        // record file written by a pre-Set-036-S4 invoker).
        const legacy = {
            schemaVersion: 1,
            detectedAt: "2026-05-20T12:00:00.000Z",
            source: "claude-invoker",
            sessionSetPath: "/repo/docs/session-sets/099-fixture",
            sessionSetSlug: "099-fixture",
            sessionNumber: 1,
            heldByEngine: "codex",
            heldByProvider: "openai",
            heldByModel: "gpt-5-4",
            checkedOutAt: "2026-05-20T11:59:00.000Z",
            wouldBeHolderEngine: "claude",
            wouldBeHolderProvider: "anthropic",
            wouldBeHolderModel: "claude-opus-4-7",
            wouldBeHolderEffort: "high",
        };
        const parsed = (0, CheckoutPollService_1.parseConflictRecord)(JSON.stringify(legacy));
        assert.ok(parsed);
        assert.strictEqual(parsed?.heldByChatSessionId, null);
        assert.strictEqual(parsed?.wouldBeHolderChatSessionId, null);
    });
});
suite("isSlotFreeForHolder (H4 identity gate)", () => {
    test("null orchestrator => slot free", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)(null, "claude", "anthropic"), true);
    });
    test("undefined orchestrator => slot free", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)(undefined, "claude", "anthropic"), true);
    });
    test("matching engine+provider => slot free (same-holder)", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic" }, "claude", "anthropic"), true);
    });
    test("third orchestrator (different engine) => slot NOT free; polling waits", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "gemini", provider: "google" }, "claude", "anthropic"), false);
    });
    test("same engine, different provider => slot NOT free", () => {
        // H4 composite — provider mismatch is a different holder even if
        // engine token matches (claude+anthropic vs claude+aws-bedrock).
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "aws-bedrock" }, "claude", "anthropic"), false);
    });
    // Round A Major fix: the predicate now optionally takes the
    // would-be holder's chatSessionId and applies the H4 tolerant-on-
    // read rule. Without these branches, a third chat (different
    // chatSessionId, same engine+provider) claiming the slot mid-poll
    // misclassifies as "free for holder" and fires blind retries.
    test("chatSessionId match: same composite => slot free", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic", chatSessionId: "abc-123" }, "claude", "anthropic", "abc-123"), true);
    });
    test("chatSessionId differs (both non-null) => slot NOT free", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic", chatSessionId: "abc-123" }, "claude", "anthropic", "xyz-789"), false);
    });
    test("prior chatSessionId null + caller string => slot free (tolerant-on-read)", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic", chatSessionId: null }, "claude", "anthropic", "abc-123"), true);
    });
    test("prior chatSessionId key absent + caller string => slot free (tolerant-on-read)", () => {
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic" }, "claude", "anthropic", "abc-123"), true);
    });
    test("caller chatSessionId undefined (legacy callers) => engine+provider-only check (back-compat)", () => {
        // Pre-Set-036-S4 callers (which only pass 3 args) get the
        // original engine+provider equality behavior unchanged.
        assert.strictEqual((0, CheckoutPollService_1.isSlotFreeForHolder)({ engine: "claude", provider: "anthropic", chatSessionId: "abc-123" }, "claude", "anthropic"), true);
    });
});
suite("isChatSessionMismatch (Set 036 S4 routing predicate)", () => {
    test("different engine returns false (engine+provider case, not chat case)", () => {
        const r = makeChatMismatchRecord({
            heldByEngine: "codex",
            wouldBeHolderEngine: "claude",
        });
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), false);
    });
    test("different provider returns false", () => {
        const r = makeChatMismatchRecord({
            heldByProvider: "aws-bedrock",
            wouldBeHolderProvider: "anthropic",
        });
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), false);
    });
    test("matching engine+provider + matching non-null chatSessionId returns false", () => {
        const r = makeChatMismatchRecord({
            heldByChatSessionId: "same-uuid",
            wouldBeHolderChatSessionId: "same-uuid",
        });
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), false);
    });
    test("matching engine+provider + differing non-null chatSessionId returns true", () => {
        const r = makeChatMismatchRecord();
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), true);
    });
    test("one-side null chatSessionId collapses to engine+provider case (tolerant-on-read)", () => {
        const r = makeChatMismatchRecord({ heldByChatSessionId: null });
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), false);
    });
    test("both-side null chatSessionId collapses to engine+provider case", () => {
        const r = makeChatMismatchRecord({
            heldByChatSessionId: null,
            wouldBeHolderChatSessionId: null,
        });
        assert.strictEqual((0, CheckoutPollService_1.isChatSessionMismatch)(r), false);
    });
});
suite("pollKey", () => {
    test("derives slug + would-be holder composite (null chatSessionId → sentinel)", () => {
        const key = (0, CheckoutPollService_1.pollKey)(makeRecord());
        assert.strictEqual(key, "099-fixture::claude+anthropic+<no-chat-id>");
    });
    test("two would-be holders racing for the same slot have distinct keys", () => {
        const claude = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderEngine: "claude", wouldBeHolderProvider: "anthropic" }));
        const gemini = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderEngine: "gemini", wouldBeHolderProvider: "google" }));
        assert.notStrictEqual(claude, gemini);
    });
    test("Round A fix: two chats on the same engine+provider but distinct chatSessionIds produce distinct keys", () => {
        // Regression pin: without chatSessionId in the key, chat B's
        // takeover modal would be dropped because the in-flight de-dup
        // collapses it into chat A's pending prompt.
        const chatA = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderChatSessionId: "aaaa-1111" }));
        const chatB = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderChatSessionId: "bbbb-2222" }));
        assert.notStrictEqual(chatA, chatB);
    });
    test("two pre-Set-036 records (both null chatSessionId) still collapse to one key", () => {
        // The sentinel normalization keeps the Set-033 collapse behavior
        // intact for records that genuinely don't carry a per-chat id.
        const a = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderChatSessionId: null }));
        const b = (0, CheckoutPollService_1.pollKey)(makeRecord({ wouldBeHolderChatSessionId: null }));
        assert.strictEqual(a, b);
    });
});
function makeService(showResult, spawnResults = []) {
    const spawnCalls = [];
    let promptCalls = 0;
    let nextSpawn = 0;
    const service = new CheckoutPollService_1.CheckoutPollService({
        pythonPathResolver: () => "python",
        timeoutMinutesResolver: () => 30,
        showInformationMessage: (_msg, ..._items) => {
            promptCalls += 1;
            return Promise.resolve(showResult);
        },
        spawnStartSession: async (python, args, cwd) => {
            spawnCalls.push({ python, args, cwd });
            const r = spawnResults[nextSpawn] ?? 0;
            nextSpawn += 1;
            return r;
        },
    });
    return {
        service,
        spawnCalls,
        get promptCalls() {
            return promptCalls;
        },
    };
}
suite("handleConflict dispatch", () => {
    test("Dismiss action runs no spawn and leaves no active poll", async () => {
        const ctx = makeService(CheckoutPollService_1.POLL_PROMPT_DISMISS, []);
        await ctx.service.handleConflict(makeRecord());
        assert.strictEqual(ctx.spawnCalls.length, 0);
        assert.strictEqual(ctx.service.activePollCount, 0);
        ctx.service.dispose();
    });
    test("Force override spawns start_session --force", async () => {
        const ctx = makeService(CheckoutPollService_1.POLL_PROMPT_FORCE, [0]);
        await ctx.service.handleConflict(makeRecord());
        assert.strictEqual(ctx.spawnCalls.length, 1);
        assert.ok(ctx.spawnCalls[0].args.includes("--force"));
        assert.ok(ctx.spawnCalls[0].args.includes("--engine"));
        const engineIdx = ctx.spawnCalls[0].args.indexOf("--engine");
        assert.strictEqual(ctx.spawnCalls[0].args[engineIdx + 1], "claude");
        assert.strictEqual(ctx.service.activePollCount, 0);
        ctx.service.dispose();
    });
    suite("chatSessionId-mismatch routes to takeover modal (Set 036 S4)", () => {
        teardown(() => {
            // Reset the singleton so an intent set in one test doesn't bleed
            // into the next.
            (0, ReadOnlyIntentService_1.resetReadOnlyIntentServiceForTests)();
        });
        function makeChatMismatchService(modalChoice) {
            const spawnCalls = [];
            let pollPromptCalls = 0;
            let modalCalls = 0;
            const readOnlyIntents = new ReadOnlyIntentService_1.ReadOnlyIntentService();
            const service = new CheckoutPollService_1.CheckoutPollService({
                pythonPathResolver: () => "python",
                timeoutMinutesResolver: () => 30,
                showInformationMessage: () => {
                    pollPromptCalls += 1;
                    return Promise.resolve(CheckoutPollService_1.POLL_PROMPT_DISMISS);
                },
                spawnStartSession: async (python, args, cwd) => {
                    spawnCalls.push({ python, args, cwd });
                    return 0;
                },
                showMismatchModal: (_m, _o, ..._items) => {
                    modalCalls += 1;
                    return Promise.resolve(modalChoice);
                },
                readOnlyIntentService: readOnlyIntents,
            });
            return {
                service,
                spawnCalls,
                readOnlyIntents,
                get pollPromptCalls() {
                    return pollPromptCalls;
                },
                get modalCalls() {
                    return modalCalls;
                },
            };
        }
        test("chatSessionId-mismatch record bypasses the poll prompt and shows the modal", async () => {
            const ctx = makeChatMismatchService(chatSessionMismatchModal_1.MODAL_CANCEL);
            await ctx.service.handleConflict(makeChatMismatchRecord());
            assert.strictEqual(ctx.modalCalls, 1, "modal should fire once");
            assert.strictEqual(ctx.pollPromptCalls, 0, "poll prompt must not fire on chat-id mismatch");
            assert.strictEqual(ctx.spawnCalls.length, 0);
            ctx.service.dispose();
        });
        test("Take Over choice spawns --force AND forwards --chat-session-id", async () => {
            const ctx = makeChatMismatchService(chatSessionMismatchModal_1.MODAL_TAKE_OVER);
            await ctx.service.handleConflict(makeChatMismatchRecord());
            assert.strictEqual(ctx.spawnCalls.length, 1);
            const args = ctx.spawnCalls[0].args;
            assert.ok(args.includes("--force"));
            const cidIdx = args.indexOf("--chat-session-id");
            assert.notStrictEqual(cidIdx, -1, "--chat-session-id should be forwarded");
            assert.strictEqual(args[cidIdx + 1], "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
            ctx.service.dispose();
        });
        test("Read-Only choice sets the read-only intent and skips spawn", async () => {
            const ctx = makeChatMismatchService(chatSessionMismatchModal_1.MODAL_READ_ONLY);
            const rec = makeChatMismatchRecord();
            await ctx.service.handleConflict(rec);
            assert.strictEqual(ctx.spawnCalls.length, 0, "no state write on read-only");
            assert.strictEqual(ctx.readOnlyIntents.isReadOnly(rec.sessionSetPath), true, "read-only intent must be set for the session-set path");
            ctx.service.dispose();
        });
        test("Cancel choice (or modal dismissal) is a true no-op", async () => {
            const ctx = makeChatMismatchService(undefined);
            const rec = makeChatMismatchRecord();
            await ctx.service.handleConflict(rec);
            assert.strictEqual(ctx.spawnCalls.length, 0);
            assert.strictEqual(ctx.readOnlyIntents.isReadOnly(rec.sessionSetPath), false);
            ctx.service.dispose();
        });
        test("non-chat-mismatch record still uses the legacy poll prompt", async () => {
            const ctx = makeChatMismatchService(chatSessionMismatchModal_1.MODAL_CANCEL);
            // Default makeRecord() is the codex-claude engine+provider case
            // (no chat-id mismatch).
            await ctx.service.handleConflict(makeRecord());
            assert.strictEqual(ctx.modalCalls, 0, "modal must not fire on engine+provider case");
            assert.strictEqual(ctx.pollPromptCalls, 1);
            ctx.service.dispose();
        });
    });
    test("In-flight de-dup: second handleConflict short-circuits", async () => {
        const resolvers = [];
        let promptCalls = 0;
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            showInformationMessage: (_msg) => {
                promptCalls += 1;
                return new Promise((resolve) => {
                    resolvers.push(resolve);
                });
            },
            spawnStartSession: async () => 0,
        });
        const record = makeRecord();
        const p1 = service.handleConflict(record);
        const p2 = service.handleConflict(record);
        // Give microtasks a tick to run so the second handleConflict can
        // hit its in-flight short-circuit path.
        await new Promise((r) => setTimeout(r, 10));
        assert.strictEqual(promptCalls, 1, "second handleConflict should not have invoked the prompt");
        await p2;
        // Resolve the first prompt so the test cleans up without hanging.
        resolvers[0](CheckoutPollService_1.POLL_PROMPT_DISMISS);
        await p1;
        service.dispose();
    });
});
// ----- beginPolling + retry on state-file change -----
suite("beginPolling state machine", () => {
    let tmpRoot;
    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "checkoutPoll-"));
    });
    teardown(() => {
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
        catch {
            // best effort
        }
    });
    function setupSet(orchestrator) {
        const setDir = path.join(tmpRoot, "docs", "session-sets", "099-fixture");
        fs.mkdirSync(setDir, { recursive: true });
        const statePath = path.join(setDir, "session-state.json");
        const write = (o) => {
            fs.writeFileSync(statePath, JSON.stringify({
                status: "in-progress",
                currentSession: 1,
                orchestrator: o,
            }), "utf8");
        };
        write(orchestrator);
        return { setDir, statePath, writeOrchestrator: write };
    }
    test("immediate-retry path: slot already free at beginPolling => spawn fires + poll resolves on success", async () => {
        const { setDir } = setupSet(null);
        const spawnCalls = [];
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            spawnStartSession: async (python, args, cwd) => {
                spawnCalls.push({ python, args, cwd });
                return 0;
            },
        });
        const record = makeRecord({ sessionSetPath: setDir });
        service.beginPolling(record);
        // Allow the initial tryRetry microtask + spawn callback to run.
        await new Promise((r) => setTimeout(r, 50));
        assert.strictEqual(spawnCalls.length, 1);
        assert.ok(!spawnCalls[0].args.includes("--force"));
        assert.strictEqual(service.activePollCount, 0);
        service.dispose();
    });
    test("held-by-third path: orchestrator block names different holder => no spawn", async () => {
        const { setDir } = setupSet({ engine: "gemini", provider: "google" });
        const spawnCalls = [];
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            spawnStartSession: async (python, args, cwd) => {
                spawnCalls.push({ python, args, cwd });
                return 0;
            },
        });
        const record = makeRecord({ sessionSetPath: setDir });
        service.beginPolling(record);
        await new Promise((r) => setTimeout(r, 50));
        assert.strictEqual(spawnCalls.length, 0);
        assert.strictEqual(service.activePollCount, 1);
        service.dispose();
    });
    test("retry args include session-number when present, omit when null", async () => {
        const { setDir } = setupSet(null);
        const spawnCalls = [];
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            spawnStartSession: async (python, args, cwd) => {
                spawnCalls.push({ python, args, cwd });
                return 0;
            },
        });
        service.beginPolling(makeRecord({ sessionSetPath: setDir, sessionNumber: 3 }));
        await new Promise((r) => setTimeout(r, 30));
        const sessIdx = spawnCalls[0].args.indexOf("--session-number");
        assert.notStrictEqual(sessIdx, -1);
        assert.strictEqual(spawnCalls[0].args[sessIdx + 1], "3");
        service.dispose();
        const service2 = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            spawnStartSession: async (_python, args, _cwd) => {
                assert.strictEqual(args.indexOf("--session-number"), -1);
                return 0;
            },
        });
        service2.beginPolling(makeRecord({ sessionSetPath: setDir, sessionNumber: null }));
        await new Promise((r) => setTimeout(r, 30));
        service2.dispose();
    });
    test("dispose() closes watcher and clears state without firing more spawns", async () => {
        const { setDir, writeOrchestrator } = setupSet({
            engine: "gemini",
            provider: "google",
        });
        let spawns = 0;
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            spawnStartSession: async () => {
                spawns += 1;
                return 0;
            },
        });
        service.beginPolling(makeRecord({ sessionSetPath: setDir }));
        await new Promise((r) => setTimeout(r, 30));
        assert.strictEqual(spawns, 0);
        service.dispose();
        // After dispose, a state-file change must not spawn anything.
        writeOrchestrator(null);
        await new Promise((r) => setTimeout(r, 100));
        assert.strictEqual(spawns, 0);
        assert.strictEqual(service.activePollCount, 0);
    });
});
// ----- processFile + sentinel directory ingest -----
suite("processFile sentinel ingest", () => {
    let tmpRoot;
    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "checkoutPollIngest-"));
    });
    teardown(() => {
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
        catch {
            // best effort
        }
    });
    test("processFile reads + parses + deletes + dispatches", async () => {
        const filePath = path.join(tmpRoot, "conflict.json");
        fs.writeFileSync(filePath, JSON.stringify(makeRecord()), "utf8");
        let promptInvoked = false;
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            showInformationMessage: () => {
                promptInvoked = true;
                return Promise.resolve(CheckoutPollService_1.POLL_PROMPT_DISMISS);
            },
            spawnStartSession: async () => 0,
        });
        service.processFile(filePath);
        // Allow the async handleConflict to start
        await new Promise((r) => setTimeout(r, 30));
        assert.strictEqual(fs.existsSync(filePath), false, "sentinel should be deleted after read");
        assert.strictEqual(promptInvoked, true);
        service.dispose();
    });
    test("processFile drops malformed JSON without crashing", () => {
        const filePath = path.join(tmpRoot, "bad.json");
        fs.writeFileSync(filePath, "{not json", "utf8");
        const service = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: () => "python",
            timeoutMinutesResolver: () => 30,
            showInformationMessage: () => Promise.resolve(CheckoutPollService_1.POLL_PROMPT_DISMISS),
            spawnStartSession: async () => 0,
        });
        service.processFile(filePath);
        assert.strictEqual(fs.existsSync(filePath), false);
        service.dispose();
    });
});
// ----- conflictDirPath -----
suite("conflictDirPath", () => {
    test("is anchored under ~/.dabbler/checkout-conflicts", () => {
        const dir = (0, CheckoutPollService_1.conflictDirPath)();
        assert.ok(dir.endsWith(path.join(".dabbler", "checkout-conflicts")));
        assert.ok(dir.startsWith(os.homedir()));
    });
});
// Sanity: every prompt-action constant must be a distinct string so
// the showInformationMessage match arms can't be confused. (Cheap
// guard against future copy edits silently collapsing them.)
suite("prompt-action constants", () => {
    test("three distinct labels", () => {
        const set = new Set([CheckoutPollService_1.POLL_PROMPT_POLL, CheckoutPollService_1.POLL_PROMPT_FORCE, CheckoutPollService_1.POLL_PROMPT_DISMISS]);
        assert.strictEqual(set.size, 3);
    });
});
//# sourceMappingURL=checkoutPollService.test.js.map