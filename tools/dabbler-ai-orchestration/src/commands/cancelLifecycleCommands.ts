import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import { RouterUnavailableError } from "dabbler-ai-router";
import { PythonSpawnRouter, RouterRefusal } from "../router/pythonSpawnRouter";
import { sessionRowLabel } from "../providers/sessionsModel";
import { sessionCannotClose } from "../providers/rowMenuHelpers";
import { asSessionNode } from "./workExplorerTreeCommands";

/** What a row must carry for these flows: where to spawn, and which
 * session. A repository has sessions, not sets of them. */
export interface CancellableSession {
  root: string;
  number: number;
  name: string;
  /**
   * Pass `--force`: the session is in flight and unresolved at the cap,
   * so it cannot close and cancel is its one exit. Read off the record,
   * never asked of the operator.
   */
  force?: boolean;
}

/**
 * Read a session tree node into the shape the flows take. The node
 * carries the repository (the spawn cwd) and the session record (the
 * number and the name shown in the prompts); anything else is refused
 * rather than guessed at.
 */
export function cancellableSessionOf(arg: unknown): CancellableSession | undefined {
  const node = asSessionNode(arg);
  if (!node) return undefined;
  return {
    root: node.repository.root,
    number: node.session.number,
    name: sessionRowLabel(node.session),
    force: sessionCannotClose(node.session),
  };
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
 * The failure sentence.
 *
 * `refused` is stated as "nothing was written" because that is the
 * router's guarantee for a refusal — restoring a session that was never
 * cancelled reaches this path, and telling the operator to reconcile
 * from git for a call that wrote nothing would be actively misleading.
 */
export function describeLifecycleFailure(
  verb: string,
  label: string,
  result: RouterRefusal,
): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  if (result.outcome === "refused") {
    return `${verb} "${label}" refused — ${detail} Nothing was written.`;
  }
  return `Failed to ${verb.toLowerCase()} "${label}": ${detail} Re-run the command to finish.`;
}

/**
 * Both flows go through the router's `session` verb rather than a
 * TypeScript writer of the state file: the state file has one set of
 * sanctioned writers and a second implementation here would drift from
 * them. `session.root` is the repository the router stands in, and it
 * derives its one sessions root from there.
 *
 * Returns true when the tree should refresh.
 */
export async function runCancelSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  router: Router = new PythonSpawnRouter(),
): Promise<boolean> {
  // Two-step prompt: a confirmation dialog with explicit "Cancel Session"
  // / "Keep" buttons so the (destructive-ish) action requires an
  // affirmative click. Dismissing the dialog returns undefined and aborts.
  // The button label is the full phrase rather than "Cancel" — VS Code's
  // Esc/cancel semantics already mean "abort a modal", so a button labeled
  // "Cancel" reads as "abort this dialog" rather than "perform the action".
  const choice = await ui.confirm(
    `Cancel session ${session.number} "${session.name}"?`,
    session.force
      ? "This session is unresolved at the cap and cannot close, so it is " +
          "cancelled in flight. Nothing it built lands; its record stays. " +
          "The reason is recorded on the session, which can be restored later."
      : "The reason is recorded on the session, which can be restored later.",
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

  const result = await call(ui, () =>
    router.session.cancel({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: reason ?? "",
      force: session.force === true,
    }),
  );
  if (!result || !result.ok) {
    if (result) {
      ui.showErrorMessage(
        describeLifecycleFailure("Cancelling", session.name, result),
      );
    }
    return false;
  }
  ui.showInformationMessage(`Cancelled session ${session.number}.`);
  return true;
}

/**
 * Run one router call, reporting an unreachable router and answering
 * `null` for it. An unreachable router is not a refusal — nothing
 * decided anything — so it is reported in the router's own words and
 * never dressed up as a verdict.
 */
async function call<T>(
  ui: CancelLifecycleUi,
  invoke: () => Promise<T>,
): Promise<T | null> {
  try {
    return await invoke();
  } catch (err) {
    ui.showErrorMessage(
      err instanceof RouterUnavailableError ? err.message : String(err),
    );
    return null;
  }
}

export async function runRestoreSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  router: Router = new PythonSpawnRouter(),
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

  const result = await call(ui, () =>
    router.session.restore({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: reason ?? "",
    }),
  );
  if (!result || !result.ok) {
    if (result) {
      ui.showErrorMessage(
        describeLifecycleFailure("Restoring", session.name, result),
      );
    }
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
      async (arg: unknown) => {
        const session = cancellableSessionOf(arg);
        if (!session) return;
        if (await runCancelSessionFlow(session)) deps.refreshView();
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (arg: unknown) => {
        const session = cancellableSessionOf(arg);
        if (!session) return;
        if (await runRestoreSessionFlow(session)) deps.refreshView();
      },
    ),
  );
}
