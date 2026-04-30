import * as vscode from "vscode";
export declare class WizardPanel {
    static currentPanel: WizardPanel | undefined;
    private readonly _panel;
    private readonly _extensionUri;
    static show(extensionUri: vscode.Uri): void;
    private constructor();
    private _getHtml;
}
export declare function registerWizardCommands(context: vscode.ExtensionContext): void;
