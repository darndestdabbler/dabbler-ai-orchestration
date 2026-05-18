import * as vscode from "vscode";
import * as path from "path";
import { readAllSessionSets, discoverRoots } from "../utils/fileSystem";
import { SessionSet, SessionState } from "../types";
import { ScanState } from "./scanState";
import {
  bucketSets,
  forceClosedBadge,
  iconUriFor,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
  sortBucket,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";

// Set 029 Session 3: the data-layer extraction moved scan/bucket/sort
// helpers + the row-text predicates to `SessionSetsModel.ts`. This file
// is now a thin VS Code adapter — it owns the `TreeDataProvider`
// surface (refresh signaling, loading sentinel, TreeItem construction)
// and delegates every data decision to the model. The future custom
// webview tree (Set 029 S4) will consume the same model directly.
//
// Existing call sites (cancelTreeView.test.ts, forceClosedBadge.test.ts,
// sessionSetsProvider.test.ts) import named helpers from this file —
// the re-exports below preserve those imports verbatim.

export {
  forceClosedBadge,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
};

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
  // contextValue when the set's state file is still v2.
  if (set.needsMigration) parts.push("needs-migration");
  return parts.join(":");
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
        "See closeout_force_used in session-events.jsonl for the operator's reason.",
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

    if (!element && this.scanState?.phase === "loading") {
      return [this.makeLoadingSentinel()];
    }

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      if (all.length === 0) {
        return [];
      }
      const buckets = bucketSets(all);
      const groups: GroupItem[] = [
        this.makeGroup("In Progress", "in-progress", buckets.inProgress.length),
        this.makeGroup("Not Started", "not-started", buckets.notStarted.length),
        this.makeGroup("Complete", "complete", buckets.complete.length),
      ];
      // Set 8: the Cancelled group only renders when ≥ 1 cancelled set
      // exists. A repo that never cancels a set should not see the group.
      if (buckets.cancelled.length > 0) {
        groups.push(this.makeGroup("Cancelled", "cancelled", buckets.cancelled.length));
      }
      return groups;
    }

    const group = element as GroupItem;
    if (group.contextValue === "group") {
      const buckets = bucketSets(all);
      let subset: SessionSet[];
      switch (group.groupKey) {
        case "in-progress": subset = buckets.inProgress; break;
        case "not-started": subset = buckets.notStarted; break;
        case "complete":    subset = buckets.complete;    break;
        case "cancelled":   subset = buckets.cancelled;   break;
      }
      return sortBucket(subset, group.groupKey).map((s) => this.makeSetItem(s));
    }

    return [];
  }

  // Set 030 Session 5: the loading sentinel shown while the
  // activation-time scan is in flight.
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
        : vscode.TreeItemCollapsibleState.Collapsed,
    ) as GroupItem;
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }

  private makeSetItem(set: SessionSet): SetItem {
    const item = new vscode.TreeItem(
      set.name,
      vscode.TreeItemCollapsibleState.None,
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
        .join("\n\n"),
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
