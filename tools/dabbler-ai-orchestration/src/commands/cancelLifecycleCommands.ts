import * as vscode from "vscode";
import {
  describeLifecycleFailure,
  runCancelSession,
  runRestoreSession,
} from "../utils/sessionLifecycleCli";
import { RunRouterCliDeps } from "../utils/routerCli";

/** What a row must carry for these flows: where to spawn, and which
 * session. A repository has sessions, not sets of them. */
export interface CancellableSession {
  root: string;
  number: number;
  name: string;
}

interface SessionItem extends vscode.TreeItem {
  session: CancellableSession;
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
 * Both flows go through `python -m ai_router.session` rather than a
 * TypeScript writer of the state file. `session.root` is the spawn cwd
 * (that is where `.venv` is resolved from); the router derives the one
 * sessions root from the repository it is standing in.
 *
 * Returns true when the tree should refresh.
 */
export async function runCancelSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  cliDeps?: RunRouterCliDeps,
): Promise<boolean> {
  // Two-step prompt: a confirmation dialog with explicit "Cancel Session"
  // / "Keep" buttons so the (destructive-ish) action requires an
  // affirmative click. Dismissing the dialog returns undefined and aborts.
  // The button label is the full phrase rather than "Cancel" — VS Code's
  // Esc/cancel semantics already mean "abort a modal", so a button labeled
  // "Cancel" reads as "abort this dialog" rather than "perform the action".
  const choice = await ui.confirm(
    `Cancel session ${session.number} "${session.name}"?`,
    "The reason is recorded on the session, which can be restored later.",
    "Cancel Session",
    "Keep",
  );
  if (choice !== "Cancel Session") return false;

  // The reason prompt returns undefined when dismissed with Esc; an empty
  // reason is valid. Both are treated the same, which matches the CLI's
  // own contract.
  const reason = await ui.promptReason(
    `Reason for cancelling "${session.name}" (optional)`,
    "e.g. scope rolled into another session",
  );

  const result = await runCancelSession(
    session.root,
    session.number,
    reason ?? "",
    cliDeps,
  );
  if (!result.ok) {
    ui.showErrorMessage(
      describeLifecycleFailure("Cancelling", session.name, result),
    );
    return false;
  }
  ui.showInformationMessage(`Cancelled session ${session.number}.`);
  return true;
}

export async function runRestoreSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  cliDeps?: RunRouterCliDeps,
): Promise<boolean> {
  const choice = await ui.confirm(
    `Restore session ${session.number} "${session.name}"?`,
    "This returns the session to the status it held before it was cancelled.",
    "Restore",
    "Keep Cancelled",
  );
  if (choice !== "Restore") return false;

  const reason = await ui.promptReason(
    `Reason for restoring "${session.name}" (optional)`,
    "e.g. scope is back in plan",
  );

  const result = await runRestoreSession(
    session.root,
    session.number,
    reason ?? "",
    cliDeps,
  );
  if (!result.ok) {
    ui.showErrorMessage(
      describeLifecycleFailure("Restoring", session.name, result),
    );
    return false;
  }
  ui.showInformationMessage(`Restored session ${session.number}.`);
  return true;
}

export function registerCancelLifecycleCommands(
  context: vscode.ExtensionContext,
  deps: RegisterDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.cancel",
      async (item: SessionItem) => {
        const session = item?.session;
        if (!session) return;
        if (await runCancelSessionFlow(session)) deps.refreshView();
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (item: SessionItem) => {
        const session = item?.session;
        if (!session) return;
        if (await runRestoreSessionFlow(session)) deps.refreshView();
      },
    ),
  );
}
