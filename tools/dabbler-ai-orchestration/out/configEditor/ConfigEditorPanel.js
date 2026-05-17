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
exports.ConfigEditorPanel = void 0;
exports.registerConfigEditorCommand = registerConfigEditorCommand;
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yamlReadWrite_1 = require("./yamlReadWrite");
const schemaValidator_1 = require("./schemaValidator");
const routingAndVerificationSection_1 = require("./sections/routingAndVerificationSection");
const budgetSection_1 = require("./sections/budgetSection");
const providersTableSection_1 = require("./sections/providersTableSection");
const significanceFlaggingSection_1 = require("./sections/significanceFlaggingSection");
const notificationsSection_1 = require("./sections/notificationsSection");
const localOverridesSummarySection_1 = require("./sections/localOverridesSummarySection");
const patch_1 = require("./patch");
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}
class ConfigEditorPanel {
    static createOrShow(context) {
        if (ConfigEditorPanel.currentPanel) {
            ConfigEditorPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            ConfigEditorPanel.currentPanel._refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel("dabblerConfigEditor", "Dabbler Config Editor", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
        });
        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, context.extensionUri);
    }
    constructor(panel, extensionUri) {
        this._loaded = null;
        this._validation = null;
        this._parseIssues = [];
        this._lastSaveSnapshot = null;
        this._recovery = null;
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._loadFiles();
        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => {
            ConfigEditorPanel.currentPanel = undefined;
        });
        this._panel.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case "save":
                    this._handleSave(msg.payload);
                    break;
                case "refresh":
                    this._refresh();
                    break;
                case "runFlagCommand":
                    this._runFlagDecisionCommand();
                    break;
                case "openLocalOverrides":
                    this._openLocalOverridesFile();
                    break;
                case "retryFailedWrite":
                    this._retryFailedWrite();
                    break;
                case "acceptHalfBatch":
                    this._acceptHalfBatchAsBaseline();
                    break;
                case "reapplyLastSave":
                    this._reapplyLastSave();
                    break;
                case "sendTestNotification":
                    this._handleTestNotification();
                    break;
            }
        });
    }
    _findAiRouterDir() {
        const roots = vscode.workspace.workspaceFolders;
        if (!roots?.length)
            return null;
        for (const folder of roots) {
            const candidate = path.join(folder.uri.fsPath, "ai_router");
            if (fs.existsSync(candidate))
                return candidate;
        }
        return null;
    }
    _loadFiles() {
        const aiRouterDir = this._findAiRouterDir();
        if (!aiRouterDir) {
            this._loaded = null;
            this._validation = null;
            return;
        }
        const routerConfigPath = path.join(aiRouterDir, "router-config.yaml");
        const budgetPath = path.join(aiRouterDir, "budget.yaml");
        const localOverridesPath = path.join(aiRouterDir, "local-overrides.yaml");
        const routerResult = (0, yamlReadWrite_1.readYamlFile)(routerConfigPath);
        const budgetResult = (0, yamlReadWrite_1.readYamlFile)(budgetPath);
        const localResult = (0, yamlReadWrite_1.readYamlFile)(localOverridesPath);
        this._loaded = {
            routerConfigPath,
            budgetPath,
            localOverridesPath,
            localOverridesFileExists: localResult !== null,
            routerConfigDoc: routerResult?.doc ?? null,
            budgetDoc: budgetResult?.doc ?? null,
            localOverridesDoc: localResult?.doc ?? null,
            routerConfigText: routerResult?.text ?? null,
            budgetText: budgetResult?.text ?? null,
            localOverridesText: localResult?.text ?? null,
        };
        this._parseIssues = [];
        if (routerResult) {
            for (const err of routerResult.parseErrors) {
                this._parseIssues.push({ file: "router-config.yaml", err });
            }
        }
        if (budgetResult) {
            for (const err of budgetResult.parseErrors) {
                this._parseIssues.push({ file: "budget.yaml", err });
            }
        }
        if (localResult) {
            for (const err of localResult.parseErrors) {
                this._parseIssues.push({ file: "local-overrides.yaml", err });
            }
        }
        // Schema validation only on cleanly-parsed files.
        const routerHasParse = this._parseIssues.some((p) => p.file === "router-config.yaml");
        const budgetHasParse = this._parseIssues.some((p) => p.file === "budget.yaml");
        const localHasParse = this._parseIssues.some((p) => p.file === "local-overrides.yaml");
        const routerConfigObj = !routerHasParse
            ? (routerResult?.doc.toJSON() ?? null)
            : null;
        const budgetObj = !budgetHasParse
            ? (budgetResult?.doc.toJSON() ?? null)
            : null;
        const localObj = !localHasParse
            ? (localResult?.doc.toJSON() ?? null)
            : null;
        this._validation = (0, schemaValidator_1.validateBatch)({
            routerConfig: routerConfigObj,
            budget: budgetObj,
            localOverrides: localObj,
        });
        // Half-batch / external-drift detection. Preserve any active
        // failed-write recovery — _handleSave sets that state right before
        // calling _refresh, and overwriting it here would lose the
        // actionable Retry/Accept buttons.
        if (!this._recovery || this._recovery.failed.length === 0) {
            this._recovery = this._detectDrift();
        }
    }
    _detectDrift() {
        if (!this._lastSaveSnapshot || !this._loaded)
            return null;
        const drifted = [];
        // Strict !== null checks (not truthiness) so a truncation-to-empty
        // on disk registers as drift rather than disappearing.
        const currentRouter = this._loaded.routerConfigText;
        const currentBudget = this._loaded.budgetText;
        const currentLocal = this._loaded.localOverridesText;
        if (currentRouter !== null && currentRouter !== this._lastSaveSnapshot.routerConfigText) {
            drifted.push("router-config.yaml");
        }
        else if (currentRouter === null && this._lastSaveSnapshot.routerConfigText !== "") {
            // file disappeared since last save
            drifted.push("router-config.yaml");
        }
        if (currentBudget !== null && currentBudget !== this._lastSaveSnapshot.budgetText) {
            drifted.push("budget.yaml");
        }
        else if (currentBudget === null && this._lastSaveSnapshot.budgetText !== "") {
            drifted.push("budget.yaml");
        }
        if (currentLocal !== this._lastSaveSnapshot.localOverridesText) {
            drifted.push("local-overrides.yaml");
        }
        if (drifted.length === 0)
            return null;
        return { succeeded: [], failed: [], drifted, pendingContents: {} };
    }
    _deriveState() {
        if (!this._loaded) {
            return {
                routerConfig: null,
                budget: null,
                localOverrides: null,
                envVarPresence: {},
                localOverridesFileExists: false,
            };
        }
        const routerObj = this._loaded.routerConfigDoc?.toJSON() ?? null;
        const budgetObj = this._loaded.budgetDoc?.toJSON() ?? null;
        const localObj = this._loaded.localOverridesDoc?.toJSON() ?? null;
        // Collect every env var name referenced in providers + notifications
        const envVars = new Set();
        const sharedProviders = (routerObj && typeof routerObj === "object" ? routerObj["providers"] : null);
        if (sharedProviders) {
            for (const v of Object.values(sharedProviders)) {
                const ent = v;
                if (typeof ent?.api_key_env === "string")
                    envVars.add(ent.api_key_env);
            }
        }
        const localProviders = (localObj && typeof localObj === "object" ? localObj["providers"] : null);
        if (localProviders) {
            for (const v of Object.values(localProviders)) {
                const ent = v;
                if (typeof ent?.api_key_env === "string")
                    envVars.add(ent.api_key_env);
            }
        }
        const pushover = localObj && typeof localObj === "object"
            ? localObj["notifications"]?.["pushover"]
            : undefined;
        if (pushover) {
            if (typeof pushover.api_key_env === "string")
                envVars.add(pushover.api_key_env);
            if (typeof pushover.user_key_env === "string")
                envVars.add(pushover.user_key_env);
        }
        const envVarPresence = {};
        for (const name of envVars) {
            const v = process.env[name];
            envVarPresence[name] = typeof v === "string" && v.length > 0;
        }
        return {
            routerConfig: routerObj,
            budget: budgetObj,
            localOverrides: localObj,
            envVarPresence,
            localOverridesFileExists: this._loaded.localOverridesFileExists,
        };
    }
    _handleSave(payload) {
        if (!this._loaded) {
            vscode.window.showErrorMessage("No config files loaded.");
            return;
        }
        if (this._parseIssues.length > 0) {
            vscode.window.showErrorMessage(`Save aborted — ${this._parseIssues.length} YAML parse error(s). Fix the parse errors in the source files before saving.`);
            return;
        }
        if (!payload) {
            vscode.window.showErrorMessage("Save aborted — no payload from webview.");
            return;
        }
        // 1) Required-files gate.
        if (!this._loaded.routerConfigDoc || !this._loaded.budgetDoc) {
            vscode.window.showErrorMessage("Save aborted — required config files are missing.");
            return;
        }
        // 2) Clone the loaded docs before patching. If applyPatch throws OR
        //    validation rejects the result, the clones are discarded and
        //    `_loaded.*Doc` remains in the exact state the operator can see.
        //    The yaml library has no Document.clone(), so we parse-then-stringify.
        const routerClone = (0, yamlReadWrite_1.parseDocumentFromText)(this._loaded.routerConfigDoc.toString());
        const budgetClone = (0, yamlReadWrite_1.parseDocumentFromText)(this._loaded.budgetDoc.toString());
        const localClone = this._loaded.localOverridesDoc
            ? (0, yamlReadWrite_1.parseDocumentFromText)(this._loaded.localOverridesDoc.toString())
            : (0, patch_1.emptyLocalOverridesDoc)();
        let applyResult;
        try {
            applyResult = (0, patch_1.applyPatch)(routerClone, budgetClone, localClone, payload);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Save aborted — patch application failed: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        // 3) Pre-validate the patched clones.
        const routerObj = routerClone.toJSON() ?? null;
        const budgetObj = budgetClone.toJSON() ?? null;
        const localObj = localClone.toJSON() ?? null;
        const validation = (0, schemaValidator_1.validateBatch)({ routerConfig: routerObj, budget: budgetObj, localOverrides: localObj });
        if (!validation.valid) {
            const msgs = validation.errors.map((e) => `${e.file}${e.path}: ${e.message}`).join("\n");
            vscode.window.showErrorMessage(`Save aborted — ${validation.errors.length} validation error(s):\n${msgs}`, { modal: false });
            return;
        }
        // 4) Commit the validated clones into _loaded so they're visible to
        //    subsequent renders and (importantly) to _captureSnapshot.
        this._loaded.routerConfigDoc = routerClone;
        this._loaded.budgetDoc = budgetClone;
        this._loaded.localOverridesDoc = localClone;
        // 5) Pre-compute the exact bytes we intend to write per file. Caching
        //    these into _recovery.pendingContents lets _retryFailedWrite
        //    persist the same bytes it originally tried, instead of writing
        //    whatever _loaded looks like after `_refresh()` reloads from disk.
        const localJson = localClone.toJSON();
        const localHasContent = localJson && Object.keys(localJson).length > 0;
        const shouldWriteLocal = applyResult.localOverridesChanged && (localHasContent || this._loaded.localOverridesFileExists);
        const pending = {};
        if (applyResult.routerConfigChanged)
            pending["router-config.yaml"] = routerClone.toString();
        if (applyResult.budgetChanged)
            pending["budget.yaml"] = budgetClone.toString();
        if (shouldWriteLocal)
            pending["local-overrides.yaml"] = localClone.toString();
        // 6) Write each file. Track per-file success/failure.
        const succeeded = [];
        const failed = [];
        const writeAtomic = (file, target, content) => {
            const tmp = target + ".tmp";
            try {
                fs.writeFileSync(tmp, content, "utf8");
                fs.renameSync(tmp, target);
                succeeded.push(file);
            }
            catch (err) {
                try {
                    if (fs.existsSync(tmp))
                        fs.unlinkSync(tmp);
                }
                catch { /* swallow cleanup error */ }
                failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
            }
        };
        if (pending["router-config.yaml"] !== undefined) {
            writeAtomic("router-config.yaml", this._loaded.routerConfigPath, pending["router-config.yaml"]);
        }
        if (pending["budget.yaml"] !== undefined) {
            writeAtomic("budget.yaml", this._loaded.budgetPath, pending["budget.yaml"]);
        }
        if (pending["local-overrides.yaml"] !== undefined) {
            writeAtomic("local-overrides.yaml", this._loaded.localOverridesPath, pending["local-overrides.yaml"]);
        }
        if (failed.length > 0 && succeeded.length > 0) {
            // Half-batch failure. Cache the bytes for each failed file so
            // retry persists exactly what we just tried to write.
            const pendingContents = {};
            for (const f of failed) {
                const content = pending[f.file];
                if (content !== undefined)
                    pendingContents[f.file] = content;
            }
            this._recovery = { succeeded, failed, drifted: [], pendingContents };
            this._refresh();
            vscode.window.showErrorMessage(`Partial save — ${succeeded.length} file(s) saved, ${failed.length} failed. See the recovery banner in the editor.`);
            return;
        }
        if (failed.length > 0) {
            this._refresh();
            vscode.window.showErrorMessage(`Save failed: ${failed.map((f) => `${f.file}: ${f.reason}`).join("; ")}`);
            return;
        }
        // 7) Update last-save snapshot for drift detection.
        this._lastSaveSnapshot = this._captureSnapshot(applyResult.routerConfigChanged, applyResult.budgetChanged, shouldWriteLocal);
        if (applyResult.warnings.length > 0) {
            vscode.window.showWarningMessage(applyResult.warnings.join(" "));
        }
        if (applyResult.routerConfigChanged || applyResult.budgetChanged || applyResult.localOverridesChanged) {
            vscode.window.showInformationMessage("Dabbler config saved.");
        }
        else {
            vscode.window.showInformationMessage("No changes to save.");
        }
        this._refresh();
    }
    /**
     * Snapshot the exact file contents the panel just persisted. For files
     * NOT touched this save, we use the raw text already on disk (loaded
     * earlier). For files written, we use doc.toString() which matches
     * what writeYamlFile serialized. If local-overrides was not written
     * AND the file exists on disk, we still snapshot it so drift detection
     * uses the loaded text as the baseline rather than null.
     */
    _captureSnapshot(routerWritten, budgetWritten, localWritten) {
        const routerText = routerWritten && this._loaded?.routerConfigDoc
            ? this._loaded.routerConfigDoc.toString()
            : (this._loaded?.routerConfigText ?? "");
        const budgetText = budgetWritten && this._loaded?.budgetDoc
            ? this._loaded.budgetDoc.toString()
            : (this._loaded?.budgetText ?? "");
        let localText;
        if (localWritten && this._loaded?.localOverridesDoc) {
            localText = this._loaded.localOverridesDoc.toString();
        }
        else if (this._loaded?.localOverridesFileExists) {
            // Existed but not written this save — baseline against the on-disk text.
            localText = this._loaded.localOverridesText;
        }
        else {
            localText = null;
        }
        return {
            routerConfigText: routerText,
            budgetText: budgetText,
            localOverridesText: localText,
            at: Date.now(),
        };
    }
    _retryFailedWrite() {
        if (!this._recovery || this._recovery.failed.length === 0 || !this._loaded)
            return;
        const stillFailed = [];
        const newSucceeded = [...this._recovery.succeeded];
        const remainingPending = {};
        for (const f of this._recovery.failed) {
            const cachedContent = this._recovery.pendingContents?.[f.file];
            if (cachedContent === undefined) {
                stillFailed.push({ file: f.file, reason: "internal: no cached content to retry" });
                continue;
            }
            let target = null;
            if (f.file === "router-config.yaml")
                target = this._loaded.routerConfigPath;
            else if (f.file === "budget.yaml")
                target = this._loaded.budgetPath;
            else if (f.file === "local-overrides.yaml")
                target = this._loaded.localOverridesPath;
            if (!target) {
                stillFailed.push({ file: f.file, reason: "internal: no target path" });
                continue;
            }
            const tmp = target + ".tmp";
            try {
                fs.writeFileSync(tmp, cachedContent, "utf8");
                fs.renameSync(tmp, target);
                newSucceeded.push(f.file);
            }
            catch (err) {
                try {
                    if (fs.existsSync(tmp))
                        fs.unlinkSync(tmp);
                }
                catch { /* swallow */ }
                stillFailed.push({ file: f.file, reason: err instanceof Error ? err.message : String(err) });
                remainingPending[f.file] = cachedContent;
            }
        }
        if (stillFailed.length === 0) {
            // After full retry success, recompute the baseline so subsequent
            // loads compare against what's now on disk. _captureSnapshot
            // reads from the in-memory docs (which `_refresh()` will refill
            // from disk at the next loadFiles call, but we capture BEFORE
            // refresh so we use the values that match what we just wrote).
            this._lastSaveSnapshot = this._captureSnapshot(newSucceeded.includes("router-config.yaml"), newSucceeded.includes("budget.yaml"), newSucceeded.includes("local-overrides.yaml"));
            // Override snapshot with the exact cached bytes for fidelity.
            if (this._lastSaveSnapshot && this._recovery.pendingContents) {
                const pc = this._recovery.pendingContents;
                if (pc["router-config.yaml"] !== undefined) {
                    this._lastSaveSnapshot.routerConfigText = pc["router-config.yaml"];
                }
                if (pc["budget.yaml"] !== undefined) {
                    this._lastSaveSnapshot.budgetText = pc["budget.yaml"];
                }
                if (pc["local-overrides.yaml"] !== undefined) {
                    this._lastSaveSnapshot.localOverridesText = pc["local-overrides.yaml"];
                }
            }
            this._recovery = null;
            vscode.window.showInformationMessage("Retry succeeded — all files saved.");
        }
        else {
            this._recovery = {
                succeeded: newSucceeded,
                failed: stillFailed,
                drifted: [],
                pendingContents: remainingPending,
            };
            vscode.window.showErrorMessage(`Retry partial — ${stillFailed.length} file(s) still failing.`);
        }
        this._refresh();
    }
    _acceptHalfBatchAsBaseline() {
        // Operator chose to accept the current on-disk state as the new baseline.
        // Clear recovery state and re-snapshot to current raw on-disk contents.
        this._recovery = null;
        if (this._loaded) {
            this._lastSaveSnapshot = {
                routerConfigText: this._loaded.routerConfigText ?? "",
                budgetText: this._loaded.budgetText ?? "",
                localOverridesText: this._loaded.localOverridesText,
                at: Date.now(),
            };
        }
        this._refresh();
        vscode.window.showInformationMessage("On-disk state accepted as new baseline.");
    }
    _reapplyLastSave() {
        // Genuine re-apply: write the bytes from _lastSaveSnapshot back to
        // disk. Use the same per-file half-batch recovery pattern as the
        // main save flow so a mid-reapply filesystem failure doesn't leave
        // disk in an undetected partial state.
        if (!this._lastSaveSnapshot || !this._loaded) {
            vscode.window.showErrorMessage("Re-apply unavailable — no last-saved snapshot exists in this session.");
            return;
        }
        const succeeded = [];
        const failed = [];
        const pendingContents = {};
        const reapply = (file, target, content) => {
            pendingContents[file] = content;
            const tmp = target + ".tmp";
            try {
                fs.writeFileSync(tmp, content, "utf8");
                fs.renameSync(tmp, target);
                succeeded.push(file);
            }
            catch (err) {
                try {
                    if (fs.existsSync(tmp))
                        fs.unlinkSync(tmp);
                }
                catch { /* swallow */ }
                failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
            }
        };
        reapply("router-config.yaml", this._loaded.routerConfigPath, this._lastSaveSnapshot.routerConfigText);
        reapply("budget.yaml", this._loaded.budgetPath, this._lastSaveSnapshot.budgetText);
        if (this._lastSaveSnapshot.localOverridesText !== null) {
            reapply("local-overrides.yaml", this._loaded.localOverridesPath, this._lastSaveSnapshot.localOverridesText);
        }
        else if (fs.existsSync(this._loaded.localOverridesPath)) {
            // Snapshot said the file didn't exist; remove on-disk copy.
            try {
                fs.unlinkSync(this._loaded.localOverridesPath);
                succeeded.push("local-overrides.yaml");
            }
            catch (err) {
                failed.push({
                    file: "local-overrides.yaml",
                    reason: err instanceof Error ? err.message : String(err),
                });
            }
        }
        if (failed.length > 0 && succeeded.length > 0) {
            // Reapply itself half-batched. Surface the same recovery banner.
            const failedPending = {};
            for (const f of failed) {
                if (pendingContents[f.file] !== undefined)
                    failedPending[f.file] = pendingContents[f.file];
            }
            this._recovery = { succeeded, failed, drifted: [], pendingContents: failedPending };
            this._refresh();
            vscode.window.showErrorMessage(`Re-apply partial — ${succeeded.length} file(s) restored, ${failed.length} failed. See the recovery banner.`);
            return;
        }
        if (failed.length > 0) {
            this._refresh();
            vscode.window.showErrorMessage(`Re-apply failed: ${failed.map((f) => `${f.file}: ${f.reason}`).join("; ")}`);
            return;
        }
        this._recovery = null;
        this._lastSaveSnapshot = { ...this._lastSaveSnapshot, at: Date.now() };
        vscode.window.showInformationMessage("Last-saved state re-applied to disk.");
        this._refresh();
    }
    async _runFlagDecisionCommand() {
        // Set 026 Session 6 shipped both significance-flagging commands as
        // proper registrations. The Session 5 graceful-fallback branch is
        // gone — if the command is missing here it's a real bug, not an
        // expected pre-Session-6 state, so let vscode surface the failure.
        await vscode.commands.executeCommand("dabbler.flagDecisionForReview");
    }
    _handleTestNotification() {
        const aiRouterDir = this._findAiRouterDir();
        if (!aiRouterDir) {
            vscode.window.showErrorMessage("No ai_router/ directory found in the workspace.");
            return;
        }
        // Resolve the configured env var names for the Pushover keys.
        const localObj = this._loaded?.localOverridesDoc?.toJSON() ?? null;
        const pushover = localObj
            ? localObj["notifications"]?.["pushover"]
            : undefined;
        const apiKeyEnv = (typeof pushover?.["api_key_env"] === "string" ? pushover["api_key_env"] : "PUSHOVER_API_KEY") || "PUSHOVER_API_KEY";
        const userKeyEnv = (typeof pushover?.["user_key_env"] === "string" ? pushover["user_key_env"] : "PUSHOVER_USER_KEY") || "PUSHOVER_USER_KEY";
        // Resolve env var values. notifications.py reads PUSHOVER_API_KEY /
        // PUSHOVER_USER_KEY by name; if the operator has renamed them, read
        // the value from the configured name and pass it under the canonical
        // name so the Python helper doesn't need to know about renames.
        const apiKeyValue = process.env[apiKeyEnv];
        const userKeyValue = process.env[userKeyEnv];
        if (!apiKeyValue) {
            vscode.window.showErrorMessage(`Pushover API key env var $${apiKeyEnv} is not set. Export it in your shell before running VS Code.`);
            return;
        }
        if (!userKeyValue) {
            vscode.window.showErrorMessage(`Pushover user key env var $${userKeyEnv} is not set. Export it in your shell before running VS Code.`);
            return;
        }
        const pythonPath = ((vscode.workspace.getConfiguration("dabblerSessionSets").inspect("pythonPath")?.workspaceFolderValue ??
            vscode.workspace.getConfiguration("dabblerSessionSets").inspect("pythonPath")?.workspaceValue ??
            vscode.workspace.getConfiguration("dabblerSessionSets").inspect("pythonPath")?.globalValue) ||
            "python").trim() || "python";
        const script = [
            "import json, sys",
            "try:",
            "  from ai_router.notifications import send_pushover_notification",
            "  r = send_pushover_notification('Dabbler test', 'Test notification from Dabbler Config Editor')",
            "  print(json.dumps({'ok': True, 'request_id': r.request_id}))",
            "except Exception as e:",
            "  print(json.dumps({'ok': False, 'error': str(e)}))",
        ].join("\n");
        const env = { ...process.env, PUSHOVER_API_KEY: apiKeyValue, PUSHOVER_USER_KEY: userKeyValue };
        const child = cp.spawn(pythonPath, ["-c", script], {
            cwd: path.dirname(aiRouterDir),
            env,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let spawnErrored = false;
        child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
        child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
        child.on("error", (err) => {
            spawnErrored = true;
            vscode.window.showErrorMessage(`Test notification failed — could not spawn Python: ${err.message}`);
        });
        child.on("close", () => {
            if (spawnErrored)
                return;
            try {
                const result = JSON.parse(stdout.trim());
                if (result.ok) {
                    vscode.window.showInformationMessage(`Pushover test notification sent. Request ID: ${result.request_id ?? "(unknown)"}`);
                }
                else {
                    vscode.window.showErrorMessage(`Test notification failed: ${result.error ?? "unknown error"}`);
                }
            }
            catch {
                const detail = stderr.trim() || stdout.trim() || "no output";
                vscode.window.showErrorMessage(`Test notification failed — unexpected Python output: ${detail}`);
            }
        });
    }
    async _openLocalOverridesFile() {
        if (!this._loaded)
            return;
        const target = this._loaded.localOverridesPath;
        if (!fs.existsSync(target)) {
            vscode.window.showInformationMessage("local-overrides.yaml does not exist yet. Save any per-operator override and the file is created automatically.");
            return;
        }
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc);
    }
    _refresh() {
        this._loadFiles();
        this._panel.webview.html = this._getHtml();
    }
    _getHtml() {
        const nonce = getNonce();
        const cspSource = this._panel.webview.cspSource;
        if (!this._loaded) {
            return this._noWorkspaceHtml(nonce, cspSource);
        }
        const hasRouterConfig = this._loaded.routerConfigDoc !== null;
        const hasBudget = this._loaded.budgetDoc !== null;
        if (!hasRouterConfig) {
            return this._missingFilesHtml(nonce, cspSource, this._loaded.routerConfigPath);
        }
        if (!hasBudget) {
            return this._missingFilesHtml(nonce, cspSource, this._loaded.budgetPath);
        }
        const validationPassed = this._validation?.valid ?? false;
        const errors = this._validation?.errors ?? [];
        const parseIssues = this._parseIssues;
        const hasParseIssues = parseIssues.length > 0;
        const savedStatus = this._lastSaveSnapshot
            ? `All changes saved (${new Date(this._lastSaveSnapshot.at).toLocaleTimeString()}).`
            : "No unsaved changes.";
        const fileList = [
            "ai_router/router-config.yaml",
            hasBudget ? "ai_router/budget.yaml" : null,
            this._loaded.localOverridesFileExists ? "ai_router/local-overrides.yaml" : null,
        ]
            .filter(Boolean)
            .join(" + ");
        const parseBanner = hasParseIssues
            ? `<div class="banner banner-error">
          <strong>&#9888; YAML parse error</strong> — ${parseIssues.length} parse issue(s). Save is blocked until resolved.
          <ul>${parseIssues
                .map((p) => `<li><code>${p.file}</code>${p.err.line != null ? ` (line ${p.err.line})` : ""}: ${escapeHtml(p.err.message)}</li>`)
                .join("")}</ul>
        </div>`
            : "";
        const driftBanner = !validationPassed && !hasParseIssues
            ? `<div class="banner banner-error">
          <strong>&#9888; Drift detected</strong> — ${errors.length} validation error(s). Sections remain editable but Save will reject until fixed.
          <ul>${errors.map((e) => `<li><code>${escapeHtml(e.file + e.path)}</code>: ${escapeHtml(e.message)}</li>`).join("")}</ul>
        </div>`
            : "";
        const recoveryBanner = this._recovery ? this._renderRecoveryBanner(this._recovery) : "";
        const state = this._deriveState();
        const s1 = (0, routingAndVerificationSection_1.render)(state);
        const s2 = (0, budgetSection_1.render)(state);
        const s3 = (0, providersTableSection_1.render)(state);
        const s4 = (0, significanceFlaggingSection_1.render)(state);
        const s5 = (0, notificationsSection_1.render)(state);
        const s6 = (0, localOverridesSummarySection_1.render)(state);
        const sections = [
            { num: 1, label: "Routing &amp; Verification", body: s1.html },
            { num: 2, label: "Budget", body: s2.html },
            { num: 3, label: "Providers", body: s3.html },
            { num: 4, label: "Significance flagging", body: s4.html },
            { num: 5, label: "Notifications", body: s5.html },
            { num: 6, label: "Local overrides summary", body: s6.html },
        ];
        const sectionNav = sections
            .map((s) => `<button class="section-btn" data-section="${s.num}">&rsaquo; ${s.label}</button>`)
            .join("\n");
        const sectionContent = sections
            .map((s) => `<div class="section-panel" id="section-${s.num}" style="display:${s.num === 1 ? "block" : "none"}">
          <h2>${s.label}</h2>
          ${s.body}
        </div>`)
            .join("\n");
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dabbler Config Editor</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 0; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-panel-border); }
    .header h1 { font-size: 1em; margin: 0; }
    .header-actions { display: flex; gap: 8px; }
    .meta { padding: 6px 16px; font-size: 0.85em; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
    .banner { padding: 8px 16px; margin: 8px 16px; border-radius: 3px; font-size: 0.85em; }
    .banner ul { margin: 4px 0 0 16px; padding: 0; }
    .banner-error { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
    .banner-warning { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
    .layout { display: flex; min-height: calc(100vh - 80px); }
    .nav { width: 220px; min-width: 180px; border-right: 1px solid var(--vscode-panel-border); padding: 8px 0; display: flex; flex-direction: column; }
    .section-btn { background: none; border: none; color: var(--vscode-foreground); padding: 6px 16px; text-align: left; cursor: pointer; font-size: 0.9em; width: 100%; }
    .section-btn:hover, .section-btn.active { background: var(--vscode-list-hoverBackground); }
    .section-btn.active { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
    .content { flex: 1; padding: 16px; overflow-y: auto; }
    .section-panel h2 { font-size: 1.1em; margin-top: 0; margin-bottom: 16px; }
    .section-block { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--vscode-panel-border); }
    .section-block h3 { font-size: 1em; margin-bottom: 6px; }
    .section-help { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 0 0 10px 0; }
    .section-info { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 6px 0; font-style: italic; }
    .field-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
    .field-row label { min-width: 140px; }
    .field-row input[type="number"], .field-row input[type="text"], .field-row select { padding: 2px 6px; }
    .src-indicator { font-size: 0.78em; padding: 1px 4px; border-radius: 2px; cursor: pointer; }
    .src-shared { color: var(--vscode-descriptionForeground); background: rgba(127,127,127,0.1); }
    .src-local { color: var(--vscode-charts-orange); background: rgba(255,150,0,0.1); }
    .src-default { color: var(--vscode-descriptionForeground); background: rgba(127,127,127,0.05); cursor: default; }
    .env-badge { font-size: 0.85em; padding: 1px 4px; border-radius: 2px; }
    .env-set { color: var(--vscode-charts-green); }
    .env-unset { color: var(--vscode-descriptionForeground); font-style: italic; }
    .placeholder { color: var(--vscode-descriptionForeground); font-style: italic; }
    .preview-block { background: rgba(127,127,127,0.06); padding: 8px 12px; border-radius: 3px; }
    .preview-block p { margin: 6px 0; }
    .preview-detail { color: var(--vscode-descriptionForeground); }
    .slider-value { min-width: 40px; font-variant-numeric: tabular-nums; }
    .provider-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .provider-table th, .provider-table td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
    .provider-table th { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    .provider-row input[type="text"] { width: 100%; }
    .legend { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
    .command-box { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1)); padding: 6px 10px; border-radius: 3px; margin: 4px 0; }
    .code-sample { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1)); padding: 8px 10px; border-radius: 3px; margin: 6px 0; }
    .numbered-list { padding-left: 18px; }
    .numbered-list li { margin-bottom: 12px; }
    .override-list { list-style: none; padding-left: 0; }
    .override-row { background: rgba(127,127,127,0.06); padding: 8px 12px; margin: 6px 0; border-radius: 3px; }
    .override-path { font-weight: bold; margin-bottom: 4px; }
    .override-side { font-size: 0.9em; margin: 2px 0; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Dabbler Config Editor</h1>
    <div class="header-actions">
      <button class="primary" id="btn-save">Save</button>
    </div>
  </div>
  <div class="meta">
    Editing: <strong>${escapeHtml(fileList)}</strong> &nbsp;|&nbsp; ${escapeHtml(savedStatus)}
  </div>
  ${parseBanner}
  ${driftBanner}
  ${recoveryBanner}
  <div class="layout">
    <div class="nav">
      ${sectionNav}
    </div>
    <div class="content">
      ${sectionContent}
    </div>
  </div>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // --- Section nav ---
      const buttons = document.querySelectorAll('.section-btn');
      const panels = document.querySelectorAll('.section-panel');
      buttons.forEach((btn, i) => {
        if (i === 0) btn.classList.add('active');
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          panels.forEach(p => { p.style.display = 'none'; });
          btn.classList.add('active');
          const sectionNum = btn.getAttribute('data-section');
          const panel = document.getElementById('section-' + sectionNum);
          if (panel) panel.style.display = 'block';
        });
      });

      // --- §1 dropdown constraint: outsourcing-mode -> verification options ---
      const outsourcingSel = document.getElementById('s1-outsourcing-mode');
      const verificationSel = document.getElementById('s1-verification-method');
      const apiConstraintInfo = document.getElementById('s1-api-constraint');
      const manualTemplate = document.getElementById('s1-manual-template');
      function applyOutsourcingConstraint() {
        if (!outsourcingSel || !verificationSel) return;
        const disabled = outsourcingSel.value === 'disabled';
        const apiOpt = verificationSel.querySelector('option[value="api"]');
        if (apiOpt) apiOpt.disabled = disabled;
        if (apiConstraintInfo) apiConstraintInfo.style.display = disabled ? '' : 'none';
        if (disabled && verificationSel.value === 'api') {
          verificationSel.value = 'manual-via-other-engine';
        }
      }
      function applyManualTemplateVisibility() {
        if (!verificationSel || !manualTemplate) return;
        manualTemplate.style.display = verificationSel.value === 'manual-via-other-engine' ? '' : 'none';
      }
      if (outsourcingSel) outsourcingSel.addEventListener('change', () => { applyOutsourcingConstraint(); applyManualTemplateVisibility(); });
      if (verificationSel) verificationSel.addEventListener('change', applyManualTemplateVisibility);
      applyOutsourcingConstraint();
      applyManualTemplateVisibility();

      // --- §2 slider live update + preview re-render ---
      const warnSlider = document.getElementById('s2-warn-at-percent');
      const warnValueEl = document.getElementById('s2-warn-at-percent-value');
      const thresholdInput = document.getElementById('s2-threshold-usd');
      const previewBlock = document.getElementById('s2-preview');
      function fmtUsd(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
      function rerenderPreview() {
        if (!warnSlider || !thresholdInput || !previewBlock) return;
        const pct = Number(warnSlider.value);
        const thr = Number(thresholdInput.value);
        const warn = (pct * thr) / 100;
        if (warnValueEl) warnValueEl.textContent = pct + '%';
        previewBlock.innerHTML =
          '<p><strong>Below ' + pct + '% of ' + fmtUsd(thr) + ' (' + fmtUsd(warn) + '):</strong> ' +
          '<span class="preview-detail">Silent &mdash; no prompt, just log to cost dashboard.</span></p>' +
          '<p><strong>Between ' + pct + '% and 100% (' + fmtUsd(warn) + '&ndash;' + fmtUsd(thr) + '):</strong> ' +
          '<span class="preview-detail">Heads-up &mdash; non-blocking notification, one per band.</span></p>' +
          '<p><strong>At or above ' + fmtUsd(thr) + ':</strong> ' +
          '<span class="preview-detail">Confirm-or-abort &mdash; modal dialog before the call proceeds.</span></p>';
      }
      if (warnSlider) warnSlider.addEventListener('input', rerenderPreview);
      if (thresholdInput) thresholdInput.addEventListener('input', rerenderPreview);

      // --- §3 provider popover toggle ---
      document.querySelectorAll('.popover-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-target');
          if (!target) return;
          const row = document.getElementById(target);
          if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
        });
      });

      // --- §4 run-flag-command button ---
      const flagBtn = document.getElementById('s4-run-flag-command');
      if (flagBtn) flagBtn.addEventListener('click', () => { vscode.postMessage({ command: 'runFlagCommand' }); });

      // --- §5 test notification button ---
      const testNotifBtn = document.getElementById('s5-test-notification');
      if (testNotifBtn) testNotifBtn.addEventListener('click', () => { vscode.postMessage({ command: 'sendTestNotification' }); });

      // --- §6 open-local-overrides button ---
      const openLocalBtn = document.getElementById('s6-open-local-overrides');
      if (openLocalBtn) openLocalBtn.addEventListener('click', () => { vscode.postMessage({ command: 'openLocalOverrides' }); });

      // --- recovery banner buttons ---
      const retryBtn = document.getElementById('recovery-retry');
      const acceptBtn = document.getElementById('recovery-accept');
      const reapplyBtn = document.getElementById('recovery-reapply');
      if (retryBtn) retryBtn.addEventListener('click', () => { vscode.postMessage({ command: 'retryFailedWrite' }); });
      if (acceptBtn) acceptBtn.addEventListener('click', () => { vscode.postMessage({ command: 'acceptHalfBatch' }); });
      if (reapplyBtn) reapplyBtn.addEventListener('click', () => { vscode.postMessage({ command: 'reapplyLastSave' }); });

      // --- (shared)/(local override) toggle ---
      document.querySelectorAll('.src-indicator').forEach(ind => {
        const source = ind.getAttribute('data-source');
        if (source === 'not-overridable' || source === 'default') return;
        ind.addEventListener('click', () => {
          const cur = ind.getAttribute('data-source');
          const next = cur === 'local' ? 'shared' : 'local';
          ind.setAttribute('data-source', next);
          ind.className = 'src-indicator src-' + next;
          ind.textContent = next === 'local' ? '(local override)' : '(shared)';
        });
      });

      // --- Save gather ---
      function gatherPayload() {
        const payload = {};
        // §1
        if (outsourcingSel) {
          const ind = outsourcingSel.parentElement && outsourcingSel.parentElement.querySelector('.src-indicator');
          const src = (ind && ind.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          payload.outsourcingMode = { value: outsourcingSel.value, source: src };
        }
        if (verificationSel) payload.verificationMethod = verificationSel.value;
        // §2
        if (thresholdInput) {
          const ind = thresholdInput.parentElement && thresholdInput.parentElement.querySelector('.src-indicator');
          const src = (ind && ind.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          payload.thresholdUsd = { value: Number(thresholdInput.value), source: src };
        }
        const scopeSel = document.getElementById('s2-scope');
        if (scopeSel) payload.scope = scopeSel.value;
        if (warnSlider) {
          const ind = warnSlider.parentElement && warnSlider.parentElement.querySelector('.src-indicator');
          const src = (ind && ind.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          payload.warnAtPercent = { value: Number(warnSlider.value), source: src };
        }
        // §3 providers
        const providerRows = document.querySelectorAll('tr.provider-row');
        payload.providers = [];
        providerRows.forEach(row => {
          const id = row.getAttribute('data-provider-id');
          if (!id) return;
          const enabledInput = row.querySelector('input[data-field="enabled"]');
          const labelInput = row.querySelector('input[data-field="displayLabel"]');
          const keyInput = row.querySelector('input[data-field="apiKeyEnv"]');
          const urlInput = row.querySelector('input[data-field="baseUrl"]');
          const enabledInd = enabledInput && enabledInput.parentElement && enabledInput.parentElement.querySelector('.src-indicator');
          const enabledSrc = (enabledInd && enabledInd.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          const keyInd = keyInput && keyInput.parentElement && keyInput.parentElement.querySelector('.src-indicator');
          const keySrc = (keyInd && keyInd.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          const urlInd = urlInput && urlInput.parentElement && urlInput.parentElement.querySelector('.src-indicator');
          const urlSrc = (urlInd && urlInd.getAttribute('data-source') === 'local') ? 'local' : 'shared';
          const pp = { id: id };
          if (enabledInput) pp.enabled = { value: !!enabledInput.checked, source: enabledSrc };
          if (labelInput) pp.displayLabel = labelInput.value;
          if (keyInput) pp.apiKeyEnv = { value: keyInput.value, source: keySrc };
          if (urlInput) pp.baseUrl = { value: urlInput.value, source: urlSrc };
          payload.providers.push(pp);
        });
        // §4
        const honorChk = document.getElementById('s4-honor-annotations');
        if (honorChk) payload.honorAnnotations = !!honorChk.checked;
        // §5
        const puEnabled = document.getElementById('s5-pushover-enabled');
        const puApiKey = document.getElementById('s5-pushover-api-key-env');
        const puUserKey = document.getElementById('s5-pushover-user-key-env');
        if (puEnabled) payload.pushoverEnabled = !!puEnabled.checked;
        if (puApiKey) payload.pushoverApiKeyEnv = puApiKey.value;
        if (puUserKey) payload.pushoverUserKeyEnv = puUserKey.value;
        return payload;
      }
      document.getElementById('btn-save').addEventListener('click', () => {
        const payload = gatherPayload();
        vscode.postMessage({ command: 'save', payload: payload });
      });
    })();
  </script>
</body>
</html>`;
    }
    _renderRecoveryBanner(r) {
        if (r.failed.length > 0 && r.succeeded.length > 0) {
            const succeededList = r.succeeded.map((f) => `<code>${f}</code>`).join(", ");
            const failedList = r.failed
                .map((f) => `<li><code>${f.file}</code>: ${escapeHtml(f.reason)}</li>`)
                .join("");
            return `<div class="banner banner-warning">
          <strong>&#9888; Half-batch save</strong> — ${r.succeeded.length} file(s) saved (${succeededList}); ${r.failed.length} failed.
          <ul>${failedList}</ul>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button id="recovery-retry" class="primary">Retry failed write</button>
            <button id="recovery-accept" class="secondary">Accept current state as new baseline</button>
          </div>
        </div>`;
        }
        if (r.drifted.length > 0) {
            const driftedList = r.drifted.map((f) => `<code>${f}</code>`).join(", ");
            return `<div class="banner banner-warning">
          <strong>&#9888; External modification detected</strong> — ${r.drifted.length} file(s) changed on disk since your last save: ${driftedList}.
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button id="recovery-reapply" class="secondary">Re-apply my last save (overwrites on-disk)</button>
            <button id="recovery-accept" class="secondary">Accept on-disk as new baseline</button>
          </div>
        </div>`;
        }
        return "";
    }
    _noWorkspaceHtml(nonce, cspSource) {
        return `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
      <title>Dabbler Config Editor</title>
      <style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}</style>
    </head><body>
      <h1>Dabbler Config Editor</h1>
      <p>No workspace folder is open. Open a folder containing an <code>ai_router/</code> directory to use the config editor.</p>
    </body></html>`;
    }
    _missingFilesHtml(nonce, cspSource, missingFilePath) {
        const fileName = path.basename(missingFilePath);
        return `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
      <title>Dabbler Config Editor</title>
      <style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}</style>
    </head><body>
      <h1>Dabbler Config Editor</h1>
      <p>Could not find <code>${escapeHtml(fileName)}</code> at:<br><code>${escapeHtml(missingFilePath)}</code></p>
      <p>Run the Dabbler project setup wizard to create the config files, or create them manually.</p>
    </body></html>`;
    }
}
exports.ConfigEditorPanel = ConfigEditorPanel;
function registerConfigEditorCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.openConfigEditor", () => {
        ConfigEditorPanel.createOrShow(context);
    }));
}
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
//# sourceMappingURL=ConfigEditorPanel.js.map