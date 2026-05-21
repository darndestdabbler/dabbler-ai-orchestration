export type SuppressionState = Record<string, string>;
export declare function isSuppressed(state: SuppressionState, slug: string, markerUpdatedAt: string | null): boolean;
export declare function suppress(state: SuppressionState, slug: string, markerUpdatedAt: string): SuppressionState;
export declare function clearSuppression(state: SuppressionState, slug: string): SuppressionState;
export declare function prune(state: SuppressionState, visibleSlugs: ReadonlySet<string>): SuppressionState;
