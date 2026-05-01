export type SessionState = "done" | "in-progress" | "not-started" | "cancelled";
export type OutsourceMode = "first" | "last";
export interface SessionSetConfig {
    requiresUAT: boolean;
    requiresE2E: boolean;
    uatScope: string;
    outsourceMode: OutsourceMode;
}
export interface UatSummary {
    totalItems: number;
    pendingItems: number;
    e2eRefs: string[];
}
export interface OrchestratorInfo {
    engine?: string;
    model?: string;
    effort?: string;
}
export interface LiveSession {
    currentSession: number | null;
    status: string | null;
    orchestrator: OrchestratorInfo | null;
    startedAt: string | null;
    completedAt: string | null;
    verificationVerdict: string | null;
}
export interface SessionSet {
    name: string;
    dir: string;
    specPath: string;
    activityPath: string;
    changeLogPath: string;
    statePath: string;
    aiAssignmentPath: string;
    uatChecklistPath: string;
    state: SessionState;
    totalSessions: number | null;
    sessionsCompleted: number;
    lastTouched: string | null;
    liveSession: LiveSession | null;
    config: SessionSetConfig;
    uatSummary: UatSummary | null;
    root: string;
}
export interface MetricsEntry {
    session_set: string;
    session_num: number;
    model: string;
    effort: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    timestamp: string;
}
export interface CostSummary {
    totalCost: number;
    bySessionSet: Record<string, {
        sessions: number;
        cost: number;
        lastRun: string;
    }>;
    byModel: Record<string, number>;
    dailyCosts: Array<{
        date: string;
        cost: number;
    }>;
}
