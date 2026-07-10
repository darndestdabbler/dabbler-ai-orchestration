import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";
import {
  PLUS_FRACTION_TOOLTIP,
  TIER_MISMATCH_MARKER,
  isRecognizedVerdictToken,
  tierMarkerFor,
  tierMismatch,
  tierMismatchTooltipFor,
  tierTooltipFor,
  verificationMarkerTooltipFor,
} from "../utils/tierLegibility";

// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.

// Set 050 Session 4 (Explorer UX revision): the old intrusive
// "(needs migration)" row label is retired (operator non-goal: "Old
// schema is acceptable; no per-row nag"). A set on a sub-current schema
// now carries only an unobtrusive asterisk next to its name; the detail
// lives in the asterisk's hover tooltip. Upgrading is offered as a
// single repo-level title-bar action, never a per-row obligation.
//
// `migrationMarker` is the visible glyph ("*" or ""); `migrationTooltip`
// is the hover text ("Ran under schema v<N>"). Both are pure functions
// of the SessionSet so the renderer and tests share one source.
export function migrationMarker(set: SessionSet): string {
  return set.needsMigration ? "*" : "";
}

export function migrationTooltip(set: SessionSet): string {
  if (!set.needsMigration) return "";
  const v = set.schemaVersionOnDisk;
  return typeof v === "number"
    ? `Ran under schema v${v}`
    : "Ran under an older schema";
}

// Set 050 S4: drives the `dabblerSessionSets.hasSubCurrentSets` context
// key that gates the title-bar "Upgrade older session sets" icon. True
// iff at least one scanned set is on a sub-current schema. Pure +
// exported so the gating logic is unit-tested without launching VS Code
// (the package.json `when` clause that consumes the key is declarative).
export function hasSubCurrentSets(allSets: SessionSet[]): boolean {
  return allSets.some((s) => s.needsMigration);
}

// Set 061 Session 1 (spec D2): the quiet per-row "lw" tier marker.
// Same shape as migrationMarker/migrationTooltip above — pure
// functions of the SessionSet so the renderer and tests share one
// source. Full rows get no marker (Full is the default and the
// majority; marking the exception keeps rows quiet).
//
// Set 077 Session 2 (Feature 1): the same slot carries the
// tier-mismatch advisory ("t!") when the workspace's durable
// `.dabbler/tier` marker disagrees with the set's declared tier on a
// non-terminal row. Two ways to get there: a manual spec edit (drift —
// the advisory's target) or a sanctioned per-set tier override (the
// decomposition prompt allows a plan to pick a different tier for a
// specific set). The marker slot stays quiet-styled and the tooltip
// names both readings, closing with "if intentional, no action is
// needed" — an advisory, never a nag.
export function tierMarker(set: SessionSet): string {
  const specTier = set.config?.tier ?? "full";
  if (tierMismatch(specTier, set.workspaceTierMarker, set.state)) {
    return TIER_MISMATCH_MARKER;
  }
  return tierMarkerFor(specTier);
}

export function tierTooltip(set: SessionSet): string {
  const specTier = set.config?.tier ?? "full";
  if (tierMismatch(specTier, set.workspaceTierMarker, set.state)) {
    // Narrowed non-null by the predicate above.
    return tierMismatchTooltipFor(specTier, set.workspaceTierMarker as NonNullable<typeof set.workspaceTierMarker>);
  }
  return tierTooltipFor(specTier);
}

// Set 061 Session 1 (spec D1): hover text for the `N/M+` fraction.
// Non-empty only when the row's fraction carries the `+` suffix.
export function fractionTooltip(set: SessionSet): string {
  return set.plusFraction ? PLUS_FRACTION_TOOLTIP : "";
}

// Set 062 Session 1 (spec D1): the quiet verification-posture marker
// (`v?` / `v+`) + tooltip. Same shape as migrationMarker/tierMarker —
// pure functions of the SessionSet so the renderer and tests share one
// source. The glyph itself is derived at scan time in fileSystem.ts
// (it needs the ledger, which the SessionSet record does not carry).
export function verificationMarker(set: SessionSet): string {
  return set.verificationMarker ?? "";
}

export function verificationTooltip(set: SessionSet): string {
  return verificationMarkerTooltipFor(set.verificationMarker ?? "");
}

