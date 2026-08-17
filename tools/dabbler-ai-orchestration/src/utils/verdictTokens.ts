// The reader side of the `verificationVerdict` vocabulary.
//
// Set 112 S2: this module is what survived `utils/tierLegibility.ts`.
// That file hosted the Lightweight tier's Explorer signals — the `lw`
// marker, the tier-mismatch advisory, the `N/M+` fraction, the `v?`/`v+`
// verification-posture markers, the durable `verificationMode` reader and
// the seven-state workflow ladder — every one of which existed only to
// make the Lightweight tier legible. The tier is gone, so they are gone.
// The verdict vocabulary below is tier-independent (the Work Explorer
// renders it on every row) and moved here rather than dying with its old
// host.

// Set 086 S2: the reader-recognized verdict vocabulary. Readers are
// deliberately PREFIX-lenient (docs/session-state-schema.md → the
// `verificationVerdict` contract): an intentionally-shipped extension token
// like `ISSUES_FOUND_RESOLVED_IN_FLIGHT` classifies via its canonical prefix
// without a schema bump. This mirrors the STRICT (exact-allowlist) writer side
// of the same asymmetry (ai_router/session_state.py `_CANONICAL_VERDICT_TOKENS`):
// the sanctioned writer refuses to persist a non-verdict, and this reader refuses
// to render an unrecognized one as if it were a clean verdict.
export const RECOGNIZED_VERDICT_PREFIXES = [
  "VERIFIED",
  "ISSUES_FOUND",
  "WAIVED",
] as const;

// True iff `verdict`, normalized (trimmed, upper-cased), begins with a
// recognized canonical prefix. A free-form non-verdict — e.g. the confabulated
// `manual-override-development` the Set-086 root-cause incident persisted —
// returns false, which is what lets the display flag it instead of laundering
// it into a legitimate-looking status.
export function isRecognizedVerdictToken(
  verdict: string | null | undefined,
): boolean {
  if (typeof verdict !== "string") return false;
  const normalized = verdict.trim().toUpperCase();
  if (!normalized) return false;
  return RECOGNIZED_VERDICT_PREFIXES.some((p) => normalized.startsWith(p));
}
