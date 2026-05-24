export type ChatSessionMismatchChoice = "take-over" | "read-only" | "cancel";
export declare const MODAL_TAKE_OVER = "Take Over";
export declare const MODAL_READ_ONLY = "Open in Read-Only Mode";
export declare const MODAL_CANCEL = "Cancel";
export interface MismatchCopy {
    heldByLabel: string;
    wouldBeLabel: string;
    sessionSetSlug: string;
}
export type ShowModal = (message: string, options: {
    modal: true;
    detail?: string;
}, ...items: string[]) => Thenable<string | undefined>;
export declare function truncateChatSessionId(value: string | null | undefined): string;
export declare function formatHolderLabel(engine: string, provider: string, chatSessionId: string | null): string;
export declare function buildModalMessage(copy: MismatchCopy): {
    message: string;
    detail: string;
};
export declare function resolveChoice(label: string | undefined): ChatSessionMismatchChoice;
export declare function chatSessionMismatchModal(copy: MismatchCopy, show?: ShowModal): Promise<ChatSessionMismatchChoice>;
