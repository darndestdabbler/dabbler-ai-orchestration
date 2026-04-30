import * as vscode from "vscode";
import { ProviderQueuesProvider } from "../providers/ProviderQueuesProvider";
export interface QueueActionsContext {
    getWorkspaceRoot: () => string | undefined;
    refreshView: () => void;
}
export declare function registerQueueActionCommands(ctx: vscode.ExtensionContext, qctx: QueueActionsContext): void;
export declare function attachProviderForRefresh(provider: ProviderQueuesProvider): QueueActionsContext["refreshView"];
