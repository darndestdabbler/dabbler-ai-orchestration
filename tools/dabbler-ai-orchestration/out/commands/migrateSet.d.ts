/**
 * Set 030 Session 5 — in-extension lazy migrator for v2 → v3
 * session-state.json.
 *
 * The bulk migrator (Session 4) ships as a CLI under
 * `python -m ai_router.migrate_session_state`. This command is the
 * single-set front door operators reach via the tree-view context
 * menu on any row flagged "(needs migration)". The subprocess
 * invocation pattern matches the config editor's notification-test
 * path (cp.spawn with windowsHide + env inheritance).
 *
 * Strategy quickpick → CLI flag mapping:
 *   "Use spec.md headings"       → --strategy regex  (default)
 *   "Use AI to refine titles"    → --strategy ai     (Session 5 wires this)
 *   "Use generic labels"         → --strategy generic
 *
 * Both call paths (this command + the bulk CLI) call into the same
 * `migrate_one_set` Python entry point, so the migration semantics
 * are identical regardless of where the operator triggers it.
 *
 * Failure handling: the Python migrator never raises for "file isn't
 * there / file is broken" cases — those come back as structured
 * MigrationResult records (ACTION_SKIPPED_MALFORMED etc.). The
 * command surfaces the result's reason in a notification so the
 * operator can decide whether to hand-repair, run --dry-run, or
 * file an issue.
 *
 * Why no `simulateProcess` injection point: the install-ai-router
 * command splits spawning into a `ProcessSpawner` interface so the
 * Mocha stub harness can drive it deterministically. This command's
 * unit tests live in Playwright (Layer 3), which uses a real Electron
 * process and a real Python — no need for a spawner abstraction.
 */
import * as vscode from "vscode";
interface CommandDeps {
    refreshView: () => void;
}
export declare function registerMigrateSetCommand(context: vscode.ExtensionContext, deps: CommandDeps): void;
export {};
