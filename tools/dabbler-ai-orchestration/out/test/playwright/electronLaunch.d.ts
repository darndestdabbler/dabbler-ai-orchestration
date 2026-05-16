import { ElectronApplication, Page } from "@playwright/test";
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
export declare function startSession(h: FixtureHandle, n: number): void;
export declare function makeActivity(h: FixtureHandle, n: number): void;
export declare function makeDisposition(h: FixtureHandle, n: number, isFinal: boolean): void;
export declare function makeChangeLog(h: FixtureHandle, finalSessionN: number): void;
export interface CloseResult {
    exit: number;
    stdout: string;
    stderr: string;
}
export declare function closeSession(h: FixtureHandle, n: number, opts?: {
    force?: boolean;
}): CloseResult;
export declare function cancelSet(h: FixtureHandle): void;
export declare function makeAdditionalSet(base: FixtureHandle, newSlug: string, newTotalSessions: number): FixtureHandle;
export declare function driveHappyPath(h: FixtureHandle, throughSession: number): void;
export interface LaunchedVSCode {
    app: ElectronApplication;
    page: Page;
    userDataDir: string;
    extensionsDir: string;
}
/**
 * Launch VS Code Electron against *workspacePath*. The launch is
 * fully isolated: a fresh user-data-dir and a fresh extensions-dir
 * are spawned per call, so concurrent test invocations cannot fight
 * over profile state.
 */
export declare function launchVSCode(workspacePath: string): Promise<LaunchedVSCode>;
/**
 * Activate the Dabbler activity-bar view container and wait for the
 * Session Sets tree view to render. Returns the locator for the
 * tree role element so callers can chain treeitem queries off it.
 */
export declare function openSessionSetsView(page: Page): Promise<import("@playwright/test").Locator>;
/**
 * Trigger the refresh command — equivalent to clicking the
 * activity-bar refresh button. Used after the harness mutates state
 * outside the running extension's awareness.
 */
export declare function triggerRefresh(page: Page): Promise<void>;
export declare function closeVSCode(launch: LaunchedVSCode): Promise<void>;
export declare function cleanupTmpDir(tmpPath: string): void;
