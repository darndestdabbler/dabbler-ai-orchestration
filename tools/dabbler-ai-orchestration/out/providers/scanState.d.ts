import * as vscode from "vscode";
/**
 * Set 030 Session 5 — activation-time scan lifecycle.
 *
 * Why this exists:
 * The previous activation path called `readAllSessionSets()` inline
 * from the tree provider's `getChildren()`. On a workspace with sets,
 * the tree rendered immediately; on a workspace where the scan was
 * cold (cache empty, filesystem slow, many sets) `getChildren()`
 * briefly returned `[]` before the cache populated. VS Code's
 * `viewsWelcome` contribution renders whenever `getChildren()` returns
 * an empty array — so operators saw the welcome CTA flash for a few
 * frames before the tree appeared.
 *
 * The fix is a tri-state lifecycle ("idle" → "loading" → "ready")
 * surfaced both as a public property the tree provider can branch on
 * AND as a VS Code context key (`dabblerSessionSets.scanState`) the
 * package.json's `viewsWelcome.when` clause uses to suppress the
 * welcome content while loading.
 *
 * Why a singleton-shaped manager and not a plain enum:
 *   - The manager owns the `setContext` calls so the rest of the
 *     extension never touches `scanState` context keys directly.
 *   - Listeners (the tree provider's `_onDidChangeTreeData`) subscribe
 *     to state transitions via `onDidChange`; the tree refreshes
 *     reactively when the scan finishes instead of being polled.
 *   - Tests can construct a `ScanState` directly with no vscode side
 *     effects (the `setContext` calls are vscode commands; the stub
 *     harness no-ops them).
 *
 * Why not Promise/await directly:
 * `readAllSessionSets()` is currently synchronous-on-the-event-loop;
 * we run it via `setImmediate` to yield once so the activation
 * function returns quickly (VS Code measures extension activation
 * time and we don't want our scan in that metric). When the synchronous
 * read becomes async (a future change), the same manager surfaces
 * the loading window naturally.
 */
export type ScanPhase = "idle" | "loading" | "ready";
export declare class ScanState {
    private _phase;
    private _emitter;
    /** Fires when the phase transitions. Listeners get the new phase. */
    readonly onDidChange: vscode.Event<ScanPhase>;
    get phase(): ScanPhase;
    setLoading(): void;
    setReady(): void;
    private _setPhase;
    dispose(): void;
}
