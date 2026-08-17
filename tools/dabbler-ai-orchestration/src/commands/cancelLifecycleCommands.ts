import * as vscode from "vscode";
import {
  describeLifecycleFailure,
  runCancelSessionSet,
  runRestoreSessionSet,
} from "../utils/sessionLifecycleCli";
import { RunRouterCliDeps } from "../utils/routerCli";
import { SessionSet } from "../types";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

interface RegisterDeps {
  refreshView: () => void;
}

export interface CancelLifecycleUi {
  confirm(
    summary: string,
    detail: string,
    affirmative: string,
    negative: string,
  ): Thenable<string | undefined>;
  promptReason(prompt: string, placeHolder: string): Thenable<string | undefined>;
  showInformationMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
}

function defaultUi(): CancelLifecycleUi {
  return {
    confirm: (summary, detail, affirmative, negative) =>
      vscode.window.showInformationMessage(
        summary,
        { modal: true, detail },
        affirmative,
        negative,
      ),
    promptReason: (prompt, placeHolder) =>
      vscode.window.showInputBox({ prompt, placeHolder, ignoreFocusOut: true }),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
  };
}

/**
 * Set 122 S2: both flows now go through `python -m
 * ai_router.session_lifecycle` rather than a TypeScript writer of
 * `session-state.json`. The flow shape is unchanged — affirmative confirm,
 * optional reason, report, refresh — so the only difference an operator
 * sees is that the command being run is echoed to the "Dabbler Commands"
 * output channel.
 *
 * `set.root` is the spawn cwd (that is where `.venv` is resolved from) and
 * `set.dir` is the explicit target.
 *
 * Returns true when the tree should refresh.
 */
export async function runCancelSessionSetFlow(
  set: SessionSet,
  ui: CancelLifecycleUi = defaultUi(),
  cliDeps?: RunRouterCliDeps,
): Promise<boolean> {
  // Two-step prompt: a confirmation dialog with explicit "Cancel Session
  // Set" / "Keep" buttons so the (destructive-ish) action requires an
  // affirmative click. Dismissing the dialog returns undefined and aborts.
  // The button label is the full phrase rather than "Cancel" — VS Code's
  // Esc/cancel semantics already mean "abort a modal", so a button labeled
  // "Cancel" reads as "abort this dialog" rather than "perform the action".
  const choice = await ui.confirm(
    `Cancel session set "${set.name}"?`,
    "This writes a CANCELLED.md audit file in the session-set folder. The set can be restored later.",
    "Cancel Session Set",
    "Keep",
  );
  if (choice !== "Cancel Session Set") return false;

  // The reason prompt returns undefined when dismissed with Esc; an empty
  // reason is valid (the operator may type one into the file later). Both
  // are treated the same — write a blank reason line — which matches the
  // CLI's own contract.
  const reason = await ui.promptReason(
    `Reason for cancelling "${set.name}" (optional)`,
    "e.g. scope rolled into another set",
  );

  const result = await runCancelSessionSet(set.root, set.dir, reason ?? "", cliDeps);
  if (!result.ok) {
    ui.showErrorMessage(describeLifecycleFailure("Cancelling", set.name, result));
    return false;
  }
  ui.showInformationMessage(
    `Cancelled "${set.name}". CANCELLED.md written to the session-set folder.`,
  );
  return true;
}

export async function runRestoreSessionSetFlow(
  set: SessionSet,
  ui: CancelLifecycleUi = defaultUi(),
  cliDeps?: RunRouterCliDeps,
): Promise<boolean> {
  const choice = await ui.confirm(
    `Restore session set "${set.name}"?`,
    "This renames CANCELLED.md to RESTORED.md (history preserved) and returns the set to its prior status.",
    "Restore",
    "Keep Cancelled",
  );
  if (choice !== "Restore") return false;

  // Restore reasons are optional and rarely useful in practice, but the
  // input box is offered for symmetry with cancel so the audit file's
  // prepend shape stays consistent.
  const reason = await ui.promptReason(
    `Reason for restoring "${set.name}" (optional)`,
    "e.g. scope is back in plan",
  );

  const result = await runRestoreSessionSet(set.root, set.dir, reason ?? "", cliDeps);
  if (!result.ok) {
    ui.showErrorMessage(describeLifecycleFailure("Restoring", set.name, result));
    return false;
  }
  ui.showInformationMessage(
    `Restored "${set.name}". RESTORED.md kept as audit trail.`,
  );
  return true;
}

export function registerCancelLifecycleCommands(
  context: vscode.ExtensionContext,
  deps: RegisterDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.cancel",
      async (item: SetItem) => {
        const set = item?.set;
        if (!set) return;
        if (await runCancelSessionSetFlow(set)) deps.refreshView();
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (item: SetItem) => {
        const set = item?.set;
        if (!set) return;
        if (await runRestoreSessionSetFlow(set)) deps.refreshView();
      },
    ),
  );
}
