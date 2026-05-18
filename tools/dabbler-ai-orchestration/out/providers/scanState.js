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
exports.ScanState = void 0;
const vscode = __importStar(require("vscode"));
const CONTEXT_KEY = "dabblerSessionSets.scanState";
class ScanState {
    constructor() {
        this._phase = "idle";
        this._emitter = new vscode.EventEmitter();
        /** Fires when the phase transitions. Listeners get the new phase. */
        this.onDidChange = this._emitter.event;
    }
    get phase() {
        return this._phase;
    }
    setLoading() {
        this._setPhase("loading");
    }
    setReady() {
        this._setPhase("ready");
    }
    _setPhase(next) {
        if (this._phase === next)
            return;
        this._phase = next;
        // The setContext command is a vscode command, not an API call.
        // It works under @vscode/test-electron, gets stubbed by the
        // mocha stub harness, and is irrelevant under Playwright (which
        // runs against a real Electron process). The fire-and-forget
        // shape matches the rest of the codebase's context-key writes.
        void vscode.commands.executeCommand("setContext", CONTEXT_KEY, next);
        this._emitter.fire(next);
    }
    dispose() {
        this._emitter.dispose();
    }
}
exports.ScanState = ScanState;
//# sourceMappingURL=scanState.js.map