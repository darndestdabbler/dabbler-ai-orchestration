import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";

// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.

// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy.
export function needsMigrationBadge(set: SessionSet): string {
  return set.needsMigration ? "(needs migration)" : "";
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
  const base = set.totalSessions && set.totalSessions > 0
    ? `${set.sessionsCompleted}/${set.totalSessions}`
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

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
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
