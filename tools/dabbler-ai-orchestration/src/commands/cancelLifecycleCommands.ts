import * as vscode from "vscode";
import { cancelSessionSet, restoreSessionSet } from "../utils/cancelLifecycle";
import { SessionSet } from "../types";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

interface RegisterDeps {
  refreshView: () => void;
}

export function registerCancelLifecycleCommands(
  context: vscode.ExtensionContext,
  deps: RegisterDeps
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.cancel",
      async (item: SetItem) => {
        const set = item?.set;
        if (!set) return;
        // Two-step prompt: a confirmation dialog with explicit "Cancel
        // Set" / "Keep" buttons so the (destructive-ish) action requires
        // an affirmative click. The third "Cancel" dismissal of the
        // dialog itself returns undefined and we abort. The button label
        // is the spec's full phrase "Cancel Session Set" rather than
        // "Cancel" — VS Code's Esc/cancel semantics already mean "abort
        // a modal," so a button literally labeled "Cancel" reads as
        // "abort this dialog" rather than "perform the action."
        const choice = await vscode.window.showInformationMessage(
          `Cancel session set "${set.name}"?`,
          { modal: true, detail: "This writes a CANCELLED.md audit file in the session-set folder. The set can be restored later." },
          "Cancel Session Set",
          "Keep"
        );
        if (choice !== "Cancel Session Set") return;
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
          await cancelSessionSet(set.dir, reason ?? "");
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to cancel "${set.name}": ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
        deps.refreshView();
        vscode.window.showInformationMessage(
          `Cancelled "${set.name}". CANCELLED.md written to the session-set folder.`
        );
      }
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (item: SetItem) => {
        const set = item?.set;
        if (!set) return;
        const choice = await vscode.window.showInformationMessage(
          `Restore session set "${set.name}"?`,
          { modal: true, detail: "This renames CANCELLED.md to RESTORED.md (history preserved) and returns the set to its prior status." },
          "Restore",
          "Keep Cancelled"
        );
        if (choice !== "Restore") return;
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
          await restoreSessionSet(set.dir, reason ?? "");
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to restore "${set.name}": ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
        deps.refreshView();
        vscode.window.showInformationMessage(
          `Restored "${set.name}". RESTORED.md kept as audit trail.`
        );
      }
    )
  );
}
