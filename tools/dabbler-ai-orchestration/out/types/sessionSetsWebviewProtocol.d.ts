export type ScanState = "loading" | "ready";
export type ConflictKind = "engine-mismatch" | "bare-touch" | "stale-checkout-touch" | "writer-bypass";
export type ConflictSeverity = "high" | "medium" | "low";
export interface HarvestSignalsPayload {
    wrapperLaunched: boolean;
    narrationPresent: boolean;
    nativeLogBound: boolean;
    bypassInferred: boolean;
    lastSignalTs: string | null;
}
export interface ConflictPayload {
    kind: ConflictKind;
    severity: ConflictSeverity;
    note: string;
}
export interface RowPayload {
    slug: string;
    name: string;
    state: "in-progress" | "not-started" | "complete" | "cancelled";
    fraction: string;
    description: string;
    contextValue: string;
    iconSlug: string;
    needsMigration: boolean;
    accordionHtml: string | null;
    accordionUpdatedAt: string | null;
    harvestSignals: HarvestSignalsPayload | null;
    conflicts: ConflictPayload[];
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
export interface ContextMenuItem {
    label: string;
    commandId: string;
}
export interface RenderContextMenuMsg {
    type: "renderContextMenu";
    slug: string;
    items: ContextMenuItem[];
}
export type HostToWebview = RowsSnapshotMsg | ScanStateChangedMsg | SuppressionEchoMsg | RenderContextMenuMsg;
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
export interface ExecuteRowCommandMsg {
    type: "executeRowCommand";
    slug: string;
    commandId: string;
}
export type WebviewToHost = ExecuteCommandMsg | ExecuteRowCommandMsg | ShowRowContextMenuMsg | ToggleRowMsg | ActivateRowMsg | ReadyMsg;
