import * as vscode from "vscode";
interface RegisterDeps {
    refreshView: () => void;
}
export declare function registerCancelLifecycleCommands(context: vscode.ExtensionContext, deps: RegisterDeps): void;
export {};
