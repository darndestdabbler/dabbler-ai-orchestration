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
exports.registerQueueActionCommands = registerQueueActionCommands;
exports.attachProviderForRefresh = attachProviderForRefresh;
const vscode = __importStar(require("vscode"));
const pythonRunner_1 = require("../utils/pythonRunner");
const PAYLOAD_SCHEME = "dabbler-queue-payload";
class QueuePayloadContentProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        this._store = new Map();
    }
    setContent(uri, body) {
        this._store.set(uri.toString(), body);
        this._onDidChange.fire(uri);
    }
    provideTextDocumentContent(uri) {
        return this._store.get(uri.toString()) ?? "(payload not loaded)";
    }
}
function registerQueueActionCommands(ctx, qctx) {
    const contentProvider = new QueuePayloadContentProvider();
    ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(PAYLOAD_SCHEME, contentProvider));
    ctx.subscriptions.push(vscode.commands.registerCommand("dabblerProviderQueues.openPayload", async (arg) => {
        if (!arg || arg.kind !== "message") {
            vscode.window.showWarningMessage("Open Payload: select a queue message first.");
            return;
        }
        const root = qctx.getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage("Open Payload: no workspace folder open.");
            return;
        }
        const result = await (0, pythonRunner_1.runPythonModule)({
            cwd: root,
            module: "ai_router.queue_status",
            args: [
                "--provider",
                arg.provider,
                "--get-payload",
                arg.message.id,
            ],
            pythonPathSetting: "dabblerProviderQueues.pythonPath",
            timeoutMs: 10000,
        });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
            vscode.window.showErrorMessage(`queue_status --get-payload failed: ${(result.stderr || result.stdout).trim() || "no output"}`);
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(result.stdout);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Open Payload: malformed JSON from queue_status: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        if (!parsed.ok) {
            vscode.window.showWarningMessage(`Open Payload: ${parsed.error ?? "message not found"}`);
            return;
        }
        const body = JSON.stringify(parsed.message, null, 2);
        // URI carries provider and id so VS Code can dedupe re-opens of the
        // same message into a single virtual document.
        const uri = vscode.Uri.parse(`${PAYLOAD_SCHEME}:/${encodeURIComponent(arg.provider)}/${encodeURIComponent(arg.message.id)}.json`);
        contentProvider.setContent(uri, body);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(doc, "json");
        await vscode.window.showTextDocument(doc, { preview: true });
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand("dabblerProviderQueues.markFailed", async (arg) => {
        if (!arg || arg.kind !== "message") {
            vscode.window.showWarningMessage("Mark Failed: select a queue message first.");
            return;
        }
        const choice = await vscode.window.showWarningMessage(`Force ${arg.message.id.slice(0, 8)} (${arg.message.task_type}, state=${arg.message.state}) into state=failed?`, { modal: true, detail: "Bypasses the normal ownership check. Use only when the worker is known dead." }, "Mark Failed");
        if (choice !== "Mark Failed")
            return;
        const root = qctx.getWorkspaceRoot();
        if (!root)
            return;
        const result = await (0, pythonRunner_1.runPythonModule)({
            cwd: root,
            module: "ai_router.queue_status",
            args: [
                "--provider",
                arg.provider,
                "--mark-failed",
                arg.message.id,
            ],
            pythonPathSetting: "dabblerProviderQueues.pythonPath",
        });
        await reportInterventionResult("Mark Failed", result, qctx);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand("dabblerProviderQueues.forceReclaim", async (arg) => {
        if (!arg || arg.kind !== "message") {
            vscode.window.showWarningMessage("Force Reclaim: select a queue message first.");
            return;
        }
        const choice = await vscode.window.showWarningMessage(`Release the lease on ${arg.message.id.slice(0, 8)} (${arg.message.task_type})?`, { modal: true, detail: "Returns state=claimed -> new and bumps attempts. The next claim() will pick it up." }, "Force Reclaim");
        if (choice !== "Force Reclaim")
            return;
        const root = qctx.getWorkspaceRoot();
        if (!root)
            return;
        const result = await (0, pythonRunner_1.runPythonModule)({
            cwd: root,
            module: "ai_router.queue_status",
            args: [
                "--provider",
                arg.provider,
                "--force-reclaim",
                arg.message.id,
            ],
            pythonPathSetting: "dabblerProviderQueues.pythonPath",
        });
        await reportInterventionResult("Force Reclaim", result, qctx);
    }));
}
async function reportInterventionResult(label, result, qctx) {
    if (result.timedOut) {
        vscode.window.showErrorMessage(`${label}: queue_status timed out.`);
        return;
    }
    let parsed = {};
    try {
        parsed = JSON.parse(result.stdout || "{}");
    }
    catch {
        // fall through to generic failure path
    }
    if (parsed.ok) {
        const prev = parsed.previous_state ? ` (was ${parsed.previous_state})` : "";
        vscode.window.showInformationMessage(`${label} succeeded${prev}.`);
        qctx.refreshView();
        return;
    }
    const detail = parsed.error || (result.stderr || result.stdout).trim() || "no output";
    vscode.window.showErrorMessage(`${label} failed: ${detail}`);
}
function attachProviderForRefresh(provider) {
    return () => provider.refresh();
}
//# sourceMappingURL=queueActions.js.map