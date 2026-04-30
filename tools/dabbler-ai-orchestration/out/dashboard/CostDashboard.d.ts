import * as vscode from "vscode";
export declare class CostDashboard {
    static currentPanel: CostDashboard | undefined;
    private readonly _panel;
    private readonly _extensionUri;
    static show(extensionUri: vscode.Uri): void;
    private constructor();
    private _refresh;
    private _exportCsv;
    private _getHtml;
}
export declare function registerCostDashboardCommand(context: vscode.ExtensionContext): void;
