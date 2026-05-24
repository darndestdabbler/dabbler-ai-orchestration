import * as vscode from "vscode";
export declare class ReadOnlyIntentService implements vscode.Disposable {
    private readonly intents;
    private readonly emitter;
    readonly onDidChange: vscode.Event<string>;
    setReadOnly(sessionSetPath: string): void;
    clearReadOnly(sessionSetPath: string): void;
    isReadOnly(sessionSetPath: string): boolean;
    get intentCount(): number;
    dispose(): void;
}
export declare function getReadOnlyIntentService(): ReadOnlyIntentService;
export declare function resetReadOnlyIntentServiceForTests(): void;
