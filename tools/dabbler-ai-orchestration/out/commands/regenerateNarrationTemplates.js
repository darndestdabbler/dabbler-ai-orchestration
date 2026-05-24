"use strict";
// Set 045 / Session 4: regenerate narration v1.1 templates from
// the current session-state.json.
//
// Operators paste the rendered CLAUDE.md / AGENTS.md content into
// their consumer-project workspace so the assistant emits the
// canonical [DABBLER-NARRATION v1 phase=session-start ...] marker
// at session start. The actual rendering lives in
// ``ai_router.narration`` (see
// docs/session-sets/045-log-harvest-implementation/joiner-spec.md
// §8) so the Lightweight tier can call the same CLI without the
// extension.
//
// The command picks an in-progress session set (auto-selects when
// exactly one is in-progress), shells out to ``python -m
// ai_router.narration`` once per template kind, writes the output
// to ``<set-dir>/narration-templates/``, and opens the rendered
// files for the operator.
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
exports.registerRegenerateNarrationTemplatesCommand = registerRegenerateNarrationTemplatesCommand;
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const fileSystem_1 = require("../utils/fileSystem");
const COMMAND_ID = "dabbler.regenerateNarrationTemplates";
function registerRegenerateNarrationTemplatesCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, async () => {
        await runRegenerate();
    }));
}
async function runRegenerate() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage("Open a workspace folder before running Dabbler: Regenerate Narration Templates.");
        return;
    }
    const allSets = (0, fileSystem_1.readAllSessionSets)();
    const inProgress = allSets.filter((s) => s.state === "in-progress");
    if (inProgress.length === 0) {
        vscode.window.showInformationMessage("No session set is in-progress. Start a session via `start_session` (or the orchestrator hook) before regenerating narration templates.");
        return;
    }
    const set = await pickSet(inProgress);
    if (!set)
        return;
    const pythonPath = resolvePythonPath(set.root);
    const outDir = path.join(set.dir, "narration-templates");
    fs.mkdirSync(outDir, { recursive: true });
    const claudeOut = path.join(outDir, "CLAUDE.md");
    const agentsOut = path.join(outDir, "AGENTS.md");
    // Round-A verifier nice-to-have: wrap the two python invocations in
    // a progress indicator. Python cold-start on Windows is 200-800ms
    // each and a silent UI can read as frozen.
    const render = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Regenerating narration templates for ${set.name}…`,
        cancellable: false,
    }, async (progress) => {
        progress.report({ message: "rendering CLAUDE.md…" });
        const claude = renderTemplate(pythonPath, set.root, {
            kind: "claude",
            statePath: set.statePath,
            outputPath: claudeOut,
        });
        if (!claude.ok)
            return { ok: false, message: claude.message };
        progress.report({ message: "rendering AGENTS.md…" });
        const agents = renderTemplate(pythonPath, set.root, {
            kind: "agents",
            statePath: set.statePath,
            outputPath: agentsOut,
        });
        if (!agents.ok)
            return { ok: false, message: agents.message };
        return { ok: true, message: "" };
    });
    if (!render.ok) {
        vscode.window.showErrorMessage(`Failed to render narration templates: ${render.message}`);
        return;
    }
    const relClaude = path.relative(set.root, claudeOut).replace(/\\/g, "/");
    const relAgents = path.relative(set.root, agentsOut).replace(/\\/g, "/");
    // Round-A verifier nice-to-have: offer a "Copy to consumer workspace…"
    // action so the operator does not have to manually drag the rendered
    // file into the consumer project.
    const COPY_ACTION = "Copy to consumer workspace…";
    const OPEN_ACTION = "Open Rendered CLAUDE.md";
    const choice = await vscode.window.showInformationMessage(`Narration templates regenerated for ${set.name}: ${relClaude}, ${relAgents}.`, OPEN_ACTION, COPY_ACTION);
    if (choice === COPY_ACTION) {
        await offerCopyToConsumerWorkspace(claudeOut, agentsOut);
    }
    else if (choice === OPEN_ACTION || choice === undefined) {
        try {
            const doc = await vscode.workspace.openTextDocument(claudeOut);
            await vscode.window.showTextDocument(doc, { preview: false });
        }
        catch {
            // intentional: opening the editor is a courtesy, not a failure mode
        }
    }
}
async function offerCopyToConsumerWorkspace(claudeOut, agentsOut) {
    const pick = await vscode.window.showQuickPick([
        { label: "Copy CLAUDE.md (for Claude Code consumers)", source: claudeOut, target: "CLAUDE.md" },
        { label: "Copy AGENTS.md (for Copilot CLI consumers)", source: agentsOut, target: "AGENTS.md" },
    ], { placeHolder: "Which rendered template do you want to copy?" });
    if (!pick)
        return;
    const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: `Choose consumer workspace folder for ${pick.target}`,
    });
    if (!dirUri || !dirUri.length)
        return;
    const destDir = dirUri[0].fsPath;
    const destPath = path.join(destDir, pick.target);
    if (fs.existsSync(destPath)) {
        const overwrite = await vscode.window.showWarningMessage(`${pick.target} already exists in the chosen folder. Overwrite?`, { modal: true }, "Overwrite");
        if (overwrite !== "Overwrite")
            return;
    }
    try {
        fs.copyFileSync(pick.source, destPath);
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to copy ${pick.target} to ${destDir}: ${err.message}`);
        return;
    }
    vscode.window.showInformationMessage(`Copied ${pick.target} to ${destDir}. The assistant will emit the session-start marker on its next launch in that workspace.`);
}
async function pickSet(inProgress) {
    if (inProgress.length === 1)
        return inProgress[0];
    const choices = inProgress.map((s) => ({
        label: s.name,
        description: `session ${s.liveSession?.currentSession ?? "?"} of ${s.totalSessions ?? "?"}`,
        detail: path.relative(s.root, s.dir).replace(/\\/g, "/"),
        set: s,
    }));
    const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: "Select the session set to regenerate narration templates for",
    });
    return picked?.set;
}
function renderTemplate(pythonPath, workspaceRoot, args) {
    const cliArgs = [
        "-m",
        "ai_router.narration",
        "--kind",
        args.kind,
        "--state-file",
        args.statePath,
        "--output",
        args.outputPath,
    ];
    let result;
    try {
        result = cp.spawnSync(pythonPath, cliArgs, {
            cwd: workspaceRoot,
            encoding: "utf8",
        });
    }
    catch (err) {
        return {
            ok: false,
            message: `spawn ${pythonPath} failed: ${err.message}`,
        };
    }
    if (result.error) {
        return {
            ok: false,
            message: `spawn ${pythonPath} failed: ${result.error.message}`,
        };
    }
    if (result.status !== 0) {
        const stderr = (result.stderr ?? "").trim() || "(no stderr output)";
        return {
            ok: false,
            message: `python -m ai_router.narration exited ${result.status}: ${stderr}`,
        };
    }
    if (!fs.existsSync(args.outputPath)) {
        return {
            ok: false,
            message: `python -m ai_router.narration exited 0 but did not write ${args.outputPath}`,
        };
    }
    return { ok: true, message: args.outputPath };
}
function resolvePythonPath(workspaceRoot) {
    // Mirrors the pythonPath resolver used by installAiRouterCommands +
    // checkOutOrchestrator (same per-workspace setting, same fallback).
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const inspected = cfg.inspect("pythonPath");
    const explicit = inspected?.workspaceFolderValue ??
        inspected?.workspaceValue ??
        inspected?.globalValue;
    const raw = (explicit ?? "python").trim();
    if (!raw)
        return "python";
    if (path.isAbsolute(raw))
        return raw;
    if (raw.includes(path.sep) || raw.includes("/")) {
        return path.resolve(workspaceRoot, raw);
    }
    return raw;
}
//# sourceMappingURL=regenerateNarrationTemplates.js.map