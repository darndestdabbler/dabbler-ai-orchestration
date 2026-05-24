import * as vscode from "vscode";
import { ShowModal } from "./chatSessionMismatchModal";
import { ReadOnlyIntentService } from "./ReadOnlyIntentService";
export declare const CONFLICT_DIR_REL: string;
export declare const WRITER_LOG_REL: string;
export declare const POLL_DEBOUNCE_MS = 5000;
export declare const DEFAULT_TIMEOUT_MINUTES = 30;
export declare function conflictDirPath(): string;
export interface ConflictRecord {
    schemaVersion: 1;
    detectedAt: string;
    source: "claude-invoker" | "codex-watcher";
    sessionSetPath: string;
    sessionSetSlug: string;
    sessionNumber: number | null;
    heldByEngine: string;
    heldByProvider: string;
    heldByModel: string | null;
    heldByChatSessionId: string | null;
    checkedOutAt: string | null;
    wouldBeHolderEngine: string;
    wouldBeHolderProvider: string;
    wouldBeHolderModel: string | null;
    wouldBeHolderEffort: string | null;
    wouldBeHolderChatSessionId: string | null;
}
export declare function parseConflictRecord(raw: string): ConflictRecord | null;
export declare function isChatSessionMismatch(record: ConflictRecord): boolean;
export declare function isSlotFreeForHolder(orchestrator: {
    engine?: string;
    provider?: string;
    chatSessionId?: string | null;
} | null | undefined, wouldBeEngine: string, wouldBeProvider: string, wouldBeChatSessionId?: string | null): boolean;
export declare function pollKey(record: ConflictRecord): string;
export interface CheckoutPollServiceOpts {
    pythonPathResolver: (cwd: string) => string;
    timeoutMinutesResolver: () => number;
    showInformationMessage?: (message: string, ...items: string[]) => Thenable<string | undefined>;
    spawnStartSession?: (python: string, args: string[], cwd: string) => Promise<number | null>;
    showMismatchModal?: ShowModal;
    readOnlyIntentService?: ReadOnlyIntentService;
}
export declare const POLL_PROMPT_POLL = "Poll for release";
export declare const POLL_PROMPT_FORCE = "Force override";
export declare const POLL_PROMPT_DISMISS = "Dismiss";
export declare class CheckoutPollService implements vscode.Disposable {
    private readonly opts;
    private dirWatcher;
    private activePolls;
    private inFlight;
    private disposed;
    constructor(opts: CheckoutPollServiceOpts);
    start(): void;
    processFile(filePath: string): void;
    handleConflict(record: ConflictRecord): Promise<void>;
    handleChatSessionMismatch(record: ConflictRecord): Promise<void>;
    beginPolling(record: ConflictRecord): void;
    private resolvePollSucceeded;
    private resolvePollTimedOut;
    forceOverride(record: ConflictRecord): Promise<void>;
    private spawnRetry;
    private defaultSpawn;
    disposePoll(key: string): void;
    get activePollCount(): number;
    dispose(): void;
}
