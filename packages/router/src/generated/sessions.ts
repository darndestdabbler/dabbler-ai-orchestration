// Generated from sessions.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type SessionsSessionRecord = {
  number: number;
  title: string;
  /**
   * v5 admits 'cancelled' here because there is no longer a set to carry it.
   */
  status: "not-started" | "in-progress" | "complete" | "cancelled";
  /**
   * Where a cancelled session came from. A re-cancel never overwrites it.
   */
  preCancelStatus?: "not-started" | "in-progress" | "complete";
  cancelledReason?: string;
  cancelledAt?: string;
  restoredReason?: string;
  /**
   * Absent means 'work'; the writer persists only non-work values.
   */
  type?: "verification" | "remediation";
  startedAt?: string | null;
  completedAt?: string | null;
  orchestrator?: SessionsOrchestratorBlock | null;
  /**
   * Canonical tokens are VERIFIED / ISSUES_FOUND / REMEDIATED_AT_CAP (plus the retired WAIVED, still read from historical records and refused by every writer). Typed string rather than enum because operators have shipped extension tokens that readers PREFIX-MATCH; the sanctioned writer (verdict.validate_session_verdict) fails closed against an exact allowlist, so a confabulated non-verdict can never persist here. Readers stay lenient; the writer is strict.
   */
  verificationVerdict?: string | null;
  /**
   * The round summary that must ride with the verdict: verifier identity, round count, cost. Shape owned by the verification writer.
   */
  verification?: Record<string, unknown> | null;
  commit?: string | null;
  /**
   * The router version that registered this session, as its own manifest declares it. Additive and absent on every row written before it existed: a record cannot be back-filled with a version nobody can check, and 'written before the stamp' is a fact the absence states exactly. It answers the question a reader of an old ledger cannot otherwise ask -- which implementation produced this -- and it is the one place that question is answerable, because the orchestrator block names the ENGINE and not the framework.
   */
  frameworkVersion?: string;
};

/**
 * Omit-null: missing keys are valid; null values and 'unknown' placeholders are not. identityProvenance is derived from the engine by build_orchestrator_block and is never a free choice. 'provider' is a seat DESCRIPTOR; the effective provider is derived at use time by registry lookup on 'model'.
 */
export type SessionsOrchestratorBlock = {
  engine: string;
  provider?: string;
  model?: string;
  effort?: string;
  /**
   * How identity was established: 'asserted' for multi-provider engines (Copilot seats), 'direct' for single-vendor engines.
   */
  identityProvenance?: "direct" | "asserted";
  /**
   * The seat conversation ids that produced this session, in first-seen order. ACCUMULATES -- start is idempotent and is re-run after a context reset, which starts a new conversation on the same session. Absent (never [] and never null) on a Direct-API run: 'not captured' and 'captured, and there were none' are different claims.
   */
  seatSessionIds?: string[];
};

/**
 * sessions.json (v5 on-disk write shape)
 */
export type Sessions = {
  /**
   * v5 collapsed the set level out. v4 files are read once by the migration and never written again.
   */
  schemaVersion: 5;
  /**
   * The canonical per-session ledger, ordered by number.
   */
  sessions: SessionsSessionRecord[];
  /**
   * Opaque passthrough set by close --force; preserved across rewrites.
   */
  forceClosed?: boolean;
  /**
   * Recommendation for the next session, written at close.
   */
  nextOrchestrator?: Record<string, unknown> | null;
};
