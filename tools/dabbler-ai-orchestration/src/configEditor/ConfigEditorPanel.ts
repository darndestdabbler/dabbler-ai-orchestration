import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { readYamlFile, writeYamlFile, Document } from "./yamlReadWrite";
import { validateBatch, ValidationResult } from "./schemaValidator";

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

interface LoadedFiles {
  routerConfigPath: string;
  budgetPath: string;
  localOverridesPath: string | null;
  routerConfigDoc: Document | null;
  budgetDoc: Document | null;
  localOverridesDoc: Document | null;
}

interface SaveState {
  lastSavedAt: number | null;
  lastSavedHash: string | null;
}

export class ConfigEditorPanel {
  static currentPanel: ConfigEditorPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _loaded: LoadedFiles | null = null;
  private _validation: ValidationResult | null = null;
  private _saveState: SaveState = { lastSavedAt: null, lastSavedHash: null };

  static createOrShow(context: vscode.ExtensionContext): void {
    if (ConfigEditorPanel.currentPanel) {
      ConfigEditorPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      ConfigEditorPanel.currentPanel._refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "dabblerConfigEditor",
      "Dabbler Config Editor",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
      }
    );
    ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, context.extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._loadFiles();
    this._panel.webview.html = this._getHtml();

    this._panel.onDidDispose(() => {
      ConfigEditorPanel.currentPanel = undefined;
    });

