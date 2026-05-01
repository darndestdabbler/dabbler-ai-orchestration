import * as vscode from "vscode";
import { PythonRunResult } from "../utils/pythonRunner";
export declare const HEARTBEAT_FOOTER = "Observational only. Subscription windows are not introspectable. Use as a heartbeat signal, not as routing guidance.";
export interface ProviderHeartbeat {
    signal_path: string;
    signal_file_present: boolean;
    last_completion_at: string | null;
    minutes_since_last_completion: number | null;
    /** ``completions_in_last_<N>min`` — N = lookback_minutes. */
    completions_in_window: number;
    /** ``tokens_in_last_<N>min`` — N = lookback_minutes. */
    tokens_in_window: number;
    lookback_minutes: number;
    disclaimer: string;
}
export interface HeartbeatStatusPayload {
    providers: Record<string, ProviderHeartbeat>;
    disclaimer: string;
}
export type HeartbeatTreeNode = ProviderNode | InfoNode;
interface ProviderNode {
    kind: "provider";
    provider: string;
    data: ProviderHeartbeat;
    silentWarningMinutes: number;
}
interface InfoNode {
    kind: "info";
    label: string;
    detail?: string;
    isError?: boolean;
}
export interface ProviderHeartbeatsDeps {
    getWorkspaceRoot: () => string | undefined;
    /** Override for tests. */
    fetchPayload?: (workspaceRoot: string, lookbackMinutes: number) => Promise<{
        ok: true;
        payload: HeartbeatStatusPayload;
    } | {
        ok: false;
        message: string;
    }>;
    /** Override for tests. */
    getSettings?: () => {
        lookbackMinutes: number;
        silentWarningMinutes: number;
    };
    /** Clock — overridable for tests. */
    now?: () => number;
}
export declare class ProviderHeartbeatsProvider implements vscode.TreeDataProvider<HeartbeatTreeNode> {
    private readonly deps;
    private readonly _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | HeartbeatTreeNode | undefined>;
    private _cache;
    private _lastError;
    private _inFlight;
    constructor(deps: ProviderHeartbeatsDeps);
    refresh(): void;
    /** Test-only — inject a payload and skip the spawn path. */
    _setPayloadForTest(payload: HeartbeatStatusPayload, lookback: number): void;
    getTreeItem(element: HeartbeatTreeNode): vscode.TreeItem;
    getChildren(element?: HeartbeatTreeNode): Promise<HeartbeatTreeNode[]>;
    private _readSettings;
    private _getPayload;
}
export declare function isSilent(data: ProviderHeartbeat, silentMinutes: number): boolean;
export declare function formatMinutesAgo(m: number | null): string;
export declare function buildTreeItem(node: HeartbeatTreeNode): vscode.TreeItem;
export declare function parseFetchResult(result: PythonRunResult, lookbackMinutes: number): {
    ok: true;
    payload: HeartbeatStatusPayload;
} | {
    ok: false;
    message: string;
};
export {};
