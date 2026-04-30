import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { readMetrics, summarizeMetrics, buildSparkline, exportToCsv, METRICS_FILE } from "../utils/metrics";

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

export class CostDashboard {
  static currentPanel: CostDashboard | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  static show(extensionUri: vscode.Uri): void {
    if (CostDashboard.currentPanel) {
      CostDashboard.currentPanel._panel.reveal(vscode.ViewColumn.Two);
      CostDashboard.currentPanel._refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "dabblerCostDashboard",
      "Dabbler — Cost Dashboard",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")],
      }
    );
    CostDashboard.currentPanel = new CostDashboard(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._refresh();
    this._panel.onDidDispose(() => { CostDashboard.currentPanel = undefined; });
    this._panel.webview.onDidReceiveMessage((msg: { command: string }) => {
      if (msg.command === "exportCsv") this._exportCsv();
      if (msg.command === "refresh") this._refresh();
    });
  }

  private _refresh(): void {
    this._panel.webview.html = this._getHtml();
  }

  private _exportCsv(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { vscode.window.showErrorMessage("No workspace folder open."); return; }
    const entries = readMetrics(root);
    const csv = exportToCsv(entries);
    const outPath = path.join(root, "ai-router", "cost-export.csv");
    try {
      fs.writeFileSync(outPath, csv, "utf8");
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(outPath));
    } catch (err) {
      vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private _getHtml(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const nonce = getNonce();
    const cspSource = this._panel.webview.cspSource;

    if (!root) {
      return noWorkspaceHtml(nonce, cspSource);
    }

    const entries = readMetrics(root);
    if (entries.length === 0) {
      return noMetricsHtml(nonce, cspSource, path.join(root, METRICS_FILE));
    }

    const summary = summarizeMetrics(entries);
    const sparkline = buildSparkline(summary.dailyCosts);

    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "dashboard.html");
    try {
      let html = fs.readFileSync(htmlPath.fsPath, "utf8");
      const sessionSetRows = Object.entries(summary.bySessionSet)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([slug, d]) =>
          `<tr><td>${slug}</td><td>${d.sessions}</td><td>$${d.cost.toFixed(3)}</td>` +
          `<td>${d.lastRun ? new Date(d.lastRun).toLocaleDateString("en-CA") : "—"}</td></tr>`
        )
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
        .replace(
          "{{SPARKLINE_DATES}}",
          `${summary.dailyCosts[0]?.date ?? ""} → ${summary.dailyCosts[29]?.date ?? ""}`
        );
      return html;
    } catch {
      return noMetricsHtml(nonce, cspSource, path.join(root, METRICS_FILE));
    }
  }
}

function noWorkspaceHtml(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  </head><body><p>Open a workspace folder to view costs.</p></body></html>`;
}

function noMetricsHtml(nonce: string, cspSource: string, metricsPath: string): string {
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

export function registerCostDashboardCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.showCostDashboard", () => {
      CostDashboard.show(context.extensionUri);
    })
  );
}
