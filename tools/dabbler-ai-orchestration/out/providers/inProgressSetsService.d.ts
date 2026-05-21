import { SessionSet } from "../types";
import { Recommendation } from "./OrchestratorAccordion";
export declare function listInProgressSets(all?: SessionSet[]): SessionSet[];
export declare function extractRecommendation(text: string, sessionNumber: number, setName: string): Recommendation | null;
export declare function recommendationFor(set: SessionSet): Recommendation | null;
