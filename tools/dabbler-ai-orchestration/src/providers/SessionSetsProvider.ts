import * as vscode from "vscode";
import * as path from "path";
import { readAllSessionSets, discoverRoots } from "../utils/fileSystem";
import { SessionSet, SessionState } from "../types";
import { ScanState } from "./scanState";

// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy. Migration is invoked via the
// `dabblerSessionSets.migrate` command (context menu on the row).
export function needsMigrationBadge(set: SessionSet): string {
  return set.needsMigration ? "(needs migration)" : "";
}

const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState
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
// Exported for unit-test reuse.
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
  //     really reached terminal state" cue. Distinguishes a healthy
  //     final close from a stale `N/N` snapshot that's about to be
  //     downgraded by isMidSetComplete.
  //   * `0/N · session 1 in flight` on rows where session N has
  //     started but not yet closed. Removes the operator confusion
  //     of "I started session 1 — why does it still say 0/4?"
  //     Both lifecycle endpoints (0/N at start of session 1; N/N
  //     between session N's start and its close on the final
  //     session) used to be indistinguishable from their "no work
  //     started yet" / "set is complete" siblings.
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

function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate. The flag is
// written by ``_flip_state_to_closed(forced=True)`` in
// ``ai_router/session_state.py``; absent or false on every snapshot
// written by a normal close-out, so the badge never appears for
// healthy sets.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
}

function liveSessionTooltipLines(set: SessionSet): string[] {
  if (!set.liveSession) return [];
  const ls = set.liveSession;
  const lines: string[] = [];
  if (typeof ls.currentSession === "number") {
    const total = set.totalSessions ? `/${set.totalSessions}` : "";
    const status = ls.status ? ` (${ls.status})` : "";
    lines.push(`Session: ${ls.currentSession}${total}${status}`);
  }
  if (ls.orchestrator) {
    const o = ls.orchestrator;
    const parts = [o.engine, o.model].filter(Boolean).join(" · ");
    const effort = o.effort && o.effort !== "unknown" ? ` @ effort=${o.effort}` : "";
    if (parts) lines.push(`Orchestrator: ${parts}${effort}`);
  }
  if (ls.verificationVerdict) {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  if (ls.forceClosed === true) {
    lines.push(
      "Force-closed: gate bypassed via --force (incident recovery). " +
        "See closeout_force_used in session-events.jsonl for the operator's reason."
    );
  }
  return lines;
}

function configTooltipLines(set: SessionSet): string[] {
  if (!set.config) return [];
  const flags: string[] = [];
  if (set.config.requiresUAT) flags.push("UAT");
  if (set.config.requiresE2E) flags.push("E2E");
  const lines: string[] = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
  if (set.config.requiresUAT && set.uatSummary) {
    const u = set.uatSummary;
    if (u.totalItems > 0) {
      lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
    } else {
      lines.push("UAT checklist: not yet authored");
    }
  }
  return lines;
}

function folderTooltip(set: SessionSet): string {
  const roots = discoverRoots();
  const rel = path.relative(set.root, set.dir);
  return roots.length > 1 ? `${path.basename(set.root)} / ${rel}` : rel;
}

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  // Set 030 Session 5: append a `needs-migration` slug to the
  // contextValue when the set's state file is still v2. The package.json
  // `view/item/context` menu uses this to gate the "Migrate to v3
  // schema" entry — only rows that actually need it see the command.
  if (set.needsMigration) parts.push("needs-migration");
  return parts.join(":");
}

interface GroupItem extends vscode.TreeItem {
  contextValue: "group";
  groupKey: SessionState;
}

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

