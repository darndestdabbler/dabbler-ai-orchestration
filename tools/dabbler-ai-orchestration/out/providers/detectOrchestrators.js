"use strict";
// Smart empty-state CTA: detect which orchestrators are installed
// locally and pick the best link to surface in the "No signal" hint.
//
// Per Set 029 Session 5 step 5: "Webview detects which orchestrator
// extensions/CLIs are installed (presence of Claude Code, Gemini Code
// Assist extension, Codex CLI on PATH, GitHub Copilot extension) and
// surfaces the *right* installer/preset command in the 'No signal'
// CTA — not a generic 'install hook' link. If multiple are detected,
// show the most-recently-used per MRU."
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
exports.PROVIDER_CTAS = void 0;
exports.claudeCodeInstalled = claudeCodeInstalled;
exports.codexInstalled = codexInstalled;
exports.geminiInstalled = geminiInstalled;
exports.copilotInstalled = copilotInstalled;
exports.detectInstalledOrchestrators = detectInstalledOrchestrators;
exports.pickEmptyStateCta = pickEmptyStateCta;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const checkOutOrchestrator_1 = require("../commands/checkOutOrchestrator");
const CLAUDE_CTA = {
    commandId: "dabbler.installOrchestratorHook.claudeCode",
    label: "install Claude Code hook",
};
const CODEX_CTA = {
    // Codex auto-detect is a watcher activated at extension start; the
    // CTA points at the manual override pre-filled with Codex so an
    // operator who hasn't yet set ~/.codex/config.toml still gets a
    // signal in one click. Set 033 S3: command id renamed to
    // checkOutOrchestrator alongside the H1+H3+H4 check-out model.
    commandId: "dabbler.checkOutOrchestrator",
    label: "check out as Codex",
    args: [{ prefillProvider: "openai" }],
};
const GEMINI_CTA = {
    commandId: "dabbler.installOrchestratorHook.gemini",
    label: "check out as Gemini",
};
const COPILOT_CTA = {
    commandId: "dabbler.installOrchestratorHook.copilot",
    label: "check out as Copilot",
};
const PROVIDER_TO_CTA = {
    anthropic: CLAUDE_CTA,
    openai: CODEX_CTA,
    google: GEMINI_CTA,
    github: COPILOT_CTA,
};
// ----- Per-provider presence checks -----
// Claude Code: looks for ~/.claude/ (the directory the Claude Code CLI
// creates on first run, where settings.json and credentials live).
function claudeCodeInstalled() {
    try {
        return fs.statSync(path.join(os.homedir(), ".claude")).isDirectory();
    }
    catch {
        return false;
    }
}
// Codex CLI: ~/.codex/ exists (created on first `codex` invocation).
// We don't probe PATH because spawning `which codex` on every render
// would be wasteful; the directory check is a strong-enough proxy.
function codexInstalled() {
    try {
        return fs.statSync(path.join(os.homedir(), ".codex")).isDirectory();
    }
    catch {
        return false;
    }
}
// Gemini Code Assist: VS Code extension. Publisher.extensionId per the
// Marketplace listing.
function geminiInstalled() {
    return vscode.extensions.getExtension("Google.geminicodeassist") !== undefined;
}
// GitHub Copilot: VS Code extension. The chat surface is shipped as a
// sibling extension (GitHub.copilot-chat), so we accept either.
function copilotInstalled() {
    return (vscode.extensions.getExtension("GitHub.copilot") !== undefined ||
        vscode.extensions.getExtension("GitHub.copilot-chat") !== undefined);
}
function detectInstalledOrchestrators() {
    const installed = [];
    if (claudeCodeInstalled())
        installed.push("anthropic");
    if (codexInstalled())
        installed.push("openai");
    if (geminiInstalled())
        installed.push("google");
    if (copilotInstalled())
        installed.push("github");
    // Re-order by MRU first if any of the installed providers appear in
    // the operator's MRU tuples.
    const mru = (0, checkOutOrchestrator_1.readMru)();
    if (mru.length === 0)
        return { installed };
    const mruOrder = [];
    for (const tuple of mru) {
        if (installed.includes(tuple.provider) && !mruOrder.includes(tuple.provider)) {
            mruOrder.push(tuple.provider);
        }
    }
    // Append any installed providers the MRU didn't mention.
    for (const provider of installed) {
        if (!mruOrder.includes(provider))
            mruOrder.push(provider);
    }
    return { installed: mruOrder };
}
// Returns the CTA to surface, or null to fall back to the legacy
// hard-coded Claude Code installer link (the accordion render helper
// substitutes its own default in that case).
function pickEmptyStateCta(detection = detectInstalledOrchestrators()) {
    if (detection.installed.length === 0)
        return null;
    return PROVIDER_TO_CTA[detection.installed[0]];
}
// Exposed for tests + the Gemini/Copilot CTA labels in the accordion
// (in case S6 wants a different surfacing).
exports.PROVIDER_CTAS = Object.entries(PROVIDER_TO_CTA).map(([provider, cta]) => ({ provider, cta }));
//# sourceMappingURL=detectOrchestrators.js.map