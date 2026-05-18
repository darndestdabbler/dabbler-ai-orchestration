import * as vscode from "vscode";
import { SessionSetsProvider } from "../../../providers/sessionSetsProvider";
export interface FixtureHandle {
    repo_root: string;
    set_dir: string;
    bare_remote: string;
    slug: string;
    total_sessions: number;
    engine: string;
    model: string;
    provider: string;
    effort: string;
}
export declare function makeTmpDir(prefix: string): string;
export declare function makeSet(tmpPath: string, slug: string, totalSessions: number): FixtureHandle;
export declare function startSession(h: FixtureHandle, sessionNumber: number): void;
export declare function makeActivity(h: FixtureHandle, sessionNumber: number, description?: string): void;
export declare function makeDisposition(h: FixtureHandle, sessionNumber: number, isFinal: boolean, status?: string): void;
export declare function makeChangeLog(h: FixtureHandle, finalSessionNumber?: number): void;
export interface CloseResult {
    exit: number;
    stdout: string;
    stderr: string;
}
export declare function closeSession(h: FixtureHandle, sessionNumber: number, opts?: {
    force?: boolean;
    injectForceEnv?: boolean;
}): CloseResult;
export declare function cancelSet(h: FixtureHandle, reason?: string): void;
export declare function restoreSet(h: FixtureHandle, reason?: string): void;
export declare function makeAdditionalSet(base: FixtureHandle, newSlug: string, newTotalSessions: number): FixtureHandle;
export declare function makeSiblingWorktree(h: FixtureHandle, wtSlug: string): string;
/**
 * Drive sessions 1..n through the full happy path against *h*. The
 * change-log is written before the final close, matching the
 * ``check_change_log_fresh`` gate that fires only on the terminal
 * session.
 */
export declare function driveHappyPath(h: FixtureHandle, throughSession: number): void;
/**
 * Replace `vscode.workspace.workspaceFolders` with the single folder at
 * *folderPath*. Returns a promise that resolves when VS Code has
 * surfaced the change event — without that, a `SessionSetsProvider`
 * constructed in the next line would read pre-swap state.
 *
 * The provider doesn't bind a file-watcher in tests because activation
 * gates on at least one workspace folder being present at startup;
 * inside the test harness, activate() may have early-returned (the
 * launched workspace started empty). Tests therefore construct fresh
 * provider instances themselves rather than reaching into the
 * extension-registered one. This sidesteps the file-watcher entirely
 * — `getChildren()` is synchronous over `readAllSessionSets()`, which
 * just walks the filesystem on each call.
 */
export declare function replaceWorkspaceFolders(folderPath: string): Promise<void>;
/**
 * Construct a fresh `SessionSetsProvider`. Tests use this rather than
 * reaching into the extension's registered provider — extension
 * activation requires a workspace folder to be present at startup, and
 * the test-electron launch starts with none. Constructing a provider
 * directly bypasses that gate and exercises the same code path that
 * activate() would.
 */
export declare function buildProvider(): SessionSetsProvider;
/**
 * Remove a fixture tmpdir. Best-effort: on Windows, the bare remote
 * may briefly retain locks from a recent ``git push`` even after the
 * child process exits. Swallow the EBUSY/EPERM and trust the OS to
 * clean it up on shutdown — fixtures live under TMPDIR.
 */
export declare function cleanupTmpDir(tmpPath: string): void;
export interface GroupChild extends vscode.TreeItem {
    contextValue: "group";
    groupKey: string;
}
/**
 * Read the top-level bucket groups from *provider*. Returns the labels
 * verbatim so tests can assert on the trailing ``(N)`` count too.
 */
export declare function topLevelGroups(provider: SessionSetsProvider): vscode.TreeItem[];
/**
 * Find the group whose `groupKey` equals *key* and return its
 * children. Returns an empty array when the group is absent (e.g.
 * "cancelled" doesn't render when no cancelled sets exist).
 */
export declare function childrenOfGroup(provider: SessionSetsProvider, key: "in-progress" | "not-started" | "complete" | "cancelled"): vscode.TreeItem[];
