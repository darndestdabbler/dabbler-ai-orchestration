import type { EmptyCta } from "./OrchestratorAccordion";
import { type Provider } from "../commands/checkOutOrchestrator";
interface ProviderCta {
    provider: Provider;
    cta: EmptyCta;
}
export declare function claudeCodeInstalled(): boolean;
export declare function codexInstalled(): boolean;
export declare function geminiInstalled(): boolean;
export declare function copilotInstalled(): boolean;
export interface DetectionResult {
    installed: Provider[];
}
export declare function detectInstalledOrchestrators(): DetectionResult;
export declare function pickEmptyStateCta(detection?: DetectionResult): EmptyCta | null;
export declare const PROVIDER_CTAS: ReadonlyArray<ProviderCta>;
export {};
