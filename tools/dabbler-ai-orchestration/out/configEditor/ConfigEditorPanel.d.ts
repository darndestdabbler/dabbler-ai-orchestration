import * as vscode from "vscode";
export declare class ConfigEditorPanel {
    static currentPanel: ConfigEditorPanel | undefined;
    private readonly _panel;
    private readonly _extensionUri;
    private _loaded;
    private _validation;
    private _saveState;
    static createOrShow(context: vscode.ExtensionContext): void;
    private constructor();
    private _findAiRouterDir;
    private _loadFiles;
    private _handleSave;
    private _refresh;
    private _getHtml;
    private _noWorkspaceHtml;
    private _missingFilesHtml;
}
export declare function registerConfigEditorCommand(context: vscode.ExtensionContext): void;
