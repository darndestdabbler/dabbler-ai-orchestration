import * as vscode from "vscode";
export declare class ConfigEditorPanel {
    static currentPanel: ConfigEditorPanel | undefined;
    private readonly _panel;
    private readonly _extensionUri;
    private _loaded;
    private _validation;
    private _parseIssues;
    private _lastSaveSnapshot;
    private _recovery;
    static createOrShow(context: vscode.ExtensionContext): void;
    private constructor();
    private _findAiRouterDir;
    private _loadFiles;
    private _detectDrift;
    private _deriveState;
    private _handleSave;
    /**
     * Snapshot the exact file contents the panel just persisted. For files
     * NOT touched this save, we use the raw text already on disk (loaded
     * earlier). For files written, we use doc.toString() which matches
     * what writeYamlFile serialized. If local-overrides was not written
     * AND the file exists on disk, we still snapshot it so drift detection
     * uses the loaded text as the baseline rather than null.
     */
    private _captureSnapshot;
    private _retryFailedWrite;
    private _acceptHalfBatchAsBaseline;
    private _reapplyLastSave;
    private _runFlagDecisionCommand;
    private _handleTestNotification;
    private _openLocalOverridesFile;
    private _refresh;
    private _getHtml;
    private _renderRecoveryBanner;
    private _noWorkspaceHtml;
    private _missingFilesHtml;
}
export declare function registerConfigEditorCommand(context: vscode.ExtensionContext): void;
