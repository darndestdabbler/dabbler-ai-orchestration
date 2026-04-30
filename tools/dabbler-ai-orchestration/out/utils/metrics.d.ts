import { MetricsEntry, CostSummary } from "../types";
export declare const METRICS_FILE: string;
export declare function readMetrics(workspaceRoot: string): MetricsEntry[];
export declare function summarizeMetrics(entries: MetricsEntry[]): CostSummary;
export declare function buildSparkline(dailyCosts: Array<{
    date: string;
    cost: number;
}>): string;
export declare function exportToCsv(entries: MetricsEntry[]): string;
