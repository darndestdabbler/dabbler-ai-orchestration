import * as vscode from "vscode";
import * as fs from "fs";
import { registerPlanImportCommand } from "./planImport";
import { registerSessionGenPromptCommand } from "./sessionGenPrompt";

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

export class WizardPanel {
  static currentPanel: WizardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  static show(extensionUri: vscode.Uri): void {
    if (WizardPanel.currentPanel) {
      WizardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "dabblerWizard",
      "Dabbler AI Orchestration — Get Started",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")],
      }
    );
    WizardPanel.currentPanel = new WizardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => { WizardPanel.currentPanel = undefined; });
    this._panel.webview.onDidReceiveMessage((msg: { command: string }) => {
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

  private _getHtml(): string {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "webview", "wizard.html");
    try {
      let html = fs.readFileSync(htmlPath.fsPath, "utf8");
      const nonce = getNonce();
      const cspSource = this._panel.webview.cspSource;
      html = html
        .replace(/{{NONCE}}/g, nonce)
        .replace(/{{CSP_SOURCE}}/g, cspSource);
      return html;
    } catch {
      return `<!DOCTYPE html><html><body><p>Error loading wizard panel.</p></body></html>`;
    }
  }
}

export function registerWizardCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.getStarted", () => {
      WizardPanel.show(context.extensionUri);
    })
  );
  registerPlanImportCommand(context);
  registerSessionGenPromptCommand(context);
}
