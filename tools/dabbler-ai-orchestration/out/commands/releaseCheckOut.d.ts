import * as vscode from "vscode";
import { type InProgressSet } from "./checkOutOrchestrator";
export declare function describeHolder(set: InProgressSet): string;
export declare function registerReleaseCheckOut(context: vscode.ExtensionContext): void;