// Set 062 Session 1 (spec D1): fraction-tooltip enrichment on verified
// rows. A completed `type: "verification"` session suppresses the
// marker (quiet is success); the persisted verdict surfaces here
// instead, on the fraction the typed session grew. Empty when no
// completed verification session exists or its verdict was never
// persisted.
export function verdictFractionTooltip(set: SessionSet): string {
  const cv = set.completedVerification;
  if (!cv || !cv.verdict) return "";
  const suffix = cv.sessionNumber != null ? ` (session ${cv.sessionNumber})` : "";
  // Set 086 S2 guardrail: a persisted verdict the reader does not recognize —
  // e.g. the confabulated `manual-override-development` the Set-086 root-cause
  // incident wrote — must NEVER render as if it were a clean verdict. Flag it
  // as unrecognized so the reader surfaces the anomaly instead of laundering a
  // non-verdict into a legitimate-looking status. (The blessed writer now
  // rejects such tokens outright; this reader guards data that predates the
  // writer enforcement or was hand-authored around it.)
  if (!isRecognizedVerdictToken(cv.verdict)) {
    return `Verification: "${cv.verdict}" is not a recognized verdict${suffix}`;
  }
  return `Verification: ${cv.verdict}${suffix}`;
}

export const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

export function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState,
): vscode.Uri | undefined {
  const file = ICON_FILES[state];
  return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}

// Set 030 Session 3: the v3 "in-flight" predicate is a direct read of
// the canonical `liveSession.currentSession` field, which `fileSystem.ts`
// populates from `readProgress` as the single in-progress session's
// number (or null when no session is in flight). v2's
// "currentSession not in completedSessions[]" predicate is gone — the
// v3 reader resolves the ambiguity at the source rather than letting
// it propagate into a downstream invariant check.
export function isCurrentSessionInFlight(set: SessionSet): boolean {
  return set.liveSession?.currentSession != null;
}

export function progressText(set: SessionSet): string {
  // Always show X/total. The earlier "X/X" shape on done sets assumed
  // completed === total, which masks bugs like a SET-level flip to
  // "complete" that fires before all sessions ran. Truthful display
  // surfaces the discrepancy at a glance.
  //
  // Set 022 Session 2 added two annotations to disambiguate the row.
  // Set 030 Session 3 renamed the terminal annotation to "Complete"
  // so the display vocabulary matches the JSON status glossary:
  //   * `N/N Complete` on complete rows — operator-facing "yes this
  //     really reached terminal state" cue.
  //   * `0/N · session 1 in flight` on rows where session N has
  //     started but not yet closed.
  // Set 077 Session 5 (S1 bundle B): the `+` suffix mirrors
  // `fractionFor` in CustomSessionSetsView — a Lightweight
  // dedicated-sessions set whose typed sessions are still pending
  // renders `N/M+` on BOTH fraction surfaces, so this text no longer
  // contradicts the row's fraction column.
  const plus = set.plusFraction ? "+" : "";
  const base = set.totalSessions && set.totalSessions > 0
    ? `${set.sessionsCompleted}/${set.totalSessions}${plus}`
    : set.sessionsCompleted > 0
      ? `${set.sessionsCompleted} complete`
      : "";

  if (set.state === "complete" && base) {
    return `${base} Complete`;
  }
  if (set.state === "in-progress" && isCurrentSessionInFlight(set)) {
    const n = set.liveSession?.currentSession;
    const annotation = `session ${n} in flight`;
    return base ? `${base} · ${annotation}` : annotation;
  }
  return base;
}

// Set 077 Session 5 (Feature 5, A9): the owed-state WORDS for the row
// description — the derived workflow state said out loud instead of
// compressed into the `v+` glyph (which drops after the first completed
// verification round, exactly when "remediation owed" matters most).
// Pure function of the derived state; empty everywhere the ladder is
// quiet. `awaiting-human` deliberately stays out of this surface: it
// has no auto-routable next prompt (a human decides), and its signal
// remains the marker/tooltip channel.
export function verificationOwedText(set: SessionSet): string {
  // Terminal-row suppression (the same rule every Set 061/062 marker
  // follows): a cancelled set's owed verification is not actionable —
  // and "cancelled" is non-terminal to the derivation ladder (only
  // "complete" is), so without this guard an abandoned Mode-B set
  // would nag "verification owed" forever. (S5 code-review
  // adjudication catch.)
  if (set.state === "cancelled") return "";
  if (set.workflowState === "awaiting-verification") return "verification owed";
  if (set.workflowState === "awaiting-remediation") return "remediation owed";
  return "";
}

export function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

