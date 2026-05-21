"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMigrateSetCommand = registerMigrateSetCommand;
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
const vscode = __importStar(require("vscode"));
const migrateSessionState_1 = require("../utils/migrateSessionState");
const STRATEGY_CHOICES = [
    {
        label: "$(symbol-text)  Use spec.md headings",
        description: "Regex extraction · deterministic · zero cost",
        detail: "Reads `### Session K of N: <title>` headings from spec.md. " +
            "Recommended for normal session sets.",
        strategy: "regex",
    },
    {
        label: "$(symbol-numeric)  Use generic labels",
        description: "Fallback · 'Session 1', 'Session 2', …",
        detail: "Use when spec.md is intentionally missing or you want neutral, " +
            "stable labels independent of heading drift.",
        strategy: "generic",
    },
];
function registerMigrateSetCommand(context, deps) {
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.migrate", async (treeItem) => {
        const set = treeItem?.set;
        if (!set) {
            vscode.window.showErrorMessage("Migrate to v3 schema must be invoked from a session-set row " +
                "in the Session Sets view. Right-click a row marked " +
                "'(needs migration)' to use this command.");
            return;
        }
        if (!set.needsMigration) {
            vscode.window.showInformationMessage(`${set.name} is already on schema v3 — nothing to migrate.`);
            return;
        }
        const choice = await vscode.window.showQuickPick(STRATEGY_CHOICES, {
            title: `Migrate ${set.name} to v3 schema`,
            placeHolder: "Choose how session titles should be derived",
            ignoreFocusOut: true,
        });
        if (!choice)
            return; // Cancelled — silent no-op per VS Code convention.
        await runMigrator(set, choice.strategy, deps);
    }));
}
async function runMigrator(set, strategy, deps) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Migrating ${set.name} to v3 schema (${strategy})…`,
        cancellable: false,
    }, async () => {
        let result;
        try {
            result = (0, migrateSessionState_1.migrateOneSet)(set.dir, { strategy });
        }
        catch (exc) {
            const msg = exc instanceof Error ? exc.message : String(exc);
            vscode.window.showErrorMessage(`Migration of ${set.name} failed with an unexpected error: ${msg}`);
            return;
        }
        handleMigrationResult(set, strategy, result, deps);
    });
}
function handleMigrationResult(set, strategy, result, deps) {
    if (result.action === "migrated") {
        vscode.window.showInformationMessage(`${set.name} migrated to v3 schema (${strategy}). ` +
            "The tree will refresh shortly; the (needs migration) badge clears " +
            "on the next read.");
        deps.refreshView();
        return;
    }
    if (result.action === "skipped-v3") {
        vscode.window.showInformationMessage(`${set.name} is already v3 — no changes written.`);
        deps.refreshView();
        return;
    }
    if (result.action === "would-violate") {
        vscode.window.showWarningMessage(`Migration of ${set.name} stopped: the resulting v3 file would ` +
            `violate schema invariants. Reason: ${result.reason}. ` +
            "Try the other strategy (regex ↔ generic) or hand-repair the " +
            "state file before retrying.");
        return;
    }
    // skipped-malformed / skipped-no-state / skipped-future-schema
    vscode.window.showWarningMessage(`Migration of ${set.name} skipped (${result.action}): ${result.reason}.`);
}
//# sourceMappingURL=migrateSet.js.map