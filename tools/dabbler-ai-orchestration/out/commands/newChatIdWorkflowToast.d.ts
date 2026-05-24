import * as vscode from "vscode";
export declare const NEW_CHAT_ID_TOAST_SUPPRESS_KEY_GEMINI = "dabbler.newChatIdWorkflowToast.suppress.gemini";
export declare const NEW_CHAT_ID_TOAST_SUPPRESS_KEY_COPILOT = "dabbler.newChatIdWorkflowToast.suppress.copilot";
export declare function maybeShowNewChatIdWorkflowToast(context: vscode.ExtensionContext, orchestratorName: string, suppressKey: string): Promise<void>;
