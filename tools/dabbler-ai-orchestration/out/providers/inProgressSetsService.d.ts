import { SessionSet } from "../types";
export interface Recommendation {
    rawText: string;
    providerName: string;
    modelName: string;
    effort: string;
    sessionLabel: string;
    setName: string;
}
export declare function listInProgressSets(all?: SessionSet[]): SessionSet[];
export declare function extractRecommendation(text: string, sessionNumber: number, setName: string): Recommendation | null;
export declare function recommendationFor(set: SessionSet): Recommendation | null;
