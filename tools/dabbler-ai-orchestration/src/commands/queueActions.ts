import * as vscode from "vscode";
import { runPythonModule } from "../utils/pythonRunner";
import { ProviderQueuesProvider } from "../providers/ProviderQueuesProvider";

/**
 * Right-click commands on Provider Queues tree items.
 *
 * Open Payload     — read-only ``dabbler-queue-payload://`` virtual document
 *                    with the message JSON. Read-only because mutating a
 *                    payload mid-flight would be a queue-contract violation.
 * Mark Failed      — operator escape hatch for stuck ``new``/``claimed``
 *                    messages. Confirmation dialog, then shells out to
 *                    ``queue_status --mark-failed``.
 * Force Reclaim    — releases a stuck lease (``claimed`` -> ``new``).
 *                    Confirmation dialog, then shells out to
 *                    ``queue_status --force-reclaim``.
 */

interface MessageNodeArg {
  kind: "message";
  provider: string;
  message: { id: string; state: string; task_type: string };
}

const PAYLOAD_SCHEME = "dabbler-queue-payload";

class QueuePayloadContentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  private readonly _store = new Map<string, string>();

  setContent(uri: vscode.Uri, body: string): void {
    this._store.set(uri.toString(), body);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this._store.get(uri.toString()) ?? "(payload not loaded)";
  }
}

export interface QueueActionsContext {
  getWorkspaceRoot: () => string | undefined;
  refreshView: () => void;
}

export function registerQueueActionCommands(
  ctx: vscode.ExtensionContext,
  qctx: QueueActionsContext,
): void {
  const contentProvider = new QueuePayloadContentProvider();
  ctx.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PAYLOAD_SCHEME, contentProvider),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerProviderQueues.openPayload",
      async (arg: MessageNodeArg | undefined) => {
        if (!arg || arg.kind !== "message") {
          vscode.window.showWarningMessage("Open Payload: select a queue message first.");
          return;
        }
        const root = qctx.getWorkspaceRoot();
        if (!root) {
          vscode.window.showErrorMessage("Open Payload: no workspace folder open.");
          return;
        }
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--get-payload",
            arg.message.id,
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath",
          timeoutMs: 10000,
        });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          vscode.window.showErrorMessage(
            `queue_status --get-payload failed: ${(result.stderr || result.stdout).trim() || "no output"}`,
          );
          return;
        }
        let parsed: { ok?: boolean; message?: unknown; error?: string };
        try {
          parsed = JSON.parse(result.stdout);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Open Payload: malformed JSON from queue_status: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        if (!parsed.ok) {
          vscode.window.showWarningMessage(
            `Open Payload: ${parsed.error ?? "message not found"}`,
          );
          return;
        }
        const body = JSON.stringify(parsed.message, null, 2);
        // URI carries provider and id so VS Code can dedupe re-opens of the
        // same message into a single virtual document.
        const uri = vscode.Uri.parse(
          `${PAYLOAD_SCHEME}:/${encodeURIComponent(arg.provider)}/${encodeURIComponent(arg.message.id)}.json`,
        );
        contentProvider.setContent(uri, body);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(doc, "json");
        await vscode.window.showTextDocument(doc, { preview: true });
      },
    ),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerProviderQueues.markFailed",
      async (arg: MessageNodeArg | undefined) => {
        if (!arg || arg.kind !== "message") {
          vscode.window.showWarningMessage("Mark Failed: select a queue message first.");
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          `Force ${arg.message.id.slice(0, 8)} (${arg.message.task_type}, state=${arg.message.state}) into state=failed?`,
          { modal: true, detail: "Bypasses the normal ownership check. Use only when the worker is known dead." },
          "Mark Failed",
        );
        if (choice !== "Mark Failed") return;
        const root = qctx.getWorkspaceRoot();
        if (!root) return;
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--mark-failed",
            arg.message.id,
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath",
        });
        await reportInterventionResult("Mark Failed", result, qctx);
      },
    ),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerProviderQueues.forceReclaim",
      async (arg: MessageNodeArg | undefined) => {
        if (!arg || arg.kind !== "message") {
          vscode.window.showWarningMessage("Force Reclaim: select a queue message first.");
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          `Release the lease on ${arg.message.id.slice(0, 8)} (${arg.message.task_type})?`,
          { modal: true, detail: "Returns state=claimed -> new and bumps attempts. The next claim() will pick it up." },
          "Force Reclaim",
        );
        if (choice !== "Force Reclaim") return;
        const root = qctx.getWorkspaceRoot();
        if (!root) return;
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--force-reclaim",
            arg.message.id,
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath",
        });
        await reportInterventionResult("Force Reclaim", result, qctx);
      },
    ),
  );
}

async function reportInterventionResult(
  label: string,
  result: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean },
  qctx: QueueActionsContext,
): Promise<void> {
  if (result.timedOut) {
    vscode.window.showErrorMessage(`${label}: queue_status timed out.`);
    return;
  }
  let parsed: { ok?: boolean; error?: string; previous_state?: string } = {};
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    // fall through to generic failure path
  }
  if (parsed.ok) {
    const prev = parsed.previous_state ? ` (was ${parsed.previous_state})` : "";
    vscode.window.showInformationMessage(`${label} succeeded${prev}.`);
    qctx.refreshView();
    return;
  }
  const detail = parsed.error || (result.stderr || result.stdout).trim() || "no output";
  vscode.window.showErrorMessage(`${label} failed: ${detail}`);
}

export function attachProviderForRefresh(
  provider: ProviderQueuesProvider,
): QueueActionsContext["refreshView"] {
  return () => provider.refresh();
}
