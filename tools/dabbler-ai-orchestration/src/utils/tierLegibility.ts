// Set 061 Session 1 — Lightweight legibility (spec D1/D2).
//
// Pure helpers behind the Explorer's two Lightweight-tier signals:
//
//   D1 — the `N/M+` fraction suffix. Lightweight `dedicated-sessions`
//   sets grow their denominator at runtime (the Set 057 blessed writer
//   appends `type: "verification"` / `type: "remediation"` sessions
//   after the work sessions complete), so a set the operator believes
//   is "3/3 done" becomes "3/4" without warning. The `+` renders ONLY
//   while that growth is still pending: tier is `lightweight` AND
//   verificationMode is `dedicated-sessions` AND no
//   `type: "verification"` session exists yet in the ledger. Once the
//   typed session is appended the denominator is honest and the `+`
//   drops. Mode A (`out-of-band-or-none`, the default) never shows `+`
//   — it appends no sessions.
//
//   D2 — the quiet per-row "lw" tier marker. The Set 050
//   migration-marker pattern (de-emphasized foreground, help cursor,
//   tooltip); Full rows get no marker because Full is the default and
//   the majority — marking the exception keeps rows quiet.
//
// Everything here is a pure function of (spec config, sessions ledger)
// so the renderer and the tests share one source. No new persisted
// state fields — all derived (spec non-goal).

import { SessionSetTier, VerificationMode } from "../types";

// Minimal structural view of a sessions[] ledger entry. Only `type`
// matters here; per the schema, absent `type` means `work`.
export interface LedgerSessionLike {
  type?: unknown;
}

// True when the ledger already carries a typed verification session
// (appended by `start_session --type verification`). Tolerant of
// non-array / malformed input — those read as "no typed session yet",
// matching the not-started-set case where no state file exists at all.
export function hasTypedVerificationSession(
  sessions: readonly LedgerSessionLike[] | null | undefined,
): boolean {
  if (!Array.isArray(sessions)) return false;
  return sessions.some(
    (s) =>
      s !== null &&
      typeof s === "object" &&
      (s as LedgerSessionLike).type === "verification",
  );
}

// The D1 predicate: should the row's fraction render the `+` suffix?
export function shouldRenderPlusFraction(
  tier: SessionSetTier,
  verificationMode: VerificationMode,
  sessions: readonly LedgerSessionLike[] | null | undefined,
): boolean {
  if (tier !== "lightweight") return false;
  if (verificationMode !== "dedicated-sessions") return false;
  return !hasTypedVerificationSession(sessions);
}

// D1 fraction tooltip — explains why the `+` is there.
export const PLUS_FRACTION_TOOLTIP =
  "Lightweight dedicated-sessions set: verification/remediation " +
  "sessions are appended when the work sessions complete, so the " +
  "session count can still grow.";

// D2 marker glyph + tooltip. Lowercase "lw" reads as an annotation,
// not a badge.
export const TIER_MARKER = "lw";
export const TIER_MARKER_TOOLTIP =
  "Lightweight tier — router-off; verification per the set's " +
  "verificationMode.";

export function tierMarkerFor(tier: SessionSetTier): string {
  return tier === "lightweight" ? TIER_MARKER : "";
}

export function tierTooltipFor(tier: SessionSetTier): string {
  return tier === "lightweight" ? TIER_MARKER_TOOLTIP : "";
}
