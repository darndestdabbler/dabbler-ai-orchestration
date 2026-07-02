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
  WorkflowState,
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
// Set 077 Session 2 — the tier-mismatch advisory (Feature 1).
//
// The `.dabbler/tier` marker is a write-through cache of the operator's
// latest sanctioned tier choice (scaffold / Switch Tier…). Sanctioned
// tier-CHANGING paths cannot drift from it by construction; a manual
// spec edit can, and a sanctioned per-set override (a plan that
// deliberately picks a different tier for one set) legitimately
// disagrees with it. The advisory cannot tell those apart, so its
// tooltip names both and closes with "if intentional, no action is
// needed". When the marker exists and disagrees with a set's declared
// tier, the row's tier-marker slot carries this advisory glyph instead
// of the quiet "lw" — same channel, explanatory tooltip. Terminal rows
// (complete / cancelled) stay quiet: the blocked-marker suppression
// rule — a closed set's configuration is no longer actionable.
// ---------------------------------------------------------------------------

export const TIER_MISMATCH_MARKER = "t!";

// True when the row should render the mismatch advisory. Tolerant of
// undefined (cast-fixture / legacy-shaped records): no marker, no
// advisory.
export function tierMismatch(
  specTier: SessionSetTier,
  workspaceTierMarker: SessionSetTier | null | undefined,
  rowState: SessionState,
): boolean {
  if (workspaceTierMarker == null) return false;
  if (rowState === "complete" || rowState === "cancelled") return false;
  return workspaceTierMarker !== specTier;
}

