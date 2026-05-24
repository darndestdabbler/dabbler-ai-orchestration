"use strict";
// Set 036 Session 5 — Layer-3 Playwright coverage for the Q5
// "tolerant-on-read, strict-on-write" semantics of the chatSessionId
// field. Two cases the start_session writer must handle:
//
//   (a) Legacy state file — pre-Set-036 writer left no chatSessionId
//       field in the orchestrator block. A Set-036+ chat with any
//       chatSessionId can re-attach (same engine + provider) without
//       refusal; the field gets populated on the first new write.
//
//   (b) Set-036 null state — a Set-036 writer that didn't have a
//       chatSessionId at the time of write left the field present
//       and null. Same tolerance: re-attach succeeds; the first
//       write that supplies a non-null chatSessionId populates the
//       field strictly.
//
// After population, subsequent attempts from a DIFFERENT chatSessionId
// are refused per the strict-on-write contract — this is the
// "strict-on-subsequent" leg the spec calls out.
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const electronLaunch_1 = require("./electronLaunch");
function teardown(per) {
    if (per.tmpPath) {
        try {
            (0, electronLaunch_1.cleanupTmpDir)(per.tmpPath);
        }
        catch { /* opportunistic */ }
    }
}
(0, test_1.test)("legacy state (no chatSessionId field) tolerates a new chat and populates the field on first write", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-csid-legacy");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "036-csid-legacy", 2);
        (0, electronLaunch_1.startSession)(h, 1);
        // Seed the orchestrator block WITHOUT a chatSessionId key — the
        // shape a pre-Set-036 writer left on disk. seedOrchestratorBlock's
        // "in" check on the overrides preserves the omitted-key shape;
        // re-reading proves no chatSessionId key exists.
        (0, electronLaunch_1.seedOrchestratorBlock)(h, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
            // chatSessionId intentionally omitted — legacy shape.
        });
        const seeded = (0, electronLaunch_1.readStateFile)(h);
        // Sanity-check the legacy shape held by the writer that left it.
        (0, test_1.expect)(seeded.orchestrator).toBeTruthy();
        (0, test_1.expect)("chatSessionId" in (seeded.orchestrator ?? {})).toBe(false);
        // Chat C re-attaches with a chatSessionId. Same engine + provider,
        // legacy state's chatSessionId-key-absent branch → tolerated.
        const chatIdC = "CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC";
        const r = (0, electronLaunch_1.attemptStartSession)(h, 1, { engine: "claude", provider: "anthropic", model: "claude-opus-4-7", effort: "high" }, { chatSessionId: chatIdC });
        (0, test_1.expect)(r.exit).toBe(0);
        // First new write populates the field strictly.
        const after = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(after.orchestrator?.chatSessionId).toBe(chatIdC);
    }
    finally {
        teardown(per);
    }
});
(0, test_1.test)("Set-036 null state tolerates a new chat and populates the field on first write", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-csid-null");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "036-csid-null", 2);
        (0, electronLaunch_1.startSession)(h, 1);
        // Seed with chatSessionId present and null — the Set-036 writer
        // shape when no ID was available at write time (e.g., Claude
        // chat without a hook-payload session_id, or Codex/Gemini/Copilot
        // operator who skipped the new_chat_id CLI workflow).
        (0, electronLaunch_1.seedOrchestratorBlock)(h, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
            chatSessionId: null,
        });
        const seeded = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(seeded.orchestrator).toBeTruthy();
        (0, test_1.expect)(seeded.orchestrator?.chatSessionId).toBeNull();
        const chatIdD = "DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD";
        const r = (0, electronLaunch_1.attemptStartSession)(h, 1, { engine: "claude", provider: "anthropic", model: "claude-opus-4-7", effort: "high" }, { chatSessionId: chatIdD });
        (0, test_1.expect)(r.exit).toBe(0);
        const after = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(after.orchestrator?.chatSessionId).toBe(chatIdD);
    }
    finally {
        teardown(per);
    }
});
(0, test_1.test)("post-population: a different chatSessionId is refused strictly", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-csid-strict");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "036-csid-strict", 2);
        (0, electronLaunch_1.startSession)(h, 1);
        // Seed legacy shape, populate via chat C, then attempt from chat
        // E. The H3 + H4 strict branch refuses the second chat because
        // the prior block now has a non-null string chatSessionId.
        (0, electronLaunch_1.seedOrchestratorBlock)(h, {
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
            // chatSessionId omitted (legacy).
        });
        const chatIdC = "CCCCCCCC-CCCC-CCCC-CCCC-FFFFFFFFFFFF";
        const populate = (0, electronLaunch_1.attemptStartSession)(h, 1, { engine: "claude", provider: "anthropic", model: "claude-opus-4-7", effort: "high" }, { chatSessionId: chatIdC });
        (0, test_1.expect)(populate.exit).toBe(0);
        const populated = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(populated.orchestrator?.chatSessionId).toBe(chatIdC);
        const chatIdE = "EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE";
        const r = (0, electronLaunch_1.attemptStartSession)(h, 1, { engine: "claude", provider: "anthropic", model: "claude-opus-4-7", effort: "high" }, { chatSessionId: chatIdE });
        (0, test_1.expect)(r.exit).toBe(4);
        (0, test_1.expect)(r.stderr).toContain(chatIdC);
        (0, test_1.expect)(r.stderr).toContain(chatIdE);
        (0, test_1.expect)(r.stderr).toContain("--force");
        // State unchanged: still holds chat C.
        const final = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(final.orchestrator?.chatSessionId).toBe(chatIdC);
    }
    finally {
        teardown(per);
    }
});
//# sourceMappingURL=chatsessionid-missing-tolerance.spec.js.map