export function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// Set 061 Session 2 (spec D3): the quiet blocked-by-prerequisites
// marker that replaces the Set 047 all-caps blocked-by-prereqs
// description badge. Same shape as migrationMarker/tierMarker above — pure
// functions of the SessionSet so the renderer and tests share one
// source. The terminal-state suppression rule is unchanged: once a set
// is itself ``complete`` or ``cancelled``, the dependency status is no
// longer actionable (an operator viewing a closed row doesn't need to
// start work behind a now-irrelevant prereq).
//
// Glyph: U+26D3 CHAINS with U+FE0E (text presentation selector) so the
// marker renders as a theme-colored text glyph, not a colored emoji.
export const BLOCKED_MARKER = "⛓︎";

// Operator-facing label for a prereq target's bucketed state inside the
// blocked tooltip. The "unknown" sentinel names the typo case loudly —
// an unresolvable slug still blocks (Set 047 rule) and the tooltip says
// why instead of leaving the operator to guess.
function targetStateLabel(state: string): string {
  switch (state) {
    case "in-progress": return "in progress";
    case "not-started": return "not started";
    case "unknown": return "unknown set — check the slug";
    default: return state; // "complete" / "cancelled" pass through
  }
}

export function blockedMarker(set: SessionSet): string {
  if (set.unsatisfiedPrereqs.length === 0) return "";
  if (set.state === "complete" || set.state === "cancelled") return "";
  return BLOCKED_MARKER;
}

export function blockedTooltip(set: SessionSet): string {
  if (blockedMarker(set) === "") return "";
  const parts = set.unsatisfiedPrereqs.map(
    (p) => `${p.slug} (${targetStateLabel(p.targetState)})`,
  );
  return `Blocked by prerequisites: ${parts.join(", ")} — all must complete first.`;
}

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
}

// Set 087 Session 2: one module group of the Explorer's module →
// status-bucket → row tier. `slug` / `title` are null for the implicit
// module (sets with no validated `module` attribution); the host maps
// null onto the protocol's `""` sentinel. Pure grouping only — module
// is never identity (the Set 087 invariant).
export interface ModuleGroup {
  slug: string | null;
  title: string | null;
  sets: SessionSet[];
}

// Set 087 Session 2: group the scanned sets by their validated module
// attribution, BEFORE the existing bucketSets pass (which then runs per
// module). Pure function of the SessionSet records: the display order
// rides in on `set.moduleOrder` (the manifest file index, stamped at
// scan time — routed ruling Q3, saved raw at
// docs/session-sets/087-.../s2-explorer-render-architecture.json), so
// labeled modules sort by manifest order and the implicit module —
// when any of its sets exist — always comes last. Only modules with at
// least one set produce a group (an empty manifest module renders
// nothing). Sets keep their input order within each group; per-bucket
// sorting stays downstream in sortBucket.
export function groupByModule(all: SessionSet[]): ModuleGroup[] {
  const labeled = new Map<string, { group: ModuleGroup; order: number }>();
  const implicit: ModuleGroup = { slug: null, title: null, sets: [] };
  for (const s of all) {
    if (s.module === null) {
      implicit.sets.push(s);
      continue;
    }
    const existing = labeled.get(s.module);
    if (existing) {
      existing.group.sets.push(s);
      // A cross-root merge can theoretically carry differing manifest
      // indexes for one slug; the smallest wins so ordering stays
      // deterministic.
      const order = s.moduleOrder ?? Number.POSITIVE_INFINITY;
      if (order < existing.order) existing.order = order;
    } else {
      labeled.set(s.module, {
        group: { slug: s.module, title: s.moduleTitle, sets: [s] },
        order: s.moduleOrder ?? Number.POSITIVE_INFINITY,
      });
    }
  }
  const groups = Array.from(labeled.values())
    .sort((a, b) => a.order - b.order)
    .map((e) => e.group);
  if (implicit.sets.length > 0) groups.push(implicit);
  return groups;
}

// Bucket the scanned sets into the four lifecycle groups. The custom
// tree (S4) and the native tree (S3 ship) both consume this.
export interface BucketedSets {
  inProgress: SessionSet[];
  notStarted: SessionSet[];
  complete: SessionSet[];
  cancelled: SessionSet[];
}

export function bucketSets(all: SessionSet[]): BucketedSets {
  return {
    inProgress: all.filter((s) => s.state === "in-progress"),
    notStarted: all.filter((s) => s.state === "not-started"),
    complete: all.filter((s) => s.state === "complete"),
    cancelled: all.filter((s) => s.state === "cancelled"),
  };
}

// Sort within a bucket. In-progress / complete / cancelled rows sort by
// `lastTouched` desc (most recent first); not-started rows sort by name
// asc (operators usually want fresh-state rows in a stable order).
export function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[] {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}
