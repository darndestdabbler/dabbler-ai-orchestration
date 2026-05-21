export type ScanState = "loading" | "ready";
export interface RowPayload {
    slug: string;
    name: string;
    state: "in-progress" | "not-started" | "complete" | "cancelled";
    description: string;
    contextValue: string;
    iconSlug: string;
    needsMigration: boolean;
    accordionHtml: string | null;
    accordionUpdatedAt: string | null;
}
export interface BucketPayload {
    key: "in-progress" | "not-started" | "complete" | "cancelled";
    label: string;
    count: number;
    rows: RowPayload[];
}
export interface SnapshotPayload {
    buckets: BucketPayload[];
    hasAnySets: boolean;
    welcomeHtml: string;
}
export interface RowsSnapshotMsg {
    type: "rowsSnapshot";
    version: number;
    scanState: ScanState;
    payload: SnapshotPayload;
}
export interface ScanStateChangedMsg {
    type: "scanStateChanged";
    version: number;
    state: ScanState;
}
export interface SuppressionEchoMsg {
    type: "suppressionEcho";
    version: number;
    suppressed: Record<string, string>;
}
export type HostToWebview = RowsSnapshotMsg | ScanStateChangedMsg | SuppressionEchoMsg;
export interface ExecuteCommandMsg {
    type: "executeCommand";
    commandId: string;
    args?: unknown[];
}
export interface ShowRowContextMenuMsg {
    type: "showRowContextMenu";
    slug: string;
}
export interface ToggleRowMsg {
    type: "toggleRow";
    slug: string;
    expanded: boolean;
    accordionUpdatedAt: string | null;
}
export interface ActivateRowMsg {
    type: "activateRow";
    slug: string;
}
export interface ReadyMsg {
    type: "ready";
}
export type WebviewToHost = ExecuteCommandMsg | ShowRowContextMenuMsg | ToggleRowMsg | ActivateRowMsg | ReadyMsg;