export class SessionSetsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  _cache: SessionSet[] | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly scanState?: ScanState,
  ) {
    // When the scan transitions from "loading" → "ready" the tree
    // needs to refresh so the loading sentinel is replaced by real
    // rows. Subscribe once; the constructor instance lives for the
    // lifetime of the extension so no dispose tracking needed.
    this.scanState?.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!vscode.workspace.workspaceFolders?.length) return [];

    // Set 030 Session 5: while the activation-time scan is in flight,
    // render a single loading sentinel TreeItem instead of "[]". The
    // welcome view's `when` clause (in package.json) suppresses the
    // CTA content until scanState == "ready", so this is what the
    // operator sees during the loading window. Once `onDidChange`
    // fires "ready", the tree re-renders normally below.
    if (!element && this.scanState?.phase === "loading") {
      return [this.makeLoadingSentinel()];
    }

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      // v0.13.1 / Set 030 S5: when the workspace has no session sets
      // at all AND the scan has completed, return an empty array so VS
      // Code renders the `viewsWelcome` content. The welcome view's
      // `when` clause now requires `dabblerSessionSets.scanState ==
      // ready` so the content no longer flashes during the loading
      // window — only after the scan finishes and confirms the
      // workspace is genuinely empty does the welcome CTA appear.
      if (all.length === 0) {
        return [];
      }
      const inProgress = all.filter((s) => s.state === "in-progress");
      const notStarted = all.filter((s) => s.state === "not-started");
      const complete = all.filter((s) => s.state === "complete");
      const cancelled = all.filter((s) => s.state === "cancelled");
      const groups: GroupItem[] = [
        this.makeGroup("In Progress", "in-progress", inProgress.length),
        this.makeGroup("Not Started", "not-started", notStarted.length),
        this.makeGroup("Complete", "complete", complete.length),
      ];
      // Set 8: the Cancelled group only renders when ≥ 1 cancelled set
      // exists (parallels the existing spec rule for not-emitting empty
      // groups noted in spec.md scope). A repo that never cancels a set
      // should not see the group at all.
      if (cancelled.length > 0) {
        groups.push(this.makeGroup("Cancelled", "cancelled", cancelled.length));
      }
      return groups;
    }

    const group = element as GroupItem;
    if (group.contextValue === "group") {
      const subset = all.filter((s) => s.state === group.groupKey);
      if (
        group.groupKey === "in-progress" ||
        group.groupKey === "complete" ||
        group.groupKey === "cancelled"
      ) {
        subset.sort((a, b) =>
          (b.lastTouched || "").localeCompare(a.lastTouched || "")
        );
      } else {
        subset.sort((a, b) => a.name.localeCompare(b.name));
      }
      return subset.map((s) => this.makeSetItem(s));
    }

    return [];
  }

  // Set 030 Session 5: the loading sentinel shown while the
  // activation-time scan is in flight. Uses the Dabbler brand icon
  // (already shipped under `media/icon.svg` for the activity-bar
  // viewsContainer) so the operator sees the same visual identifier
  // they're about to interact with. `description` carries the
  // "scanning…" hint — VS Code renders it dimmer than the label, which
  // matches the "transient activity" cue.
  private makeLoadingSentinel(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      "Setting up your project…",
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = "scanning session sets…";
    item.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
    item.contextValue = "loading";
    item.tooltip =
      "Dabbler is scanning `docs/session-sets/` for session sets. " +
      "This usually completes within a frame; longer means a slow " +
      "filesystem or many sets to read.";
    return item;
  }

  private makeGroup(label: string, groupKey: SessionState, count: number): GroupItem {
    const item = new vscode.TreeItem(
      `${label}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    ) as GroupItem;
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }

  private makeSetItem(set: SessionSet): SetItem {
    const item = new vscode.TreeItem(
      set.name,
      vscode.TreeItemCollapsibleState.None
    ) as SetItem;
    const bits = [
      progressText(set),
      touchedDate(set),
      modeBadge(set),
      uatBadge(set),
      forceClosedBadge(set),
      needsMigrationBadge(set),
    ].filter(Boolean);
    item.description = bits.join("  ·  ");
    item.tooltip = new vscode.MarkdownString(
      [
        `**${set.name}**`,
        `State: ${set.state}`,
        bits.length ? `Progress: ${bits.join(" · ")}` : null,
        ...configTooltipLines(set),
        ...liveSessionTooltipLines(set),
        `Folder: \`${folderTooltip(set)}\``,
      ]
        .filter(Boolean)
        .join("\n\n")
    );
    item.contextValue = contextValueFor(set);
    item.set = set;
    item.iconPath = iconUriFor(this.extensionUri, set.state);
    item.command = {
      command: "dabblerSessionSets.openSpec",
      title: "Open Spec",
      arguments: [item],
    };
    return item;
  }
}
