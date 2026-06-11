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

import {
  CompletedVerificationInfo,
  SessionSetTier,
  SessionState,
  VerificationMarkerGlyph,
  VerificationMode,
} from "../types";

// Minimal structural view of a sessions[] ledger entry. `type` drives
// the typed-session predicates (absent `type` means `work` per the
// schema); `status` / `number` / `verificationVerdict` feed the Set 062
// verification-marker predicates. All `unknown` — the ledger may be
// hand-maintained and every reader here is tolerant of malformed input.
export interface LedgerSessionLike {
  type?: unknown;
  status?: unknown;
  number?: unknown;
  verificationVerdict?: unknown;
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

// ---------------------------------------------------------------------------
// Set 062 Session 1 — the verification-posture marker (spec D1).
//
// Two glyphs, both Lightweight-only, both quiet (the `lw` treatment:
// de-emphasized, help cursor, the tooltip does the work). Clicking the
// marker opens the row's context QuickPick — it never mutates state.
//
//   `v?` — a completed Mode-A (`out-of-band-or-none`) set the Explorer
//   cannot vouch for: no `external-verification.md` in the set
//   directory and no `type: "verification"` session in the ledger.
//   Copy never says "unverified" — Mode A is a posture, not a
//   deficiency.
//
//   `v+` — a Mode-B (`dedicated-sessions`) set whose `type: "work"`
//   sessions are all complete but whose dedicated verification is
//   still owed or in flight. The Set 061 `N/M+` fraction covers the
//   pre-completion arithmetic; this marker adds the action surface at
//   the actionable moment.
//
// No marker anywhere else: Full rows, terminal rows (complete Mode-B /
// cancelled), Mode-A rows with the out-of-band note present, and rows
// with a completed verification session (quiet is success — the
// fraction tooltip carries the persisted verdict instead). No positive
// "verified" badge — absence is the signal.
// ---------------------------------------------------------------------------

export const VERIFICATION_MARKER_OUT_OF_BAND = "v?";
export const VERIFICATION_MARKER_DEDICATED = "v+";

export const VERIFICATION_OUT_OF_BAND_TOOLTIP =
  "Lightweight — verification is out-of-band or none. The Explorer " +
  "cannot tell whether this set was reviewed out of band. Click for " +
  "verification options.";
export const VERIFICATION_DEDICATED_TOOLTIP =
  "Dedicated verification enabled — a verification/remediation " +
  "session is still owed or in flight. Click for the next step.";

// True when the ledger carries a COMPLETED `type: "verification"`
// session. Distinct from `hasTypedVerificationSession` (any typed
// verification entry, in-flight included): the `v+` marker keeps
// rendering while the typed session is in flight ("owed or in
// flight") and drops only once one has completed.
export function hasCompletedVerificationSession(
  sessions: readonly LedgerSessionLike[] | null | undefined,
): boolean {
  return completedVerificationInfo(sessions) !== null;
}

// The latest completed `type: "verification"` entry's persisted
// verdict + ledger number, or null when none exists. "Latest" = last
// such entry in ledger order (typed sessions append, so ledger order
// is chronological). Malformed `number` / `verificationVerdict` values
// degrade to null fields rather than disqualifying the entry — a
// completed verification session still suppresses the marker even if
// its metadata is unreadable.
export function completedVerificationInfo(
  sessions: readonly LedgerSessionLike[] | null | undefined,
): CompletedVerificationInfo | null {
  if (!Array.isArray(sessions)) return null;
  let found: CompletedVerificationInfo | null = null;
  for (const s of sessions) {
    if (s === null || typeof s !== "object") continue;
    const entry = s as LedgerSessionLike;
    if (entry.type !== "verification") continue;
    if (entry.status !== "complete") continue;
    found = {
      sessionNumber:
        typeof entry.number === "number" && Number.isInteger(entry.number) && entry.number > 0
          ? entry.number
          : null,
      verdict:
        typeof entry.verificationVerdict === "string" && entry.verificationVerdict.length > 0
          ? entry.verificationVerdict
          : null,
    };
  }
  return found;
}

// True when the ledger has at least one `type: "work"` session and
// every one of them is complete. Absent `type` means `work` (schema
// rule); non-object entries count as work-not-complete so a malformed
// ledger reads as "work still open" (never over-claims completion —
// the same conservative posture as the v2 synthesizer's
// default-to-not-started rule). Null / non-array ledgers read false:
// with no ledger there is no evidence the work is done.
export function allWorkSessionsComplete(
  sessions: readonly LedgerSessionLike[] | null | undefined,
): boolean {
  if (!Array.isArray(sessions)) return false;
  let workCount = 0;
  for (const s of sessions) {
    if (s === null || typeof s !== "object") return false;
    const entry = s as LedgerSessionLike;
    const isWork = entry.type === undefined || entry.type === "work";
    if (!isWork) continue;
    workCount += 1;
    if (entry.status !== "complete") return false;
  }
  return workCount > 0;
}

// The D1 predicate: which verification-posture marker (if any) does
// this row render? Pure function of the five derived inputs so the
// renderer and the tests share one source.
export function verificationMarkerFor(
  tier: SessionSetTier,
  verificationMode: VerificationMode,
  sessions: readonly LedgerSessionLike[] | null | undefined,
  externalVerificationNoteExists: boolean,
  rowState: SessionState,
): VerificationMarkerGlyph {
  if (tier !== "lightweight") return "";
  if (rowState === "cancelled") return "";
  if (verificationMode === "out-of-band-or-none") {
    // `v?` fires only at the actionable moment: the set is done and
    // nothing records that anyone reviewed it.
    if (rowState !== "complete") return "";
    if (externalVerificationNoteExists) return "";
    if (hasTypedVerificationSession(sessions)) return "";
    return VERIFICATION_MARKER_OUT_OF_BAND;
  }
  // dedicated-sessions: `v+` while verification is owed or in flight.
  // A terminal row stays quiet — a Mode-B set flipped complete has
  // nothing actionable left on this surface.
  if (rowState === "complete") return "";
  if (hasCompletedVerificationSession(sessions)) return "";
  if (!allWorkSessionsComplete(sessions)) return "";
  return VERIFICATION_MARKER_DEDICATED;
}

// Glyph → tooltip. The D1 copy is fixed per state; "" stays "".
export function verificationMarkerTooltipFor(
  glyph: VerificationMarkerGlyph,
): string {
  if (glyph === VERIFICATION_MARKER_OUT_OF_BAND) return VERIFICATION_OUT_OF_BAND_TOOLTIP;
  if (glyph === VERIFICATION_MARKER_DEDICATED) return VERIFICATION_DEDICATED_TOOLTIP;
  return "";
}
