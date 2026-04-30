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
exports.CostDashboard = void 0;
exports.registerCostDashboardCommand = registerCostDashboardCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const metrics_1 = require("../utils/metrics");
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}
class CostDashboard {
    static show(extensionUri) {
        if (CostDashboard.currentPanel) {
            CostDashboard.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            CostDashboard.currentPanel._refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel("dabblerCostDashboard", "Dabbler — Cost Dashboard", vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")],
        });
        CostDashboard.currentPanel = new CostDashboard(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._refresh();
        this._panel.onDidDispose(() => { CostDashboard.currentPanel = undefined; });
        this._panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === "exportCsv")
                this._exportCsv();
            if (msg.command === "refresh")
                this._refresh();
        });
    }
    _refresh() {
        this._panel.webview.html = this._getHtml();
    }
    _exportCsv() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            vscode.window.showErrorMessage("No workspace folder open.");
            return;
        }
        const entries = (0, metrics_1.readMetrics)(root);
        const csv = (0, metrics_1.exportToCsv)(entries);
        const outPath = path.join(root, "ai-router", "cost-export.csv");
        try {
            fs.writeFileSync(outPath, csv, "utf8");
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(outPath));
        }
        catch (err) {
            vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    _getHtml() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const nonce = getNonce();
        const cspSource = this._panel.webview.cspSource;
        if (!root) {
            return noWorkspaceHtml(nonce, cspSource);
        }
        const entries = (0, metrics_1.readMetrics)(root);
        if (entries.length === 0) {
            return noMetricsHtml(nonce, cspSource, path.join(root, metrics_1.METRICS_FILE));
        }
        const summary = (0, metrics_1.summarizeMetrics)(entries);
        const sparkline = (0, metrics_1.buildSparkline)(summary.dailyCosts);
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "dashboard.html");
        try {
            let html = fs.readFileSync(htmlPath.fsPath, "utf8");
            const sessionSetRows = Object.entries(summary.bySessionSet)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([slug, d]) => `<tr><td>${slug}</td><td>${d.sessions}</td><td>$${d.cost.toFixed(3)}</td>` +
                `<td>${d.lastRun ? new Date(d.lastRun).toLocaleDateString("en-CA") : "—"}</td></tr>`)
                .join("\n");
            const modelRows = Object.entries(summary.byModel)
                .sort(([, a], [, b]) => b - a)
                .map(([model, cost]) => {
                const pct = summary.totalCost > 0 ? ((cost / summary.totalCost) * 100).toFixed(1) : "0";
                return `<tr><td>${model}</td><td>$${cost.toFixed(3)}</td><td>${pct}%</td></tr>`;
            })
                .join("\n");
            html = html
                .replace(/{{NONCE}}/g, nonce)
                .replace(/{{CSP_SOURCE}}/g, cspSource)
                .replace("{{TOTAL_COST}}", `$${summary.totalCost.toFixed(3)}`)
                .replace("{{SPARKLINE}}", sparkline)
                .replace("{{SESSION_SET_ROWS}}", sessionSetRows)
                .replace("{{MODEL_ROWS}}", modelRows)
                .replace("{{SPARKLINE_DATES}}", `${summary.dailyCosts[0]?.date ?? ""} → ${summary.dailyCosts[29]?.date ?? ""}`);
            return html;
        }
        catch {
            return noMetricsHtml(nonce, cspSource, path.join(root, metrics_1.METRICS_FILE));
        }
    }
}
exports.CostDashboard = CostDashboard;
function noWorkspaceHtml(nonce, cspSource) {
    return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  </head><body><p>Open a workspace folder to view costs.</p></body></html>`;
}
function noMetricsHtml(nonce, cspSource, metricsPath) {
    return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  <style nonce="${nonce}">body { font-family: var(--vscode-font-family); padding: 20px; }</style>
  </head><body>
  <h2>No cost data found</h2>
  <p>Expected: <code>${metricsPath}</code></p>
  <p>Enable metrics logging in <code>ai-router/config.py</code> by setting <code>METRICS_ENABLED = True</code>.</p>
  <p>Each session run will append a JSON line to <code>ai-router/metrics.jsonl</code>.</p>
  </body></html>`;
}
function registerCostDashboardCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.showCostDashboard", () => {
        CostDashboard.show(context.extensionUri);
    }));
}
//# sourceMappingURL=CostDashboard.js.map