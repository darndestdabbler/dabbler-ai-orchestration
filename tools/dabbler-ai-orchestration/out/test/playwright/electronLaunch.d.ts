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
export interface StartSessionAttemptResult {
    exit: number;
    stdout: string;
    stderr: string;
}
/**
 * Set 033 Session 4 — invoke ``python -m ai_router.start_session``
 * with an explicit identity (engine + provider + model + effort) and
 * capture exit / stdout / stderr without raising on non-zero exit.
 *
 * Distinct from the harness shim's ``start`` command (which uses the
 * handle's identity and throws on non-zero) because the H3 + H4
 * Layer-3 scenarios need to:
 *   - Drive ``start_session`` as a DIFFERENT holder than the seeded
 *     orchestrator block, to exercise the refusal path; and
 *   - Inspect non-zero exit + stderr without the helper masking the
 *     failure.
 *
 * Optional ``homeOverride`` redirects ``~/.dabbler/orchestrator-
 * writer.log`` (where ``--force`` lands its audit trail) by setting
 * HOME + USERPROFILE on the subprocess env. Use a tmpdir-scoped
 * override so force-override scenarios don't pollute the dev's home
 * dir.
 */
export declare function attemptStartSession(h: FixtureHandle, sessionNumber: number, identity: {
    engine: string;
    provider: string;
    model: string;
    effort?: string;
}, opts?: {
    force?: boolean;
    homeOverride?: string;
}): StartSessionAttemptResult;
/**
 * Set 033 Session 2 — seed the `orchestrator` block on a fixture's
 * `session-state.json` so Layer-3 smokes can verify the painted-on-
 * screen treatment without driving the writer (`start_session`) end-
 * to-end. Replaces the pre-Set-033 `seedOrchestratorMarker` helper
 * which wrote `.dabbler/orchestrator.json` (now retired per H2).
 *
 * Defaults produce a Claude Opus claim that mirrors the canonical
 * Set 033 Session 1 schema: engine + provider + model + effort +
 * timestamps. Callers override for other-provider variants. Merges
 * into the existing `orchestrator` block rather than replacing the
 * full state file.
 */
export declare function seedOrchestratorBlock(h: FixtureHandle, overrides?: Partial<{
    engine: string;
    provider: string;
    model: string;
    effort: string;
    checkedOutAt: string;
    lastActivityAt: string;
}>): void;
export declare function makeAdditionalSet(base: FixtureHandle, newSlug: string, newTotalSessions: number): FixtureHandle;
/**
 * Set 030 Session 5 — rewrite a fixture's ``session-state.json`` from
 * the v3 dual-write shape (what the harness emits today) back to a
 * pure-v2 snapshot the migration UX must detect and offer to migrate.
 *
 * Used by Layer 3 smokes for the "(needs migration)" badge + the
 * migrate command. Round-trips through ``readSessionSets`` afterwards
 * still works — the extension's tolerant v3 reader synthesizes a
 * sessions[] from the legacy triple, so the row renders normally
 * apart from the migration badge.
 */
export declare function downgradeStateFileToV2(h: FixtureHandle): void;
/**
 * Read a state file from disk — used by smokes that need to assert
 * the file was rewritten in v3 shape after a migration round-trip.
 */
export declare function readStateFile(h: FixtureHandle): Record<string, unknown>;
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
 * Session Sets webview tree to render. Returns a FrameLocator into
 * the webview's inner content frame so callers can chain treeitem
 * queries off it.
 *
 * Set 029 Session 4 pivot: the Session Sets view is now a webview
 * (CustomSessionSetsView), not a native TreeDataProvider. VS Code
 * wraps webview content in a two-level iframe stack: an outer
 * sandboxing iframe and an inner content iframe. Both must be
 * traversed before locating the `role="tree"` element rendered by
 * the webview's client.js.
 */
export declare function openSessionSetsView(page: Page): Promise<import("@playwright/test").FrameLocator>;
/**
 * Trigger the refresh command — equivalent to clicking the
 * activity-bar refresh button. Used after the harness mutates state
 * outside the running extension's awareness.
 */
export declare function triggerRefresh(page: Page): Promise<void>;
export declare function closeVSCode(launch: LaunchedVSCode): Promise<void>;
export declare function cleanupTmpDir(tmpPath: string): void;
