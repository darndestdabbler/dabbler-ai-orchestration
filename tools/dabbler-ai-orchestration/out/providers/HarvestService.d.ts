import * as vscode from "vscode";
export interface HarvestSignals {
    wrapperLaunched: boolean;
    narrationPresent: boolean;
    nativeLogBound: boolean;
    bypassInferred: boolean;
    lastSignalTs: string | null;
}
export type ConflictKind = "engine-mismatch" | "bare-touch" | "stale-checkout-touch" | "writer-bypass";
export type ConflictSeverity = "high" | "medium" | "low";
export interface ConflictWarning {
    kind: ConflictKind;
    severity: ConflictSeverity;
    note: string;
}
export interface HarvestSnapshot {
    signalsBySlug: Map<string, HarvestSignals>;
    conflictsBySlug: Map<string, ConflictWarning[]>;
    ok: boolean;
    fetchedAt: number;
}
export declare class HarvestService implements vscode.Disposable {
    private readonly onUpdate;
    private readonly extensionUri;
    private cache;
    private inFlight;
    private disposed;
    private missingDependencyNotified;
    constructor(onUpdate: () => void, extensionUri: vscode.Uri);
    dispose(): void;
    /** Synchronous accessor. Returns the cached snapshot or null on cold
     * cache; triggers a background refresh when stale. Callers (the
     * Explorer snapshot path) read the returned object and attach
     * signals/conflicts to each row payload. */
    getSnapshot(): HarvestSnapshot | null;
    /** Force-evict the cache. Useful when a file watcher fires that the
     * service knows would change the harvest output (a session-state
     * write, a new session-events.jsonl line). */
    invalidate(): void;
    private refresh;
    private fetch;
}