    this._panel.webview.onDidReceiveMessage((msg: { command: string }) => {
      if (msg.command === "save") {
        this._handleSave();
      }
      if (msg.command === "refresh") {
        this._refresh();
      }
    });
  }

  private _findAiRouterDir(): string | null {
    const roots = vscode.workspace.workspaceFolders;
    if (!roots?.length) return null;
    for (const folder of roots) {
      const candidate = path.join(folder.uri.fsPath, "ai_router");
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private _loadFiles(): void {
    const aiRouterDir = this._findAiRouterDir();
    if (!aiRouterDir) {
      this._loaded = null;
      this._validation = null;
      return;
    }

    const routerConfigPath = path.join(aiRouterDir, "router-config.yaml");
    const budgetPath = path.join(aiRouterDir, "budget.yaml");
    const localOverridesPath = path.join(aiRouterDir, "local-overrides.yaml");

    const routerResult = readYamlFile(routerConfigPath);
    const budgetResult = readYamlFile(budgetPath);
    const localResult = readYamlFile(localOverridesPath);

    this._loaded = {
      routerConfigPath,
      budgetPath,
      localOverridesPath: localResult ? localOverridesPath : null,
      routerConfigDoc: routerResult?.doc ?? null,
      budgetDoc: budgetResult?.doc ?? null,
      localOverridesDoc: localResult?.doc ?? null,
    };

    const routerConfigObj = routerResult?.doc.toJSON() as Record<string, unknown> | null ?? null;
    const budgetObj = budgetResult?.doc.toJSON() as Record<string, unknown> | null ?? null;
    const localObj = localResult?.doc.toJSON() as Record<string, unknown> | null ?? null;

    this._validation = validateBatch({
      routerConfig: routerConfigObj,
      budget: budgetObj,
      localOverrides: localObj,
    });
  }

  private _handleSave(): void {
    if (!this._loaded) {
      vscode.window.showErrorMessage("No config files loaded.");
      return;
    }
    // Session 4: no section UIs yet — validate + write the unchanged docs back
    // (round-trip save; sections ship in Session 5)
    const routerConfigObj = this._loaded.routerConfigDoc?.toJSON() as Record<string, unknown> | null ?? null;
    const budgetObj = this._loaded.budgetDoc?.toJSON() as Record<string, unknown> | null ?? null;
    const localObj = this._loaded.localOverridesDoc?.toJSON() as Record<string, unknown> | null ?? null;

    const result = validateBatch({ routerConfig: routerConfigObj, budget: budgetObj, localOverrides: localObj });
    if (!result.valid) {
      vscode.window.showErrorMessage(
        `Save aborted — ${result.errors.length} validation error(s). Fix drift detected in the editor before saving.`
      );
      return;
    }

    try {
      if (this._loaded.routerConfigDoc) {
        writeYamlFile(this._loaded.routerConfigPath, this._loaded.routerConfigDoc);
      }
      if (this._loaded.budgetDoc) {
        writeYamlFile(this._loaded.budgetPath, this._loaded.budgetDoc);
      }
      if (this._loaded.localOverridesDoc && this._loaded.localOverridesPath) {
        writeYamlFile(this._loaded.localOverridesPath, this._loaded.localOverridesDoc);
      }
      this._saveState = {
        lastSavedAt: Date.now(),
        lastSavedHash: null, // content-hash drift detection ships in Session 5
      };
      this._refresh();
      vscode.window.showInformationMessage("Dabbler config saved.");
    } catch (err) {
      vscode.window.showErrorMessage(
        `Save failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private _refresh(): void {
    this._loadFiles();
    this._panel.webview.html = this._getHtml();
  }

  private _getHtml(): string {
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

    const validationPassed = this._validation?.valid ?? false;
    const errors = this._validation?.errors ?? [];

    const savedStatus = this._saveState.lastSavedAt
      ? `All changes saved (${new Date(this._saveState.lastSavedAt).toLocaleTimeString()}).`
      : "No unsaved changes.";

    const fileList = [
      "ai_router/router-config.yaml",
      hasBudget ? "budget.yaml" : null,
      this._loaded.localOverridesPath ? "local-overrides.yaml" : null,
    ]
      .filter(Boolean)
      .join(" + ");

    const driftBanner = !validationPassed
      ? `<div class="drift-banner">
          <strong>⚠ Drift detected</strong> — ${errors.length} validation error(s). Sections are read-only until resolved.
          <ul>${errors.map((e) => `<li><code>${e.file}${e.path}</code>: ${escapeHtml(e.message)}</li>`).join("")}</ul>
        </div>`
      : "";

    const sections = [
      { num: 1, label: "Routing &amp; Verification" },
      { num: 2, label: "Budget" },
      { num: 3, label: "Providers" },
      { num: 4, label: "Significance flagging" },
      { num: 5, label: "Notifications" },
      { num: 6, label: "Local overrides summary" },
    ];

    const sectionNav = sections
      .map((s) => `<button class="section-btn" data-section="${s.num}">&rsaquo; ${s.label}</button>`)
      .join("\n");

    const sectionContent = sections
      .map(
        (s) => `<div class="section-panel" id="section-${s.num}" style="display:${s.num === 1 ? "block" : "none"}">
          <h2>${s.label}</h2>
          <p class="placeholder">Section ${s.num} UI coming in Session 5.</p>
        </div>`
      )
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
    .drift-banner { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); padding: 8px 16px; margin: 8px 16px; border-radius: 3px; font-size: 0.85em; }
    .drift-banner ul { margin: 4px 0 0 16px; padding: 0; }
    .layout { display: flex; height: calc(100vh - 80px); }
    .nav { width: 200px; min-width: 160px; border-right: 1px solid var(--vscode-panel-border); padding: 8px 0; display: flex; flex-direction: column; }
    .section-btn { background: none; border: none; color: var(--vscode-foreground); padding: 6px 16px; text-align: left; cursor: pointer; font-size: 0.9em; width: 100%; }
    .section-btn:hover, .section-btn.active { background: var(--vscode-list-hoverBackground); }
    .section-btn.active { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
    .content { flex: 1; padding: 16px; overflow-y: auto; }
    .section-panel h2 { font-size: 1em; margin-top: 0; }
    .placeholder { color: var(--vscode-descriptionForeground); font-style: italic; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
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
  ${driftBanner}
  <div class="layout">
    <div class="nav">
      ${sectionNav}
    </div>
    <div class="content">
      ${sectionContent}
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-save').addEventListener('click', () => {
      vscode.postMessage({ command: 'save' });
    });
    const buttons = document.querySelectorAll('.section-btn');
    const panels = document.querySelectorAll('.section-panel');
    buttons.forEach((btn, i) => {
      if (i === 0) btn.classList.add('active');
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        panels.forEach(p => { (p as HTMLElement).style.display = 'none'; });
        btn.classList.add('active');
        const sectionNum = btn.getAttribute('data-section');
        const panel = document.getElementById('section-' + sectionNum);
        if (panel) panel.style.display = 'block';
      });
    });
  </script>
</body>
</html>`;
  }

  private _noWorkspaceHtml(nonce: string, cspSource: string): string {
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

  private _missingFilesHtml(nonce: string, cspSource: string, routerConfigPath: string): string {
    return `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
      <title>Dabbler Config Editor</title>
      <style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}</style>
    </head><body>
      <h1>Dabbler Config Editor</h1>
      <p>Could not find <code>router-config.yaml</code> at:<br><code>${escapeHtml(routerConfigPath)}</code></p>
      <p>Run the Dabbler project setup wizard to create the config files, or create them manually.</p>
    </body></html>`;
  }
}

export function registerConfigEditorCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.openConfigEditor", () => {
      ConfigEditorPanel.createOrShow(context);
    })
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
