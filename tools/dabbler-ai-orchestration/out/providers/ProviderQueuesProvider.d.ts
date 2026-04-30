import * as vscode from "vscode";
import { PythonRunResult } from "../utils/pythonRunner";
/**
 * Tree view backing the ``Provider Queues`` activity-bar entry.
 *
 * Reads queue state by shelling out to ``python -m ai_router.queue_status
 * --format json`` rather than embedding a SQLite client in the extension.
 * Two reasons to keep the source-of-truth on the Python side:
 *
 * 1. The queue schema lives in :mod:`queue_db`. A second TS reader would
 *    drift the moment the next migration lands.
 * 2. Right-click interventions (Mark Failed, Force Reclaim) need the same
 *    transactional guarantees as the role-loop daemons; reusing the Python
 *    helper inherits them for free.
 *
 * The provider caches the parsed JSON for ``CACHE_TTL_MS`` so a tree
 * expand/collapse cycle doesn't re-spawn Python on every click. The
 * auto-refresh interval (configurable, default 15s) drives the visible
 * refresh cadence.
 */
export declare const QUEUE_STATES: readonly ["new", "claimed", "completed", "failed", "timed_out"];
export type QueueState = (typeof QUEUE_STATES)[number];
export interface QueueMessageSummary {
    id: string;
    task_type: string;
    session_set: string | null;
    session_number: number | null;
    state: QueueState;
    claimed_by: string | null;
    lease_expires_at: string | null;
    enqueued_at: string;
    completed_at?: string | null;
    attempts: number;
    max_attempts: number;
    from_provider: string;
}
export interface ProviderQueueInfo {
    queue_path: string;
    queue_present: boolean;
    states: Record<QueueState, number>;
    messages: QueueMessageSummary[];
}
export interface QueueStatusPayload {
    providers: Record<string, ProviderQueueInfo>;
}
export type QueueTreeNode = RootNode | ProviderNode | StateGroupNode | MessageNode | InfoNode;
interface RootNode {
    kind: "root";
}
interface ProviderNode {
    kind: "provider";
    provider: string;
    info: ProviderQueueInfo;
}
interface StateGroupNode {
    kind: "stateGroup";
    provider: string;
    state: QueueState;
    count: number;
    messages: QueueMessageSummary[];
}
interface MessageNode {
    kind: "message";
    provider: string;
    message: QueueMessageSummary;
}
interface InfoNode {
    kind: "info";
    label: string;
    detail?: string;
    isError?: boolean;
}
export interface ProviderQueuesDeps {
    /** Returns the workspace root that owns ``ai-router/`` and ``provider-queues/``. */
    getWorkspaceRoot: () => string | undefined;
    /** Spawn helper. Injected for tests. */
    fetchPayload?: (workspaceRoot: string) => Promise<{
        ok: true;
        payload: QueueStatusPayload;
    } | {
        ok: false;
        message: string;
    }>;
    /** Clock — overridable for tests. */
    now?: () => number;
}
export declare class ProviderQueuesProvider implements vscode.TreeDataProvider<QueueTreeNode> {
    private readonly deps;
    private readonly _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | QueueTreeNode | undefined>;
    private _cache;
    private _lastError;
    private _inFlight;
    constructor(deps: ProviderQueuesDeps);
    refresh(): void;
    /** Test-only — inject a payload directly and skip the spawn path. */
    _setPayloadForTest(payload: QueueStatusPayload): void;
    getTreeItem(element: QueueTreeNode): vscode.TreeItem;
    getChildren(element?: QueueTreeNode): Promise<QueueTreeNode[]>;
    private _getPayload;
}
export declare function buildTreeItem(node: QueueTreeNode): vscode.TreeItem;
export declare function parseFetchResult(result: PythonRunResult): {
    ok: true;
    payload: QueueStatusPayload;
} | {
    ok: false;
    message: string;
};
export {};
