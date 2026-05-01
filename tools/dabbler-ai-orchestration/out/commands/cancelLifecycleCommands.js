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
exports.registerCancelLifecycleCommands = registerCancelLifecycleCommands;
const vscode = __importStar(require("vscode"));
const cancelLifecycle_1 = require("../utils/cancelLifecycle");
function registerCancelLifecycleCommands(context, deps) {
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.cancel", async (item) => {
        const set = item?.set;
        if (!set)
            return;
        // Two-step prompt: a confirmation dialog with explicit "Cancel
        // Set" / "Keep" buttons so the (destructive-ish) action requires
        // an affirmative click. The third "Cancel" dismissal of the
        // dialog itself returns undefined and we abort. The button label
        // is the spec's full phrase "Cancel Session Set" rather than
        // "Cancel" — VS Code's Esc/cancel semantics already mean "abort
        // a modal," so a button literally labeled "Cancel" reads as
        // "abort this dialog" rather than "perform the action."
        const choice = await vscode.window.showInformationMessage(`Cancel session set "${set.name}"?`, { modal: true, detail: "This writes a CANCELLED.md audit file in the session-set folder. The set can be restored later." }, "Cancel Session Set", "Keep");
        if (choice !== "Cancel Session Set")
            return;
        const reason = await vscode.window.showInputBox({
            prompt: `Reason for cancelling "${set.name}" (optional)`,
            placeHolder: "e.g. scope rolled into another set",
            ignoreFocusOut: true,
        });
        // showInputBox returns undefined when the user dismisses with
        // Esc; the spec calls out that an empty reason is valid (the
        // operator may decide to type a reason later directly into the
        // file). We treat both undefined and "" the same: write a blank
        // reason line. This matches cancelSessionSet's own contract.
        try {
            await (0, cancelLifecycle_1.cancelSessionSet)(set.dir, reason ?? "");
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to cancel "${set.name}": ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        deps.refreshView();
        vscode.window.showInformationMessage(`Cancelled "${set.name}". CANCELLED.md written to the session-set folder.`);
    }), vscode.commands.registerCommand("dabblerSessionSets.restore", async (item) => {
        const set = item?.set;
        if (!set)
            return;
        const choice = await vscode.window.showInformationMessage(`Restore session set "${set.name}"?`, { modal: true, detail: "This renames CANCELLED.md to RESTORED.md (history preserved) and returns the set to its prior status." }, "Restore", "Keep Cancelled");
        if (choice !== "Restore")
            return;
        // Restore reasons are optional and rarely useful in practice —
        // the spec calls them "rarely used" — but the input box is
        // offered for symmetry with cancel so the audit file's prepend
        // shape is consistent.
        const reason = await vscode.window.showInputBox({
            prompt: `Reason for restoring "${set.name}" (optional)`,
            placeHolder: "e.g. scope is back in plan",
            ignoreFocusOut: true,
        });
        try {
            await (0, cancelLifecycle_1.restoreSessionSet)(set.dir, reason ?? "");
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to restore "${set.name}": ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        deps.refreshView();
        vscode.window.showInformationMessage(`Restored "${set.name}". RESTORED.md kept as audit trail.`);
    }));
}
//# sourceMappingURL=cancelLifecycleCommands.js.map