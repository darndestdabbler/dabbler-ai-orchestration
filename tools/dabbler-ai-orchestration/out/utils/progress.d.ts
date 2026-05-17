import { ProgressView, SessionRecord, SessionStatus } from "../types";
export declare const SCHEMA_VERSION_V3: 3;
export declare const SESSION_STATUS_NOT_STARTED: SessionStatus;
export declare const SESSION_STATUS_IN_PROGRESS: SessionStatus;
export declare const SESSION_STATUS_COMPLETE: SessionStatus;
export declare const SESSION_STATUS_CANCELLED: SessionStatus;
export declare const SESSION_STATUSES: ReadonlyArray<SessionStatus>;
export declare const TOP_LEVEL_STATUSES: ReadonlyArray<string>;
export declare const LIFECYCLE_STATE_WORK_IN_PROGRESS = "work_in_progress";
export declare const LIFECYCLE_STATE_CLOSED = "closed";
export declare function canonicalizeStatus(value: string | null | undefined): string | null;
export declare class SessionStateInvariantError extends Error {
    readonly rule: number;
    constructor(rule: number, message: string);
}
export declare function extractSessionTitlesFromSpec(specMdPath: string): Array<{
    number: number;
    title: string;
}>;
export declare function synthesizeV3FromV2(state: any, specMdPath: string): any;
export declare function readProgress(state: any, specMdPath: string): ProgressView;
export declare function getProgress(state: any): ProgressView;
export declare function validateInvariants(sessions: SessionRecord[], topStatus: string | null, lifecycleState: string | null): void;
