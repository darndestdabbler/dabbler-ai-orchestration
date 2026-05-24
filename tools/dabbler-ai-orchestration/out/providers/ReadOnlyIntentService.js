"use strict";
// Set 036 Session 4 (Q3 — "Open in Read-Only Mode"): in-memory map of
// session-set paths the operator has flagged for read-only observation.
//
// The flag is *transient*: it lives only for the extension host's
// lifetime. Restarting the window clears it. The audit (proposal-
// addendum §Q3) and Q6 REJECTED both call for no persistent off-switch
// for takeover enforcement, so persisting this intent across sessions
// would re-introduce the same risk surface Q6 rejected.
//
// What "read-only intent" does:
//   1. Extension-dispatched commands that write orchestrator state for
//      the flagged set (currently `dabbler.checkOutOrchestrator`)
//      prompt the operator to clear the intent before proceeding.
//   2. Other (non-state-writing) extension features (the accordion
//      render, the tree-view sort, etc.) are not affected.
//
// What it does NOT do:
//   - Stop external CLI invocations of `python -m ai_router.start_session`.
//     Those run outside the extension's reach; the read-only contract
//     for the AI agent is observed by the agent itself, not the
//     extension.
//
// The single-instance assumption is acceptable because the modal
// helper that sets the flag is itself singleton-scoped (one
// CheckoutPollService per extension host).
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
exports.ReadOnlyIntentService = void 0;
exports.getReadOnlyIntentService = getReadOnlyIntentService;
exports.resetReadOnlyIntentServiceForTests = resetReadOnlyIntentServiceForTests;
const vscode = __importStar(require("vscode"));
class ReadOnlyIntentService {
    constructor() {
        this.intents = new Set();
        this.emitter = new vscode.EventEmitter();
        // Fires with the affected session-set path whenever an intent is
        // added or cleared. CustomSessionSetsView subscribes so the rendered
        // accordion can show a read-only badge alongside the orchestrator
        // gauges (display-only — wiring left to Session 6's UI sweep).
        this.onDidChange = this.emitter.event;
    }
    setReadOnly(sessionSetPath) {
        if (!sessionSetPath)
            return;
        if (this.intents.has(sessionSetPath))
            return;
        this.intents.add(sessionSetPath);
        this.emitter.fire(sessionSetPath);
    }
    clearReadOnly(sessionSetPath) {
        if (!sessionSetPath)
            return;
        if (!this.intents.delete(sessionSetPath))
            return;
        this.emitter.fire(sessionSetPath);
    }
    isReadOnly(sessionSetPath) {
        return this.intents.has(sessionSetPath);
    }
    // Test introspection only — production code should never iterate
    // the full set; check membership via isReadOnly().
    get intentCount() {
        return this.intents.size;
    }
    dispose() {
        this.intents.clear();
        this.emitter.dispose();
    }
}
exports.ReadOnlyIntentService = ReadOnlyIntentService;
// Module-level singleton so commands and the CheckoutPollService share
// the same map without threading the instance through every signature.
// Constructed lazily on first access so unit tests that don't activate
// the extension can still import the type without triggering the
// EventEmitter (which is harmless but adds noise in vscode-stub
// environments).
let _singleton = null;
function getReadOnlyIntentService() {
    if (_singleton === null)
        _singleton = new ReadOnlyIntentService();
    return _singleton;
}
// Test seam: reset the singleton between test cases so leaked intents
// from one suite don't bleed into another. Not used by production code.
function resetReadOnlyIntentServiceForTests() {
    if (_singleton !== null) {
        _singleton.dispose();
        _singleton = null;
    }
}
//# sourceMappingURL=ReadOnlyIntentService.js.map