export function tierMismatchTooltipFor(
  specTier: SessionSetTier,
  workspaceTierMarker: SessionSetTier,
): string {
  return (
    `Tier mismatch: this set's spec declares tier: ${specTier}, but the ` +
    `workspace's recorded tier choice is ${workspaceTierMarker} ` +
    `(.dabbler/tier). If the spec is wrong, use "Switch Tier…" on this ` +
    `row; if the difference is intentional, no action is needed.`
  );
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

// ---------------------------------------------------------------------------
// Set 077 Session 5 (A7): the durable verificationMode record.
//
// Python's `dedicated_verification.read_verification_mode` has always
// read the DURABLE record — the activity-log `verification_mode` /
// `verification_mode_change` entries — while the Explorer read only the
// spec-config seed. After a blessed A→B transition whose seed-alignment
// failed, the two disagreed: the close gate followed the record, the
// Explorer (kickoff/setup actions, `v?`/`v+` markers, `N/M+` fraction)
// followed the stale seed. This is the TS mirror of the Python reader's
// precedence: the LAST valid entry of either kind wins; a missing /
// malformed log yields null and the caller falls back to the spec seed.
// ---------------------------------------------------------------------------

const VERIFICATION_MODE_RECORD_KINDS = new Set([
  "verification_mode",
  "verification_mode_change",
]);

export function durableVerificationModeFrom(
  activityLog: unknown,
): VerificationMode | null {
  if (activityLog === null || typeof activityLog !== "object") return null;
  const entries = (activityLog as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  let chosen: VerificationMode | null = null;
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as { kind?: unknown; choice?: unknown };
    if (typeof e.kind !== "string" || !VERIFICATION_MODE_RECORD_KINDS.has(e.kind)) {
      continue;
    }
    if (e.choice === "dedicated-sessions" || e.choice === "out-of-band-or-none") {
      chosen = e.choice;
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Set 077 Session 5 (Features 4–5): the seven-state workflow derivation.
//
// TS mirror of `dedicated_verification.derive_state` (Set 057 Q3 ladder,
// including the Set 077 S5 blank-verdict adjudication), so the row
// description's owed words and the Start-Next-Session auto-route derive
// from the same ladder the Python close gate and `start_session` banner
// use — gate and UI cannot disagree (critique M5). Pure function of
// in-memory inputs; states are DERIVED, never persisted (Set 047 rule).
// ---------------------------------------------------------------------------

const TERMINAL_DISPOSITIONS = new Set([
  "fixed",
  "not-reproducible",
  "accepted-risk",
  "accepted-consequence",
]);
const HUMAN_STOP_DISPOSITIONS = new Set([
  "escalate-human",
  "needs-more-context",
  "advisory-disagreement",
]);
const AUTOMATIC_ROUND_LIMIT = 3;

function sessionTypeOf(entry: LedgerSessionLike): string {
  const t = entry.type;
  if (t === "verification" || t === "remediation" || t === "work") return t;
  return "work";
}

function dispositionOf(issue: unknown): string | null {
  if (issue === null || typeof issue !== "object") return null;
  const status = (issue as { resolution_status?: unknown }).resolution_status;
  return typeof status === "string" && status.length > 0 ? status : null;
}

export function deriveWorkflowState(
  sessions: readonly LedgerSessionLike[] | null | undefined,
  verificationMode: VerificationMode,
  setStatus: string | null,
  latestIssues: unknown,
): WorkflowState {
  const setTerminal = setStatus === "complete";
  let issues: unknown[] = [];
  if (latestIssues !== null && typeof latestIssues === "object") {
    const raw = (latestIssues as { issues?: unknown }).issues;
    if (Array.isArray(raw)) issues = raw;
  }

  // 1. Opt-out mode: the dedicated-session machine does not run.
  if (verificationMode !== "dedicated-sessions") {
    return setTerminal ? "closed-no-verification" : "work-in-progress";
  }

  const ledger = Array.isArray(sessions)
    ? sessions.filter((s): s is LedgerSessionLike => s !== null && typeof s === "object")
    : [];
  if (ledger.length === 0) return "work-in-progress";

  const latest = ledger[ledger.length - 1];
  const latestType = sessionTypeOf(latest);
  const latestStatus = latest.status;

  // 2. Latest session in-flight: the type names the wait.
  if (latestStatus === "in-progress") {
    if (latestType === "verification") return "awaiting-verification";
    if (latestType === "remediation") return "awaiting-remediation";
    return "work-in-progress";
  }

  // 3. Latest session complete. Are all authored work sessions complete?
  const workSessions = ledger.filter((s) => sessionTypeOf(s) === "work");
  if (workSessions.some((s) => s.status !== "complete")) {
    return "work-in-progress";
  }

  if (latestType === "work") return "awaiting-verification";

  const humanStop = issues.some((i) => {
    const d = dispositionOf(i);
    return d !== null && HUMAN_STOP_DISPOSITIONS.has(d);
  });
  const openIssues = issues.filter((i) => dispositionOf(i) === null);

  if (latestType === "verification") {
    const rawVerdict = latest.verificationVerdict;
    const verdict =
      typeof rawVerdict === "string" ? rawVerdict.trim().toUpperCase() : "";
    if (verdict === "VERIFIED") return "closed-verified";
    if (issues.length === 0) {
      // Set 077 S5 adjudication (mirrors the Python change): no
      // findings envelope + no VERIFIED verdict is unconfirmable —
      // pre-terminal it stops to a human; a terminally-closed set
      // keeps the legacy closed-verified reading.
      return setTerminal ? "closed-verified" : "awaiting-human";
    }
    if (openIssues.length === 0 && !humanStop) return "closed-verified";
    const verificationRounds = ledger.filter(
      (s) => sessionTypeOf(s) === "verification",
    ).length;
    if (humanStop || verificationRounds >= AUTOMATIC_ROUND_LIMIT) {
      return "awaiting-human";
    }
    return "awaiting-remediation";
  }

  if (latestType === "remediation") {
    if (humanStop || openIssues.length > 0) return "awaiting-human";
    const anyFixed = issues.some((i) => dispositionOf(i) === "fixed");
    const allTerminal =
      issues.length > 0 &&
      issues.every((i) => {
        const d = dispositionOf(i);
        return d !== null && TERMINAL_DISPOSITIONS.has(d);
      });
    if (anyFixed) return "awaiting-verification";
    if (allTerminal) return "closed-dispositioned";
    return "awaiting-human";
  }

  return "work-in-progress";
}
