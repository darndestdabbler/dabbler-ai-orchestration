import * as vscode from "vscode";
import { ShowModal } from "../providers/chatSessionMismatchModal";
export type EffortLevel = "low" | "medium" | "high" | "max";
export type Provider = "anthropic" | "google" | "openai" | "github";
export interface OrchestratorTuple {
    provider: Provider;
    model: string;
    effort: EffortLevel;
    thinking: boolean;
}
interface ProviderModelList {
    provider: Provider;
    providerLabel: string;
    models: {
        id: string;
        label: string;
    }[];
}
export declare const PROVIDER_MODELS: ProviderModelList[];
export declare function providerToEngine(provider: Provider): string;
export declare function readMru(): OrchestratorTuple[];
export declare function pushMru(tuple: OrchestratorTuple, existing?: OrchestratorTuple[]): OrchestratorTuple[];
export declare function formatTupleLabel(tuple: OrchestratorTuple): string;
export interface InProgressSet {
    slug: string;
    setDir: string;
    state: {
        currentSession: number | null;
        orchestrator: {
            engine?: string;
            provider?: string;
            model?: string;
            effort?: string;
            chatSessionId?: string | null;
        } | null;
    };
}
export declare function listInProgressSetsAt(workspaceCwd: string): Promise<InProgressSet[]>;
export declare function pickTargetInProgressSet(workspaceCwd: string, pickerTitle: string): Promise<InProgressSet | null>;
interface WriteContext {
    extensionUri: vscode.Uri;
    workspaceCwd: string;
}
export interface DispatchResult {
    exitCode: number;
    stderr: string;
}
export declare function dispatchCheckOut(tuple: OrchestratorTuple, set: InProgressSet, ctx: WriteContext, force: boolean): Promise<DispatchResult>;
export declare function confirmRevertReadOnlyIntent(set: InProgressSet): Promise<boolean>;
export declare function commitClearReadOnlyIntent(set: InProgressSet): void;
export type ManualChatMismatchResult = {
    kind: "no-mismatch";
} | {
    kind: "take-over";
} | {
    kind: "read-only";
} | {
    kind: "cancel";
};
export declare function maybeShowChatSessionMismatchOnManualCheckout(tuple: OrchestratorTuple, set: InProgressSet, opts?: {
    showModal?: ShowModal;
    intentService?: {
        setReadOnly: (path: string) => void;
    };
}): Promise<ManualChatMismatchResult>;
export declare function registerCheckOutOrchestrator(context: vscode.ExtensionContext): void;
export {};
