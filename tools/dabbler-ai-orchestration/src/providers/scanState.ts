import * as vscode from "vscode";

/**
 * Set 030 Session 5 — activation-time scan lifecycle.
 *
 * Why this exists:
 * The previous activation path called `readAllSessionSets()` inline
 * from the tree provider's `getChildren()`. On a workspace with sets,
 * the tree rendered immediately; on a workspace where the scan was
 * cold (cache empty, filesystem slow, many sets) `getChildren()`
 * briefly returned `[]` before the cache populated — so operators saw
 * an empty-state flash for a few frames before the tree appeared.
 *
 * The fix is a tri-state lifecycle ("idle" → "loading" → "ready")
 * surfaced as a public property the view provider branches on: the
 * webview protocol's `scanState` messages (the `rowsSnapshot` rider
 * and `scanStateChanged`) drive the client's loading sentinel while
 * the scan is cold. (The `dabblerSessionSets.scanState` CONTEXT KEY
 * this manager used to publish was retired in Set 063 S2 with the
 * `viewsWelcome` contribution — its `when` clause was the key's sole
 * consumer once the Set 060 Getting Started form replaced the welcome
 * empty state.)
 *
 * Why a singleton-shaped manager and not a plain enum:
 *   - Listeners (the view provider's snapshot scheduler) subscribe
 *     to state transitions via `onDidChange`; the view refreshes
 *     reactively when the scan finishes instead of being polled.
 *   - Tests can construct a `ScanState` directly with no vscode side
 *     effects.
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

export class ScanState {
  private _phase: ScanPhase = "idle";
  private _emitter = new vscode.EventEmitter<ScanPhase>();

  /** Fires when the phase transitions. Listeners get the new phase. */
  readonly onDidChange = this._emitter.event;

  get phase(): ScanPhase {
    return this._phase;
  }

  setLoading(): void {
    this._setPhase("loading");
  }

  setReady(): void {
    this._setPhase("ready");
  }

  private _setPhase(next: ScanPhase): void {
    if (this._phase === next) return;
    this._phase = next;
    this._emitter.fire(next);
  }

  dispose(): void {
    this._emitter.dispose();
  }
}
