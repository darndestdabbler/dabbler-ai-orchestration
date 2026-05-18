import * as vscode from "vscode";
import { SessionSet } from "../types";
import { ScanState } from "./scanState";
import { forceClosedBadge, isCurrentSessionInFlight, modeBadge, needsMigrationBadge, progressText } from "./SessionSetsModel";
export { forceClosedBadge, isCurrentSessionInFlight, modeBadge, needsMigrationBadge, progressText, };
export declare class SessionSetsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly extensionUri;
    private readonly scanState?;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | vscode.TreeItem | null | undefined>;
    _cache: SessionSet[] | null;
    constructor(extensionUri: vscode.Uri, scanState?: ScanState | undefined);
    refresh(): void;
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem;
    getChildren(element?: vscode.TreeItem): vscode.TreeItem[];
    private makeLoadingSentinel;
    private makeGroup;
    private makeSetItem;
}
