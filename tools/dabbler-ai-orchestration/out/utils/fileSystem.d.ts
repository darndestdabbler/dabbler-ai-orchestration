import { SessionSet, SessionSetConfig, UatSummary } from "../types";
export declare const SESSION_SETS_REL: string;
export declare const PLAYWRIGHT_REL_DEFAULT = "tests";
export declare function discoverRoots(): string[];
export declare function parseSessionSetConfig(specPath: string): SessionSetConfig;
export declare function parseUatChecklist(checklistPath: string): UatSummary | null;
export declare function readSessionSets(root: string): SessionSet[];
export declare function readAllSessionSets(): SessionSet[];
