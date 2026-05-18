import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";
export declare function needsMigrationBadge(set: SessionSet): string;
export declare const ICON_FILES: Record<SessionState, string>;
export declare function iconUriFor(extensionUri: vscode.Uri, state: SessionState): vscode.Uri | undefined;
export declare function isCurrentSessionInFlight(set: SessionSet): boolean;
export declare function progressText(set: SessionSet): string;
export declare function touchedDate(set: SessionSet): string;
export declare function uatBadge(set: SessionSet): string;
export declare function forceClosedBadge(set: SessionSet): string;
export declare function modeBadge(_set: SessionSet): string;
export interface BucketedSets {
    inProgress: SessionSet[];
    notStarted: SessionSet[];
    complete: SessionSet[];
    cancelled: SessionSet[];
}
export declare function bucketSets(all: SessionSet[]): BucketedSets;
export declare function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[];
