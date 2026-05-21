export interface OrchestratorMarker {
    schemaVersion: number;
    sessionSetSlug?: string;
    updatedAt: string;
    writer: string;
    signalKind: "current" | "configured-default" | "last-observed" | "manual";
    confidence: "high" | "medium" | "low";
    provider: string;
    providerDisplayName: string;
    model: string;
    modelDisplayName: string;
    tier: "low" | "mid" | "flagship" | "unknown";
    effort: {
        normalized: "low" | "medium" | "high" | "extra-high" | "max";
        native: string;
        thinking: boolean;
        signalKind: "current" | "configured-default" | "last-observed" | "manual";
        confidence: "high" | "medium" | "low";
        observedAt?: string;
    };
    stalenessMaxSec: number;
}
export interface Recommendation {
    rawText: string;
    providerName: string;
    modelName: string;
    effort: string;
    sessionLabel: string;
    setName: string;
}
export interface Mismatch {
    recommendation: Recommendation;
    reason: string;
}
export interface EmptyCta {
    commandId: string;
    label: string;
    args?: unknown;
}
export type RenderState = {
    kind: "empty";
    cta?: EmptyCta | null;
} | {
    kind: "loaded";
    marker: OrchestratorMarker;
    stale: boolean;
    ageSec: number;
    mismatch: Mismatch | null;
};
export declare const DEFAULT_STALENESS_MAX_SEC = 28800;
export declare function tierRank(tier: string | undefined): number;
export declare function effortRank(effort: string | undefined): number;
export declare function classifyRecommendationTier(providerName: string, modelName: string): string;
export declare function fmtAge(seconds: number): string;
export declare function providerHasExtraCapacity(provider: string): boolean;
export declare function effortDisplayName(effort: string): string;
export declare function describeMarker(marker: OrchestratorMarker): string;
export declare function describeRecommendation(rec: Recommendation): string;
export declare function computeMismatch(marker: OrchestratorMarker, rec: Recommendation): Mismatch | null;
export declare function escHtml(s: string): string;
export declare function escAttr(s: string): string;
export declare function tierToNeedleAngle(tier: string): number;
export declare function effortToNeedleAngle(effort: string): number;
export declare function effortColorBucket(effort: string): string;
export declare function renderGaugeSvg(tier: string, signalKind: string, needleAngleDeg: number): string;
export declare function modelTooltip(marker: OrchestratorMarker): string;
export declare function effortTooltip(marker: OrchestratorMarker): string;
export declare function renderAccordionEmpty(cta?: EmptyCta | null): string;
export declare function renderAccordionLoaded(marker: OrchestratorMarker, stale: boolean, ageSec: number, mismatch: Mismatch | null): string;
export declare function renderAccordionBody(state: RenderState): string;
export declare function accordionStateFromOrchestratorBlock(block: {
    engine?: string;
    provider?: string;
    model?: string;
    effort?: string;
    checkedOutAt?: string;
    lastActivityAt?: string;
} | null | undefined, recommendation?: Recommendation | null): RenderState;
