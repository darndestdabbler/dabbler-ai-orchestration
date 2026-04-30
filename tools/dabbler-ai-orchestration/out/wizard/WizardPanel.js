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
exports.WizardPanel = void 0;
exports.registerWizardCommands = registerWizardCommands;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const planImport_1 = require("./planImport");
const sessionGenPrompt_1 = require("./sessionGenPrompt");
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}
class WizardPanel {
    static show(extensionUri) {
        if (WizardPanel.currentPanel) {
            WizardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }
        const panel = vscode.window.createWebviewPanel("dabblerWizard", "Dabbler AI Orchestration — Get Started", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")],
        });
        WizardPanel.currentPanel = new WizardPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => { WizardPanel.currentPanel = undefined; });
        this._panel.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case "setupProject":
                    vscode.commands.executeCommand("dabbler.setupNewProject");
                    break;
                case "importPlan":
                    vscode.commands.executeCommand("dabbler.importPlan");
                    break;
                case "generatePrompt":
                    vscode.commands.executeCommand("dabbler.generateSessionSetPrompt");
                    break;
                case "troubleshoot":
                    vscode.commands.executeCommand("dabbler.troubleshoot");
                    break;
                case "showCost":
                    vscode.commands.executeCommand("dabbler.showCostDashboard");
                    break;
            }
        });
    }
    _getHtml() {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "wizard.html");
        try {
            let html = fs.readFileSync(htmlPath.fsPath, "utf8");
            const nonce = getNonce();
            const cspSource = this._panel.webview.cspSource;
            html = html
                .replace(/{{NONCE}}/g, nonce)
                .replace(/{{CSP_SOURCE}}/g, cspSource);
            return html;
        }
        catch {
            return `<!DOCTYPE html><html><body><p>Error loading wizard panel.</p></body></html>`;
        }
    }
}
exports.WizardPanel = WizardPanel;
function registerWizardCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.getStarted", () => {
        WizardPanel.show(context.extensionUri);
    }));
    (0, planImport_1.registerPlanImportCommand)(context);
    (0, sessionGenPrompt_1.registerSessionGenPromptCommand)(context);
}
//# sourceMappingURL=WizardPanel.js.map