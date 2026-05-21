/**
 * In-extension lazy migrator for v2 → v3 session-state.json.
 *
 * Single-set front door reached via the tree-view context menu on
 * any row flagged "(needs migration)". The migration runs entirely
 * in-process via `utils/migrateSessionState.ts`'s `migrateOneSet()`
 * — no Python subprocess, no ai-router dependency. This makes the
 * command work on every consumer repo, including Lightweight-tier
 * repos that never install ai-router.
 *
 * Strategy choices (two; the AI strategy was retired — any
 * orchestrator the operator is chatting with can refine titles
 * in-line if they want that):
 *
 *   "Use spec.md headings"   → regex extraction · zero cost (default)
 *   "Use generic labels"     → "Session 001", "Session 002", …
 *
 * Failure handling: the migrator never throws for "file isn't there
 * / file is broken" cases — those come back as structured
 * `MigrationResult` records (`skipped-malformed`, `would-violate`,
 * etc.). The command surfaces the result's reason in a notification
 * so the operator can decide whether to hand-repair or file an issue.
 */
import * as vscode from "vscode";
interface CommandDeps {
    refreshView: () => void;
}
export declare function registerMigrateSetCommand(context: vscode.ExtensionContext, deps: CommandDeps): void;
export {};
