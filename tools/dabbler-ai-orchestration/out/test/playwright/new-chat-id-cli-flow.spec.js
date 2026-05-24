"use strict";
// Set 036 Session 5 — Layer-3 Playwright coverage for the
// Q1-fallback CLI: `python -m ai_router.new_chat_id` mints a UUID v4
// for orchestrators with no native per-chat session-id surface
// (Codex CLI, Gemini Code Assist, GitHub Copilot, manual Lightweight
// tier). Operator workflow:
//
//   $ eval "$(python -m ai_router.new_chat_id --export --shell bash)"
//   $ python -m ai_router.start_session ... [--chat-session-id "$CHAT_SESSION_ID"]
//
// The CLI is idempotent against an existing non-empty $CHAT_SESSION_ID
// — repeated invocations from the same shell emit the same identifier
// so the operator never accidentally re-mints mid-workflow.
//
// This spec exercises three legs at the process boundary:
//   - plain mode mints a valid-shape UUID v4
//   - the minted UUID, set as $CHAT_SESSION_ID, flows into the
//     orchestrator block when start_session is invoked WITHOUT
//     --chat-session-id (env-fallback branch in _resolve_chat_session_id)
//   - idempotency: a second invocation of the CLI in the same env
//     returns the same UUID rather than re-minting.
//
// Together these prove the spec's "manual flow via the fallback CLI"
// claim that the per-chat ID survives the round-trip from CLI mint
// to writer-recorded state field.
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
const test_1 = require("@playwright/test");
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const electronLaunch_1 = require("./electronLaunch");
const PYTHON = process.env.HARNESS_PYTHON || "python";
// Repo root needed so `python -m ai_router.new_chat_id` can resolve
// the `ai_router` package when the spec runs from the extension
// subdirectory. Mirrors the REPO_ROOT derivation in electronLaunch.ts
// (extension lives at <repo>/tools/dabbler-ai-orchestration; from
// src/test/playwright/ that's five parent hops: playwright → test →
// src → dabbler-ai-orchestration → tools → repo root).
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
// Mirror electronLaunch's filtered-env hygiene so a polluted parent
// shell can't redirect imports inside the CLI subprocess. Kept local
// to this spec rather than exported to avoid widening the helper's
// API surface for a single caller.
function _filteredEnv(extra = {}) {
    const passthrough = [
        "PATH",
        "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
        "HOME", "USERPROFILE",
        "TMP", "TEMP", "TMPDIR",
        "LANG", "LC_ALL", "LC_CTYPE",
        "APPDATA", "LOCALAPPDATA",
    ];
    const out = {};
    for (const k of passthrough) {
        const v = process.env[k];
        if (v !== undefined)
            out[k] = v;
    }
    out.PYTHONIOENCODING = "utf-8";
    out.PYTHONUTF8 = "1";
    for (const [k, v] of Object.entries(extra))
        out[k] = v;
    return out;
}
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function mintChatSessionId(env = _filteredEnv()) {
    const proc = cp.spawnSync(PYTHON, ["-m", "ai_router.new_chat_id"], {
        encoding: "utf8",
        timeout: 30000,
        cwd: REPO_ROOT,
        env,
    });
    if (proc.status !== 0) {
        throw new Error(`new_chat_id mint failed (exit ${proc.status}): ` +
            `stdout=${proc.stdout} stderr=${proc.stderr}`);
    }
    return proc.stdout.trim();
}
function teardown(per) {
    if (per.tmpPath) {
        try {
            (0, electronLaunch_1.cleanupTmpDir)(per.tmpPath);
        }
        catch { /* opportunistic */ }
    }
}
(0, test_1.test)("new_chat_id plain mode prints a UUID v4", () => {
    const id = mintChatSessionId();
    (0, test_1.expect)(id).toMatch(UUID_V4_RE);
});
(0, test_1.test)("minted UUID flows through $CHAT_SESSION_ID env into the orchestrator block on start_session", async () => {
    const per = {};
    try {
        per.tmpPath = (0, electronLaunch_1.makeTmpDir)("dabbler-pw-newchatid-flow");
        const h = (0, electronLaunch_1.makeSet)(per.tmpPath, "036-newchatid-flow", 2);
        // Step 1: mint the UUID via the fallback CLI.
        const chatId = mintChatSessionId();
        (0, test_1.expect)(chatId).toMatch(UUID_V4_RE);
        // Step 2: spawn start_session with $CHAT_SESSION_ID set (no
        // --chat-session-id arg). This exercises the env-fallback branch
        // of _resolve_chat_session_id (Set 036 Session 1) — the path a
        // bash/PowerShell/fish operator hits after running the
        // `eval "$(... --export ...)"` workflow from the wizard toast.
        const r = (0, electronLaunch_1.attemptStartSession)(h, 1, { engine: "codex", provider: "openai", model: "gpt-5", effort: "medium" }, { env: { CHAT_SESSION_ID: chatId } });
        (0, test_1.expect)(r.exit).toBe(0);
        // Step 3: state file records the minted UUID strictly.
        const state = (0, electronLaunch_1.readStateFile)(h);
        (0, test_1.expect)(state.orchestrator?.engine).toBe("codex");
        (0, test_1.expect)(state.orchestrator?.provider).toBe("openai");
        (0, test_1.expect)(state.orchestrator?.chatSessionId).toBe(chatId);
    }
    finally {
        teardown(per);
    }
});
(0, test_1.test)("new_chat_id is idempotent against an existing non-empty $CHAT_SESSION_ID", () => {
    // A first mint generates a fresh UUID; a second invocation in the
    // same shell (env carries the first UUID forward) re-emits the same
    // value. This is the workflow protection that lets operators safely
    // re-run the CLI mid-session without re-minting and losing the
    // composite identity their orchestrator-block already records.
    const first = mintChatSessionId();
    (0, test_1.expect)(first).toMatch(UUID_V4_RE);
    const second = mintChatSessionId(_filteredEnv({ CHAT_SESSION_ID: first }));
    (0, test_1.expect)(second).toBe(first);
});
//# sourceMappingURL=new-chat-id-cli-flow.spec.js.map