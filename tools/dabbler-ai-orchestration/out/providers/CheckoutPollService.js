"use strict";
// Set 033 Session 5 — check-out conflict polling service.
//
// When the Claude SessionStart invoker invokes
// `python -m ai_router.start_session` and gets EXIT_CHECKOUT_CONFLICT
// (4 — H3 hard-coordination refusal because a different engine+provider
// already holds the slot), it writes a structured conflict record to
// `~/.dabbler/checkout-conflicts/<timestamp>.json`. (Set 036 Session 3
// retired the Codex config-toml watcher — formerly a second producer
// of these records — under the D1 watcher-scope discipline; the
// service still parses `source: "codex-watcher"` on read for any
// pre-Set-036 record an operator may have on disk.) This service:
//
//   1. Consumes those records via `fs.watch` on the directory (plus an
//      initial scan at activation so records written while the extension
//      was off still surface).
//   2. Shows a non-blocking `vscode.window.showInformationMessage` with
//      three actions: "Poll for release", "Force override", "Dismiss".
//   3. On "Poll for release" — watches the held set's session-state.json,
//      debounces 5s, re-reads, and auto-retries start_session for the
//      would-be holder when the slot becomes free. The retry uses the
//      H4 identity composite (engine + provider) from the conflict
//      record; a third orchestrator joining mid-poll does NOT yield —
//      we continue waiting for our slot.
//   4. On "Force override" — spawns `start_session --force`; the
//      writer's existing `_log_force_override` path appends the audit
//      line to `~/.dabbler/orchestrator-writer.log`.
//   5. Auto-aborts polling after `dabbler.checkoutPollTimeoutMinutes`
//      (default 30); on timeout, surfaces a one-time toast pointing at
//      the "Dabbler: Release Check-Out" Command Palette action.
//
// In-flight de-dup: a conflict record for an already-pending (slug,
// would-be-holder) pair short-circuits — we don't stack prompts when
// the watcher fires multiple times for the same situation.
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
exports.CheckoutPollService = exports.POLL_PROMPT_DISMISS = exports.POLL_PROMPT_FORCE = exports.POLL_PROMPT_POLL = exports.DEFAULT_TIMEOUT_MINUTES = exports.POLL_DEBOUNCE_MS = exports.WRITER_LOG_REL = exports.CONFLICT_DIR_REL = void 0;
exports.conflictDirPath = conflictDirPath;
exports.parseConflictRecord = parseConflictRecord;
exports.isChatSessionMismatch = isChatSessionMismatch;
exports.isSlotFreeForHolder = isSlotFreeForHolder;
exports.pollKey = pollKey;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const chatSessionMismatchModal_1 = require("./chatSessionMismatchModal");
const ReadOnlyIntentService_1 = require("./ReadOnlyIntentService");
exports.CONFLICT_DIR_REL = path.join(".dabbler", "checkout-conflicts");
exports.WRITER_LOG_REL = path.join(".dabbler", "orchestrator-writer.log");
exports.POLL_DEBOUNCE_MS = 5000;
exports.DEFAULT_TIMEOUT_MINUTES = 30;
function conflictDirPath() {
    return path.join(os.homedir(), exports.CONFLICT_DIR_REL);
}
// Strict-shape parser: returns null on any missing required field or
// schema-version mismatch. The four spec-named surface-contract fields
// (heldByEngine, heldByProvider, sessionSetPath, checkedOutAt) are
// covered; the rest are added so the service can actually invoke
// start_session for the would-be holder and render a useful prompt.
function parseConflictRecord(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const p = parsed;
    if (p.schemaVersion !== 1)
        return null;
    if (typeof p.sessionSetPath !== "string" || p.sessionSetPath.length === 0)
        return null;
    if (typeof p.sessionSetSlug !== "string" || p.sessionSetSlug.length === 0)
        return null;
    if (typeof p.heldByEngine !== "string" || p.heldByEngine.length === 0)
        return null;
    if (typeof p.heldByProvider !== "string" || p.heldByProvider.length === 0)
        return null;
    if (typeof p.wouldBeHolderEngine !== "string" || p.wouldBeHolderEngine.length === 0)
        return null;
    if (typeof p.wouldBeHolderProvider !== "string" || p.wouldBeHolderProvider.length === 0)
        return null;
    if (typeof p.detectedAt !== "string")
        return null;
    if (p.source !== "claude-invoker" && p.source !== "codex-watcher")
        return null;
    return {
        schemaVersion: 1,
        detectedAt: p.detectedAt,
        source: p.source,
        sessionSetPath: p.sessionSetPath,
        sessionSetSlug: p.sessionSetSlug,
        sessionNumber: typeof p.sessionNumber === "number" ? p.sessionNumber : null,
        heldByEngine: p.heldByEngine,
        heldByProvider: p.heldByProvider,
        heldByModel: typeof p.heldByModel === "string" ? p.heldByModel : null,
        heldByChatSessionId: typeof p.heldByChatSessionId === "string" ? p.heldByChatSessionId : null,
        checkedOutAt: typeof p.checkedOutAt === "string" ? p.checkedOutAt : null,
        wouldBeHolderEngine: p.wouldBeHolderEngine,
        wouldBeHolderProvider: p.wouldBeHolderProvider,
        wouldBeHolderModel: typeof p.wouldBeHolderModel === "string" ? p.wouldBeHolderModel : null,
        wouldBeHolderEffort: typeof p.wouldBeHolderEffort === "string" ? p.wouldBeHolderEffort : null,
        wouldBeHolderChatSessionId: typeof p.wouldBeHolderChatSessionId === "string" ? p.wouldBeHolderChatSessionId : null,
    };
}
// Set 036 Session 4 (Q3): a chatSessionId mismatch is a different
// flavor of H3 refusal — same engine+provider held the slot, but the
// would-be holder reports a different per-chat session_id. The
// existing poll/force/dismiss prompt assumes a different-engine
// holder may release naturally; for the chatSessionId case, that
// assumption is wrong (the same agent stays put), so the UX layer
// shows the takeover modal instead.
//
// Returns true only when BOTH sides report a chatSessionId AND they
// differ. The null/null and pre-Set-036-no-field cases collapse to
// the tolerant-on-read branch (start_session treats them as same
// holder), so the conflict that surfaced was an engine+provider
// mismatch, not a chatSessionId mismatch.
function isChatSessionMismatch(record) {
    if (record.heldByEngine !== record.wouldBeHolderEngine)
        return false;
    if (record.heldByProvider !== record.wouldBeHolderProvider)
        return false;
    const held = record.heldByChatSessionId;
    const want = record.wouldBeHolderChatSessionId;
    if (held === null || want === null)
        return false;
    return held !== want;
}
// H4 identity check: "would-be holder can claim" iff the orchestrator
// block is null OR its full H4 composite (engine + provider +
// chatSessionId) matches the would-be holder's. A third orchestrator
// joining mid-poll does NOT yield — that's a different composite
// than the would-be holder, so this returns false and the poll
// keeps waiting.
//
// Set 036 Session 4 (Round A Major fix): the predicate now includes
// chatSessionId with the same tolerant-on-read rule as
// start_session.py's H3 predicate — a prior block with chatSessionId
// missing (pre-Set-036 writer) or value null (Set 036+ writer that
// had no ID at the time of write) is treated as "matches the
// caller's chatSessionId" for engine+provider equality. Without
// this, a third chat (different chatSessionId, same engine+provider)
// claiming the slot mid-poll would be misclassified as "free for
// holder" and the poll would fire blind retries.
//
// `wouldBeChatSessionId === undefined` is the caller-side
// backward-compat path: pre-Set-036 callers (no chatSessionId
// awareness) get the engine+provider-only check exactly as before.
// Set 036+ callers pass an explicit string-or-null.
function isSlotFreeForHolder(orchestrator, wouldBeEngine, wouldBeProvider, wouldBeChatSessionId) {
    if (!orchestrator)
        return true;
    if (orchestrator.engine !== wouldBeEngine)
        return false;
    if (orchestrator.provider !== wouldBeProvider)
        return false;
    if (wouldBeChatSessionId === undefined)
        return true;
    const priorHasKey = Object.prototype.hasOwnProperty.call(orchestrator, "chatSessionId");
    const priorCid = priorHasKey ? orchestrator.chatSessionId : null;
    if (!priorHasKey || priorCid === null)
        return true;
    return priorCid === wouldBeChatSessionId;
}
// Poll-key derivation. The (slug, would-be holder identity) pair is the
// natural primary key — two would-be holders racing for the same slot
// poll independently; the same would-be holder firing multiple
// SessionStart hooks for the same set short-circuits via in-flight
// de-dup.
//
// Set 036 Session 4 (Round A Major fix): the would-be holder identity
// must include chatSessionId so two different chats on the same
// engine+provider don't collapse into a single in-flight entry —
// without the chatSessionId in the key, chat B's takeover modal
// would be dropped while chat A's prompt was still resolving. `null`
// chatSessionIds normalize to a sentinel string so pre-Set-036
// records keep producing stable keys (and two pre-Set-036 records
// from the same engine+provider continue to collapse, matching the
// Set-033 dedup behavior).
function pollKey(record) {
    const cid = record.wouldBeHolderChatSessionId ?? "<no-chat-id>";
    return (`${record.sessionSetSlug}::${record.wouldBeHolderEngine}+${record.wouldBeHolderProvider}+${cid}`);
}
exports.POLL_PROMPT_POLL = "Poll for release";
exports.POLL_PROMPT_FORCE = "Force override";
exports.POLL_PROMPT_DISMISS = "Dismiss";
class CheckoutPollService {
    constructor(opts) {
        this.opts = opts;
        this.dirWatcher = null;
        this.activePolls = new Map();
        this.inFlight = new Set();
        this.disposed = false;
    }
    // Activate the service: ensure the conflict directory exists, process
    // any records left from a previous extension lifetime, and start
    // watching for new ones. Idempotent in practice — repeat calls reset
    // the directory watcher but don't lose in-flight polls.
    start() {
        if (this.disposed)
            return;
        const dir = conflictDirPath();
        try {
            fs.mkdirSync(dir, { recursive: true });
        }
        catch {
            return;
        }
        // Drain existing files (writer crashed, extension was off, etc.)
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f.endsWith(".json")) {
                    this.processFile(path.join(dir, f));
                }
            }
        }
        catch {
            // silent — best-effort
        }
        try {
            this.dirWatcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
                if (!filename)
                    return;
                const name = filename.toString();
                if (!name.endsWith(".json"))
                    return;
                const full = path.join(dir, name);
                // Small delay to let the writer fsync — fs.watch fires on the
                // first byte on some platforms.
                setTimeout(() => this.processFile(full), 100);
            });
        }
        catch {
            // silent
        }
    }
    // Consume one sentinel file: read, parse, delete, dispatch. Deletion
    // is unconditional after the read so a malformed record doesn't pin
    // the directory full of un-handlable files.
    processFile(filePath) {
        if (this.disposed)
            return;
        let raw;
        try {
            raw = fs.readFileSync(filePath, "utf8");
        }
        catch {
            return; // race with another consumer or just removed
        }
        try {
            fs.unlinkSync(filePath);
        }
        catch {
            // already gone — fine
        }
        const record = parseConflictRecord(raw);
        if (!record)
            return;
        void this.handleConflict(record);
    }
    async handleConflict(record) {
        if (this.disposed)
            return;
        const key = pollKey(record);
        if (this.inFlight.has(key))
            return;
        this.inFlight.add(key);
        try {
            // Set 036 Session 4 (Q3): when the conflict is specifically a
            // chatSessionId mismatch (same engine+provider, different chat),
            // route to the takeover modal instead of the poll/force/dismiss
            // prompt. Polling would never resolve — the same agent isn't
            // going to release its slot.
            if (isChatSessionMismatch(record)) {
                await this.handleChatSessionMismatch(record);
                return;
            }
            const holderLabel = `${record.heldByEngine} + ${record.heldByProvider}`;
            const wouldBeLabel = `${record.wouldBeHolderEngine} + ${record.wouldBeHolderProvider}`;
            const message = `Check-out on "${record.sessionSetSlug}" is held by ${holderLabel}. ` +
                `${wouldBeLabel} cannot claim it.`;
            const show = this.opts.showInformationMessage ??
                ((m, ...items) => vscode.window.showInformationMessage(m, ...items));
            const choice = await show(message, exports.POLL_PROMPT_POLL, exports.POLL_PROMPT_FORCE, exports.POLL_PROMPT_DISMISS);
            if (choice === exports.POLL_PROMPT_POLL) {
                this.beginPolling(record);
                // beginPolling keeps the inFlight entry; it'll be cleared on
                // poll resolution (success, timeout, or dispose).
                return;
            }
            if (choice === exports.POLL_PROMPT_FORCE) {
                await this.forceOverride(record);
            }
            // Dismiss / undefined / Force — fall through to inFlight cleanup
        }
        finally {
            // Only clear when NOT polling (polling owns the key until done).
            if (!this.activePolls.has(pollKey(record))) {
                this.inFlight.delete(pollKey(record));
            }
        }
    }
    // Set 036 Session 4 (Q3 locked): chatSessionId-mismatch takeover
    // path. Three operator-visible actions per the audit-locked verdict:
    //   - Take Over → forces start_session (audit-logged) for the new
    //     chat. The existing holder's claim is overwritten.
    //   - Open in Read-Only Mode → sets a transient flag on the in-
    //     memory ReadOnlyIntentService; extension-side write commands
    //     (currently dabbler.checkOutOrchestrator) prompt to clear the
    //     intent before proceeding.
    //   - Cancel → no-op; the would-be holder remains uncliamed.
    async handleChatSessionMismatch(record) {
        const copy = {
            sessionSetSlug: record.sessionSetSlug,
            heldByLabel: (0, chatSessionMismatchModal_1.formatHolderLabel)(record.heldByEngine, record.heldByProvider, record.heldByChatSessionId),
            wouldBeLabel: (0, chatSessionMismatchModal_1.formatHolderLabel)(record.wouldBeHolderEngine, record.wouldBeHolderProvider, record.wouldBeHolderChatSessionId),
        };
        const choice = await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(copy, this.opts.showMismatchModal);
        if (choice === "take-over") {
            await this.forceOverride(record);
            return;
        }
        if (choice === "read-only") {
            const intents = this.opts.readOnlyIntentService ?? (0, ReadOnlyIntentService_1.getReadOnlyIntentService)();
            intents.setReadOnly(record.sessionSetPath);
            void vscode.window.showInformationMessage(`"${record.sessionSetSlug}" opened in read-only mode for this window. ` +
                `Extension write commands will prompt before claiming the check-out.`);
            return;
        }
        // cancel — explicit no-op
    }
    beginPolling(record) {
        if (this.disposed)
            return;
        const key = pollKey(record);
        if (this.activePolls.has(key))
            return;
        const poll = {
            record,
            watcher: null,
            debounceTimer: null,
            timeoutTimer: null,
            retryInFlight: false,
            disposed: false,
        };
        this.activePolls.set(key, poll);
        const statePath = path.join(record.sessionSetPath, "session-state.json");
        const tryRetry = async () => {
            if (poll.disposed || poll.retryInFlight)
                return;
            let raw;
            try {
                raw = await fs.promises.readFile(statePath, "utf8");
            }
            catch {
                return; // file missing / unreadable; wait for next event
            }
            let state;
            try {
                state = JSON.parse(raw);
            }
            catch {
                return;
            }
            // Set 036 Session 4 (Round A Major fix): forward the would-be
            // holder's chatSessionId so the H4 composite check fires. A
            // third chat (different chatSessionId, same engine+provider)
            // claiming the slot mid-poll must NOT misclassify as "free
            // for holder" — that would fire blind retries against a slot
            // we don't actually own.
            if (!isSlotFreeForHolder(state.orchestrator, record.wouldBeHolderEngine, record.wouldBeHolderProvider, record.wouldBeHolderChatSessionId)) {
                return; // still held by a different orchestrator; keep waiting
            }
            poll.retryInFlight = true;
            const exitCode = await this.spawnRetry(record, false);
            poll.retryInFlight = false;
            if (exitCode === 0) {
                this.resolvePollSucceeded(key);
            }
            // Non-zero: the writer refused (concurrent third-party claim
            // between our isSlotFreeForHolder check and the writer's own
            // re-read, or a boundary error). Stay polling; the next state-
            // file change will re-trigger.
        };
        // Initial check: the slot may already be free when we begin polling
        // (e.g., the holder released between conflict emission and the
        // operator clicking "Poll for release").
        void tryRetry();
        try {
            poll.watcher = fs.watch(statePath, { persistent: false }, () => {
                if (poll.disposed)
                    return;
                if (poll.debounceTimer)
                    clearTimeout(poll.debounceTimer);
                poll.debounceTimer = setTimeout(() => void tryRetry(), exports.POLL_DEBOUNCE_MS);
            });
        }
        catch {
            // file doesn't exist or platform doesn't support watching it.
            // Drop the poll — the watcher is the load-bearing signal; without
            // it, polling can't proceed.
            this.disposePoll(key);
            return;
        }
        const minutes = this.opts.timeoutMinutesResolver();
        poll.timeoutTimer = setTimeout(() => this.resolvePollTimedOut(key, minutes), minutes * 60 * 1000);
    }
    resolvePollSucceeded(key) {
        const poll = this.activePolls.get(key);
        if (!poll)
            return;
        const slug = poll.record.sessionSetSlug;
        const wouldBe = `${poll.record.wouldBeHolderEngine} + ${poll.record.wouldBeHolderProvider}`;
        this.disposePoll(key);
        void vscode.window.showInformationMessage(`Check-out on "${slug}" was claimed for ${wouldBe} after polling.`);
    }
    resolvePollTimedOut(key, minutes) {
        const poll = this.activePolls.get(key);
        if (!poll)
            return;
        const slug = poll.record.sessionSetSlug;
        this.disposePoll(key);
        void vscode.window.showInformationMessage(`Check-out poll on "${slug}" timed out after ${minutes} minutes. Use the ` +
            `"Dabbler: Release Check-Out" Command Palette action to retry manually.`);
    }
    async forceOverride(record) {
        const exitCode = await this.spawnRetry(record, true);
        const slug = record.sessionSetSlug;
        const wouldBe = `${record.wouldBeHolderEngine} + ${record.wouldBeHolderProvider}`;
        if (exitCode === 0) {
            void vscode.window.showInformationMessage(`Forced check-out on "${slug}" for ${wouldBe}. Audit entry appended to ` +
                `the orchestrator writer log (~/${exports.WRITER_LOG_REL}).`);
        }
        else {
            void vscode.window.showErrorMessage(`Failed to force check-out on "${slug}" (start_session exit ${exitCode ?? "error"}). ` +
                `Run \`python -m ai_router.start_session --force\` from the CLI to investigate.`);
        }
    }
    async spawnRetry(record, force) {
        const args = [
            "-m",
            "ai_router.start_session",
            "--session-set-dir",
            record.sessionSetPath,
            "--engine",
            record.wouldBeHolderEngine,
            "--provider",
            record.wouldBeHolderProvider,
            "--model",
            record.wouldBeHolderModel ?? "unknown",
            "--effort",
            record.wouldBeHolderEffort ?? "unknown",
        ];
        if (record.sessionNumber !== null) {
            args.push("--session-number", String(record.sessionNumber));
        }
        // Set 036 Session 4: forward the per-chat ID so a take-over write
        // populates the H4 composite for the new holder rather than
        // leaving the chatSessionId field null (which would invite a
        // benign-but-confusing tolerant-on-read fallback on the next
        // SessionStart).
        if (record.wouldBeHolderChatSessionId !== null) {
            args.push("--chat-session-id", record.wouldBeHolderChatSessionId);
        }
        if (force)
            args.push("--force");
        const cwd = path.dirname(record.sessionSetPath) || process.cwd();
        if (this.opts.spawnStartSession) {
            return await this.opts.spawnStartSession(this.opts.pythonPathResolver(cwd), args, cwd);
        }
        return await this.defaultSpawn(this.opts.pythonPathResolver(cwd), args, cwd);
    }
    defaultSpawn(python, args, cwd) {
        return new Promise((resolve) => {
            const child = cp.spawn(python, args, {
                cwd,
                stdio: ["ignore", "ignore", "ignore"],
            });
            child.on("error", () => resolve(null));
            child.on("exit", (code) => resolve(code));
        });
    }
    // Caller-visible for tests + the dispose() teardown path.
    disposePoll(key) {
        const poll = this.activePolls.get(key);
        if (!poll)
            return;
        poll.disposed = true;
        if (poll.watcher) {
            try {
                poll.watcher.close();
            }
            catch {
                // best-effort
            }
        }
        if (poll.debounceTimer)
            clearTimeout(poll.debounceTimer);
        if (poll.timeoutTimer)
            clearTimeout(poll.timeoutTimer);
        this.activePolls.delete(key);
        this.inFlight.delete(key);
    }
    // Test introspection only — caller code should never read this.
    get activePollCount() {
        return this.activePolls.size;
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        if (this.dirWatcher) {
            try {
                this.dirWatcher.close();
            }
            catch {
                // best-effort
            }
        }
        for (const key of [...this.activePolls.keys()]) {
            this.disposePoll(key);
        }
        this.inFlight.clear();
    }
}
exports.CheckoutPollService = CheckoutPollService;
//# sourceMappingURL=CheckoutPollService.js.map