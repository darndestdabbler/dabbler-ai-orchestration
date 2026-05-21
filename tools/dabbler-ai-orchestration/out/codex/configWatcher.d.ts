import * as vscode from "vscode";
interface CodexConfigSnapshot {
    model: string | null;
    effort: "low" | "medium" | "high" | null;
    thinking: boolean;
}
export declare function extractTopLevelScalar(toml: string, key: string): string | null;
export declare function parseCodexConfig(toml: string): CodexConfigSnapshot;
export declare function activateCodexConfigWatcher(context: vscode.ExtensionContext): vscode.Disposable;
export {};
